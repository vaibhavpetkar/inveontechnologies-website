import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { certificateTemplates, courseEnrollments, courseLessons, courseModules, courses, lessonProgress, lessonQuizAttempts, lessonQuizQuestions } from "../shared/db/schema.js";
import { optionalAuth, requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { scoreAttempt } from "../assessments/scoring.js";
import type { Env } from "../shared/env.js";
import { ensureProgressRows, maybeAutoCompleteEnrollment, resolveEnrollmentPaymentStatus } from "./routes.js";
import { onLessonPassed } from "../internships/service.js";

const AUTHOR_ROLES = ["hr", "admin", "super_admin"] as const;
const isAuthor = (role?: string) => !!role && (AUTHOR_ROLES as readonly string[]).includes(role);

const updateCourseSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(20000).optional(),
  category: z.string().trim().max(100).nullable().optional(),
  priceAmount: z.number().min(0).nullable().optional(),
  certificateTemplateId: z.string().uuid().nullable().optional(),
});

const updateModuleSchema = z.object({ title: z.string().min(2).max(200) });

const lessonFields = {
  title: z.string().min(2).max(200),
  contentType: z.enum(["video", "document", "assignment", "test"]),
  contentUrl: z.string().trim().max(2000).nullable().optional(),
  contentText: z.string().max(20000).nullable().optional(),
  required: z.boolean(),
  durationMinutes: z.number().int().min(1).max(1000).nullable().optional(),
  passingScorePercent: z.number().int().min(1).max(100),
  timeLimitMinutes: z.number().int().min(1).max(600).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(50).nullable().optional(),
};
const updateLessonSchema = z.object(lessonFields).partial();

const reorderSchema = z.object({
  modules: z.array(z.object({ id: z.string().uuid(), lessonIds: z.array(z.string().uuid()) })).max(200),
});

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        questionText: z.string().trim().min(3).max(2000),
        options: z.array(z.object({ id: z.string().min(1).max(20), text: z.string().trim().min(1).max(500) })).min(2).max(8),
        correctOptionId: z.string().min(1).max(20),
        explanation: z.string().trim().max(2000).nullable().optional(),
        points: z.number().int().min(1).max(100).default(1),
      }),
    )
    .max(100),
});

const answersSchema = z.array(z.object({ questionId: z.string().uuid(), selectedOptionId: z.string().max(20).nullable() })).max(100);
const submitSchema = z.object({ answers: answersSchema, attemptId: z.string().uuid().optional() });
const saveAnswersSchema = z.object({ answers: answersSchema });

// A timed exam still accepts a submit this long after its deadline, to
// cover network lag on the automatic submit.
const SUBMIT_GRACE_MS = 30_000;

type Lesson = typeof courseLessons.$inferSelect;
type Enrollment = typeof courseEnrollments.$inferSelect;
type Attempt = typeof lessonQuizAttempts.$inferSelect;
type DraftAnswer = { questionId: string; selectedOptionId: string | null };

/**
 * LMS phase D: course authoring (edit, delete, reorder, quizzes), the
 * learner's "my learning" list, the lesson player's quiz, and auto-grading.
 * Mounted before coursesRouter so /courses/mine isn't read as a course id.
 */
export function lmsRouter(db: Database, env: Env) {
  const router = Router();

  const lessonWithCourse = async (lessonId: string) => {
    const lesson = await db.query.courseLessons.findFirst({ where: eq(courseLessons.id, lessonId) });
    if (!lesson) throw new NotFoundError("Lesson not found");
    const mod = await db.query.courseModules.findFirst({ where: eq(courseModules.id, lesson.moduleId) });
    if (!mod) throw new NotFoundError("Course module not found");
    return { lesson, courseId: mod.courseId };
  };

  /** The caller's usable enrollment for a course, or a clear error. */
  const activeEnrollment = async (userId: string, courseId: string) => {
    const enrollment = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)) });
    if (!enrollment) throw new ForbiddenError("Enroll in the course first");
    const resolved = await resolveEnrollmentPaymentStatus(db, enrollment);
    if (resolved.paymentStatus === "overdue") throw new AppError("PAYMENT_OVERDUE", "Course access is paused until payment is resolved. Contact an admin.", 402);
    return resolved;
  };

  // ---- Catalog extras ----

  /** Published catalog with lesson counts and, when signed in, the caller's progress. */
  router.get("/catalog", optionalAuth(env), async (req, res) => {
    const author = isAuthor(req.user?.role);
    const result = await db.execute<Record<string, unknown>>(sql`
      SELECT c.id, c.title, c.description, c.status, c.category, c.price_amount AS "priceAmount",
             c.certificate_template_id IS NOT NULL AS "hasCertificate", c.published_at AS "publishedAt",
             count(DISTINCT l.id)::int AS "lessonCount",
             coalesce(sum(l.duration_minutes), 0)::int AS "totalMinutes",
             (SELECT count(*)::int FROM course_enrollments ce WHERE ce.course_id = c.id) AS "learnerCount"
      FROM courses c
      LEFT JOIN course_modules m ON m.course_id = c.id
      LEFT JOIN course_lessons l ON l.module_id = m.id
      WHERE ${author ? sql`c.status <> 'archived'` : sql`c.status = 'published'`}
      GROUP BY c.id
      ORDER BY c.published_at DESC NULLS FIRST, c.created_at DESC
    `);
    let mine: Record<string, { status: string; done: number; total: number }> = {};
    if (req.user) {
      const progress = await db.execute<{ courseId: string; status: string; done: number; total: number }>(sql`
        SELECT e.course_id AS "courseId", e.status,
               count(p.id) FILTER (WHERE p.status = 'completed')::int AS done, count(p.id)::int AS total
        FROM course_enrollments e LEFT JOIN lesson_progress p ON p.enrollment_id = e.id
        WHERE e.user_id = ${req.user.sub}
        GROUP BY e.id
      `);
      mine = Object.fromEntries(progress.rows.map((r) => [r.courseId, { status: r.status, done: r.done, total: r.total }]));
    }
    res.json({ courses: result.rows.map((c) => ({ ...c, enrollment: mine[c.id as string] ?? null })) });
  });

  // ---- Authoring ----

  router.put("/:id", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const body = updateCourseSchema.parse(req.body);
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course) throw new NotFoundError("Course not found");
    if (body.certificateTemplateId && !(await db.query.certificateTemplates.findFirst({ where: eq(certificateTemplates.id, body.certificateTemplateId) }))) {
      throw new AppError("INVALID_TEMPLATE", "Certificate template not found", 400);
    }
    const { priceAmount, ...rest } = body;
    const [updated] = await db
      .update(courses)
      .set({ ...rest, ...(priceAmount !== undefined ? { priceAmount: priceAmount === null ? null : priceAmount.toString() } : {}), updatedAt: new Date() })
      .where(eq(courses.id, course.id))
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course.update", entityType: "course", entityId: course.id, metadata: { fields: Object.keys(body) }, ipAddress: req.ip });
    res.json({ course: updated });
  });

  router.put("/modules/:moduleId", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const body = updateModuleSchema.parse(req.body);
    const [updated] = await db.update(courseModules).set(body).where(eq(courseModules.id, req.params.moduleId)).returning();
    if (!updated) throw new NotFoundError("Module not found");
    res.json({ module: updated });
  });

  router.delete("/modules/:moduleId", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const [deleted] = await db.delete(courseModules).where(eq(courseModules.id, req.params.moduleId)).returning();
    if (!deleted) throw new NotFoundError("Module not found");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course_module.delete", entityType: "course_module", entityId: deleted.id, ipAddress: req.ip });
    res.json({ message: "Module deleted." });
  });

  router.put("/lessons/:lessonId", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const body = updateLessonSchema.parse(req.body);
    const [updated] = await db.update(courseLessons).set(body).where(eq(courseLessons.id, req.params.lessonId)).returning();
    if (!updated) throw new NotFoundError("Lesson not found");
    res.json({ lesson: updated });
  });

  router.delete("/lessons/:lessonId", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const [deleted] = await db.delete(courseLessons).where(eq(courseLessons.id, req.params.lessonId)).returning();
    if (!deleted) throw new NotFoundError("Lesson not found");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course_lesson.delete", entityType: "course_lesson", entityId: deleted.id, ipAddress: req.ip });
    res.json({ message: "Lesson deleted." });
  });

  /** Sets module order and which module each lesson sits in, in one go (drag-and-drop or arrows in the builder). */
  router.put("/:id/outline", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const body = reorderSchema.parse(req.body);
    const modules = await db.query.courseModules.findMany({ where: eq(courseModules.courseId, req.params.id) });
    const moduleIds = new Set(modules.map((m) => m.id));
    if (body.modules.some((m) => !moduleIds.has(m.id))) throw new AppError("INVALID_OUTLINE", "A module in the outline doesn't belong to this course", 400);
    const lessons = modules.length ? await db.query.courseLessons.findMany({ where: inArray(courseLessons.moduleId, [...moduleIds]) }) : [];
    const lessonIds = new Set(lessons.map((l) => l.id));
    if (body.modules.some((m) => m.lessonIds.some((id) => !lessonIds.has(id)))) throw new AppError("INVALID_OUTLINE", "A lesson in the outline doesn't belong to this course", 400);

    await db.transaction(async (tx) => {
      for (const [mi, m] of body.modules.entries()) {
        await tx.update(courseModules).set({ orderIndex: mi }).where(eq(courseModules.id, m.id));
        for (const [li, lessonId] of m.lessonIds.entries()) {
          await tx.update(courseLessons).set({ moduleId: m.id, orderIndex: li }).where(eq(courseLessons.id, lessonId));
        }
      }
    });
    res.json({ message: "Outline saved." });
  });

  // ---- Quizzes ----

  /**
   * Authors get the answer key. Enrolled learners get the questions, their
   * past attempts, how many tries remain and, for a timed exam, the attempt
   * in progress with its saved answers so a reload picks up where it was.
   */
  router.get("/lessons/:lessonId/quiz", requireAuth(env), async (req, res) => {
    const { lesson, courseId } = await lessonWithCourse(req.params.lessonId);
    const questions = await db.query.lessonQuizQuestions.findMany({ where: eq(lessonQuizQuestions.lessonId, lesson.id), orderBy: [asc(lessonQuizQuestions.orderIndex)] });
    if (isAuthor(req.user!.role)) {
      res.json({ lesson, questions });
      return;
    }
    const enrollment = await activeEnrollment(req.user!.sub, courseId);
    await finalizeExpired(lesson, courseId, enrollment);
    const attempts = await db.query.lessonQuizAttempts.findMany({ where: and(eq(lessonQuizAttempts.lessonId, lesson.id), eq(lessonQuizAttempts.enrollmentId, enrollment.id)), orderBy: [desc(lessonQuizAttempts.startedAt)] });
    const submitted = attempts.filter((a) => a.status === "submitted");
    const live = attempts.find((a) => a.status === "in_progress");
    res.json({
      lesson,
      questions: questions.map(({ correctOptionId, explanation, ...q }) => q),
      attempts: submitted.slice(0, 10).map(({ answers, ...a }) => a),
      attemptsUsed: submitted.length,
      attemptsLeft: lesson.maxAttempts ? Math.max(0, lesson.maxAttempts - submitted.length) : null,
      inProgress: live ? { id: live.id, startedAt: live.startedAt, deadlineAt: live.deadlineAt, answers: live.answers as DraftAnswer[] } : null,
      serverTime: new Date(),
    });
  });

  /** Replaces a quiz lesson's questions (the builder saves the whole quiz). */
  router.put("/lessons/:lessonId/quiz", requireAuth(env), requireRole(...AUTHOR_ROLES), async (req, res) => {
    const body = quizSchema.parse(req.body);
    const { lesson } = await lessonWithCourse(req.params.lessonId);
    if (lesson.contentType !== "test") throw new AppError("NOT_A_QUIZ", "Only quiz (test) lessons have questions", 400);
    for (const [i, q] of body.questions.entries()) {
      if (!q.options.some((o) => o.id === q.correctOptionId)) throw new AppError("INVALID_QUESTION", `Question ${i + 1}: the correct answer must be one of its options`, 400);
      if (new Set(q.options.map((o) => o.id)).size !== q.options.length) throw new AppError("INVALID_QUESTION", `Question ${i + 1}: option ids must be unique`, 400);
    }
    const questions = await db.transaction(async (tx) => {
      await tx.delete(lessonQuizQuestions).where(eq(lessonQuizQuestions.lessonId, lesson.id));
      if (body.questions.length === 0) return [];
      return tx
        .insert(lessonQuizQuestions)
        .values(body.questions.map((q, i) => ({ lessonId: lesson.id, questionText: q.questionText, options: q.options, correctOptionId: q.correctOptionId, explanation: q.explanation ?? null, points: q.points, orderIndex: i })))
        .returning();
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "lesson_quiz.update", entityType: "course_lesson", entityId: lesson.id, metadata: { questions: questions.length }, ipAddress: req.ip });
    res.json({ questions });
  });

  /**
   * Grades an attempt and records it: a timed attempt already has a row
   * (in progress), an untimed one gets a new row. The lesson is passed once
   * any attempt reaches its passing score, and a later lower score never
   * un-passes it.
   */
  async function grade(lesson: Lesson, courseId: string, enrollment: Enrollment, answers: DraftAnswer[], existingAttempt?: Attempt) {
    const questions = await db.query.lessonQuizQuestions.findMany({ where: eq(lessonQuizQuestions.lessonId, lesson.id), orderBy: [asc(lessonQuizQuestions.orderIndex)] });
    if (questions.length === 0) throw new AppError("QUIZ_EMPTY", "This quiz has no questions yet", 400);
    const result = scoreAttempt(questions, answers, lesson.passingScorePercent);
    const values = {
      answers: result.answers.map((a) => ({ questionId: a.questionId, selectedOptionId: a.selectedOptionId, correct: a.isCorrect })),
      scorePercent: result.scorePercent,
      passed: result.passed,
      status: "submitted" as const,
      submittedAt: new Date(),
    };
    const [attempt] = existingAttempt
      ? await db.update(lessonQuizAttempts).set(values).where(eq(lessonQuizAttempts.id, existingAttempt.id)).returning()
      : await db.insert(lessonQuizAttempts).values({ lessonId: lesson.id, enrollmentId: enrollment.id, ...values }).returning();

    await ensureProgressRows(db, enrollment.id, courseId);
    const existing = await db.query.lessonProgress.findFirst({ where: and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lesson.id)) });
    const best = Math.max(existing?.bestScorePercent ?? 0, result.scorePercent);
    const nowPassed = result.passed || existing?.passed === true;
    await db
      .update(lessonProgress)
      .set({
        bestScorePercent: best,
        passed: nowPassed,
        status: nowPassed ? "completed" : "in_progress",
        completedAt: nowPassed ? existing?.completedAt ?? new Date() : null,
      })
      .where(and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lesson.id)));

    if (nowPassed) await maybeAutoCompleteEnrollment(db, enrollment.id, courseId, env.PORTAL_APP_URL);
    // A track's final exam: passing it earns the internship offer.
    const internship = result.passed ? await onLessonPassed(db, { lessonId: lesson.id, userId: enrollment.userId, scorePercent: result.scorePercent }) : null;
    const updatedEnrollment = await db.query.courseEnrollments.findFirst({ where: eq(courseEnrollments.id, enrollment.id) });

    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      attempt: { id: attempt.id, scorePercent: attempt.scorePercent, passed: attempt.passed, submittedAt: attempt.submittedAt, startedAt: attempt.startedAt },
      passingScorePercent: lesson.passingScorePercent,
      bestScorePercent: best,
      lessonPassed: nowPassed,
      courseCompleted: updatedEnrollment?.status === "completed",
      internship,
      // Feedback per question: shown after submitting, so learners learn from mistakes.
      review: result.answers.map((a) => ({ questionId: a.questionId, selectedOptionId: a.selectedOptionId, correct: a.isCorrect, correctOptionId: byId.get(a.questionId)!.correctOptionId, explanation: byId.get(a.questionId)!.explanation })),
    };
  }

  /** A timed attempt whose time ran out (plus grace) is graded on what was saved. */
  async function finalizeExpired(lesson: Lesson, courseId: string, enrollment: Enrollment) {
    const live = await db.query.lessonQuizAttempts.findFirst({ where: and(eq(lessonQuizAttempts.lessonId, lesson.id), eq(lessonQuizAttempts.enrollmentId, enrollment.id), eq(lessonQuizAttempts.status, "in_progress")) });
    if (live?.deadlineAt && live.deadlineAt.getTime() + SUBMIT_GRACE_MS < Date.now()) {
      await grade(lesson, courseId, enrollment, live.answers as DraftAnswer[], live);
    }
  }

  async function attemptsLeft(lesson: Lesson, enrollmentId: string) {
    if (!lesson.maxAttempts) return null;
    const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lesson_quiz_attempts WHERE lesson_id = ${lesson.id} AND enrollment_id = ${enrollmentId} AND status = 'submitted'`)).rows;
    return lesson.maxAttempts - n;
  }

  /** Starts (or resumes) a timed exam. The clock runs on the server. */
  router.post("/lessons/:lessonId/quiz/start", requireAuth(env), async (req, res) => {
    const { lesson, courseId } = await lessonWithCourse(req.params.lessonId);
    if (lesson.contentType !== "test") throw new AppError("NOT_A_QUIZ", "This lesson has no quiz", 400);
    if (!lesson.timeLimitMinutes) throw new AppError("NOT_TIMED", "This quiz isn't timed; submit your answers directly", 400);
    const enrollment = await activeEnrollment(req.user!.sub, courseId);
    await finalizeExpired(lesson, courseId, enrollment);

    const live = await db.query.lessonQuizAttempts.findFirst({ where: and(eq(lessonQuizAttempts.lessonId, lesson.id), eq(lessonQuizAttempts.enrollmentId, enrollment.id), eq(lessonQuizAttempts.status, "in_progress")) });
    if (live) {
      res.json({ attempt: { id: live.id, startedAt: live.startedAt, deadlineAt: live.deadlineAt, answers: live.answers }, resumed: true, serverTime: new Date() });
      return;
    }
    const left = await attemptsLeft(lesson, enrollment.id);
    if (left !== null && left <= 0) throw new AppError("NO_ATTEMPTS_LEFT", "You've used all your attempts for this exam", 400);
    const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lesson_quiz_questions WHERE lesson_id = ${lesson.id}`)).rows;
    if (n === 0) throw new AppError("QUIZ_EMPTY", "This quiz has no questions yet", 400);

    const now = new Date();
    const [attempt] = await db
      .insert(lessonQuizAttempts)
      .values({ lessonId: lesson.id, enrollmentId: enrollment.id, answers: [], status: "in_progress", startedAt: now, deadlineAt: new Date(now.getTime() + lesson.timeLimitMinutes * 60_000) })
      .returning();
    res.status(201).json({ attempt: { id: attempt.id, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, answers: [] }, resumed: false, serverTime: now });
  });

  /** Saves a timed exam's answers as the learner goes. */
  router.put("/quiz-attempts/:attemptId/answers", requireAuth(env), async (req, res) => {
    const { answers } = saveAnswersSchema.parse(req.body);
    const attempt = await db.query.lessonQuizAttempts.findFirst({ where: eq(lessonQuizAttempts.id, req.params.attemptId) });
    if (!attempt) throw new NotFoundError("Attempt not found");
    const enrollment = await db.query.courseEnrollments.findFirst({ where: eq(courseEnrollments.id, attempt.enrollmentId) });
    if (!enrollment || enrollment.userId !== req.user!.sub) throw new NotFoundError("Attempt not found");
    if (attempt.status !== "in_progress") throw new AppError("ATTEMPT_SUBMITTED", "This attempt has already been submitted", 400);
    if (attempt.deadlineAt && attempt.deadlineAt.getTime() + SUBMIT_GRACE_MS < Date.now()) throw new AppError("TIME_UP", "Time is up for this attempt", 400);
    await db.update(lessonQuizAttempts).set({ answers }).where(eq(lessonQuizAttempts.id, attempt.id));
    res.json({ savedAt: new Date() });
  });

  /**
   * Grades a quiz on the spot. A timed exam needs the attemptId from
   * /start; once its time is up, the answers saved on the server are what
   * count.
   */
  router.post("/lessons/:lessonId/quiz/submit", requireAuth(env), async (req, res) => {
    const body = submitSchema.parse(req.body);
    const { lesson, courseId } = await lessonWithCourse(req.params.lessonId);
    if (lesson.contentType !== "test") throw new AppError("NOT_A_QUIZ", "This lesson has no quiz", 400);
    const enrollment = await activeEnrollment(req.user!.sub, courseId);

    if (lesson.timeLimitMinutes) {
      if (!body.attemptId) throw new AppError("NOT_STARTED", "Start the exam first", 400);
      const attempt = await db.query.lessonQuizAttempts.findFirst({ where: and(eq(lessonQuizAttempts.id, body.attemptId), eq(lessonQuizAttempts.enrollmentId, enrollment.id), eq(lessonQuizAttempts.lessonId, lesson.id)) });
      if (!attempt) throw new NotFoundError("Attempt not found");
      if (attempt.status !== "in_progress") throw new AppError("ATTEMPT_SUBMITTED", "This attempt has already been submitted", 400);
      const late = !!attempt.deadlineAt && attempt.deadlineAt.getTime() + SUBMIT_GRACE_MS < Date.now();
      const result = await grade(lesson, courseId, enrollment, late ? (attempt.answers as DraftAnswer[]) : body.answers, attempt);
      res.status(201).json({ ...result, late, attemptsLeft: await attemptsLeft(lesson, enrollment.id) });
      return;
    }

    const left = await attemptsLeft(lesson, enrollment.id);
    if (left !== null && left <= 0) throw new AppError("NO_ATTEMPTS_LEFT", "You've used all your attempts for this quiz", 400);
    const result = await grade(lesson, courseId, enrollment, body.answers);
    res.status(201).json({ ...result, late: false, attemptsLeft: left === null ? null : left - 1 });
  });

  return router;
}
