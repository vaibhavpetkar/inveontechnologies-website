import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

/**
 * Signed agent requests (used instead of mTLS: the control plane sits behind
 * a shared nginx that also serves browser sites, where asking for client
 * certificates is impractical and the TLS session ends before the app).
 *
 * The agent keeps an Ed25519 key next to its config and signs every request
 * on top of the bearer token. The signed string is:
 *
 *   inveon-agent-v1\n<METHOD>\n<path and query>\n<unix seconds>\n<nonce>\n<hex SHA-256 of the body>
 *
 * sent as X-Inveon-Timestamp, X-Inveon-Nonce and X-Inveon-Signature
 * (base64). A stolen token alone is then not enough, a captured request
 * can't be replayed (nonce) or kept for later (timestamp), and the body and
 * path can't be changed in transit by anything that terminates TLS.
 *
 * The agent has the same function (agent/src/signing.ts); both sides are
 * tested against the same fixed vector.
 */

export const SIGNATURE_PREFIX = "inveon-agent-v1";
/** How far a request's timestamp may be from the control plane's clock. */
export const SIGNATURE_MAX_SKEW_SEC = 5 * 60;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function canonicalRequest(method: string, path: string, timestamp: number | string, nonce: string, body: Buffer | string) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return [SIGNATURE_PREFIX, method.toUpperCase(), path, String(timestamp), nonce, bodyHash].join("\n");
}

/** Parses an agent's public key (SPKI DER, base64); only Ed25519 is accepted. */
export function parseAgentPublicKey(b64: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("Not a public key");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new Error("The agent key must be Ed25519");
  return key;
}

export type SignatureCheck = { ok: true; nonce: string; timestamp: number } | { ok: false; reason: string };

/** Checks the headers and the signature; the caller still records the nonce (replay check). */
export function checkAgentSignature(
  publicKeyB64: string,
  req: { method: string; path: string; body: Buffer; headers: Record<string, string | string[] | undefined> },
  nowMs: number,
): SignatureCheck {
  const header = (name: string) => {
    const v = req.headers[name];
    return typeof v === "string" ? v : undefined;
  };
  const ts = header("x-inveon-timestamp");
  const nonce = header("x-inveon-nonce");
  const sig = header("x-inveon-signature");
  if (!ts || !nonce || !sig) return { ok: false, reason: "Agent request is not signed" };
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: "Bad signature timestamp" };
  if (!NONCE_RE.test(nonce)) return { ok: false, reason: "Bad signature nonce" };
  const timestamp = Number(ts);
  if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_MAX_SKEW_SEC) return { ok: false, reason: "Signature timestamp is more than 5 minutes off; check the server's clock" };
  const signature = Buffer.from(sig, "base64");
  // Ed25519 signatures are always 64 bytes.
  if (signature.length !== 64) return { ok: false, reason: "Invalid agent signature" };
  let valid = false;
  try {
    valid = verify(null, Buffer.from(canonicalRequest(req.method, req.path, ts, nonce, req.body)), parseAgentPublicKey(publicKeyB64), signature);
  } catch {
    valid = false;
  }
  return valid ? { ok: true, nonce, timestamp } : { ok: false, reason: "Invalid agent signature" };
}
