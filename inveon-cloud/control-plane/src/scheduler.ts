import { sql } from "drizzle-orm";
import type { Database } from "./db/client.js";
import type { Env } from "./env.js";
import { logger } from "./lib/logger.js";
import { markOfflineServers } from "./modules/agent/routes.js";
import { failStaleJobs } from "./modules/jobs/service.js";
import { runDueChecks } from "./modules/health/service.js";
import { queueRenewals } from "./modules/domains/routes.js";
import { queueNightlyBackups } from "./modules/backups/routes.js";
import { expireLogFollows } from "./modules/live-logs/service.js";

/**
 * In-process scheduler. Every tick: heartbeat timeouts, stale jobs and due
 * health checks. Once a day: certificate renewals. Nightly backups run when
 * each environment's configured UTC hour arrives. One control-plane
 * instance is assumed; the daily run is recorded in scheduler_runs so a
 * restart doesn't repeat it.
 */
export async function claimDaily(db: Database, name: string, now = new Date()) {
  const result = await db.execute(sql`
    INSERT INTO scheduler_runs (name, key, last_run_at) VALUES (${name}, 'global', ${now})
    ON CONFLICT (name, key) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
    WHERE scheduler_runs.last_run_at < ${new Date(now.getTime() - 23.5 * 3600 * 1000)}
    RETURNING name`);
  return result.rows.length > 0;
}

export async function tick(db: Database, env: Env) {
  const tasks: [string, () => Promise<unknown>][] = [
    ["offline servers", () => markOfflineServers(db, env.INVEON_HEARTBEAT_TIMEOUT_SEC)],
    ["stale jobs", () => failStaleJobs(db, env.INVEON_JOB_TIMEOUT_MIN)],
    ["live log time limits", () => expireLogFollows(db)],
    ["health checks", () => runDueChecks(db, env.INVEON_PUBLIC_URL)],
    ["nightly backups", () => queueNightlyBackups(db)],
    ["certificate renewals", async () => ((await claimDaily(db, "cert_renew")) ? queueRenewals(db) : 0)],
  ];
  for (const [name, fn] of tasks) {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, task: name }, "Scheduler task failed");
    }
  }
}

export function startScheduler(db: Database, env: Env) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(db, env);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, env.INVEON_SCHEDULER_TICK_SEC * 1000);
  timer.unref();
  setTimeout(run, 5000).unref();
  return () => clearInterval(timer);
}
