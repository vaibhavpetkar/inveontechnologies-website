import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import type { ApplicationStatus } from "../applications/state-machine.js";
import { attemptsUsedByExam, examWindow, examsForOpportunity, formatIst, resolveAfterAttempt } from "./exams.js";
import type { Env } from "../shared/env.js";
import { canStaffAccessApplication } from "../applications/access.js";


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

  let finalizedHere = false;
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
    finalizedHere = true;
    return [row];
  });

  if (finalizedHere) {
    await resolveAfterAttempt(db, { applicationId: attempt.applicationId, assessmentId: attempt.assessmentId, scorePercent: result.scorePercent, passed: result.passed, actorUserId: null });
  }
  return updated;
}

function assertExamOpen(exam: { opensAt: Date | null; closesAt: Date | null }) {
  const state = examWindow(exam);
  if (state === "upcoming") {
    throw new AppError("EXAM_NOT_OPEN", `This exam opens on ${formatIst(exam.opensAt!)}`, 409);
  }
  if (state === "closed") {
    throw new AppError("EXAM_CLOSED", `This exam closed on ${formatIst(exam.closesAt!)}`, 409);
  }
}

export function attemptRouter(db: Database, env: Env) {
  const router = Router();

  async function getOwnedAttempt(req: import("express").Request, requireOwner: boolean) {
    const attempt = await db.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.id, req.params.id) });
    if (!attempt) throw new NotFoundError("Assessment attempt not found");

    const application = await db.query.applications.findFirst({ where: eq(applications.id, attempt.applicationId) });
    if (!application) throw new NotFoundError("Application not found");

    const isOwner = application.userId === req.user!.sub;
    const isPrivileged = !isOwner && (await canStaffAccessApplication(db, req.user!, application, "view"));
    if (requireOwner && !isOwner) throw new ForbiddenError();
    if (!requireOwner && !isOwner && !isPrivileged) throw new ForbiddenError();

    return { attempt, application, isOwner, isPrivileged };
  }

  /**
   * Everything the exam page needs for one application: the exams the
   * candidate can pick from (one per language), attempts used and left on
   * each, and every attempt so far with the newest first. Registered
   * before "/:id" so "by-application" isn't captured as an id.
   */
  router.get("/by-application/:applicationId", requireAuth(env), async (req, res) => {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");

    if (application.userId !== req.user!.sub && !(await canStaffAccessApplication(db, req.user!, application, "view"))) {
      throw new ForbiddenError();
    }

    let attempts = await db.query.assessmentAttempts.findMany({
      where: eq(assessmentAttempts.applicationId, application.id),
      orderBy: [desc(assessmentAttempts.createdAt)],
    });
    // Finalize a timed-out attempt before reporting on it.
    const stale = attempts.find((a) => a.status === "in_progress");
    if (stale) {
      const resolved = await resolveExpiryIfNeeded(db, stale);
      if (resolved.status !== stale.status) {
        attempts = attempts.map((a) => (a.id === stale.id ? resolved : a));
      }
    }
    const current = await db.query.applications.findFirst({ where: eq(applications.id, application.id) });

    const exams = await examsForOpportunity(db, application.opportunityId);
    const used = await attemptsUsedByExam(db, application.id);
    // Exams that were attempted but later switched off still need a name.
    const knownIds = new Set(exams.map((e) => e.id));
    const extraIds = [...new Set(attempts.map((a) => a.assessmentId))].filter((id) => !knownIds.has(id));
    const extra = extraIds.length
      ? await db.query.assessments.findMany({ where: inArray(assessments.id, extraIds), columns: { id: true, title: true, language: true } })
      : [];
    const names = new Map([...exams, ...extra].map((e) => [e.id, { title: e.title, language: e.language }]));

    res.json({
      applicationStatus: current?.status ?? application.status,
      exams: exams.map((e) => ({ ...e, window: examWindow(e), attemptsUsed: used.get(e.id) ?? 0, attemptsLeft: Math.max(0, e.maxAttempts - (used.get(e.id) ?? 0)) })),
      attempts: attempts.map((a) => ({ ...a, examTitle: names.get(a.assessmentId)?.title ?? "Exam", language: names.get(a.assessmentId)?.language ?? null })),
      // Kept for older clients that expect a single attempt.
      attempt: attempts[0] ?? null,
    });
  });

  /**
   * The candidate picks which exam (language) to sit. Creates a fresh
   * attempt when they have attempts left, or hands back the one they
   * already opened and haven't finished.
   */
  router.post("/by-application/:applicationId/choose", requireAuth(env), async (req, res) => {
    const { assessmentId } = z.object({ assessmentId: z.string().uuid() }).parse(req.body);
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");
    if (application.userId !== req.user!.sub) throw new ForbiddenError();
    if ((application.status as ApplicationStatus) !== "assessment_invited") {
      throw new AppError("NOT_INVITED", "This application isn't waiting on an exam", 400);
    }

    const exams = await examsForOpportunity(db, application.opportunityId);
    const exam = exams.find((e) => e.id === assessmentId);
    if (!exam) throw new NotFoundError("Exam not found for this opening");
    assertExamOpen(exam);

    const open = await db.query.assessmentAttempts.findFirst({
      where: and(eq(assessmentAttempts.applicationId, application.id), inArray(assessmentAttempts.status, ["not_started", "in_progress"])),
    });
    if (open) {
      const resolved = await resolveExpiryIfNeeded(db, open);
      if (resolved.status === "in_progress") {
        throw new AppError("ATTEMPT_IN_PROGRESS", "Finish the exam you've already started first", 409);
      }
      if (resolved.status === "not_started") {
        if (resolved.assessmentId === exam.id) {
          res.json({ attempt: resolved });
          return;
        }
        // Switching language before starting: drop the unused attempt so it doesn't count.
        await db.delete(assessmentAttempts).where(and(eq(assessmentAttempts.id, resolved.id), eq(assessmentAttempts.status, "not_started")));
      }
    }

    const used = (await attemptsUsedByExam(db, application.id)).get(exam.id) ?? 0;
    if (used >= exam.maxAttempts) {
      throw new AppError("NO_ATTEMPTS_LEFT", `You've used all ${exam.maxAttempts} attempt${exam.maxAttempts === 1 ? "" : "s"} for this exam`, 409);
    }

    const [attempt] = await db
      .insert(assessmentAttempts)
      .values({ applicationId: application.id, assessmentId: exam.id, attemptNumber: used + 1 })
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "assessment_attempt.choose", entityType: "assessment_attempt", entityId: attempt.id, metadata: { assessmentId: exam.id, attemptNumber: used + 1 }, ipAddress: req.ip });
    res.status(201).json({ attempt });
  });

  router.post("/:id/start", requireAuth(env), async (req, res) => {
    const { attempt } = await getOwnedAttempt(req, true);

    if (attempt.status !== "not_started") {
      throw new AppError("INVALID_ATTEMPT_STATE", `Cannot start an attempt in status "${attempt.status}"`, 400);
    }

    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, attempt.assessmentId) });
    if (!assessment) throw new NotFoundError("Assessment not found");

    assertExamOpen(assessment);

    // An attempt started close to the window's end still has to finish by then.
    let expiresAt = new Date(Date.now() + assessment.durationMinutes * 60 * 1000);
    if (assessment.closesAt && assessment.closesAt < expiresAt) expiresAt = assessment.closesAt;
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

    await resolveAfterAttempt(db, { applicationId: application.id, assessmentId: attempt.assessmentId, scorePercent: result.scorePercent, passed: result.passed, actorUserId: req.user!.sub });

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
