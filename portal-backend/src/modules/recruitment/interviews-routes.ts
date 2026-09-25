import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { interviewRounds, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { PIPELINE_ROLES, assertCanManageApplication, canStaffAccessApplication, getApplicationOr404 } from "../applications/access.js";

const TERMINAL_APPLICATION_STATUSES = ["rejected", "withdrawn"] as const;

const scheduleSchema = z.object({
  roundNumber: z.number().int().min(1).default(1),
  interviewerId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  timezone: z.string().default("Asia/Kolkata"),
  meetingUrl: z.string().url().optional(),
});

const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  timezone: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  note: z.string().max(1000).optional(),
});

const feedbackSchema = z.object({
  feedback: z.string().min(1).max(5000),
  scorecard: z.record(z.unknown()).optional(),
  decision: z.enum(["pass", "fail", "hold"]),
});

export function interviewsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/applications/:applicationId/interviews", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = scheduleSchema.parse(req.body);
    const application = await getApplicationOr404(db, req.params.applicationId);
    await assertCanManageApplication(db, req, application);
    if (TERMINAL_APPLICATION_STATUSES.includes(application.status as (typeof TERMINAL_APPLICATION_STATUSES)[number])) {
      throw new AppError("INVALID_STATE", `Cannot schedule an interview for an application in status "${application.status}"`, 400);
    }

    const interviewer = await db.query.users.findFirst({ where: eq(users.id, body.interviewerId) });
    if (!interviewer) throw new AppError("INVALID_INTERVIEWER", "Interviewer not found", 400);

    const [created] = await db
      .insert(interviewRounds)
      .values({
        applicationId: application.id,
        roundNumber: body.roundNumber,
        interviewerId: body.interviewerId,
        scheduledAt: new Date(body.scheduledAt),
        timezone: body.timezone,
        meetingUrl: body.meetingUrl,
        createdBy: req.user!.sub,
      })
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.schedule", entityType: "interview_round", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ interview: created });
  });

  router.get("/applications/:applicationId/interviews", requireAuth(env), async (req, res) => {
    const application = await getApplicationOr404(db, req.params.applicationId);
    const isOwner = application.userId === req.user!.sub;
    const isPrivileged = !isOwner && (await canStaffAccessApplication(db, req.user!, application, "view"));
    if (!isOwner && !isPrivileged) throw new ForbiddenError();

    const rows = await db.query.interviewRounds.findMany({
      where: eq(interviewRounds.applicationId, application.id),
      orderBy: (i, { asc }) => [asc(i.roundNumber)],
    });

    // Candidates see scheduling details but not internal feedback/scorecard/decision.
    if (!isPrivileged) {
      res.json({ interviews: rows.map(({ feedback, scorecard, decision, ...rest }) => rest) });
      return;
    }
    res.json({ interviews: rows });
  });

  router.post("/interviews/:id/reschedule", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = rescheduleSchema.parse(req.body);
    const interview = await db.query.interviewRounds.findFirst({ where: eq(interviewRounds.id, req.params.id) });
    if (!interview) throw new NotFoundError("Interview not found");
    await assertCanManageApplication(db, req, await getApplicationOr404(db, interview.applicationId));
    if (!["scheduled", "no_show", "rescheduled"].includes(interview.status)) {
      throw new AppError("INVALID_STATE", `Cannot reschedule an interview in status "${interview.status}"`, 400);
    }

    const [updated] = await db
      .update(interviewRounds)
      .set({
        scheduledAt: new Date(body.scheduledAt),
        timezone: body.timezone ?? interview.timezone,
        meetingUrl: body.meetingUrl ?? interview.meetingUrl,
        status: "scheduled",
        updatedAt: new Date(),
      })
      .where(eq(interviewRounds.id, interview.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.reschedule", entityType: "interview_round", entityId: interview.id, metadata: { note: body.note }, ipAddress: req.ip });
    res.json({ interview: updated });
  });

  router.post("/interviews/:id/no-show", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const interview = await db.query.interviewRounds.findFirst({ where: eq(interviewRounds.id, req.params.id) });
    if (!interview) throw new NotFoundError("Interview not found");
    await assertCanManageApplication(db, req, await getApplicationOr404(db, interview.applicationId));
    if (interview.status !== "scheduled") {
      throw new AppError("INVALID_STATE", `Cannot mark no-show on an interview in status "${interview.status}"`, 400);
    }

    const [updated] = await db
      .update(interviewRounds)
      .set({ status: "no_show", updatedAt: new Date() })
      .where(eq(interviewRounds.id, interview.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.no_show", entityType: "interview_round", entityId: interview.id, ipAddress: req.ip });
    res.json({ interview: updated });
  });

  router.post("/interviews/:id/cancel", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const interview = await db.query.interviewRounds.findFirst({ where: eq(interviewRounds.id, req.params.id) });
    if (!interview) throw new NotFoundError("Interview not found");
    await assertCanManageApplication(db, req, await getApplicationOr404(db, interview.applicationId));
    if (interview.status === "completed" || interview.status === "cancelled") {
      throw new AppError("INVALID_STATE", `Cannot cancel an interview in status "${interview.status}"`, 400);
    }

    const [updated] = await db
      .update(interviewRounds)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(interviewRounds.id, interview.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.cancel", entityType: "interview_round", entityId: interview.id, ipAddress: req.ip });
    res.json({ interview: updated });
  });

  router.post("/interviews/:id/feedback", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = feedbackSchema.parse(req.body);
    const interview = await db.query.interviewRounds.findFirst({ where: eq(interviewRounds.id, req.params.id) });
    if (!interview) throw new NotFoundError("Interview not found");
    // The assigned interviewer records feedback; so can anyone who manages this application.
    if (interview.interviewerId !== req.user!.sub) {
      await assertCanManageApplication(db, req, await getApplicationOr404(db, interview.applicationId));
    }
    if (interview.status !== "scheduled") {
      throw new AppError("INVALID_STATE", `Cannot record feedback on an interview in status "${interview.status}"`, 400);
    }

    const [updated] = await db
      .update(interviewRounds)
      .set({ status: "completed", feedback: body.feedback, scorecard: body.scorecard ?? {}, decision: body.decision, updatedAt: new Date() })
      .where(eq(interviewRounds.id, interview.id))
      .returning();

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "interview.feedback",
      entityType: "interview_round",
      entityId: interview.id,
      metadata: { decision: body.decision },
      ipAddress: req.ip,
    });
    res.json({ interview: updated });
  });

  return router;
}
