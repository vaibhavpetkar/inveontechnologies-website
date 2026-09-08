import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
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
 * Lazy expiry: if the attempt is in_progress and past its expiresAt, finalize
 * it now (score whatever was never submitted as unanswered) instead of
 * waiting for a background job that doesn't exist in this stack yet (see
 * schema.ts comment). Called from both GET and submit so an expired attempt
 * is caught whichever way it's next touched.
 */
async function resolveExpiryIfNeeded(db: Database, attempt: typeof assessmentAttempts.$inferSelect) {
  if (attempt.status !== "in_progress" || !attempt.expiresAt || attempt.expiresAt > new Date()) {
    return attempt;
  }

  const questions = await db.query.assessmentQuestions.findMany({ where: eq(assessmentQuestions.assessmentId, attempt.assessmentId) });
  const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, attempt.assessmentId) });
  const result = scoreAttempt(questions, [], assessment?.passingScorePercent ?? 60);

  const [updated] = await db.transaction(async (tx) => {
    await tx.insert(assessmentAttemptAnswers).values(
      result.answers.map((a) => ({
        attemptId: attempt.id,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
      })),
    );
    const [row] = await tx
      .update(assessmentAttempts)
      .set({ status: "expired", scorePercent: result.scorePercent, passed: result.passed })
      .where(eq(assessmentAttempts.id, attempt.id))
      .returning();

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
      await tx.insert(assessmentAttemptAnswers).values(
        result.answers.map((a) => ({
          attemptId: attempt.id,
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          isCorrect: a.isCorrect,
          pointsAwarded: a.pointsAwarded,
        })),
      );
      const [row] = await tx
        .update(assessmentAttempts)
        .set({ status: "scored", submittedAt: new Date(), scorePercent: result.scorePercent, passed: result.passed })
        .where(eq(assessmentAttempts.id, attempt.id))
        .returning();
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
