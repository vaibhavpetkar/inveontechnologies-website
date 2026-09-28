import express, { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  applications,
  assessmentAttempts,
  assessments,
  calendarEventAttendees,
  calendarEvents,
  candidateProfiles,
  interviewRounds,
  opportunities,
  paymentOrders,
  employees,
  programEnrollments,
  salaryStructures,
  users,
} from "../shared/db/schema.js";
import { createEmployeeRecord, resolveDesignation } from "../employees/onboarding.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { PIPELINE_ROLES, assertCanManageApplication, canViewApplication, getApplicationOr404, isRecruitmentAdmin } from "../applications/access.js";
import { notifyHiringTeam } from "../assessments/exams.js";
import { every } from "../shared/jobs.js";
import { cashfreeConfig, createOrder, getOrder, normalisePhone, verifyWebhookSignature } from "./cashfree.js";
import { expireTrialIfDue, markEnrollmentPaid, startProgram, sweepTrials, type ProgramEnrollment } from "./enrollments.js";

const joiningSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(8).max(20),
  dateOfBirth: z.string().date().nullable().optional(),
  address: z.string().trim().min(5).max(500),
  city: z.string().trim().min(2).max(100),
  college: z.string().trim().max(200).nullable().optional(),
  degree: z.string().trim().max(100).nullable().optional(),
  graduationYear: z.number().int().min(1990).max(2100).nullable().optional(),
  githubUsername: z.string().trim().max(60).regex(/^[A-Za-z0-9-]*$/, "GitHub usernames use letters, numbers and dashes").nullable().optional(),
  linkedinUrl: z.string().trim().url().max(300).nullable().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().min(2).max(200),
  emergencyContactPhone: z.string().trim().min(8).max(20),
  preferredStartDate: z.string().date(),
  hoursPerWeek: z.number().int().min(1).max(80),
  preferredSlots: z.array(z.enum(["weekday_morning", "weekday_afternoon", "weekday_evening", "weekend"])).min(1).max(4),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const noteSchema = z.object({ note: z.string().trim().max(500).optional() });

/** Periodic trial expiry and "ends soon" reminders. */
export function registerProgramSchedules(db: Database) {
  every("program-trials", 5 * 60 * 1000, async () => {
    await sweepTrials(db);
  });
}

async function loadEnrollment(db: Database, id: string) {
  const row = await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.id, id) });
  if (!row) throw new NotFoundError("Enrollment not found");
  return expireTrialIfDue(db, row);
}

async function sessionsFor(db: Database, userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      timezone: calendarEvents.timezone,
      joinUrl: calendarEvents.joinUrl,
      location: calendarEvents.location,
    })
    .from(calendarEvents)
    .innerJoin(calendarEventAttendees, and(eq(calendarEventAttendees.eventId, calendarEvents.id), eq(calendarEventAttendees.userId, userId)))
    .where(and(isNull(calendarEvents.cancelledAt), gt(calendarEvents.endsAt, since)))
    .orderBy(asc(calendarEvents.startsAt))
    .limit(30);
}

export function programRouter(db: Database, env: Env) {
  const router = Router();
  const cashfree = cashfreeConfig(env);

  /** Everything the candidate's journey page (and the staff drawer) needs for one application. */
  router.get("/by-application/:applicationId", requireAuth(env), async (req, res) => {
    const application = await getApplicationOr404(db, req.params.applicationId);
    if (!(await canViewApplication(db, req, application))) throw new ForbiddenError();
    const isOwner = application.userId === req.user!.sub;

    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId) });
    const row = await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.applicationId, application.id) });
    const enrollment = row ? await expireTrialIfDue(db, row) : null;
    const interviews = await db.query.interviewRounds.findMany({ where: eq(interviewRounds.applicationId, application.id), orderBy: asc(interviewRounds.roundNumber) });
    const attempts = await db
      .select({ id: assessmentAttempts.id, status: assessmentAttempts.status, scorePercent: assessmentAttempts.scorePercent, passed: assessmentAttempts.passed, submittedAt: assessmentAttempts.submittedAt, language: assessments.language, title: assessments.title })
      .from(assessmentAttempts)
      .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
      .where(eq(assessmentAttempts.applicationId, application.id))
      .orderBy(desc(assessmentAttempts.createdAt));
    const orders = enrollment
      ? await db.query.paymentOrders.findMany({ where: eq(paymentOrders.enrollmentId, enrollment.id), orderBy: desc(paymentOrders.createdAt), limit: 5 })
      : [];

    const person = await db
      .select({ email: users.email, fullName: candidateProfiles.fullName, phone: candidateProfiles.phone })
      .from(users)
      .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
      .where(eq(users.id, application.userId));

    res.json({
      candidate: person[0] ?? null,
      application: { id: application.id, status: application.status, businessId: application.businessId, createdAt: application.createdAt, userId: application.userId },
      opportunity: opportunity && {
        id: opportunity.id,
        title: opportunity.title,
        kind: opportunity.kind,
        programFee: opportunity.programFee !== null ? Number(opportunity.programFee) : null,
        trialHours: opportunity.trialHours,
      },
      exam: attempts,
      interviews: isOwner ? interviews.map(({ feedback, scorecard, ...rest }) => rest) : interviews,
      enrollment,
      payments: { enabled: !!cashfree, mode: cashfree?.mode ?? null, orders: orders.map(({ lastEvent, paymentSessionId, ...o }) => o) },
      sessions: await sessionsFor(db, application.userId),
      employee: await db.query.employees.findFirst({ where: eq(employees.userId, application.userId), columns: { id: true, businessId: true, employeeType: true, joiningDate: true, durationMonths: true, status: true } }) ?? null,
    });
  });

  router.post("/enrollments/:id/trial", requireAuth(env), async (req, res) => {
    const enrollment = await loadEnrollment(db, req.params.id);
    if (enrollment.userId !== req.user!.sub) throw new ForbiddenError();
    if (enrollment.status !== "awaiting_choice") throw new AppError("INVALID_STATE", "The free trial can only be started once, before paying", 409);
    if (enrollment.trialHours <= 0) throw new AppError("NO_TRIAL", "This program doesn't offer a free trial", 400);

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + enrollment.trialHours * 60 * 60 * 1000);
    const [updated] = await db
      .update(programEnrollments)
      .set({ status: "trial", trialStartedAt: now, trialEndsAt, updatedAt: now })
      .where(and(eq(programEnrollments.id, enrollment.id), eq(programEnrollments.status, "awaiting_choice")))
      .returning();
    if (!updated) throw new AppError("INVALID_STATE", "The free trial can only be started once, before paying", 409);

    await startProgram(db, updated, "pending", trialEndsAt);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "program.trial_start", entityType: "program_enrollment", entityId: updated.id, ipAddress: req.ip });
    await notifyHiringTeam(db, updated.opportunityId, updated.userId, {
      kind: "program.trial_started",
      title: "Free trial started",
      body: (who, opp) => `${who} started a ${updated.trialHours}-hour free trial of ${opp}.`,
      link: `/opportunities/${updated.opportunityId}?applicant=${updated.applicationId}`,
    });
    res.json({ enrollment: updated });
  });

  router.post("/enrollments/:id/pay", requireAuth(env), async (req, res) => {
    const enrollment = await loadEnrollment(db, req.params.id);
    if (enrollment.userId !== req.user!.sub) throw new ForbiddenError();
    if (!["awaiting_choice", "trial", "trial_expired"].includes(enrollment.status)) throw new AppError("INVALID_STATE", "Nothing to pay for this program", 409);
    if (!cashfree) throw new AppError("PAYMENTS_NOT_CONFIGURED", "Online payment isn't set up yet. Start the free trial, or contact the team to pay another way.", 503);
    const amount = Number(enrollment.amount);
    if (!(amount > 0)) throw new AppError("INVALID_STATE", "Nothing to pay for this program", 409);

    const user = await db.query.users.findFirst({ where: eq(users.id, enrollment.userId) });
    const profile = await db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.userId, enrollment.userId) });
    const details = (enrollment.joiningDetails ?? {}) as { phone?: string };
    const phone = normalisePhone(details.phone) ?? normalisePhone(profile?.phone);
    if (!phone) throw new AppError("PHONE_REQUIRED", "Add a 10-digit phone number to your profile before paying", 400);

    const orderId = `inv_${enrollment.id.slice(0, 8)}_${Date.now()}`;
    const appUrl = env.PORTAL_APP_URL.replace(/\/$/, "");
    const order = await createOrder(cashfree, {
      orderId,
      amount,
      customer: { id: enrollment.userId, name: profile?.fullName ?? null, email: user!.email, phone },
      returnUrl: `${appUrl}/journey/${enrollment.applicationId}?order_id={order_id}`,
      notifyUrl: appUrl.startsWith("https://") ? `${appUrl}/api/v1/payments/cashfree/webhook` : null,
      note: "Inveon program fee",
    });
    if (!order.payment_session_id) throw new AppError("PAYMENT_GATEWAY_ERROR", "Cashfree didn't return a payment session", 502);

    await db.insert(paymentOrders).values({ enrollmentId: enrollment.id, userId: enrollment.userId, orderId, amount: String(amount), paymentSessionId: order.payment_session_id });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "program.payment_start", entityType: "program_enrollment", entityId: enrollment.id, metadata: { orderId, amount }, ipAddress: req.ip });
    res.status(201).json({ orderId, paymentSessionId: order.payment_session_id, mode: cashfree.mode });
  });

  /** Called when the candidate comes back from Cashfree; the webhook may not have landed yet. */
  router.post("/enrollments/:id/verify", requireAuth(env), async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(3).max(60) }).parse(req.body);
    const enrollment = await loadEnrollment(db, req.params.id);
    const application = await getApplicationOr404(db, enrollment.applicationId);
    if (!(await canViewApplication(db, req, application))) throw new ForbiddenError();
    const order = await db.query.paymentOrders.findFirst({ where: and(eq(paymentOrders.orderId, orderId), eq(paymentOrders.enrollmentId, enrollment.id)) });
    if (!order) throw new NotFoundError("Payment not found");
    if (!cashfree) throw new AppError("PAYMENTS_NOT_CONFIGURED", "Online payment isn't set up", 503);

    const remote = await getOrder(cashfree, orderId);
    let updated: ProgramEnrollment | undefined = enrollment;
    if (remote.order_status === "PAID" && Number(remote.order_amount) === Number(order.amount)) {
      updated = await markEnrollmentPaid(db, enrollment.id, { orderId, actorUserId: req.user!.sub, event: { source: "verify", order: remote } });
    } else if (remote.order_status === "EXPIRED" || remote.order_status === "TERMINATED") {
      await db.update(paymentOrders).set({ status: "failed", updatedAt: new Date() }).where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "created")));
    }
    res.json({ orderStatus: remote.order_status, enrollment: updated });
  });

  router.put("/enrollments/:id/joining", requireAuth(env), async (req, res) => {
    const body = joiningSchema.parse(req.body);
    const enrollment = await loadEnrollment(db, req.params.id);
    if (enrollment.userId !== req.user!.sub) throw new ForbiddenError();
    if (!["trial", "paid", "waived"].includes(enrollment.status)) {
      throw new AppError("INVALID_STATE", enrollment.status === "trial_expired" ? "Your trial has ended. Pay the program fee to continue." : "Pay or start your free trial first", 409);
    }
    const first = !enrollment.joiningSubmittedAt;
    const [updated] = await db
      .update(programEnrollments)
      .set({ joiningDetails: body, joiningSubmittedAt: new Date(), updatedAt: new Date() })
      .where(eq(programEnrollments.id, enrollment.id))
      .returning();
    // Keep the profile in step with what they just told us.
    await db.update(candidateProfiles).set({ fullName: body.fullName, phone: body.phone }).where(eq(candidateProfiles.userId, enrollment.userId));
    if (body.githubUsername) await db.update(users).set({ githubUsername: body.githubUsername }).where(eq(users.id, enrollment.userId));
    if (first) {
      await notifyHiringTeam(db, enrollment.opportunityId, enrollment.userId, {
        kind: "program.joining_submitted",
        title: "Joining form submitted",
        body: (who, opp) => `${who} filled in the joining form for ${opp}. They can start ${body.preferredStartDate}. Book their sessions.`,
        link: `/opportunities/${enrollment.opportunityId}?applicant=${enrollment.applicationId}`,
      });
    }
    res.json({ enrollment: updated });
  });

  // --- Staff ---

  router.post("/enrollments/:id/mark-paid", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const { note } = noteSchema.parse(req.body ?? {});
    const enrollment = await loadEnrollment(db, req.params.id);
    await assertCanManageApplication(db, req, await getApplicationOr404(db, enrollment.applicationId));
    if (!["awaiting_choice", "trial", "trial_expired"].includes(enrollment.status)) throw new AppError("INVALID_STATE", `Already ${enrollment.status.replace("_", " ")}`, 409);
    const updated = await markEnrollmentPaid(db, enrollment.id, { note: note || "Marked paid by staff", actorUserId: req.user!.sub });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "program.mark_paid", entityType: "program_enrollment", entityId: enrollment.id, metadata: { note }, ipAddress: req.ip });
    res.json({ enrollment: updated });
  });

  router.post("/enrollments/:id/waive", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const { note } = noteSchema.parse(req.body ?? {});
    const enrollment = await loadEnrollment(db, req.params.id);
    await assertCanManageApplication(db, req, await getApplicationOr404(db, enrollment.applicationId));
    if (!["awaiting_choice", "trial", "trial_expired"].includes(enrollment.status)) throw new AppError("INVALID_STATE", `Already ${enrollment.status.replace("_", " ")}`, 409);
    const [updated] = await db.update(programEnrollments).set({ status: "waived", paymentNote: note || "Fee waived", updatedAt: new Date() }).where(eq(programEnrollments.id, enrollment.id)).returning();
    await startProgram(db, updated, "not_required", null);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "program.waive", entityType: "program_enrollment", entityId: enrollment.id, metadata: { note }, ipAddress: req.ip });
    res.json({ enrollment: updated });
  });

  /**
   * The last step of the journey: hire someone who has paid for (or been
   * waived into) the program. Creates their employee record (which makes
   * them an intern or employee in the portal), marks the application
   * selected, and optionally sets their monthly stipend or salary.
   */
  router.post("/enrollments/:id/hire", requireAuth(env), requireRole("hr", "admin", "super_admin"), async (req, res) => {
    const body = z
      .object({
        employeeType: z.enum(["intern", "full_time", "contract"]).default("intern"),
        joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        durationMonths: z.number().int().min(1).max(60).optional(),
        designationTitle: z.string().trim().max(200).optional(),
        managerId: z.string().uuid().optional(),
        monthlyPay: z.number().min(0).max(10_000_000).optional(),
      })
      .parse(req.body);
    const enrollment = await loadEnrollment(db, req.params.id);
    if (!["paid", "waived"].includes(enrollment.status)) throw new AppError("INVALID_STATE", "Hire once the program fee is paid or waived", 409);
    const application = await getApplicationOr404(db, enrollment.applicationId);
    const existing = await db.query.employees.findFirst({ where: eq(employees.userId, enrollment.userId) });
    if (existing) throw new AppError("ALREADY_EMPLOYEE", `Already hired as ${existing.businessId}`, 409);
    if (body.managerId) {
      const manager = await db.query.users.findFirst({ where: eq(users.id, body.managerId) });
      if (!manager || manager.role === "candidate") throw new AppError("INVALID_MANAGER", "Manager must be a staff account", 400);
    }

    const joiningDate = new Date(`${body.joiningDate}T00:00:00Z`);
    const employee = await createEmployeeRecord(db, {
      userId: enrollment.userId,
      applicationId: application.id,
      employeeType: body.employeeType,
      designationId: await resolveDesignation(db, body.designationTitle),
      managerId: body.managerId ?? null,
      hrManagerId: req.user!.sub,
      joiningDate,
      durationMonths: body.durationMonths ?? null,
      createdBy: req.user!.sub,
    });
    if (body.monthlyPay) {
      await db.insert(salaryStructures).values({
        employeeId: employee.id,
        effectiveFrom: joiningDate,
        components: [{ name: body.employeeType === "intern" ? "Stipend" : "Basic salary", amount: body.monthlyPay, kind: "earning" }],
        createdBy: req.user!.sub,
      });
    }
    if (application.status === "shortlisted") {
      await applyApplicationTransition(db, { applicationId: application.id, from: "shortlisted", to: "selected", actorUserId: req.user!.sub, note: `Hired as ${employee.businessId}` });
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "program.hire", entityType: "program_enrollment", entityId: enrollment.id, metadata: { employeeId: employee.id }, ipAddress: req.ip });
    res.status(201).json({ employee });
  });

  /** The opening's applicants with their exam, HR round and program state, for the staff panel. */
  router.get("/applicants", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const { opportunityId } = z.object({ opportunityId: z.string().uuid() }).parse(req.query);
    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId) });
    if (!opportunity) throw new NotFoundError("Opportunity not found");
    if (!isRecruitmentAdmin(req.user!.role) && opportunity.hiringManagerId !== req.user!.sub) throw new ForbiddenError();

    const rows = await db
      .select({
        id: applications.id,
        businessId: applications.businessId,
        status: applications.status,
        createdAt: applications.createdAt,
        userId: applications.userId,
        email: users.email,
        fullName: candidateProfiles.fullName,
        phone: candidateProfiles.phone,
        enrollmentId: programEnrollments.id,
        enrollmentStatus: programEnrollments.status,
        trialEndsAt: programEnrollments.trialEndsAt,
        joiningSubmittedAt: programEnrollments.joiningSubmittedAt,
        employeeId: employees.id,
      })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .leftJoin(candidateProfiles, eq(candidateProfiles.userId, applications.userId))
      .leftJoin(programEnrollments, eq(programEnrollments.applicationId, applications.id))
      .leftJoin(employees, eq(employees.userId, applications.userId))
      .where(eq(applications.opportunityId, opportunityId))
      .orderBy(desc(applications.createdAt))
      .limit(300);

    const ids = rows.map((r) => r.id);
    const best = new Map<string, { scorePercent: number | null; passed: boolean | null; language: string | null }>();
    const nextInterview = new Map<string, { scheduledAt: Date; status: string; decision: string | null }>();
    if (ids.length) {
      const attempts = await db
        .select({ applicationId: assessmentAttempts.applicationId, scorePercent: assessmentAttempts.scorePercent, passed: assessmentAttempts.passed, language: assessments.language })
        .from(assessmentAttempts)
        .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
        .where(inArray(assessmentAttempts.applicationId, ids));
      for (const a of attempts) {
        const cur = best.get(a.applicationId);
        if (a.scorePercent === null) continue;
        if (!cur || (cur.scorePercent ?? -1) < a.scorePercent) best.set(a.applicationId, a);
      }
      const rounds = await db.query.interviewRounds.findMany({ where: inArray(interviewRounds.applicationId, ids), orderBy: desc(interviewRounds.scheduledAt) });
      for (const r of rounds) if (!nextInterview.has(r.applicationId)) nextInterview.set(r.applicationId, { scheduledAt: r.scheduledAt, status: r.status, decision: r.decision });
    }
    res.json({ applicants: rows.map((r) => ({ ...r, exam: best.get(r.id) ?? null, interview: nextInterview.get(r.id) ?? null })) });
  });

  return router;
}

/**
 * Cashfree webhook. Mounted before express.json() because the signature
 * covers the raw body.
 */
export function cashfreeWebhookRouter(db: Database, env: Env) {
  const router = Router();
  const cashfree = cashfreeConfig(env);

  router.post("/cashfree/webhook", express.raw({ type: "*/*", limit: "256kb" }), async (req, res) => {
    if (!cashfree) {
      res.status(503).json({ error: { code: "PAYMENTS_NOT_CONFIGURED", message: "Payments are not configured" } });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyWebhookSignature(cashfree, raw, req.header("x-webhook-timestamp"), req.header("x-webhook-signature"))) {
      logger.warn("Cashfree webhook with a bad signature");
      res.status(401).json({ error: { code: "BAD_SIGNATURE", message: "Signature mismatch" } });
      return;
    }
    let event: { type?: string; data?: { order?: { order_id?: string; order_amount?: number }; payment?: { cf_payment_id?: string | number; payment_status?: string } } };
    try {
      event = JSON.parse(raw);
    } catch {
      res.status(400).json({ error: { code: "BAD_BODY", message: "Invalid JSON" } });
      return;
    }
    const orderId = event.data?.order?.order_id;
    const order = orderId ? await db.query.paymentOrders.findFirst({ where: eq(paymentOrders.orderId, orderId) }) : null;
    if (!order) {
      // Not one of ours (the Events site shares the account). Acknowledge so Cashfree stops retrying.
      res.json({ ok: true, ignored: true });
      return;
    }

    const paymentId = event.data?.payment?.cf_payment_id != null ? String(event.data.payment.cf_payment_id) : null;
    if (event.type === "PAYMENT_SUCCESS_WEBHOOK" && event.data?.payment?.payment_status === "SUCCESS") {
      if (Number(event.data.order?.order_amount) !== Number(order.amount)) {
        logger.error({ orderId, amount: event.data.order?.order_amount }, "Cashfree webhook amount doesn't match the order");
        res.status(400).json({ error: { code: "AMOUNT_MISMATCH", message: "Amount mismatch" } });
        return;
      }
      await markEnrollmentPaid(db, order.enrollmentId, { orderId: order.orderId, gatewayPaymentId: paymentId, actorUserId: null, event });
    } else if (event.type === "PAYMENT_FAILED_WEBHOOK" || event.type === "PAYMENT_USER_DROPPED_WEBHOOK") {
      await db
        .update(paymentOrders)
        .set({ status: event.type === "PAYMENT_FAILED_WEBHOOK" ? "failed" : "dropped", gatewayPaymentId: paymentId, lastEvent: event, updatedAt: new Date() })
        .where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "created")));
    }
    res.json({ ok: true });
  });

  return router;
}
