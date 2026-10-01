import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, courseEnrollments, courses, opportunities, opportunityCourses, paymentOrders, programEnrollments } from "../shared/db/schema.js";
import type { ApplicationStatus } from "../applications/state-machine.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import { notifyCandidate } from "../notifications/recruitment.js";
import { notify } from "../notifications/service.js";
import { notifyHiringTeam } from "../assessments/exams.js";
import { ensureProgressRows } from "../courses/routes.js";
import { formatWhen } from "../shared/format.js";
import { logger } from "../shared/logger.js";
import { joinUpcomingClasses } from "../courses/classes.js";
import { onProgramUnlocked } from "../internships/service.js";

export type ProgramEnrollment = typeof programEnrollments.$inferSelect;

export const rupees = (amount: string | number) => `₹${Number(amount).toLocaleString("en-IN")}`;

/** Trials end lazily on read, and by the periodic sweep below. */
export async function expireTrialIfDue(db: Database, enrollment: ProgramEnrollment, now = new Date()): Promise<ProgramEnrollment> {
  if (enrollment.status !== "trial" || !enrollment.trialEndsAt || enrollment.trialEndsAt > now) return enrollment;
  const [updated] = await db
    .update(programEnrollments)
    .set({ status: "trial_expired", updatedAt: now })
    .where(and(eq(programEnrollments.id, enrollment.id), eq(programEnrollments.status, "trial")))
    .returning();
  if (!updated) return (await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.id, enrollment.id) }))!;
  await notifyCandidate(db, enrollment.applicationId, {
    kind: "program.trial_ended",
    title: "Your free trial has ended",
    body: (opp) => `Your trial of ${opp} is over. Pay the program fee of ${rupees(enrollment.amount)} to keep going; your progress is saved.`,
    link: `/journey/${enrollment.applicationId}`,
    email: true,
  });
  return updated;
}

/**
 * Moves an open application to shortlisted after the HR round. Openings without an exam can go
 * straight to the HR round while the application is still "submitted", so that walks through review first.
 */
export async function moveToShortlisted(db: Database, applicationId: string, from: ApplicationStatus, actorUserId: string) {
  if (from === "submitted") {
    await applyApplicationTransition(db, { applicationId, from, to: "under_review", actorUserId, note: "HR round held" });
    from = "under_review";
  }
  if (from === "under_review" || from === "assessment_completed") {
    await applyApplicationTransition(db, { applicationId, from, to: "shortlisted", actorUserId, note: "Passed the HR round" });
    from = "shortlisted";
  }
  return from;
}

/**
 * The HR round was passed: the application is shortlisted and the
 * candidate is asked to pay the program fee or start a free trial (or,
 * when the opening has no fee, goes straight to the joining form).
 * Safe to call again; the enrollment is created once.
 */
export async function onHrRoundPassed(db: Database, applicationId: string, actorUserId: string) {
  const application = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!application) return null;
  const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId) });
  if (!opportunity) return null;

  await moveToShortlisted(db, applicationId, application.status as ApplicationStatus, actorUserId);

  const fee = Number(opportunity.programFee ?? 0);
  const [created] = await db
    .insert(programEnrollments)
    .values({
      applicationId,
      userId: application.userId,
      opportunityId: opportunity.id,
      status: fee > 0 ? "awaiting_choice" : "waived",
      amount: String(fee),
      trialHours: opportunity.trialHours,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) return db.query.programEnrollments.findFirst({ where: eq(programEnrollments.applicationId, applicationId) });

  if (fee > 0) {
    await notifyCandidate(db, applicationId, {
      kind: "program.payment_due",
      actorUserId,
      title: "You passed the HR round",
      body: (opp) =>
        opportunity.trialHours > 0
          ? `Welcome to ${opp}. Pay the program fee of ${rupees(fee)} now, or start a free ${opportunity.trialHours}-hour trial first.`
          : `Welcome to ${opp}. Pay the program fee of ${rupees(fee)} to get started.`,
      link: `/journey/${applicationId}`,
      email: true,
    });
  } else {
    await startProgram(db, created, "not_required", null);
    await notifyCandidate(db, applicationId, {
      kind: "program.joining_form",
      actorUserId,
      title: "You passed the HR round",
      body: (opp) => `Welcome to ${opp}. Fill in your joining form so the team can plan your sessions.`,
      link: `/journey/${applicationId}`,
      email: true,
    });
  }
  return created;
}

/**
 * Enrolls the candidate in the opening's courses. During a trial the
 * course enrollments are "pending" with the trial end as the due date, so
 * the LMS's existing overdue check pauses access when the trial runs out;
 * paying (or a waived fee) clears it.
 */
export async function startProgram(db: Database, enrollment: ProgramEnrollment, paymentStatus: "pending" | "paid" | "not_required", dueAt: Date | null) {
  try {
    const links = await db.select().from(opportunityCourses).where(eq(opportunityCourses.opportunityId, enrollment.opportunityId)).orderBy(asc(opportunityCourses.orderIndex));
    if (links.length === 0) return;
    const published = await db.query.courses.findMany({ where: and(inArray(courses.id, links.map((l) => l.courseId)), eq(courses.status, "published")) });
    for (const course of published) {
      const [row] = await db
        .insert(courseEnrollments)
        .values({ courseId: course.id, userId: enrollment.userId, paymentStatus, paymentDueAt: dueAt })
        .onConflictDoUpdate({
          target: [courseEnrollments.courseId, courseEnrollments.userId],
          set: { paymentStatus, paymentDueAt: dueAt },
          // Never downgrade a course someone already paid for or got for free.
          setWhere: inArray(courseEnrollments.paymentStatus, ["pending", "overdue"]),
        })
        .returning();
      if (row) await ensureProgressRows(db, row.id, course.id);
      await joinUpcomingClasses(db, course.id, enrollment.userId);
    }
  } catch (err) {
    logger.error({ err, enrollmentId: enrollment.id }, "Could not enroll program courses");
  }
}

/** Idempotent: the webhook, the return-page check and staff can all call it. */
export async function markEnrollmentPaid(
  db: Database,
  enrollmentId: string,
  input: { orderId?: string; gatewayPaymentId?: string | null; note?: string; actorUserId: string | null; event?: unknown },
) {
  const now = new Date();
  if (input.orderId) {
    await db
      .update(paymentOrders)
      .set({ status: "paid", gatewayPaymentId: input.gatewayPaymentId ?? null, lastEvent: input.event ?? null, updatedAt: now })
      .where(eq(paymentOrders.orderId, input.orderId));
  }
  const [updated] = await db
    .update(programEnrollments)
    .set({ status: "paid", paidAt: now, paymentNote: input.note ?? null, updatedAt: now })
    .where(and(eq(programEnrollments.id, enrollmentId), inArray(programEnrollments.status, ["awaiting_choice", "trial", "trial_expired"])))
    .returning();
  if (!updated) return db.query.programEnrollments.findFirst({ where: eq(programEnrollments.id, enrollmentId) });

  await startProgram(db, updated, "paid", null);
  // Internship tracks have no joining form: paying unlocks the roadmap and
  // makes the participant an intern, with its own notifications.
  const isTrack = await onProgramUnlocked(db, updated, input.actorUserId);
  if (!isTrack) await notifyCandidate(db, updated.applicationId, {
    kind: "program.paid",
    actorUserId: input.actorUserId ?? undefined,
    title: "Payment received",
    body: (opp) => `We've received ${rupees(updated.amount)} for ${opp}. Next, fill in your joining form.`,
    link: `/journey/${updated.applicationId}`,
    email: true,
  });
  await notifyHiringTeam(db, updated.opportunityId, updated.userId, {
    kind: "program.paid",
    title: "Program fee paid",
    body: (who, opp) => `${who} paid ${rupees(updated.amount)} for ${opp}${input.note ? ` (${input.note})` : ""}.`,
    link: `/opportunities/${updated.opportunityId}?applicant=${updated.applicationId}`,
  });
  return updated;
}

/** Ends trials that ran out, and warns two hours before. Idempotent. */
export async function sweepTrials(db: Database, now = new Date()) {
  const due = await db.query.programEnrollments.findMany({ where: and(eq(programEnrollments.status, "trial"), lt(programEnrollments.trialEndsAt, now)) });
  for (const e of due) await expireTrialIfDue(db, e, now);

  const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const ending = await db.query.programEnrollments.findMany({ where: and(eq(programEnrollments.status, "trial"), lt(programEnrollments.trialEndsAt, soon)) });
  for (const e of ending) {
    await notify(db, {
      userIds: [e.userId],
      kind: "program.trial_ending",
      title: "Your free trial ends soon",
      body: `It ends ${formatWhen(e.trialEndsAt!)}. Pay ${rupees(e.amount)} to keep your access.`,
      link: `/journey/${e.applicationId}`,
      dedupeKey: `trial-ending:${e.id}`,
      email: true,
    });
  }
}
