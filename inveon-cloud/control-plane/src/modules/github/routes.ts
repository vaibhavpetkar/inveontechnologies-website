import express, { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, githubInstallations, memberships } from "../../db/schema.js";
import { requireRole, ROLE_RANK } from "../auth/middleware.js";
import { audit, writeAudit } from "../../lib/audit.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import {
  dropInstallationTokens,
  exchangeOAuthCode,
  getInstallation,
  githubAppConfigured,
  githubAppInfo,
  GithubApiError,
  installUrl,
  signSetupState,
  userCanSeeInstallation,
  verifyAppWebhook,
  verifySetupState,
} from "../../lib/github-app.js";
import { handlePullRequest, handlePush, type PullRequestPayload, type PushPayload } from "../deploys/routes.js";

const publicInstallation = (i: typeof githubInstallations.$inferSelect) => ({
  id: i.id,
  installationId: i.installationId,
  accountLogin: i.accountLogin,
  accountType: i.accountType,
  suspendedAt: i.suspendedAt,
  createdAt: i.createdAt,
});

/** Mounted under /api/v1/orgs/:orgId: the organization's linked installations. */
export function githubRouter(db: Database) {
  const router = Router({ mergeParams: true });

  router.get("/github", async (req, res) => {
    const rows = await db.select().from(githubInstallations).where(eq(githubInstallations.orgId, req.member!.orgId)).orderBy(asc(githubInstallations.accountLogin));
    res.json({ app: githubAppInfo(), installations: rows.map(publicInstallation) });
  });

  // The link to install the app; GitHub sends the admin back to /api/v1/github/setup.
  router.post("/github/install", requireRole("admin"), async (req, res) => {
    const info = githubAppInfo();
    if (!info) throw new AppError("GITHUB_APP_OFF", "The GitHub App is not configured on this control plane", 400);
    if (!info.canLink) throw new AppError("GITHUB_APP_NO_OAUTH", "Set INVEON_GITHUB_APP_CLIENT_ID and INVEON_GITHUB_APP_CLIENT_SECRET to link installations", 400);
    res.json({ url: installUrl(signSetupState(req.member!.orgId, req.user!.sub)) });
  });

  router.delete("/github/installations/:id", requireRole("admin"), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const [row] = await db.delete(githubInstallations).where(and(eq(githubInstallations.id, id), eq(githubInstallations.orgId, req.member!.orgId))).returning();
    if (!row) throw new NotFoundError("Installation not found");
    dropInstallationTokens(row.installationId);
    await audit(db, req, "github.unlink", "github_installation", row.id, { installationId: row.installationId, account: row.accountLogin });
    res.json({ ok: true });
  });

  return router;
}

const setupSchema = z.object({
  installation_id: z.coerce.number().int().positive().max(1e12).optional(),
  setup_action: z.enum(["install", "update", "request"]).optional(),
  state: z.string().max(1000).optional(),
  code: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
});

/**
 * GET /api/v1/github/setup: GitHub's "Setup URL" after an installation.
 * The signed state says which organization and admin started it; the OAuth
 * code shows which GitHub user finished it, and that user must be able to
 * see the installation. Then the installation is linked and the browser
 * goes back to the dashboard.
 */
export function githubSetupRouter(db: Database, env: Env) {
  const router = Router();
  const back = (query: string) => `${env.INVEON_PUBLIC_URL.replace(/\/$/, "")}/apps?${query}`;

  router.get("/setup", async (req, res) => {
    const fail = (code: string) => res.redirect(303, back(`github_error=${code}`));
    if (!githubAppConfigured()) return fail("not_configured");
    const parsed = setupSchema.safeParse(req.query);
    if (!parsed.success) return fail("bad_request");
    const q = parsed.data;
    if (q.setup_action === "request") return res.redirect(303, back("github=requested"));
    const who = q.state ? verifySetupState(q.state) : null;
    if (!who) return fail("expired");
    if (!q.installation_id || !q.code) return fail("bad_request");
    const member = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, who.orgId), eq(memberships.userId, who.userId)) });
    if (!member || ROLE_RANK[member.role] < ROLE_RANK.admin) return fail("forbidden");

    try {
      const userToken = await exchangeOAuthCode(q.code);
      if (!(await userCanSeeInstallation(userToken, q.installation_id))) return fail("not_yours");
      const installation = await getInstallation(q.installation_id);
      const login = installation.account?.login;
      if (!login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return fail("github");
      const existing = await db.query.githubInstallations.findFirst({ where: eq(githubInstallations.installationId, q.installation_id) });
      if (existing && existing.orgId !== who.orgId) return fail("linked_elsewhere");
      if (existing) {
        await db.update(githubInstallations).set({ accountLogin: login, accountType: installation.account?.type ?? null }).where(eq(githubInstallations.id, existing.id));
      } else {
        const [row] = await db
          .insert(githubInstallations)
          .values({ orgId: who.orgId, installationId: q.installation_id, accountLogin: login, accountType: installation.account?.type ?? null, createdBy: who.userId })
          .returning();
        await writeAudit(db, { orgId: who.orgId, actorUserId: who.userId, action: "github.link", entityType: "github_installation", entityId: row.id, metadata: { installationId: q.installation_id, account: login }, ipAddress: req.ip });
      }
      return res.redirect(303, back("github=linked"));
    } catch (err) {
      logger.warn({ err: err instanceof GithubApiError ? err.message : err }, "Linking a GitHub App installation failed");
      return fail("github");
    }
  });

  return router;
}

/**
 * POST /api/v1/webhooks/github-app: the GitHub App's own webhook, signed with
 * INVEON_GITHUB_APP_WEBHOOK_SECRET. Installation events keep the links up
 * to date (uninstalled: unlinked; suspended: not used). Pushes and pull
 * requests of installed repos reach every app in the linked organization
 * with that repo, as the per-app webhook does, so a repo needs no webhook
 * of its own.
 */
export function githubAppWebhookRouter(db: Database, env: Env) {
  const router = Router();
  router.post("/github-app", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.headers["x-hub-signature-256"];
    if (!verifyAppWebhook(raw, typeof signature === "string" ? signature : undefined)) throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature", 401);
    const event = String(req.headers["x-github-event"] ?? "");
    let body: { action?: string; installation?: { id?: number; account?: { login?: string } }; repository?: { full_name?: string } };
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new AppError("INVALID_JSON", "Payload is not JSON", 400);
    }
    if (event === "ping") return void res.json({ ok: true, pong: true });
    const installationId = body.installation?.id;
    if (typeof installationId !== "number") return void res.status(202).json({ ok: true, ignored: "no installation" });
    const links = await db.select().from(githubInstallations).where(eq(githubInstallations.installationId, installationId));

    if (event === "installation") {
      const action = body.action ?? "";
      if (action === "deleted") {
        dropInstallationTokens(installationId);
        await db.delete(githubInstallations).where(eq(githubInstallations.installationId, installationId));
      } else if (action === "suspend" || action === "unsuspend") {
        if (action === "suspend") dropInstallationTokens(installationId);
        await db.update(githubInstallations).set({ suspendedAt: action === "suspend" ? new Date() : null }).where(eq(githubInstallations.installationId, installationId));
      } else {
        return void res.status(202).json({ ok: true, ignored: `installation ${action}` });
      }
      for (const l of links) {
        await writeAudit(db, { orgId: l.orgId, action: `github.installation_${action}`, entityType: "github_installation", entityId: l.id, metadata: { installationId, account: l.accountLogin }, ipAddress: req.ip });
      }
      return void res.json({ ok: true });
    }

    if (event !== "push" && event !== "pull_request") return void res.status(202).json({ ok: true, ignored: `event ${event}` });
    const [owner, repo] = (body.repository?.full_name ?? "").split("/");
    const active = links.filter((l) => !l.suspendedAt && owner && l.accountLogin.toLowerCase() === owner.toLowerCase());
    if (!owner || !repo || active.length === 0) return void res.status(202).json({ ok: true, ignored: "no linked organization for this repository" });
    const targets = await db
      .select()
      .from(apps)
      .where(and(inArray(apps.orgId, active.map((l) => l.orgId)), sql`lower(${apps.repoOwner}) = ${owner.toLowerCase()}`, sql`lower(${apps.repoName}) = ${repo.toLowerCase()}`));
    const results = [];
    for (const app of targets) {
      try {
        const result = event === "push" ? await handlePush(db, env, app, body as PushPayload, req.ip) : await handlePullRequest(db, env, app, body as PullRequestPayload, req.ip);
        results.push({ appId: app.id, ...result });
      } catch (err) {
        logger.warn({ err, appId: app.id, event }, "GitHub App webhook: app skipped");
        results.push({ appId: app.id, error: err instanceof AppError ? err.message : "failed" });
      }
    }
    res.status(202).json({ ok: true, apps: results });
  });
  return router;
}
