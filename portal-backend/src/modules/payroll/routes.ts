import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { departments, designations, employees, employmentCertificates, payslips, salaryStructures } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { every } from "../shared/jobs.js";
import type { Env } from "../shared/env.js";
import { displayNameFor } from "../employees/onboarding.js";
import { PERIOD_RE, currentPeriod, monthlyGross, monthlyNet, periodLabel } from "./calc.js";
import { HR_ROLES, draftMonthlyPayslips, generatePayslips, issueDueInternshipCertificates, issueEmploymentCertificate, publishPayslips, structureFor } from "./service.js";
import { renderPayslipPdf } from "./pdf.js";

const isHr = (role: string) => (HR_ROLES as readonly string[]).includes(role);
const periodSchema = z.string().regex(PERIOD_RE, "Use YYYY-MM");
const componentSchema = z.object({ name: z.string().trim().min(1).max(60), amount: z.number().min(0).max(10_000_000), kind: z.enum(["earning", "deduction"]) });
const structureSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  components: z.array(componentSchema).min(1).max(20).refine((c) => c.some((x) => x.kind === "earning" && x.amount > 0), "Add at least one earning"),
});

export function registerPayrollSchedules(db: Database, env: Env) {
  every("payroll-drafts", 6 * 60 * 60 * 1000, async () => {
    await draftMonthlyPayslips(db, env.PAYROLL_DRAFT_DAY);
  });
  every("completion-certificates", 6 * 60 * 60 * 1000, async () => {
    await issueDueInternshipCertificates(db, env.PORTAL_APP_URL);
  });
}

async function employeeOr404(db: Database, id: string) {
  const employee = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!employee) throw new NotFoundError("Employee not found");
  return employee;
}

async function slipView(db: Database, slip: typeof payslips.$inferSelect) {
  const employee = await employeeOr404(db, slip.employeeId);
  const [designation, department, name] = await Promise.all([
    employee.designationId ? db.query.designations.findFirst({ where: eq(designations.id, employee.designationId) }) : null,
    employee.departmentId ? db.query.departments.findFirst({ where: eq(departments.id, employee.departmentId) }) : null,
    displayNameFor(db, employee.userId),
  ]);
  return {
    ...slip,
    periodLabel: periodLabel(slip.period),
    employee: { id: employee.id, userId: employee.userId, businessId: employee.businessId, name, designation: designation?.title ?? null, department: department?.name ?? null, joiningDate: employee.joiningDate },
  };
}

export function payrollRouter(db: Database, env: Env) {
  const router = Router();

  /** Everyone on payroll with their current structure and this period's slip. */
  router.get("/overview", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const period = periodSchema.parse(req.query.period ?? currentPeriod());
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT e.id, e.business_id AS "businessId", e.employee_type AS "employeeType", e.status, e.joining_date AS "joiningDate",
             coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name, u.email,
             g.title AS designation,
             p.id AS "slipId", p.status AS "slipStatus", p.gross, p.total_deductions AS "totalDeductions", p.net, p.lop_days AS "lopDays", p.payable_days AS "payableDays", p.days_in_month AS "daysInMonth"
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      LEFT JOIN designations g ON g.id = e.designation_id
      LEFT JOIN payslips p ON p.employee_id = e.id AND p.period = ${period}
      WHERE e.status <> 'offboarded' OR p.id IS NOT NULL
      ORDER BY name
    `);
    const people = [];
    for (const r of rows.rows) {
      const structure = await structureFor(db, r.id as string, period);
      people.push({ ...r, salary: structure ? { effectiveFrom: structure.effectiveFrom, components: structure.components, gross: monthlyGross(structure.components), net: monthlyNet(structure.components) } : null });
    }
    res.json({ period, periodLabel: periodLabel(period), people });
  });

  router.get("/employees/:id/salary", requireAuth(env), async (req, res) => {
    const employee = await employeeOr404(db, req.params.id);
    if (employee.userId !== req.user!.sub && !isHr(req.user!.role)) throw new ForbiddenError();
    const history = await db.query.salaryStructures.findMany({ where: eq(salaryStructures.employeeId, employee.id), orderBy: [desc(salaryStructures.effectiveFrom), desc(salaryStructures.createdAt)] });
    res.json({ history, current: history.find((h) => h.effectiveFrom <= new Date()) ?? history[history.length - 1] ?? null });
  });

  /** Sets a new salary structure from a date (history is kept; nothing is overwritten). */
  router.put("/employees/:id/salary", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const employee = await employeeOr404(db, req.params.id);
    const body = structureSchema.parse(req.body);
    const [structure] = await db
      .insert(salaryStructures)
      .values({ employeeId: employee.id, effectiveFrom: new Date(`${body.effectiveFrom}T00:00:00Z`), components: body.components, createdBy: req.user!.sub })
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "payroll.salary_set", entityType: "employee", entityId: employee.id, metadata: { effectiveFrom: body.effectiveFrom, gross: monthlyGross(body.components) }, ipAddress: req.ip });
    res.status(201).json({ structure });
  });

  /** Creates or refreshes the month's draft slips. Optional per-person loss-of-pay days. */
  router.post("/run", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const body = z.object({ period: periodSchema, employeeIds: z.array(z.string().uuid()).optional(), lop: z.record(z.string().uuid(), z.number().min(0).max(31)).optional() }).parse(req.body);
    const result = await generatePayslips(db, body.period, { actorUserId: req.user!.sub, employeeIds: body.employeeIds, lop: body.lop });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "payroll.run", entityType: "payslip", metadata: { period: body.period, created: result.created.length, updated: result.updated.length }, ipAddress: req.ip });
    res.json({ created: result.created.length, updated: result.updated.length, skipped: result.skipped });
  });

  router.patch("/slips/:id", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const body = z.object({ lopDays: z.number().min(0).max(31).optional(), note: z.string().max(500).nullable().optional() }).parse(req.body);
    const slip = await db.query.payslips.findFirst({ where: eq(payslips.id, req.params.id) });
    if (!slip) throw new NotFoundError("Payslip not found");
    if (slip.status !== "draft") throw new AppError("PAYSLIP_PUBLISHED", "A published payslip can't be changed", 409);
    if (body.note !== undefined) await db.update(payslips).set({ note: body.note }).where(eq(payslips.id, slip.id));
    if (body.lopDays !== undefined) await generatePayslips(db, slip.period, { actorUserId: req.user!.sub, employeeIds: [slip.employeeId], lop: { [slip.employeeId]: body.lopDays } });
    const updated = await db.query.payslips.findFirst({ where: eq(payslips.id, slip.id) });
    res.json({ slip: updated });
  });

  router.post("/publish", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const body = z.object({ period: periodSchema, ids: z.array(z.string().uuid()).optional() }).parse(req.body);
    const rows = await publishPayslips(db, body.period, req.user!.sub, body.ids);
    res.json({ published: rows.length });
  });

  router.get("/me", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.userId, req.user!.sub) });
    if (!employee) {
      res.json({ employee: null, slips: [], certificates: [], salary: null });
      return;
    }
    const [slips, certificates, salary] = await Promise.all([
      db.query.payslips.findMany({ where: and(eq(payslips.employeeId, employee.id), eq(payslips.status, "published")), orderBy: desc(payslips.period) }),
      db.query.employmentCertificates.findMany({ where: eq(employmentCertificates.employeeId, employee.id), orderBy: desc(employmentCertificates.issuedAt) }),
      structureFor(db, employee.id, currentPeriod()),
    ]);
    res.json({
      employee: { id: employee.id, businessId: employee.businessId, employeeType: employee.employeeType, joiningDate: employee.joiningDate, durationMonths: employee.durationMonths },
      slips: slips.map((s) => ({ ...s, periodLabel: periodLabel(s.period) })),
      certificates,
      salary: salary ? { components: salary.components, gross: monthlyGross(salary.components), net: monthlyNet(salary.components) } : null,
    });
  });

  const slipForViewer = async (req: import("express").Request) => {
    const slip = await db.query.payslips.findFirst({ where: eq(payslips.id, req.params.id) });
    if (!slip) throw new NotFoundError("Payslip not found");
    const employee = await employeeOr404(db, slip.employeeId);
    const own = employee.userId === req.user!.sub;
    // Employees only ever see published slips; other people's slips are HR only.
    if (!(isHr(req.user!.role) || (own && slip.status === "published"))) throw new ForbiddenError();
    return slip;
  };

  router.get("/slips/:id", requireAuth(env), async (req, res) => {
    res.json({ slip: await slipView(db, await slipForViewer(req)) });
  });

  router.get("/slips/:id/pdf", requireAuth(env), async (req, res) => {
    const view = await slipView(db, await slipForViewer(req));
    const pdf = await renderPayslipPdf({
      periodLabel: view.periodLabel,
      employeeName: view.employee.name,
      employeeId: view.employee.businessId ?? "",
      designation: view.employee.designation,
      department: view.employee.department,
      joiningDate: view.employee.joiningDate,
      daysInMonth: view.daysInMonth,
      payableDays: Number(view.payableDays),
      lopDays: Number(view.lopDays),
      earnings: view.earnings,
      deductions: view.deductions,
      gross: Number(view.gross),
      totalDeductions: Number(view.totalDeductions),
      net: Number(view.net),
      publishedAt: view.publishedAt,
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "payslip.download", entityType: "payslip", entityId: view.id, ipAddress: req.ip });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="payslip-${view.period}.pdf"`);
    res.send(Buffer.from(pdf));
  });

  // --- Completion / experience certificates ---

  router.get("/employees/:id/certificates", requireAuth(env), async (req, res) => {
    const employee = await employeeOr404(db, req.params.id);
    if (employee.userId !== req.user!.sub && !isHr(req.user!.role)) throw new ForbiddenError();
    res.json({ certificates: await db.query.employmentCertificates.findMany({ where: eq(employmentCertificates.employeeId, employee.id), orderBy: desc(employmentCertificates.issuedAt) }) });
  });

  router.post("/employees/:id/certificates", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const employee = await employeeOr404(db, req.params.id);
    const body = z.object({ toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body ?? {});
    const { certificate, created } = await issueEmploymentCertificate(db, employee, { actorUserId: req.user!.sub, toDate: body.toDate ? new Date(`${body.toDate}T00:00:00Z`) : undefined, appUrl: env.PORTAL_APP_URL });
    res.status(created ? 201 : 200).json({ certificate, created });
  });

  router.post("/certificates/:id/revoke", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const [certificate] = await db
      .update(employmentCertificates)
      .set({ status: "revoked", revokedAt: new Date(), revokeReason: reason })
      .where(and(eq(employmentCertificates.id, req.params.id), eq(employmentCertificates.status, "issued")))
      .returning();
    if (!certificate) throw new NotFoundError("No issued certificate with that id");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employment_certificate.revoke", entityType: "employment_certificate", entityId: certificate.id, metadata: { reason }, ipAddress: req.ip });
    res.json({ certificate });
  });

  return router;
}
