import "express-async-errors";
import express, { Router } from "express";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import type { Database } from "./db/client.js";
import type { Env } from "./env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, NotFoundError } from "./lib/errors.js";
import { authRouter } from "./modules/auth/routes.js";
import { requireAuth, requireMember } from "./modules/auth/middleware.js";
import { orgCreateRouter, orgRouter } from "./modules/orgs/routes.js";
import { serversRouter } from "./modules/servers/routes.js";
import { agentRouter } from "./modules/agent/routes.js";
import { appsRouter, environmentsRouter } from "./modules/apps/routes.js";
import { deploysRouter, webhookRouter } from "./modules/deploys/routes.js";
import { jobsRouter } from "./modules/jobs/routes.js";
import { domainsRouter } from "./modules/domains/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import { backupsRouter } from "./modules/backups/routes.js";
import { registerPreviewHooks } from "./modules/previews/service.js";
import { alertsRouter } from "./modules/alerts/routes.js";
import { configureAlerts } from "./modules/alerts/service.js";
import { configureOutbound } from "./lib/outbound.js";
import { platformRouter } from "./modules/keys/routes.js";
import { awsRouter } from "./modules/aws/routes.js";
import { cloudRouter } from "./modules/cloud/routes.js";
import { configureProviderApis } from "./modules/cloud/http.js";
import { metricsRouter } from "./modules/metrics/routes.js";
import { scrapeRouter, scrapeTokensRouter } from "./modules/metrics/prometheus.js";
import { githubAppWebhookRouter, githubRouter, githubSetupRouter } from "./modules/github/routes.js";

export function createApp(db: Database, pool: pg.Pool, env: Env) {
  registerPreviewHooks(env);
  configureOutbound(env.INVEON_ALERT_PRIVATE_HOSTS);
  configureAlerts(env.INVEON_PUBLIC_URL);
  configureProviderApis({ digitalocean: env.INVEON_DIGITALOCEAN_API_BASE, hetzner: env.INVEON_HETZNER_API_BASE, cloudflare: env.INVEON_CLOUDFLARE_API_BASE });
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const id = typeof existing === "string" && existing.length < 100 ? existing : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/api/v1/health/live" },
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  // Raw-body and agent routes parse their own bodies.
  app.use("/api/v1/webhooks", webhookRouter(db, env));
  app.use("/api/v1/webhooks", githubAppWebhookRouter(db, env));
  app.use("/api/v1/agent", agentRouter(db, env));

  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  app.get("/api/v1/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/v1/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "degraded" });
    }
  });

  app.use("/api/v1/auth", authRouter(db, env));
  app.use("/api/v1/orgs", requireAuth(env), orgCreateRouter(db));
  app.use("/api/v1/platform", requireAuth(env), platformRouter(db, env));
  app.use("/api/v1/github", githubSetupRouter(db, env));

  const org = Router({ mergeParams: true });
  org.use(requireAuth(env), requireMember(db));
  // DigitalOcean and Hetzner first: their refresh and terminate pass EC2 servers on.
  org.use("/", cloudRouter(db, env));
  org.use("/", awsRouter(db, env));
  org.use("/servers", serversRouter(db, env));
  org.use("/apps", appsRouter(db, env));
  org.use("/environments", environmentsRouter(db, env));
  org.use("/environments", deploysRouter(db, env));
  org.use("/environments", healthRouter(db, env));
  org.use("/jobs", jobsRouter(db));
  org.use("/", domainsRouter(db, env));
  org.use("/", backupsRouter(db));
  org.use("/", alertsRouter(db));
  org.use("/", metricsRouter(db));
  org.use("/", scrapeTokensRouter(db));
  org.use("/", githubRouter(db));
  org.use("/", orgRouter(db, env));
  app.use("/api/v1/orgs/:orgId", org);

  app.use("/api/v1", (_req, _res) => {
    throw new NotFoundError("No such endpoint");
  });

  // Prometheus scrape endpoint (read-only, per-organization scrape token).
  app.use("/", scrapeRouter(db, env));

  // install.sh and the agent bundle for the one-line install command.
  const agentDir = env.INVEON_AGENT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "agent");
  app.get("/install.sh", (_req, res) => {
    const file = join(agentDir, "install.sh");
    if (!existsSync(file)) throw new NotFoundError("install.sh is not available on this control plane");
    const script = readFileSync(file, "utf8").replace(/__INVEON_URL__/g, env.INVEON_PUBLIC_URL.replace(/\/$/, ""));
    res.type("text/x-shellscript").send(script);
  });
  app.get("/agent/inveon-agent.tar.gz", (_req, res) => {
    const file = join(agentDir, "inveon-agent.tar.gz");
    if (!existsSync(file)) throw new NotFoundError("Agent bundle not built (run npm run bundle in agent/)");
    res.type("application/gzip").sendFile(file);
  });

  // The dashboard, served from the same origin so the refresh cookie stays first-party.
  if (env.INVEON_DASHBOARD_DIR && existsSync(env.INVEON_DASHBOARD_DIR)) {
    const dir = resolve(env.INVEON_DASHBOARD_DIR);
    app.use(express.static(dir, { index: false, maxAge: "1h" }));
    app.get("*", (_req, res) => res.sendFile(join(dir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
