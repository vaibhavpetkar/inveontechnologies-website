import { sql } from "drizzle-orm";
import type { Database } from "./db/client.js";
import { jobs } from "./db/schema.js";
import { logger } from "./logger.js";

/**
 * A small job queue on top of the `jobs` table — enough for email retries
 * and periodic reminders without adding Redis or another service to the
 * compose stack.
 *
 * - enqueueJob() inserts a row; the worker picks it up within a couple of
 *   seconds (or at `runAt`).
 * - Claiming uses FOR UPDATE SKIP LOCKED, so two backend processes never
 *   run the same job.
 * - A failed job is retried with exponential backoff up to maxAttempts,
 *   then left as "failed" with its last error (visible in
 *   GET /reports/email-jobs for email).
 * - A job stuck in "running" (process died mid-job) is put back after
 *   STALE_AFTER_MS.
 * - Periodic work (reminders) is registered with every(); it runs in-process
 *   on a timer. The work itself must be idempotent — reminders dedupe
 *   through notifications.dedupeKey — so overlapping runs are harmless.
 */

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, Handler>();
const periodic: { name: string; everyMs: number; run: () => Promise<void> }[] = [];

const POLL_MS = 2000;
const BATCH = 10;
const STALE_AFTER_MS = 10 * 60 * 1000;

export function registerJobHandler(type: string, handler: Handler) {
  handlers.set(type, handler);
}

export function every(name: string, everyMs: number, run: () => Promise<void>) {
  periodic.push({ name, everyMs, run });
}

export async function enqueueJob(db: Database, type: string, payload: Record<string, unknown>, options: { runAt?: Date; maxAttempts?: number } = {}) {
  const [job] = await db.insert(jobs).values({ type, payload, runAt: options.runAt, maxAttempts: options.maxAttempts }).returning({ id: jobs.id });
  return job;
}

/** Backoff: 30s, 2m, 8m, 32m, … capped at 6h. */
export function retryDelayMs(attempts: number) {
  return Math.min(30_000 * 4 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

type ClaimedJob = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

/** Claims and runs one batch of due jobs; returns how many it ran. Exported for tests. */
export async function runDueJobs(db: Database): Promise<number> {
  await db.execute(sql`
    UPDATE jobs SET status = 'pending', locked_at = NULL
    WHERE status = 'running' AND locked_at < now() - make_interval(secs => ${STALE_AFTER_MS / 1000})
  `);

  const claimed = await db.execute<ClaimedJob>(sql`
    UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'pending' AND run_at <= now()
      ORDER BY run_at
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, max_attempts
  `);

  for (const job of claimed.rows) {
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      await handler(job.payload);
      await db.execute(sql`UPDATE jobs SET status = 'done', finished_at = now(), locked_at = NULL, last_error = NULL WHERE id = ${job.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const giveUp = job.attempts >= job.max_attempts;
      logger.warn({ jobId: job.id, type: job.type, attempts: job.attempts, err: message }, giveUp ? "Job failed permanently" : "Job failed, will retry");
      if (giveUp) {
        await db.execute(sql`UPDATE jobs SET status = 'failed', finished_at = now(), locked_at = NULL, last_error = ${message} WHERE id = ${job.id}`);
      } else {
        const runAt = new Date(Date.now() + retryDelayMs(job.attempts));
        await db.execute(sql`UPDATE jobs SET status = 'pending', locked_at = NULL, last_error = ${message}, run_at = ${runAt} WHERE id = ${job.id}`);
      }
    }
  }
  return claimed.rows.length;
}

/** Starts the poll loop and the periodic timers. Returns a stop function. */
export function startJobWorker(db: Database): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      // Drain quickly when there's a backlog, otherwise wait for the next poll.
      while (!stopped && (await runDueJobs(db)) === BATCH);
    } catch (err) {
      logger.error({ err }, "Job worker poll failed");
    }
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  };
  timer = setTimeout(tick, POLL_MS);

  const intervals = periodic.map((p) => {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await p.run();
      } catch (err) {
        logger.error({ err, task: p.name }, "Periodic task failed");
      } finally {
        running = false;
      }
    };
    // First run shortly after startup, then on the interval.
    const first = setTimeout(run, 15_000);
    const interval = setInterval(run, p.everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  });

  logger.info({ handlers: [...handlers.keys()], periodic: periodic.map((p) => p.name) }, "Job worker started");
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    intervals.forEach((stop) => stop());
  };
}
