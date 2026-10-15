import { sql } from "drizzle-orm";
import type { Database } from "./db/client.js";
import type { Env } from "./env.js";
import { logger } from "./lib/logger.js";
import { markOfflineServers, pruneAgentNonces } from "./modules/agent/routes.js";
import { failStaleJobs } from "./modules/jobs/service.js";
import { runDueChecks } from "./modules/health/service.js";
import { alertExpiringCertificates, queueRenewals } from "./modules/domains/routes.js";
import { processDueDeliveries, pruneDeliveries } from "./modules/alerts/service.js";
import { queueNightlyBackups } from "./modules/backups/routes.js";
import { pruneAllBackups } from "./modules/backups/retention.js";
import { archiveAllReleases } from "./modules/deploys/archive.js";
import { deployQueuedReleases } from "./modules/deploys/maintenance.js";
import { expireLogFollows } from "./modules/live-logs/service.js";
import { pollAwsServers } from "./modules/aws/service.js";
import { rollupMetrics } from "./modules/metrics/service.js";
import { evaluateMetricAlerts, pruneIncidents } from "./modules/metrics/alerts.js";

/**
 * In-process scheduler. Every tick: heartbeat timeouts, metric threshold
 * alerts, stale jobs and due health checks. Once a day: certificate
 * renewals, and metrics older than 24 hours rolled up into 5-minute buckets. Nightly backups run when
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
    ["metric threshold alerts", () => evaluateMetricAlerts(db, env.INVEON_HEARTBEAT_TIMEOUT_SEC)],
    ["EC2 servers being launched or terminated", () => pollAwsServers(db)],
    ["agent request nonces", () => pruneAgentNonces(db)],
    ["stale jobs", () => failStaleJobs(db, env.INVEON_JOB_TIMEOUT_MIN)],
    ["live log time limits", () => expireLogFollows(db)],
    ["health checks", () => runDueChecks(db, env.INVEON_PUBLIC_URL)],
    ["nightly backups", () => queueNightlyBackups(db)],
    ["deploys waiting for a maintenance window", () => deployQueuedReleases(db)],
    ["backup retention", async () => ((await claimDaily(db, "backup_prune")) ? pruneAllBackups(db) : 0)],
    ["release archiving", async () => ((await claimDaily(db, "release_archive")) ? archiveAllReleases(db) : 0)],
    ["certificate renewals", async () => ((await claimDaily(db, "cert_renew")) ? queueRenewals(db) : 0)],
    ["certificate expiry alerts", async () => ((await claimDaily(db, "cert_expiry_alerts")) ? alertExpiringCertificates(db) : 0)],
    ["alert retries", () => processDueDeliveries(db)],
    ["alert log clean-up", async () => ((await claimDaily(db, "alert_delivery_prune")) ? pruneDeliveries(db) : 0)],
    ["metrics rollup and retention", async () => ((await claimDaily(db, "metrics_rollup")) ? (await rollupMetrics(db), await pruneIncidents(db)) : 0)],
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
