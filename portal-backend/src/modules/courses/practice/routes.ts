import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../../shared/db/client.js";
import { courseEnrollments, courseLessons, courseModules, courses, lessonCodeQuestions, lessonCodeSubmissions, lessonProgress, notificationPreferences, users } from "../../shared/db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import { enqueueJob } from "../../shared/jobs.js";
import type { Env } from "../../shared/env.js";
import { notify } from "../../notifications/service.js";
import { displayNameFor } from "../../employees/onboarding.js";
import { gradeExercise, MAX_CODE_LENGTH } from "../../internships/exercises/grade.js";
import { runnerFromEnv } from "../../internships/exercises/runner.js";
import { publicExercise } from "../../internships/exercises/public.js";
import type { CheckReport } from "../../internships/exercises/types.js";
import { ensureProgressRows, maybeAutoCompleteEnrollment, resolveEnrollmentPaymentStatus } from "../routes.js";
import { PRACTICE_COURSES } from "./catalog/index.js";
import { ensureQuestionsSynced, installedPracticeCourses, installPracticeCourses, questionCount, quizCount } from "./install.js";
import { failureEmail } from "./email.js";
import { FILE_TYPES, fileTypeAllowed } from "./files.js";

const STAFF_ROLES = ["hr", "admin", "super_admin"] as const;
const INSTALL_ROLES = ["admin", "super_admin"] as const;
const isStaff = (role?: string) => !!role && (STAFF_ROLES as readonly string[]).includes(role);
/** One failure email per question per learner in this window; later failures are still shown in the portal. */
const EMAIL_EVERY_MS = 10 * 60 * 1000;

// Each check or upload may compile and run code several times.
const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as Request & { user?: { sub: string } }).user?.sub ?? req.ip ?? "unknown",
  message: { error: { code: "RATE_LIMITED", message: "You're checking too often; wait a minute and try again" } },
});

const uploadSchema = z.object({
  code: z.string().max(MAX_CODE_LENGTH, "That file is too big for one answer (20,000 characters at most)").refine((c) => c.trim().length > 0, "The file is empty"),
  fileName: z.string().trim().max(200).nullable().optional(),
});
const installSchema = z.object({ keys: z.array(z.string().max(50)).max(100).optional() });

type Question = typeof lessonCodeQuestions.$inferSelect;
type Status = "passed" | "failed" | "pending";

/** passed: all checks ran and passed. pending: couldn't run, but nothing wrong was found. failed: anything else. */
export function statusFor(report: CheckReport): Status {
  if (report.passed) return "passed";
  const blocking = (report.review ?? []).some((f) => f.severity === "error");
  if (report.runnerUnavailable && !blocking && report.items.every((i) => i.passed)) return "pending";
  return "failed";
}

export function practiceRouter(db: Database, env: Env) {
  const router = Router();
  const runner = runnerFromEnv(env);

  // ---- Catalog (staff) ----

  router.get("/practice/catalog", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    const installed = await installedPracticeCourses(db);
    res.json({
      courses: PRACTICE_COURSES.map((c) => ({
        key: c.key,
        title: c.title,
        category: c.category,
        tagline: c.tagline,
        units: c.units.length,
        questions: questionCount(c),
        quizQuestions: quizCount(c),
        courseId: installed.get(c.key)?.id ?? null,
      })),
      canInstall: (INSTALL_ROLES as readonly string[]).includes(req.user!.role),
      codeRunner: runner?.name ?? null,
    });
  });

  /** Installs the practice courses (or adds new units and questions to installed ones). Safe to run again. */
  router.post("/practice/install", requireAuth(env), requireRole(...INSTALL_ROLES), async (req, res) => {
    const { keys } = installSchema.parse(req.body ?? {});
    const result = await installPracticeCourses(db, req.user!.sub, keys);
    res.status(result.created.length ? 201 : 200).json(result);
  });

  // ---- Assignment sheets ----

  const assignmentLesson = async (lessonId: string) => {
    const lesson = await db.query.courseLessons.findFirst({ where: eq(courseLessons.id, lessonId) });
    if (!lesson || lesson.contentType !== "assignment") throw new NotFoundError("Assignment not found");
    const mod = await db.query.courseModules.findFirst({ where: eq(courseModules.id, lesson.moduleId) });
    if (!mod) throw new NotFoundError("Assignment not found");
    const course = (await db.query.courses.findFirst({ where: eq(courses.id, mod.courseId) }))!;
    return { lesson, course };
  };

  const activeEnrollment = async (userId: string, courseId: string) => {
    const enrollment = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)) });
    if (!enrollment) throw new ForbiddenError("Enroll in the course first");
    const resolved = await resolveEnrollmentPaymentStatus(db, enrollment);
    if (resolved.paymentStatus === "overdue") throw new AppError("PAYMENT_OVERDUE", "Course access is paused until payment is resolved. Contact an admin.", 402);
    return resolved;
  };

  const questionsOf = (lessonId: string) => db.query.lessonCodeQuestions.findMany({ where: eq(lessonCodeQuestions.lessonId, lessonId), orderBy: [asc(lessonCodeQuestions.orderIndex)] });

  /** The newest submission per question for one enrollment. */
  async function latestByQuestion(questionIds: string[], enrollmentId: string) {
    if (!questionIds.length) return new Map<string, typeof lessonCodeSubmissions.$inferSelect & { attempts: number }>();
    const rows = await db.execute<{ id: string; attempts: number }>(sql`
      SELECT DISTINCT ON (question_id) id, count(*) OVER (PARTITION BY question_id)::int AS attempts
      FROM lesson_code_submissions
      WHERE enrollment_id = ${enrollmentId} AND question_id IN (${sql.join(questionIds.map((id) => sql`${id}`), sql`, `)})
      ORDER BY question_id, submitted_at DESC
    `);
    if (!rows.rows.length) return new Map();
    const attempts = new Map(rows.rows.map((r) => [r.id, r.attempts]));
    const subs = await db.query.lessonCodeSubmissions.findMany({ where: inArray(lessonCodeSubmissions.id, rows.rows.map((r) => r.id)) });
    return new Map(subs.map((s) => [s.questionId, { ...s, attempts: attempts.get(s.id) ?? 1 }]));
  }

  const publicQuestion = (q: Question) => ({
    id: q.id,
    key: q.key,
    title: q.title,
    brief: q.brief,
    steps: q.steps,
    level: q.level,
    fileTypes: FILE_TYPES[q.spec.editor] ?? [".txt"],
    ...publicExercise(q.spec, !!runner)!,
  });

  /**
   * The assignment sheet: every question with the caller's latest upload
   * and its review. Staff see the questions without submissions.
   */
  router.get("/lessons/:lessonId/assignment", requireAuth(env), async (req, res) => {
    await ensureQuestionsSynced(db);
    const { lesson, course } = await assignmentLesson(req.params.lessonId);
    const questions = await questionsOf(lesson.id);
    if (isStaff(req.user!.role)) {
      const enrollment = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, course.id), eq(courseEnrollments.userId, req.user!.sub)) });
      if (!enrollment) {
        res.json({ lesson: { id: lesson.id, title: lesson.title }, course: { id: course.id, title: course.title }, questions: questions.map((q) => ({ ...publicQuestion(q), submission: null })), codeRunner: runner?.name ?? null, preview: true });
        return;
      }
    }
    const enrollment = await activeEnrollment(req.user!.sub, course.id);
    const latest = await latestByQuestion(questions.map((q) => q.id), enrollment.id);
    res.json({
      lesson: { id: lesson.id, title: lesson.title },
      course: { id: course.id, title: course.title },
      codeRunner: runner?.name ?? null,
      preview: false,
      questions: questions.map((q) => {
        const s = latest.get(q.id);
        return { ...publicQuestion(q), submission: s ? { id: s.id, status: s.status, fileName: s.fileName, code: s.code, report: s.report, submittedAt: s.submittedAt, attempts: s.attempts } : null };
      }),
    });
  });

  const questionFor = async (req: Request) => {
    const { lesson, course } = await assignmentLesson(req.params.lessonId);
    const question = await db.query.lessonCodeQuestions.findFirst({ where: and(eq(lessonCodeQuestions.id, req.params.questionId), eq(lessonCodeQuestions.lessonId, lesson.id)) });
    if (!question) throw new NotFoundError("Question not found");
    return { lesson, course, question };
  };

  const parseUpload = (req: Request, question: Question) => {
    const body = uploadSchema.parse(req.body);
    if (body.fileName && !fileTypeAllowed(body.fileName, question.spec.editor)) {
      throw new AppError("WRONG_FILE_TYPE", `Upload a ${(FILE_TYPES[question.spec.editor] ?? [".txt"]).filter((t) => t !== ".txt").join(" or ")} file for this question`, 400);
    }
    return body;
  };

  /** Reviews the code and runs the visible examples only. Nothing is saved: a quick check before uploading. */
  router.post("/lessons/:lessonId/assignment/:questionId/check", requireAuth(env), checkLimiter, async (req, res) => {
    const { course, question } = await questionFor(req);
    const { code } = parseUpload(req, question);
    if (!isStaff(req.user!.role)) await activeEnrollment(req.user!.sub, course.id);
    res.json({ report: await gradeExercise(question.spec, code, runner, { includeHidden: false, review: true }) });
  });

  /**
   * Uploads an answer: reviewed line by line and run against every test,
   * hidden ones included. A failed upload emails the review to the learner.
   * The assignment lesson completes once every question has passed.
   */
  router.post("/lessons/:lessonId/assignment/:questionId/submit", requireAuth(env), checkLimiter, async (req, res) => {
    const { lesson, course, question } = await questionFor(req);
    const { code, fileName } = parseUpload(req, question);
    const enrollment = await activeEnrollment(req.user!.sub, course.id);

    const report = await gradeExercise(question.spec, code, runner, { includeHidden: true, review: true });
    const status = statusFor(report);
    const [submission] = await db.insert(lessonCodeSubmissions).values({ questionId: question.id, enrollmentId: enrollment.id, userId: req.user!.sub, fileName: fileName || null, code, report, status }).returning();

    // Lesson progress: complete when every question's latest upload passed (or awaits a run).
    const questions = await questionsOf(lesson.id);
    const latest = await latestByQuestion(questions.map((q) => q.id), enrollment.id);
    const done = questions.filter((q) => ["passed", "pending"].includes(latest.get(q.id)?.status ?? "")).length;
    await ensureProgressRows(db, enrollment.id, course.id);
    const progress = await db.query.lessonProgress.findFirst({ where: and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lesson.id)) });
    const lessonCompleted = done === questions.length || progress?.status === "completed";
    await db
      .update(lessonProgress)
      .set(lessonCompleted ? { status: "completed", completedAt: progress?.completedAt ?? new Date() } : { status: "in_progress" })
      .where(and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lesson.id)));
    const wasCompleted = enrollment.status === "completed";
    if (lessonCompleted) await maybeAutoCompleteEnrollment(db, enrollment.id, course.id, env.PORTAL_APP_URL);
    const after = await db.query.courseEnrollments.findFirst({ where: eq(courseEnrollments.id, enrollment.id) });

    let emailed = false;
    if (status === "failed") emailed = await emailFailure({ userId: req.user!.sub, enrollmentId: enrollment.id, submissionId: submission.id, question, lessonTitle: lesson.title, courseTitle: course.title, courseId: course.id, lessonId: lesson.id, fileName: fileName || null, report });

    res.status(201).json({
      submission: { id: submission.id, status, fileName: submission.fileName, submittedAt: submission.submittedAt, attempts: latest.get(question.id)?.attempts ?? 1 },
      report,
      emailed,
      assignment: { done, total: questions.length, completed: lessonCompleted },
      courseCompleted: after?.status === "completed" && !wasCompleted,
    });
  });

  async function emailFailure(p: { userId: string; enrollmentId: string; submissionId: string; question: Question; lessonTitle: string; courseTitle: string; courseId: string; lessonId: string; fileName: string | null; report: CheckReport }) {
    const link = `/learn/${p.courseId}/${p.lessonId}?q=${p.question.id}`;
    await notify(db, { userIds: [p.userId], kind: "assignment.failed", title: `Fix needed: ${p.question.title}`, body: p.report.summary, link, dedupeKey: `assignment.failed:${p.submissionId}` });
    const recent = await db.query.lessonCodeSubmissions.findFirst({
      where: and(eq(lessonCodeSubmissions.questionId, p.question.id), eq(lessonCodeSubmissions.enrollmentId, p.enrollmentId), isNotNull(lessonCodeSubmissions.emailedAt), gt(lessonCodeSubmissions.emailedAt, new Date(Date.now() - EMAIL_EVERY_MS))),
      orderBy: [desc(lessonCodeSubmissions.emailedAt)],
    });
    if (recent) return false;
    const pref = await db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, p.userId) });
    if (pref && pref.emailEnabled === false) return false;
    const user = await db.query.users.findFirst({ where: eq(users.id, p.userId), columns: { email: true } });
    if (!user) return false;
    const mail = failureEmail({ name: await displayNameFor(db, p.userId), courseTitle: p.courseTitle, lessonTitle: p.lessonTitle, questionTitle: p.question.title, fileName: p.fileName, report: p.report, link: `${env.PORTAL_APP_URL.replace(/\/$/, "")}${link}` });
    await enqueueJob(db, "email.send", { to: user.email, subject: mail.subject, text: mail.text });
    await db.update(lessonCodeSubmissions).set({ emailedAt: new Date() }).where(eq(lessonCodeSubmissions.id, p.submissionId));
    return true;
  }

  /** The caller's past uploads for one question, newest first (with code, to compare versions). */
  router.get("/lessons/:lessonId/assignment/:questionId/history", requireAuth(env), async (req, res) => {
    const { course, question } = await questionFor(req);
    const enrollment = await activeEnrollment(req.user!.sub, course.id);
    const rows = await db.query.lessonCodeSubmissions.findMany({ where: and(eq(lessonCodeSubmissions.questionId, question.id), eq(lessonCodeSubmissions.enrollmentId, enrollment.id)), orderBy: [desc(lessonCodeSubmissions.submittedAt)], limit: 20 });
    res.json({ submissions: rows.map((s) => ({ id: s.id, status: s.status, fileName: s.fileName, code: s.code, summary: s.report.summary, submittedAt: s.submittedAt })) });
  });

  /** Staff: every learner's latest status per question of an assignment. */
  router.get("/lessons/:lessonId/assignment-results", requireAuth(env), requireRole(...STAFF_ROLES), async (req, res) => {
    const { lesson, course } = await assignmentLesson(req.params.lessonId);
    const questions = await questionsOf(lesson.id);
    const rows = questions.length
      ? (
          await db.execute<{ enrollmentId: string; userId: string; email: string; name: string; questionId: string; status: Status; attempts: number; submittedAt: string }>(sql`
            SELECT DISTINCT ON (s.enrollment_id, s.question_id) s.enrollment_id AS "enrollmentId", s.user_id AS "userId", u.email,
                   coalesce(u.full_name, cp.full_name, u.email) AS name, s.question_id AS "questionId", s.status,
                   count(*) OVER (PARTITION BY s.enrollment_id, s.question_id)::int AS attempts, s.submitted_at AS "submittedAt"
            FROM lesson_code_submissions s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
            WHERE s.question_id IN (${sql.join(questions.map((q) => sql`${q.id}`), sql`, `)})
            ORDER BY s.enrollment_id, s.question_id, s.submitted_at DESC
          `)
        ).rows
      : [];
    const learners = new Map<string, { userId: string; name: string; email: string; results: Record<string, { status: Status; attempts: number; submittedAt: string }> }>();
    for (const r of rows) {
      const l = learners.get(r.enrollmentId) ?? { userId: r.userId, name: r.name, email: r.email, results: {} };
      l.results[r.questionId] = { status: r.status, attempts: r.attempts, submittedAt: r.submittedAt };
      learners.set(r.enrollmentId, l);
    }
    res.json({ lesson: { id: lesson.id, title: lesson.title }, course: { id: course.id, title: course.title }, questions: questions.map((q) => ({ id: q.id, title: q.title })), learners: [...learners.values()] });
  });

  return router;
}
