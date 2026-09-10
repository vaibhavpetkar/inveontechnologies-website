import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { savedReportViews, exportJobs } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { getReportRows, REPORT_KEYS, type ReportKey } from "./data.js";
import { toCsv } from "./csv.js";
import type { Env } from "../shared/env.js";

// Employee PII and audit logs are more sensitive than operational
// recruitment/course reports — HR can see the latter, only Admin/Super
// Admin can see the former. Neither payments nor email-job reports exist
// (see schema.ts) so there's nothing to gate for those.
const OPERATIONAL_ROLES = ["hr", "admin", "super_admin"] as const;
const SENSITIVE_ROLES = ["admin", "super_admin"] as const;
const SENSITIVE_REPORTS = new Set<ReportKey>(["employees", "audit-logs"]);

const dateRangeSchema = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });
const paginationSchema = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100) });
const exportSchema = z.object({
  reportKey: z.enum(REPORT_KEYS),
  format: z.enum(["csv", "xlsx", "pdf"]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const saveViewSchema = z.object({ reportKey: z.string().min(1), name: z.string().min(1).max(200), filters: z.record(z.unknown()).default({}) });

function requiredRoleFor(key: ReportKey): readonly string[] {
  return SENSITIVE_REPORTS.has(key) ? SENSITIVE_ROLES : OPERATIONAL_ROLES;
}

export function reportsRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/recruitment-conversion", requireAuth(env), requireRole(...OPERATIONAL_ROLES), async (req, res) => {
    const range = dateRangeSchema.parse(req.query);
    const rows = await getReportRows(db, "applications", { from: range.from ? new Date(range.from) : undefined, to: range.to ? new Date(range.to) : undefined });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;

    const submitted = rows.length;
    const selected = counts.selected ?? 0;
    const shortlisted = counts.shortlisted ?? 0;
    res.json({
      totalApplications: submitted,
      byStatus: counts,
      conversionRates: {
        submittedToShortlisted: submitted ? Math.round((shortlisted / submitted) * 100) : 0,
        submittedToSelected: submitted ? Math.round((selected / submitted) * 100) : 0,
      },
    });
  });

  router.get("/payments", requireAuth(env), requireRole(...SENSITIVE_ROLES), (_req, res) => {
    res.status(501).json({ implemented: false, reason: "Payments (Phase 5 / Cashfree) has not been built yet — no payment data exists to report on." });
  });
  router.get("/payment-reconciliation", requireAuth(env), requireRole(...SENSITIVE_ROLES), (_req, res) => {
    res.status(501).json({ implemented: false, reason: "Payments (Phase 5) has not been built yet — there are no application payment records or gateway events to reconcile." });
  });
  router.get("/email-jobs", requireAuth(env), requireRole(...SENSITIVE_ROLES), (_req, res) => {
    res.status(501).json({ implemented: false, reason: "Real email/outbox (Phase 9) has not been built yet — only stubbed, logged 'would send' events exist, not queryable job records." });
  });

  router.post("/export", requireAuth(env), async (req, res) => {
    const body = exportSchema.parse(req.body);
    const requiredRoles = requiredRoleFor(body.reportKey);
    if (!requiredRoles.includes(req.user!.role as (typeof requiredRoles)[number])) {
      throw new AppError("FORBIDDEN", "You do not have permission to export this report", 403);
    }

    if (body.format !== "csv") {
      await db.insert(exportJobs).values({ requestedBy: req.user!.sub, reportKey: body.reportKey, format: body.format, filters: { from: body.from, to: body.to }, status: "not_implemented" });
      res.status(501).json({ implemented: false, reason: `${body.format.toUpperCase()} export is not implemented in this phase — only CSV is genuinely generated. No xlsx/pdf library is wired in.` });
      return;
    }

    const rows = await getReportRows(db, body.reportKey, { from: body.from ? new Date(body.from) : undefined, to: body.to ? new Date(body.to) : undefined });
    const csv = toCsv(rows);

    await db.insert(exportJobs).values({ requestedBy: req.user!.sub, reportKey: body.reportKey, format: "csv", filters: { from: body.from, to: body.to }, status: "completed", rowCount: rows.length });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${body.reportKey}.csv"`);
    res.send(csv);
  });

  router.get("/export/jobs", requireAuth(env), requireRole(...SENSITIVE_ROLES), async (_req, res) => {
    res.json({ jobs: await db.query.exportJobs.findMany({ orderBy: (j, { desc }) => [desc(j.createdAt)], limit: 200 }) });
  });

  router.post("/saved-views", requireAuth(env), requireRole(...OPERATIONAL_ROLES), async (req, res) => {
    const body = saveViewSchema.parse(req.body);
    const [view] = await db.insert(savedReportViews).values({ userId: req.user!.sub, ...body }).returning();
    res.status(201).json({ view });
  });

  router.get("/saved-views", requireAuth(env), requireRole(...OPERATIONAL_ROLES), async (req, res) => {
    res.json({ views: await db.query.savedReportViews.findMany({ where: eq(savedReportViews.userId, req.user!.sub) }) });
  });

  router.delete("/saved-views/:id", requireAuth(env), requireRole(...OPERATIONAL_ROLES), async (req, res) => {
    const view = await db.query.savedReportViews.findFirst({ where: eq(savedReportViews.id, req.params.id) });
    if (!view) throw new NotFoundError("Saved view not found");
    if (view.userId !== req.user!.sub) throw new AppError("FORBIDDEN", "Cannot delete another user's saved view", 403);
    await db.delete(savedReportViews).where(eq(savedReportViews.id, view.id));
    res.json({ message: "Saved view deleted." });
  });

  // NOTE: /:key is registered AFTER every literal single-segment path
  // (payments, payment-reconciliation, email-jobs, saved-views) on
  // purpose — same route-shadowing issue caught live in Phase 7's tasks
  // router. Express matches in registration order; "/saved-views" would
  // otherwise be captured by "/:key" first.
  router.get("/:key", requireAuth(env), async (req, res) => {
    const key = req.params.key as ReportKey;
    if (!REPORT_KEYS.includes(key)) throw new NotFoundError(`Unknown report "${req.params.key}"`);
    const requiredRoles = requiredRoleFor(key);
    if (!requiredRoles.includes(req.user!.role as (typeof requiredRoles)[number])) {
      throw new AppError("FORBIDDEN", "You do not have permission to view this report", 403);
    }

    const range = dateRangeSchema.parse(req.query);
    const pagination = paginationSchema.parse(req.query);
    const allRows = await getReportRows(db, key, { from: range.from ? new Date(range.from) : undefined, to: range.to ? new Date(range.to) : undefined });
    const page = allRows.slice(pagination.offset, pagination.offset + pagination.limit);

    res.json({ reportKey: key, total: allRows.length, offset: pagination.offset, limit: pagination.limit, rows: page });
  });

  return router;
}
