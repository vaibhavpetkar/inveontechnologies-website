import { sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { keyringInfo, LEGACY_KEY_ID, rewrapValue } from "../../lib/crypto.js";
import { deployKeyAad, registryAad, webhookAad } from "../../lib/aad.js";
import { logger } from "../../lib/logger.js";
import { envVarAad } from "../jobs/service.js";
import { channelSecretAad, channelUrlAad } from "../alerts/service.js";
import { totpAad, totpPendingAad } from "../auth/two-factor.js";
import { awsSecretAad } from "../aws/service.js";

/**
 * Every column holding an envelope-encrypted value, with how to rebuild its
 * associated data from the row. Anything new that calls encryptValue for a
 * stored value must be listed here, or rotation would leave it behind (a
 * test checks the list against the schema's *_enc columns).
 */
export interface EncryptedColumn {
  table: string;
  column: string;
  /** Extra columns the AAD needs. */
  extra: string[];
  aad: (row: Record<string, string>) => string;
}

export const ENCRYPTED_COLUMNS: EncryptedColumn[] = [
  { table: "env_vars", column: "value_enc", extra: ["environment_id", "key"], aad: (r) => envVarAad(r.environment_id, r.key) },
  { table: "apps", column: "webhook_secret_enc", extra: [], aad: (r) => webhookAad(r.id) },
  { table: "apps", column: "registry_password_enc", extra: [], aad: (r) => registryAad(r.id) },
  { table: "apps", column: "deploy_key_enc", extra: [], aad: (r) => deployKeyAad(r.id) },
  { table: "alert_channels", column: "url_enc", extra: [], aad: (r) => channelUrlAad(r.id) },
  { table: "alert_channels", column: "signing_secret_enc", extra: [], aad: (r) => channelSecretAad(r.id) },
  { table: "users", column: "totp_secret_enc", extra: [], aad: (r) => totpAad(r.id) },
  { table: "users", column: "totp_pending_secret_enc", extra: [], aad: (r) => totpPendingAad(r.id) },
  { table: "aws_connections", column: "secret_access_key_enc", extra: ["org_id"], aad: (r) => awsSecretAad(r.org_id) },
];

export function registerEncryptedColumn(c: EncryptedColumn) {
  if (!ENCRYPTED_COLUMNS.some((e) => e.table === c.table && e.column === c.column)) ENCRYPTED_COLUMNS.push(c);
}

// Identifiers come only from the constant list above, never from requests.
const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Bad identifier ${name}`);
  return sql.raw(`"${name}"`);
};

/** SQL for "the key id of this ciphertext": legacy for v1, else the second part. */
const keyIdExpr = (col: ReturnType<typeof ident>) => sql`CASE WHEN split_part(${col}, '.', 1) = 'v1' THEN ${LEGACY_KEY_ID} ELSE split_part(${col}, '.', 2) END`;

export interface KeyStatus {
  currentKeyId: string | null;
  configuredKeyIds: string[];
  /** Configured ids whose key is a KMS-encrypted data key (decrypted at start-up). */
  kmsKeyIds: string[];
  /** Values per master key id, across every encrypted column. */
  counts: Record<string, number>;
  columns: { name: string; counts: Record<string, number> }[];
  /** Ids still referenced but not configured: those values can't be read. */
  missingKeyIds: string[];
  /** Configured, not current, and referenced by nothing: safe to remove. */
  removableKeyIds: string[];
  pendingRotation: number;
}

export async function keyStatus(db: Database): Promise<KeyStatus> {
  const { currentKeyId, keyIds, kmsKeyIds } = keyringInfo();
  const counts: Record<string, number> = {};
  const columns: KeyStatus["columns"] = [];
  for (const c of ENCRYPTED_COLUMNS) {
    const col = ident(c.column);
    const { rows } = await db.execute<{ kid: string; n: number }>(
      sql`SELECT ${keyIdExpr(col)} AS kid, count(*)::int AS n FROM ${ident(c.table)} WHERE ${col} IS NOT NULL GROUP BY 1`,
    );
    const per: Record<string, number> = {};
    for (const r of rows) {
      per[r.kid] = r.n;
      counts[r.kid] = (counts[r.kid] ?? 0) + r.n;
    }
    columns.push({ name: `${c.table}.${c.column}`, counts: per });
  }
  const pendingRotation = Object.entries(counts).reduce((sum, [kid, n]) => (kid === currentKeyId ? sum : sum + n), 0);
  return {
    currentKeyId,
    configuredKeyIds: keyIds,
    kmsKeyIds,
    counts,
    columns,
    missingKeyIds: Object.keys(counts).filter((k) => !keyIds.includes(k)),
    removableKeyIds: keyIds.filter((k) => k !== currentKeyId && !counts[k]),
    pendingRotation,
  };
}

export interface RotationResult {
  rewrapped: number;
  failed: number;
  failures: { column: string; id: string; error: string }[];
  stoppedEarly: boolean;
}

/**
 * Re-wraps every value that isn't on the current master key, in batches of
 * `batchSize` rows per column (keyset by id). Each row is updated only if it
 * still holds the ciphertext that was read, so a concurrent edit is never
 * overwritten. Idempotent: values on the current key are never selected, so
 * a run that stops (crash, `maxRows`) resumes where it left off next time.
 * A value that can't be unwrapped (its key is missing) is skipped and
 * reported, not retried in the same run.
 */
export async function rotateKeys(db: Database, opts: { batchSize?: number; maxRows?: number; onProgress?: (r: RotationResult) => void } = {}): Promise<RotationResult> {
  const { currentKeyId } = keyringInfo();
  if (!currentKeyId) throw new Error("Master key not configured");
  const batchSize = Math.min(Math.max(opts.batchSize ?? 200, 1), 5000);
  const result: RotationResult = { rewrapped: 0, failed: 0, failures: [], stoppedEarly: false };
  const notCurrent = (col: ReturnType<typeof ident>) => sql`${keyIdExpr(col)} <> ${currentKeyId}`;

  for (const c of ENCRYPTED_COLUMNS) {
    const col = ident(c.column);
    const extras = c.extra.map((e) => sql`, ${ident(e)}::text AS ${ident(e)}`);
    let cursor = "00000000-0000-0000-0000-000000000000";
    for (;;) {
      if (opts.maxRows !== undefined && result.rewrapped + result.failed >= opts.maxRows) {
        result.stoppedEarly = true;
        return result;
      }
      const limit = opts.maxRows !== undefined ? Math.min(batchSize, opts.maxRows - result.rewrapped - result.failed) : batchSize;
      const { rows } = await db.execute<Record<string, string>>(
        sql`SELECT id::text AS id, ${col} AS value${sql.join(extras, sql``)} FROM ${ident(c.table)}
            WHERE ${col} IS NOT NULL AND ${notCurrent(col)} AND id > ${cursor}::uuid
            ORDER BY id LIMIT ${limit}`,
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        cursor = row.id;
        try {
          const next = rewrapValue(row.value, c.aad(row));
          if (next === null) continue;
          await db.execute(sql`UPDATE ${ident(c.table)} SET ${col} = ${next} WHERE id = ${row.id}::uuid AND ${col} = ${row.value}`);
          result.rewrapped++;
        } catch (err) {
          result.failed++;
          if (result.failures.length < 50) result.failures.push({ column: `${c.table}.${c.column}`, id: row.id, error: (err as Error).message });
        }
      }
      opts.onProgress?.(result);
    }
  }
  return result;
}

// ---------------------------------------------------------------- one run at a time, in this process

let running: Promise<RotationResult> | null = null;
let lastRun: { startedAt: Date; finishedAt: Date | null; result: RotationResult | null; error: string | null } | null = null;

export function rotationState() {
  return { running: !!running, lastRun };
}

/** Starts a background rotation unless one is running; returns immediately. */
export function startRotation(db: Database) {
  if (running) return false;
  lastRun = { startedAt: new Date(), finishedAt: null, result: null, error: null };
  const run = lastRun;
  running = rotateKeys(db, { onProgress: (r) => (run.result = { ...r }) })
    .then((r) => {
      run.result = r;
      logger.info({ rewrapped: r.rewrapped, failed: r.failed }, "Master key rotation finished");
      return r;
    })
    .catch((err) => {
      run.error = (err as Error).message;
      logger.error({ err }, "Master key rotation failed");
      throw err;
    })
    .finally(() => {
      run.finishedAt = new Date();
      running = null;
    });
  running.catch(() => undefined);
  return true;
}

/** Logs a warning at start-up when stored values need a key that isn't configured. */
export async function warnAboutMissingKeys(db: Database) {
  const status = await keyStatus(db);
  if (status.missingKeyIds.length) logger.error({ missingKeyIds: status.missingKeyIds }, "Encrypted values reference master keys that aren't configured; they can't be decrypted");
  if (status.pendingRotation) logger.info({ pending: status.pendingRotation, current: status.currentKeyId }, "Some encrypted values are not on the current master key; run the key rotation");
}
