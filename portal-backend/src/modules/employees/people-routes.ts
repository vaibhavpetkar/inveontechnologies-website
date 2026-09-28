import { Router } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Database } from "../shared/db/client.js";
import { employeeOnboardingTasks, employees, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { issueEmploymentCertificate } from "../payroll/service.js";
import { createEmployeeRecord, queueWelcomeEmail, resolveDepartment, resolveDesignation } from "./onboarding.js";

const HR_ROLES = ["hr", "admin", "super_admin"] as const;
const DIRECTORY_ROLES = ["manager", ...HR_ROLES] as const;

// Accepts "2026-10-01" (from a date input or a spreadsheet) or a full ISO time.
const dateInput = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Use a date like 2026-10-01")
  .transform((v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T09:30:00+05:30` : v));

const inviteSchema = z.object({
  email: z.string().trim().email().transform((e) => e.toLowerCase()),
  fullName: z.string().trim().min(2).max(200).optional(),
  employeeType: z.enum(["intern", "full_time", "contract"], { errorMap: () => ({ message: "use intern, full_time or contract" }) }),
  role: z.enum(["intern", "employee", "manager"], { errorMap: () => ({ message: "use intern, employee or manager" }) }).optional(),
  departmentName: z.string().trim().max(200).optional(),
  designationTitle: z.string().trim().max(200).optional(),
  managerEmail: z.string().trim().email().transform((e) => e.toLowerCase()).optional().or(z.literal("").transform(() => undefined)),
  joiningDate: dateInput,
  durationMonths: z.coerce.number().int().min(1).max(120).optional(),
});
type Invite = z.infer<typeof inviteSchema>;

const bulkSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(200),
  dryRun: z.boolean().default(false),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  departmentName: z.string().trim().max(200).optional(),
  designationTitle: z.string().trim().max(200).optional(),
  managerId: z.string().uuid().nullable().optional(),
  status: z.enum(["preboarding", "active", "on_leave", "offboarded"]).optional(),
  joiningDate: dateInput.optional(),
});

interface DirectoryRow {
  id: string;
  userId: string;
  businessId: string | null;
  email: string;
  name: string;
  role: string;
  employeeType: string;
  status: string;
  portalAccessActive: boolean;
  joiningDate: string;
  department: string | null;
  designation: string | null;
  managerId: string | null;
  managerName: string | null;
  tasksTotal: number;
  tasksDone: number;
  requiredOpen: number;
  [key: string]: unknown;
}

/**
 * The People directory, invites and HR edits. Managers see their own
 * direct reports (read-only, no documents); HR, admin and super admin see
 * and manage everyone. Personal documents stay on /employees/:id/documents,
 * which managers still can't read.
 */
export function peopleRouter(db: Database, env: Env) {
  const router = Router();

  const directory = async (where: ReturnType<typeof sql>) => {
    const result = await db.execute<DirectoryRow>(sql`
      SELECT e.id, e.user_id AS "userId", e.business_id AS "businessId", u.email,
             coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name,
             u.role, e.employee_type AS "employeeType", e.status, e.portal_access_active AS "portalAccessActive",
             e.joining_date AS "joiningDate", d.name AS department, g.title AS designation,
             e.manager_id AS "managerId", coalesce(mu.full_name, initcap(replace(split_part(mu.email, '@', 1), '.', ' '))) AS "managerName",
             count(t.id)::int AS "tasksTotal",
             count(t.id) FILTER (WHERE t.status = 'completed')::int AS "tasksDone",
             count(t.id) FILTER (WHERE t.required AND t.status <> 'completed')::int AS "requiredOpen"
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN designations g ON g.id = e.designation_id
      LEFT JOIN users mu ON mu.id = e.manager_id
      LEFT JOIN employee_onboarding_tasks t ON t.employee_id = e.id
      WHERE ${where}
      GROUP BY e.id, u.id, cp.full_name, d.name, g.title, mu.full_name, mu.email
      ORDER BY e.created_at DESC
    `);
    return result.rows;
  };

  const scopeFor = (req: import("express").Request) =>
    req.user!.role === "manager" ? sql`e.manager_id = ${req.user!.sub}` : sql`true`;

  router.get("/", requireAuth(env), requireRole(...DIRECTORY_ROLES), async (req, res) => {
    res.json({ people: await directory(scopeFor(req)) });
  });

  router.get("/:id", requireAuth(env), requireRole(...DIRECTORY_ROLES), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const [person] = await directory(sql`e.id = ${id} AND ${scopeFor(req)}`);
    if (!person) throw new NotFoundError("Person not found");
    const checklist = await db.query.employeeOnboardingTasks.findMany({ where: eq(employeeOnboardingTasks.employeeId, id), orderBy: (t, { asc }) => [asc(t.createdAt)] });
    res.json({ person, checklist });
  });

  /** Creates the account (if needed), the employee record and the checklist, then emails a welcome. */
  const invite = async (body: Invite, actorId: string, dryRun: boolean) => {
    const existingUser = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${body.email}` });
    if (existingUser) {
      const existingEmployee = await db.query.employees.findFirst({ where: eq(employees.userId, existingUser.id) });
      if (existingEmployee) throw new AppError("ALREADY_EMPLOYEE", `${body.email} already has an employee record`, 409);
      if (["hr", "admin", "super_admin"].includes(existingUser.role)) throw new AppError("STAFF_ACCOUNT", `${body.email} is an ${existingUser.role} account; change it on Team accounts instead`, 409);
    }
    let managerId: string | null = null;
    if (body.managerEmail) {
      const manager = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${body.managerEmail}` });
      if (!manager || manager.role === "candidate") throw new AppError("UNKNOWN_MANAGER", `No staff account for manager ${body.managerEmail}`, 400);
      managerId = manager.id;
    }
    if (dryRun) return { email: body.email, status: "ok" as const, newAccount: !existingUser };

    const user =
      existingUser ??
      (
        await db
          .insert(users)
          // Nobody knows this password: the welcome email's link sets the real one.
          .values({ email: body.email, passwordHash: await hashPassword(randomBytes(32).toString("base64url")), role: "candidate", emailVerified: true, fullName: body.fullName })
          .returning()
      )[0];
    if (existingUser && body.fullName && !existingUser.fullName) await db.update(users).set({ fullName: body.fullName }).where(eq(users.id, existingUser.id));

    const employee = await createEmployeeRecord(db, {
      userId: user.id,
      employeeType: body.employeeType,
      role: body.role,
      departmentId: await resolveDepartment(db, body.departmentName),
      designationId: await resolveDesignation(db, body.designationTitle),
      managerId,
      hrManagerId: actorId,
      joiningDate: body.joiningDate,
      durationMonths: body.durationMonths,
      createdBy: actorId,
    });
    await queueWelcomeEmail(db, env.PORTAL_APP_URL, user, { newAccount: !existingUser, joiningDate: body.joiningDate });
    await writeAuditLog(db, { actorUserId: actorId, action: "employee.invite", entityType: "employee", entityId: employee.id, metadata: { email: body.email, newAccount: !existingUser } });
    return { email: body.email, status: "invited" as const, employeeId: employee.id, businessId: employee.businessId, newAccount: !existingUser };
  };

  router.post("/invite", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const result = await invite(inviteSchema.parse(req.body), req.user!.sub, false);
    res.status(201).json(result);
  });

  /**
   * Spreadsheet import. Each row is validated and invited on its own, so one
   * bad row doesn't block the rest; dryRun checks everything and changes
   * nothing, for the preview step.
   */
  router.post("/invite/bulk", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const { rows, dryRun } = bulkSchema.parse(req.body);
    const results = [];
    const seen = new Set<string>();
    for (const [index, raw] of rows.entries()) {
      const parsed = inviteSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        results.push({ row: index + 1, email: typeof raw.email === "string" ? raw.email : "", status: "error", message: `${issue.path.join(".") || "row"}: ${issue.message}` });
        continue;
      }
      if (seen.has(parsed.data.email)) {
        results.push({ row: index + 1, email: parsed.data.email, status: "error", message: "Duplicate email in this file" });
        continue;
      }
      seen.add(parsed.data.email);
      try {
        results.push({ row: index + 1, ...(await invite(parsed.data, req.user!.sub, dryRun)) });
      } catch (err) {
        results.push({ row: index + 1, email: parsed.data.email, status: "error", message: err instanceof Error ? err.message : "Failed" });
      }
    }
    const failed = results.filter((r) => r.status === "error").length;
    res.status(dryRun ? 200 : 201).json({ results, succeeded: results.length - failed, failed, dryRun });
  });

  router.put("/:id", requireAuth(env), requireRole(...HR_ROLES), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, id) });
    if (!employee) throw new NotFoundError("Person not found");
    if (body.managerId) {
      if (body.managerId === employee.userId) throw new AppError("INVALID_MANAGER", "Someone can't be their own manager", 400);
      const manager = await db.query.users.findFirst({ where: eq(users.id, body.managerId) });
      if (!manager || manager.role === "candidate") throw new AppError("INVALID_MANAGER", "Manager must be a staff account", 400);
    }

    const changes: Partial<typeof employees.$inferInsert> = { updatedAt: new Date() };
    if (body.departmentName !== undefined) changes.departmentId = await resolveDepartment(db, body.departmentName);
    if (body.designationTitle !== undefined) changes.designationId = await resolveDesignation(db, body.designationTitle);
    if (body.managerId !== undefined) changes.managerId = body.managerId;
    if (body.status) changes.status = body.status;
    if (body.joiningDate) changes.joiningDate = body.joiningDate;
    await db.update(employees).set(changes).where(eq(employees.id, id));
    // Leaving: their completion or experience certificate is issued automatically (once).
    if (body.status === "offboarded" && employee.status !== "offboarded") {
      await issueEmploymentCertificate(db, { ...employee, ...changes } as typeof employee, { actorUserId: req.user!.sub, toDate: new Date(), appUrl: env.PORTAL_APP_URL });
    }
    if (body.fullName) await db.update(users).set({ fullName: body.fullName, updatedAt: new Date() }).where(eq(users.id, employee.userId));

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee.update", entityType: "employee", entityId: id, metadata: { fields: Object.keys(body) }, ipAddress: req.ip });
    const [person] = await directory(sql`e.id = ${id}`);
    res.json({ person });
  });

  return router;
}

