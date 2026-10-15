import { generateKeyPairSync, randomBytes } from "node:crypto";

/**
 * Generates an Ed25519 key pair for a GitHub deploy key: the private half in
 * OpenSSH's own format ("openssh-key-v1", unencrypted, what ssh -i expects)
 * and the public half as one authorized_keys line to paste into GitHub.
 */

function sshString(buf: Buffer | string) {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(b.length);
  return Buffer.concat([len, b]);
}

function uint32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

export function generateDeployKey(comment: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
  const keyType = "ssh-ed25519";
  const publicBlob = Buffer.concat([sshString(keyType), sshString(pub)]);

  const check = randomBytes(4).readUInt32BE();
  let priv = Buffer.concat([uint32(check), uint32(check), sshString(keyType), sshString(pub), sshString(Buffer.concat([seed, pub])), sshString(comment)]);
  // Pad to the cipher block size (8 for "none") with 1, 2, 3, ...
  const pad = (8 - (priv.length % 8)) % 8;
  priv = Buffer.concat([priv, Buffer.from(Array.from({ length: pad }, (_, i) => i + 1))]);

  const body = Buffer.concat([
    Buffer.from("openssh-key-v1\0", "latin1"),
    sshString("none"),
    sshString("none"),
    sshString(""),
    uint32(1),
    sshString(publicBlob),
    sshString(priv),
  ]);
  seed.fill(0);
  const b64 = body.toString("base64").match(/.{1,70}/g)!.join("\n");
  return {
    privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`,
    publicKey: `${keyType} ${publicBlob.toString("base64")} ${comment}`,
  };
}
