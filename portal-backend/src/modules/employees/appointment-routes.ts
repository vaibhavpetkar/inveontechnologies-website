import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { companyPolicies, departments, designations, employeeLetters, employees, salaryStructures, type AppointmentDetails } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { slugify } from "../shared/slugify.js";
import { notify } from "../notifications/service.js";
import { monthlyGross } from "../payroll/calc.js";
import { internshipEnd } from "../payroll/service.js";
import type { Env } from "../shared/env.js";
import { displayNameFor } from "./onboarding.js";
import {
  activePolicies,
  appointmentFilename,
  appointmentPdf,
  appointmentReference,
  appointmentText,
  completeLetterChecklistItems,
  employeeWithUser,
  ensureDefaultPolicies,
  lettersFor,
  policyFilename,
  queueAppointmentEmail,
  renderPolicyPdf,
  snapshotPolicy,
} from "./appointment.js";

// Issuing an appointment letter is an admin act (it binds the company);
// HR can read letters, prepare the terms and resend them.
const ISSUER_ROLES = ["admin", "super_admin"] as const;
const READER_ROLES = ["hr", "admin", "super_admin"] as const;
const isReader = (role: string) => (READER_ROLES as readonly string[]).includes(role);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const issueSchema = z.object({
  designation: z.string().trim().min(2).max(200),
  department: z.string().trim().min(2).max(200),
  joiningDate: isoDate,
  durationMonths: z.number().int().min(1).max(60).nullable().optional(),
  reportingTo: z.string().trim().max(200).nullable().optional(),
  workLocation: z.string().trim().min(2).max(300),
  workHours: z.string().trim().min(2).max(300),
  monthlyPay: z.number().min(0).max(100_000_000).nullable().optional(),
  probationMonths: z.number().int().min(0).max(24).nullable().optional(),
  noticeDays: z.number().int().min(0).max(180),
  additionalTerms: z.string().trim().max(3000).nullable().optional(),
  signatoryName: z.string().trim().min(2).max(200),
  signatoryTitle: z.string().trim().min(2).max(200),
  policyIds: z.array(z.string().uuid()).max(50).optional(),
  sendEmail: z.boolean().default(true),
});

const policySchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(500),
  body: z.string().trim().min(20).max(50_000),
});

function endDateFor(joiningDate: string, durationMonths: number | null | undefined) {
  if (!durationMonths) return null;
  return internshipEnd({ joiningDate: new Date(`${joiningDate}T00:00:00Z`), durationMonths })!.toISOString().slice(0, 10);
}

export function appointmentRouter(db: Database, env: Env) {
  const router = Router();

  // ---- Company policies ----

  router.get("/policies", requireAuth(env), async (req, res) => {
    const all = req.query.all === "1" && (ISSUER_ROLES as readonly string[]).includes(req.user!.role);
    await ensureDefaultPolicies(db);
    const rows = all
      ? await db.query.companyPolicies.findMany({ orderBy: [asc(companyPolicies.orderIndex), asc(companyPolicies.title)] })
      : await activePolicies(db);
    res.json({ policies: rows });
  });

  router.get("/policies/:id/pdf", requireAuth(env), async (req, res) => {
    const policy = await db.query.companyPolicies.findFirst({ where: eq(companyPolicies.id, req.params.id) });
    if (!policy || (!policy.active && !isReader(req.user!.role))) throw new NotFoundError("Policy not found");
    const pdf = await renderPolicyPdf(policy, policy.updatedAt);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${policyFilename(policy)}"`);
    res.send(Buffer.from(pdf));
  });

  router.post("/policies", requireAuth(env), requireRole(...ISSUER_ROLES), async (req, res) => {
    const body = policySchema.parse(req.body);
    let slug = slugify(body.title) || "policy";
    if (await db.query.companyPolicies.findFirst({ where: eq(companyPolicies.slug, slug) })) slug = `${slug}-${Date.now().toString(36)}`;
    const last = await db.query.companyPolicies.findFirst({ orderBy: desc(companyPolicies.orderIndex) });
    const [policy] = await db
      .insert(companyPolicies)
      .values({ ...body, slug, orderIndex: (last?.orderIndex ?? 0) + 1, updatedBy: req.user!.sub })
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "policy.create", entityType: "company_policy", entityId: policy.id, ipAddress: req.ip });
    res.status(201).json({ policy });
  });

  router.put("/policies/:id", requireAuth(env), requireRole(...ISSUER_ROLES), async (req, res) => {
    const body = policySchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const policy = await db.query.companyPolicies.findFirst({ where: eq(companyPolicies.id, req.params.id) });
    if (!policy) throw new NotFoundError("Policy not found");
    // A change to what the policy says is a new version; summary and
    // on/off changes aren't.
    const reworded = (body.title !== undefined && body.title !== policy.title) || (body.body !== undefined && body.body !== policy.body);
    const [updated] = await db
      .update(companyPolicies)
      .set({ ...body, version: reworded ? policy.version + 1 : policy.version, updatedBy: req.user!.sub, updatedAt: new Date() })
      .where(eq(companyPolicies.id, policy.id))
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "policy.update", entityType: "company_policy", entityId: policy.id, metadata: { version: updated.version, active: updated.active }, ipAddress: req.ip });
    res.json({ policy: updated });
  });

  // ---- Appointment letters ----

  /** Suggested terms for the issue form, from the person's record and pay. */
  router.get("/employees/:id/appointment-defaults", requireAuth(env), requireRole(...READER_ROLES), async (req, res) => {
    const found = await employeeWithUser(db, req.params.id);
    if (!found) throw new NotFoundError("Employee not found");
    const { employee, user } = found;
    const [department, designation, pay] = await Promise.all([
      employee.departmentId ? db.query.departments.findFirst({ where: eq(departments.id, employee.departmentId) }) : null,
      employee.designationId ? db.query.designations.findFirst({ where: eq(designations.id, employee.designationId) }) : null,
      db.query.salaryStructures.findFirst({ where: and(eq(salaryStructures.employeeId, employee.id), lte(salaryStructures.effectiveFrom, new Date(Date.now() + 366 * 86400000))), orderBy: [desc(salaryStructures.effectiveFrom), desc(salaryStructures.createdAt)] }),
    ]);
    const intern = employee.employeeType === "intern";
    const joiningDate = employee.joiningDate.toISOString().slice(0, 10);
    res.json({
      defaults: {
        name: await displayNameFor(db, employee.userId),
        email: user.email,
        employeeId: employee.businessId,
        employeeType: employee.employeeType,
        designation: designation?.title ?? (intern ? "Software Development Intern" : ""),
        department: department?.name ?? "Engineering",
        joiningDate,
        durationMonths: employee.durationMonths ?? (intern ? 6 : null),
        reportingTo: employee.managerId ? await displayNameFor(db, employee.managerId) : null,
        workLocation: intern ? "Remote (India)" : "Inveon Technologies office, or remote as agreed",
        workHours: intern ? "Monday to Friday, 6 hours a day between 10:00 AM and 7:00 PM IST" : "Monday to Friday, 10:00 AM to 6:00 PM IST",
        monthlyPay: pay ? monthlyGross(pay.components) : null,
        probationMonths: employee.employeeType === "full_time" ? 6 : null,
        noticeDays: intern ? 7 : 30,
        additionalTerms: null,
      },
      policies: (await activePolicies(db)).map((p) => ({ id: p.id, title: p.title, summary: p.summary, version: p.version })),
    });
  });

  router.post("/employees/:id/appointment-letter", requireAuth(env), requireRole(...ISSUER_ROLES), async (req, res) => {
    const body = issueSchema.parse(req.body);
    const found = await employeeWithUser(db, req.params.id);
    if (!found) throw new NotFoundError("Employee not found");
    const { employee, user } = found;
    if (employee.status === "offboarded") throw new AppError("EMPLOYEE_OFFBOARDED", "This person has left; issue letters only to current staff", 409);

    const chosen = body.policyIds
      ? await db.query.companyPolicies.findMany({ where: and(inArray(companyPolicies.id, body.policyIds.length ? body.policyIds : ["00000000-0000-0000-0000-000000000000"]), eq(companyPolicies.active, true)), orderBy: asc(companyPolicies.orderIndex) })
      : await activePolicies(db);
    const policies = chosen.map(snapshotPolicy);

    const details: AppointmentDetails = {
      name: await displayNameFor(db, employee.userId),
      email: user.email,
      employeeId: employee.businessId ?? "",
      employeeType: employee.employeeType,
      designation: body.designation,
      department: body.department,
      joiningDate: body.joiningDate,
      durationMonths: body.durationMonths ?? null,
      endDate: endDateFor(body.joiningDate, body.durationMonths),
      reportingTo: body.reportingTo || null,
      workLocation: body.workLocation,
      workHours: body.workHours,
      monthlyPay: body.monthlyPay ?? null,
      probationMonths: employee.employeeType === "intern" ? null : body.probationMonths ?? null,
      noticeDays: body.noticeDays,
      additionalTerms: body.additionalTerms || null,
    };

    const previous = await db.query.employeeLetters.findMany({ where: and(eq(employeeLetters.employeeId, employee.id), eq(employeeLetters.letterType, "appointment")), columns: { version: true } });
    const version = previous.length ? Math.max(...previous.map((l) => l.version)) + 1 : 1;
    const signatory = { signatoryName: body.signatoryName, signatoryTitle: body.signatoryTitle };

    const letter = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(employeeLetters)
        .values({ employeeId: employee.id, letterType: "appointment", version, content: appointmentText(signatory, details, policies), ...signatory, generatedBy: req.user!.sub, details, policies })
        .returning();
      const [withRef] = await tx.update(employeeLetters).set({ referenceNo: appointmentReference(created.seqNumber, created.generatedAt) }).where(eq(employeeLetters.id, created.id)).returning();
      return withRef;
    });

    if (body.sendEmail) await queueAppointmentEmail(db, letter.id, user.email);
    await notify(db, {
      userIds: [employee.userId],
      actorUserId: req.user!.sub,
      kind: "letter.appointment",
      title: version > 1 ? "Your updated appointment letter is ready" : "Your appointment letter is ready",
      body: `${details.designation}, joining ${details.joiningDate}. Read it and the company policies, then accept it from your workspace.`,
      link: "/employee",
    });
    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "employee_letter.appointment_issue",
      entityType: "employee_letter",
      entityId: letter.id,
      metadata: { employeeId: employee.id, version, referenceNo: letter.referenceNo, policies: policies.map((p) => `${p.slug}@${p.version}`), emailed: body.sendEmail },
      ipAddress: req.ip,
    });
    res.status(201).json({ letter: (await lettersFor(db, employee.id)).find((l) => l.id === letter.id), emailQueued: body.sendEmail });
  });

  router.get("/employees/:id/appointment-letters", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (employee.userId !== req.user!.sub && !isReader(req.user!.role)) throw new ForbiddenError();
    res.json({ letters: await lettersFor(db, employee.id), canIssue: (ISSUER_ROLES as readonly string[]).includes(req.user!.role) });
  });

  const loadLetter = async (id: string) => {
    const letter = await db.query.employeeLetters.findFirst({ where: eq(employeeLetters.id, id) });
    if (!letter?.details) throw new NotFoundError("Letter not found");
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, letter.employeeId) });
    if (!employee) throw new NotFoundError("Letter not found");
    return { letter, employee };
  };

  router.get("/appointment-letters/:id/pdf", requireAuth(env), async (req, res) => {
    const { letter, employee } = await loadLetter(req.params.id);
    if (employee.userId !== req.user!.sub && !isReader(req.user!.role)) throw new ForbiddenError();
    const pdf = await appointmentPdf(letter);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee_letter.download", entityType: "employee_letter", entityId: letter.id, ipAddress: req.ip });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${appointmentFilename(letter)}"`);
    res.send(Buffer.from(pdf));
  });

  /** A policy exactly as it was attached to this letter. */
  router.get("/appointment-letters/:id/policies/:slug/pdf", requireAuth(env), async (req, res) => {
    const { letter, employee } = await loadLetter(req.params.id);
    if (employee.userId !== req.user!.sub && !isReader(req.user!.role)) throw new ForbiddenError();
    const policy = (letter.policies ?? []).find((p) => p.slug === req.params.slug);
    if (!policy) throw new NotFoundError("That policy isn't attached to this letter");
    const pdf = await renderPolicyPdf(policy, letter.generatedAt);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${policyFilename(policy)}"`);
    res.send(Buffer.from(pdf));
  });

  router.post("/appointment-letters/:id/accept", requireAuth(env), async (req, res) => {
    const { fullName } = z.object({ fullName: z.string().trim().min(2).max(200) }).parse(req.body);
    const { letter, employee } = await loadLetter(req.params.id);
    if (employee.userId !== req.user!.sub) throw new ForbiddenError("Only the person named in the letter can accept it");
    if (letter.acceptedAt) throw new AppError("ALREADY_ACCEPTED", "You've already accepted this letter", 409);
    const newer = await db.query.employeeLetters.findFirst({ where: and(eq(employeeLetters.employeeId, employee.id), eq(employeeLetters.letterType, "appointment")), orderBy: desc(employeeLetters.version) });
    if (newer && newer.version > letter.version) throw new AppError("LETTER_SUPERSEDED", "A newer version of this letter was issued; accept that one instead", 409);

    const [updated] = await db.update(employeeLetters).set({ acceptedAt: new Date(), acceptedName: fullName }).where(eq(employeeLetters.id, letter.id)).returning();
    await completeLetterChecklistItems(db, employee.id);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee_letter.accept", entityType: "employee_letter", entityId: letter.id, metadata: { acceptedName: fullName }, ipAddress: req.ip });
    const who = await displayNameFor(db, employee.userId);
    await notify(db, {
      userIds: [...new Set([letter.generatedBy, employee.hrManagerId].filter((x): x is string => !!x))],
      actorUserId: req.user!.sub,
      kind: "letter.accepted",
      title: `${who} accepted their appointment letter`,
      body: `${letter.referenceNo}: ${letter.details!.designation}, joining ${letter.details!.joiningDate}.`,
      link: `/people/${employee.id}`,
      email: true,
    });
    res.json({ letter: { id: updated.id, acceptedAt: updated.acceptedAt, acceptedName: updated.acceptedName } });
  });

  router.post("/appointment-letters/:id/resend", requireAuth(env), requireRole(...READER_ROLES), async (req, res) => {
    const { letter, employee } = await loadLetter(req.params.id);
    const found = await employeeWithUser(db, employee.id);
    await queueAppointmentEmail(db, letter.id, found!.user.email);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee_letter.resend", entityType: "employee_letter", entityId: letter.id, ipAddress: req.ip });
    res.json({ emailQueued: true, to: found!.user.email });
  });

  return router;
}
