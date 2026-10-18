import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { metricAlertRules, metricIncidents, servers, type MetricRuleKind } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { loadEnvironment } from "../apps/routes.js";
import { containerSummary, environmentProjects, projectSeries, rangeSchema, serverSeries } from "./service.js";
import { MAX_FOR_MINUTES, METRIC_KINDS, METRIC_LABEL, SUGGESTED_RULES, effectiveRules } from "./alerts.js";

const uuid = z.string().uuid();

async function loadOrgServer(db: Database, orgId: string, id: string) {
  const parsed = uuid.safeParse(id);
  const server = parsed.success ? await db.query.servers.findFirst({ where: and(eq(servers.id, parsed.data), eq(servers.orgId, orgId)) }) : null;
  if (!server) throw new NotFoundError("Server not found");
  return server;
}

const ruleSchema = z
  .object({
    // null or missing: the organization's default for this metric.
    serverId: uuid.nullable().default(null),
    metric: z.enum(METRIC_KINDS as [MetricRuleKind, ...MetricRuleKind[]]),
    thresholdPct: z.number().int().min(1).max(100).nullable().default(null),
    forMinutes: z.number().int().min(0).max(MAX_FOR_MINUTES).default(0),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.metric !== "offline" && r.thresholdPct === null) ctx.addIssue({ code: "custom", path: ["thresholdPct"], message: "A threshold is required" });
  });

/** Metrics, threshold rules and incidents for the dashboard. Everyone in the organization can read; admins change rules. */
export function metricsRouter(db: Database) {
  const router = Router({ mergeParams: true });

  router.get("/servers/:id/metrics", async (req, res) => {
    const { range } = z.object({ range: rangeSchema }).parse(req.query);
    const server = await loadOrgServer(db, req.member!.orgId, req.params.id);
    const now = new Date();
    const [series, containers] = await Promise.all([serverSeries(db, server.id, range, now), containerSummary(db, server.id, range, now)]);
    res.json({ ...series, ...containers });
  });

  router.get("/servers/:id/incidents", async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    const server = await loadOrgServer(db, req.member!.orgId, req.params.id);
    const rows = await db.select().from(metricIncidents).where(eq(metricIncidents.serverId, server.id)).orderBy(desc(metricIncidents.startedAt)).limit(limit);
    res.json({ incidents: rows });
  });

  /** Open incidents of the whole organization (badges on the server list). */
  router.get("/metric-incidents", async (req, res) => {
    const rows = await db
      .select()
      .from(metricIncidents)
      .where(and(eq(metricIncidents.orgId, req.member!.orgId), isNull(metricIncidents.resolvedAt)))
      .orderBy(asc(metricIncidents.startedAt));
    res.json({ incidents: rows });
  });

  // An environment's containers on its server: the app page's resource view.
  router.get("/environments/:envId/resources", async (req, res) => {
    const { range } = z.object({ range: rangeSchema }).parse(req.query);
    const { environment, server } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const projects = environmentProjects(environment.slug);
    const now = new Date();
    const [series, containers] = await Promise.all([projectSeries(db, server.id, projects, range, now), containerSummary(db, server.id, range, now, projects)]);
    res.json({ ...series, ...containers, serverId: server.id });
  });

  router.get("/metric-alert-rules", async (req, res) => {
    const q = z.object({ serverId: uuid.optional() }).parse(req.query);
    const rules = await db.select().from(metricAlertRules).where(eq(metricAlertRules.orgId, req.member!.orgId)).orderBy(asc(metricAlertRules.createdAt));
    let effective = null;
    if (q.serverId) {
      const server = await loadOrgServer(db, req.member!.orgId, q.serverId);
      effective = Object.fromEntries(effectiveRules(rules, server.id));
    }
    res.json({
      rules: q.serverId ? rules.filter((r) => r.serverId === null || r.serverId === q.serverId) : rules,
      effective,
      metrics: METRIC_KINDS.map((id) => ({ id, label: METRIC_LABEL[id], suggested: SUGGESTED_RULES[id] })),
    });
  });

  // Create or replace the rule for (server or organization, metric).
  router.put("/metric-alert-rules", requireRole("admin"), async (req, res) => {
    const body = ruleSchema.parse(req.body);
    if (body.serverId) await loadOrgServer(db, req.member!.orgId, body.serverId);
    const values = { thresholdPct: body.metric === "offline" ? null : body.thresholdPct, forMinutes: body.forMinutes, enabled: body.enabled };
    const existing = await db.query.metricAlertRules.findFirst({
      where: and(eq(metricAlertRules.orgId, req.member!.orgId), eq(metricAlertRules.metric, body.metric), body.serverId ? eq(metricAlertRules.serverId, body.serverId) : isNull(metricAlertRules.serverId)),
    });
    const [row] = existing
      ? await db
          .update(metricAlertRules)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(metricAlertRules.id, existing.id))
          .returning()
      : await db
          .insert(metricAlertRules)
          .values({ orgId: req.member!.orgId, serverId: body.serverId, metric: body.metric, ...values, createdBy: req.user!.sub })
          .returning();
    await audit(db, req, existing ? "metric_rule.update" : "metric_rule.create", "metric_rule", row.id, { serverId: body.serverId, metric: body.metric, ...values });
    res.status(existing ? 200 : 201).json({ rule: row });
  });

  router.delete("/metric-alert-rules/:id", requireRole("admin"), async (req, res) => {
    const id = uuid.safeParse(req.params.id);
    const row = id.success ? await db.query.metricAlertRules.findFirst({ where: and(eq(metricAlertRules.id, id.data), eq(metricAlertRules.orgId, req.member!.orgId)) }) : null;
    if (!row) throw new NotFoundError("Rule not found");
    await db.delete(metricAlertRules).where(eq(metricAlertRules.id, row.id));
    await audit(db, req, "metric_rule.delete", "metric_rule", row.id, { serverId: row.serverId, metric: row.metric });
    res.json({ ok: true });
  });

  return router;
}
