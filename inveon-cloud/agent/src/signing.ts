import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Request signing. The agent keeps an Ed25519 key next to its config (0600)
 * and signs every request to the control plane on top of the bearer token:
 *
 *   inveon-agent-v1\n<METHOD>\n<path and query>\n<unix seconds>\n<nonce>\n<hex SHA-256 of the body>
 *
 * sent as X-Inveon-Timestamp, X-Inveon-Nonce and X-Inveon-Signature. The
 * control plane checks it against the public key the agent registered,
 * refuses timestamps more than 5 minutes off and nonces it has seen. This
 * takes the place of mutual TLS, which the shared nginx in front of the
 * control plane can't offer for one path only. The control plane has the
 * same function (control-plane/src/lib/agent-signature.ts); both are tested
 * against the same fixed vector.
 */

export const SIGNATURE_PREFIX = "inveon-agent-v1";

export function canonicalRequest(method: string, path: string, timestamp: number | string, nonce: string, body: string | Buffer) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return [SIGNATURE_PREFIX, method.toUpperCase(), path, String(timestamp), nonce, bodyHash].join("\n");
}

export class RequestSigner {
  constructor(
    private readonly key: KeyObject,
    private readonly now: () => number = Date.now,
  ) {}

  /** The public half the control plane stores: SPKI DER, base64. */
  publicKey() {
    return createPublicKey(this.key).export({ format: "der", type: "spki" }).toString("base64");
  }

  headers(method: string, path: string, body: string | Buffer, nonce = randomBytes(16).toString("base64url")): Record<string, string> {
    const timestamp = Math.floor(this.now() / 1000);
    const signature = sign(null, Buffer.from(canonicalRequest(method, path, timestamp, nonce, body)), this.key);
    return { "X-Inveon-Timestamp": String(timestamp), "X-Inveon-Nonce": nonce, "X-Inveon-Signature": signature.toString("base64") };
  }
}

/** Where the key lives when the config doesn't say: next to config.json. */
export const defaultKeyPath = (configPath: string) => join(dirname(configPath), "agent-key.pem");

/**
 * Loads the agent's Ed25519 key, or makes one. The private key is written
 * root-only (0600) through a temporary file, and is never sent anywhere.
 */
export function loadOrCreateSigningKey(path: string): { signer: RequestSigner; created: boolean } {
  if (existsSync(path)) {
    const key = createPrivateKey(readFileSync(path, "utf8"));
    if (key.asymmetricKeyType !== "ed25519") throw new Error(`${path} is not an Ed25519 key`);
    return { signer: new RequestSigner(key), created: false };
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  renameSync(tmp, path);
  return { signer: new RequestSigner(privateKey), created: true };
}
