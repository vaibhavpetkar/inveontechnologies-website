import { sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { enqueueJob, every } from "../shared/jobs.js";
import { todayIst } from "../attendance/service.js";
import { portalUrl } from "./service.js";

/** The digest goes out from this hour (IST) onward, once per person per day. */
export const DIGEST_HOUR_IST = 8;
const BATCH = 200;
const IST_OFFSET_MS = 330 * 60_000;

type Row = { title: string; at: string; is_class?: boolean; mine?: boolean };
export interface Digest {
  unread: { total: number; titles: string[] };
  today: { time: string; label: string }[];
  overdueTasks: number;
  leaveWaiting: number;
}

const timeIst = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(d);
const dayIst = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(d);

/** What one person has on today, plus what's piled up. Exported for tests. */
export async function buildDigest(db: Database, user: { id: string; role: string }, now = new Date()): Promise<Digest> {
  const today = todayIst(now);
  const from = new Date(`${today}T00:00:00+05:30`).toISOString();
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();
  const since = new Date(now.getTime() - 86_400_000).toISOString();

  const unread = await db.execute<{ title: string; total: number }>(sql`
    SELECT title, count(*) OVER ()::int AS total FROM notifications
    WHERE user_id = ${user.id} AND read_at IS NULL AND created_at > ${since}
    ORDER BY created_at DESC LIMIT 5
  `);

  const items: { at: Date; label: string }[] = [];
  const add = (rows: Row[], label: (r: Row) => string) => rows.forEach((r) => items.push({ at: new Date(r.at), label: label(r) }));

  add((await db.execute<Row>(sql`
    SELECT DISTINCT e.id, e.title, e.starts_at AS at, e.course_id IS NOT NULL AS is_class FROM calendar_events e
    LEFT JOIN calendar_event_attendees a ON a.event_id = e.id AND a.user_id = ${user.id}
    WHERE e.cancelled_at IS NULL AND e.starts_at >= ${from} AND e.starts_at < ${to}
      AND (e.created_by = ${user.id} OR (a.user_id IS NOT NULL AND a.response <> 'declined'))
  `)).rows, (r) => `${r.is_class ? "Live class" : "Meeting"}: ${r.title}`);

  add((await db.execute<Row>(sql`
    SELECT o.title, ir.scheduled_at AS at, ir.interviewer_id = ${user.id} AS mine FROM interview_rounds ir
    JOIN applications ap ON ap.id = ir.application_id
    JOIN opportunities o ON o.id = ap.opportunity_id
    WHERE ir.status IN ('scheduled', 'rescheduled') AND (ir.interviewer_id = ${user.id} OR ap.user_id = ${user.id})
      AND ir.scheduled_at >= ${from} AND ir.scheduled_at < ${to}
  `)).rows, (r) => (r.mine ? `Interview for ${r.title}` : `Your interview for ${r.title}`));

  add((await db.execute<Row>(sql`
    SELECT title, due_date AS at FROM tasks
    WHERE assignee_id = ${user.id} AND status NOT IN ('done', 'cancelled') AND due_date >= ${from} AND due_date < ${to}
  `)).rows, (r) => `Task due: ${r.title}`);

  add((await db.execute<Row>(sql`
    SELECT DISTINCT coalesce(x.language || ' exam', x.title) AS title, x.closes_at AS at FROM assessments x
    JOIN applications ap ON ap.opportunity_id = x.opportunity_id AND ap.user_id = ${user.id} AND ap.status = 'assessment_invited'
    WHERE x.is_active = true AND x.closes_at >= ${now.toISOString()} AND x.closes_at < ${to}
  `)).rows, (r) => `Your ${r.title} closes`);

  const overdue = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM tasks
    WHERE assignee_id = ${user.id} AND status NOT IN ('done', 'cancelled') AND due_date < ${now.toISOString()}
  `);

  let leaveWaiting = 0;
  const hr = ["hr", "admin", "super_admin"].includes(user.role);
  if (hr || user.role === "manager") {
    const r = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
      WHERE lr.status = 'pending' AND e.user_id <> ${user.id} AND (${hr} OR e.manager_id = ${user.id})
    `);
    leaveWaiting = r.rows[0]?.n ?? 0;
  }

  return {
    unread: { total: unread.rows[0]?.total ?? 0, titles: unread.rows.map((r) => r.title) },
    today: items.sort((a, b) => a.at.getTime() - b.at.getTime()).map((i) => ({ time: timeIst(i.at), label: i.label })),
    overdueTasks: overdue.rows[0]?.n ?? 0,
    leaveWaiting,
  };
}

export const isEmpty = (d: Digest) => d.unread.total === 0 && d.today.length === 0 && d.overdueTasks === 0 && d.leaveWaiting === 0;

/** Plain-text email for a digest. */
export function digestEmail(d: Digest, name: string | null, now = new Date()) {
  const url = portalUrl();
  const lines: string[] = [`Good morning${name ? ` ${name.split(" ")[0]}` : ""}, here's your ${dayIst(now)}.`];
  if (d.today.length) {
    lines.push("", "Today", ...d.today.map((t) => `  ${t.time}  ${t.label}`));
  }
  const waiting: string[] = [];
  if (d.overdueTasks) waiting.push(`  ${d.overdueTasks} overdue task${d.overdueTasks === 1 ? "" : "s"}${url ? `: ${url}/tasks` : ""}`);
  if (d.leaveWaiting) waiting.push(`  ${d.leaveWaiting} leave request${d.leaveWaiting === 1 ? "" : "s"} to decide${url ? `: ${url}/attendance?tab=requests` : ""}`);
  if (waiting.length) lines.push("", "Waiting on you", ...waiting);
  if (d.unread.total) {
    lines.push("", `${d.unread.total} unread notification${d.unread.total === 1 ? "" : "s"} since yesterday`, ...d.unread.titles.map((t) => `  - ${t}`));
    if (d.unread.total > d.unread.titles.length) lines.push(`  and ${d.unread.total - d.unread.titles.length} more`);
  }
  if (url) lines.push("", `Open the portal: ${url}`);
  lines.push("", "You can turn this summary off from the notifications menu in the portal.");

  const count = d.today.length;
  const subject = count ? `Your day: ${count} thing${count === 1 ? "" : "s"} on today` : "Your morning summary";
  return { subject, text: lines.join("\n") };
}

/**
 * Sends today's digest to everyone who hasn't had one yet, from 8 AM IST.
 * People with email or the digest turned off are skipped, and so is anyone
 * with nothing to report. Claiming the digest_sends row first means a
 * second backend process never sends the same person a second copy.
 */
export async function sendDailyDigests(db: Database, now = new Date()) {
  const istHour = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  if (istHour < DIGEST_HOUR_IST) return { sent: 0, skipped: 0 };
  const today = todayIst(now);

  const people = await db.execute<{ id: string; email: string; role: string; name: string | null }>(sql`
    SELECT u.id, u.email, u.role, coalesce(u.full_name, cp.full_name) AS name FROM users u
    LEFT JOIN notification_preferences p ON p.user_id = u.id
    LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
    WHERE coalesce(p.email_enabled, true) AND coalesce(p.digest_enabled, true)
      AND NOT EXISTS (SELECT 1 FROM digest_sends d WHERE d.user_id = u.id AND d.sent_on = ${today})
    LIMIT ${BATCH}
  `);

  let sent = 0;
  let skipped = 0;
  for (const person of people.rows) {
    const claimed = await db.execute(sql`
      INSERT INTO digest_sends (user_id, sent_on) VALUES (${person.id}, ${today}) ON CONFLICT DO NOTHING RETURNING user_id
    `);
    if (claimed.rows.length === 0) continue;
    const digest = await buildDigest(db, person, now);
    if (isEmpty(digest)) {
      skipped++;
      continue;
    }
    const { subject, text } = digestEmail(digest, person.name, now);
    await enqueueJob(db, "email.send", { to: person.email, subject, text, kind: "digest" });
    sent++;
  }
  return { sent, skipped };
}

export function registerDigestSchedule(db: Database) {
  every("daily-digest", 10 * 60 * 1000, async () => {
    // Keep going in batches until everyone due today is done.
    for (let i = 0; i < 50; i++) {
      const { sent, skipped } = await sendDailyDigests(db);
      if (sent + skipped === 0) break;
    }
  });
}
