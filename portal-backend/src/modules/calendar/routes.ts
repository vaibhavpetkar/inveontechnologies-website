import { Router } from "express";
import { z } from "zod";
import { and, eq, gt, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { calendarEventAttendees, calendarEvents, courses, users } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { enqueueJob, every } from "../shared/jobs.js";
import { sendExamWindowReminders } from "../assessments/exams.js";
import { formatWhen } from "../shared/format.js";
import { notify } from "../notifications/service.js";
import { buildIcs } from "./ics.js";
import { meetingProviders, type MeetingProvider, type ProviderName } from "./providers.js";

const ADMIN_ROLES = ["admin", "super_admin"];
const MAX_RANGE_DAYS = 100;
const INTERVIEW_MINUTES = 60;

const eventSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    timezone: z.string().max(64).default("Asia/Kolkata"),
    attendeeIds: z.array(z.string().uuid()).max(200).default([]),
    provider: z.enum(["none", "manual", "google_meet", "zoom"]).default("none"),
    joinUrl: z.string().trim().url().max(2000).nullable().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "The meeting must end after it starts", path: ["endsAt"] })
  .refine((v) => new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <= 14 * 24 * 60 * 60 * 1000, { message: "A meeting can last at most 14 days", path: ["endsAt"] })
  .refine((v) => v.provider !== "manual" || !!v.joinUrl, { message: "Paste the meeting link", path: ["joinUrl"] });

const respondSchema = z.object({ response: z.enum(["accepted", "declined", "tentative"]) });

type EventRow = typeof calendarEvents.$inferSelect;
type Person = { id: string; name: string; email: string };

export async function people(db: Database, ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute<Person>(sql`
    SELECT u.id, u.email, coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
    FROM users u LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
    WHERE u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
  return new Map(rows.rows.map((r) => [r.id, r]));
}

async function loadAttendees(db: Database, eventIds: string[]) {
  if (eventIds.length === 0) return [];
  return db.select().from(calendarEventAttendees).where(inArray(calendarEventAttendees.eventId, eventIds));
}

/** The API shape of a meeting, with names resolved and the caller's RSVP. */
export async function present(db: Database, events: EventRow[], viewerId: string, viewerRole: string) {
  const attendees = await loadAttendees(db, events.map((e) => e.id));
  const who = await people(db, [...new Set([...attendees.map((a) => a.userId), ...events.map((e) => e.createdBy)])]);
  const courseIds = [...new Set(events.map((e) => e.courseId).filter((id): id is string => !!id))];
  const courseTitles = new Map(courseIds.length ? (await db.select({ id: courses.id, title: courses.title }).from(courses).where(inArray(courses.id, courseIds))).map((c) => [c.id, c.title]) : []);
  return events.map((e) => {
    const mine = attendees.filter((a) => a.eventId === e.id);
    const organizer = who.get(e.createdBy);
    return {
      id: e.id,
      kind: e.courseId ? ("class" as const) : ("meeting" as const),
      course: e.courseId ? { id: e.courseId, title: courseTitles.get(e.courseId) ?? "Course" } : null,
      seriesId: e.seriesId,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      provider: e.meetingProvider,
      joinUrl: e.joinUrl,
      cancelled: !!e.cancelledAt,
      organizer: organizer ? { id: organizer.id, name: organizer.name } : null,
      attendees: mine.map((a) => ({ id: a.userId, name: who.get(a.userId)?.name ?? "Someone", email: who.get(a.userId)?.email ?? "", response: a.response })),
      myResponse: mine.find((a) => a.userId === viewerId)?.response ?? null,
      canEdit: e.createdBy === viewerId || ADMIN_ROLES.includes(viewerRole),
    };
  });
}

export async function sendInvites(db: Database, event: EventRow, recipientIds: string[], mode: "new" | "updated" | "cancelled") {
  if (recipientIds.length === 0) return;
  const all = await loadAttendees(db, [event.id]);
  const who = await people(db, [...new Set([...all.map((a) => a.userId), event.createdBy, ...recipientIds])]);
  const organizer = who.get(event.createdBy)!;
  const ics = buildIcs({
    uid: `${event.id}@portal.inveontechnologies.in`,
    sequence: event.sequence,
    title: event.title,
    description: event.description,
    location: event.location,
    url: event.joinUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    organizer: { name: organizer.name, email: organizer.email },
    attendees: all.map((a) => who.get(a.userId)).filter((p): p is Person => !!p),
    cancelled: mode === "cancelled",
  });
  const when = formatWhen(event.startsAt, event.timezone);
  const subject = mode === "new" ? `Invitation: ${event.title}` : mode === "updated" ? `Updated: ${event.title}` : `Cancelled: ${event.title}`;
  const lines = [
    mode === "cancelled"
      ? `${organizer.name} cancelled this ${event.courseId ? "class" : "meeting"}.`
      : `${organizer.name} ${mode === "new" ? "invited you to" : "updated"} a ${event.courseId ? "live class" : "meeting"}.`,
    "",
    event.title,
    when,
    event.joinUrl && mode !== "cancelled" ? `Join: ${event.joinUrl}` : null,
    event.location ? `Where: ${event.location}` : null,
    event.description ? `\n${event.description}` : null,
  ].filter((l) => l !== null);
  for (const id of recipientIds) {
    const person = who.get(id);
    if (!person) continue;
    await enqueueJob(db, "email.send", { to: person.email, subject, text: lines.join("\n"), icalEvent: { method: mode === "cancelled" ? "CANCEL" : "REQUEST", content: ics } });
  }
}

async function findMeeting(db: Database, id: string) {
  const event = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, id) });
  if (!event) throw new NotFoundError("Meeting not found");
  return event;
}

async function assertCanView(db: Database, event: EventRow, user: { sub: string; role: string }) {
  if (event.createdBy === user.sub || ADMIN_ROLES.includes(user.role)) return;
  const invited = await db.query.calendarEventAttendees.findFirst({ where: and(eq(calendarEventAttendees.eventId, event.id), eq(calendarEventAttendees.userId, user.sub)) });
  if (!invited) throw new NotFoundError("Meeting not found");
}

function assertCanEdit(event: EventRow, user: { sub: string; role: string }) {
  if (event.createdBy !== user.sub && !ADMIN_ROLES.includes(user.role)) throw new ForbiddenError("Only the organiser can change this meeting");
}

async function validAttendees(db: Database, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db.query.users.findMany({ where: inArray(users.id, unique), columns: { id: true } });
  if (rows.length !== unique.length) throw new AppError("VALIDATION_ERROR", "One or more attendees don't exist", 400);
  return unique;
}

/**
 * Meeting reminders, 15 minutes before the start, to everyone who hasn't
 * declined. `remindedAt` is cleared when a meeting moves, so the new time
 * gets its own reminder.
 */
export async function sendMeetingReminders(db: Database, now = new Date()) {
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  const due = await db
    .select({ event: calendarEvents, userId: calendarEventAttendees.userId })
    .from(calendarEventAttendees)
    .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventAttendees.eventId))
    .where(
      and(
        isNull(calendarEvents.cancelledAt),
        gt(calendarEvents.startsAt, now),
        lte(calendarEvents.startsAt, soon),
        isNull(calendarEventAttendees.remindedAt),
        ne(calendarEventAttendees.response, "declined"),
      ),
    )
    .limit(1000);
  for (const { event, userId } of due) {
    const minutes = Math.max(1, Math.round((event.startsAt.getTime() - now.getTime()) / 60000));
    await notify(db, {
      userIds: [userId],
      kind: "meeting.starting",
      title: `Starting in ${minutes} min: ${event.title}`,
      body: event.joinUrl ? `Join here: ${event.joinUrl}` : `Starts ${formatWhen(event.startsAt, event.timezone)}.`,
      link: `/calendar?event=${event.id}`,
      dedupeKey: `meeting-reminder:${event.id}:${event.startsAt.getTime()}`,
    });
    await db
      .update(calendarEventAttendees)
      .set({ remindedAt: now })
      .where(and(eq(calendarEventAttendees.eventId, event.id), eq(calendarEventAttendees.userId, userId)));
  }
  return due.length;
}

export function registerCalendarSchedules(db: Database) {
  every("meeting-reminders", 60 * 1000, async () => {
    await sendMeetingReminders(db);
  });
  every("exam-window-reminders", 5 * 60 * 1000, async () => {
    await sendExamWindowReminders(db);
  });
}

export function calendarRouter(db: Database, env: Env, providers: Map<ProviderName, MeetingProvider> = meetingProviders(env)) {
  const router = Router();

  const provider = (name: ProviderName) => {
    const p = providers.get(name);
    if (!p || !p.configured) throw new AppError("PROVIDER_NOT_CONFIGURED", `${p?.label ?? name} isn't set up for this portal yet. Paste a link instead.`, 400);
    return p;
  };

  const staffOnly = (role: string) => {
    if (role === "candidate") throw new ForbiddenError("Candidates can't schedule meetings");
  };

  router.get("/providers", requireAuth(env), (_req, res) => {
    res.json({ providers: [...providers.values()].map((p) => ({ name: p.name, label: p.label, configured: p.configured })) });
  });

  // Colleagues to invite. Everyone except candidates can see the staff list.
  router.get("/people", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const rows = await db.execute<Person & { role: string }>(sql`
      SELECT u.id, u.email, u.role, coalesce(u.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
      FROM users u WHERE u.role <> 'candidate' ORDER BY name LIMIT 1000
    `);
    res.json({ people: rows.rows });
  });

  router.get("/events", requireAuth(env), async (req, res) => {
    const from = new Date(String(req.query.from ?? ""));
    const to = new Date(String(req.query.to ?? ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new AppError("VALIDATION_ERROR", "Pass `from` and `to` as ISO dates", 400);
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new AppError("VALIDATION_ERROR", `The range can be at most ${MAX_RANGE_DAYS} days`, 400);
    }
    const me = req.user!.sub;

    // Meetings I organise or was invited to that overlap the range.
    const meetingRows = await db
      .selectDistinct({ event: calendarEvents })
      .from(calendarEvents)
      .leftJoin(calendarEventAttendees, and(eq(calendarEventAttendees.eventId, calendarEvents.id), eq(calendarEventAttendees.userId, me)))
      .where(
        and(
          isNull(calendarEvents.cancelledAt),
          sql`${calendarEvents.startsAt} < ${to.toISOString()} AND ${calendarEvents.endsAt} > ${from.toISOString()}`,
          sql`(${calendarEvents.createdBy} = ${me} OR ${calendarEventAttendees.userId} IS NOT NULL)`,
        ),
      );
    const meetings = await present(db, meetingRows.map((r) => r.event), me, req.user!.role);

    // Interviews I'm running or attending, straight from recruitment.
    const interviewRows = await db.execute<{ id: string; scheduled_at: string; timezone: string; meeting_url: string | null; round_number: number; interviewer_id: string; candidate_id: string; title: string; subject: string | null; kind: "interview" | "exam" | "hr"; duration_minutes: number; application_id: string; opportunity_id: string }>(sql`
      SELECT ir.id, ir.scheduled_at, ir.timezone, ir.meeting_url, ir.round_number, ir.interviewer_id, ir.subject, ir.kind, ir.duration_minutes,
        a.user_id AS candidate_id, a.id AS application_id, o.id AS opportunity_id, o.title
      FROM interview_rounds ir
      JOIN applications a ON a.id = ir.application_id
      JOIN opportunities o ON o.id = a.opportunity_id
      WHERE ir.status IN ('scheduled', 'rescheduled')
        AND (ir.interviewer_id = ${me} OR a.user_id = ${me})
        AND ir.scheduled_at >= ${new Date(from.getTime() - 8 * 60 * 60000).toISOString()} AND ir.scheduled_at < ${to.toISOString()}
    `);
    const interviews = interviewRows.rows.map((r) => {
      const start = new Date(r.scheduled_at);
      const asInterviewer = r.interviewer_id === me;
      const what = r.subject ? `${r.subject}` : r.kind === "exam" ? "Exam" : r.kind === "hr" ? "HR round" : `Interview (round ${r.round_number})`;
      return {
        id: `interview:${r.id}`,
        kind: "interview" as const,
        title: asInterviewer ? `${what}: ${r.title}` : `Your ${r.subject ? `${r.subject} ` : ""}${r.kind === "exam" ? "exam" : "interview"}: ${r.title}`,
        startsAt: start,
        endsAt: new Date(start.getTime() + (r.duration_minutes || INTERVIEW_MINUTES) * 60000),
        timezone: r.timezone,
        joinUrl: r.meeting_url,
        link: asInterviewer ? `/opportunities/${r.opportunity_id}?applicant=${r.application_id}` : `/journey/${r.application_id}`,
      };
    }).filter((i) => i.endsAt > from);

    // My open tasks that fall due in the range.
    const taskRows = await db.execute<{ id: string; title: string; due_date: string; priority: string }>(sql`
      SELECT t.id, t.title, t.due_date, t.priority FROM tasks t
      WHERE t.assignee_id = ${me} AND t.status NOT IN ('done', 'cancelled')
        AND t.due_date >= ${from.toISOString()} AND t.due_date < ${to.toISOString()}
    `);
    const due = taskRows.rows.map((t) => ({
      id: `task:${t.id}`,
      kind: "task_due" as const,
      title: t.title,
      startsAt: new Date(t.due_date),
      endsAt: new Date(t.due_date),
      priority: t.priority,
      link: `/tasks/${t.id}`,
    }));

    // Exam windows: when an exam opens and closes. Candidates see the exams
    // they're invited to; HR and admins see every active exam's window.
    const staffView = ["hr", "admin", "super_admin"].includes(req.user!.role);
    const examRows = await db.execute<{ id: string; title: string; language: string | null; opens_at: string | null; closes_at: string | null; opportunity_id: string; opportunity: string; application_id: string | null }>(sql`
      SELECT DISTINCT ON (x.id) x.id, x.title, x.language, x.opens_at, x.closes_at, o.id AS opportunity_id, o.title AS opportunity, a.id AS application_id
      FROM assessments x
      JOIN opportunities o ON o.id = x.opportunity_id
      LEFT JOIN applications a ON a.opportunity_id = o.id AND a.user_id = ${me} AND a.status = 'assessment_invited'
      WHERE x.is_active = true
        AND (x.opens_at IS NOT NULL OR x.closes_at IS NOT NULL)
        AND (a.id IS NOT NULL OR ${staffView})
        AND ((x.opens_at >= ${from.toISOString()} AND x.opens_at < ${to.toISOString()})
          OR (x.closes_at >= ${from.toISOString()} AND x.closes_at < ${to.toISOString()}))
      ORDER BY x.id, a.id
    `);
    const exams = examRows.rows.flatMap((x) => {
      const name = x.language ? `${x.language} exam` : x.title;
      const link = x.application_id ? `/assessments/${x.application_id}` : `/opportunities/${x.opportunity_id}`;
      const marks: { at: string; edge: "opens" | "closes" }[] = [];
      if (x.opens_at) marks.push({ at: x.opens_at, edge: "opens" });
      if (x.closes_at) marks.push({ at: x.closes_at, edge: "closes" });
      return marks
        .filter((m) => new Date(m.at) >= from && new Date(m.at) < to)
        .map((m) => ({
          id: `exam:${x.id}:${m.edge}`,
          kind: "exam" as const,
          edge: m.edge,
          title: `${name} ${m.edge}: ${x.opportunity}`,
          startsAt: new Date(m.at),
          endsAt: new Date(m.at),
          link,
        }));
    });

    const events = [...meetings, ...interviews, ...due, ...exams].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    res.json({ events });
  });

  router.get("/events/:id", requireAuth(env), async (req, res) => {
    const event = await findMeeting(db, req.params.id);
    await assertCanView(db, event, req.user!);
    const [shaped] = await present(db, [event], req.user!.sub, req.user!.role);
    res.json({ event: shaped });
  });

  router.get("/events/:id/ics", requireAuth(env), async (req, res) => {
    const event = await findMeeting(db, req.params.id);
    await assertCanView(db, event, req.user!);
    const all = await loadAttendees(db, [event.id]);
    const who = await people(db, [...new Set([...all.map((a) => a.userId), event.createdBy])]);
    const organizer = who.get(event.createdBy)!;
    const ics = buildIcs({
      uid: `${event.id}@portal.inveontechnologies.in`,
      sequence: event.sequence,
      title: event.title,
      description: event.description,
      location: event.location,
      url: event.joinUrl,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      organizer: { name: organizer.name, email: organizer.email },
      attendees: all.map((a) => who.get(a.userId)).filter((p): p is Person => !!p),
      cancelled: !!event.cancelledAt,
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="meeting.ics"`);
    res.send(ics);
  });

  router.post("/events", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const body = eventSchema.parse(req.body);
    const me = req.user!.sub;
    const attendeeIds = (await validAttendees(db, body.attendeeIds)).filter((id) => id !== me);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);

    let joinUrl: string | null = body.provider === "manual" ? body.joinUrl! : null;
    let externalId: string | null = null;
    if (body.provider === "google_meet" || body.provider === "zoom") {
      const emails = (await people(db, [me, ...attendeeIds])).values();
      const created = await provider(body.provider).create({ title: body.title, description: body.description, startsAt, endsAt, timezone: body.timezone, attendeeEmails: [...emails].map((p) => p.email) });
      joinUrl = created.joinUrl;
      externalId = created.externalId;
    }

    const event = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(calendarEvents)
        .values({ title: body.title, description: body.description ?? null, location: body.location ?? null, startsAt, endsAt, timezone: body.timezone, meetingProvider: body.provider, joinUrl, externalId, createdBy: me })
        .returning();
      await tx.insert(calendarEventAttendees).values([
        { eventId: created.id, userId: me, response: "accepted" as const },
        ...attendeeIds.map((userId) => ({ eventId: created.id, userId })),
      ]);
      return created;
    });

    await writeAuditLog(db, { actorUserId: me, action: "calendar.create", entityType: "calendar_event", entityId: event.id, ipAddress: req.ip });
    await notify(db, {
      userIds: attendeeIds,
      actorUserId: me,
      kind: "meeting.invited",
      title: `Meeting invite: ${event.title}`,
      body: `${formatWhen(event.startsAt, event.timezone)}${event.joinUrl ? " · online" : ""}`,
      link: `/calendar?event=${event.id}`,
    });
    await sendInvites(db, event, [me, ...attendeeIds], "new");
    const [shaped] = await present(db, [event], me, req.user!.role);
    res.status(201).json({ event: shaped });
  });

  router.put("/events/:id", requireAuth(env), async (req, res) => {
    const existing = await findMeeting(db, req.params.id);
    assertCanEdit(existing, req.user!);
    if (existing.cancelledAt) throw new AppError("INVALID_STATE", "This meeting was cancelled", 400);
    const body = eventSchema.parse(req.body);
    const me = req.user!.sub;
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const attendeeIds = (await validAttendees(db, body.attendeeIds)).filter((id) => id !== existing.createdBy);

    let joinUrl = existing.joinUrl;
    let externalId = existing.externalId;
    const input = async () => ({ title: body.title, description: body.description, startsAt, endsAt, timezone: body.timezone, attendeeEmails: [...(await people(db, [existing.createdBy, ...attendeeIds])).values()].map((p) => p.email) });
    if (body.provider !== existing.meetingProvider) {
      // Switching provider: drop the old meeting, make a new one.
      if (existing.externalId) await providers.get(existing.meetingProvider)?.cancel?.(existing.externalId).catch(() => undefined);
      externalId = null;
      joinUrl = body.provider === "manual" ? body.joinUrl! : null;
      if (body.provider === "google_meet" || body.provider === "zoom") {
        const created = await provider(body.provider).create(await input());
        joinUrl = created.joinUrl;
        externalId = created.externalId;
      }
    } else if (body.provider === "manual") {
      joinUrl = body.joinUrl!;
    } else if (externalId) {
      await provider(body.provider).update?.(externalId, await input());
    }

    const moved = startsAt.getTime() !== existing.startsAt.getTime();
    const before = await loadAttendees(db, [existing.id]);
    const beforeIds = new Set(before.map((a) => a.userId));
    const keep = new Set([existing.createdBy, ...attendeeIds]);
    const removed = before.filter((a) => !keep.has(a.userId)).map((a) => a.userId);
    const added = attendeeIds.filter((id) => !beforeIds.has(id));

    const event = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(calendarEvents)
        .set({ title: body.title, description: body.description ?? null, location: body.location ?? null, startsAt, endsAt, timezone: body.timezone, meetingProvider: body.provider, joinUrl, externalId, sequence: existing.sequence + 1, updatedAt: new Date() })
        .where(eq(calendarEvents.id, existing.id))
        .returning();
      if (removed.length) await tx.delete(calendarEventAttendees).where(and(eq(calendarEventAttendees.eventId, existing.id), inArray(calendarEventAttendees.userId, removed)));
      if (added.length) await tx.insert(calendarEventAttendees).values(added.map((userId) => ({ eventId: existing.id, userId })));
      if (moved) {
        // A new time needs a fresh answer and a fresh reminder.
        await tx.update(calendarEventAttendees).set({ remindedAt: null }).where(eq(calendarEventAttendees.eventId, existing.id));
        await tx
          .update(calendarEventAttendees)
          .set({ response: "needs_action" })
          .where(and(eq(calendarEventAttendees.eventId, existing.id), ne(calendarEventAttendees.userId, existing.createdBy)));
      }
      return updated;
    });

    await writeAuditLog(db, { actorUserId: me, action: "calendar.update", entityType: "calendar_event", entityId: event.id, ipAddress: req.ip });
    const stayed = attendeeIds.filter((id) => beforeIds.has(id));
    if (added.length) await notify(db, { userIds: added, actorUserId: me, kind: "meeting.invited", title: `Meeting invite: ${event.title}`, body: formatWhen(event.startsAt, event.timezone), link: `/calendar?event=${event.id}` });
    if (stayed.length) {
      await notify(db, {
        userIds: stayed,
        actorUserId: me,
        kind: "meeting.updated",
        title: moved ? `Meeting moved: ${event.title}` : `Meeting updated: ${event.title}`,
        body: moved ? `Now ${formatWhen(event.startsAt, event.timezone)}.` : "Details changed. Open it to see what's new.",
        link: `/calendar?event=${event.id}`,
      });
    }
    await sendInvites(db, event, [existing.createdBy, ...stayed], "updated");
    await sendInvites(db, event, added, "new");
    if (removed.length) {
      await notify(db, { userIds: removed, actorUserId: me, kind: "meeting.cancelled", title: `Removed from: ${event.title}`, body: "You're no longer invited to this meeting.", link: "/calendar" });
      await sendInvites(db, { ...event, cancelledAt: new Date() }, removed, "cancelled");
    }
    const [shaped] = await present(db, [event], me, req.user!.role);
    res.json({ event: shaped });
  });

  router.post("/events/:id/cancel", requireAuth(env), async (req, res) => {
    const existing = await findMeeting(db, req.params.id);
    assertCanEdit(existing, req.user!);
    if (existing.cancelledAt) return res.json({ ok: true });
    if (existing.externalId) await providers.get(existing.meetingProvider)?.cancel?.(existing.externalId).catch(() => undefined);
    const [event] = await db
      .update(calendarEvents)
      .set({ cancelledAt: new Date(), sequence: existing.sequence + 1, updatedAt: new Date() })
      .where(eq(calendarEvents.id, existing.id))
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "calendar.cancel", entityType: "calendar_event", entityId: event.id, ipAddress: req.ip });
    const everyone = (await loadAttendees(db, [event.id])).map((a) => a.userId);
    await notify(db, { userIds: everyone, actorUserId: req.user!.sub, kind: "meeting.cancelled", title: `Cancelled: ${event.title}`, body: `The meeting on ${formatWhen(event.startsAt, event.timezone)} won't take place.`, link: "/calendar" });
    await sendInvites(db, event, everyone, "cancelled");
    res.json({ ok: true });
  });

  router.post("/events/:id/respond", requireAuth(env), async (req, res) => {
    const { response } = respondSchema.parse(req.body);
    const event = await findMeeting(db, req.params.id);
    const [row] = await db
      .update(calendarEventAttendees)
      .set({ response })
      .where(and(eq(calendarEventAttendees.eventId, event.id), eq(calendarEventAttendees.userId, req.user!.sub)))
      .returning();
    if (!row) throw new NotFoundError("You're not invited to this meeting");
    if (response !== "accepted" && event.createdBy !== req.user!.sub) {
      const name = (await people(db, [req.user!.sub])).get(req.user!.sub)?.name ?? "Someone";
      await notify(db, {
        userIds: [event.createdBy],
        actorUserId: req.user!.sub,
        kind: "meeting.response",
        title: `${name} ${response === "declined" ? "can't make" : "might make"} ${event.title}`,
        link: `/calendar?event=${event.id}`,
        dedupeKey: `meeting-response:${event.id}:${req.user!.sub}:${response}:${event.sequence}`,
      });
    }
    res.json({ response: row.response });
  });

  return router;
}
