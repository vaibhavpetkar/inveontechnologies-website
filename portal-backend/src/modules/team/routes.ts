import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { ForbiddenError } from "../shared/errors.js";
import type { Env } from "../shared/env.js";

/**
 * The team board: for everyone on staff, whether they're in a meeting, on
 * leave or free right now, when they're next free today, and what they're
 * working on; plus the week's meetings with who's in each. Working hours are
 * 10:00 to 19:00 IST, the portal's default.
 */
const IST_OFFSET_MIN = 330;
const DAY_START_HOUR = 10;
const DAY_END_HOUR = 19;
const RECRUITMENT_ROLES = ["hr", "admin", "super_admin"];

interface Busy {
  start: Date;
  end: Date;
  title: string;
}

/** Midnight IST of the IST calendar day that `at` falls on, as a UTC Date. */
export function istDayStart(at: Date) {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_OFFSET_MIN * 60000);
}

/**
 * Free stretches of at least 15 minutes inside working hours on the given
 * IST day, from `from` onwards, given someone's busy blocks.
 */
export function freeSlots(dayStart: Date, busy: Busy[], from: Date) {
  const open = new Date(dayStart.getTime() + DAY_START_HOUR * 3600000);
  const close = new Date(dayStart.getTime() + DAY_END_HOUR * 3600000);
  let cursor = new Date(Math.max(open.getTime(), from.getTime()));
  const slots: { start: Date; end: Date }[] = [];
  const sorted = busy.filter((b) => b.end > cursor && b.start < close).sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const b of sorted) {
    if (b.start > cursor && b.start.getTime() - cursor.getTime() >= 15 * 60000) slots.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (close.getTime() - cursor.getTime() >= 15 * 60000) slots.push({ start: cursor, end: close });
  return slots;
}

type PersonRow = { id: string; name: string; email: string; role: string; designation: string | null; last_seen_at: string | null };
type MeetingRow = { id: string; title: string; starts_at: string; ends_at: string; join_url: string | null; created_by: string; course_id: string | null; attendees: { id: string; response: string }[] };
type InterviewRow = { id: string; scheduled_at: string; duration_minutes: number; interviewer_id: string; kind: string; subject: string | null; opportunity: string };
type TaskRow = { id: string; title: string; assignee_id: string; status: string; progress_percent: number; started_at: string | null; expected_finish_at: string | null; due_date: string | null; project_id: string | null; project: string | null };
type LeaveRow = { user_id: string; leave_type: string; half_day: boolean; end_date: string };

export function teamRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/board", requireAuth(env), async (req, res) => {
    if (req.user!.role === "candidate") throw new ForbiddenError("The team board is for staff");
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(14).default(7) }).parse(req.query);
    const now = new Date();
    const today = istDayStart(now);
    const until = new Date(today.getTime() + days * 86400000);
    const todayIso = new Date(today.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
    const me = req.user!.sub;
    const seesInterviewDetail = RECRUITMENT_ROLES.includes(req.user!.role);

    const [peopleRows, meetingRows, interviewRows, taskRows, leaveRows] = await Promise.all([
      db.execute<PersonRow>(sql`
        SELECT u.id, u.email, u.role, u.last_seen_at, d.title AS designation,
          coalesce(u.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
        FROM users u
        LEFT JOIN employees e ON e.user_id = u.id
        LEFT JOIN designations d ON d.id = e.designation_id
        WHERE u.role <> 'candidate' AND (e.id IS NULL OR e.status <> 'offboarded')
        ORDER BY name LIMIT 1000
      `),
      db.execute<MeetingRow>(sql`
        SELECT ce.id, ce.title, ce.starts_at, ce.ends_at, ce.join_url, ce.created_by, ce.course_id,
          coalesce(json_agg(json_build_object('id', a.user_id, 'response', a.response)) FILTER (WHERE a.user_id IS NOT NULL), '[]') AS attendees
        FROM calendar_events ce
        LEFT JOIN calendar_event_attendees a ON a.event_id = ce.id
        WHERE ce.cancelled_at IS NULL AND ce.starts_at < ${until.toISOString()} AND ce.ends_at > ${today.toISOString()}
        GROUP BY ce.id
        ORDER BY ce.starts_at
        LIMIT 2000
      `),
      db.execute<InterviewRow>(sql`
        SELECT ir.id, ir.scheduled_at, ir.duration_minutes, ir.interviewer_id, ir.kind, ir.subject, o.title AS opportunity
        FROM interview_rounds ir
        JOIN applications a ON a.id = ir.application_id
        JOIN opportunities o ON o.id = a.opportunity_id
        WHERE ir.status IN ('scheduled', 'rescheduled') AND ir.scheduled_at < ${until.toISOString()}
          AND ir.scheduled_at + (ir.duration_minutes || ' minutes')::interval > ${today.toISOString()}
      `),
      db.execute<TaskRow>(sql`
        SELECT t.id, t.title, t.assignee_id, t.status, t.progress_percent, t.started_at, t.expected_finish_at, t.due_date, t.project_id, p.title AS project
        FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.assignee_id IS NOT NULL AND t.status IN ('in_progress', 'changes_requested', 'in_review')
        ORDER BY t.updated_at DESC
      `),
      db.execute<LeaveRow>(sql`
        SELECT e.user_id, l.leave_type, l.half_day, l.end_date FROM leave_requests l JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'approved' AND l.start_date <= ${todayIso} AND l.end_date >= ${todayIso}
      `),
    ]);

    const names = new Map(peopleRows.rows.map((p) => [p.id, p.name]));
    const busyBy = new Map<string, Busy[]>();
    const addBusy = (userId: string, b: Busy) => busyBy.set(userId, [...(busyBy.get(userId) ?? []), b]);

    const meetings = meetingRows.rows.map((m) => {
      const start = new Date(m.starts_at);
      const end = new Date(m.ends_at);
      const going = m.attendees.filter((a) => a.response !== "declined");
      for (const a of going) addBusy(a.id, { start, end, title: m.title });
      const invited = m.attendees.some((a) => a.id === me) || m.created_by === me;
      return {
        id: m.id,
        kind: (m.course_id ? "class" : "meeting") as "class" | "meeting" | "interview",
        title: m.title,
        startsAt: start,
        endsAt: end,
        organizer: { id: m.created_by, name: names.get(m.created_by) ?? "Someone" },
        participants: m.attendees.map((a) => ({ id: a.id, name: names.get(a.id) ?? "A candidate", response: a.response })),
        // Only the people in it get the link.
        joinUrl: invited || ["admin", "super_admin"].includes(req.user!.role) ? m.join_url : null,
        mine: invited,
      };
    });
    for (const r of interviewRows.rows) {
      const start = new Date(r.scheduled_at);
      const end = new Date(start.getTime() + r.duration_minutes * 60000);
      const what = r.kind === "exam" ? "Exam" : r.kind === "hr" ? "HR round" : "Interview";
      const title = seesInterviewDetail || r.interviewer_id === me ? `${what}${r.subject ? `: ${r.subject}` : ""} (${r.opportunity})` : what;
      addBusy(r.interviewer_id, { start, end, title });
      meetings.push({
        id: `interview:${r.id}`,
        kind: "interview" as const,
        title,
        startsAt: start,
        endsAt: end,
        organizer: { id: r.interviewer_id, name: names.get(r.interviewer_id) ?? "Someone" },
        participants: [{ id: r.interviewer_id, name: names.get(r.interviewer_id) ?? "Someone", response: "accepted" }],
        joinUrl: null,
        mine: r.interviewer_id === me,
      });
    }
    meetings.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    const leaveBy = new Map(leaveRows.rows.map((l) => [l.user_id, l]));
    const people = peopleRows.rows.map((p) => {
      const busy = (busyBy.get(p.id) ?? []).sort((a, b) => a.start.getTime() - b.start.getTime());
      const current = busy.find((b) => b.start <= now && b.end > now) ?? null;
      const next = busy.find((b) => b.start > now) ?? null;
      const leave = leaveBy.get(p.id);
      const todayBusy = busy.filter((b) => b.start < new Date(today.getTime() + 86400000));
      const slots = leave && !leave.half_day ? [] : freeSlots(today, todayBusy, now);
      const working = taskRows.rows.filter((t) => t.assignee_id === p.id);
      const online = !!p.last_seen_at && now.getTime() - new Date(p.last_seen_at).getTime() < 5 * 60000;
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        designation: p.designation,
        online,
        lastSeenAt: p.last_seen_at,
        status: leave && !leave.half_day ? ("on_leave" as const) : current ? ("in_meeting" as const) : ("free" as const),
        leave: leave ? { type: leave.leave_type, halfDay: leave.half_day, until: leave.end_date } : null,
        currentMeeting: current ? { title: current.title, endsAt: current.end } : null,
        nextMeeting: next ? { title: next.title, startsAt: next.start, endsAt: next.end } : null,
        freeToday: slots.map((s) => ({ start: s.start, end: s.end })),
        meetingsToday: todayBusy.length,
        working: working
          .filter((t) => t.status === "in_progress")
          .map((t) => ({ id: t.id, title: t.title, project: t.project_id ? { id: t.project_id, title: t.project } : null, progress: t.progress_percent, startedAt: t.started_at, expectedFinishAt: t.expected_finish_at, dueDate: t.due_date })),
        waiting: working.filter((t) => t.status !== "in_progress").map((t) => ({ id: t.id, title: t.title, status: t.status })),
      };
    });

    res.json({ now, dayStart: today, people, meetings: meetings.map((m) => ({ ...m, startsAt: m.startsAt.toISOString(), endsAt: m.endsAt.toISOString() })) });
  });

  return router;
}
