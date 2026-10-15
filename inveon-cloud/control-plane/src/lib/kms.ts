/**
 * AWS KMS for master keys. A KMS-backed keyring entry holds a data key that
 * KMS encrypted (GenerateDataKey's CiphertextBlob); the control plane asks
 * KMS to decrypt it once at start-up and then uses it like any other
 * master key. KMS therefore guards the key at rest (the environment only
 * holds a ciphertext, useless without kms:Decrypt on the control plane's
 * role), without a KMS call per secret.
 *
 * Every blob is bound to an encryption context, so a data key generated for
 * something else in the same KMS key can't be passed off as a master key.
 *
 * The real implementation uses the AWS SDK v3 (loaded on first use); tests
 * swap in a fake with setKmsApiFactory, so the suite never calls AWS.
 */

export const KMS_CONTEXT: Record<string, string> = { "inveon:purpose": "master-key" };

export interface KmsApi {
  /** kms:Decrypt of a CiphertextBlob with KMS_CONTEXT. */
  decrypt(blob: Buffer): Promise<Buffer>;
  /** kms:GenerateDataKey (AES_256) with KMS_CONTEXT. */
  generateDataKey(keyId: string): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer; keyArn: string }>;
}

export type KmsApiFactory = (region: string | undefined) => KmsApi;

let factory: KmsApiFactory | null = null;

export function setKmsApiFactory(f: KmsApiFactory | null) {
  factory = f;
}

/** The region in a key ARN (arn:aws:kms:<region>:<account>:key/…), if it is one. */
export function regionOfKeyArn(keyId: string): string | undefined {
  return /^arn:aws[a-z-]*:kms:([a-z0-9-]+):/.exec(keyId)?.[1];
}

/** Key ids, ARNs and aliases as KMS accepts them; anything else is refused before calling AWS. */
export const KMS_KEY_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|mrk-[0-9a-f]{32}|alias\/[A-Za-z0-9/_-]{1,250}|arn:aws[a-z-]*:kms:[a-z0-9-]+:\d{12}:(?:key\/[A-Za-z0-9-]{1,64}|alias\/[A-Za-z0-9/_-]{1,250}))$/;

export async function kmsApi(region: string | undefined): Promise<KmsApi> {
  if (factory) return factory(region);
  const { DecryptCommand, GenerateDataKeyCommand, KMSClient } = await import("@aws-sdk/client-kms");
  // Without a region the SDK's default chain applies (AWS_REGION, the profile).
  const client = new KMSClient(region ? { region } : {});
  return {
    async decrypt(blob) {
      const out = await client.send(new DecryptCommand({ CiphertextBlob: blob, EncryptionContext: KMS_CONTEXT }));
      if (!out.Plaintext) throw new Error("KMS returned no plaintext");
      return Buffer.from(out.Plaintext);
    },
    async generateDataKey(keyId) {
      const out = await client.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: "AES_256", EncryptionContext: KMS_CONTEXT }));
      if (!out.Plaintext || !out.CiphertextBlob) throw new Error("KMS returned no data key");
      return { plaintext: Buffer.from(out.Plaintext), ciphertextBlob: Buffer.from(out.CiphertextBlob), keyArn: out.KeyId ?? keyId };
    },
  };
}
