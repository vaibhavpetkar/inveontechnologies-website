import { createHash, createPublicKey, timingSafeEqual, verify, X509Certificate, type KeyObject } from "node:crypto";
import { CborError, decodeCbor, decodeCborPrefix, type CborValue } from "./cbor.js";
import { safeEqual } from "./crypto.js";

/**
 * WebAuthn (passkeys) relying-party checks, W3C Web Authentication Level 2
 * §7.1 (registration) and §7.2 (authentication), with node:crypto only.
 *
 * - Algorithms: ES256 (-7, P-256), EdDSA (-8, Ed25519) and RS256 (-257).
 * - Attestation: we ask for "none" and don't rely on attestation for trust.
 *   "none" and "packed" are accepted (packed is checked: self-attestation
 *   with the credential's own key, or a signature by the x5c leaf
 *   certificate, whose chain isn't verified); any other format is refused.
 * - Challenges are issued and consumed by the caller (stored server-side,
 *   single use, with an expiry); here they are only compared.
 */

export const COSE_ALG = { ES256: -7, EdDSA: -8, RS256: -257 } as const;
export const SUPPORTED_ALGS: number[] = [COSE_ALG.EdDSA, COSE_ALG.ES256, COSE_ALG.RS256];

export class WebAuthnError extends Error {}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;
const FLAG_ED = 0x80;

export interface RelyingParty {
  /** The rpId: the control plane's host name (INVEON_PUBLIC_URL). */
  id: string;
  /** Origins the browser may report (https://<host>, plus any extra dev origins). */
  origins: string[];
}

export interface AuthenticatorData {
  rpIdHash: Buffer;
  flags: number;
  userPresent: boolean;
  userVerified: boolean;
  backupEligible: boolean;
  backedUp: boolean;
  signCount: number;
  attested?: { aaguid: Buffer; credentialId: Buffer; publicKey: Map<CborValue, CborValue> };
}

export function parseAuthenticatorData(data: Buffer): AuthenticatorData {
  if (data.length < 37) throw new WebAuthnError("Authenticator data is too short");
  const flags = data[32];
  const out: AuthenticatorData = {
    rpIdHash: data.subarray(0, 32),
    flags,
    userPresent: !!(flags & FLAG_UP),
    userVerified: !!(flags & FLAG_UV),
    backupEligible: !!(flags & FLAG_BE),
    backedUp: !!(flags & FLAG_BS),
    signCount: data.readUInt32BE(33),
  };
  let pos = 37;
  if (flags & FLAG_AT) {
    if (data.length < pos + 18) throw new WebAuthnError("Attested credential data is truncated");
    const aaguid = data.subarray(pos, pos + 16);
    const idLen = data.readUInt16BE(pos + 16);
    pos += 18;
    if (idLen < 16 || idLen > 1023 || data.length < pos + idLen) throw new WebAuthnError("Bad credential id length");
    const credentialId = data.subarray(pos, pos + idLen);
    pos += idLen;
    let decoded;
    try {
      decoded = decodeCborPrefix(data, pos);
    } catch (err) {
      throw new WebAuthnError(`Bad credential public key: ${(err as Error).message}`);
    }
    if (!(decoded.value instanceof Map)) throw new WebAuthnError("The credential public key is not a COSE key");
    pos = decoded.offset;
    out.attested = { aaguid: Buffer.from(aaguid), credentialId: Buffer.from(credentialId), publicKey: decoded.value };
  }
  if (flags & FLAG_ED) {
    // Extensions: one CBOR map. Skipped, but it must be well-formed and last.
    try {
      pos = decodeCborPrefix(data, pos).offset;
    } catch {
      throw new WebAuthnError("Bad extension data");
    }
  }
  if (pos !== data.length) throw new WebAuthnError("Unexpected bytes after the authenticator data");
  return out;
}

const bytes = (m: Map<CborValue, CborValue>, k: number, len?: number) => {
  const v = m.get(k);
  if (!Buffer.isBuffer(v) || (len !== undefined && v.length !== len)) throw new WebAuthnError(`COSE key parameter ${k} is missing or malformed`);
  return v;
};

/** COSE_Key (RFC 9053) to a node KeyObject, for the algorithms we accept. */
export function coseToPublicKey(cose: Map<CborValue, CborValue>): { key: KeyObject; alg: number } {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (typeof alg !== "number" || !SUPPORTED_ALGS.includes(alg)) throw new WebAuthnError("Unsupported credential algorithm (use ES256, EdDSA or RS256)");
  const b64 = (b: Buffer) => b.toString("base64url");
  let jwk: Record<string, string>;
  if (alg === COSE_ALG.ES256) {
    if (kty !== 2 || cose.get(-1) !== 1) throw new WebAuthnError("ES256 needs an EC2 key on P-256");
    jwk = { kty: "EC", crv: "P-256", x: b64(bytes(cose, -2, 32)), y: b64(bytes(cose, -3, 32)) };
  } else if (alg === COSE_ALG.EdDSA) {
    if (kty !== 1 || cose.get(-1) !== 6) throw new WebAuthnError("EdDSA needs an OKP key on Ed25519");
    jwk = { kty: "OKP", crv: "Ed25519", x: b64(bytes(cose, -2, 32)) };
  } else {
    if (kty !== 3) throw new WebAuthnError("RS256 needs an RSA key");
    const n = bytes(cose, -1);
    if (n.length < 256) throw new WebAuthnError("RSA keys must be at least 2048 bits");
    jwk = { kty: "RSA", n: b64(n), e: b64(bytes(cose, -2)) };
  }
  try {
    return { key: createPublicKey({ key: jwk, format: "jwk" }), alg };
  } catch {
    throw new WebAuthnError("The credential public key is invalid");
  }
}

export function verifySignature(alg: number, key: KeyObject, data: Buffer, signature: Buffer): boolean {
  try {
    if (alg === COSE_ALG.ES256) return verify("sha256", data, { key, dsaEncoding: "der" }, signature);
    if (alg === COSE_ALG.RS256) return verify("sha256", data, key, signature);
    if (alg === COSE_ALG.EdDSA) return verify(null, data, key, signature);
  } catch {
    return false;
  }
  return false;
}

interface ClientData {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

function checkClientData(raw: Buffer, type: "webauthn.create" | "webauthn.get", challenge: string, rp: RelyingParty): ClientData {
  let data: ClientData;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new WebAuthnError("clientDataJSON is not JSON");
  }
  if (!data || typeof data !== "object") throw new WebAuthnError("clientDataJSON is not an object");
  if (data.type !== type) throw new WebAuthnError(`Expected a ${type} response`);
  if (typeof data.challenge !== "string" || !safeEqual(data.challenge, challenge)) throw new WebAuthnError("The challenge doesn't match");
  if (typeof data.origin !== "string" || !rp.origins.includes(data.origin)) throw new WebAuthnError(`Unexpected origin ${String(data.origin).slice(0, 100)}`);
  if (data.crossOrigin === true) throw new WebAuthnError("Cross-origin requests are not accepted");
  return data;
}

function checkRp(auth: AuthenticatorData, rp: RelyingParty, requireUserVerification: boolean) {
  const expected = createHash("sha256").update(rp.id).digest();
  if (!timingSafeEqual(auth.rpIdHash, expected)) throw new WebAuthnError("The passkey is for another site");
  if (!auth.userPresent) throw new WebAuthnError("The authenticator didn't confirm user presence");
  if (requireUserVerification && !auth.userVerified) throw new WebAuthnError("The authenticator didn't verify the user (PIN or biometrics)");
}

export interface RegistrationInput {
  credentialId: Buffer;
  clientDataJSON: Buffer;
  attestationObject: Buffer;
}

export interface VerifiedRegistration {
  credentialId: Buffer;
  publicKey: KeyObject;
  alg: number;
  signCount: number;
  aaguid: string;
  backupEligible: boolean;
  backedUp: boolean;
  fmt: string;
}

/** §7.1: checks a navigator.credentials.create() response. */
export function verifyRegistration(input: RegistrationInput, expected: { challenge: string; rp: RelyingParty; requireUserVerification: boolean }): VerifiedRegistration {
  checkClientData(input.clientDataJSON, "webauthn.create", expected.challenge, expected.rp);
  let att: CborValue;
  try {
    att = decodeCbor(input.attestationObject);
  } catch (err) {
    throw new WebAuthnError(`attestationObject is not valid CBOR${err instanceof CborError ? `: ${err.message}` : ""}`);
  }
  if (!(att instanceof Map)) throw new WebAuthnError("attestationObject is not a map");
  const fmt = att.get("fmt");
  const attStmt = att.get("attStmt");
  const authDataRaw = att.get("authData");
  if (typeof fmt !== "string" || !(attStmt instanceof Map) || !Buffer.isBuffer(authDataRaw)) throw new WebAuthnError("attestationObject is missing fmt, attStmt or authData");

  const auth = parseAuthenticatorData(authDataRaw);
  checkRp(auth, expected.rp, expected.requireUserVerification);
  if (!auth.attested) throw new WebAuthnError("No credential in the attestation");
  if (!auth.attested.credentialId.equals(input.credentialId)) throw new WebAuthnError("The credential id doesn't match the attested one");
  const { key, alg } = coseToPublicKey(auth.attested.publicKey);

  const clientDataHash = createHash("sha256").update(input.clientDataJSON).digest();
  const signed = Buffer.concat([authDataRaw, clientDataHash]);
  if (fmt === "none") {
    if (attStmt.size !== 0) throw new WebAuthnError("A none attestation must have an empty statement");
  } else if (fmt === "packed") {
    const stmtAlg = attStmt.get("alg");
    const sig = attStmt.get("sig");
    const x5c = attStmt.get("x5c");
    if (typeof stmtAlg !== "number" || !Buffer.isBuffer(sig)) throw new WebAuthnError("A packed attestation needs alg and sig");
    if (x5c === undefined) {
      // Self attestation: signed with the credential's own key.
      if (stmtAlg !== alg) throw new WebAuthnError("Self attestation must use the credential's algorithm");
      if (!verifySignature(alg, key, signed, sig)) throw new WebAuthnError("The attestation signature is invalid");
    } else {
      if (!Array.isArray(x5c) || !Buffer.isBuffer(x5c[0])) throw new WebAuthnError("x5c must be a list of certificates");
      if (!SUPPORTED_ALGS.includes(stmtAlg)) throw new WebAuthnError("Unsupported attestation algorithm");
      let leaf: KeyObject;
      try {
        leaf = new X509Certificate(x5c[0]).publicKey;
      } catch {
        throw new WebAuthnError("The attestation certificate is invalid");
      }
      if (!verifySignature(stmtAlg, leaf, signed, sig)) throw new WebAuthnError("The attestation signature is invalid");
    }
  } else {
    throw new WebAuthnError(`Attestation format "${fmt.slice(0, 40)}" is not supported`);
  }

  const a = auth.attested.aaguid.toString("hex");
  return {
    credentialId: auth.attested.credentialId,
    publicKey: key,
    alg,
    signCount: auth.signCount,
    aaguid: `${a.slice(0, 8)}-${a.slice(8, 12)}-${a.slice(12, 16)}-${a.slice(16, 20)}-${a.slice(20)}`,
    backupEligible: auth.backupEligible,
    backedUp: auth.backedUp,
    fmt,
  };
}

export interface AssertionInput {
  clientDataJSON: Buffer;
  authenticatorData: Buffer;
  signature: Buffer;
}

/**
 * §7.2: checks a navigator.credentials.get() response against a stored
 * credential. The sign counter must go up whenever either side is non-zero
 * (a counter that stays or goes back suggests a cloned authenticator);
 * authenticators that always report 0 (synced passkeys) are fine.
 */
export function verifyAssertion(
  input: AssertionInput,
  credential: { publicKey: KeyObject; alg: number; signCount: number },
  expected: { challenge: string; rp: RelyingParty; requireUserVerification: boolean },
): { signCount: number; userVerified: boolean; backedUp: boolean } {
  checkClientData(input.clientDataJSON, "webauthn.get", expected.challenge, expected.rp);
  const auth = parseAuthenticatorData(input.authenticatorData);
  checkRp(auth, expected.rp, expected.requireUserVerification);
  const clientDataHash = createHash("sha256").update(input.clientDataJSON).digest();
  if (!verifySignature(credential.alg, credential.publicKey, Buffer.concat([input.authenticatorData, clientDataHash]), input.signature)) {
    throw new WebAuthnError("The passkey's signature is invalid");
  }
  if ((auth.signCount !== 0 || credential.signCount !== 0) && auth.signCount <= credential.signCount) {
    throw new SignCountError("The passkey's signature counter went backwards; it may have been cloned");
  }
  return { signCount: auth.signCount, userVerified: auth.userVerified, backedUp: auth.backedUp };
}

export class SignCountError extends WebAuthnError {}

/** The rpId and origins for INVEON_PUBLIC_URL, plus extra origins (dev servers). */
export function relyingParty(publicUrl: string, extraOrigins: string | undefined): RelyingParty {
  const u = new URL(publicUrl);
  const origins = [u.origin];
  for (const o of (extraOrigins ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const parsed = new URL(o);
    // The rpId must be the origin's host or a parent of it, or browsers refuse.
    if (parsed.hostname !== u.hostname && !parsed.hostname.endsWith(`.${u.hostname}`)) throw new Error(`INVEON_WEBAUTHN_ORIGINS: ${o} is not on ${u.hostname}`);
    origins.push(parsed.origin);
  }
  return { id: u.hostname, origins };
}
