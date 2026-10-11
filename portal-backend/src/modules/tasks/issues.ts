import { and, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../shared/db/client.js";
import { projects, taskEvents, taskWatchers, tasks } from "../shared/db/schema.js";
import { AppError } from "../shared/errors.js";

/**
 * Jira-style issue keys, labels, watchers, change history and search.
 * A project's key ("INV") and a task's number make its key: INV-42.
 */

export const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
// Keys made from existing titles may start with a digit, so lookups are lenient.
export const ISSUE_KEY_RE = /^([A-Z0-9]{2,10})-(\d{1,9})$/;
export const ISSUE_TYPES = ["epic", "story", "task", "bug"] as const;

export const projectKeySchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => PROJECT_KEY_RE.test(v), "Use 2-10 letters or digits, starting with a letter (e.g. INV)");

export const labelsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(30).regex(/^[\p{L}\p{N} _.-]+$/u, "Labels can use letters, digits, spaces, - _ ."))
  .max(10)
  .transform((l) => [...new Set(l.map((x) => x.replace(/\s+/g, "-")))]);

/** "Inveon Portal" -> "IP", "Website" -> "WEB"; a digit is added while the key is taken. */
export async function suggestProjectKey(db: Database, title: string): Promise<string> {
  const words = title.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  let base = words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 4) : (words[0] ?? "PRJ").slice(0, 3);
  if (!/^[A-Z]/.test(base)) base = `P${base}`.slice(0, 4);
  if (base.length < 2) base = `${base}P`;
  for (let n = 1; n < 1000; n++) {
    const key = n === 1 ? base : `${base}${n}`;
    if (!(await db.query.projects.findFirst({ where: eq(projects.key, key), columns: { id: true } }))) return key;
  }
  throw new AppError("KEY_TAKEN", "Couldn't find a free project key; please choose one", 409);
}

export async function assertKeyFree(db: Database, key: string, exceptProjectId?: string) {
  const taken = await db.query.projects.findFirst({ where: eq(projects.key, key), columns: { id: true } });
  if (taken && taken.id !== exceptProjectId) throw new AppError("KEY_TAKEN", `The key ${key} is already used by another project`, 409);
}

/** Finds a task by its id or by its key (INV-42). */
export async function findTaskByRef(db: Database, ref: string) {
  const m = ref.toUpperCase().match(ISSUE_KEY_RE);
  if (m) {
    const project = await db.query.projects.findFirst({ where: eq(projects.key, m[1]), columns: { id: true } });
    if (!project) return undefined;
    return db.query.tasks.findFirst({ where: and(eq(tasks.projectId, project.id), eq(tasks.number, Number(m[2]))) });
  }
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return undefined;
  return db.query.tasks.findFirst({ where: eq(tasks.id, ref) });
}

export async function addWatchers(db: Pick<Database, "insert">, taskId: string, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length) await db.insert(taskWatchers).values(ids.map((userId) => ({ taskId, userId }))).onConflictDoNothing();
}

export async function watcherIds(db: Database, taskId: string): Promise<string[]> {
  return (await db.query.taskWatchers.findMany({ where: eq(taskWatchers.taskId, taskId), columns: { userId: true } })).map((w) => w.userId);
}

type TaskRow = typeof tasks.$inferSelect;
const TRACKED: { field: keyof TaskRow; label: string }[] = [
  { field: "title", label: "title" },
  { field: "description", label: "description" },
  { field: "type", label: "type" },
  { field: "priority", label: "priority" },
  { field: "assigneeId", label: "assignee" },
  { field: "dueDate", label: "due date" },
  { field: "estimateHours", label: "estimate" },
  { field: "milestoneId", label: "phase" },
  { field: "labels", label: "labels" },
  { field: "parentTaskId", label: "parent" },
];

function asText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return String(v);
}

/**
 * One "field_change" event per changed field, so the task's history shows
 * who changed what and when. People and phases are stored by name, so the
 * history still reads right after someone is renamed or a phase deleted.
 */
export async function recordChanges(
  db: Database,
  before: TaskRow,
  after: TaskRow,
  actorUserId: string,
  names: { person: (id: string) => Promise<string>; phase: (id: string) => Promise<string>; task: (id: string) => Promise<string> },
) {
  const rows = [];
  for (const { field, label } of TRACKED) {
    let from = asText(before[field]);
    let to = asText(after[field]);
    if (field === "estimateHours") {
      from = from === null ? null : String(Number(from));
      to = to === null ? null : String(Number(to));
    }
    if (from === to) continue;
    if (field === "description") {
      // Long text: say it changed rather than storing both versions.
      rows.push({ taskId: after.id, actorUserId, action: "field_change", field: label, fromValue: null, toValue: to ? "updated" : "cleared" });
      continue;
    }
    if (field === "assigneeId") [from, to] = [from && (await names.person(from)), to && (await names.person(to))];
    if (field === "milestoneId") [from, to] = [from && (await names.phase(from)), to && (await names.phase(to))];
    if (field === "parentTaskId") [from, to] = [from && (await names.task(from)), to && (await names.task(to))];
    rows.push({ taskId: after.id, actorUserId, action: "field_change", field: label, fromValue: from, toValue: to });
  }
  if (rows.length) await db.insert(taskEvents).values(rows);
}

// ---- Search ----

const STATUSES = ["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const csv = <T extends string>(values: readonly T[]) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values as unknown as [T, ...T[]])))
    .optional();

export const searchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  projectId: z.string().uuid().optional(),
  // A user id, "me", or "none" (unassigned).
  assignee: z.union([z.string().uuid(), z.enum(["me", "none"])]).optional(),
  reporter: z.union([z.string().uuid(), z.literal("me")]).optional(),
  status: csv(STATUSES),
  priority: csv(PRIORITIES),
  type: csv(ISSUE_TYPES),
  label: z.string().trim().toLowerCase().max(30).optional(),
  // "open" = not done or cancelled; "overdue" = open and past its due date.
  state: z.enum(["open", "closed", "overdue", "all"]).default("all"),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  watching: z.coerce.boolean().optional(),
  parentId: z.string().uuid().optional(),
  sort: z.enum(["updated", "created", "due", "priority", "key", "title", "status"]).default("updated"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type TaskSearch = z.infer<typeof searchSchema>;

export interface SearchRow extends Record<string, unknown> {
  id: string;
  total: number;
}

/** Issues the person can see, filtered, sorted and paged on the server. */
export async function searchTasks(db: Database, me: { sub: string; role: string }, f: TaskSearch) {
  const privileged = ["hr", "admin", "super_admin"].includes(me.role);
  const where: SQL[] = [];
  if (!privileged) {
    where.push(sql`(t.assignee_id = ${me.sub} OR t.created_by = ${me.sub}
      OR EXISTS (SELECT 1 FROM task_watchers w WHERE w.task_id = t.id AND w.user_id = ${me.sub})
      OR p.owner_id = ${me.sub}
      OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = ${me.sub}))`);
  }
  if (f.projectId) where.push(sql`t.project_id = ${f.projectId}`);
  if (f.assignee === "me") where.push(sql`t.assignee_id = ${me.sub}`);
  else if (f.assignee === "none") where.push(sql`t.assignee_id IS NULL`);
  else if (f.assignee) where.push(sql`t.assignee_id = ${f.assignee}`);
  if (f.reporter) where.push(sql`t.created_by = ${f.reporter === "me" ? me.sub : f.reporter}`);
  if (f.status?.length) where.push(sql`t.status::text IN (${sql.join(f.status.map((s) => sql`${s}`), sql`, `)})`);
  if (f.priority?.length) where.push(sql`t.priority::text IN (${sql.join(f.priority.map((s) => sql`${s}`), sql`, `)})`);
  if (f.type?.length) where.push(sql`t.type::text IN (${sql.join(f.type.map((s) => sql`${s}`), sql`, `)})`);
  if (f.label) where.push(sql`${f.label} = ANY(t.labels)`);
  if (f.state === "open") where.push(sql`t.status NOT IN ('done', 'cancelled')`);
  if (f.state === "closed") where.push(sql`t.status IN ('done', 'cancelled')`);
  if (f.state === "overdue") where.push(sql`t.status NOT IN ('done', 'cancelled') AND t.due_date < now()`);
  if (f.dueBefore) where.push(sql`t.due_date <= ${f.dueBefore}`);
  if (f.dueAfter) where.push(sql`t.due_date >= ${f.dueAfter}`);
  if (f.watching) where.push(sql`EXISTS (SELECT 1 FROM task_watchers w WHERE w.task_id = t.id AND w.user_id = ${me.sub})`);
  if (f.parentId) where.push(sql`t.parent_task_id = ${f.parentId}`);
  if (f.q) {
    const key = f.q.toUpperCase().match(ISSUE_KEY_RE);
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      key
        ? sql`(p.key = ${key[1]} AND t.number = ${Number(key[2])})`
        : sql`(t.title ILIKE ${like} OR t.description ILIKE ${like} OR (p.key || '-' || t.number) ILIKE ${like} OR array_to_string(t.labels, ' ') ILIKE ${like})`,
    );
  }
  const dir = f.order === "asc" ? sql`ASC` : sql`DESC`;
  const orderBy = {
    updated: sql`t.updated_at ${dir}`,
    created: sql`t.created_at ${dir}`,
    due: sql`t.due_date ${dir} NULLS LAST`,
    priority: sql`array_position(ARRAY['low','medium','high','urgent'], t.priority::text) ${dir}, t.updated_at DESC`,
    key: sql`p.key ${dir} NULLS LAST, t.number ${dir}`,
    title: sql`lower(t.title) ${dir}`,
    status: sql`array_position(ARRAY['todo','in_progress','changes_requested','in_review','done','cancelled'], t.status::text) ${dir}, t.updated_at DESC`,
  }[f.sort];
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const r = await db.execute<SearchRow>(sql`
    SELECT t.id, count(*) OVER ()::int AS total
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
    ${whereSql}
    ORDER BY ${orderBy}, t.id
    LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}
  `);
  return { ids: r.rows.map((x) => x.id), total: r.rows[0]?.total ?? 0 };
}

/** Adds each task's key (INV-42) for display; personal tasks get null. */
export async function withKeys<T extends { projectId: string | null; number: number | null }>(db: Database, rows: T[]): Promise<(T & { key: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.projectId).filter((id): id is string => !!id))];
  const keys = new Map<string, string>();
  if (ids.length) {
    const found = await db.query.projects.findMany({ where: (p, { inArray }) => inArray(p.id, ids), columns: { id: true, key: true } });
    found.forEach((p) => keys.set(p.id, p.key));
  }
  return rows.map((r) => ({ ...r, key: r.projectId && r.number ? `${keys.get(r.projectId)}-${r.number}` : null }));
}
