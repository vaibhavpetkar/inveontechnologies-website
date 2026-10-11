import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Envelope encryption for env vars, secrets and webhook secrets.
 *
 * Each value gets its own random 256-bit data key. The value is encrypted
 * with AES-256-GCM under the data key, and the data key is itself encrypted
 * (wrapped) with AES-256-GCM under the master key from INVEON_MASTER_KEY.
 * The master key never touches the database, so a database dump alone
 * reveals nothing. The caller passes an "aad" (for example
 * "env:<environmentId>:<KEY>") that is authenticated with the value, so a
 * ciphertext copied to another row or key fails to decrypt.
 *
 * Format: v1.<wrapIv>.<wrapTag>.<wrappedKey>.<iv>.<tag>.<ciphertext> (base64url).
 * Rotating the master key = decrypt with the old key and re-wrap (phase 2).
 */

const ALGO = "aes-256-gcm";

let masterKey: Buffer | null = null;

export function parseMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new Error("INVEON_MASTER_KEY must be 32 bytes (base64 or 64 hex characters)");
  return key;
}

export function configureMasterKey(raw: string) {
  masterKey = parseMasterKey(raw);
}

function getMasterKey(): Buffer {
  if (!masterKey) throw new Error("Master key not configured");
  return masterKey;
}

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

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function encryptValue(plaintext: string, aad: string, key: Buffer = getMasterKey()): string {
  const dataKey = randomBytes(32);
  const aadBuf = Buffer.from(aad, "utf8");
  const wrapped = seal(key, dataKey, Buffer.from(`wrap:${aad}`, "utf8"));
  const sealed = seal(dataKey, Buffer.from(plaintext, "utf8"), aadBuf);
  dataKey.fill(0);
  return ["v1", b64(wrapped.iv), b64(wrapped.tag), b64(wrapped.ct), b64(sealed.iv), b64(sealed.tag), b64(sealed.ct)].join(".");
}

export function decryptValue(envelope: string, aad: string, key: Buffer = getMasterKey()): string {
  const parts = envelope.split(".");
  if (parts.length !== 7 || parts[0] !== "v1") throw new Error("Unsupported ciphertext format");
  const [, wIv, wTag, wCt, iv, tag, ct] = parts.map((p, i) => (i === 0 ? Buffer.alloc(0) : unb64(p)));
  const dataKey = open(key, wIv, wTag, wCt, Buffer.from(`wrap:${aad}`, "utf8"));
  try {
    return open(dataKey, iv, tag, ct, Buffer.from(aad, "utf8")).toString("utf8");
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
