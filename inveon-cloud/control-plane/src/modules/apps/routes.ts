import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, backupConfigs, domains, envVars, environments, healthChecks, releases, servers } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { decryptValue, encryptValue, randomToken } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { parseGithubRepo } from "../../lib/github.js";
import { generateDeployKey } from "../../lib/ssh-key.js";
import { deployKeyAad, registryAad } from "../../lib/aad.js";
import { parseReleaseCommand, RELEASE_SERVICE_RE } from "../../lib/release-command.js";
import { slugify } from "../auth/routes.js";
import { loadServer, publicServer } from "../servers/routes.js";
import { envVarAad, createJob, notifyServer } from "../jobs/service.js";

export const COMPOSE_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}\.ya?ml$/;
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const PORT_BASE = 20000;

const webhookAad = (appId: string) => `webhook:${appId}`;
export const REL_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}$/;
export const REGISTRY_SERVER_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/;
export const REGISTRY_USER_RE = /^[A-Za-z0-9._@+-]{1,256}$/;
const MASK = "••••••••";

export function webhookSecretFor(app: typeof apps.$inferSelect) {
  return decryptValue(app.webhookSecretEnc, webhookAad(app.id));
}

export async function loadApp(db: Database, orgId: string, id: string) {
  const app = await db.query.apps.findFirst({ where: and(eq(apps.id, id), eq(apps.orgId, orgId)) });
  if (!app) throw new NotFoundError("App not found");
  return app;
}

export async function loadEnvironment(db: Database, orgId: string, id: string) {
  const environment = await db.query.environments.findFirst({ where: and(eq(environments.id, id), eq(environments.orgId, orgId)) });
  if (!environment) throw new NotFoundError("Environment not found");
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  const server = await db.query.servers.findFirst({ where: eq(servers.id, environment.serverId) });
  if (!app || !server) throw new NotFoundError("Environment not found");
  return { environment, app, server };
}

/** Secrets never leave: the webhook secret, registry password and deploy key are write-only. */
function publicApp(app: typeof apps.$inferSelect, env: Env) {
  const { webhookSecretEnc: _w, registryPasswordEnc, registryServer, registryUsername, deployKeyEnc, deployKeyPublic, ...rest } = app;
  return {
    ...rest,
    webhookUrl: `${env.INVEON_PUBLIC_URL.replace(/\/$/, "")}/api/v1/webhooks/github/${app.id}`,
    registryCredentials: registryPasswordEnc && registryServer ? { server: registryServer, username: registryUsername, password: MASK } : null,
    deployKey: deployKeyEnc && deployKeyPublic ? { publicKey: deployKeyPublic } : null,
  };
}

const appBody = z.object({
  name: z.string().trim().min(1).max(80),
  repoUrl: z.string().trim().max(300),
  branch: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._\/-]+$/, "Invalid branch name").default("main"),
  composePath: z.string().trim().regex(COMPOSE_PATH_RE, "Compose path must be a relative .yml/.yaml path inside the repo").default("docker-compose.yml"),
  imageRegistry: z.string().trim().max(200).regex(/^[A-Za-z0-9.\-:\/]*$/).optional().nullable(),
  buildOnServer: z.boolean().default(false),
  dockerfilePath: z.string().trim().regex(REL_PATH_RE, "A relative path inside the repo, without ..").default("Dockerfile"),
  buildContext: z.string().trim().regex(REL_PATH_RE, "A relative folder inside the repo, without ..").default("."),
});

export function appsRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    const rows = await db
      .select({ app: apps, environments: sql<number>`(SELECT count(*)::int FROM environments e WHERE e.app_id = ${apps.id})` })
      .from(apps)
      .where(eq(apps.orgId, req.member!.orgId))
      .orderBy(asc(apps.name));
    res.json({ apps: rows.map((r) => ({ ...publicApp(r.app, env), environmentCount: r.environments })) });
  });

  router.post("/", requireRole("admin"), async (req, res) => {
    const body = appBody.parse(req.body);
    const repo = parseGithubRepo(body.repoUrl);
    if (!repo) throw new AppError("INVALID_REPO", "Use a GitHub URL like https://github.com/owner/repo", 400);
    const id = crypto.randomUUID();
    const secret = randomToken(32);
    const [app] = await db
      .insert(apps)
      .values({
        id,
        orgId: req.member!.orgId,
        name: body.name,
        slug: slugify(body.name, 30),
        repoUrl: `https://github.com/${repo.owner}/${repo.repo}`,
        repoOwner: repo.owner,
        repoName: repo.repo,
        branch: body.branch,
        composePath: body.composePath,
        imageRegistry: body.imageRegistry || null,
        buildOnServer: body.buildOnServer,
        dockerfilePath: body.dockerfilePath,
        buildContext: body.buildContext,
        webhookSecretEnc: encryptValue(secret, webhookAad(id)),
        createdBy: req.user!.sub,
      })
      .returning();
    await audit(db, req, "app.create", "app", app.id, { name: app.name, repo: app.repoUrl });
    // The webhook secret is shown once, here and on rotation.
    res.status(201).json({ app: publicApp(app, env), webhookSecret: secret });
  });

  router.get("/:id", async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const envs = await db
      .select({ environment: environments, serverName: servers.name, serverIp: servers.ipAddress, commitSha: releases.commitSha })
      .from(environments)
      .innerJoin(servers, eq(servers.id, environments.serverId))
      .leftJoin(releases, eq(releases.id, environments.currentReleaseId))
      .where(eq(environments.appId, app.id))
      .orderBy(asc(environments.createdAt));
    res.json({ app: publicApp(app, env), environments: envs.map((e) => ({ ...e.environment, serverName: e.serverName, serverIp: e.serverIp, currentCommitSha: e.commitSha })) });
  });

  router.patch("/:id", requireRole("admin"), async (req, res) => {
    const body = appBody.partial().omit({ repoUrl: true }).parse(req.body);
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const [updated] = await db.update(apps).set({ ...body, updatedAt: new Date() }).where(eq(apps.id, app.id)).returning();
    await audit(db, req, "app.update", "app", app.id, body);
    res.json({ app: publicApp(updated, env) });
  });

  // Registry login for this app's pulls and builds. Write-only: the password is never returned.
  router.put("/:id/registry-credentials", requireRole("admin"), async (req, res) => {
    const body = z
      .object({
        server: z.string().trim().toLowerCase().regex(REGISTRY_SERVER_RE, "A registry host like ghcr.io or 123456789012.dkr.ecr.ap-south-1.amazonaws.com"),
        username: z.string().trim().regex(REGISTRY_USER_RE, "Invalid username"),
        password: z.string().min(1).max(8192).regex(/^[^\x00-\x1f\x7f]+$/, "The password can't contain line breaks or control characters"),
      })
      .parse(req.body);
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const [updated] = await db
      .update(apps)
      .set({ registryServer: body.server, registryUsername: body.username, registryPasswordEnc: encryptValue(body.password, registryAad(app.id)), updatedAt: new Date() })
      .where(eq(apps.id, app.id))
      .returning();
    await audit(db, req, "app.registry_credentials_set", "app", app.id, { server: body.server, username: body.username });
    res.json({ app: publicApp(updated, env) });
  });

  router.delete("/:id/registry-credentials", requireRole("admin"), async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const [updated] = await db.update(apps).set({ registryServer: null, registryUsername: null, registryPasswordEnc: null, updatedAt: new Date() }).where(eq(apps.id, app.id)).returning();
    await audit(db, req, "app.registry_credentials_delete", "app", app.id);
    res.json({ app: publicApp(updated, env) });
  });

  // A new read-only deploy key for cloning on the server. Only the public half is ever shown.
  router.post("/:id/deploy-key", requireRole("admin"), async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const key = generateDeployKey(`inveon-cloud-${app.slug}`);
    const [updated] = await db
      .update(apps)
      .set({ deployKeyEnc: encryptValue(key.privateKey, deployKeyAad(app.id)), deployKeyPublic: key.publicKey, updatedAt: new Date() })
      .where(eq(apps.id, app.id))
      .returning();
    await audit(db, req, "app.deploy_key_generate", "app", app.id);
    res.status(201).json({ app: publicApp(updated, env), publicKey: key.publicKey });
  });

  router.delete("/:id/deploy-key", requireRole("admin"), async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const [updated] = await db.update(apps).set({ deployKeyEnc: null, deployKeyPublic: null, updatedAt: new Date() }).where(eq(apps.id, app.id)).returning();
    await audit(db, req, "app.deploy_key_delete", "app", app.id);
    res.json({ app: publicApp(updated, env) });
  });

  router.post("/:id/webhook-secret", requireRole("admin"), async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const secret = randomToken(32);
    await db.update(apps).set({ webhookSecretEnc: encryptValue(secret, webhookAad(app.id)), updatedAt: new Date() }).where(eq(apps.id, app.id));
    await audit(db, req, "app.webhook_secret_rotate", "app", app.id);
    res.json({ webhookSecret: secret });
  });

  router.delete("/:id", requireRole("admin"), async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const [{ n }] = await db.select({ n: count() }).from(environments).where(eq(environments.appId, app.id));
    if (n > 0) throw new ConflictError("Delete the app's environments first");
    await db.delete(apps).where(eq(apps.id, app.id));
    await audit(db, req, "app.delete", "app", app.id, { name: app.name });
    res.json({ ok: true });
  });

  router.get("/:id/releases", async (req, res) => {
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const rows = await db
      .select({ id: releases.id, commitSha: releases.commitSha, commitMessage: releases.commitMessage, source: releases.source, createdAt: releases.createdAt })
      .from(releases)
      .where(eq(releases.appId, app.id))
      .orderBy(desc(releases.createdAt))
      .limit(50);
    res.json({ releases: rows });
  });

  const envBody = z.object({
    name: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and dashes"),
    serverId: z.string().uuid(),
    strategy: z.enum(["blue_green", "recreate"]).default("blue_green"),
    healthPath: z.string().trim().regex(/^\/[A-Za-z0-9._~\/?=&%-]*$/).max(200).default("/"),
    autoDeploy: z.boolean().default(true),
  });

  router.post("/:id/environments", requireRole("admin"), async (req, res) => {
    const body = envBody.parse(req.body);
    const app = await loadApp(db, req.member!.orgId, req.params.id);
    const server = await loadServer(db, req.member!.orgId, body.serverId);
    const environment = await db.transaction(async (tx) => {
      // Two host ports per environment (blue and green), allocated per server.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${server.id}))`);
      const [{ maxPort }] = await tx.select({ maxPort: sql<number | null>`max(${environments.greenPort})` }).from(environments).where(eq(environments.serverId, server.id));
      const bluePort = maxPort ? maxPort + 1 : PORT_BASE;
      const slug = `${app.slug}-${body.name}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "x"}`.slice(0, 60);
      const [row] = await tx
        .insert(environments)
        .values({ orgId: app.orgId, appId: app.id, serverId: server.id, name: body.name, slug, strategy: body.strategy, healthPath: body.healthPath, autoDeploy: body.autoDeploy, bluePort, greenPort: bluePort + 1 })
        .returning();
      await tx.insert(backupConfigs).values({ environmentId: row.id });
      return row;
    });
    await audit(db, req, "environment.create", "environment", environment.id, { app: app.name, name: body.name, server: server.name });
    res.status(201).json({ environment });
  });

  return router;
}

export function environmentsRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.get("/:envId", async (req, res) => {
    const { environment, app, server } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const [current, previous] = await Promise.all(
      [environment.currentReleaseId, environment.previousReleaseId].map((id) =>
        id ? db.query.releases.findFirst({ where: eq(releases.id, id), columns: { composeContent: false } }) : Promise.resolve(null),
      ),
    );
    const domainRows = await db.select().from(domains).where(eq(domains.environmentId, environment.id)).orderBy(asc(domains.createdAt));
    const health = await db.query.healthChecks.findFirst({ where: eq(healthChecks.environmentId, environment.id) });
    const backup = await db.query.backupConfigs.findFirst({ where: eq(backupConfigs.environmentId, environment.id) });
    res.json({
      environment,
      app: publicApp(app, env),
      server: publicServer(server, env.INVEON_HEARTBEAT_TIMEOUT_SEC),
      currentRelease: current ?? null,
      previousRelease: previous ?? null,
      domains: domainRows,
      healthCheck: health ?? null,
      backupConfig: backup ?? null,
    });
  });

  router.patch("/:envId", requireRole("admin"), async (req, res) => {
    const body = z
      .object({
        healthPath: z.string().trim().regex(/^\/[A-Za-z0-9._~\/?=&%-]*$/).max(200).optional(),
        autoDeploy: z.boolean().optional(),
        releaseCommand: z.string().trim().max(2000).nullable().optional().transform((v) => (v === "" ? null : v)),
        releaseService: z.string().trim().regex(RELEASE_SERVICE_RE, "Enter the compose service name").nullable().optional().or(z.literal("").transform(() => null)),
      })
      .parse(req.body);
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const command = body.releaseCommand !== undefined ? body.releaseCommand : environment.releaseCommand;
    const service = body.releaseService !== undefined ? body.releaseService : environment.releaseService;
    if (command) {
      parseReleaseCommand(command);
      if (!service) throw new AppError("RELEASE_SERVICE_REQUIRED", "Choose the compose service the release command runs in", 400);
    }
    const [updated] = await db.update(environments).set(body).where(eq(environments.id, environment.id)).returning();
    await audit(db, req, "environment.update", "environment", environment.id, body);
    res.json({ environment: updated });
  });

  // Stops the running containers (a job on the server), then removes the record.
  router.delete("/:envId", requireRole("admin"), async (req, res) => {
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    let jobId: string | null = null;
    if (environment.activeSlot) {
      const job = await createJob(db, {
        orgId: environment.orgId,
        serverId: environment.serverId,
        type: "teardown",
        title: `Tear down ${app.name} / ${environment.name}`,
        createdBy: req.user!.sub,
        steps: [{ name: `Stop ${environment.activeSlot}`, action: "compose.down", params: { slug: environment.slug, slot: environment.activeSlot, composePath: app.composePath } }],
      });
      jobId = job.id;
      notifyServer(environment.serverId);
    }
    await db.delete(environments).where(eq(environments.id, environment.id));
    await audit(db, req, "environment.delete", "environment", environment.id, { app: app.name, name: environment.name, jobId });
    res.json({ ok: true, jobId });
  });

  // ---------------------------------------------------------------- env vars

  router.get("/:envId/vars", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const rows = await db.select().from(envVars).where(eq(envVars.environmentId, environment.id)).orderBy(asc(envVars.key));
    res.json({
      vars: rows.map((r) => ({
        key: r.key,
        isSecret: r.isSecret,
        // Secrets are write-only: never returned, to anyone.
        value: r.isSecret ? null : decryptValue(r.valueEnc, envVarAad(environment.id, r.key)),
        masked: r.isSecret ? "••••••••" : null,
        updatedAt: r.updatedAt,
      })),
    });
  });

  router.put("/:envId/vars/:key", requireRole("developer"), async (req, res) => {
    const key = req.params.key;
    if (!ENV_KEY_RE.test(key)) throw new AppError("INVALID_KEY", "Keys use letters, digits and underscores and can't start with a digit", 400);
    if (key.startsWith("INVEON_")) throw new AppError("RESERVED_KEY", "INVEON_* keys are set by Inveon Cloud", 400);
    const body = z.object({ value: z.string().max(32 * 1024), isSecret: z.boolean().default(false) }).parse(req.body);
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const valueEnc = encryptValue(body.value, envVarAad(environment.id, key));
    await db
      .insert(envVars)
      .values({ environmentId: environment.id, key, isSecret: body.isSecret, valueEnc, updatedBy: req.user!.sub })
      .onConflictDoUpdate({ target: [envVars.environmentId, envVars.key], set: { isSecret: body.isSecret, valueEnc, updatedBy: req.user!.sub, updatedAt: new Date() } });
    // The value itself is never written to the audit log.
    await audit(db, req, "env_var.set", "environment", environment.id, { key, isSecret: body.isSecret });
    res.json({ key, isSecret: body.isSecret });
  });

  router.delete("/:envId/vars/:key", requireRole("developer"), async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const deleted = await db.delete(envVars).where(and(eq(envVars.environmentId, environment.id), eq(envVars.key, req.params.key))).returning({ id: envVars.id });
    if (!deleted.length) throw new NotFoundError("Variable not found");
    await audit(db, req, "env_var.delete", "environment", environment.id, { key: req.params.key });
    res.json({ ok: true });
  });

  return router;
}
