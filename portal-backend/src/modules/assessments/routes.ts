import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { assessments, assessmentQuestions, applications, opportunities, assessmentAttempts, applicationEvents, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { isAdminTransitionAllowed, type ApplicationStatus } from "../applications/state-machine.js";
import { sendAssessmentInviteEmail } from "../shared/emails.js";
import type { Env } from "../shared/env.js";
import { PIPELINE_ROLES, assertCanManageApplication } from "../applications/access.js";

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
  questions: z.array(questionSchema).min(1),
});

const inviteSchema = z.object({ assessmentId: z.string().uuid() });

export function assessmentsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createAssessmentSchema.parse(req.body);

    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, body.opportunityId) });
    if (!opportunity) throw new NotFoundError("Opportunity not found");

    // Every option id referenced as correctOptionId must exist among that
    // question's own options — catches a typo'd answer key at creation
    // time rather than silently scoring everyone as wrong later.
    for (const q of body.questions) {
      if (!q.options.some((o) => o.id === q.correctOptionId)) {
        throw new AppError("INVALID_QUESTION", `correctOptionId "${q.correctOptionId}" is not among the given options`, 400);
      }
    }

    const result = await db.transaction(async (tx) => {
      const [assessment] = await tx
        .insert(assessments)
        .values({
          opportunityId: body.opportunityId,
          title: body.title,
          description: body.description,
          durationMinutes: body.durationMinutes,
          passingScorePercent: body.passingScorePercent,
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
    const rows = await db.query.assessments.findMany({ where: eq(assessments.opportunityId, opportunityId) });
    res.json({ assessments: rows });
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

    const existingAttempt = await db.query.assessmentAttempts.findFirst({ where: eq(assessmentAttempts.applicationId, application.id) });
    if (existingAttempt) {
      throw new AppError("ATTEMPT_EXISTS", "This application already has an assessment attempt", 409);
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
