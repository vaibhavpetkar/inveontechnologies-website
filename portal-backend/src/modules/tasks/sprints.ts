import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { projects, sprints, sprintScope, taskEvents, tasks } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import type { Env } from "../shared/env.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";
import { displayNameFor } from "../employees/onboarding.js";
import { recordChanges, withKeys } from "./issues.js";
import { allowedOnProject, projectSettings } from "./project-settings.js";
import { emitSprintStarted } from "./automation.js";

/**
 * Scrum planning on a project: sprints, the ranked backlog, sprint start and
 * completion with unfinished work rolling over, burndown and velocity, and
 * the board's work-in-progress limits.
 */

type TaskRow = typeof tasks.$inferSelect;
type SprintRow = typeof sprints.$inferSelect;
const OPEN = ["todo", "in_progress", "in_review", "changes_requested"] as const;
const DAY = 24 * 60 * 60 * 1000;

const isoDate = z.string().datetime({ offset: true });
const createSprintSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  goal: z.string().trim().max(1000).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});
const updateSprintSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  goal: z.string().trim().max(1000).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
});
const startSchema = z.object({ goal: z.string().trim().max(1000).optional(), startDate: isoDate.optional(), endDate: isoDate.optional() });
// Unfinished issues go to the backlog, a new sprint, or an existing planned sprint.
const completeSchema = z.object({ moveTo: z.union([z.enum(["backlog", "new"]), z.string().uuid()]).default("backlog") });
const moveSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  // null = the backlog. Left out = keep each issue where it is and only re-rank.
  sprintId: z.string().uuid().nullable().optional(),
  // Neighbours in the list it's dropped into: place after `afterId` and before `beforeId`.
  afterId: z.string().uuid().optional(),
  beforeId: z.string().uuid().optional(),
});
const wipSchema = z.object({
  limits: z.record(z.enum(["todo", "in_progress", "in_review", "changes_requested"]), z.number().int().min(1).max(99).nullable()),
});

const points = (rows: { storyPoints: number | null }[]) => rows.reduce((n, t) => n + (t.storyPoints ?? 0), 0);

/** When an issue stopped counting as remaining work. */
function closedAt(t: TaskRow): Date | null {
  if (t.status === "done") return t.completedAt ?? t.updatedAt;
  if (t.status === "cancelled") return t.updatedAt;
  return null;
}

async function names(db: Database, ids: (string | null)[]) {
  const out = new Map<string, string>();
  await Promise.all([...new Set(ids.filter((x): x is string => !!x))].map(async (id) => out.set(id, await displayNameFor(db, id))));
  return out;
}

/** The fields the backlog and sprint lists show for each issue. */
async function issueCards(db: Database, rows: TaskRow[]) {
  const who = await names(db, rows.map((t) => t.assigneeId));
  const ids = rows.map((t) => t.id);
  const subs = ids.length
    ? await db.select({ parentTaskId: tasks.parentTaskId, n: sql<number>`count(*)::int` }).from(tasks).where(inArray(tasks.parentTaskId, ids)).groupBy(tasks.parentTaskId)
    : [];
  const subCount = new Map(subs.map((r) => [r.parentTaskId, r.n]));
  return (await withKeys(db, rows)).map((t) => ({
    id: t.id,
    key: t.key,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    storyPoints: t.storyPoints,
    labels: t.labels,
    rank: t.rank,
    sprintId: t.sprintId,
    dueDate: t.dueDate,
    assignee: t.assigneeId ? { id: t.assigneeId, name: who.get(t.assigneeId) ?? "Someone" } : null,
    subtaskCount: subCount.get(t.id) ?? 0,
  }));
}

/** Stories, tasks and bugs: drops subtasks (they travel with their parent) but keeps issues under an epic. */
async function planningLevel(db: Database, rows: TaskRow[]) {
  const parentIds = [...new Set(rows.map((t) => t.parentTaskId).filter((id): id is string => !!id))];
  const parents = parentIds.length ? await db.query.tasks.findMany({ where: inArray(tasks.id, parentIds), columns: { id: true, type: true } }) : [];
  const epics = new Set(parents.filter((p) => p.type === "epic").map((p) => p.id));
  return rows.filter((t) => t.type !== "epic" && (!t.parentTaskId || epics.has(t.parentTaskId)));
}

function sprintStats(rows: TaskRow[]) {
  const done = rows.filter((t) => t.status === "done");
  return { issues: rows.length, done: done.length, points: points(rows), donePoints: points(done) };
}

/**
 * Remaining story points through the sprint, one point a day, from the
 * sprint's scope history: issues count from when they joined the sprint
 * until they left it or were closed.
 */
export async function burndown(db: Database, sprint: SprintRow, now = new Date()) {
  const start = sprint.startedAt ?? sprint.startDate;
  const end = sprint.completedAt ?? sprint.endDate;
  if (!start || !end) return { days: [], committed: sprint.committedPoints ?? 0 };
  const scope = await db.select().from(sprintScope).where(eq(sprintScope.sprintId, sprint.id));
  const taskRows = scope.length ? await planningLevel(db, await db.query.tasks.findMany({ where: inArray(tasks.id, [...new Set(scope.map((s) => s.taskId))]) })) : [];
  // Issues planned in before the start (or moments after, by the start itself) count from the start.
  const joined = (s: (typeof scope)[number]) => (s.addedAt.getTime() <= start.getTime() + 60_000 ? start : s.addedAt);
  const byId = new Map(taskRows.map((t) => [t.id, t]));
  const remainingAt = (at: Date) => {
    let total = 0;
    let issues = 0;
    for (const s of scope) {
      const t = byId.get(s.taskId);
      if (!t || joined(s) > at || (s.removedAt && s.removedAt <= at)) continue;
      const closed = closedAt(t);
      if (closed && closed <= at) continue;
      total += t.storyPoints ?? 0;
      issues++;
    }
    return { total, issues };
  };
  const committed = sprint.committedPoints ?? remainingAt(start).total;
  const span = Math.max(end.getTime() - start.getTime(), DAY);
  const last = Math.min(end.getTime(), now.getTime());
  const days = [];
  for (let at = start.getTime(); ; at += DAY) {
    const point = Math.min(at, last);
    const r = remainingAt(new Date(point));
    days.push({
      at: new Date(point).toISOString(),
      remaining: r.total,
      issues: r.issues,
      ideal: Math.max(0, Math.round(committed * (1 - (point - start.getTime()) / span) * 10) / 10),
    });
    if (at >= last) break;
  }
  // The guideline reaches zero on the last day even when the chart stops earlier.
  return { days, committed, endsAt: end.toISOString() };
}

/** Rank values for `n` issues dropped between two neighbours. */
function ranksBetween(lo: number | null, hi: number | null, n: number, max: number): number[] {
  if (lo === null && hi === null) return Array.from({ length: n }, (_, i) => max + i + 1);
  if (lo === null) lo = hi! - (n + 1);
  if (hi === null) hi = lo + n + 1;
  const step = (hi - lo) / (n + 1);
  return Array.from({ length: n }, (_, i) => lo! + step * (i + 1));
}

/** Renumbers a project's ranks 1, 2, 3… when repeated drops squeeze two too close. */
async function rebalance(db: Database, projectId: string) {
  await db.execute(sql`
    UPDATE tasks t SET rank = r.n FROM (
      SELECT id, row_number() OVER (ORDER BY rank NULLS LAST, created_at) AS n FROM tasks WHERE project_id = ${projectId}
    ) r WHERE r.id = t.id
  `);
}

export function sprintsRouter(db: Database, env: Env) {
  const router = Router();

  async function loadSprint(id: string) {
    const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, id) });
    if (!sprint) throw new NotFoundError("Sprint not found");
    return sprint;
  }
  async function mustManage(req: { user?: { sub: string; role: string } }, projectId: string) {
    if (!(await allowedOnProject(db, req.user!, projectId, "planSprints"))) throw new ForbiddenError("Only the project's owner or leads can plan sprints");
  }
  async function mustAccess(req: { user?: { sub: string; role: string } }, projectId: string) {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, projectId))) throw new ForbiddenError();
  }

  /** The planning page: open sprints with their issues, then the ranked backlog. */
  router.get("/projects/:id/backlog", requireAuth(env), async (req, res) => {
    await mustAccess(req, req.params.id);
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id) });
    if (!project) throw new NotFoundError("Project not found");
    const open = await db.query.sprints.findMany({
      where: and(eq(sprints.projectId, project.id), ne(sprints.status, "completed")),
      orderBy: [sql`CASE WHEN ${sprints.status} = 'active' THEN 0 ELSE 1 END`, asc(sprints.startDate), asc(sprints.createdAt)],
    });
    // Planning works on stories, tasks and bugs: top-level ones and those under an epic. Epics
    // span sprints, and subtasks travel with their parent.
    const all = await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id), orderBy: [asc(tasks.rank), asc(tasks.createdAt)] });
    const epics = new Set(all.filter((t) => t.type === "epic").map((t) => t.id));
    const rows = all.filter((t) => t.type !== "epic" && (!t.parentTaskId || epics.has(t.parentTaskId)));
    const openIds = new Set(open.map((s) => s.id));
    // Backlog: open issues in no sprint. Sprints: everything in them, done or not.
    const inBacklog = rows.filter((t) => !t.sprintId && OPEN.includes(t.status as (typeof OPEN)[number]));
    const inSprints = rows.filter((t) => t.sprintId && openIds.has(t.sprintId));
    const cards = await issueCards(db, [...inSprints, ...inBacklog]);
    const card = new Map(cards.map((c) => [c.id, c]));
    const completedCount = (await db.select({ n: sql<number>`count(*)::int` }).from(sprints).where(and(eq(sprints.projectId, project.id), eq(sprints.status, "completed"))))[0].n;
    res.json({
      project: { id: project.id, key: project.key, title: project.title, wipLimits: project.wipLimits },
      canManage: await canManageProject(db, req.user!.sub, req.user!.role, project.id),
      sprints: open.map((s) => {
        const mine = inSprints.filter((t) => t.sprintId === s.id);
        return { ...s, stats: sprintStats(mine), issues: mine.map((t) => card.get(t.id)!) };
      }),
      backlog: { stats: sprintStats(inBacklog), issues: inBacklog.map((t) => card.get(t.id)!) },
      completedSprints: completedCount,
    });
  });

  router.get("/projects/:id/sprints", requireAuth(env), async (req, res) => {
    await mustAccess(req, req.params.id);
    const rows = await db.query.sprints.findMany({ where: eq(sprints.projectId, req.params.id), orderBy: [desc(sprints.createdAt)] });
    res.json({ sprints: rows });
  });

  router.post("/projects/:id/sprints", requireAuth(env), async (req, res) => {
    await mustManage(req, req.params.id);
    const body = createSprintSchema.parse(req.body);
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id) });
    if (!project) throw new NotFoundError("Project not found");
    if (body.startDate && body.endDate && new Date(body.endDate) <= new Date(body.startDate)) throw new AppError("INVALID_DATES", "A sprint must end after it starts", 400);
    const [sprint] = await db
      .insert(sprints)
      .values({
        projectId: project.id,
        name: body.name ?? (await nextSprintName(db, project)),
        goal: body.goal,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        createdBy: req.user!.sub,
      })
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "sprint.create", entityType: "sprint", entityId: sprint.id, ipAddress: req.ip });
    res.status(201).json({ sprint });
  });

  router.put("/sprints/:id", requireAuth(env), async (req, res) => {
    const sprint = await loadSprint(req.params.id);
    await mustManage(req, sprint.projectId);
    if (sprint.status === "completed") throw new AppError("SPRINT_COMPLETED", "A completed sprint can't be changed", 400);
    const body = updateSprintSchema.parse(req.body);
    const startDate = body.startDate === undefined ? sprint.startDate : body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate === undefined ? sprint.endDate : body.endDate ? new Date(body.endDate) : null;
    if (startDate && endDate && endDate <= startDate) throw new AppError("INVALID_DATES", "A sprint must end after it starts", 400);
    const [updated] = await db.update(sprints).set({ name: body.name, goal: body.goal, startDate, endDate }).where(eq(sprints.id, sprint.id)).returning();
    res.json({ sprint: updated });
  });

  /** Only a sprint that hasn't started can be deleted; its issues go back to the backlog. */
  router.delete("/sprints/:id", requireAuth(env), async (req, res) => {
    const sprint = await loadSprint(req.params.id);
    await mustManage(req, sprint.projectId);
    if (sprint.status !== "planned") throw new AppError("SPRINT_STARTED", "Only a sprint that hasn't started can be deleted", 400);
    await db.update(tasks).set({ sprintId: null, updatedAt: new Date() }).where(eq(tasks.sprintId, sprint.id));
    await db.delete(sprints).where(eq(sprints.id, sprint.id));
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "sprint.delete", entityType: "sprint", entityId: sprint.id, ipAddress: req.ip });
    res.status(204).end();
  });

  router.post("/sprints/:id/start", requireAuth(env), async (req, res) => {
    const sprint = await loadSprint(req.params.id);
    await mustManage(req, sprint.projectId);
    if (sprint.status !== "planned") throw new AppError("SPRINT_STARTED", "This sprint has already started", 400);
    const body = startSchema.parse(req.body);
    const now = new Date();
    const startDate = body.startDate ? new Date(body.startDate) : sprint.startDate ?? now;
    const endDate = body.endDate ? new Date(body.endDate) : sprint.endDate ?? new Date(startDate.getTime() + 14 * DAY);
    if (endDate <= startDate) throw new AppError("INVALID_DATES", "A sprint must end after it starts", 400);
    const active = await db.query.sprints.findFirst({ where: and(eq(sprints.projectId, sprint.projectId), eq(sprints.status, "active")) });
    if (active) throw new AppError("SPRINT_ACTIVE", `${active.name} is still running. Complete it before starting another.`, 409);
    const issues = await db.query.tasks.findMany({ where: eq(tasks.sprintId, sprint.id) });
    if (!issues.length) throw new AppError("SPRINT_EMPTY", "Add some issues to the sprint before starting it", 400);
    const open = issues.filter((t) => OPEN.includes(t.status as (typeof OPEN)[number]));
    let started: SprintRow;
    try {
      [started] = await db
        .update(sprints)
        .set({ status: "active", goal: body.goal ?? sprint.goal, startDate, endDate, startedAt: now, committedPoints: points(open) })
        .where(and(eq(sprints.id, sprint.id), eq(sprints.status, "planned")))
        .returning();
    } catch (err) {
      // The one-active-sprint index caught a start racing this one.
      if ((err as { code?: string }).code === "23505") throw new AppError("SPRINT_ACTIVE", "Another sprint on this project is already running", 409);
      throw err;
    }
    if (!started) throw new AppError("SPRINT_STARTED", "This sprint has already started", 409);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "sprint.start", entityType: "sprint", entityId: sprint.id, ipAddress: req.ip });
    const people = [...new Set(open.map((t) => t.assigneeId).filter((id): id is string => !!id && id !== req.user!.sub))];
    if (people.length && (await projectSettings(db, sprint.projectId)).notifications.sprintStarted) {
      await notify(db, {
        userIds: people,
        actorUserId: req.user!.sub,
        kind: "sprint.started",
        title: `${started.name} has started`,
        body: `${started.goal ? `Goal: ${started.goal}. ` : ""}It runs until ${endDate.toDateString()}.`,
        link: `/projects/${sprint.projectId}?view=sprint`,
      });
    }
    await emitSprintStarted(db, sprint.projectId, sprint.id, req.user!.sub);
    res.json({ sprint: started });
  });

  router.post("/sprints/:id/complete", requireAuth(env), async (req, res) => {
    const sprint = await loadSprint(req.params.id);
    await mustManage(req, sprint.projectId);
    if (sprint.status !== "active") throw new AppError("SPRINT_NOT_ACTIVE", "Only a running sprint can be completed", 400);
    const { moveTo } = completeSchema.parse(req.body);
    const project = (await db.query.projects.findFirst({ where: eq(projects.id, sprint.projectId) }))!;
    const issues = await db.query.tasks.findMany({ where: eq(tasks.sprintId, sprint.id) });
    const done = issues.filter((t) => t.status === "done");
    const unfinished = issues.filter((t) => OPEN.includes(t.status as (typeof OPEN)[number]));

    const result = await db.transaction(async (tx) => {
      let target: string | null = null;
      if (moveTo === "new" && unfinished.length) {
        const [next] = await tx.insert(sprints).values({ projectId: sprint.projectId, name: await nextSprintName(tx as unknown as Database, project), createdBy: req.user!.sub }).returning();
        target = next.id;
      } else if (moveTo !== "backlog" && moveTo !== "new") {
        const next = await tx.query.sprints.findFirst({ where: eq(sprints.id, moveTo) });
        if (!next || next.projectId !== sprint.projectId || next.status !== "planned") throw new AppError("INVALID_SPRINT", "Pick a planned sprint on this project", 400);
        target = next.id;
      }
      const [completed] = await tx
        .update(sprints)
        .set({ status: "completed", completedAt: new Date(), completedPoints: points(done), completedIssues: done.length, carriedOverIssues: unfinished.length })
        .where(and(eq(sprints.id, sprint.id), eq(sprints.status, "active")))
        .returning();
      if (!completed) throw new AppError("SPRINT_NOT_ACTIVE", "This sprint was already completed", 409);
      if (unfinished.length) {
        await tx.update(tasks).set({ sprintId: target, updatedAt: new Date() }).where(inArray(tasks.id, unfinished.map((t) => t.id)));
      }
      return { completed, target };
    });
    if (unfinished.length) {
      const targetName = result.target ? (await db.query.sprints.findFirst({ where: eq(sprints.id, result.target), columns: { name: true } }))!.name : "Backlog";
      await db.insert(taskEvents).values(
        unfinished.map((t) => ({ taskId: t.id, actorUserId: req.user!.sub, action: "field_change", field: "sprint", fromValue: sprint.name, toValue: targetName, note: "Carried over when the sprint closed" })),
      );
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "sprint.complete", entityType: "sprint", entityId: sprint.id, ipAddress: req.ip });
    res.json({ sprint: result.completed, movedTo: result.target, carriedOver: unfinished.length });
  });

  /** Sprint report: burndown, what got done, what was carried over, and scope added after the start. */
  router.get("/sprints/:id/report", requireAuth(env), async (req, res) => {
    const sprint = await loadSprint(req.params.id);
    await mustAccess(req, sprint.projectId);
    const scope = await db.select().from(sprintScope).where(eq(sprintScope.sprintId, sprint.id));
    const ids = [...new Set(scope.map((s) => s.taskId))];
    const rows = ids.length ? await planningLevel(db, await db.query.tasks.findMany({ where: inArray(tasks.id, ids), orderBy: [asc(tasks.rank)] })) : [];
    const cards = new Map((await issueCards(db, rows)).map((c) => [c.id, c]));
    const started = sprint.startedAt;
    const kept = new Set(rows.map((t) => t.id));
    const addedLater = new Set(started ? scope.filter((s) => kept.has(s.taskId) && s.addedAt > new Date(started.getTime() + 60_000)).map((s) => s.taskId) : []);
    const stillIn = new Set(scope.filter((s) => !s.removedAt).map((s) => s.taskId));
    const closedIn = (t: TaskRow) => t.status === "done" && (t.sprintId === sprint.id || stillIn.has(t.id));
    res.json({
      sprint,
      burndown: await burndown(db, sprint),
      completed: rows.filter(closedIn).map((t) => cards.get(t.id)!),
      // While running: what's still open. After closing: what rolled over to the next sprint or backlog.
      notCompleted: rows.filter((t) => !closedIn(t) && t.status !== "cancelled" && (sprint.status !== "completed" || scope.some((s) => s.taskId === t.id && s.removedAt))).map((t) => cards.get(t.id)!),
      addedAfterStart: [...addedLater].map((id) => cards.get(id)).filter(Boolean),
    });
  });

  /** Points committed and completed in recent sprints, oldest first. */
  router.get("/projects/:id/velocity", requireAuth(env), async (req, res) => {
    await mustAccess(req, req.params.id);
    const rows = await db.query.sprints.findMany({
      where: and(eq(sprints.projectId, req.params.id), eq(sprints.status, "completed")),
      orderBy: [desc(sprints.completedAt)],
      limit: 8,
    });
    const list = rows.reverse().map((s) => ({ id: s.id, name: s.name, committed: s.committedPoints ?? 0, completed: s.completedPoints ?? 0, completedIssues: s.completedIssues ?? 0, carriedOver: s.carriedOverIssues ?? 0, completedAt: s.completedAt }));
    const recent = list.slice(-3);
    res.json({ sprints: list, average: recent.length ? Math.round(recent.reduce((n, s) => n + s.completed, 0) / recent.length) : 0 });
  });

  /**
   * Drag and drop on the planning page: move issues into a sprint or the
   * backlog and place them between two neighbours. Subtasks follow their parent.
   */
  router.post("/projects/:id/backlog/move", requireAuth(env), async (req, res) => {
    await mustManage(req, req.params.id);
    const body = moveSchema.parse(req.body);
    const projectId = req.params.id;
    const moving = await db.query.tasks.findMany({ where: and(inArray(tasks.id, body.taskIds), eq(tasks.projectId, projectId)) });
    if (moving.length !== new Set(body.taskIds).size) throw new AppError("INVALID_TASKS", "Some of those issues aren't on this project", 400);
    if (body.sprintId) {
      const sprint = await loadSprint(body.sprintId);
      if (sprint.projectId !== projectId || sprint.status === "completed") throw new AppError("INVALID_SPRINT", "Pick an open sprint on this project", 400);
    }
    const neighbour = async (id?: string) => {
      if (!id) return null;
      const t = await db.query.tasks.findFirst({ where: and(eq(tasks.id, id), eq(tasks.projectId, projectId)) });
      if (!t) throw new AppError("INVALID_TASKS", "That neighbour isn't on this project", 400);
      return t.rank;
    };
    let lo = await neighbour(body.afterId);
    let hi = await neighbour(body.beforeId);
    if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${tasks.rank}), 0)` }).from(tasks).where(eq(tasks.projectId, projectId));
    // Keep the order they were given in.
    const ordered = body.taskIds.map((id) => moving.find((t) => t.id === id)!);
    const ranks = body.afterId || body.beforeId ? ranksBetween(lo, hi, ordered.length, Number(max)) : ordered.map((t) => t.rank);
    const sprintName = async (id: string) => (await db.query.sprints.findFirst({ where: eq(sprints.id, id), columns: { name: true } }))?.name ?? "A sprint";
    const after: TaskRow[] = [];
    for (const [i, t] of ordered.entries()) {
      const [u] = await db
        .update(tasks)
        .set({ rank: ranks[i], ...(body.sprintId !== undefined ? { sprintId: body.sprintId } : {}), updatedAt: body.sprintId !== undefined && body.sprintId !== t.sprintId ? new Date() : t.updatedAt })
        .where(eq(tasks.id, t.id))
        .returning();
      after.push(u);
      if (body.sprintId !== undefined && body.sprintId !== t.sprintId) {
        await recordChanges(db, t, u, req.user!.sub, { person: async () => "", phase: async () => "", task: async () => "", sprint: sprintName });
      }
    }
    if (body.sprintId !== undefined) {
      const parents = ordered.map((t) => t.id);
      await db.update(tasks).set({ sprintId: body.sprintId }).where(and(inArray(tasks.parentTaskId, parents), notInArray(tasks.status, ["done", "cancelled"])));
    }
    if (hi !== null && lo !== null && (hi - lo) / (ordered.length + 1) < 1e-6) await rebalance(db, projectId);
    res.json({ tasks: await issueCards(db, after) });
  });

  router.put("/projects/:id/wip-limits", requireAuth(env), async (req, res) => {
    await mustManage(req, req.params.id);
    const { limits } = wipSchema.parse(req.body);
    const clean = Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== null)) as Record<string, number>;
    const [project] = await db.update(projects).set({ wipLimits: clean, updatedAt: new Date() }).where(eq(projects.id, req.params.id)).returning();
    if (!project) throw new NotFoundError("Project not found");
    res.json({ wipLimits: project.wipLimits });
  });

  return router;
}

/** "INV Sprint 4": one past the highest-numbered sprint so far. */
async function nextSprintName(db: Database, project: { id: string; key: string }) {
  const rows = await db.query.sprints.findMany({ where: eq(sprints.projectId, project.id), columns: { name: true } });
  const n = rows.reduce((m, s) => Math.max(m, Number(s.name.match(/(\d+)\s*$/)?.[1] ?? 0)), 0);
  return `${project.key} Sprint ${n + 1}`;
}
