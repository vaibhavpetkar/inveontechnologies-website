import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { calendarEventAttendees, calendarEvents, courseEnrollments, courses } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { formatWhen } from "../shared/format.js";
import { logger } from "../shared/logger.js";
import { notify } from "../notifications/service.js";
import type { Env } from "../shared/env.js";
import { meetingProviders, type MeetingProvider, type ProviderName } from "../calendar/providers.js";
import { people, present, sendInvites } from "../calendar/routes.js";

const TEACHING_ROLES = ["manager", "hr", "admin", "super_admin"];
const ADMIN_ROLES = ["admin", "super_admin"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const classSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    timezone: z.string().max(64).default("Asia/Kolkata"),
    provider: z.enum(["none", "manual", "google_meet", "zoom"]).default("none"),
    joinUrl: z.string().trim().url().max(2000).nullable().optional(),
    /** 1 = just this class; up to 26 weekly classes at the same time. */
    weeks: z.number().int().min(1).max(26).default(1),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "The class must end after it starts", path: ["endsAt"] })
  .refine((v) => new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <= 12 * 60 * 60 * 1000, { message: "A class can last at most 12 hours", path: ["endsAt"] })
  .refine((v) => new Date(v.startsAt).getTime() > Date.now() - 60 * 60 * 1000, { message: "Pick a time in the future", path: ["startsAt"] })
  .refine((v) => v.provider !== "manual" || !!v.joinUrl, { message: "Paste the class link", path: ["joinUrl"] });

/** People learning a course right now: enrolled, and not locked out by an overdue payment. */
export async function activeLearners(db: Database, courseId: string) {
  const rows = await db
    .select({ userId: courseEnrollments.userId })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.status, "enrolled"), ne(courseEnrollments.paymentStatus, "overdue")));
  return rows.map((r) => r.userId);
}

async function upcomingClasses(db: Database, courseId: string) {
  return db.query.calendarEvents.findMany({
    where: and(eq(calendarEvents.courseId, courseId), isNull(calendarEvents.cancelledAt), gt(calendarEvents.endsAt, new Date())),
    orderBy: [asc(calendarEvents.startsAt)],
  });
}

/**
 * Adds a new learner to a course's upcoming live classes, with one
 * notification and a calendar invite per class. Called wherever someone is
 * enrolled; safe to call twice. Never throws.
 */
export async function joinUpcomingClasses(db: Database, courseId: string, userId: string) {
  try {
    const classes = await upcomingClasses(db, courseId);
    if (classes.length === 0) return 0;
    const added = await db
      .insert(calendarEventAttendees)
      .values(classes.map((c) => ({ eventId: c.id, userId })))
      .onConflictDoNothing()
      .returning({ eventId: calendarEventAttendees.eventId });
    if (added.length === 0) return 0;
    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId), columns: { title: true } });
    const first = classes.find((c) => added.some((a) => a.eventId === c.id))!;
    await notify(db, {
      userIds: [userId],
      kind: "class.invited",
      title: added.length === 1 ? `Live class: ${first.title}` : `${added.length} live classes for ${course?.title ?? "your course"}`,
      body: `Next one ${formatWhen(first.startsAt, first.timezone)}. They're on your calendar.`,
      link: `/calendar?event=${first.id}`,
    });
    for (const c of classes.filter((x) => added.some((a) => a.eventId === x.id))) await sendInvites(db, c, [userId], "new");
    return added.length;
  } catch (err) {
    logger.error({ err, courseId, userId }, "Could not add a learner to upcoming classes");
    return 0;
  }
}

export function classesRouter(db: Database, env: Env, providers: Map<ProviderName, MeetingProvider> = meetingProviders(env)) {
  const router = Router();

  async function courseOr404(id: string) {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, id) });
    if (!course) throw new NotFoundError("Course not found");
    return course;
  }

  /** A course's classes: upcoming ones, plus the last two weeks. Learners see them once enrolled. */
  router.get("/:id/classes", requireAuth(env), async (req, res) => {
    const course = await courseOr404(req.params.id);
    const me = req.user!.sub;
    const teaching = TEACHING_ROLES.includes(req.user!.role);
    if (!teaching) {
      const enrolled = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, course.id), eq(courseEnrollments.userId, me)) });
      if (!enrolled) return res.json({ classes: [], canSchedule: false });
    }
    const rows = await db.query.calendarEvents.findMany({
      where: and(eq(calendarEvents.courseId, course.id), isNull(calendarEvents.cancelledAt), gt(calendarEvents.endsAt, new Date(Date.now() - 2 * WEEK_MS))),
      orderBy: [asc(calendarEvents.startsAt)],
      limit: 100,
    });
    res.json({ classes: await present(db, rows, me, req.user!.role), canSchedule: teaching && course.status !== "archived" });
  });

  /** Schedule a class (or a weekly run of them). Everyone learning the course is invited. */
  router.post("/:id/classes", requireAuth(env), async (req, res) => {
    if (!TEACHING_ROLES.includes(req.user!.role)) throw new ForbiddenError("Only staff can schedule classes");
    const course = await courseOr404(req.params.id);
    if (course.status === "archived") throw new AppError("INVALID_STATE", "This course is archived", 400);
    const body = classSchema.parse(req.body);
    const me = req.user!.sub;
    const title = body.title || `${course.title}: live class`;
    const learners = (await activeLearners(db, course.id)).filter((id) => id !== me);
    const seriesId = body.weeks > 1 ? randomUUID() : null;
    const emails = [...(await people(db, [me, ...learners])).values()].map((p) => p.email);

    const created: (typeof calendarEvents.$inferSelect)[] = [];
    for (let i = 0; i < body.weeks; i++) {
      const startsAt = new Date(new Date(body.startsAt).getTime() + i * WEEK_MS);
      const endsAt = new Date(new Date(body.endsAt).getTime() + i * WEEK_MS);
      let joinUrl: string | null = body.provider === "manual" ? body.joinUrl! : null;
      let externalId: string | null = null;
      if (body.provider === "google_meet" || body.provider === "zoom") {
        const p = providers.get(body.provider);
        if (!p?.configured) throw new AppError("PROVIDER_NOT_CONFIGURED", `${p?.label ?? body.provider} isn't set up for this portal yet. Paste a link instead.`, 400);
        const meeting = await p.create({ title, description: body.description, startsAt, endsAt, timezone: body.timezone, attendeeEmails: emails });
        joinUrl = meeting.joinUrl;
        externalId = meeting.externalId;
      }
      const event = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(calendarEvents)
          .values({ title, description: body.description ?? null, location: body.location ?? null, startsAt, endsAt, timezone: body.timezone, meetingProvider: body.provider, joinUrl, externalId, createdBy: me, courseId: course.id, seriesId })
          .returning();
        await tx.insert(calendarEventAttendees).values([{ eventId: row.id, userId: me, response: "accepted" as const }, ...learners.map((userId) => ({ eventId: row.id, userId }))]);
        return row;
      });
      created.push(event);
    }

    await writeAuditLog(db, { actorUserId: me, action: "course.class_schedule", entityType: "course", entityId: course.id, metadata: { classes: created.length, seriesId }, ipAddress: req.ip });
    await notify(db, {
      userIds: learners,
      actorUserId: me,
      kind: "class.invited",
      title: created.length === 1 ? `Live class: ${title}` : `${created.length} weekly live classes for ${course.title}`,
      body: `${created.length === 1 ? "" : "First one "}${formatWhen(created[0].startsAt, created[0].timezone)}${created[0].joinUrl ? " · online" : ""}. It's on your calendar.`,
      link: `/calendar?event=${created[0].id}`,
      email: false, // the calendar invites below are the email
    });
    for (const event of created) await sendInvites(db, event, [me, ...learners], "new");
    res.status(201).json({ classes: await present(db, created, me, req.user!.role), invited: learners.length });
  });

  /** Cancel every class still to come in a weekly series. */
  router.post("/classes/series/:seriesId/cancel", requireAuth(env), async (req, res) => {
    const seriesId = z.string().uuid().parse(req.params.seriesId);
    const rows = await db.query.calendarEvents.findMany({ where: and(eq(calendarEvents.seriesId, seriesId), isNull(calendarEvents.cancelledAt), gt(calendarEvents.startsAt, new Date())) });
    if (rows.length === 0) throw new NotFoundError("No upcoming classes in this series");
    if (rows.some((r) => r.createdBy !== req.user!.sub) && !ADMIN_ROLES.includes(req.user!.role)) throw new ForbiddenError("Only the organiser can cancel these classes");
    for (const r of rows) if (r.externalId) await providers.get(r.meetingProvider)?.cancel?.(r.externalId).catch(() => undefined);
    const cancelled = await db
      .update(calendarEvents)
      .set({ cancelledAt: new Date(), sequence: sql`${calendarEvents.sequence} + 1`, updatedAt: new Date() })
      .where(inArray(calendarEvents.id, rows.map((r) => r.id)))
      .returning();
    const attendees = await db.select().from(calendarEventAttendees).where(inArray(calendarEventAttendees.eventId, rows.map((r) => r.id)));
    const everyone = [...new Set(attendees.map((a) => a.userId))];
    await notify(db, {
      userIds: everyone,
      actorUserId: req.user!.sub,
      kind: "class.cancelled",
      title: `${cancelled.length} upcoming ${cancelled.length === 1 ? "class" : "classes"} cancelled: ${rows[0].title}`,
      link: "/calendar",
    });
    for (const e of cancelled) await sendInvites(db, e, attendees.filter((a) => a.eventId === e.id).map((a) => a.userId), "cancelled");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "course.class_cancel_series", entityType: "calendar_event", entityId: null, metadata: { seriesId, count: cancelled.length }, ipAddress: req.ip });
    res.json({ cancelled: cancelled.length });
  });

  return router;
}

