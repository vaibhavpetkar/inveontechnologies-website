import express, { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, backups, deployments, environments, releases } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit, writeAudit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { verifyGithubSignature } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { loadEnvironment, webhookSecretFor } from "../apps/routes.js";
import { createJob, notifyServer } from "../jobs/service.js";
import { createDeployment, resolveRelease } from "./service.js";
import { archiveOldReleases, deployedReleases, releaseBeingArchived } from "./archive.js";
import { maintenanceView, outsideWindow, queueForWindow } from "./maintenance.js";
import { LOG_FOLLOW_MAX_SEC, startLogFollow } from "../live-logs/service.js";
import { previewHostname, previewName, previewsReady, startPreviewTeardown, upsertPreviewEnvironment } from "../previews/service.js";
import { notifyPreview } from "../github/service.js";

export function deploysRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.post("/:envId/deploy", requireRole("developer"), async (req, res) => {
    const body = z.object({ commitSha: z.string().regex(/^[0-9a-f]{40}$/, "Full 40-character commit SHA").optional() }).parse(req.body ?? {});
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const release = await resolveRelease(db, env, app, { commitSha: body.commitSha, source: "manual", userId: req.user!.sub });
    // Manual deploys run at any time; outside a maintenance window the dashboard has already warned.
    const outside = outsideWindow(environment);
    const { job, deployment } = await createDeployment(db, { environment, app, release, kind: "deploy", userId: req.user!.sub });
    if (environment.queuedReleaseId === release.id) {
      await db.update(environments).set({ queuedReleaseId: null, queuedAt: null }).where(and(eq(environments.id, environment.id), eq(environments.queuedReleaseId, release.id)));
    }
    await audit(db, req, "deploy.create", "environment", environment.id, { jobId: job.id, commitSha: release.commitSha, ...(outside ? { outsideMaintenanceWindow: true } : {}) });
    res.status(201).json({ job, deployment, release: { id: release.id, commitSha: release.commitSha }, outsideMaintenanceWindow: outside, maintenance: maintenanceView({ ...environment, queuedReleaseId: null }) });
  });

  // Rollback = a normal deploy job targeting the previous release, or an
  // older release that went live here and is not archived.
  router.post("/:envId/rollback", requireRole("developer"), async (req, res) => {
    const body = z.object({ releaseId: z.string().uuid().optional() }).parse(req.body ?? {});
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const targetId = body.releaseId ?? environment.previousReleaseId;
    if (!targetId) throw new AppError("NO_PREVIOUS_RELEASE", "There is no previous release to roll back to", 400);
    if (targetId === environment.currentReleaseId) throw new AppError("ALREADY_LIVE", "That release is already live", 400);
    const deployedHere = (await deployedReleases(db, environment.id)).find((r) => r.releaseId === targetId);
    if (!deployedHere) throw new AppError("NOT_DEPLOYED_HERE", "You can only roll back to a release that was live in this environment", 400);
    if (deployedHere.archivedAt) throw new AppError("RELEASE_ARCHIVED", "That release is archived (its images were removed from the server), so it can't be rolled back to. Deploy its commit again instead.", 400);
    if (await releaseBeingArchived(db, environment.id, targetId)) throw new ConflictError("That release is being archived right now; deploy its commit again instead");
    const release = await db.query.releases.findFirst({ where: and(eq(releases.id, targetId), eq(releases.appId, app.id)) });
    if (!release) throw new NotFoundError("Release not found");
    const { job, deployment } = await createDeployment(db, { environment, app, release, kind: "rollback", userId: req.user!.sub });
    await audit(db, req, "deploy.rollback", "environment", environment.id, { jobId: job.id, commitSha: release.commitSha });
    res.status(201).json({ job, deployment, release: { id: release.id, commitSha: release.commitSha } });
  });

  // Drops a deploy that is waiting for the next maintenance window.
  router.delete("/:envId/queued-deploy", requireRole("developer"), async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    if (!environment.queuedReleaseId) throw new NotFoundError("No deploy is waiting for a maintenance window");
    await db.update(environments).set({ queuedReleaseId: null, queuedAt: null }).where(eq(environments.id, environment.id));
    await audit(db, req, "deploy.queue_discard", "environment", environment.id, { releaseId: environment.queuedReleaseId });
    res.json({ ok: true });
  });

  // Releases that went live here, newest first, with their archive state.
  router.get("/:envId/releases", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const list = await deployedReleases(db, environment.id);
    res.json({
      keepReleases: environment.keepReleases,
      releases: list.slice(0, 100).map((r) => ({
        ...r,
        current: r.releaseId === environment.currentReleaseId,
        previous: r.releaseId === environment.previousReleaseId,
      })),
    });
  });

  // Archives what is past the environment's keepReleases now.
  router.post("/:envId/releases/archive", requireRole("admin"), async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const result = await archiveOldReleases(db, environment, req.user!.sub);
    await audit(db, req, "release.archive_request", "environment", environment.id, { jobId: result.job?.id ?? null, archived: result.archived });
    res.status(result.job ? 201 : 200).json(result);
  });

  router.get("/:envId/deployments", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const rows = await db
      .select({
        id: deployments.id,
        kind: deployments.kind,
        slot: deployments.slot,
        status: deployments.status,
        jobId: deployments.jobId,
        createdAt: deployments.createdAt,
        finishedAt: deployments.finishedAt,
        releaseId: releases.id,
        commitSha: releases.commitSha,
        commitMessage: releases.commitMessage,
        error: deployments.error,
        releaseOutput: deployments.releaseOutput,
        backupId: deployments.backupId,
        backupStatus: backups.status,
      })
      .from(deployments)
      .innerJoin(releases, eq(releases.id, deployments.releaseId))
      .leftJoin(backups, eq(backups.id, deployments.backupId))
      .where(eq(deployments.environmentId, environment.id))
      .orderBy(desc(deployments.createdAt))
      .limit(50);
    res.json({ deployments: rows });
  });

  // Container logs: a job that tails the last N lines on the server.
  router.post("/:envId/logs", requireRole("developer"), async (req, res) => {
    const body = z
      .object({ lines: z.number().int().min(1).max(5000).default(200), service: z.string().regex(/^[A-Za-z0-9._-]{1,63}$/).optional() })
      .parse(req.body ?? {});
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    if (!environment.activeSlot) throw new AppError("NOT_DEPLOYED", "Deploy this environment first", 400);
    const job = await createJob(db, {
      orgId: environment.orgId,
      serverId: environment.serverId,
      environmentId: environment.id,
      type: "logs",
      title: `Logs: ${app.name} / ${environment.name}${body.service ? ` (${body.service})` : ""}`,
      createdBy: req.user!.sub,
      steps: [
        {
          name: `Last ${body.lines} lines`,
          action: "compose.logs",
          params: { slug: environment.slug, slot: environment.activeSlot, composePath: app.composePath, lines: body.lines, service: body.service ?? null },
        },
      ],
    });
    notifyServer(environment.serverId);
    await audit(db, req, "logs.request", "environment", environment.id, { jobId: job.id, lines: body.lines });
    res.status(201).json({ job });
  });

  // Live logs: `docker compose logs -f` for one service, streamed over the job's SSE stream.
  router.post("/:envId/logs/follow", requireRole("developer"), async (req, res) => {
    const body = z
      .object({
        service: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/, "Enter the compose service name"),
        tail: z.number().int().min(0).max(5000).default(100),
        durationSec: z.number().int().min(30).max(LOG_FOLLOW_MAX_SEC).default(LOG_FOLLOW_MAX_SEC),
      })
      .parse(req.body ?? {});
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const job = await startLogFollow(db, { environment, app, ...body, userId: req.user!.sub });
    await audit(db, req, "logs.follow", "environment", environment.id, { jobId: job.id, service: body.service, tail: body.tail, durationSec: body.durationSec });
    res.status(201).json({ job, streamUrl: `/orgs/${environment.orgId}/jobs/${job.id}/stream` });
  });

  return router;
}

/**
 * GitHub push webhook: POST /api/v1/webhooks/github/:appId, signed with the
 * app's secret (X-Hub-Signature-256, HMAC-SHA256 over the raw body,
 * constant-time compare). A push to the app's branch creates a release and
 * deploys every environment with auto-deploy on.
 */
export function webhookRouter(db: Database, env: Env) {
  const router = Router();
  router.post("/github/:appId", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
    const appId = req.params.appId;
    const app = /^[0-9a-f-]{36}$/i.test(appId) ? await db.query.apps.findFirst({ where: eq(apps.id, appId) }) : undefined;
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.headers["x-hub-signature-256"];
    if (!app || !verifyGithubSignature(webhookSecretFor(app), raw, typeof signature === "string" ? signature : undefined)) {
      throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature", 401);
    }
    const event = String(req.headers["x-github-event"] ?? "");
    if (event === "ping") {
      res.json({ ok: true, pong: true });
      return;
    }
    if (event !== "push" && event !== "pull_request") {
      res.status(202).json({ ok: true, ignored: `event ${event}` });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new AppError("INVALID_JSON", "Payload is not JSON", 400);
    }
    if (event === "pull_request") {
      const result = await handlePullRequest(db, env, app, body as PullRequestPayload, req.ip);
      res.status(202).json({ ok: true, ...result });
      return;
    }
    const result = await handlePush(db, env, app, body as PushPayload, req.ip);
    res.status(202).json({ ok: true, ...result });
  });
  return router;
}

export interface PushPayload {
  ref?: string;
  after?: string;
  deleted?: boolean;
  head_commit?: { message?: string } | null;
}

/**
 * A push to the app's branch creates a release and deploys every
 * environment with auto-deploy on (or queues it for the maintenance
 * window). Used by the app's own webhook and by the GitHub App's.
 */
export async function handlePush(db: Database, env: Env, app: typeof apps.$inferSelect, payload: PushPayload, ip: string | undefined) {
  if (payload.ref !== `refs/heads/${app.branch}` || payload.deleted || !payload.after || !/^[0-9a-f]{40}$/.test(payload.after)) {
    return { ignored: "not a push to the deploy branch" };
  }
  const release = await resolveRelease(db, env, app, { commitSha: payload.after, commitMessage: payload.head_commit?.message ?? null, source: "webhook" });
  await writeAudit(db, { orgId: app.orgId, action: "release.create", entityType: "app", entityId: app.id, metadata: { commitSha: release.commitSha, source: "webhook" }, ipAddress: ip });

  const targets = await db.select().from(environments).where(eq(environments.appId, app.id));
  const started: string[] = [];
  const queued: string[] = [];
  // Previews are deployed only by their own pull request.
  for (const environment of targets.filter((e) => e.autoDeploy && e.previewPr === null)) {
    // Outside its maintenance window the release waits; a newer push replaces it.
    if (outsideWindow(environment)) {
      await queueForWindow(db, environment, release.id);
      queued.push(environment.id);
      await writeAudit(db, { orgId: app.orgId, action: "deploy.queued", entityType: "environment", entityId: environment.id, metadata: { commitSha: release.commitSha, source: "webhook", until: maintenanceView(environment).next?.start ?? null } });
      continue;
    }
    try {
      const { job } = await createDeployment(db, { environment, app, release, kind: "deploy" });
      started.push(job.id);
      await writeAudit(db, { orgId: app.orgId, action: "deploy.create", entityType: "environment", entityId: environment.id, metadata: { jobId: job.id, commitSha: release.commitSha, source: "webhook" } });
    } catch (err) {
      logger.warn({ err, environmentId: environment.id }, "Webhook deploy skipped");
    }
  }
  return { releaseId: release.id, jobIds: started, queuedEnvironmentIds: queued };
}

export interface PullRequestPayload {
  action?: string;
  number?: number;
  pull_request?: {
    title?: string;
    head?: { sha?: string; repo?: { full_name?: string } | null };
    base?: { repo?: { full_name?: string } | null };
  };
}

/**
 * pull_request webhook: opened, synchronize and reopened create or update
 * the PR's preview and deploy its head commit; closed tears it down. Pull
 * requests from forks are never deployed: their code would run on our
 * server with the preview's variables.
 */
export async function handlePullRequest(db: Database, env: Env, app: typeof apps.$inferSelect, payload: PullRequestPayload, ip: string | undefined) {
  if (!previewsReady(app)) return { ignored: "previews are off for this app" };
  const pr = payload.number;
  const action = payload.action ?? "";
  if (!Number.isInteger(pr) || pr! < 1 || pr! > 1e9) return { ignored: "no pull request number" };
  const repo = `${app.repoOwner}/${app.repoName}`.toLowerCase();
  const headRepo = payload.pull_request?.head?.repo?.full_name?.toLowerCase();
  const baseRepo = payload.pull_request?.base?.repo?.full_name?.toLowerCase();
  if (baseRepo !== repo) return { ignored: "pull request is for another repository" };

  if (action === "closed") {
    const environment = await db.query.environments.findFirst({ where: and(eq(environments.appId, app.id), eq(environments.name, previewName(pr!))) });
    if (!environment || environment.previewPr !== pr) return { ignored: "no preview for this pull request" };
    const job = await startPreviewTeardown(db, environment, app, null);
    await writeAudit(db, { orgId: app.orgId, action: "preview.teardown", entityType: "environment", entityId: environment.id, metadata: { pr, jobId: job.id, source: "webhook" }, ipAddress: ip });
    return { environmentId: environment.id, jobId: job.id, teardown: true };
  }
  if (!["opened", "synchronize", "reopened"].includes(action)) return { ignored: `pull_request ${action}` };
  if (headRepo !== repo) return { ignored: "pull requests from forks are not previewed" };
  const headSha = payload.pull_request?.head?.sha;
  if (!headSha || !/^[0-9a-f]{40}$/.test(headSha)) return { ignored: "no head commit" };

  let upserted;
  try {
    upserted = await upsertPreviewEnvironment(db, app, pr!);
  } catch (err) {
    if (err instanceof AppError) return { ignored: err.message };
    throw err;
  }
  const { environment, created } = upserted;
  if (created) {
    await writeAudit(db, { orgId: app.orgId, action: "preview.create", entityType: "environment", entityId: environment.id, metadata: { pr, name: environment.name }, ipAddress: ip });
  }
  const release = await resolveRelease(db, env, app, { commitSha: headSha, commitMessage: payload.pull_request?.title ?? null, source: "pull_request" });
  try {
    const { job } = await createDeployment(db, { environment, app, release, kind: "deploy" });
    await writeAudit(db, { orgId: app.orgId, action: "deploy.create", entityType: "environment", entityId: environment.id, metadata: { jobId: job.id, commitSha: release.commitSha, source: "pull_request", pr } });
    void notifyPreview(db, { app, pr: pr!, state: "deploying", commitSha: release.commitSha, environmentId: environment.id, hostname: previewHostname(app, pr!) });
    return { environmentId: environment.id, releaseId: release.id, jobIds: [job.id] };
  } catch (err) {
    if (err instanceof ConflictError) return { environmentId: environment.id, releaseId: release.id, jobIds: [], skipped: err.message };
    throw err;
  }
}
