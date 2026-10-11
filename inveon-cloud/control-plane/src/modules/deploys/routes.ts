import express, { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, deployments, environments, releases } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit, writeAudit } from "../../lib/audit.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { verifyGithubSignature } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { loadEnvironment, webhookSecretFor } from "../apps/routes.js";
import { createJob, notifyServer } from "../jobs/service.js";
import { createDeployment, resolveRelease } from "./service.js";

export function deploysRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.post("/:envId/deploy", requireRole("developer"), async (req, res) => {
    const body = z.object({ commitSha: z.string().regex(/^[0-9a-f]{40}$/, "Full 40-character commit SHA").optional() }).parse(req.body ?? {});
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const release = await resolveRelease(db, env, app, { commitSha: body.commitSha, source: "manual", userId: req.user!.sub });
    const { job, deployment } = await createDeployment(db, { environment, app, release, kind: "deploy", userId: req.user!.sub });
    await audit(db, req, "deploy.create", "environment", environment.id, { jobId: job.id, commitSha: release.commitSha });
    res.status(201).json({ job, deployment, release: { id: release.id, commitSha: release.commitSha } });
  });

  // Rollback = a normal deploy job targeting the previous release.
  router.post("/:envId/rollback", requireRole("developer"), async (req, res) => {
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    if (!environment.previousReleaseId) throw new AppError("NO_PREVIOUS_RELEASE", "There is no previous release to roll back to", 400);
    const release = await db.query.releases.findFirst({ where: eq(releases.id, environment.previousReleaseId) });
    if (!release) throw new NotFoundError("Previous release not found");
    const { job, deployment } = await createDeployment(db, { environment, app, release, kind: "rollback", userId: req.user!.sub });
    await audit(db, req, "deploy.rollback", "environment", environment.id, { jobId: job.id, commitSha: release.commitSha });
    res.status(201).json({ job, deployment, release: { id: release.id, commitSha: release.commitSha } });
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
      })
      .from(deployments)
      .innerJoin(releases, eq(releases.id, deployments.releaseId))
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
    if (event !== "push") {
      res.status(202).json({ ok: true, ignored: `event ${event}` });
      return;
    }
    let payload: { ref?: string; after?: string; deleted?: boolean; head_commit?: { message?: string } | null };
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new AppError("INVALID_JSON", "Payload is not JSON", 400);
    }
    if (payload.ref !== `refs/heads/${app.branch}` || payload.deleted || !payload.after || !/^[0-9a-f]{40}$/.test(payload.after)) {
      res.status(202).json({ ok: true, ignored: "not a push to the deploy branch" });
      return;
    }
    const release = await resolveRelease(db, env, app, { commitSha: payload.after, commitMessage: payload.head_commit?.message ?? null, source: "webhook" });
    await writeAudit(db, { orgId: app.orgId, action: "release.create", entityType: "app", entityId: app.id, metadata: { commitSha: release.commitSha, source: "webhook" }, ipAddress: req.ip });

    const targets = await db.select().from(environments).where(eq(environments.appId, app.id));
    const started: string[] = [];
    for (const environment of targets.filter((e) => e.autoDeploy)) {
      try {
        const { job } = await createDeployment(db, { environment, app, release, kind: "deploy" });
        started.push(job.id);
        await writeAudit(db, { orgId: app.orgId, action: "deploy.create", entityType: "environment", entityId: environment.id, metadata: { jobId: job.id, commitSha: release.commitSha, source: "webhook" } });
      } catch (err) {
        logger.warn({ err, environmentId: environment.id }, "Webhook deploy skipped");
      }
    }
    res.status(202).json({ ok: true, releaseId: release.id, jobIds: started });
  });
  return router;
}
