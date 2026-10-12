import { Router } from "express";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { dashboards } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";
import type { Env } from "../shared/env.js";
import { canAccessProject } from "../projects/routes.js";
import { createdVsResolved, searchSchema, STAT_GROUPS, taskStats } from "./issues.js";

/**
 * Dashboards: a person's own page of gadgets (issue lists, pie charts,
 * created-vs-resolved, sprint burndown, workload). A shared dashboard is
 * visible to all staff; only its owner (or HR/admin) changes it. The data
 * endpoints apply the same visibility as issue search.
 */

const STAFF = ["intern", "employee", "manager", "hr", "admin", "super_admin"] as const;
const PRIVILEGED = ["hr", "admin", "super_admin"];
export const GADGETS = ["filter_results", "pie", "created_vs_resolved", "sprint_burndown", "workload", "assigned_to_me", "two_d_stats"] as const;

const gadgetSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(GADGETS),
  config: z.record(z.unknown()).default({}),
});
const dashboardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shared: z.boolean().default(false),
  gadgets: z.array(gadgetSchema).max(20).default([]),
});
// Search filters (as on the issue list) plus what to group by.
const statsSchema = searchSchema.pick({ projectId: true, assignee: true, status: true, priority: true, type: true, label: true, state: true, sprint: true, version: true }).extend({
  groupBy: z.enum(STAT_GROUPS).default("status"),
});
const cvrSchema = searchSchema.pick({ projectId: true, assignee: true, type: true, priority: true, label: true }).extend({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

export function dashboardsRouter(db: Database, env: Env) {
  const router = Router();
  router.use("/dashboards", requireAuth(env), requireRole(...STAFF));

  router.get("/dashboards/data/stats", async (req, res) => {
    const f = statsSchema.parse(req.query);
    if (f.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, f.projectId))) throw new ForbiddenError();
    res.json({ groupBy: f.groupBy, rows: await taskStats(db, req.user!, f, f.groupBy) });
  });

  router.get("/dashboards/data/created-vs-resolved", async (req, res) => {
    const f = cvrSchema.parse(req.query);
    if (f.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, f.projectId))) throw new ForbiddenError();
    res.json({ days: await createdVsResolved(db, req.user!, f, f.days) });
  });

  router.get("/dashboards", async (req, res) => {
    const rows = await db.query.dashboards.findMany({
      where: or(eq(dashboards.ownerId, req.user!.sub), eq(dashboards.shared, true)),
      orderBy: (d, { asc }) => [asc(d.createdAt)],
    });
    res.json({ dashboards: rows.map((d) => ({ ...d, mine: d.ownerId === req.user!.sub })) });
  });

  router.post("/dashboards", async (req, res) => {
    const body = dashboardSchema.parse(req.body);
    const [d] = await db.insert(dashboards).values({ ...body, ownerId: req.user!.sub }).returning();
    res.status(201).json({ dashboard: { ...d, mine: true } });
  });

  async function load(id: string, userId: string) {
    const d = await db.query.dashboards.findFirst({ where: eq(dashboards.id, id) });
    if (!d || (d.ownerId !== userId && !d.shared)) throw new NotFoundError("Dashboard not found");
    return d;
  }
  async function editable(id: string, user: { sub: string; role: string }) {
    const d = await load(id, user.sub);
    if (d.ownerId !== user.sub && !PRIVILEGED.includes(user.role)) throw new ForbiddenError("Only the dashboard's owner can change it");
    return d;
  }

  router.get("/dashboards/:id", async (req, res) => {
    const d = await load(req.params.id, req.user!.sub);
    res.json({ dashboard: { ...d, mine: d.ownerId === req.user!.sub } });
  });

  router.put("/dashboards/:id", async (req, res) => {
    const d = await editable(req.params.id, req.user!);
    const body = dashboardSchema.partial().parse(req.body);
    const [updated] = await db.update(dashboards).set({ ...body, updatedAt: new Date() }).where(and(eq(dashboards.id, d.id))).returning();
    res.json({ dashboard: { ...updated, mine: updated.ownerId === req.user!.sub } });
  });

  router.delete("/dashboards/:id", async (req, res) => {
    const d = await editable(req.params.id, req.user!);
    await db.delete(dashboards).where(eq(dashboards.id, d.id));
    res.status(204).end();
  });

  return router;
}
