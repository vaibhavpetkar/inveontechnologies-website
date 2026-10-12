import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { jobSteps, serverBootstrapTokens, servers } from "../../db/schema.js";
import { randomToken, sha256Hex } from "../../lib/crypto.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import { authRateLimiter } from "../auth/middleware.js";
import { bus, serverJobsEvent } from "../../lib/bus.js";
import { buildAgentPayload, claimNextJob, finishJob, reportStep } from "../jobs/service.js";
import { asc } from "drizzle-orm";

const factsSchema = z
  .object({
    hostname: z.string().max(255).optional(),
    os: z.string().max(255).optional(),
    cpuCount: z.number().int().min(0).max(100000).optional(),
    memoryBytes: z.number().int().min(0).optional(),
    diskTotalBytes: z.number().int().min(0).optional(),
    diskFreeBytes: z.number().int().min(0).optional(),
    dockerVersion: z.string().max(64).optional(),
    agentVersion: z.string().max(64).optional(),
  })
  .default({});

const registerSchema = z.object({ token: z.string().min(20).max(200), facts: factsSchema });

const stepReportSchema = z.object({
  status: z.enum(["running", "success", "failure"]).optional(),
  append: z.string().max(256 * 1024).optional(),
  result: z.record(z.unknown()).optional(),
});

const finishSchema = z.object({ status: z.enum(["success", "failure"]), error: z.string().max(4000).optional() });

/** Agent auth: a per-server random token, compared by its SHA-256 hash. No debug bypass. */
function requireAgent(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("Agent token required");
    const server = await db.query.servers.findFirst({ where: eq(servers.tokenHash, sha256Hex(header.slice(7))) });
    if (!server) throw new UnauthorizedError("Invalid agent token");
    req.server = { id: server.id, orgId: server.orgId };
    next();
  };
}

export function agentRouter(db: Database, env: Env) {
  const router = Router();
  router.use(express.json({ limit: "1mb" }));

  router.post("/register", authRateLimiter(env.INVEON_AUTH_RATE_LIMIT), async (req, res) => {
    const body = registerSchema.parse(req.body);
    // Single use and time-limited, in one atomic statement.
    const [used] = await db
      .update(serverBootstrapTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(serverBootstrapTokens.tokenHash, sha256Hex(body.token)), isNull(serverBootstrapTokens.usedAt), gt(serverBootstrapTokens.expiresAt, new Date())))
      .returning();
    if (!used) throw new AppError("INVALID_BOOTSTRAP_TOKEN", "Install token is invalid, used or expired. Create a new one in the dashboard.", 401);

    const agentToken = randomToken(48);
    const current = await db.query.servers.findFirst({ where: eq(servers.id, used.serverId) });
    const [server] = await db
      .update(servers)
      .set({
        ...body.facts,
        tokenHash: sha256Hex(agentToken),
        status: "online",
        ipAddress: current?.ipAddress ?? req.ip ?? null,
        registeredAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(servers.id, used.serverId))
      .returning();
    await writeAudit(db, { orgId: server.orgId, actorServerId: server.id, action: "server.register", entityType: "server", entityId: server.id, metadata: { hostname: body.facts.hostname }, ipAddress: req.ip });
    res.status(201).json({ serverId: server.id, agentToken });
  });

  router.use(requireAgent(db));

  router.post("/heartbeat", async (req, res) => {
    const { facts } = z.object({ facts: factsSchema }).parse(req.body ?? {});
    await db.update(servers).set({ ...facts, status: "online", lastSeenAt: new Date() }).where(eq(servers.id, req.server!.id));
    // Tells the agent it may poll the separate lane for live log streams.
    res.json({ ok: true, features: ["stream_lane"] });
  });

  // Long poll: waits up to INVEON_AGENT_POLL_TIMEOUT_MS for a job, else 204.
  router.post("/jobs/claim", async (req, res) => {
    const serverId = req.server!.id;
    const { lane } = z.object({ lane: z.enum(["main", "stream"]).default("main") }).parse(req.body ?? {});
    await db.update(servers).set({ lastSeenAt: new Date(), status: "online" }).where(eq(servers.id, serverId));
    const deadline = Date.now() + env.INVEON_AGENT_POLL_TIMEOUT_MS;
    let closed = false;
    req.on("close", () => (closed = true));
    for (;;) {
      const job = await claimNextJob(db, serverId, lane);
      if (job) {
        const steps = await db.select().from(jobSteps).where(eq(jobSteps.jobId, job.id)).orderBy(asc(jobSteps.position));
        res.json({ job: await buildAgentPayload(db, job, steps) });
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0 || closed) break;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          bus.off(serverJobsEvent(serverId), done);
          resolve();
        };
        const timer = setTimeout(done, Math.min(remaining, 5000));
        bus.on(serverJobsEvent(serverId), done);
      });
    }
    if (!closed) res.status(204).end();
  });

  router.post("/jobs/:jobId/steps/:stepId", async (req, res) => {
    const body = stepReportSchema.parse(req.body);
    await reportStep(db, req.server!.id, req.params.jobId, req.params.stepId, body);
    res.json({ ok: true });
  });

  router.post("/jobs/:jobId/finish", async (req, res) => {
    const body = finishSchema.parse(req.body);
    const job = await finishJob(db, req.server!.id, req.params.jobId, body);
    res.json({ status: job?.status ?? null });
  });

  return router;
}

export async function markOfflineServers(db: Database, timeoutSec: number) {
  await db.execute(sql`UPDATE servers SET status = 'offline' WHERE status = 'online' AND last_seen_at < now() - make_interval(secs => ${timeoutSec})`);
}
