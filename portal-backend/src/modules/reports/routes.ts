import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { savedReportViews, exportJobs, jobs } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { getReportRows, REPORT_KEYS, type ReportKey } from "./data.js";
import { readable, REPORTS } from "./columns.js";
import { toCsv } from "./csv.js";
import { toXlsx } from "./xlsx.js";
import { toPdf } from "./pdf.js";
import type { Env } from "../shared/env.js";

// Employee PII and audit logs are more sensitive than operational
// reports — HR can see the latter, only Admin/Super Admin the former
// (marked `sensitive` in columns.ts).
const OPERATIONAL_ROLES = ["hr", "admin", "super_admin"] as const;
const SENSITIVE_ROLES = ["admin", "super_admin"] as const;
const SENSITIVE_REPORTS = new Set<ReportKey>(REPORT_KEYS.filter((k) => "sensitive" in REPORTS[k] && REPORTS[k].sensitive));

const dateRangeSchema = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });
const paginationSchema = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100) });
const exportSchema = z.object({
  reportKey: z.enum(REPORT_KEYS),
  format: z.enum(["csv", "xlsx", "pdf"]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const saveViewSchema = z.object({ reportKey: z.string().min(1), name: z.string().min(1).max(200), filters: z.record(z.unknown()).default({}) });

const fmtDay = (d: Date | string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: typeof d === "string" ? "UTC" : "Asia/Kolkata" }).format(typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d);

/** "1 Sep 2026 to 28 Sep 2026 · 12 rows · generated 28 Sep 2026, 11:59 pm" for the PDF heading. */
function describeRange(key: ReportKey, range: { from?: Date; to?: Date }, rows: Record<string, unknown>[]) {
  let span = range.from && range.to ? `${fmtDay(range.from)} to ${fmtDay(range.to)}` : range.from ? `From ${fmtDay(range.from)}` : range.to ? `Up to ${fmtDay(range.to)}` : "All dates";
  if (key === "attendance" && rows[0]) span = `${fmtDay(String(rows[0].from))} to ${fmtDay(String(rows[0].to))}`;
  const at = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
  return `${span} · ${rows.length} ${rows.length === 1 ? "row" : "rows"} · generated ${at} IST`;
}

function requiredRoleFor(key: ReportKey): readonly string[] {
  return SENSITIVE_REPORTS.has(key) ? SENSITIVE_ROLES : OPERATIONAL_ROLES;
}

export function reportsRouter(db: Database, env: Env) {
  const router = Router();

  /** The reports this person may open, with their columns. */
  router.get("/", requireAuth(env), requireRole(...OPERATIONAL_ROLES), (req, res) => {
    res.json({
      reports: REPORT_KEYS.filter((k) => requiredRoleFor(k).includes(req.user!.role)).map((key) => ({ key, title: REPORTS[key].title, description: REPORTS[key].description, columns: REPORTS[key].columns })),
    });
  });

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
  // Queued notification emails and whether they went out (see shared/jobs.ts).
  router.get("/email-jobs", requireAuth(env), requireRole(...SENSITIVE_ROLES), async (req, res) => {
    const status = z.enum(["pending", "running", "done", "failed"]).optional().parse(req.query.status);
    const rows = await db.query.jobs.findMany({
      where: status ? and(eq(jobs.type, "email.send"), eq(jobs.status, status)) : eq(jobs.type, "email.send"),
      orderBy: [desc(jobs.createdAt)],
      limit: 100,
    });
    res.json({
      jobs: rows.map((j) => {
        const p = j.payload as { to?: string; subject?: string };
        return { id: j.id, status: j.status, to: p.to, subject: p.subject, attempts: j.attempts, lastError: j.lastError, createdAt: j.createdAt, finishedAt: j.finishedAt };
      }),
    });
  });

  router.post("/export", requireAuth(env), async (req, res) => {
    const body = exportSchema.parse(req.body);
    const requiredRoles = requiredRoleFor(body.reportKey);
    if (!requiredRoles.includes(req.user!.role as (typeof requiredRoles)[number])) {
      throw new AppError("FORBIDDEN", "You do not have permission to export this report", 403);
    }

    const range = { from: body.from ? new Date(body.from) : undefined, to: body.to ? new Date(body.to) : undefined };
    const rows = readable(body.reportKey, await getReportRows(db, body.reportKey, range));
    const def = REPORTS[body.reportKey];
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${body.reportKey}-${stamp}.${body.format}`;

    let file: Buffer | string;
    let type: string;
    if (body.format === "csv") {
      file = toCsv(rows.map((r) => Object.fromEntries(def.columns.map((c) => [c.label, r[c.key]]))));
      type = "text/csv; charset=utf-8";
    } else if (body.format === "xlsx") {
      file = toXlsx(def.title, def.columns, rows);
      type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      file = await toPdf({ title: def.title, subtitle: describeRange(body.reportKey, range, rows), columns: def.columns, rows });
      type = "application/pdf";
    }

    await db.insert(exportJobs).values({ requestedBy: req.user!.sub, reportKey: body.reportKey, format: body.format, filters: { from: body.from, to: body.to }, status: "completed", rowCount: rows.length });

    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(file);
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
    const page = readable(key, allRows.slice(pagination.offset, pagination.offset + pagination.limit));

    res.json({ reportKey: key, title: REPORTS[key].title, columns: REPORTS[key].columns, total: allRows.length, offset: pagination.offset, limit: pagination.limit, rows: page });
  });

  return router;
}
