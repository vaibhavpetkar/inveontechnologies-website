import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  assessmentAttempts,
  assessmentQuestions,
  assessmentAttemptAnswers,
  assessments,
  applications,
} from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { scoreAttempt } from "./scoring.js";
import { isSystemTransitionAllowed, type ApplicationStatus } from "../applications/state-machine.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import type { Env } from "../shared/env.js";

const PIPELINE_ROLES = ["manager", "hr", "admin", "super_admin"] as const;

const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().uuid(), selectedOptionId: z.string().nullable() })),
});

/**
 * A submission that arrives shortly after expiresAt is still accepted. The
 * candidate's page auto-submits when its countdown reaches zero, so that
 * request always lands a little after the deadline (network latency, clock
 * skew); without a grace window every auto-submit was discarded and the
 * attempt scored as fully unanswered.
 */
const SUBMIT_GRACE_MS = 30 * 1000;

function isPastGrace(attempt: typeof assessmentAttempts.$inferSelect): boolean {
  return !!attempt.expiresAt && attempt.expiresAt.getTime() + SUBMIT_GRACE_MS < Date.now();
}

/**
 * Lazy expiry: if the attempt is in_progress and past its expiresAt (plus
 * the submit grace window), finalize it now (score whatever was never
 * submitted as unanswered) instead of waiting for a background job that
 * doesn't exist in this stack yet (see schema.ts comment). Called from both
 * GET and submit so an expired attempt is caught whichever way it's next
 * touched.
 */
async function resolveExpiryIfNeeded(db: Database, attempt: typeof assessmentAttempts.$inferSelect) {
  if (attempt.status !== "in_progress" || !isPastGrace(attempt)) {
    return attempt;
  }

  const questions = await db.query.assessmentQuestions.findMany({ where: eq(assessmentQuestions.assessmentId, attempt.assessmentId) });
  const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, attempt.assessmentId) });
  const result = scoreAttempt(questions, [], assessment?.passingScorePercent ?? 60);

  const [updated] = await db.transaction(async (tx) => {
    // Conditional on still being in_progress, so a concurrent submit/expiry
    // can't both finalize the attempt (and collide on the answers' unique key).
    const [row] = await tx
      .update(assessmentAttempts)
      .set({ status: "expired", scorePercent: result.scorePercent, passed: result.passed })
      .where(and(eq(assessmentAttempts.id, attempt.id), eq(assessmentAttempts.status, "in_progress")))
      .returning();
    if (!row) {
      return [(await tx.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.id, attempt.id) })) ?? attempt];
    }

    await tx.insert(assessmentAttemptAnswers).values(
      result.answers.map((a) => ({
        attemptId: attempt.id,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
      })),
    );

    const application = await tx.query.applications.findFirst({ where: eq(applications.id, attempt.applicationId) });
    if (application && isSystemTransitionAllowed(application.status as ApplicationStatus, "assessment_completed")) {
      await tx
        .update(applications)
        .set({ status: "assessment_completed", updatedAt: new Date() })
        .where(eq(applications.id, application.id));
      const { applicationEvents } = await import("../shared/db/schema.js");
      await tx.insert(applicationEvents).values({
        applicationId: application.id,
        fromStatus: "assessment_invited",
        toStatus: "assessment_completed",
        actorUserId: null,
        note: `Assessment attempt expired without submission (scored ${result.scorePercent}%)`,
      });
    }
    return [row];
  });

  return updated;
}

export function attemptRouter(db: Database, env: Env) {
  const router = Router();

  async function getOwnedAttempt(req: import("express").Request, requireOwner: boolean) {
    const attempt = await db.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.id, req.params.id) });
    if (!attempt) throw new NotFoundError("Assessment attempt not found");

    const application = await db.query.applications.findFirst({ where: eq(applications.id, attempt.applicationId) });
    if (!application) throw new NotFoundError("Application not found");

    const isPrivileged = PIPELINE_ROLES.includes(req.user!.role as (typeof PIPELINE_ROLES)[number]);
    const isOwner = application.userId === req.user!.sub;
    if (requireOwner && !isOwner) throw new ForbiddenError();
    if (!requireOwner && !isOwner && !isPrivileged) throw new ForbiddenError();

    return { attempt, application, isOwner, isPrivileged };
  }

  /**
   * Look up the attempt belonging to an application. Without this a
   * candidate has no way to reach their own assessment: every other
   * attempt route is keyed by attempt id, and that id was previously
   * only ever surfaced in the invite email — which is stubbed and never
   * actually sent (Phase 9 doesn't exist). Registered BEFORE "/:id" so
   * the literal "by-application" segment isn't captured as an id.
   */
  router.get("/by-application/:applicationId", requireAuth(env), async (req, res) => {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");

    const isPrivileged = PIPELINE_ROLES.includes(req.user!.role as (typeof PIPELINE_ROLES)[number]);
    if (application.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    const attempt = await db.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.applicationId, application.id) });
    if (!attempt) throw new NotFoundError("No assessment attempt exists for this application");

    res.json({ attempt });
  });

  router.post("/:id/start", requireAuth(env), async (req, res) => {
    const { attempt } = await getOwnedAttempt(req, true);

    if (attempt.status !== "not_started") {
      throw new AppError("INVALID_ATTEMPT_STATE", `Cannot start an attempt in status "${attempt.status}"`, 400);
    }

    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, attempt.assessmentId) });
    if (!assessment) throw new NotFoundError("Assessment not found");

    const expiresAt = new Date(Date.now() + assessment.durationMinutes * 60 * 1000);
    const [updated] = await db
      .update(assessmentAttempts)
      .set({ status: "in_progress", startedAt: new Date(), expiresAt })
      .where(eq(assessmentAttempts.id, attempt.id))
      .returning();

    const questions = await db.query.assessmentQuestions.findMany({
      where: eq(assessmentQuestions.assessmentId, assessment.id),
      orderBy: (q, { asc }) => [asc(q.orderIndex)],
    });
    // Never send correctOptionId to the candidate.
    const safeQuestions = questions.map((q) => ({ id: q.id, questionText: q.questionText, options: q.options, points: q.points }));

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "assessment_attempt.start", entityType: "assessment_attempt", entityId: attempt.id, ipAddress: req.ip });
    res.json({ attempt: updated, questions: safeQuestions });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    const { attempt: initial, isPrivileged } = await getOwnedAttempt(req, false);
    const attempt = await resolveExpiryIfNeeded(db, initial);

    const questions = await db.query.assessmentQuestions.findMany({
      where: eq(assessmentQuestions.assessmentId, attempt.assessmentId),
      orderBy: (q, { asc }) => [asc(q.orderIndex)],
    });

    if (attempt.status === "scored" || attempt.status === "expired" || isPrivileged) {
      // Safe to reveal correct answers once resolved, or to a privileged reviewer.
      const answers = await db.query.assessmentAttemptAnswers.findMany({ where: eq(assessmentAttemptAnswers.attemptId, attempt.id) });
      res.json({ attempt, questions, answers });
      return;
    }

    const safeQuestions = questions.map((q) => ({ id: q.id, questionText: q.questionText, options: q.options, points: q.points }));
    res.json({ attempt, questions: safeQuestions });
  });

  router.post("/:id/submit", requireAuth(env), async (req, res) => {
    const body = submitSchema.parse(req.body);
    const { attempt: initial, application } = await getOwnedAttempt(req, true);
    const attempt = await resolveExpiryIfNeeded(db, initial);

    if (attempt.status !== "in_progress") {
      throw new AppError("INVALID_ATTEMPT_STATE", `Cannot submit an attempt in status "${attempt.status}"`, 400);
    }

    const questions = await db.query.assessmentQuestions.findMany({ where: eq(assessmentQuestions.assessmentId, attempt.assessmentId) });
    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, attempt.assessmentId) });
    const result = scoreAttempt(questions, body.answers, assessment?.passingScorePercent ?? 60);

    const updated = await db.transaction(async (tx) => {
      // Conditional on still being in_progress so a double-click / retried
      // submit is rejected cleanly instead of colliding on the answers' unique key.
      const [row] = await tx
        .update(assessmentAttempts)
        .set({ status: "scored", submittedAt: new Date(), scorePercent: result.scorePercent, passed: result.passed })
        .where(and(eq(assessmentAttempts.id, attempt.id), eq(assessmentAttempts.status, "in_progress")))
        .returning();
      if (!row) throw new AppError("INVALID_ATTEMPT_STATE", "This attempt has already been submitted", 400);

      await tx.insert(assessmentAttemptAnswers).values(
        result.answers.map((a) => ({
          attemptId: attempt.id,
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          isCorrect: a.isCorrect,
          pointsAwarded: a.pointsAwarded,
        })),
      );
      return row;
    });

    if (isSystemTransitionAllowed(application.status as ApplicationStatus, "assessment_completed")) {
      await applyApplicationTransition(db, {
        applicationId: application.id,
        from: "assessment_invited",
        to: "assessment_completed",
        actorUserId: req.user!.sub,
        note: `Assessment submitted — scored ${result.scorePercent}% (${result.passed ? "pass" : "fail"})`,
      });
    }

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "assessment_attempt.submit",
      entityType: "assessment_attempt",
      entityId: attempt.id,
      metadata: { scorePercent: result.scorePercent, passed: result.passed },
      ipAddress: req.ip,
    });

    res.json({ attempt: updated, scorePercent: result.scorePercent, passed: result.passed });
  });

  return router;
}
