import { and, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, environments, jobs } from "../../db/schema.js";
import { bus, jobEvent } from "../../lib/bus.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { completeJob, createJob, notifyServer, TERMINAL, type JobStatus } from "../jobs/service.js";

/**
 * Live logs (`docker compose logs -f`). A follow is a job of type
 * logs_follow with one compose.logs_follow step. The agent runs it on its
 * stream lane and reports output every second; the control plane relays the
 * chunks to the viewer's SSE stream and stores none of it. The job is
 * cancelled when the last viewer disconnects, and the agent stops docker as
 * soon as it notices (within a few seconds). It never runs longer than
 * LOG_FOLLOW_MAX_SEC.
 */
export const LOG_FOLLOW_MAX_SEC = 600;
/** Live streams per server at once (the agent runs at most this many too). */
export const MAX_FOLLOWS_PER_SERVER = 4;
/** A follow nobody is watching, or that no agent picked up, is ended after this. */
const PICKUP_GRACE_MS = 30_000;
/** A viewer that reconnects within this keeps the stream alive. */
const DISCONNECT_GRACE_MS = 3_000;

type Environment = typeof environments.$inferSelect;
type App = typeof apps.$inferSelect;

export async function startLogFollow(
  db: Database,
  input: { environment: Environment; app: App; service: string; tail: number; durationSec: number; userId: string },
) {
  const { environment, app } = input;
  if (!environment.activeSlot) throw new AppError("NOT_DEPLOYED", "Deploy this environment first", 400);
  const active = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.serverId, environment.serverId), eq(jobs.type, "logs_follow"), inArray(jobs.status, ["pending", "running"])));
  if (active.length >= MAX_FOLLOWS_PER_SERVER) {
    throw new AppError("TOO_MANY_STREAMS", `This server already has ${MAX_FOLLOWS_PER_SERVER} live log streams open. Close one and try again.`, 429);
  }
  const job = await createJob(db, {
    orgId: environment.orgId,
    serverId: environment.serverId,
    environmentId: environment.id,
    type: "logs_follow",
    title: `Live logs: ${app.name} / ${environment.name} (${input.service})`,
    createdBy: input.userId,
    meta: { durationSec: input.durationSec },
    steps: [
      {
        name: `Follow ${input.service}`,
        action: "compose.logs_follow",
        params: { slug: environment.slug, slot: environment.activeSlot, composePath: app.composePath, service: input.service, tail: input.tail, durationSec: input.durationSec },
      },
    ],
  });
  notifyServer(environment.serverId);
  setTimeout(() => void checkFollow(db, job.id, true).catch((err) => logger.warn({ err, jobId: job.id }, "Log stream check failed")), PICKUP_GRACE_MS).unref();
  return job;
}

const viewers = (jobId: string) => bus.listenerCount(jobEvent(jobId));

/** Ends a follow that has no viewer (or, at pickup time, that no agent claimed). */
async function checkFollow(db: Database, jobId: string, pickup: boolean) {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job || job.type !== "logs_follow" || TERMINAL.includes(job.status as JobStatus)) return;
  if (pickup && job.status === "pending") {
    await completeJob(db, job.id, "failure", "The server's agent did not pick up the log stream. Check that the server is online and its agent is up to date.");
    return;
  }
  if (viewers(jobId) === 0) await completeJob(db, job.id, "cancelled", "Stopped: nobody is watching");
}

/** Called when an SSE viewer of a job disconnects. */
export function viewerLeft(db: Database, job: { id: string; type: string }) {
  if (job.type !== "logs_follow") return;
  setTimeout(() => void checkFollow(db, job.id, false).catch((err) => logger.warn({ err, jobId: job.id }, "Log stream check failed")), DISCONNECT_GRACE_MS).unref();
}

/** Scheduler: follows past their time limit (for example after a control-plane restart). */
export async function expireLogFollows(db: Database, now = new Date()) {
  const stale = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, "logs_follow"), inArray(jobs.status, ["pending", "running"]), lt(jobs.createdAt, new Date(now.getTime() - (LOG_FOLLOW_MAX_SEC + 60) * 1000))));
  for (const j of stale) await completeJob(db, j.id, "cancelled", "Stopped: time limit");
  return stale.length;
}
