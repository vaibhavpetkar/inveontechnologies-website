import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { assessments, assessmentQuestions, applications, opportunities, assessmentAttempts, applicationEvents, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { isAdminTransitionAllowed, type ApplicationStatus } from "../applications/state-machine.js";
import { sendAssessmentInviteEmail } from "../shared/emails.js";
import type { Env } from "../shared/env.js";
import { PIPELINE_ROLES, assertCanManageApplication } from "../applications/access.js";
import { notify } from "../notifications/service.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;

const questionSchema = z.object({
  questionText: z.string().min(3),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  correctOptionId: z.string().min(1),
  points: z.number().int().min(1).default(1),
});

const createAssessmentSchema = z.object({
  opportunityId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(1).max(300),
  passingScorePercent: z.number().int().min(0).max(100).default(60),
  language: z.string().trim().max(60).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).default(1),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  questions: z.array(questionSchema).min(1),
});

function assertWindow(body: { opensAt?: Date | null; closesAt?: Date | null }) {
  if (body.opensAt && body.closesAt && body.closesAt <= body.opensAt) {
    throw new AppError("INVALID_WINDOW", "The exam has to close after it opens", 400);
  }
}

const updateAssessmentSchema = createAssessmentSchema.omit({ opportunityId: true }).extend({
  isActive: z.boolean().optional(),
  // Questions can only be replaced while nobody has sat the exam.
  questions: z.array(questionSchema).min(1).optional(),
});

function assertAnswerKeys(questions: z.infer<typeof questionSchema>[]) {
  // Every correctOptionId must exist among that question's own options —
  // catches a typo'd answer key at save time rather than silently scoring
  // everyone as wrong later.
  for (const q of questions) {
    if (!q.options.some((o) => o.id === q.correctOptionId)) {
      throw new AppError("INVALID_QUESTION", `correctOptionId "${q.correctOptionId}" is not among the given options`, 400);
    }
  }
}

const inviteSchema = z.object({ assessmentId: z.string().uuid() });

export function assessmentsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createAssessmentSchema.parse(req.body);

    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, body.opportunityId) });
    if (!opportunity) throw new NotFoundError("Opportunity not found");

    assertAnswerKeys(body.questions);
    assertWindow(body);

    const result = await db.transaction(async (tx) => {
      const [assessment] = await tx
        .insert(assessments)
        .values({
          opportunityId: body.opportunityId,
          title: body.title,
          description: body.description,
          durationMinutes: body.durationMinutes,
          passingScorePercent: body.passingScorePercent,
          language: body.language || null,
          maxAttempts: body.maxAttempts,
          opensAt: body.opensAt ?? null,
          closesAt: body.closesAt ?? null,
          createdBy: req.user!.sub,
        })
        .returning();

      await tx.insert(assessmentQuestions).values(
        body.questions.map((q, i) => ({
          assessmentId: assessment.id,
          questionText: q.questionText,
          options: q.options,
          correctOptionId: q.correctOptionId,
          points: q.points,
          orderIndex: i,
        })),
      );

      return assessment;
    });

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "assessment.create", entityType: "assessment", entityId: result.id, ipAddress: req.ip });
    res.status(201).json({ assessment: result });
  });

  // Full detail including correct answers — privileged only, never exposed to candidates.
  router.get("/:id", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, req.params.id) });
    if (!assessment) throw new NotFoundError("Assessment not found");

    const questions = await db.query.assessmentQuestions.findMany({
      where: eq(assessmentQuestions.assessmentId, assessment.id),
      orderBy: (q, { asc }) => [asc(q.orderIndex)],
    });

    res.json({ assessment, questions });
  });

  router.get("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const opportunityId = z.string().uuid().parse(req.query.opportunityId);
    const rows = await db
      .select({
        assessment: assessments,
        questionCount: sql<number>`(select count(*)::int from assessment_questions q where q.assessment_id = "assessments"."id")`,
        attemptCount: sql<number>`(select count(*)::int from assessment_attempts t where t.assessment_id = "assessments"."id")`,
        passCount: sql<number>`(select count(*)::int from assessment_attempts t where t.assessment_id = "assessments"."id" and t.passed = true)`,
      })
      .from(assessments)
      .where(eq(assessments.opportunityId, opportunityId))
      .orderBy(assessments.createdAt);
    res.json({ assessments: rows.map((r) => ({ ...r.assessment, questionCount: r.questionCount, attemptCount: r.attemptCount, passCount: r.passCount })) });
  });

  router.put("/:id", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = updateAssessmentSchema.parse(req.body);
    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, req.params.id) });
    if (!assessment) throw new NotFoundError("Assessment not found");
    assertWindow({
      opensAt: body.opensAt !== undefined ? body.opensAt : assessment.opensAt,
      closesAt: body.closesAt !== undefined ? body.closesAt : assessment.closesAt,
    });

    if (body.questions) {
      assertAnswerKeys(body.questions);
      const taken = await db.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.assessmentId, assessment.id), columns: { id: true } });
      if (taken) {
        throw new AppError("EXAM_IN_USE", "Candidates have already sat this exam, so its questions can't change. Switch it off and create a new one.", 409);
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(assessments)
        .set({
          title: body.title,
          description: body.description ?? null,
          durationMinutes: body.durationMinutes,
          passingScorePercent: body.passingScorePercent,
          language: body.language || null,
          maxAttempts: body.maxAttempts,
          ...(body.opensAt !== undefined ? { opensAt: body.opensAt } : {}),
          ...(body.closesAt !== undefined ? { closesAt: body.closesAt } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, assessment.id))
        .returning();
      if (body.questions) {
        await tx.delete(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessment.id));
        await tx.insert(assessmentQuestions).values(
          body.questions.map((q, i) => ({ assessmentId: assessment.id, questionText: q.questionText, options: q.options, correctOptionId: q.correctOptionId, points: q.points, orderIndex: i })),
        );
      }
      return row;
    });

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "assessment.update", entityType: "assessment", entityId: assessment.id, ipAddress: req.ip });
    res.json({ assessment: updated });
  });

  // Deletes an exam nobody has sat; otherwise switches it off to keep the results.
  router.delete("/:id", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, req.params.id) });
    if (!assessment) throw new NotFoundError("Assessment not found");
    const taken = await db.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.assessmentId, assessment.id), columns: { id: true } });
    if (taken) {
      await db.update(assessments).set({ isActive: false, updatedAt: new Date() }).where(eq(assessments.id, assessment.id));
    } else {
      await db.delete(assessments).where(eq(assessments.id, assessment.id));
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: taken ? "assessment.deactivate" : "assessment.delete", entityType: "assessment", entityId: assessment.id, ipAddress: req.ip });
    res.json({ deleted: !taken, deactivated: !!taken });
  });

  // --- Invite an application to take an assessment ---
  router.post("/applications/:applicationId/invite", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = inviteSchema.parse(req.body);

    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");
    await assertCanManageApplication(db, req, application);

    const from = application.status as ApplicationStatus;
    if (!isAdminTransitionAllowed(from, "assessment_invited")) {
      throw new AppError("INVALID_TRANSITION", `Cannot invite an application in status "${from}" to an assessment`, 400);
    }

    const assessment = await db.query.assessments.findFirst({ where: eq(assessments.id, body.assessmentId) });
    if (!assessment) throw new NotFoundError("Assessment not found");
    if (assessment.opportunityId !== application.opportunityId) {
      throw new AppError("MISMATCHED_OPPORTUNITY", "This assessment belongs to a different opportunity", 400);
    }

    const existingAttempt = await db.query.assessmentAttempts.findFirst({
      where: and(eq(assessmentAttempts.applicationId, application.id), inArray(assessmentAttempts.status, ["not_started", "in_progress"])),
    });
    if (existingAttempt) {
      throw new AppError("ATTEMPT_EXISTS", "This application already has an open assessment attempt", 409);
    }

    const attempt = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(assessmentAttempts)
        .values({ applicationId: application.id, assessmentId: assessment.id })
        .returning();

      await tx
        .update(applications)
        .set({ status: "assessment_invited", updatedAt: new Date() })
        .where(eq(applications.id, application.id));

      await tx.insert(applicationEvents).values({
        applicationId: application.id,
        fromStatus: from,
        toStatus: "assessment_invited",
        actorUserId: req.user!.sub,
        note: `Invited to assessment "${assessment.title}"`,
      });

      return created;
    });

    const candidate = await db.query.users.findFirst({ where: eq(users.id, application.userId) });
    if (candidate) {
      const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId) });
      sendAssessmentInviteEmail(candidate.email, {
        assessmentTitle: assessment.title,
        opportunityTitle: opportunity?.title ?? "your application",
        durationMinutes: assessment.durationMinutes,
        // The portal's exam page is keyed by application id (/assessments/:applicationId).
        link: `${env.PORTAL_APP_URL}/assessments/${application.id}`,
      });
    }
    // The invite email above is the email; this is the in-app copy.
    await notify(db, { userIds: [application.userId], actorUserId: req.user!.sub, kind: "assessment.invited", title: `Assessment ready: ${assessment.title}`, body: `You have ${assessment.durationMinutes} minutes once you press Start.`, link: `/assessments/${application.id}` });

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "application.assessment_invited",
      entityType: "application",
      entityId: application.id,
      metadata: { assessmentId: assessment.id, attemptId: attempt.id },
      ipAddress: req.ip,
    });

    res.status(201).json({ attempt });
  });

  return router;
}
