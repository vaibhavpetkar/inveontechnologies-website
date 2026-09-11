import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  courses,
  courseModules,
  courseLessons,
  courseEnrollments,
  lessonProgress,
  coursePrerequisites,
} from "../shared/db/schema.js";
import { optionalAuth, requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;

const PAYMENT_GRACE_PERIOD_DAYS = 2;
const PAYMENT_GRACE_PERIOD_MS = PAYMENT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Lazy escalation — no cron in this stack (same documented pattern as
 * assessment-attempt and offer expiry elsewhere in this codebase). A
 * "pending" enrollment past its paymentDueAt is flipped to "overdue" the
 * next time anything touches it (progress check, lesson complete, the
 * admin pending-payments list, mark-paid). Once "overdue", course access
 * is blocked until an admin resolves it.
 */
async function resolveEnrollmentPaymentStatus(db: Database, enrollment: typeof courseEnrollments.$inferSelect) {
  if (enrollment.paymentStatus !== "pending" || !enrollment.paymentDueAt || enrollment.paymentDueAt > new Date()) {
    return enrollment;
  }
  const [updated] = await db.update(courseEnrollments).set({ paymentStatus: "overdue" }).where(eq(courseEnrollments.id, enrollment.id)).returning();
  return updated;
}

const createCourseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  prerequisiteCourseIds: z.array(z.string().uuid()).default([]),
  priceAmount: z.number().min(0).optional(), // omitted or 0 = free
});

const createModuleSchema = z.object({ title: z.string().min(2).max(200), orderIndex: z.number().int().default(0) });

const createLessonSchema = z.object({
  title: z.string().min(2).max(200),
  contentType: z.enum(["video", "document", "assignment", "test"]),
  contentUrl: z.string().max(2000).optional(),
  contentText: z.string().max(20000).optional(),
  required: z.boolean().default(true),
  orderIndex: z.number().int().default(0),
});

const gradeSchema = z.object({ userId: z.string().uuid(), passed: z.boolean() });

/**
 * Ensures a progress row exists for every lesson currently in the course,
 * for a given enrollment. Called at enroll time and defensively again on
 * progress reads, so lessons added to a course after someone enrolled
 * still show up instead of silently missing.
 */
async function ensureProgressRows(db: Database, enrollmentId: string, courseId: string) {
  const modules = await db.query.courseModules.findMany({ where: eq(courseModules.courseId, courseId) });
  const moduleIds = modules.map((m) => m.id);
  const lessons = moduleIds.length ? await db.query.courseLessons.findMany({ where: (l, { inArray }) => inArray(l.moduleId, moduleIds) }) : [];
  const existing = await db.query.lessonProgress.findMany({ where: eq(lessonProgress.enrollmentId, enrollmentId) });
  const existingLessonIds = new Set(existing.map((p) => p.lessonId));
  const missing = lessons.filter((l) => !existingLessonIds.has(l.id));
  if (missing.length > 0) {
    await db.insert(lessonProgress).values(missing.map((l) => ({ enrollmentId, lessonId: l.id })));
  }
  return db.query.lessonProgress.findMany({ where: eq(lessonProgress.enrollmentId, enrollmentId) });
}

/** After marking a lesson complete, checks if every REQUIRED lesson is now done (and passed, for tests) and auto-completes the enrollment if so. */
async function maybeAutoCompleteEnrollment(db: Database, enrollmentId: string, courseId: string) {
  const modules = await db.query.courseModules.findMany({ where: eq(courseModules.courseId, courseId) });
  const moduleIds = modules.map((m) => m.id);
  const lessons = moduleIds.length ? await db.query.courseLessons.findMany({ where: (l, { inArray }) => inArray(l.moduleId, moduleIds) }) : [];
  const requiredLessonIds = lessons.filter((l) => l.required).map((l) => l.id);
  if (requiredLessonIds.length === 0) return;

  const progressRows = await db.query.lessonProgress.findMany({ where: eq(lessonProgress.enrollmentId, enrollmentId) });
  const byLesson = new Map(progressRows.map((p) => [p.lessonId, p]));

  const allDone = requiredLessonIds.every((lessonId) => {
    const p = byLesson.get(lessonId);
    if (!p || p.status !== "completed") return false;
    const lesson = lessons.find((l) => l.id === lessonId);
    if (lesson?.contentType === "test") return p.passed === true;
    return true;
  });

  if (allDone) {
    await db
      .update(courseEnrollments)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(courseEnrollments.id, enrollmentId), eq(courseEnrollments.status, "enrolled")));
  }
}

export function coursesRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createCourseSchema.parse(req.body);
    const [course] = await db.insert(courses).values({ title: body.title, description: body.description, priceAmount: body.priceAmount?.toString(), createdBy: req.user!.sub }).returning();
    if (body.prerequisiteCourseIds.length > 0) {
      await db.insert(coursePrerequisites).values(body.prerequisiteCourseIds.map((prerequisiteCourseId) => ({ courseId: course.id, prerequisiteCourseId })));
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course.create", entityType: "course", entityId: course.id, ipAddress: req.ip });
    res.status(201).json({ course });
  });

  router.get("/", optionalAuth(env), async (req, res) => {
    const isPrivileged = req.user && PRIVILEGED_ROLES.includes(req.user.role as (typeof PRIVILEGED_ROLES)[number]);
    const rows = isPrivileged
      ? await db.query.courses.findMany()
      : await db.query.courses.findMany({ where: eq(courses.status, "published") });
    res.json({ courses: rows });
  });

  router.get("/:id", optionalAuth(env), async (req, res) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course) throw new NotFoundError("Course not found");
    const isPrivileged = req.user && PRIVILEGED_ROLES.includes(req.user.role as (typeof PRIVILEGED_ROLES)[number]);
    if (course.status !== "published" && !isPrivileged) throw new NotFoundError("Course not found");

    const modules = await db.query.courseModules.findMany({ where: eq(courseModules.courseId, course.id), orderBy: (m, { asc }) => [asc(m.orderIndex)] });
    const moduleIds = modules.map((m) => m.id);
    const lessons = moduleIds.length ? await db.query.courseLessons.findMany({ where: (l, { inArray }) => inArray(l.moduleId, moduleIds), orderBy: (l, { asc }) => [asc(l.orderIndex)] }) : [];
    const prerequisites = await db.query.coursePrerequisites.findMany({ where: eq(coursePrerequisites.courseId, course.id) });

    res.json({ course, modules, lessons, prerequisiteCourseIds: prerequisites.map((p) => p.prerequisiteCourseId) });
  });

  router.post("/:id/publish", requireAuth(env), requireRole("admin", "super_admin"), async (req, res) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course) throw new NotFoundError("Course not found");
    if (course.status !== "draft") throw new AppError("INVALID_TRANSITION", `Cannot publish a course in status "${course.status}"`, 400);

    const [updated] = await db.update(courses).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(courses.id, course.id)).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course.publish", entityType: "course", entityId: course.id, ipAddress: req.ip });
    res.json({ course: updated });
  });

  router.post("/:id/archive", requireAuth(env), requireRole("admin", "super_admin"), async (req, res) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course) throw new NotFoundError("Course not found");
    if (course.status === "archived") throw new AppError("INVALID_TRANSITION", "Course is already archived", 400);

    const [updated] = await db.update(courses).set({ status: "archived", updatedAt: new Date() }).where(eq(courses.id, course.id)).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course.archive", entityType: "course", entityId: course.id, ipAddress: req.ip });
    res.json({ course: updated });
  });

  router.post("/:id/modules", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createModuleSchema.parse(req.body);
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course) throw new NotFoundError("Course not found");

    const [created] = await db.insert(courseModules).values({ courseId: course.id, ...body }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course_module.create", entityType: "course_module", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ module: created });
  });

  router.post("/modules/:moduleId/lessons", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createLessonSchema.parse(req.body);
    const courseModule = await db.query.courseModules.findFirst({ where: eq(courseModules.id, req.params.moduleId) });
    if (!courseModule) throw new NotFoundError("Course module not found");

    const [created] = await db.insert(courseLessons).values({ moduleId: courseModule.id, ...body }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course_lesson.create", entityType: "course_lesson", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ lesson: created });
  });

  // --- Enrollment ---
  router.post("/:id/enroll", requireAuth(env), async (req, res) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course || course.status !== "published") throw new NotFoundError("Course not found or not open for enrollment");

    const prereqs = await db.query.coursePrerequisites.findMany({ where: eq(coursePrerequisites.courseId, course.id) });
    for (const prereq of prereqs) {
      const completedPrereq = await db.query.courseEnrollments.findFirst({
        where: and(eq(courseEnrollments.userId, req.user!.sub), eq(courseEnrollments.courseId, prereq.prerequisiteCourseId), eq(courseEnrollments.status, "completed")),
      });
      if (!completedPrereq) {
        throw new AppError("PREREQUISITE_NOT_MET", `You must complete a prerequisite course before enrolling in this one`, 400);
      }
    }

    const isPaidCourse = course.priceAmount !== null && Number(course.priceAmount) > 0;
    let paymentStatus: "not_required" | "pending" | "paid" = "not_required";
    let paymentDueAt: Date | undefined;

    if (isPaidCourse) {
      const paymentChoice = z.enum(["pay", "skip"]).parse((req.body ?? {}).paymentChoice);
      if (paymentChoice === "pay") {
        // No real payment gateway is integrated (Phase 5/Cashfree was
        // never built) — honestly refuse rather than fake a charge.
        throw new AppError(
          "PAYMENT_NOT_IMPLEMENTED",
          "Online payment is not available yet. Choose \"skip\" to access the course now (payment will be tracked as pending), or contact an admin to be marked paid manually.",
          501,
        );
      }
      paymentStatus = "pending";
      paymentDueAt = new Date(Date.now() + PAYMENT_GRACE_PERIOD_MS);
    }

    let enrollment;
    try {
      [enrollment] = await db.insert(courseEnrollments).values({ courseId: course.id, userId: req.user!.sub, paymentStatus, paymentDueAt }).returning();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
        throw new AppError("ALREADY_ENROLLED", "You are already enrolled in this course", 409);
      }
      throw err;
    }

    await ensureProgressRows(db, enrollment.id, course.id);
    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "course.enroll",
      entityType: "course_enrollment",
      entityId: enrollment.id,
      metadata: { paymentStatus, coursePriceAmount: course.priceAmount, paymentDueAt },
      ipAddress: req.ip,
    });
    res.status(201).json({
      enrollment,
      paymentSkipped: paymentStatus === "pending",
      paymentDueAt,
      ...(paymentStatus === "pending" ? { message: `Access granted now. Complete payment within ${PAYMENT_GRACE_PERIOD_DAYS} days or access will be paused until it's resolved.` } : {}),
    });
  });

  // Who owes payment for a course (pending AND overdue) — visible to
  // privileged roles so "skip for now" enrollments don't just disappear.
  router.get("/:id/pending-payments", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const rows = await db.query.courseEnrollments.findMany({ where: eq(courseEnrollments.courseId, req.params.id) });
    const resolved = await Promise.all(rows.map((r) => resolveEnrollmentPaymentStatus(db, r)));
    res.json({ pendingPayments: resolved.filter((r) => r.paymentStatus === "pending" || r.paymentStatus === "overdue") });
  });

  // Manual reconciliation — offline payment (bank transfer, cash, etc.),
  // not a real gateway confirmation. Works from either "pending" or the
  // escalated "overdue" state. Audited like everything else.
  router.post("/enrollments/:id/mark-paid", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const initial = await db.query.courseEnrollments.findFirst({ where: eq(courseEnrollments.id, req.params.id) });
    if (!initial) throw new NotFoundError("Enrollment not found");
    const enrollment = await resolveEnrollmentPaymentStatus(db, initial);
    if (enrollment.paymentStatus !== "pending" && enrollment.paymentStatus !== "overdue") {
      throw new AppError("INVALID_STATE", `Cannot mark paid — payment status is "${enrollment.paymentStatus}"`, 400);
    }

    const [updated] = await db
      .update(courseEnrollments)
      .set({ paymentStatus: "paid", markedPaidBy: req.user!.sub, markedPaidAt: new Date() })
      .where(eq(courseEnrollments.id, enrollment.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course_enrollment.mark_paid", entityType: "course_enrollment", entityId: enrollment.id, ipAddress: req.ip });
    res.json({ enrollment: updated });
  });

  router.get("/:id/progress", requireAuth(env), async (req, res) => {
    const initial = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, req.params.id), eq(courseEnrollments.userId, req.user!.sub)) });
    if (!initial) throw new NotFoundError("You are not enrolled in this course");
    const enrollment = await resolveEnrollmentPaymentStatus(db, initial);

    if (enrollment.paymentStatus === "overdue") {
      throw new AppError(
        "PAYMENT_OVERDUE",
        `Your ${PAYMENT_GRACE_PERIOD_DAYS}-day grace period for this course has ended. Contact an admin to complete payment and restore access.`,
        402,
      );
    }

    const rows = await ensureProgressRows(db, enrollment.id, req.params.id);
    res.json({ enrollment, progress: rows });
  });

  // Admin completion report — every learner's progress on this course.
  router.get("/:id/completion-report", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.params.id) });
    if (!course) throw new NotFoundError("Course not found");

    const enrollments = await db.query.courseEnrollments.findMany({ where: eq(courseEnrollments.courseId, course.id) });
    const report = [];
    for (const e of enrollments) {
      const progress = await db.query.lessonProgress.findMany({ where: eq(lessonProgress.enrollmentId, e.id) });
      const completedCount = progress.filter((p) => p.status === "completed").length;
      report.push({ userId: e.userId, status: e.status, enrolledAt: e.enrolledAt, completedAt: e.completedAt, lessonsCompleted: completedCount, lessonsTotal: progress.length });
    }
    res.json({ course, report });
  });

  return router;
}

export function lessonsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/:id/complete", requireAuth(env), async (req, res) => {
    const lesson = await db.query.courseLessons.findFirst({ where: eq(courseLessons.id, req.params.id) });
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (lesson.contentType === "test") {
      throw new AppError("USE_GRADE_ENDPOINT", "Test-type lessons are marked by a reviewer via /lessons/:id/grade, not self-reported", 400);
    }

    const courseModule = await db.query.courseModules.findFirst({ where: eq(courseModules.id, lesson.moduleId) });
    if (!courseModule) throw new NotFoundError("Course module not found");

    const enrollment = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, courseModule.courseId), eq(courseEnrollments.userId, req.user!.sub)) });
    if (!enrollment) throw new ForbiddenError("You are not enrolled in this course");

    const resolvedEnrollment = await resolveEnrollmentPaymentStatus(db, enrollment);
    if (resolvedEnrollment.paymentStatus === "overdue") {
      throw new AppError(
        "PAYMENT_OVERDUE",
        `Your ${PAYMENT_GRACE_PERIOD_DAYS}-day grace period for this course has ended. Contact an admin to complete payment and restore access.`,
        402,
      );
    }

    await db
      .insert(lessonProgress)
      .values({ enrollmentId: enrollment.id, lessonId: lesson.id, status: "completed", completedAt: new Date() })
      .onConflictDoUpdate({ target: [lessonProgress.enrollmentId, lessonProgress.lessonId], set: { status: "completed", completedAt: new Date() } });

    await maybeAutoCompleteEnrollment(db, enrollment.id, courseModule.courseId);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "lesson.complete", entityType: "course_lesson", entityId: lesson.id, ipAddress: req.ip });

    const updatedEnrollment = await db.query.courseEnrollments.findFirst({ where: eq(courseEnrollments.id, enrollment.id) });
    res.json({ enrollment: updatedEnrollment });
  });

  router.post("/:id/grade", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = gradeSchema.parse(req.body);
    const lesson = await db.query.courseLessons.findFirst({ where: eq(courseLessons.id, req.params.id) });
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (lesson.contentType !== "test") {
      throw new AppError("NOT_A_TEST_LESSON", "Only test-type lessons are graded through this endpoint", 400);
    }

    const enrolleeUserId = body.userId;
    const courseModule = await db.query.courseModules.findFirst({ where: eq(courseModules.id, lesson.moduleId) });
    if (!courseModule) throw new NotFoundError("Course module not found");

    const enrollment = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, courseModule.courseId), eq(courseEnrollments.userId, enrolleeUserId)) });
    if (!enrollment) throw new NotFoundError("That user is not enrolled in this course");

    await db
      .insert(lessonProgress)
      .values({ enrollmentId: enrollment.id, lessonId: lesson.id, status: "completed", passed: body.passed, completedAt: new Date() })
      .onConflictDoUpdate({ target: [lessonProgress.enrollmentId, lessonProgress.lessonId], set: { status: "completed", passed: body.passed, completedAt: new Date() } });

    await maybeAutoCompleteEnrollment(db, enrollment.id, courseModule.courseId);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "lesson.grade", entityType: "course_lesson", entityId: lesson.id, metadata: { userId: enrolleeUserId, passed: body.passed }, ipAddress: req.ip });

    res.json({ message: `Lesson graded: ${body.passed ? "pass" : "fail"}` });
  });

  return router;
}
