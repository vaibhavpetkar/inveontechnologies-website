import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { companyPolicies, employeeLetters, employees } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { slugify } from "../shared/slugify.js";
import { notify } from "../notifications/service.js";
import type { Env } from "../shared/env.js";
import { displayNameFor } from "./onboarding.js";
import { appointmentDefaults, getJoiningTerms, issueAppointmentLetter, issueLetterSchema, joiningTermsSchema, saveJoiningTerms } from "./hiring.js";
import {
  activePolicies,
  appointmentFilename,
  appointmentPdf,
  completeLetterChecklistItems,
  employeeWithUser,
  ensureDefaultPolicies,
  lettersFor,
  policyFilename,
  queueAppointmentEmail,
  renderPolicyPdf,
} from "./appointment.js";

// Issuing an appointment letter is an admin act (it binds the company);
// HR can read letters, prepare the terms and resend them.
const ISSUER_ROLES = ["admin", "super_admin"] as const;
const READER_ROLES = ["hr", "admin", "super_admin"] as const;
const isReader = (role: string) => (READER_ROLES as readonly string[]).includes(role);

const policySchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(500),
  body: z.string().trim().min(20).max(50_000),
});

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

  /** Suggested terms for the issue form, from the person's record, pay and the joining terms. */
  router.get("/employees/:id/appointment-defaults", requireAuth(env), requireRole(...READER_ROLES), async (req, res) => {
    const { defaults, signatoryName, signatoryTitle } = await appointmentDefaults(db, req.params.id);
    res.json({
      defaults,
      signatory: { name: signatoryName, title: signatoryTitle },
      policies: (await activePolicies(db)).map((p) => ({ id: p.id, title: p.title, summary: p.summary, version: p.version })),
    });
  });

  router.post("/employees/:id/appointment-letter", requireAuth(env), requireRole(...ISSUER_ROLES), async (req, res) => {
    const body = issueLetterSchema.parse(req.body);
    const letter = await issueAppointmentLetter(db, { employeeId: req.params.id, body, actorUserId: req.user!.sub, ipAddress: req.ip });
    res.status(201).json({ letter, emailQueued: body.sendEmail });
  });

  // ---- Joining terms: the standard terms every join letter starts from ----

  router.get("/settings/joining-terms", requireAuth(env), requireRole(...READER_ROLES), async (req, res) => {
    res.json({ terms: await getJoiningTerms(db), canEdit: (ISSUER_ROLES as readonly string[]).includes(req.user!.role) });
  });

  router.put("/settings/joining-terms", requireAuth(env), requireRole(...ISSUER_ROLES), async (req, res) => {
    const terms = joiningTermsSchema.parse(req.body);
    await saveJoiningTerms(db, terms, req.user!.sub);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "settings.joining_terms", entityType: "portal_setting", entityId: null, ipAddress: req.ip });
    res.json({ terms });
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
    const pdf = await appointmentPdf(db, letter);
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
