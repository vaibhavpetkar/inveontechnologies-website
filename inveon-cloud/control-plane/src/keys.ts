import "dotenv/config";
import { createDb } from "./db/client.js";
import { loadEnv, masterKeyConfig } from "./env.js";
import { configureMasterKeys } from "./lib/crypto.js";
import { keyStatus, rotateKeys } from "./modules/keys/service.js";

/**
 * Master key maintenance:
 *   node dist/keys.js status                 values per master key id
 *   node dist/keys.js rotate [--batch N] [--max N]
 *                                            re-wrap everything onto INVEON_MASTER_KEY_CURRENT
 * Safe to run while the control plane is up, and to run again: it resumes.
 */
const env = loadEnv();
configureMasterKeys(masterKeyConfig(env));
const { db, pool } = createDb(env.INVEON_DATABASE_URL);

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} needs a positive whole number`);
  return n;
};

try {
  const command = args[0] ?? "status";
  if (command === "rotate") {
    const result = await rotateKeys(db, {
      batchSize: flag("--batch"),
      maxRows: flag("--max"),
      onProgress: (r) => process.stderr.write(`re-wrapped ${r.rewrapped}, failed ${r.failed}\n`),
    });
    process.stdout.write(JSON.stringify({ result, status: await keyStatus(db) }, null, 2) + "\n");
    if (result.failed) process.exitCode = 2;
  } else if (command === "status") {
    process.stdout.write(JSON.stringify(await keyStatus(db), null, 2) + "\n");
  } else {
    process.stderr.write("Usage: keys.js status | rotate [--batch N] [--max N]\n");
    process.exitCode = 64;
  }
} finally {
  await pool.end();
}
