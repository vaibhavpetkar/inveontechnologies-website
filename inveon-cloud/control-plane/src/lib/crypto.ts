import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Envelope encryption for env vars, secrets and webhook secrets.
 *
 * Each value gets its own random 256-bit data key. The value is encrypted
 * with AES-256-GCM under the data key, and the data key is itself encrypted
 * (wrapped) under a master key. Master keys never touch the database, so a
 * database dump alone reveals nothing. The caller passes an "aad" (for
 * example "env:<environmentId>:<KEY>") that is authenticated with the
 * value, so a ciphertext copied to another row or key fails to decrypt.
 *
 * Formats (base64url parts):
 *   v1.<wrapIv>.<wrapTag>.<wrappedKey>.<iv>.<tag>.<ciphertext>
 *       wrapped with the "legacy" key (INVEON_MASTER_KEY); the original format.
 *   v2.<keyId>.<w1>.<w2>.<w3>.<iv>.<tag>.<ciphertext>
 *       wrapped with master key <keyId>; the key id is also bound into the
 *       wrap's associated data.
 *
 * Rotating the master key only re-wraps data keys (rewrapValue): the
 * value's own ciphertext is untouched.
 */

const ALGO = "aes-256-gcm";
export const LEGACY_KEY_ID = "legacy";
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/**
 * A key-encryption key. The local implementation is AES-256-GCM with a key
 * from the environment; a KMS-backed one (Encrypt/Decrypt with an
 * encryption context) can implement the same three-part wrap and be added
 * to the keyring under its own id.
 */
export interface KeyEncryptionKey {
  readonly id: string;
  wrap(dataKey: Buffer, context: string): [string, string, string];
  unwrap(parts: [string, string, string], context: string): Buffer;
}

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

function seal(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: Buffer) {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export class LocalKey implements KeyEncryptionKey {
  constructor(
    readonly id: string,
    private readonly key: Buffer,
  ) {}
  wrap(dataKey: Buffer, context: string): [string, string, string] {
    const w = seal(this.key, dataKey, Buffer.from(context, "utf8"));
    return [b64(w.iv), b64(w.tag), b64(w.ct)];
  }
  unwrap([iv, tag, ct]: [string, string, string], context: string): Buffer {
    return open(this.key, unb64(iv), unb64(tag), unb64(ct), Buffer.from(context, "utf8"));
  }
}

export function parseMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new Error("A master key must be 32 bytes (base64 or 64 hex characters)");
  return key;
}

// ---------------------------------------------------------------- keyring

let keyring = new Map<string, KeyEncryptionKey>();
let currentKeyId: string | null = null;

export interface MasterKeyConfig {
  /** INVEON_MASTER_KEY: the original single key, id "legacy" (decrypts v1). */
  legacy?: string;
  /** INVEON_MASTER_KEYS: "id:key,id:key". */
  keys?: string;
  /** INVEON_MASTER_KEY_CURRENT: the id new values are encrypted with. */
  current?: string;
}

/** Parses the environment's keys into the keyring. Throws on anything malformed. */
export function configureMasterKeys(cfg: MasterKeyConfig) {
  const next = new Map<string, KeyEncryptionKey>();
  if (cfg.legacy?.trim()) next.set(LEGACY_KEY_ID, new LocalKey(LEGACY_KEY_ID, parseMasterKey(cfg.legacy)));
  let lastListed: string | null = null;
  for (const entry of (cfg.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean)) {
    const i = entry.indexOf(":");
    if (i < 1) throw new Error("INVEON_MASTER_KEYS entries look like <id>:<base64 or hex key>");
    const id = entry.slice(0, i).trim();
    if (!KEY_ID_RE.test(id)) throw new Error(`Invalid master key id "${id}" (letters, digits, - and _, up to 32)`);
    if (id === LEGACY_KEY_ID) throw new Error(`"${LEGACY_KEY_ID}" is reserved for INVEON_MASTER_KEY`);
    if (next.has(id)) throw new Error(`Master key id "${id}" is listed twice`);
    next.set(id, new LocalKey(id, parseMasterKey(entry.slice(i + 1))));
    lastListed = id;
  }
  if (next.size === 0) throw new Error("Set INVEON_MASTER_KEY or INVEON_MASTER_KEYS");
  const current = cfg.current?.trim() || lastListed || LEGACY_KEY_ID;
  if (!next.has(current)) throw new Error(`INVEON_MASTER_KEY_CURRENT is "${current}", which isn't configured`);
  keyring = next;
  currentKeyId = current;
}

/** The original single-key setup (INVEON_MASTER_KEY only). */
export function configureMasterKey(raw: string) {
  configureMasterKeys({ legacy: raw });
}

/** Adds a key (for example a KMS-backed one) to the keyring. */
export function registerKeyEncryptionKey(kek: KeyEncryptionKey, makeCurrent = false) {
  keyring.set(kek.id, kek);
  if (makeCurrent) currentKeyId = kek.id;
}

export function keyringInfo() {
  return { currentKeyId, keyIds: [...keyring.keys()] };
}

function getKey(id: string): KeyEncryptionKey {
  const k = keyring.get(id);
  if (!k) throw new Error(`Master key "${id}" is not configured`);
  return k;
}

function getCurrentKey(): KeyEncryptionKey {
  if (!currentKeyId) throw new Error("Master key not configured");
  return getKey(currentKeyId);
}

const wrapContext = (keyId: string, aad: string) => (keyId === LEGACY_KEY_ID ? `wrap:${aad}` : `wrap:${keyId}:${aad}`);

interface Parsed {
  keyId: string;
  wrapped: [string, string, string];
  sealed: [string, string, string];
}

function parseEnvelope(envelope: string): Parsed {
  const parts = envelope.split(".");
  if (parts.length === 7 && parts[0] === "v1") return { keyId: LEGACY_KEY_ID, wrapped: [parts[1], parts[2], parts[3]], sealed: [parts[4], parts[5], parts[6]] };
  if (parts.length === 8 && parts[0] === "v2" && KEY_ID_RE.test(parts[1]) && parts[1] !== LEGACY_KEY_ID) {
    return { keyId: parts[1], wrapped: [parts[2], parts[3], parts[4]], sealed: [parts[5], parts[6], parts[7]] };
  }
  throw new Error("Unsupported ciphertext format");
}

function assemble(keyId: string, wrapped: [string, string, string], sealed: [string, string, string]) {
  return keyId === LEGACY_KEY_ID ? ["v1", ...wrapped, ...sealed].join(".") : ["v2", keyId, ...wrapped, ...sealed].join(".");
}

/** The master key id a ciphertext is wrapped with ("legacy" for v1). */
export function keyIdOf(envelope: string): string {
  return parseEnvelope(envelope).keyId;
}

/**
 * Encrypts under the current master key. Passing a raw 32-byte key instead
 * uses it as the legacy key (v1 format), as before key rotation existed.
 */
export function encryptValue(plaintext: string, aad: string, key?: Buffer | KeyEncryptionKey): string {
  const kek = key === undefined ? getCurrentKey() : Buffer.isBuffer(key) ? new LocalKey(LEGACY_KEY_ID, key) : key;
  const dataKey = randomBytes(32);
  try {
    const wrapped = kek.wrap(dataKey, wrapContext(kek.id, aad));
    const s = seal(dataKey, Buffer.from(plaintext, "utf8"), Buffer.from(aad, "utf8"));
    return assemble(kek.id, wrapped, [b64(s.iv), b64(s.tag), b64(s.ct)]);
  } finally {
    dataKey.fill(0);
  }
}

export function decryptValue(envelope: string, aad: string, key?: Buffer | KeyEncryptionKey): string {
  const p = parseEnvelope(envelope);
  const kek = key === undefined ? getKey(p.keyId) : Buffer.isBuffer(key) ? new LocalKey(p.keyId, key) : key;
  const dataKey = kek.unwrap(p.wrapped, wrapContext(p.keyId, aad));
  try {
    const [iv, tag, ct] = p.sealed.map(unb64);
    return open(dataKey, iv, tag, ct, Buffer.from(aad, "utf8")).toString("utf8");
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Re-wraps a value's data key with the current master key. Returns null
 * when it already uses the current key. The value's ciphertext is kept, and
 * the data key is checked against it before anything is written.
 */
export function rewrapValue(envelope: string, aad: string): string | null {
  const p = parseEnvelope(envelope);
  const target = getCurrentKey();
  if (p.keyId === target.id) return null;
  const dataKey = getKey(p.keyId).unwrap(p.wrapped, wrapContext(p.keyId, aad));
  try {
    const [iv, tag, ct] = p.sealed.map(unb64);
    open(dataKey, iv, tag, ct, Buffer.from(aad, "utf8")).fill(0);
    return assemble(target.id, target.wrap(dataKey, wrapContext(target.id, aad)), p.sealed);
  } finally {
    dataKey.fill(0);
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison (no early exit, length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still burn a comparison so timing doesn't reveal the length check.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** Verifies GitHub's X-Hub-Signature-256 header over the raw request body. */
export function verifyGithubSignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, header);
}
