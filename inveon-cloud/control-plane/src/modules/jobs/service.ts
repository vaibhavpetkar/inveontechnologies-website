import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { envVars, environmentReplicas, environments, apps, jobSteps, jobs, releases } from "../../db/schema.js";
import { bus, jobEvent, serverJobsEvent, type JobStreamEvent } from "../../lib/bus.js";
import { decryptValue } from "../../lib/crypto.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { validateCompose } from "../../lib/compose-validate.js";
import { deployKeyAad, registryAad } from "../../lib/aad.js";
import { cloneTokenFor } from "../github/service.js";

export type JobStatus = "pending" | "running" | "success" | "failure" | "cancelled";
export const TERMINAL: JobStatus[] = ["success", "failure", "cancelled"];

export interface StepInput {
  name: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface CreateJobInput {
  orgId: string;
  serverId: string;
  environmentId?: string | null;
  type: string;
  title: string;
  createdBy?: string | null;
  meta?: Record<string, unknown>;
  steps: StepInput[];
}

type Job = typeof jobs.$inferSelect;
type Step = typeof jobSteps.$inferSelect;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const MAX_LOG_BYTES = 1024 * 1024;

export function publicStep(s: Step) {
  return { id: s.id, jobId: s.jobId, position: s.position, name: s.name, action: s.action, status: s.status, result: s.result, startedAt: s.startedAt, finishedAt: s.finishedAt };
}

function emit(jobId: string, event: JobStreamEvent) {
  bus.emit(jobEvent(jobId), event);
}

export async function createJob(db: Database | Tx, input: CreateJobInput): Promise<Job> {
  const [job] = await db
    .insert(jobs)
    .values({
      orgId: input.orgId,
      serverId: input.serverId,
      environmentId: input.environmentId ?? null,
      type: input.type,
      title: input.title,
      createdBy: input.createdBy ?? null,
      meta: input.meta ?? {},
    })
    .returning();
  if (input.steps.length) {
    await db.insert(jobSteps).values(input.steps.map((s, i) => ({ jobId: job.id, position: i, name: s.name, action: s.action, params: s.params ?? {} })));
  }
  return job;
}

/** Call after the creating transaction commits, to wake the server's agent. */
export function notifyServer(serverId: string) {
  bus.emit(serverJobsEvent(serverId));
}

export async function getJob(db: Database, jobId: string, orgId?: string) {
  const job = await db.query.jobs.findFirst({ where: orgId ? and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)) : eq(jobs.id, jobId) });
  if (!job) throw new NotFoundError("Job not found");
  const steps = await db.select().from(jobSteps).where(eq(jobSteps.jobId, job.id)).orderBy(asc(jobSteps.position));
  return { job, steps };
}

/** Live log streams: long-running, never stored, and claimed on their own lane. */
export const STREAM_JOB_TYPES = ["logs_follow"];
export type Lane = "main" | "stream";

/**
 * Atomically claims the oldest pending job for this server (skip-locked, so
 * two pollers never get the same job). The agent polls two lanes: "stream"
 * gets only live log streams, so a 10-minute `logs -f` never holds up a
 * deploy; "main" gets everything else, one job at a time.
 */
export async function claimNextJob(db: Database, serverId: string, lane: Lane = "main"): Promise<Job | null> {
  const types = sql.join(STREAM_JOB_TYPES.map((t) => sql`${t}`), sql`, `);
  const laneFilter = lane === "stream" ? sql`AND type IN (${types})` : sql`AND type NOT IN (${types})`;
  const result = await db.execute(sql`
    UPDATE jobs SET status = 'running', claimed_at = now()
    WHERE id = (
      SELECT id FROM jobs WHERE server_id = ${serverId} AND status = 'pending' ${laneFilter}
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id`);
  const id = (result.rows[0] as { id?: string } | undefined)?.id;
  if (!id) return null;
  const job = (await db.query.jobs.findFirst({ where: eq(jobs.id, id) })) ?? null;
  if (job) emit(job.id, { type: "job", job: job as unknown as Record<string, unknown> });
  return job;
}

/**
 * What the agent receives. Secrets and compose content are resolved here, at
 * claim time, and only for the server that owns the job; they are never
 * stored in job_steps.params.
 */
export async function buildAgentPayload(db: Database, job: Job, steps: Step[]) {
  const out = [];
  for (const s of steps) {
    const params: Record<string, unknown> = { ...s.params };
    if (s.action === "image.build" || (s.action === "compose.pull" && params.environmentId)) {
      const { app } = await ownedEnvironment(db, job, String(params.environmentId));
      params.registryAuth = registryAuthFor(app);
      if (s.action === "image.build") params.gitAuth = await gitAuthFor(db, app);
    }
    if (s.action === "release.prepare") {
      const release = await db.query.releases.findFirst({ where: eq(releases.id, String(params.releaseId)) });
      const environment = await db.query.environments.findFirst({ where: eq(environments.id, String(params.environmentId)) });
      if (!release || !environment || !(await runsOn(db, environment, job.serverId))) throw new AppError("BAD_JOB", "Release or environment missing", 409);
      const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
      params.composeContent = release.composeContent;
      params.env = await decryptEnvironmentVars(db, environment.id);
      params.imageRegistry = app?.imageRegistry ?? null;
    }
    out.push({ id: s.id, position: s.position, name: s.name, action: s.action, params });
  }
  return { id: job.id, type: job.type, title: job.title, steps: out };
}

/** The environment runs on this server: its primary, or one of its replicas. */
async function runsOn(db: Database, environment: typeof environments.$inferSelect, serverId: string) {
  if (environment.serverId === serverId) return true;
  const replica = await db.query.environmentReplicas.findFirst({
    where: and(eq(environmentReplicas.environmentId, environment.id), eq(environmentReplicas.serverId, serverId)),
    columns: { serverId: true },
  });
  return !!replica;
}

async function ownedEnvironment(db: Database, job: Job, environmentId: string) {
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, environmentId) });
  if (!environment || !(await runsOn(db, environment, job.serverId))) throw new AppError("BAD_JOB", "Environment missing", 409);
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  if (!app) throw new AppError("BAD_JOB", "App missing", 409);
  return { environment, app };
}

/** The app's registry login, decrypted for this job only. */
function registryAuthFor(app: typeof apps.$inferSelect) {
  if (!app.registryServer || !app.registryUsername || !app.registryPasswordEnc) return null;
  return { server: app.registryServer, username: app.registryUsername, password: decryptValue(app.registryPasswordEnc, registryAad(app.id)) };
}

/**
 * How the agent clones the repo, decided when the server claims the job:
 * a GitHub App installation token (one hour, this repo only, contents read)
 * when the repo's owner has the App installed and linked; else the app's
 * deploy key; else anonymously. The control plane's long-lived
 * INVEON_GITHUB_TOKEN is never sent to servers.
 */
async function gitAuthFor(db: Database, app: typeof apps.$inferSelect) {
  const token = await cloneTokenFor(db, app);
  if (token) return { type: "token", token };
  if (app.deployKeyEnc) return { type: "deploy_key", privateKey: decryptValue(app.deployKeyEnc, deployKeyAad(app.id)) };
  return null;
}

export async function decryptEnvironmentVars(db: Database, environmentId: string): Promise<Record<string, string>> {
  const rows = await db.select().from(envVars).where(eq(envVars.environmentId, environmentId));
  const env: Record<string, string> = {};
  for (const r of rows) env[r.key] = decryptValue(r.valueEnc, envVarAad(environmentId, r.key));
  return env;
}

export const envVarAad = (environmentId: string, key: string) => `env:${environmentId}:${key}`;

/** Loads a job only if it belongs to this server and is running. */
async function ownedRunningJob(db: Database, serverId: string, jobId: string) {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  // Same 404 for "not yours" and "doesn't exist": an agent learns nothing about other servers.
  if (!job || job.serverId !== serverId) throw new NotFoundError("Job not found");
  if (job.status !== "running") throw new ConflictError(`Job is ${job.status}`);
  return job;
}

export interface StepReport {
  status?: "running" | "success" | "failure";
  append?: string;
  result?: Record<string, unknown>;
}

export async function reportStep(db: Database, serverId: string, jobId: string, stepId: string, report: StepReport) {
  const job = await ownedRunningJob(db, serverId, jobId);
  const step = await db.query.jobSteps.findFirst({ where: and(eq(jobSteps.id, stepId), eq(jobSteps.jobId, jobId)) });
  if (!step) throw new NotFoundError("Step not found");
  if (TERMINAL.includes(step.status)) throw new ConflictError(`Step is already ${step.status}`);

  // The control plane re-checks the resolved compose model itself, so an
  // outdated or modified agent can't wave an unsafe file through.
  if (step.action === "compose.validate" && report.status === "success") {
    const verdict = checkReportedCompose(step, report.result);
    report = { ...report, result: verdict.result };
    if (!verdict.ok) {
      report.status = "failure";
      report.append = (report.append ?? "") + `\nControl plane rejected the compose file:\n${verdict.errors.map((e) => `  - ${e}`).join("\n")}\n`;
    }
  }

  const set: Partial<Step> = {};
  if (report.append && STREAM_JOB_TYPES.includes(job.type)) {
    // Live container logs are relayed to whoever is watching, never stored.
    emit(jobId, { type: "log", stepId, chunk: report.append });
  } else if (report.append) {
    const room = MAX_LOG_BYTES - Buffer.byteLength(step.log);
    if (room > 0) {
      const chunk = report.append.length > room ? report.append.slice(0, room) + "\n[log truncated]\n" : report.append;
      await db.execute(sql`UPDATE job_steps SET log = log || ${chunk} WHERE id = ${stepId}`);
      emit(jobId, { type: "log", stepId, chunk });
    }
  }
  if (report.status === "running" && step.status === "pending") {
    set.status = "running";
    set.startedAt = new Date();
  } else if (report.status === "success" || report.status === "failure") {
    set.status = report.status;
    set.finishedAt = new Date();
    if (!step.startedAt) set.startedAt = new Date();
  }
  if (report.result) set.result = report.result;
  if (Object.keys(set).length) {
    const [updated] = await db.update(jobSteps).set(set).where(eq(jobSteps.id, stepId)).returning();
    emit(jobId, { type: "step", step: publicStep(updated) });
  }
}

function checkReportedCompose(step: Step, result: Record<string, unknown> | undefined) {
  const slug = String(step.params.slug ?? "");
  const appRoot = typeof result?.appRoot === "string" ? result.appRoot : "";
  const model = result?.model;
  if (!appRoot.startsWith("/") || !appRoot.replace(/\/+$/, "").endsWith(`/${slug}`)) {
    return { ok: false, errors: ["Agent did not report the app folder for this environment"], result: { ok: false } };
  }
  if (model === undefined) return { ok: false, errors: ["Agent did not report the resolved compose model"], result: { ok: false } };
  const verdict = validateCompose(model, { appRoot });
  const services = model && typeof model === "object" && "services" in model ? Object.keys((model as { services: object }).services ?? {}) : [];
  // Store a summary, not the whole model (it can include env values).
  return { ok: verdict.ok, errors: verdict.errors, result: { ok: verdict.ok, errors: verdict.errors, services } };
}

type Effect = (db: Database, job: Job, steps: Step[]) => Promise<void>;
const effects = new Map<string, Effect>();

/** Modules register what happens when their job type finishes (deploy -> switch release, etc.). */
export function registerJobEffect(type: string, fn: Effect) {
  effects.set(type, fn);
}

/**
 * The agent says it is done. Its word is not trusted: the job only succeeds
 * if every step was reported successful; anything else is a failure.
 */
export async function finishJob(db: Database, serverId: string, jobId: string, reported: { status: "success" | "failure"; error?: string }) {
  await ownedRunningJob(db, serverId, jobId);
  const steps = await db.select().from(jobSteps).where(eq(jobSteps.jobId, jobId)).orderBy(asc(jobSteps.position));
  const allOk = steps.every((s) => s.status === "success");
  const status: JobStatus = reported.status === "success" && allOk ? "success" : "failure";
  const error = status === "failure" ? (reported.error?.slice(0, 2000) ?? (allOk ? "Agent reported failure" : "Not every step succeeded")) : null;
  return completeJob(db, jobId, status, error);
}

export async function completeJob(db: Database, jobId: string, status: JobStatus, error: string | null) {
  const [job] = await db
    .update(jobs)
    .set({ status, error, finishedAt: new Date() })
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, ["pending", "running"])))
    .returning();
  if (!job) return null;
  // Steps that never ran are cancelled.
  await db
    .update(jobSteps)
    .set({ status: status === "success" ? "success" : "cancelled", finishedAt: new Date() })
    .where(and(eq(jobSteps.jobId, jobId), inArray(jobSteps.status, ["pending", "running"])));
  const steps = await db.select().from(jobSteps).where(eq(jobSteps.jobId, jobId)).orderBy(asc(jobSteps.position));
  const effect = effects.get(job.type);
  if (effect) {
    try {
      await effect(db, job, steps);
    } catch (err) {
      logger.error({ err, jobId }, "Job effect failed");
    }
  }
  for (const s of steps) emit(jobId, { type: "step", step: publicStep(s) });
  emit(jobId, { type: "job", job: job as unknown as Record<string, unknown> });
  return job;
}

export async function cancelJob(db: Database, jobId: string) {
  return completeJob(db, jobId, "cancelled", "Cancelled");
}

/** Scheduler: jobs stuck running (agent died mid-job) are failed. */
export async function failStaleJobs(db: Database, timeoutMin: number) {
  const stale = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, "running"), lt(jobs.claimedAt, new Date(Date.now() - timeoutMin * 60000))));
  for (const j of stale) await completeJob(db, j.id, "failure", `Timed out after ${timeoutMin} minutes`);
  return stale.length;
}
