import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, environments, releases } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { ConflictError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { describeWindow, windowState } from "../../lib/maintenance.js";
import { createDeployment } from "./service.js";

type Environment = typeof environments.$inferSelect;

/**
 * Maintenance windows. A push (webhook) outside the environment's windows
 * doesn't deploy: the release is queued on the environment (a newer push
 * replaces it) and the scheduler deploys it when the next window opens.
 * Manual deploys and rollbacks still run at any time; the API flags them as
 * outside the window so the dashboard can warn first.
 */
export function maintenanceView(environment: Environment, now = new Date()) {
  const tz = environment.maintenanceTimeZone;
  const s = windowState(environment.maintenanceWindows, now, tz);
  return {
    windows: environment.maintenanceWindows,
    timeZone: tz,
    restricted: s.restricted,
    open: s.open,
    current: s.current,
    next: s.next,
    nextLabel: s.next ? describeWindow(s.next, tz) : null,
    currentLabel: s.current ? describeWindow(s.current, tz) : null,
    queuedReleaseId: environment.queuedReleaseId,
    queuedAt: environment.queuedAt,
  };
}

/** True when an automatic deploy has to wait. */
export function outsideWindow(environment: Environment, now = new Date()) {
  const s = windowState(environment.maintenanceWindows, now, environment.maintenanceTimeZone);
  return s.restricted && !s.open;
}

export async function queueForWindow(db: Database, environment: Environment, releaseId: string, now = new Date()) {
  await db.update(environments).set({ queuedReleaseId: releaseId, queuedAt: now }).where(eq(environments.id, environment.id));
}

/** Scheduler, every tick: deploy queued releases whose window has opened. */
export async function deployQueuedReleases(db: Database, now = new Date()) {
  const rows = await db.select().from(environments).where(isNotNull(environments.queuedReleaseId));
  let started = 0;
  for (const environment of rows) {
    if (outsideWindow(environment, now)) continue;
    const release = await db.query.releases.findFirst({ where: and(eq(releases.id, environment.queuedReleaseId!), eq(releases.appId, environment.appId)) });
    const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
    if (!release || !app) {
      await db.update(environments).set({ queuedReleaseId: null, queuedAt: null }).where(eq(environments.id, environment.id));
      continue;
    }
    try {
      const { job } = await createDeployment(db, { environment, app, release, kind: "deploy" });
      // Clear only what was deployed: a push that arrived meanwhile stays queued.
      await db
        .update(environments)
        .set({ queuedReleaseId: null, queuedAt: null })
        .where(and(eq(environments.id, environment.id), eq(environments.queuedReleaseId, release.id)));
      await writeAudit(db, {
        orgId: environment.orgId,
        action: "deploy.create",
        entityType: "environment",
        entityId: environment.id,
        metadata: { jobId: job.id, commitSha: release.commitSha, source: "maintenance_window" },
      });
      started++;
    } catch (err) {
      // A deploy is already running: try again on the next tick. Anything else won't fix itself.
      if (err instanceof ConflictError) continue;
      logger.warn({ err, environmentId: environment.id }, "Queued deploy failed to start");
      await db.update(environments).set({ queuedReleaseId: null, queuedAt: null }).where(eq(environments.id, environment.id));
      await writeAudit(db, { orgId: environment.orgId, action: "deploy.queue_failed", entityType: "environment", entityId: environment.id, metadata: { commitSha: release.commitSha, error: (err as Error).message?.slice(0, 300) } });
    }
  }
  return started;
}
