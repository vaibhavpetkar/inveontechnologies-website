import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { interviewRounds, opportunities, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { PIPELINE_ROLES, assertCanManageApplication, canStaffAccessApplication, getApplicationOr404 } from "../applications/access.js";
import { notifyCandidate } from "../notifications/recruitment.js";
import { formatWhen } from "../shared/format.js";
import { notify } from "../notifications/service.js";
import { onHrRoundPassed } from "../payments/enrollments.js";
import { meetingProviders, type MeetingProvider, type ProviderName } from "../calendar/providers.js";
import { people } from "../calendar/routes.js";

const TERMINAL_APPLICATION_STATUSES = ["rejected", "withdrawn"] as const;

const scheduleSchema = z.object({
  roundNumber: z.number().int().min(1).default(1),
  interviewerId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  timezone: z.string().default("Asia/Kolkata"),
  meetingUrl: z.string().url().optional(),
  // "Java technical round", "Aptitude exam": what the round is about.
  subject: z.string().trim().max(200).optional(),
  kind: z.enum(["interview", "exam", "hr"]).default("interview"),
  durationMinutes: z.number().int().min(10).max(480).default(60),
  // google_meet / zoom create the meeting link automatically when the portal has them set up.
  provider: z.enum(["manual", "google_meet", "zoom"]).optional(),
});

const KIND_LABEL = { interview: "interview", exam: "exam", hr: "HR round" } as const;

/** "Java technical round (interview)" or "round 2 interview": how a round is named in messages. */
export function roundLabel(r: { subject: string | null; kind: "interview" | "exam" | "hr"; roundNumber: number }) {
  return r.subject ? `${r.subject} ${KIND_LABEL[r.kind]}` : `round ${r.roundNumber} ${KIND_LABEL[r.kind]}`;
}

const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(10).max(480).optional(),
  timezone: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  note: z.string().max(1000).optional(),
});

const feedbackSchema = z.object({
  feedback: z.string().min(1).max(5000),
  scorecard: z.record(z.unknown()).optional(),
  decision: z.enum(["pass", "fail", "hold"]),
});

export function interviewsRouter(db: Database, env: Env, providers: Map<ProviderName, MeetingProvider> = meetingProviders(env)) {
  const router = Router();

  /** Creates the Meet/Zoom meeting for a round, inviting the candidate and interviewer. */
  async function createMeeting(name: "google_meet" | "zoom", input: { title: string; startsAt: Date; minutes: number; timezone: string; userIds: string[] }) {
    const provider = providers.get(name);
    if (!provider?.configured) throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider?.label ?? name} isn't set up for this portal yet. Paste a link instead.`, 400);
    const emails = [...(await people(db, input.userIds)).values()].map((p) => p.email);
    return provider.create({ title: input.title, startsAt: input.startsAt, endsAt: new Date(input.startsAt.getTime() + input.minutes * 60000), timezone: input.timezone, attendeeEmails: emails });
  }

  router.post("/applications/:applicationId/interviews", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = scheduleSchema.parse(req.body);
    const application = await getApplicationOr404(db, req.params.applicationId);
    await assertCanManageApplication(db, req, application);
    if (TERMINAL_APPLICATION_STATUSES.includes(application.status as (typeof TERMINAL_APPLICATION_STATUSES)[number])) {
      throw new AppError("INVALID_STATE", `Cannot schedule an interview for an application in status "${application.status}"`, 400);
    }

    const interviewer = await db.query.users.findFirst({ where: eq(users.id, body.interviewerId) });
    if (!interviewer) throw new AppError("INVALID_INTERVIEWER", "Interviewer not found", 400);

    const scheduledAt = new Date(body.scheduledAt);
    const provider = body.provider ?? "manual";
    let meetingUrl = body.meetingUrl ?? null;
    let externalMeetingId: string | null = null;
    if (provider === "google_meet" || provider === "zoom") {
      const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId), columns: { title: true } });
      const label = roundLabel({ subject: body.subject ?? null, kind: body.kind, roundNumber: body.roundNumber });
      const made = await createMeeting(provider, { title: `${opportunity?.title ?? "Inveon"}: ${label}`, startsAt: scheduledAt, minutes: body.durationMinutes, timezone: body.timezone, userIds: [application.userId, body.interviewerId] });
      meetingUrl = made.joinUrl;
      externalMeetingId = made.externalId;
    }

    const [created] = await db
      .insert(interviewRounds)
      .values({
        applicationId: application.id,
        roundNumber: body.roundNumber,
        interviewerId: body.interviewerId,
        scheduledAt,
        timezone: body.timezone,
        meetingUrl,
        subject: body.subject || null,
        kind: body.kind,
        durationMinutes: body.durationMinutes,
        meetingProvider: meetingUrl ? provider : "none",
        externalMeetingId,
        createdBy: req.user!.sub,
      })
      .returning();

    const label = roundLabel(created);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.schedule", entityType: "interview_round", entityId: created.id, metadata: { kind: created.kind, subject: created.subject, provider: created.meetingProvider }, ipAddress: req.ip });
    await notifyCandidate(db, application.id, {
      kind: "interview.scheduled",
      title: created.kind === "exam" ? "Exam scheduled" : "Interview scheduled",
      body: (opp) => `Your ${label} for ${opp} is on ${formatWhen(created.scheduledAt, created.timezone)} (${created.durationMinutes} minutes).${created.meetingUrl ? `\n\nJoin here: ${created.meetingUrl}` : ""}`,
      email: true,
      actorUserId: req.user!.sub,
    });
    await notify(db, { userIds: [created.interviewerId], actorUserId: req.user!.sub, kind: "interview.assigned", title: created.kind === "exam" ? "You're invigilating" : "You're interviewing", body: `You've been added to the ${label} on ${formatWhen(created.scheduledAt, created.timezone)}.${created.meetingUrl ? ` Join: ${created.meetingUrl}` : ""}`, link: "/calendar", email: true });
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

    const scheduledAt = new Date(body.scheduledAt);
    const timezone = body.timezone ?? interview.timezone;
    const durationMinutes = body.durationMinutes ?? interview.durationMinutes;
    // A Meet/Zoom link moves with the round; a pasted link is replaced only if a new one is given.
    if (interview.externalMeetingId && !body.meetingUrl && (interview.meetingProvider === "google_meet" || interview.meetingProvider === "zoom")) {
      const application = await getApplicationOr404(db, interview.applicationId);
      const emails = [...(await people(db, [application.userId, interview.interviewerId])).values()].map((p) => p.email);
      await providers
        .get(interview.meetingProvider)
        ?.update?.(interview.externalMeetingId, { title: roundLabel(interview), startsAt: scheduledAt, endsAt: new Date(scheduledAt.getTime() + durationMinutes * 60000), timezone, attendeeEmails: emails })
        .catch(() => undefined);
    }
    const [updated] = await db
      .update(interviewRounds)
      .set({
        scheduledAt,
        timezone,
        durationMinutes,
        meetingUrl: body.meetingUrl ?? interview.meetingUrl,
        ...(body.meetingUrl ? { meetingProvider: "manual" as const, externalMeetingId: null } : {}),
        status: "scheduled",
        updatedAt: new Date(),
      })
      .where(eq(interviewRounds.id, interview.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.reschedule", entityType: "interview_round", entityId: interview.id, metadata: { note: body.note }, ipAddress: req.ip });
    await notifyCandidate(db, interview.applicationId, {
      kind: "interview.rescheduled",
      title: updated.kind === "exam" ? "Exam moved" : "Interview moved",
      body: (opp) => `Your ${roundLabel(updated)} for ${opp} has moved to ${formatWhen(updated.scheduledAt, updated.timezone)}.${updated.meetingUrl ? `\n\nJoin here: ${updated.meetingUrl}` : ""}`,
      email: true,
      actorUserId: req.user!.sub,
    });
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

    if (interview.externalMeetingId && (interview.meetingProvider === "google_meet" || interview.meetingProvider === "zoom")) {
      await providers.get(interview.meetingProvider)?.cancel?.(interview.externalMeetingId).catch(() => undefined);
    }
    const [updated] = await db
      .update(interviewRounds)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(interviewRounds.id, interview.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "interview.cancel", entityType: "interview_round", entityId: interview.id, ipAddress: req.ip });
    await notifyCandidate(db, interview.applicationId, { kind: "interview.cancelled", title: interview.kind === "exam" ? "Exam cancelled" : "Interview cancelled", body: (opp) => `Your ${roundLabel(interview)} for ${opp} has been cancelled. The team will be in touch if it's rescheduled.`, email: true, actorUserId: req.user!.sub });
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
    // A pass moves the candidate on: shortlisted, then pay or start a trial.
    // A scheduled subject exam is one step among others, so it doesn't.
    const enrollment = body.decision === "pass" && interview.kind !== "exam" ? await onHrRoundPassed(db, interview.applicationId, req.user!.sub) : null;
    res.json({ interview: updated, enrollment });
  });

  return router;
}
