import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, backupConfigs, backups, environments, jobs } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit, writeAudit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { loadEnvironment } from "../apps/routes.js";
import { createJob, notifyServer, registerJobEffect, type StepInput, type Tx } from "../jobs/service.js";
import { dashboardLink, emitAlert } from "../alerts/service.js";
import { pruneEnvironmentBackups } from "./retention.js";

type Environment = typeof environments.$inferSelect;
type App = typeof apps.$inferSelect;
type Config = typeof backupConfigs.$inferSelect;
type Backup = typeof backups.$inferSelect;

const SAFE_NAME = /^[A-Za-z0-9._-]{1,63}$/;
const REL_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}$/;

const configSchema = z
  .object({
    enabled: z.boolean(),
    hourUtc: z.number().int().min(0).max(23),
    dbType: z.enum(["none", "postgres", "mysql"]),
    dbService: z.string().regex(SAFE_NAME).nullable().optional(),
    dbName: z.string().regex(SAFE_NAME).nullable().optional(),
    dbUser: z.string().regex(SAFE_NAME).nullable().optional(),
    volumePaths: z.array(z.string().regex(REL_PATH, "Paths are relative to the environment's data folder, without ..")).max(20),
    s3Bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "Invalid S3 bucket name").nullable().optional(),
    s3Prefix: z.string().regex(/^[A-Za-z0-9._\/-]{0,200}$/).transform((p) => p.replace(/^\/+|\/+$/g, "")),
    s3Region: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "Invalid AWS region"),
    // Retention (omit to leave unchanged; null keeps every backup).
    keepDaily: z.number().int().min(1).max(366).nullable().optional(),
    keepWeekly: z.number().int().min(0).max(260).optional(),
  })
  .refine((c) => !c.keepWeekly || c.keepDaily !== null, { message: "Weekly backups are kept on top of daily ones: set how many daily backups to keep", path: ["keepDaily"] })
  .refine((c) => c.dbType === "none" || (c.dbService && c.dbName && c.dbUser), { message: "Database backups need the compose service, database name and user", path: ["dbService"] })
  .refine((c) => !c.enabled || !!c.s3Bucket, { message: "Set an S3 bucket to enable backups", path: ["s3Bucket"] });

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

export function backupParams(environment: Environment, app: App, cfg: Config, backup: Backup) {
  return {
    slug: environment.slug,
    slot: environment.activeSlot,
    composePath: app.composePath,
    db: cfg.dbType === "none" ? null : { type: cfg.dbType, service: cfg.dbService, name: cfg.dbName, user: cfg.dbUser },
    volumes: cfg.volumePaths,
    bucket: backup.s3Bucket,
    region: backup.s3Region,
    key: backup.s3Key,
  };
}

export async function newBackupRow(db: Database | Tx, environment: Environment, cfg: Config, kind: Backup["kind"], userId: string | null) {
  if (!cfg.s3Bucket) throw new AppError("NO_BUCKET", "Configure an S3 bucket for backups first", 400);
  const id = crypto.randomUUID();
  const key = [cfg.s3Prefix, environment.slug, `${stamp()}-${kind}-${id.slice(0, 8)}.tar.gz`].filter(Boolean).join("/");
  const [row] = await db.insert(backups).values({ id, environmentId: environment.id, kind, s3Bucket: cfg.s3Bucket, s3Region: cfg.s3Region, s3Key: key, createdBy: userId }).returning();
  return row;
}

async function ensureIdle(db: Database, environmentId: string) {
  const busy = await db.query.jobs.findFirst({ where: and(eq(jobs.environmentId, environmentId), inArray(jobs.type, ["backup", "restore"]), inArray(jobs.status, ["pending", "running"])) });
  if (busy) throw new ConflictError("A backup or restore is already running for this environment");
}

export async function createBackupJob(db: Database, environment: Environment, app: App, cfg: Config, kind: "scheduled" | "manual", userId: string | null) {
  if (!environment.activeSlot) throw new AppError("NOT_DEPLOYED", "Deploy this environment first", 400);
  await ensureIdle(db, environment.id);
  const backup = await newBackupRow(db, environment, cfg, kind, userId);
  const job = await createJob(db, {
    orgId: environment.orgId,
    serverId: environment.serverId,
    environmentId: environment.id,
    type: "backup",
    title: `Backup ${app.name} / ${environment.name}`,
    createdBy: userId,
    meta: { backupIds: [backup.id] },
    steps: [{ name: "Back up to S3", action: "backup.create", params: backupParams(environment, app, cfg, backup) }],
  });
  await db.update(backups).set({ jobId: job.id }).where(eq(backups.id, backup.id));
  notifyServer(environment.serverId);
  return { job, backup };
}

export function backupsRouter(db: Database) {
  const router = Router({ mergeParams: true });

  router.get("/environments/:envId/backup-config", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    res.json({ backupConfig: (await db.query.backupConfigs.findFirst({ where: eq(backupConfigs.environmentId, environment.id) })) ?? null });
  });

  router.put("/environments/:envId/backup-config", requireRole("admin"), async (req, res) => {
    const body = configSchema.parse(req.body);
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const values = { ...body, dbService: body.dbService ?? null, dbName: body.dbName ?? null, dbUser: body.dbUser ?? null, s3Bucket: body.s3Bucket ?? null, updatedAt: new Date() };
    const [row] = await db
      .insert(backupConfigs)
      .values({ environmentId: environment.id, ...values })
      .onConflictDoUpdate({ target: backupConfigs.environmentId, set: values })
      .returning();
    await audit(db, req, "backup.configure", "environment", environment.id, body);
    res.json({ backupConfig: row });
  });

  router.get("/environments/:envId/backups", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const rows = await db.select().from(backups).where(eq(backups.environmentId, environment.id)).orderBy(desc(backups.createdAt)).limit(100);
    res.json({ backups: rows });
  });

  // Applies the retention rule now instead of waiting for the daily run.
  router.post("/environments/:envId/backups/prune", requireRole("admin"), async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const cfg = await db.query.backupConfigs.findFirst({ where: eq(backupConfigs.environmentId, environment.id) });
    if (!cfg || cfg.keepDaily === null) throw new AppError("NO_RETENTION", "Set how many backups to keep first", 400);
    const { job, count } = await pruneEnvironmentBackups(db, environment, cfg, req.user!.sub);
    if (job) await audit(db, req, "backup.prune", "environment", environment.id, { jobId: job.id, count, source: "manual" });
    res.status(job ? 201 : 200).json({ job, count });
  });

  router.post("/environments/:envId/backups", requireRole("developer"), async (req, res) => {
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const cfg = await db.query.backupConfigs.findFirst({ where: eq(backupConfigs.environmentId, environment.id) });
    if (!cfg) throw new NotFoundError("Backups are not configured");
    const { job, backup } = await createBackupJob(db, environment, app, cfg, "manual", req.user!.sub);
    await audit(db, req, "backup.create", "backup", backup.id, { jobId: job.id });
    res.status(201).json({ job, backup });
  });

  // Restore always takes a fresh backup first, in the same job.
  router.post("/backups/:id/restore", requireRole("admin"), async (req, res) => {
    const source = await db.query.backups.findFirst({ where: eq(backups.id, req.params.id) });
    if (!source) throw new NotFoundError("Backup not found");
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, source.environmentId);
    if (source.status !== "success") throw new AppError("BACKUP_NOT_READY", "Only successful backups can be restored", 400);
    if (!environment.activeSlot) throw new AppError("NOT_DEPLOYED", "Deploy this environment first", 400);
    const cfg = await db.query.backupConfigs.findFirst({ where: eq(backupConfigs.environmentId, environment.id) });
    if (!cfg) throw new NotFoundError("Backups are not configured");
    await ensureIdle(db, environment.id);
    const safety = await newBackupRow(db, environment, cfg, "pre_restore", req.user!.sub);
    const restoreParams = { ...backupParams(environment, app, cfg, source), bucket: source.s3Bucket, region: source.s3Region, key: source.s3Key };
    const steps: StepInput[] = [
      { name: "Back up current state first", action: "backup.create", params: backupParams(environment, app, cfg, safety) },
      { name: `Restore ${source.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, action: "backup.restore", params: restoreParams },
    ];
    const job = await createJob(db, {
      orgId: environment.orgId,
      serverId: environment.serverId,
      environmentId: environment.id,
      type: "restore",
      title: `Restore ${app.name} / ${environment.name}`,
      createdBy: req.user!.sub,
      meta: { backupIds: [safety.id], restoredBackupId: source.id },
      steps,
    });
    await db.update(backups).set({ jobId: job.id }).where(eq(backups.id, safety.id));
    notifyServer(environment.serverId);
    await audit(db, req, "backup.restore", "backup", source.id, { jobId: job.id, safetyBackupId: safety.id });
    res.status(201).json({ job, safetyBackup: safety });
  });

  return router;
}

type StepRow = { action: string; status: string; result: Record<string, unknown> | null };

/** A backup is only as good as its backup.create step. A step that never ran is "cancelled". */
export async function recordBackupStep(db: Database, backupId: string, step: StepRow) {
  const size = typeof step.result?.sizeBytes === "number" && step.result.sizeBytes >= 0 ? step.result.sizeBytes : null;
  const status = step.status === "success" ? "success" : step.status === "cancelled" ? "cancelled" : "failure";
  const [row] = await db.update(backups).set({ status, sizeBytes: size, finishedAt: new Date() }).where(eq(backups.id, backupId)).returning();
  if (row && status === "failure") await alertBackupFailed(db, row);
}

async function alertBackupFailed(db: Database, backup: Backup) {
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, backup.environmentId) });
  const app = environment ? await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) }) : null;
  if (!environment || !app) return;
  const job = backup.jobId ? await db.query.jobs.findFirst({ where: eq(jobs.id, backup.jobId), columns: { error: true } }) : null;
  const label = `${app.name} / ${environment.name}`;
  await emitAlert(db, environment.orgId, "backup.failed", {
    title: `Backup failed: ${label}`,
    text: `The ${backup.kind.replace("_", " ")} backup of ${label} failed.${job?.error ? `\n${job.error.slice(0, 500)}` : ""}`,
    severity: "critical",
    url: dashboardLink(`/apps/${app.id}?env=${environment.id}`),
    details: { app: app.name, environment: environment.name, kind: backup.kind, key: backup.s3Key },
  });
}

async function onBackupJobFinished(db: Database, job: typeof jobs.$inferSelect, steps: StepRow[]) {
  const ids = Array.isArray(job.meta.backupIds) ? (job.meta.backupIds as string[]) : [];
  const step = steps.find((s) => s.action === "backup.create");
  if (!ids.length || !step) return;
  await recordBackupStep(db, ids[0], step);
}

/** Backups only make sense once there is a bucket and something to back up. */
export function backupConfigured(cfg: Config | null | undefined): cfg is Config {
  return !!cfg?.s3Bucket && (cfg.dbType !== "none" || cfg.volumePaths.length > 0);
}

registerJobEffect("backup", onBackupJobFinished);
registerJobEffect("restore", onBackupJobFinished);

/** Nightly: environments whose backup hour has come and that haven't been backed up today (UTC). */
export async function queueNightlyBackups(db: Database, now = new Date()) {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await db
    .select({ cfg: backupConfigs, environment: environments, app: apps })
    .from(backupConfigs)
    .innerJoin(environments, eq(environments.id, backupConfigs.environmentId))
    .innerJoin(apps, eq(apps.id, environments.appId))
    .where(
      and(
        eq(backupConfigs.enabled, true),
        sql`${backupConfigs.hourUtc} <= ${now.getUTCHours()}`,
        or(isNull(backupConfigs.lastScheduledAt), lt(backupConfigs.lastScheduledAt, todayStart)),
      ),
    );
  let queued = 0;
  for (const { cfg, environment, app } of due) {
    await db.update(backupConfigs).set({ lastScheduledAt: now }).where(eq(backupConfigs.environmentId, cfg.environmentId));
    try {
      const { job, backup } = await createBackupJob(db, environment, app, cfg, "scheduled", null);
      await writeAudit(db, { orgId: environment.orgId, action: "backup.scheduled", entityType: "backup", entityId: backup.id, metadata: { jobId: job.id } });
      queued++;
    } catch {
      // Not deployed yet or already running: try again tomorrow.
    }
  }
  return queued;
}
