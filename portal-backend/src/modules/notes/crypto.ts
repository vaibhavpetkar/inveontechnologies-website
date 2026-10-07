import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Env } from "../shared/env.js";
import { logger } from "../shared/logger.js";

/**
 * Encryption for secrets kept in notes (passwords, API keys). AES-256-GCM
 * with a fresh 12-byte IV per value; stored as "v1.<iv>.<tag>.<data>" in
 * base64. The key comes from PORTAL_VAULT_KEY, or is derived from the JWT
 * secret when that isn't set (with a warning, since rotating the JWT
 * secret would then lock the stored values away).
 */
let warned = false;

export function vaultKey(env: Pick<Env, "PORTAL_VAULT_KEY" | "PORTAL_JWT_SECRET">): Buffer {
  const material = env.PORTAL_VAULT_KEY ?? env.PORTAL_JWT_SECRET;
  if (!env.PORTAL_VAULT_KEY && !warned) {
    warned = true;
    logger.warn("PORTAL_VAULT_KEY is not set; shared-note passwords are encrypted with a key derived from PORTAL_JWT_SECRET");
  }
  return Buffer.from(hkdfSync("sha256", Buffer.from(material, "utf8"), Buffer.from("inveon-portal-vault"), Buffer.from("notes.secret.v1"), 32));
}

export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptSecret(key: Buffer, stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
