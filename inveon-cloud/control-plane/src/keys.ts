import "dotenv/config";
import { createDb } from "./db/client.js";
import { loadEnv, masterKeyConfig, parseKmsRegion } from "./env.js";
import { loadMasterKeys } from "./lib/crypto.js";
import { KMS_KEY_ID_RE, kmsApi, regionOfKeyArn } from "./lib/kms.js";
import { keyStatus, rotateKeys } from "./modules/keys/service.js";

/**
 * Master key maintenance:
 *   node dist/keys.js status                 values per master key id
 *   node dist/keys.js rotate [--batch N] [--max N]
 *                                            re-wrap everything onto INVEON_MASTER_KEY_CURRENT
 *   node dist/keys.js kms-generate <kms key id, ARN or alias> [--id <keyring id>]
 *                                            a new KMS-backed master key, printed as an env line
 * Safe to run while the control plane is up, and to run again: it resumes.
 */
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} needs a positive whole number`);
  return n;
};

/**
 * GenerateDataKey under the given KMS key. Only the encrypted copy is
 * printed; the plaintext data key is wiped and never leaves this process.
 * Needs no database, only kms:GenerateDataKey (and kms:Decrypt to use it).
 */
async function kmsGenerate() {
  const kmsKeyId = args[1];
  const idFlag = args.indexOf("--id");
  const now = new Date();
  const id = idFlag >= 0 ? args[idFlag + 1] : `kms-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!kmsKeyId || !KMS_KEY_ID_RE.test(kmsKeyId)) {
    process.stderr.write("Usage: keys.js kms-generate <KMS key id, key ARN or alias/name> [--id <keyring id>]\n");
    process.exitCode = 64;
    return;
  }
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id) || id === "legacy") throw new Error("--id: letters, digits, - and _, up to 32 (not legacy)");
  const kms = await kmsApi(regionOfKeyArn(kmsKeyId) ?? parseKmsRegion(process.env));
  const out = await kms.generateDataKey(kmsKeyId);
  const ok = out.plaintext.length === 32;
  out.plaintext.fill(0);
  if (!ok) throw new Error("KMS returned a data key that isn't 32 bytes");
  process.stderr.write(
    `Data key generated under ${out.keyArn}. Add this entry to INVEON_MASTER_KEYS (comma-separated with any others),\n` +
      `restart, then run keys:rotate. The control plane's role needs kms:Decrypt on that key.\n`,
  );
  process.stdout.write(`INVEON_MASTER_KEYS=${id}:kms:${out.ciphertextBlob.toString("base64")}\n`);
}

async function maintenance(command: string) {
  const env = loadEnv();
  await loadMasterKeys(masterKeyConfig(env), async (blob) => (await kmsApi(env.INVEON_KMS_REGION)).decrypt(blob));
  const { db, pool } = createDb(env.INVEON_DATABASE_URL);
  try {
    if (command === "rotate") {
      const result = await rotateKeys(db, {
        batchSize: flag("--batch"),
        maxRows: flag("--max"),
        onProgress: (r) => process.stderr.write(`re-wrapped ${r.rewrapped}, failed ${r.failed}\n`),
      });
      process.stdout.write(JSON.stringify({ result, status: await keyStatus(db) }, null, 2) + "\n");
      if (result.failed) process.exitCode = 2;
    } else {
      process.stdout.write(JSON.stringify(await keyStatus(db), null, 2) + "\n");
    }
  } finally {
    await pool.end();
  }
}

const command = args[0] ?? "status";
try {
  if (command === "kms-generate") await kmsGenerate();
  else if (command === "rotate" || command === "status") await maintenance(command);
  else {
    process.stderr.write("Usage: keys.js status | rotate [--batch N] [--max N] | kms-generate <kms key id> [--id <keyring id>]\n");
    process.exitCode = 64;
  }
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exitCode = 1;
}
