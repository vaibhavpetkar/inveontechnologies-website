import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { designations, employees, employmentCertificates, payslips, salaryStructures, users } from "../shared/db/schema.js";
import { formatBusinessId } from "../shared/business-id.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { displayNameFor } from "../employees/onboarding.js";
import { logger } from "../shared/logger.js";
import { suggestedLopDays } from "../attendance/service.js";
import { computeSlip, currentPeriod, periodBounds, periodLabel } from "./calc.js";

type Employee = typeof employees.$inferSelect;
type Payslip = typeof payslips.$inferSelect;

export const HR_ROLES = ["hr", "admin", "super_admin"] as const;

async function hrUserIds(db: Database) {
  const rows = await db.query.users.findMany({ where: inArray(users.role, [...HR_ROLES]), columns: { id: true } });
  return rows.map((r) => r.id);
}

/** The structure in force during a period: the latest one effective by the month's last day. */
export async function structureFor(db: Database, employeeId: string, period: string) {
  const { end } = periodBounds(period);
  return db.query.salaryStructures.findFirst({
    where: and(eq(salaryStructures.employeeId, employeeId), lte(salaryStructures.effectiveFrom, new Date(end.getTime() - 1))),
    orderBy: [desc(salaryStructures.effectiveFrom), desc(salaryStructures.createdAt)],
  });
}

/**
 * Creates or refreshes draft payslips for a month. Published slips are left
 * alone. `lop` overrides loss-of-pay days per employee; otherwise a draft
 * keeps the days it already had, and a new one starts from
 * unpaid leave and absences (attendance/service.ts). `onlyMissing` skips employees who already
 * have a slip (the monthly job uses it so it never touches HR's drafts).
 */
export async function generatePayslips(
  db: Database,
  period: string,
  opts: { actorUserId: string | null; employeeIds?: string[]; lop?: Record<string, number>; onlyMissing?: boolean },
) {
  const { end } = periodBounds(period);
  const staff = await db.query.employees.findMany({
    where: and(
      inArray(employees.status, ["preboarding", "active", "on_leave"]),
      lte(employees.joiningDate, new Date(end.getTime() - 1)),
      opts.employeeIds?.length ? inArray(employees.id, opts.employeeIds) : undefined,
    ),
  });
  const out: { created: Payslip[]; updated: Payslip[]; skipped: { employeeId: string; reason: string }[] } = { created: [], updated: [], skipped: [] };

  for (const employee of staff) {
    const structure = await structureFor(db, employee.id, period);
    if (!structure) {
      out.skipped.push({ employeeId: employee.id, reason: "no_salary" });
      continue;
    }
    const existing = await db.query.payslips.findFirst({ where: and(eq(payslips.employeeId, employee.id), eq(payslips.period, period)) });
    if (existing?.status === "published") {
      out.skipped.push({ employeeId: employee.id, reason: "published" });
      continue;
    }
    if (existing && opts.onlyMissing) continue;
    // A new draft starts from approved unpaid leave and days marked absent.
    const lopDays = opts.lop?.[employee.id] ?? (existing ? Number(existing.lopDays) : await suggestedLopDays(db, employee.id, period));
    const f = computeSlip(structure.components, { period, joiningDate: employee.joiningDate, lopDays });
    const values = {
      daysInMonth: f.daysInMonth,
      payableDays: String(f.payableDays),
      lopDays: String(lopDays),
      earnings: f.earnings,
      deductions: f.deductions,
      gross: String(f.gross),
      totalDeductions: String(f.totalDeductions),
      net: String(f.net),
      generatedBy: opts.actorUserId,
      generatedAt: new Date(),
    };
    if (existing) {
      const [row] = await db.update(payslips).set(values).where(and(eq(payslips.id, existing.id), eq(payslips.status, "draft"))).returning();
      if (row) out.updated.push(row);
    } else {
      const [row] = await db.insert(payslips).values({ employeeId: employee.id, period, ...values }).onConflictDoNothing().returning();
      if (row) out.created.push(row);
    }
  }
  return out;
}

/** Publishes drafts (all for the period, or the given ids) and tells each employee their slip is ready. */
export async function publishPayslips(db: Database, period: string, actorUserId: string, ids?: string[]) {
  const rows = await db
    .update(payslips)
    .set({ status: "published", publishedAt: new Date(), publishedBy: actorUserId })
    .where(and(eq(payslips.period, period), eq(payslips.status, "draft"), ids?.length ? inArray(payslips.id, ids) : undefined))
    .returning();
  const label = periodLabel(period);
  for (const slip of rows) {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, slip.employeeId), columns: { userId: true } });
    if (!employee) continue;
    await notify(db, {
      userIds: [employee.userId],
      actorUserId,
      kind: "payroll.payslip",
      title: `Your payslip for ${label} is ready`,
      body: `Net pay ${rupees(Number(slip.net))}. Open it to see the breakdown or download the PDF.`,
      link: `/payslips?slip=${slip.id}`,
      email: true,
    });
  }
  await writeAuditLog(db, { actorUserId, action: "payroll.publish", entityType: "payslip", entityId: null, metadata: { period, count: rows.length } });
  return rows;
}

export const rupees = (n: number) => `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// --- Completion certificates ---

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

export function internshipEnd(employee: Pick<Employee, "joiningDate" | "durationMonths">) {
  if (!employee.durationMonths) return null;
  const end = new Date(employee.joiningDate);
  end.setUTCMonth(end.getUTCMonth() + employee.durationMonths);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

/**
 * Issues an internship completion certificate (interns) or an experience
 * certificate (everyone else). Returns the existing one if already issued,
 * so the job, an offboarding and a manual click can't produce duplicates.
 */
export async function issueEmploymentCertificate(db: Database, employee: Employee, opts: { actorUserId: string | null; toDate?: Date; appUrl: string }) {
  const kind = employee.employeeType === "intern" ? "internship_completion" : "experience";
  const existing = await db.query.employmentCertificates.findFirst({
    where: and(eq(employmentCertificates.employeeId, employee.id), eq(employmentCertificates.kind, kind), eq(employmentCertificates.status, "issued")),
  });
  if (existing) return { certificate: existing, created: false };

  const designation = employee.designationId ? await db.query.designations.findFirst({ where: eq(designations.id, employee.designationId) }) : null;
  const roleTitle = designation?.title ?? (employee.employeeType === "intern" ? "Intern" : "Team member");
  const name = await displayNameFor(db, employee.userId);
  const toDate = opts.toDate ?? (kind === "internship_completion" ? (internshipEnd(employee) ?? new Date()) : new Date());
  const content =
    kind === "internship_completion"
      ? `${name} completed an internship with Inveon Technologies as ${roleTitle} from ${fmtDate(employee.joiningDate)} to ${fmtDate(toDate)}. During the internship they worked on real projects with the team and showed dedication and a willingness to learn. We wish them every success.`
      : `${name} worked with Inveon Technologies as ${roleTitle} from ${fmtDate(employee.joiningDate)} to ${fmtDate(toDate)}. We thank them for their contribution and wish them every success.`;

  const certificate = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(employmentCertificates)
      .values({ verificationCode: randomBytes(16).toString("base64url"), employeeId: employee.id, userId: employee.userId, kind, roleTitle, fromDate: employee.joiningDate, toDate, snapshotContent: content, issuedBy: opts.actorUserId })
      .returning();
    const [updated] = await tx.update(employmentCertificates).set({ businessId: formatBusinessId("INV-EXP", created.seqNumber) }).where(eq(employmentCertificates.id, created.id)).returning();
    return updated;
  });
  await writeAuditLog(db, { actorUserId: opts.actorUserId, action: "employment_certificate.issue", entityType: "employment_certificate", entityId: certificate.id, metadata: { employeeId: employee.id, kind, automatic: !opts.actorUserId } });
  const label = kind === "internship_completion" ? "internship completion certificate" : "experience certificate";
  await notify(db, {
    userIds: [employee.userId],
    actorUserId: opts.actorUserId,
    kind: "certificate.issued",
    title: `Your ${label} is ready`,
    body: `Certificate ${certificate.businessId} can be downloaded and verified by anyone at ${opts.appUrl}/verify/${certificate.verificationCode}.`,
    link: `/verify/${certificate.verificationCode}`,
    email: true,
  });
  return { certificate, created: true };
}

// --- Scheduled automation ---

/** Interns whose internship has ended get their certificate without anyone having to remember. */
export async function issueDueInternshipCertificates(db: Database, appUrl: string, now = new Date()) {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT e.id FROM employees e
    WHERE e.employee_type = 'intern' AND e.status IN ('active', 'on_leave') AND e.duration_months IS NOT NULL
      AND e.joining_date + make_interval(months => e.duration_months) <= ${now}
      AND NOT EXISTS (SELECT 1 FROM employment_certificates c WHERE c.employee_id = e.id AND c.kind = 'internship_completion' AND c.status = 'issued')
    LIMIT 100
  `);
  let issued = 0;
  for (const { id } of rows.rows) {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, id) });
    if (!employee) continue;
    try {
      if ((await issueEmploymentCertificate(db, employee, { actorUserId: null, appUrl })).created) issued++;
    } catch (err) {
      logger.error({ err, employeeId: id }, "Could not issue internship certificate");
    }
  }
  return issued;
}

/** From the draft day on, makes sure every paid employee has a draft slip for this month and tells HR once. */
export async function draftMonthlyPayslips(db: Database, draftDay: number, now = new Date()) {
  const period = currentPeriod(now);
  const istDay = new Date(now.getTime() + 330 * 60_000).getUTCDate();
  if (istDay < draftDay) return 0;
  const result = await generatePayslips(db, period, { actorUserId: null, onlyMissing: true });
  if (result.created.length > 0) {
    await notify(db, {
      userIds: await hrUserIds(db),
      kind: "payroll.drafts_ready",
      title: `Payslips for ${periodLabel(period)} are ready to review`,
      body: `${result.created.length} draft ${result.created.length === 1 ? "payslip was" : "payslips were"} created. Add any loss-of-pay days, then publish.`,
      link: `/payroll?period=${period}`,
      dedupeKey: `payroll:drafts:${period}:${result.created.length}`,
    });
  }
  return result.created.length;
}
