import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { companyPolicies, emailLog, employeeLetters, employees, participantOffers, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { deliverEmail, mailerStatus, verifyMailer } from "../shared/mailer.js";
import { enqueueJob, registerJobHandler } from "../shared/jobs.js";
import { activePolicies, policyFilename, queueAppointmentEmail, renderPolicyPdf } from "../employees/appointment.js";
import { displayNameFor } from "../employees/onboarding.js";
import { queueOfferEmail, syncProgramFees } from "../internships/service.js";
import { brandPreviews, companyProfile, companyProfileSchema, saveCompanyProfile } from "./company.js";
import { emailSettingsInput, getEmailSettings, saveEmailSettings } from "./email.js";
import { getOfferTerms, offerTermsSchema, saveOfferTerms } from "./offer-terms.js";

// Company details and email settings bind the company, so only admins
// change them; HR can read them, check the email log and resend documents.
const ADMIN_ROLES = ["admin", "super_admin"] as const;
const STAFF_ROLES = ["hr", "admin", "super_admin"] as const;
const isAdmin = (role: string) => (ADMIN_ROLES as readonly string[]).includes(role);

const testSchema = z.object({ to: z.string().trim().email() });
const logQuery = z.object({
  status: z.enum(["sent", "failed", "logged"]).optional(),
  kind: z.string().max(60).optional(),
  q: z.string().trim().max(200).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const sendDocumentsSchema = z.object({
  userId: z.string().uuid(),
  appointmentLetter: z.boolean().default(false),
  internshipOffer: z.boolean().default(false),
  policies: z.array(z.string().max(100)).max(30).default([]),
  to: z.string().trim().email().optional(),
});

// Emails that can be sent again from the log: letters and offers are
// re-rendered from their record; plain emails are sent with the same text.
const RESEND_BY_REF = ["appointment_letter", "internship_offer", "policies"];

export function settingsRouter(db: Database, env: Env) {
  const router = Router();

  // ---- Company details on letters ----

  router.get("/settings/company", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    res.json({ profile: companyProfile(), previews: await brandPreviews(), canEdit: isAdmin(req.user!.role) });
  });

  router.put("/settings/company", requireAuth(env), requireRole(...ADMIN_ROLES), async (req, res) => {
    const profile = await saveCompanyProfile(db, companyProfileSchema.parse(req.body), req.user!.sub);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "settings.company.update", entityType: "portal_setting", metadata: { key: "company_profile" }, ipAddress: req.ip });
    res.json({ profile, previews: await brandPreviews() });
  });

  // ---- Internship offer fees ----

  router.get("/settings/internship-offers", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    res.json({ terms: await getOfferTerms(db), canEdit: isAdmin(req.user!.role) });
  });

  router.put("/settings/internship-offers", requireAuth(env), requireRole(...ADMIN_ROLES), async (req, res) => {
    const previous = await getOfferTerms(db);
    const terms = await saveOfferTerms(db, offerTermsSchema.parse(req.body), req.user!.sub);
    await syncProgramFees(db, previous);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "settings.offer_terms.update", entityType: "portal_setting", metadata: { key: "internship_offer_terms", ...terms }, ipAddress: req.ip });
    res.json({ terms });
  });

  // ---- Email (SMTP) ----

  router.get("/settings/email", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    res.json({ settings: isAdmin(req.user!.role) ? await getEmailSettings(db, env) : null, status: mailerStatus(), canEdit: isAdmin(req.user!.role) });
  });

  router.put("/settings/email", requireAuth(env), requireRole(...ADMIN_ROLES), async (req, res) => {
    const body = emailSettingsInput.parse(req.body);
    if (body.enabled && !body.host) throw new AppError("HOST_REQUIRED", "Enter the SMTP server to send through", 400);
    await saveEmailSettings(db, env, body, req.user!.sub);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "settings.email.update", entityType: "portal_setting", metadata: { key: "email_settings", enabled: body.enabled, host: body.host, port: body.port, user: body.user, passwordChanged: body.password !== undefined && body.password !== "" }, ipAddress: req.ip });
    const check = await verifyMailer();
    res.json({ settings: await getEmailSettings(db, env), status: mailerStatus(), check });
  });

  router.post("/settings/email/test", requireAuth(env), requireRole(...ADMIN_ROLES), async (req, res) => {
    const { to } = testSchema.parse(req.body);
    const status = mailerStatus();
    try {
      await deliverEmail({
        to,
        subject: "Test email from the Inveon portal",
        text: `This is a test email from the Inveon portal.\n\nIt was sent through ${status.host ?? "no SMTP server (logged only)"} as ${status.from}. If you can read this, email is working.`,
        kind: "test",
        triggeredBy: req.user!.sub,
      });
      res.json({ ok: true, sent: status.sending });
    } catch (err) {
      res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- Email log ----

  router.get("/email-log", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    const q = logQuery.parse(req.query);
    const conditions = [];
    if (q.status) conditions.push(eq(emailLog.status, q.status));
    if (q.kind) conditions.push(eq(emailLog.kind, q.kind));
    if (q.q) conditions.push(or(ilike(emailLog.toEmail, `%${q.q}%`), ilike(emailLog.subject, `%${q.q}%`)));
    if (q.before) conditions.push(lt(emailLog.createdAt, new Date(q.before)));
    const rows = await db.query.emailLog.findMany({ where: conditions.length ? and(...conditions) : undefined, orderBy: desc(emailLog.createdAt), limit: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    res.json({
      emails: page.map((r) => ({ ...r, canResend: RESEND_BY_REF.includes(r.kind) ? !!r.refId : !!r.body && r.attachments.length === 0 })),
      nextBefore: rows.length > q.limit ? page[page.length - 1].createdAt : null,
    });
  });

  router.post("/email-log/:id/resend", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    const row = await db.query.emailLog.findFirst({ where: eq(emailLog.id, req.params.id) });
    if (!row) throw new NotFoundError("Email not found");
    const by = req.user!.sub;
    if (row.kind === "appointment_letter" && row.refId) await queueAppointmentEmail(db, row.refId, row.toEmail, by);
    else if (row.kind === "internship_offer" && row.refId) await queueOfferEmail(db, row.refId, by);
    else if (row.kind === "policies" && row.refId) await enqueueJob(db, "policies.email", { to: row.toEmail, slugs: row.refId.split(","), by });
    else if (row.body && row.attachments.length === 0) await enqueueJob(db, "email.send", { to: row.toEmail, subject: row.subject, text: row.body, kind: row.kind, refId: row.refId, triggeredBy: by });
    else throw new AppError("CANNOT_RESEND", "This email can't be sent again from the log", 400);
    await writeAuditLog(db, { actorUserId: by, action: "email.resend", entityType: "email_log", entityId: row.id, ipAddress: req.ip });
    res.json({ emailQueued: true, to: row.toEmail });
  });

  // ---- Send someone their documents again ----

  /** What can be sent to this person: their latest appointment letter, their internship offer, the policies. */
  router.get("/send-documents/available", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    const userId = z.string().uuid().parse(req.query.userId);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, email: true } });
    if (!user) throw new NotFoundError("Person not found");
    const employee = await db.query.employees.findFirst({ where: eq(employees.userId, userId) });
    const letter = employee
      ? (await db.query.employeeLetters.findMany({ where: and(eq(employeeLetters.employeeId, employee.id), eq(employeeLetters.letterType, "appointment")), orderBy: desc(employeeLetters.version), limit: 1 }))[0]
      : undefined;
    const offer = (await db.query.participantOffers.findMany({ where: eq(participantOffers.userId, userId), orderBy: desc(participantOffers.issuedAt), limit: 1 }))[0];
    res.json({
      person: { id: user.id, email: user.email, name: await displayNameFor(db, userId) },
      appointmentLetter: letter?.details ? { id: letter.id, referenceNo: letter.referenceNo, version: letter.version, emailedAt: letter.emailedAt } : null,
      internshipOffer: offer ? { id: offer.id, referenceNo: offer.referenceNo, emailedAt: offer.emailedAt } : null,
      policies: (await activePolicies(db)).map((p) => ({ slug: p.slug, title: p.title, version: p.version })),
    });
  });

  router.post("/send-documents", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    const body = sendDocumentsSchema.parse(req.body);
    const user = await db.query.users.findFirst({ where: eq(users.id, body.userId), columns: { id: true, email: true } });
    if (!user) throw new NotFoundError("Person not found");
    const to = body.to ?? user.email;
    const by = req.user!.sub;
    const queued: string[] = [];
    if (body.appointmentLetter) {
      const employee = await db.query.employees.findFirst({ where: eq(employees.userId, user.id) });
      const [letter] = employee ? await db.query.employeeLetters.findMany({ where: and(eq(employeeLetters.employeeId, employee.id), eq(employeeLetters.letterType, "appointment")), orderBy: desc(employeeLetters.version), limit: 1 }) : [];
      if (!letter?.details) throw new AppError("NO_LETTER", "This person has no appointment letter yet", 400);
      await queueAppointmentEmail(db, letter.id, to, by);
      queued.push("appointment letter");
    }
    if (body.internshipOffer) {
      const [offer] = await db.query.participantOffers.findMany({ where: eq(participantOffers.userId, user.id), orderBy: desc(participantOffers.issuedAt), limit: 1 });
      if (!offer) throw new AppError("NO_OFFER", "This person has no internship offer", 400);
      await queueOfferEmail(db, offer.id, by);
      queued.push("internship offer");
    }
    if (body.policies.length) {
      const found = await db.query.companyPolicies.findMany({ where: and(inArray(companyPolicies.slug, body.policies), eq(companyPolicies.active, true)) });
      if (!found.length) throw new AppError("NO_POLICIES", "None of those policies are in use", 400);
      await enqueueJob(db, "policies.email", { to, slugs: found.map((p) => p.slug), by });
      queued.push(`${found.length} ${found.length === 1 ? "policy" : "policies"}`);
    }
    if (!queued.length) throw new AppError("NOTHING_SELECTED", "Pick at least one document to send", 400);
    await writeAuditLog(db, { actorUserId: by, action: "documents.send", entityType: "user", entityId: user.id, metadata: { to, queued }, ipAddress: req.ip });
    res.json({ emailQueued: true, to, queued });
  });

  return router;
}

/** Emails the chosen company policies as PDFs. */
export function registerSettingsJobs(db: Database, appUrl: string) {
  registerJobHandler("policies.email", async (payload) => {
    const slugs = (payload.slugs as string[]) ?? [];
    const policies = (await activePolicies(db)).filter((p) => slugs.includes(p.slug));
    if (!policies.length) return;
    const company = companyProfile();
    await deliverEmail({
      to: String(payload.to),
      subject: `${company.name} company ${policies.length === 1 ? `policy: ${policies[0].title}` : "policies"}`,
      text: [
        "Hello,",
        "",
        `Please find attached the ${company.name} ${policies.length === 1 ? "policy" : "policies"} that apply to you:`,
        ...policies.map((p) => `- ${p.title} (version ${p.version})`),
        "",
        `You can also read them any time in the portal: ${appUrl}/policies`,
        "",
        "Warm regards,",
        company.name,
      ].join("\n"),
      attachments: await Promise.all(policies.map(async (p) => ({ filename: policyFilename(p), content: Buffer.from(await renderPolicyPdf(p, p.updatedAt)), contentType: "application/pdf" }))),
      kind: "policies",
      refId: policies.map((p) => p.slug).join(","),
      triggeredBy: payload.by ? String(payload.by) : undefined,
    });
  });
}
