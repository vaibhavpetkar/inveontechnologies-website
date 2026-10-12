import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, backupConfigs, backups, environments, jobs } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { createJob, notifyServer, registerJobEffect, type StepInput } from "../jobs/service.js";

/**
 * Backup retention, per environment: keep the newest successful backup of
 * each of the last N days that have one (keepDaily) and of each of the last
 * M ISO weeks (keepWeekly); everything older goes. A daily prune job asks the
 * environment's agent to `aws s3 rm` exactly those keys, each checked to be
 * inside that environment's own prefix, and the records are deleted once the
 * job succeeds. Backups younger than 24 hours, and anything still running,
 * are never pruned, so a pre-deploy backup stays available for a restore.
 */
export const MIN_AGE_MS = 24 * 3600 * 1000;
const KEYS_PER_STEP = 200;

type Backup = typeof backups.$inferSelect;
type Config = typeof backupConfigs.$inferSelect;
type Environment = typeof environments.$inferSelect;

export interface RetentionRow {
  id: string;
  createdAt: Date;
  status: string;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** ISO week (Monday start, UTC), e.g. 2026-W41. */
export function weekKey(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Newest row per bucket, for the most recent `count` buckets. */
function newestPerBucket(rows: RetentionRow[], bucketOf: (d: Date) => string, count: number) {
  const keep = new Set<string>();
  if (count <= 0) return keep;
  const seen = new Set<string>();
  for (const r of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const bucket = bucketOf(r.createdAt);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    if (seen.size > count) break;
    keep.add(r.id);
  }
  return keep;
}

/** Pure rule: which backups to delete. keepDaily null = keep everything. */
export function backupsToPrune(rows: RetentionRow[], keepDaily: number | null, keepWeekly: number, now = new Date()): string[] {
  if (keepDaily === null) return [];
  const settled = rows.filter((r) => ["success", "failure", "cancelled"].includes(r.status) && now.getTime() - r.createdAt.getTime() >= MIN_AGE_MS);
  const good = rows.filter((r) => r.status === "success");
  const keep = new Set([...newestPerBucket(good, dayKey, keepDaily), ...newestPerBucket(good, weekKey, keepWeekly)]);
  return settled.filter((r) => !keep.has(r.id)).map((r) => r.id);
}

/** The folder of a backup key, if it is this environment's own (<prefix>/<slug>/<file>.tar.gz). */
export function envPrefixOf(key: string, slug: string) {
  const i = key.lastIndexOf("/");
  if (i < 0) return null;
  const dir = key.slice(0, i + 1);
  const file = key.slice(i + 1);
  if (!(dir === `${slug}/` || dir.endsWith(`/${slug}/`)) || !/^[A-Za-z0-9._-]{1,200}\.tar\.gz$/.test(file)) return null;
  return dir;
}

async function busy(db: Database, environmentId: string) {
  return db.query.jobs.findFirst({ where: and(eq(jobs.environmentId, environmentId), inArray(jobs.type, ["backup_prune", "restore"]), inArray(jobs.status, ["pending", "running"])) });
}

/**
 * Queues a prune job for one environment if anything is due. Returns the
 * job (or null when nothing is due or a prune or restore is already running).
 */
export async function pruneEnvironmentBackups(db: Database, environment: Environment, cfg: Config, userId: string | null, now = new Date()) {
  await db.update(backupConfigs).set({ lastPrunedAt: now }).where(eq(backupConfigs.environmentId, environment.id));
  if (cfg.keepDaily === null) return { job: null, count: 0 };
  if (await busy(db, environment.id)) return { job: null, count: 0 };
  const rows = await db.select().from(backups).where(eq(backups.environmentId, environment.id)).orderBy(asc(backups.createdAt));
  const doomed = new Set(backupsToPrune(rows, cfg.keepDaily, cfg.keepWeekly, now));
  // Group by bucket, region and folder; a key outside the environment's own folder is never touched.
  const groups = new Map<string, { bucket: string; region: string; prefix: string; rows: Backup[] }>();
  for (const b of rows.filter((r) => doomed.has(r.id))) {
    const prefix = envPrefixOf(b.s3Key, environment.slug);
    if (!prefix) continue;
    const k = `${b.s3Bucket}|${b.s3Region}|${prefix}`;
    const g = groups.get(k) ?? { bucket: b.s3Bucket, region: b.s3Region, prefix, rows: [] };
    g.rows.push(b);
    groups.set(k, g);
  }
  const steps: StepInput[] = [];
  const ids: string[] = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.rows.length; i += KEYS_PER_STEP) {
      const chunk = g.rows.slice(i, i + KEYS_PER_STEP);
      steps.push({
        name: `Delete ${chunk.length} old backup${chunk.length === 1 ? "" : "s"} from s3://${g.bucket}/${g.prefix}`,
        action: "backup.delete",
        params: { slug: environment.slug, bucket: g.bucket, region: g.region, prefix: g.prefix, keys: chunk.map((b) => b.s3Key) },
      });
      ids.push(...chunk.map((b) => b.id));
    }
  }
  if (!steps.length) return { job: null, count: 0 };
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  const job = await createJob(db, {
    orgId: environment.orgId,
    serverId: environment.serverId,
    environmentId: environment.id,
    type: "backup_prune",
    title: `Delete old backups of ${app?.name ?? "app"} / ${environment.name}`,
    createdBy: userId,
    meta: { backupIds: ids },
    steps,
  });
  notifyServer(environment.serverId);
  return { job, count: ids.length };
}

/** Prune done: the S3 objects are gone, so the records go too. A failed prune is retried next time. */
registerJobEffect("backup_prune", async (db, job) => {
  if (job.status !== "success") return;
  const ids = Array.isArray(job.meta.backupIds) ? (job.meta.backupIds as string[]) : [];
  if (!ids.length || !job.environmentId) return;
  await db.delete(backups).where(and(inArray(backups.id, ids), eq(backups.environmentId, job.environmentId)));
});

/** Scheduler, daily: every environment with a retention rule. */
export async function pruneAllBackups(db: Database, now = new Date()) {
  const rows = await db
    .select({ cfg: backupConfigs, environment: environments })
    .from(backupConfigs)
    .innerJoin(environments, eq(environments.id, backupConfigs.environmentId))
    .where(isNotNull(backupConfigs.keepDaily));
  let queued = 0;
  for (const { cfg, environment } of rows) {
    const { job, count } = await pruneEnvironmentBackups(db, environment, cfg, null, now);
    if (job) {
      queued++;
      await writeAudit(db, { orgId: environment.orgId, action: "backup.prune", entityType: "environment", entityId: environment.id, metadata: { jobId: job.id, count, source: "schedule" } });
    }
  }
  return queued;
}
