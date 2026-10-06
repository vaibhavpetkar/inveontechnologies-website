import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, candidateProfiles, employees, opportunities, programEnrollments, salaryStructures, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { getApplicationOr404 } from "../applications/access.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import type { ApplicationStatus } from "../applications/state-machine.js";
import { createEmployeeRecord, displayNameFor, resolveDepartment, resolveDesignation } from "../employees/onboarding.js";
import { getJoiningTerms, letterOnHire } from "../employees/hiring.js";

const HIRE_ROLES = ["hr", "admin", "super_admin"] as const;

export const hireSchema = z.object({
  employeeType: z.enum(["intern", "full_time", "contract"]).default("intern"),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMonths: z.number().int().min(1).max(60).optional(),
  designationTitle: z.string().trim().max(200).optional(),
  department: z.string().trim().max(200).optional(),
  managerId: z.string().uuid().optional(),
  monthlyPay: z.number().min(0).max(10_000_000).optional(),
  // Email the join (appointment) letter with the company policies straight away.
  sendLetter: z.boolean().default(true),
});

export type HireInput = z.infer<typeof hireSchema>;
type Application = typeof applications.$inferSelect;

/**
 * Turns an applicant into an intern or employee: the employee record (which
 * switches their portal role), their pay, the application marked selected,
 * and the join letter emailed. Used by the direct hire below and by the
 * program's hire step once the fee is settled.
 */
export async function hireApplicant(db: Database, input: { application: Application; body: HireInput; actor: { sub: string; role: string }; ipAddress?: string; note?: string }) {
  const { application, body, actor } = input;
  if (["rejected", "withdrawn"].includes(application.status)) throw new AppError("INVALID_STATE", "This application is closed. Reopen it before hiring.", 409);
  const existing = await db.query.employees.findFirst({ where: eq(employees.userId, application.userId) });
  if (existing) throw new AppError("ALREADY_EMPLOYEE", `Already hired as ${existing.businessId}`, 409);
  if (body.managerId) {
    const manager = await db.query.users.findFirst({ where: eq(users.id, body.managerId) });
    if (!manager || ["candidate", "intern"].includes(manager.role)) throw new AppError("INVALID_MANAGER", "Manager must be a staff account", 400);
  }

  const joiningDate = new Date(`${body.joiningDate}T00:00:00Z`);
  const employee = await createEmployeeRecord(db, {
    userId: application.userId,
    applicationId: application.id,
    employeeType: body.employeeType,
    departmentId: await resolveDepartment(db, body.department),
    designationId: await resolveDesignation(db, body.designationTitle),
    managerId: body.managerId ?? null,
    hrManagerId: actor.sub,
    joiningDate,
    durationMonths: body.employeeType === "full_time" ? null : body.durationMonths ?? null,
    createdBy: actor.sub,
  });
  if (body.monthlyPay) {
    await db.insert(salaryStructures).values({
      employeeId: employee.id,
      effectiveFrom: joiningDate,
      components: [{ name: body.employeeType === "intern" ? "Stipend" : "Basic salary", amount: body.monthlyPay, kind: "earning" }],
      createdBy: actor.sub,
    });
  }
  if (application.status !== "selected") {
    await applyApplicationTransition(db, {
      applicationId: application.id,
      from: application.status as ApplicationStatus,
      to: "selected",
      actorUserId: actor.sub,
      note: input.note ?? `Hired as ${employee.businessId}`,
    });
  }
  const letter = body.sendLetter ? await letterOnHire(db, { employeeId: employee.id, actor, ipAddress: input.ipAddress }) : { issued: false as const, letter: null };
  await writeAuditLog(db, { actorUserId: actor.sub, action: "application.hire", entityType: "application", entityId: application.id, metadata: { employeeId: employee.id, employeeType: body.employeeType, letterIssued: letter.issued }, ipAddress: input.ipAddress });
  return { employee, letterIssued: letter.issued, letterRequested: body.sendLetter && !letter.issued };
}

interface JoiningDetailsLike {
  fullName?: string;
  phone?: string;
  city?: string;
  preferredStartDate?: string;
  college?: string;
  degree?: string;
  githubUsername?: string;
}

export function hireRouter(db: Database, env: Env) {
  const router = Router();

  /**
   * Everything the hire form can fill in by itself: the applicant's details
   * from their profile and joining form, and the role, type, length, pay and
   * start date from the opening and the joining terms.
   */
  router.get("/applications/:id/hire-defaults", requireAuth(env), requireRole(...HIRE_ROLES), async (req, res) => {
    const application = await getApplicationOr404(db, req.params.id);
    const [opportunity, profile, user, enrollment, employee, terms] = await Promise.all([
      db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId) }),
      db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.userId, application.userId) }),
      db.query.users.findFirst({ where: eq(users.id, application.userId), columns: { email: true, githubUsername: true } }),
      db.query.programEnrollments.findFirst({ where: eq(programEnrollments.applicationId, application.id) }),
      db.query.employees.findFirst({ where: eq(employees.userId, application.userId) }),
      getJoiningTerms(db),
    ]);
    const joining = (enrollment?.joiningDetails ?? null) as JoiningDetailsLike | null;
    const employeeType: HireInput["employeeType"] = opportunity?.kind === "job" ? "full_time" : "intern";
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const opportunityStart = opportunity?.startDate && opportunity.startDate > new Date() ? opportunity.startDate.toISOString().slice(0, 10) : null;
    res.json({
      candidate: {
        name: joining?.fullName ?? profile?.fullName ?? (await displayNameFor(db, application.userId)),
        email: user?.email ?? "",
        phone: joining?.phone ?? profile?.phone ?? null,
        city: joining?.city ?? null,
        education: [joining?.degree ?? profile?.degree, joining?.college, profile?.graduationYear].filter(Boolean).join(", ") || null,
        githubUsername: joining?.githubUsername ?? user?.githubUsername ?? null,
      },
      applicationStatus: application.status,
      opportunity: opportunity ? { id: opportunity.id, title: opportunity.title, kind: opportunity.kind } : null,
      enrollmentStatus: enrollment?.status ?? null,
      alreadyHired: employee ? { id: employee.id, businessId: employee.businessId } : null,
      canIssueLetter: ["admin", "super_admin"].includes(req.user!.role),
      defaults: {
        employeeType,
        joiningDate: joining?.preferredStartDate?.slice(0, 10) ?? opportunityStart ?? nextWeek,
        durationMonths: opportunity?.durationMonths ?? terms[employeeType].defaultDurationMonths,
        designationTitle: opportunity ? (employeeType === "intern" && !/intern/i.test(opportunity.title) ? `${opportunity.title} Intern` : opportunity.title) : "",
        department: terms.department,
        monthlyPay: opportunity?.stipendAmount ? Number(opportunity.stipendAmount) : null,
      },
    });
  });

  /** Hire straight from an application at any open stage, as an intern, full-time or contract hire. */
  router.post("/applications/:id/hire", requireAuth(env), requireRole(...HIRE_ROLES), async (req, res) => {
    const body = hireSchema.parse(req.body);
    const application = await getApplicationOr404(db, req.params.id);
    const label = body.employeeType === "intern" ? "an intern" : body.employeeType === "contract" ? "a contractor" : "a full-time employee";
    const result = await hireApplicant(db, { application, body, actor: req.user!, ipAddress: req.ip, note: `Hired directly as ${label}` });
    res.status(201).json(result);
  });

  return router;
}
