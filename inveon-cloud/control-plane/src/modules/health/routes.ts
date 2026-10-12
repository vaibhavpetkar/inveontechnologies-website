import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { healthChecks } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { loadEnvironment } from "../apps/routes.js";
import { runCheck } from "./service.js";

const configSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//.test(u), "Use an http(s) URL"),
  intervalSec: z.number().int().min(30).max(3600).default(60),
  enabled: z.boolean().default(true),
});

export function healthRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.get("/:envId/health", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    res.json({ healthCheck: (await db.query.healthChecks.findFirst({ where: eq(healthChecks.environmentId, environment.id) })) ?? null });
  });

  router.put("/:envId/health", requireRole("admin"), async (req, res) => {
    const body = configSchema.parse(req.body);
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const [row] = await db
      .insert(healthChecks)
      .values({ environmentId: environment.id, ...body })
      .onConflictDoUpdate({ target: healthChecks.environmentId, set: { ...body, consecutiveFailures: 0 } })
      .returning();
    await audit(db, req, "health.configure", "environment", environment.id, body);
    res.json({ healthCheck: row });
  });

  router.post("/:envId/health/run", requireRole("developer"), async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const check = await db.query.healthChecks.findFirst({ where: eq(healthChecks.environmentId, environment.id) });
    if (!check) throw new NotFoundError("No health check configured");
    const result = await runCheck(db, check, env.INVEON_PUBLIC_URL);
    await audit(db, req, "health.run", "environment", environment.id, { ok: result.ok });
    res.json({ result, healthCheck: await db.query.healthChecks.findFirst({ where: eq(healthChecks.id, check.id) }) });
  });

  return router;
}
