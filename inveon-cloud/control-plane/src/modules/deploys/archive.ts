import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, archivedReleases, deployments, environmentReplicas, environments, jobs, releases } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import { createJob, notifyServer, registerJobEffect } from "../jobs/service.js";
import { builtImageName, onDeploySucceeded } from "./service.js";

/**
 * Release archiving. Each environment keeps its last N deployed releases
 * (keepReleases, default 10); older ones are archived: their images are
 * removed from the server with the agent's allow-listed image.remove action
 * (`docker image rm`, which refuses images a container still uses), and the
 * release can no longer be rolled back to there. The live and the previous
 * release are never archived. Only images whose tag carries the release's
 * commit SHA are removed, so shared images (postgres:16, nginx:alpine) are
 * never touched, and neither is any image another environment on the same
 * server still keeps.
 */
export const DEFAULT_KEEP_RELEASES = 10;

type App = typeof apps.$inferSelect;
type Environment = typeof environments.$inferSelect;
type Release = typeof releases.$inferSelect;

/** Same rule as the agent: a plain image reference with a tag, no digest. */
export const IMAGE_REF_RE = /^(?:[a-z0-9][a-z0-9.-]*(?::\d{1,5})?\/)?[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/**
 * The images a release ran, as far as they can be known without the server:
 * `image:` lines of its compose file with the variables Inveon Cloud sets
 * filled in, plus the image built on the server. Only references whose tag
 * contains the commit SHA are returned.
 */
export function releaseImages(app: Pick<App, "id" | "slug" | "buildOnServer" | "imageRegistry">, release: Pick<Release, "commitSha" | "composeContent">): string[] {
  const sha = release.commitSha;
  const built = app.buildOnServer ? builtImageName(app as App, sha) : null;
  const vars: Record<string, string | null> = { IMAGE_TAG: sha, INVEON_COMMIT_SHA: sha, IMAGE_REGISTRY: app.imageRegistry ?? null, INVEON_IMAGE: built };
  const out = new Set<string>();
  if (built) out.add(built);
  for (const m of release.composeContent.matchAll(/^\s*image:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/gm)) {
    let unresolved = false;
    const ref = m[1].replace(/\$\{(\w+)(?::?-[^}]*)?\}|\$(\w+)/g, (_all, a: string | undefined, b: string | undefined) => {
      const v = vars[(a ?? b)!];
      if (v === undefined || v === null) {
        unresolved = true;
        return "";
      }
      return v;
    });
    if (!unresolved && ref.length <= 255 && IMAGE_REF_RE.test(ref) && ref.slice(ref.lastIndexOf(":") + 1).includes(sha)) out.add(ref);
  }
  return [...out];
}

export interface DeployedRelease {
  releaseId: string;
  commitSha: string;
  commitMessage: string | null;
  lastDeployedAt: Date;
  archivedAt: Date | null;
}

/** Releases that went live in this environment, most recent first. */
export async function deployedReleases(db: Database, environmentId: string): Promise<DeployedRelease[]> {
  const rows = await db
    .select({
      releaseId: releases.id,
      commitSha: releases.commitSha,
      commitMessage: releases.commitMessage,
      lastDeployedAt: max(deployments.finishedAt),
      archivedAt: sql<Date | null>`(SELECT a.archived_at FROM archived_releases a WHERE a.environment_id = ${environmentId} AND a.release_id = ${releases.id})`,
    })
    .from(deployments)
    .innerJoin(releases, eq(releases.id, deployments.releaseId))
    .where(and(eq(deployments.environmentId, environmentId), eq(deployments.status, "success")))
    .groupBy(releases.id)
    .orderBy(desc(max(deployments.finishedAt)));
  return rows.map((r) => ({ ...r, lastDeployedAt: new Date(r.lastDeployedAt as unknown as string), archivedAt: r.archivedAt ? new Date(r.archivedAt) : null }));
}

/** Pure rule: the newest `keep` releases, the live one and the previous one stay. */
export function releasesToArchive(list: Pick<DeployedRelease, "releaseId" | "archivedAt">[], keep: number, currentId: string | null, previousId: string | null) {
  const kept = new Set(list.slice(0, Math.max(keep, 0)).map((r) => r.releaseId));
  if (currentId) kept.add(currentId);
  if (previousId) kept.add(previousId);
  return list.filter((r) => !kept.has(r.releaseId) && !r.archivedAt).map((r) => r.releaseId);
}

async function busy(db: Database, environmentId: string) {
  return db.query.jobs.findFirst({
    where: and(eq(jobs.environmentId, environmentId), inArray(jobs.type, ["deploy", "rollback", "release_archive"]), inArray(jobs.status, ["pending", "running"])),
  });
}

/** True while an archive job for this release is queued or running. */
export async function releaseBeingArchived(db: Database, environmentId: string, releaseId: string) {
  const row = await db.query.jobs.findFirst({
    where: and(
      eq(jobs.environmentId, environmentId),
      eq(jobs.type, "release_archive"),
      inArray(jobs.status, ["pending", "running"]),
      sql`${jobs.meta}->'releaseIds' @> ${JSON.stringify([releaseId])}::jsonb`,
    ),
    columns: { id: true },
  });
  return !!row;
}

/** Images every environment on this server (as primary or replica) still keeps, other than the releases being archived here. */
async function protectedImages(db: Database, serverId: string, except: { environmentId: string; releaseIds: Set<string> }) {
  const envs = (
    await db
      .selectDistinct({ environment: environments })
      .from(environments)
      .leftJoin(environmentReplicas, eq(environmentReplicas.environmentId, environments.id))
      .where(sql`${environments.serverId} = ${serverId} OR ${environmentReplicas.serverId} = ${serverId}`)
  ).map((r) => r.environment);
  const keepIds = new Set<string>();
  for (const e of envs) {
    const list = await deployedReleases(db, e.id);
    const archive = new Set(releasesToArchive(list, e.keepReleases, e.currentReleaseId, e.previousReleaseId));
    for (const r of list) {
      if (archive.has(r.releaseId) || r.archivedAt) continue;
      if (e.id === except.environmentId && except.releaseIds.has(r.releaseId)) continue;
      keepIds.add(r.releaseId);
    }
  }
  if (!keepIds.size) return new Set<string>();
  const rows = await db
    .select({ release: releases, app: apps })
    .from(releases)
    .innerJoin(apps, eq(apps.id, releases.appId))
    .where(inArray(releases.id, [...keepIds]));
  return new Set(rows.flatMap((r) => releaseImages(r.app, r.release)));
}

/**
 * Archives what is due for one environment. Releases with no removable
 * image are archived at once; otherwise a release_archive job removes the
 * images first and the releases are archived when it succeeds.
 */
export async function archiveOldReleases(db: Database, environment: Environment, userId: string | null = null) {
  if (await busy(db, environment.id)) return { job: null, archived: 0 };
  const list = await deployedReleases(db, environment.id);
  const ids = releasesToArchive(list, environment.keepReleases, environment.currentReleaseId, environment.previousReleaseId);
  if (!ids.length) return { job: null, archived: 0 };
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  if (!app) return { job: null, archived: 0 };
  const rows = await db.select().from(releases).where(inArray(releases.id, ids));
  const all = [...new Set(rows.flatMap((r) => releaseImages(app, r)))];
  const keep = await protectedImages(db, environment.serverId, { environmentId: environment.id, releaseIds: new Set(ids) });
  const images = all.filter((img) => !keep.has(img)).slice(0, 100);
  // The other servers of the environment drop the same images (each checked against what it still runs).
  const others = await db.select({ serverId: environmentReplicas.serverId }).from(environmentReplicas).where(eq(environmentReplicas.environmentId, environment.id));
  for (const { serverId } of others) {
    if (serverId === environment.serverId) continue;
    const keepThere = await protectedImages(db, serverId, { environmentId: environment.id, releaseIds: new Set(ids) });
    const there = all.filter((img) => !keepThere.has(img)).slice(0, 100);
    if (!there.length) continue;
    await createJob(db, {
      orgId: environment.orgId,
      serverId,
      environmentId: environment.id,
      type: "release_archive_replica",
      title: `Remove ${there.length} old image${there.length === 1 ? "" : "s"} of ${app.name} / ${environment.name}`,
      createdBy: userId,
      meta: { releaseIds: ids },
      steps: [{ name: `Remove ${there.length} old image${there.length === 1 ? "" : "s"}`, action: "image.remove", params: { images: there } }],
    });
    notifyServer(serverId);
  }

  if (!images.length) {
    await db.insert(archivedReleases).values(ids.map((releaseId) => ({ environmentId: environment.id, releaseId }))).onConflictDoNothing();
    await writeAudit(db, { orgId: environment.orgId, action: "release.archive", entityType: "environment", entityId: environment.id, metadata: { count: ids.length, images: 0 } });
    return { job: null, archived: ids.length };
  }
  const job = await createJob(db, {
    orgId: environment.orgId,
    serverId: environment.serverId,
    environmentId: environment.id,
    type: "release_archive",
    title: `Archive ${ids.length} old release${ids.length === 1 ? "" : "s"} of ${app.name} / ${environment.name}`,
    createdBy: userId,
    meta: { releaseIds: ids },
    steps: [{ name: `Remove ${images.length} old image${images.length === 1 ? "" : "s"}`, action: "image.remove", params: { images } }],
  });
  notifyServer(environment.serverId);
  return { job, archived: 0 };
}

registerJobEffect("release_archive", async (db, job) => {
  if (job.status !== "success" || !job.environmentId) return;
  const ids = Array.isArray(job.meta.releaseIds) ? (job.meta.releaseIds as string[]) : [];
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, job.environmentId) });
  if (!environment || !ids.length) return;
  // Never archive what became live or previous while the job ran.
  const safe = ids.filter((id) => id !== environment.currentReleaseId && id !== environment.previousReleaseId);
  if (safe.length) await db.insert(archivedReleases).values(safe.map((releaseId) => ({ environmentId: environment.id, releaseId, jobId: job.id }))).onConflictDoNothing();
  await writeAudit(db, { orgId: environment.orgId, actorServerId: job.serverId, action: "release.archive", entityType: "environment", entityId: environment.id, metadata: { count: safe.length, jobId: job.id } });
});

// After every successful deploy: the live release is no longer archived (it was
// deployed again), and anything that fell out of the last N is archived.
onDeploySucceeded("archive-releases", async (db, environment) => {
  if (environment.currentReleaseId) {
    await db.delete(archivedReleases).where(and(eq(archivedReleases.environmentId, environment.id), eq(archivedReleases.releaseId, environment.currentReleaseId)));
  }
  await archiveOldReleases(db, environment);
});

/** Scheduler, daily: catches environments whose setting changed or whose archive job failed. */
export async function archiveAllReleases(db: Database) {
  const envs = await db.select().from(environments);
  let n = 0;
  for (const e of envs) {
    try {
      const r = await archiveOldReleases(db, e);
      if (r.job || r.archived) n++;
    } catch (err) {
      logger.warn({ err, environmentId: e.id }, "Release archiving failed");
    }
  }
  return n;
}
