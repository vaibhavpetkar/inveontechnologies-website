import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { designations, employees, tasks, users } from "../shared/db/schema.js";

/**
 * Performance from approved tasks. Each task approved in the month earns
 * points = hours x (stars / 5) x 10, with a 10% bonus when it was finished
 * by its due date and 15% less when it was late. Hours are the time logged
 * on the task, else its estimate, else 1. A task approved without a rating
 * counts as 3 stars.
 */
export const RANKED_ROLES = ["intern", "employee", "manager"] as const;
const UNRATED_STARS = 3;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface PersonScore {
  userId: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  score: number;
  tasksDone: number;
  hours: number;
  avgRating: number | null;
  ratedTasks: number;
  onTimePercent: number | null;
  rank: number;
}

/** "2026-10" for the month (in India time) containing `at`. */
export function monthOf(at = new Date()) {
  const d = new Date(at.getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month's start and end as instants: midnight India time on the 1st. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS), end: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS) };
}

export const monthLabel = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

type TaskRow = typeof tasks.$inferSelect;

export function taskHours(t: Pick<TaskRow, "actualHours" | "estimateHours">) {
  const actual = Number(t.actualHours ?? 0);
  if (actual > 0) return actual;
  const estimate = Number(t.estimateHours ?? 0);
  return estimate > 0 ? estimate : 1;
}

export function taskPoints(t: Pick<TaskRow, "actualHours" | "estimateHours" | "rating" | "dueDate" | "completedAt" | "updatedAt">) {
  const stars = t.rating ?? UNRATED_STARS;
  const done = t.completedAt ?? t.updatedAt;
  const punctuality = !t.dueDate ? 1 : done <= t.dueDate ? 1.1 : 0.85;
  return taskHours(t) * (stars / 5) * 10 * punctuality;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Everyone's score for a month, best first, with ranks (ties share a rank). */
export async function leaderboard(db: Database, month: string): Promise<PersonScore[]> {
  const { start, end } = monthRange(month);
  const finishedAt = sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt})`;
  const done = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "done"), isNotNull(tasks.assigneeId), gte(finishedAt, start), lt(finishedAt, end)));

  const people = await db.query.users.findMany({
    where: inArray(users.role, [...RANKED_ROLES]),
    columns: { id: true, email: true, role: true, fullName: true },
  });
  const extra = [...new Set(done.map((t) => t.assigneeId!))].filter((id) => !people.some((p) => p.id === id));
  if (extra.length) {
    const more = await db.query.users.findMany({ where: inArray(users.id, extra), columns: { id: true, email: true, role: true, fullName: true } });
    people.push(...more.filter((p) => p.role !== "candidate"));
  }
  if (!people.length) return [];

  const names = await db.execute<{ id: string; name: string }>(sql`
    SELECT u.id, coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
    FROM users u LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
    WHERE u.id IN (${sql.join(people.map((p) => sql`${p.id}`), sql`, `)})
  `);
  const nameById = new Map(names.rows.map((r) => [r.id, r.name]));
  const staff = await db
    .select({ userId: employees.userId, designation: designations.title })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(inArray(employees.userId, people.map((p) => p.id)));
  const designationById = new Map(staff.map((s) => [s.userId, s.designation]));

  const rows = people.map((p) => {
    const mine = done.filter((t) => t.assigneeId === p.id);
    const rated = mine.filter((t) => t.rating);
    const ratedHours = rated.reduce((n, t) => n + taskHours(t), 0);
    const withDue = mine.filter((t) => t.dueDate);
    const onTime = withDue.filter((t) => (t.completedAt ?? t.updatedAt) <= t.dueDate!);
    return {
      userId: p.id,
      name: nameById.get(p.id) ?? p.email,
      email: p.email,
      role: p.role,
      designation: designationById.get(p.id) ?? null,
      score: round1(mine.reduce((n, t) => n + taskPoints(t), 0)),
      tasksDone: mine.length,
      hours: round1(mine.reduce((n, t) => n + taskHours(t), 0)),
      avgRating: rated.length ? round1(rated.reduce((n, t) => n + t.rating! * taskHours(t), 0) / ratedHours) : null,
      ratedTasks: rated.length,
      onTimePercent: withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null,
      rank: 0,
    };
  });
  rows.sort((a, b) => b.score - a.score || (b.avgRating ?? 0) - (a.avgRating ?? 0) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
