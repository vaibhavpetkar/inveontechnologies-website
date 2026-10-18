import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) on top of HOTP (RFC 4226), checked against the RFCs' test
 * vectors in test/totp.test.mjs. Authenticator apps use the defaults: SHA-1,
 * 6 digits, 30-second steps.
 */

export type TotpAlgorithm = "sha1" | "sha256" | "sha512";

export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding (what otpauth:// URIs carry). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP value for one counter (RFC 4226 section 5.3, dynamic truncation). */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: TotpAlgorithm = "sha1"): string {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid counter");
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (unixSec: number, step = TOTP_STEP_SEC) => Math.floor(unixSec / step);

export function totp(secret: Buffer, unixSec: number, opts: { digits?: number; algorithm?: TotpAlgorithm; step?: number } = {}): string {
  return hotp(secret, totpStep(unixSec, opts.step), opts.digits ?? TOTP_DIGITS, opts.algorithm ?? "sha1");
}

/**
 * Checks a code against the current step and `window` steps either side
 * (clock drift). Returns the matching step, so the caller can refuse a
 * replay of the same (or an older) step, or null.
 */
export function verifyTotp(secret: Buffer, code: string, unixSec = Date.now() / 1000, window = 1): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = totpStep(unixSec);
  let matched: number | null = null;
  // Check every candidate (no early exit) so timing doesn't reveal which matched.
  for (let s = now - window; s <= now + window; s++) {
    if (s < 0) continue;
    const expected = Buffer.from(hotp(secret, s), "utf8");
    if (timingSafeEqual(expected, Buffer.from(clean, "utf8")) && matched === null) matched = s;
  }
  return matched;
}

/** 160 random bits, the size RFC 4226 recommends for SHA-1. */
export const generateTotpSecret = () => randomBytes(20);

export function otpauthUri(secret: Buffer, account: string, issuer = "Inveon Cloud"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret: base32Encode(secret), issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SEC) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------------------------------------------------------------- recovery codes

const RC_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

/** Ten one-time codes like "k7mq-2xpa-9rtd" (about 59 bits each). */
export function generateRecoveryCodes(n = 10): string[] {
  const codes: string[] = [];
  while (codes.length < n) {
    let raw = "";
    for (let i = 0; i < 12; i++) raw += RC_ALPHABET[randomInt(RC_ALPHABET.length)];
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Stored per user: a hash salted with the user's id, never the code. */
export const hashRecoveryCode = (userId: string, code: string) => createHash("sha256").update(`inveon-recovery:${userId}:${normalizeRecoveryCode(code)}`).digest("hex");
