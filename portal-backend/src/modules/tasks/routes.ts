import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  tasks,
  taskTemplates,
  taskRecurrences,
  taskAttachments,
  taskComments,
  taskTimeEntries,
  taskEvents,
  taskUpdates,
  taskRequests,
  taskWatchers,
  savedTaskFilters,
  sprints,
  projectVersions,
  users,
  projectMilestones,
  courseEnrollments,
  employees,
  projects,
  projectMembers,
  assessmentAttempts,
  applications,
  certificates,
  candidateSkills,
} from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { formatWhen } from "../shared/format.js";
import { isAssigneeTransitionAllowed, isReviewerTransitionAllowed, type TaskStatus } from "./state-machine.js";
import { allowedOnProject, projectSettings } from "./project-settings.js";
import { emitAutomation } from "./automation.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";
import type { Env } from "../shared/env.js";
import { claimFile, fileForUrl, publicFile } from "../files/service.js";
import { pushTaskStatusToGithub } from "../github/push.js";
import { displayNameFor } from "../employees/onboarding.js";
import { ISSUE_TYPES, addWatchers, findTaskByRef, labelsSchema, recordChanges, searchSchema, searchTasks, watcherIds, withKeys } from "./issues.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;
const MANAGER_LIKE_ROLES = ["manager", "hr", "admin", "super_admin"] as const;

const createTaskSchema = z.object({
  projectId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  estimateHours: z.number().min(0).optional(),
  dueDate: z.string().datetime().optional(),
  milestoneId: z.string().uuid().optional(),
  type: z.enum(ISSUE_TYPES).default("task"),
  labels: labelsSchema.default([]),
  storyPoints: z.number().int().min(0).max(100).optional(),
  sprintId: z.string().uuid().optional(),
  fixVersionId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  estimateHours: z.number().min(0).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  labels: labelsSchema.optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  fixVersionId: z.string().uuid().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  remainingHours: z.number().min(0).max(9999).nullable().optional(),
});

// Bulk edit: the same change to many issues at once (Jira's "bulk change").
const bulkSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(200),
  patch: z
    .object({
      assigneeId: z.string().uuid().nullable().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      type: z.enum(ISSUE_TYPES).optional(),
      dueDate: z.string().datetime().nullable().optional(),
      sprintId: z.string().uuid().nullable().optional(),
      fixVersionId: z.string().uuid().nullable().optional(),
      storyPoints: z.number().int().min(0).max(100).nullable().optional(),
      addLabels: labelsSchema.optional(),
      removeLabels: z.array(z.string().trim().toLowerCase()).max(10).optional(),
    })
    .refine((p) => Object.values(p).some((v) => v !== undefined), "Pick at least one change"),
});
const timeEntryEditSchema = z.object({ hours: z.number().min(0.1).max(24).optional(), entryDate: z.string().datetime().optional(), note: z.string().max(1000).nullable().optional() });
const timesheetSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"]).optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

// Starting work can carry a kickoff: the plan, when it should be finished, and a branch or PR link.
const kickoffSchema = z.object({
  plan: z.string().trim().min(3).max(4000),
  expectedFinishAt: z.string().datetime({ offset: true }).optional(),
  branchOrLink: z.string().trim().max(500).optional(),
});
const transitionSchema = z.object({
  toStatus: z.enum(["in_progress", "in_review", "done", "changes_requested", "cancelled"]),
  note: z.string().max(2000).optional(),
  kickoff: kickoffSchema.optional(),
  // Approving can carry the reviewer's 1-5 star rating of the work.
  rating: z.number().int().min(1).max(5).optional(),
  ratingNote: z.string().trim().max(1000).optional(),
});
const ratingSchema = z.object({ rating: z.number().int().min(1).max(5), note: z.string().trim().max(1000).optional() });
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("extension"), reason: z.string().trim().min(3).max(2000), requestedDueDate: z.string().datetime({ offset: true }) }),
  z.object({ kind: z.literal("reassign"), reason: z.string().trim().min(3).max(2000), proposedAssigneeId: z.string().uuid().optional() }),
]);
const decideSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(2000).optional(),
  // Approving an extension may set a different date than asked; approving a
  // hand-over needs the new assignee unless the request named one.
  dueDate: z.string().datetime({ offset: true }).optional(),
  assigneeId: z.string().uuid().optional(),
});
const updateSchema = z.object({
  kind: z.enum(["progress", "blocker"]).default("progress"),
  body: z.string().trim().min(2).max(4000),
  progressPercent: z.number().int().min(0).max(100).optional(),
  branchOrLink: z.string().trim().max(500).optional(),
});
const commentSchema = z.object({ body: z.string().min(1).max(5000), mentionedUserIds: z.array(z.string().uuid()).max(30).default([]) });
const savedFilterSchema = z.object({ name: z.string().trim().min(1).max(80), filters: z.record(z.unknown()) });
const attachmentSchema = z.object({ fileName: z.string().min(1).max(300), fileUrl: z.string().min(1).max(2000) });
const timeEntrySchema = z.object({ hours: z.number().min(0.1).max(24), entryDate: z.string().datetime(), note: z.string().max(1000).optional(), remainingHours: z.number().min(0).max(9999).optional() });
const templateSchema = z.object({ title: z.string().min(2).max(200), description: z.string().max(5000).optional(), defaultEstimateHours: z.number().min(0).optional() });
const fromTemplateSchema = z.object({ templateId: z.string().uuid(), projectId: z.string().uuid().optional(), assigneeId: z.string().uuid().optional(), dueDate: z.string().datetime().optional() });
const recurrenceSchema = z.object({ frequency: z.enum(["daily", "weekly", "monthly"]), nextRunAt: z.string().datetime() });

/** A task's roadmap phase must belong to the task's own project. */
async function assertMilestoneFits(db: Database, milestoneId: string | null | undefined, projectId: string | null | undefined) {
  if (!milestoneId) return;
  const milestone = await db.query.projectMilestones.findFirst({ where: eq(projectMilestones.id, milestoneId) });
  if (!milestone || milestone.projectId !== projectId) throw new AppError("INVALID_MILESTONE", "That roadmap phase isn't part of this task's project", 400);
}

/** A task can only be planned into an open sprint of its own project. */
/** A task's fix version must be an unreleased version of its own project. */
async function assertVersionFits(db: Database, versionId: string | null | undefined, projectId: string | null | undefined) {
  if (!versionId) return;
  const version = await db.query.projectVersions.findFirst({ where: eq(projectVersions.id, versionId) });
  if (!version || version.projectId !== projectId) throw new AppError("INVALID_VERSION", "That version isn't part of this task's project", 400);
}

async function assertSprintFits(db: Database, sprintId: string | null | undefined, projectId: string | null | undefined) {
  if (!sprintId) return;
  const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, sprintId) });
  if (!sprint || sprint.projectId !== projectId) throw new AppError("INVALID_SPRINT", "That sprint isn't part of this task's project", 400);
  if (sprint.status === "completed") throw new AppError("INVALID_SPRINT", "That sprint is already complete", 400);
}

function addInterval(date: Date, frequency: "daily" | "weekly" | "monthly"): Date {
  const d = new Date(date);
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
}

// Candidates are applicants, not staff — they have no business creating or
// assigning work items.
const TASK_ROLES = ["intern", "employee", ...MANAGER_LIKE_ROLES] as const;

/** Creator, a privileged role, or someone who can manage the task's project. */
export async function canEditTask(db: Database, userId: string, role: string, task: typeof tasks.$inferSelect): Promise<boolean> {
  if (PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])) return true;
  if (task.createdBy === userId) return true;
  return task.projectId ? allowedOnProject(db, { sub: userId, role }, task.projectId, "editAnyIssue") : false;
}

/**
 * Assigning work to someone else needs authority over it: within a project,
 * the project's owner/lead (and the assignee must be on the project);
 * outside a project, a manager-like role. Anyone may assign to themselves.
 */
async function assertCanAssign(db: Database, user: { sub: string; role: string }, assigneeId: string | undefined | null, projectId: string | undefined | null) {
  if (!assigneeId || assigneeId === user.sub) return;
  if (projectId) {
    if (!(await canManageProject(db, user.sub, user.role, projectId))) {
      throw new ForbiddenError("Only the project owner or a lead can assign project tasks to other people");
    }
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    const member = await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, assigneeId)) });
    if (project?.ownerId !== assigneeId && !member) throw new AppError("ASSIGNEE_NOT_ON_PROJECT", "The assignee must be a member of this project", 400);
    return;
  }
  if (!MANAGER_LIKE_ROLES.includes(user.role as (typeof MANAGER_LIKE_ROLES)[number])) {
    throw new ForbiddenError("Only managers, HR and admins can assign personal tasks to other people");
  }
}

/** The task's reviewers: its creator, a project owner or lead, or HR and admins. */
export async function isTaskReviewer(db: Database, user: { sub: string; role: string }, task: typeof tasks.$inferSelect) {
  return (
    PRIVILEGED_ROLES.includes(user.role as (typeof PRIVILEGED_ROLES)[number]) ||
    task.createdBy === user.sub ||
    (task.projectId ? await canManageProject(db, user.sub, user.role, task.projectId) : false)
  );
}

export async function canAccessTask(db: Database, userId: string, role: string, task: typeof tasks.$inferSelect): Promise<boolean> {
  if (PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])) return true;
  if (task.assigneeId === userId || task.createdBy === userId) return true;
  if (task.projectId) return canAccessProject(db, userId, role, task.projectId);
  return false;
}

export function tasksRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...TASK_ROLES), async (req, res) => {
    const body = createTaskSchema.parse(req.body);
    if (body.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, body.projectId))) throw new ForbiddenError();
    if (body.projectId && !(await allowedOnProject(db, req.user!, body.projectId, "createIssues"))) throw new ForbiddenError("On this project only the owner and leads create issues");
    await assertCanAssign(db, req.user!, body.assigneeId, body.projectId);

    await assertMilestoneFits(db, body.milestoneId, body.projectId);
    await assertSprintFits(db, body.sprintId, body.projectId);
    await assertVersionFits(db, body.fixVersionId, body.projectId);
    if (body.parentTaskId) {
      const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, body.parentTaskId) });
      if (!parent) throw new NotFoundError("Parent task not found");
      // A subtask lives in its parent's project.
      if ((parent.projectId ?? null) !== (body.projectId ?? null)) throw new AppError("INVALID_PARENT", "A subtask must be in the same project as its parent", 400);
      if (body.type === "epic") throw new AppError("INVALID_PARENT", "An epic can't be a subtask", 400);
    }

    const [task] = await db
      .insert(tasks)
      .values({
        projectId: body.projectId,
        parentTaskId: body.parentTaskId,
        title: body.title,
        description: body.description,
        assigneeId: body.assigneeId,
        priority: body.priority,
        estimateHours: body.estimateHours?.toString(),
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        milestoneId: body.milestoneId,
        type: body.type,
        labels: body.labels,
        storyPoints: body.storyPoints,
        sprintId: body.sprintId,
        fixVersionId: body.fixVersionId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        remainingHours: body.estimateHours?.toString(),
        createdBy: req.user!.sub,
      })
      .returning();

    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "create", toStatus: "todo" });
    await addWatchers(db, task.id, [req.user!.sub, task.assigneeId]);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "task.create", entityType: "task", entityId: task.id, ipAddress: req.ip });
    await notifyAssigned(db, task, req.user!.sub);
    await emitAutomation(db, "issue_created", task, { actorUserId: req.user!.sub });
    res.status(201).json({ task: (await withKeys(db, [task]))[0] });
  });

  /** Issue search: filters, sorting and paging on the server (see issues.ts). */
  router.get("/search", requireAuth(env), async (req, res) => {
    const f = searchSchema.parse(req.query);
    if (f.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, f.projectId))) throw new ForbiddenError();
    const { ids, total } = await searchTasks(db, req.user!, f);
    const rows = ids.length ? await db.query.tasks.findMany({ where: inArray(tasks.id, ids) }) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)!).filter(Boolean);
    const people = await namesFor(db, ordered.flatMap((t) => [t.assigneeId, t.createdBy]));
    const subtaskCounts = ids.length
      ? await db.select({ parentTaskId: tasks.parentTaskId, n: sql<number>`count(*)::int` }).from(tasks).where(inArray(tasks.parentTaskId, ids)).groupBy(tasks.parentTaskId)
      : [];
    const subs = new Map(subtaskCounts.map((r) => [r.parentTaskId, r.n]));
    res.json({
      tasks: (await withKeys(db, ordered)).map((t) => ({
        ...t,
        assignee: t.assigneeId ? { id: t.assigneeId, name: people.get(t.assigneeId) ?? "Someone" } : null,
        reporter: { id: t.createdBy, name: people.get(t.createdBy) ?? "Someone" },
        subtaskCount: subs.get(t.id) ?? 0,
      })),
      total,
      page: f.page,
      pageSize: f.pageSize,
    });
  });

  /** Labels already used on tasks the person can see, most used first, for autocomplete. */
  router.get("/labels", requireAuth(env), async (req, res) => {
    const { projectId } = z.object({ projectId: z.string().uuid().optional() }).parse(req.query);
    if (projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, projectId))) throw new ForbiddenError();
    const { ids } = await searchTasks(db, req.user!, searchSchema.parse({ projectId, pageSize: 500 }));
    if (!ids.length) return void res.json({ labels: [] });
    const r = await db.execute<{ label: string; n: number }>(sql`
      SELECT l AS label, count(*)::int AS n FROM tasks t, unnest(t.labels) AS l
      WHERE t.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) GROUP BY l ORDER BY n DESC, l LIMIT 100
    `);
    res.json({ labels: r.rows.map((x) => x.label) });
  });

  // ---- Saved searches ----

  router.get("/filters", requireAuth(env), async (req, res) => {
    res.json({ filters: await db.query.savedTaskFilters.findMany({ where: eq(savedTaskFilters.userId, req.user!.sub), orderBy: (f, { asc }) => [asc(f.name)] }) });
  });

  router.post("/filters", requireAuth(env), async (req, res) => {
    const body = savedFilterSchema.parse(req.body);
    // Keep only fields the search understands.
    const parsed = searchSchema.partial().parse(body.filters);
    const { page: _p, pageSize: _s, ...filters } = parsed;
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(savedTaskFilters).where(eq(savedTaskFilters.userId, req.user!.sub));
    if (count >= 30) throw new AppError("TOO_MANY_FILTERS", "You can keep up to 30 saved searches", 400);
    const [filter] = await db.insert(savedTaskFilters).values({ userId: req.user!.sub, name: body.name, filters }).returning();
    res.status(201).json({ filter });
  });

  router.delete("/filters/:id", requireAuth(env), async (req, res) => {
    await db.delete(savedTaskFilters).where(and(eq(savedTaskFilters.id, req.params.id), eq(savedTaskFilters.userId, req.user!.sub)));
    res.status(204).end();
  });

  router.get("/", requireAuth(env), async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    const conditions = [];
    if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));
    if (query.status) conditions.push(eq(tasks.status, query.status));
    if (query.assigneeId) conditions.push(eq(tasks.assigneeId, query.assigneeId));
    if (!isPrivileged && !query.projectId) {
      conditions.push(or(eq(tasks.assigneeId, req.user!.sub), eq(tasks.createdBy, req.user!.sub)));
    } else if (query.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, query.projectId))) {
      throw new ForbiddenError();
    }

    const rows = await db.query.tasks.findMany({ where: conditions.length ? and(...conditions) : undefined, limit: query.limit, orderBy: (t, { desc }) => [desc(t.updatedAt)] });
    res.json({ tasks: await withKeys(db, rows) });
  });

  router.post("/:id/transition", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();

    const body = transitionSchema.parse(req.body);
    const from = task.status as TaskStatus;
    const isAssignee = task.assigneeId === req.user!.sub;
    const isReviewer = await isTaskReviewer(db, req.user!, task);

    // A project can drop the review step: the assignee then closes their own work.
    const noReview = !!task.projectId && !(await projectSettings(db, task.projectId)).workflow.requireReview;
    const selfClose = noReview && isAssignee && body.toStatus === "done" && (from === "in_progress" || from === "changes_requested");
    const allowed = selfClose || (isAssignee && isAssigneeTransitionAllowed(from, body.toStatus)) || (isReviewer && isReviewerTransitionAllowed(from, body.toStatus));
    if (!allowed) {
      throw new AppError("INVALID_TRANSITION", `Cannot move task from "${from}" to "${body.toStatus}" as this user`, 400);
    }

    const starting = body.toStatus === "in_progress";
    const kickoff = starting ? body.kickoff : undefined;
    const approving = body.toStatus === "done";
    // Nobody rates their own work.
    const rating = approving && body.rating && task.assigneeId !== req.user!.sub ? body.rating : undefined;
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({
          status: body.toStatus,
          updatedAt: new Date(),
          ...(starting && !task.startedAt ? { startedAt: new Date() } : {}),
          ...(kickoff?.expectedFinishAt ? { expectedFinishAt: new Date(kickoff.expectedFinishAt) } : {}),
          ...(approving ? { progressPercent: 100, completedAt: new Date() } : {}),
          ...(rating ? { rating, ratingNote: body.ratingNote || null, ratedBy: req.user!.sub, ratedAt: new Date() } : {}),
        })
        .where(eq(tasks.id, task.id));
      await tx.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "status_change", fromStatus: from, toStatus: body.toStatus, note: body.note ?? kickoff?.plan });
      if (kickoff) {
        await tx.insert(taskUpdates).values({ taskId: task.id, userId: req.user!.sub, kind: "start", body: kickoff.plan, branchOrLink: kickoff.branchOrLink || null, progressPercent: task.progressPercent });
      }
    });

    if ((await projectSettings(db, task.projectId)).notifications.statusChange) {
      await notifyTransition(db, task, body.toStatus, req.user!.sub, body.note, rating);
      await notifyWatchersOfMove(db, task, body.toStatus, req.user!.sub);
    }
    await emitAutomation(db, "status_changed", task, { actorUserId: req.user!.sub, fromStatus: from, toStatus: body.toStatus });
    if (kickoff && task.createdBy !== req.user!.sub) {
      await notify(db, {
        userIds: [task.createdBy],
        actorUserId: req.user!.sub,
        kind: "task.started",
        title: `Work started: ${task.title}`,
        body: `${kickoff.plan.length > 240 ? `${kickoff.plan.slice(0, 240)}…` : kickoff.plan}${kickoff.expectedFinishAt ? `\n\nExpected to finish ${formatWhen(new Date(kickoff.expectedFinishAt))}.` : ""}`,
        link: `/tasks/${task.id}`,
      });
    }
    await pushTaskStatusToGithub(env, task, body.toStatus);

    res.json({ message: `Task moved to ${body.toStatus}.` });
  });

  /** The reviewer's star rating on approved work; can be given or changed after approval too. */
  router.post("/:id/rating", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await isTaskReviewer(db, req.user!, task))) throw new ForbiddenError("Only the task's reviewers can rate it");
    if (task.assigneeId === req.user!.sub) throw new ForbiddenError("You can't rate your own work");
    if (task.status !== "done") throw new AppError("INVALID_STATE", "Rate a task once it has been approved", 400);
    const body = ratingSchema.parse(req.body);
    const [updated] = await db
      .update(tasks)
      .set({ rating: body.rating, ratingNote: body.note || null, ratedBy: req.user!.sub, ratedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "rated", note: `${body.rating}/5${body.note ? ` - ${body.note}` : ""}` });
    if (task.assigneeId) {
      await notify(db, { userIds: [task.assigneeId], actorUserId: req.user!.sub, kind: "task.rated", title: `${body.rating}/5 stars on ${task.title}`, body: body.note || `Your reviewer rated "${task.title}" ${body.rating} out of 5.`, link: `/tasks/${task.id}` });
    }
    res.json({ task: updated });
  });

  // ---- More time, or hand the task to someone else ----

  /** Requests waiting on the caller: on tasks they created, lead, or (HR/admin) any task. */
  router.get("/requests/pending", requireAuth(env), async (req, res) => {
    const pending = await db.query.taskRequests.findMany({ where: eq(taskRequests.status, "pending"), orderBy: (r, { asc }) => [asc(r.createdAt)], limit: 200 });
    const taskRows = pending.length ? await db.query.tasks.findMany({ where: inArray(tasks.id, [...new Set(pending.map((r) => r.taskId))]) }) : [];
    const byId = new Map(taskRows.map((t) => [t.id, t]));
    const mine = [];
    for (const r of pending) {
      const task = byId.get(r.taskId);
      if (task && (await isTaskReviewer(db, req.user!, task))) mine.push({ ...r, task: { id: task.id, title: task.title, dueDate: task.dueDate, status: task.status, projectId: task.projectId, assigneeId: task.assigneeId } });
    }
    res.json({ requests: mine });
  });

  router.get("/:id/requests", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    res.json({ requests: await db.query.taskRequests.findMany({ where: eq(taskRequests.taskId, task.id), orderBy: (r, { desc }) => [desc(r.createdAt)] }), canDecide: await isTaskReviewer(db, req.user!, task) });
  });

  router.post("/:id/requests", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (task.assigneeId !== req.user!.sub) throw new ForbiddenError("Only the person the task is assigned to can ask for this");
    if (["done", "cancelled"].includes(task.status)) throw new AppError("INVALID_STATE", "This task is closed", 400);
    const body = requestSchema.parse(req.body);
    const open = await db.query.taskRequests.findFirst({ where: and(eq(taskRequests.taskId, task.id), eq(taskRequests.kind, body.kind), eq(taskRequests.status, "pending")) });
    if (open) throw new AppError("REQUEST_PENDING", "You already have a request like this waiting for an answer", 409);
    if (body.kind === "extension" && new Date(body.requestedDueDate) <= new Date()) throw new AppError("INVALID_DATE", "Pick a new date in the future", 400);
    if (body.kind === "reassign" && body.proposedAssigneeId === req.user!.sub) throw new AppError("INVALID_ASSIGNEE", "Suggest someone other than yourself", 400);

    const [request] = await db
      .insert(taskRequests)
      .values({
        taskId: task.id,
        requestedBy: req.user!.sub,
        kind: body.kind,
        reason: body.reason,
        currentDueDate: task.dueDate,
        requestedDueDate: body.kind === "extension" ? new Date(body.requestedDueDate) : null,
        proposedAssigneeId: body.kind === "reassign" ? (body.proposedAssigneeId ?? null) : null,
      })
      .returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: body.kind === "extension" ? "extension_requested" : "reassign_requested", note: body.reason });
    const reviewers = await taskReviewerIds(db, task);
    const who = await displayNameFor(db, req.user!.sub);
    await notify(db, {
      userIds: reviewers.filter((id) => id !== req.user!.sub),
      actorUserId: req.user!.sub,
      kind: "task.request",
      title: body.kind === "extension" ? `More time asked: ${task.title}` : `Hand-over asked: ${task.title}`,
      body:
        body.kind === "extension"
          ? `${who} asked to move the due date${task.dueDate ? ` from ${formatWhen(task.dueDate)}` : ""} to ${formatWhen(new Date(body.requestedDueDate))}.\n\n"${body.reason}"`
          : `${who} asked to hand this task to someone else.\n\n"${body.reason}"`,
      link: `/tasks/${task.id}`,
      email: true,
    });
    res.status(201).json({ request });
  });

  router.post("/requests/:id/cancel", requireAuth(env), async (req, res) => {
    const request = await db.query.taskRequests.findFirst({ where: eq(taskRequests.id, req.params.id) });
    if (!request) throw new NotFoundError("Request not found");
    if (request.requestedBy !== req.user!.sub) throw new ForbiddenError();
    if (request.status !== "pending") throw new AppError("INVALID_STATE", "This request has already been answered", 400);
    const [updated] = await db.update(taskRequests).set({ status: "cancelled", decidedAt: new Date() }).where(eq(taskRequests.id, request.id)).returning();
    res.json({ request: updated });
  });

  router.post("/requests/:id/decide", requireAuth(env), async (req, res) => {
    const request = await db.query.taskRequests.findFirst({ where: eq(taskRequests.id, req.params.id) });
    if (!request) throw new NotFoundError("Request not found");
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, request.taskId) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await isTaskReviewer(db, req.user!, task))) throw new ForbiddenError("Only the task's reviewers can answer this");
    if (request.status !== "pending") throw new AppError("INVALID_STATE", "This request has already been answered", 400);
    const body = decideSchema.parse(req.body);

    let changes: Partial<typeof tasks.$inferInsert> = {};
    let newAssignee: string | null = null;
    if (body.approve && request.kind === "extension") {
      const due = new Date(body.dueDate ?? request.requestedDueDate!.toISOString());
      changes = { dueDate: due, ...(task.expectedFinishAt && task.expectedFinishAt < due ? { expectedFinishAt: due } : {}) };
    }
    if (body.approve && request.kind === "reassign") {
      newAssignee = body.assigneeId ?? request.proposedAssigneeId;
      if (!newAssignee) throw new AppError("ASSIGNEE_REQUIRED", "Choose who takes the task over", 400);
      if (newAssignee === task.assigneeId) throw new AppError("INVALID_ASSIGNEE", "Choose someone other than the current assignee", 400);
      await assertCanAssign(db, req.user!, newAssignee, task.projectId);
      // The new person starts fresh: back to To do, with their own kickoff.
      const restart = ["in_progress", "changes_requested", "in_review"].includes(task.status);
      changes = { assigneeId: newAssignee, ...(restart ? { status: "todo" as const, startedAt: null, expectedFinishAt: null } : {}), ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}) };
    }

    const [decided] = await db.transaction(async (tx) => {
      if (Object.keys(changes).length) await tx.update(tasks).set({ ...changes, updatedAt: new Date() }).where(eq(tasks.id, task.id));
      await tx.insert(taskEvents).values({
        taskId: task.id,
        actorUserId: req.user!.sub,
        action: `${request.kind}_${body.approve ? "approved" : "declined"}`,
        fromStatus: changes.status ? (task.status as TaskStatus) : null,
        toStatus: changes.status ?? null,
        note: body.note ?? null,
      });
      return tx
        .update(taskRequests)
        .set({ status: body.approve ? "approved" : "declined", decidedBy: req.user!.sub, decidedAt: new Date(), decisionNote: body.note || null, ...(newAssignee ? { proposedAssigneeId: newAssignee } : {}) })
        .where(eq(taskRequests.id, request.id))
        .returning();
    });

    const link = `/tasks/${task.id}`;
    const withNote = (t: string) => (body.note ? `${t}\n\n"${body.note}"` : t);
    if (request.kind === "extension") {
      await notify(db, {
        userIds: [request.requestedBy],
        actorUserId: req.user!.sub,
        kind: "task.request_decided",
        title: body.approve ? `More time approved: ${task.title}` : `More time declined: ${task.title}`,
        body: withNote(body.approve ? `"${task.title}" is now due ${formatWhen(changes.dueDate as Date)}.` : `The due date for "${task.title}" stays${task.dueDate ? ` ${formatWhen(task.dueDate)}` : " as it is"}.`),
        link,
        email: true,
      });
    } else {
      await notify(db, {
        userIds: [request.requestedBy],
        actorUserId: req.user!.sub,
        kind: "task.request_decided",
        title: body.approve ? `Handed over: ${task.title}` : `Hand-over declined: ${task.title}`,
        body: withNote(body.approve ? `"${task.title}" has been reassigned. Thanks for flagging it.` : `"${task.title}" stays with you.`),
        link,
        email: true,
      });
      if (newAssignee) await notifyAssigned(db, { ...task, ...changes, assigneeId: newAssignee } as TaskRow, req.user!.sub);
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: `task_request.${body.approve ? "approve" : "decline"}`, entityType: "task", entityId: task.id, metadata: { kind: request.kind }, ipAddress: req.ip });
    res.json({ request: decided });
  });

  /** Kickoff, progress check-ins and blockers, newest first. */
  router.get("/:id/updates", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    res.json({ updates: await db.query.taskUpdates.findMany({ where: eq(taskUpdates.taskId, task.id), orderBy: (u, { desc }) => [desc(u.createdAt)] }) });
  });

  router.post("/:id/updates", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    const canWrite = task.assigneeId === req.user!.sub || (await canEditTask(db, req.user!.sub, req.user!.role, task));
    if (!canWrite) throw new ForbiddenError("Only the assignee or the task's reviewers can post updates");
    if (["done", "cancelled"].includes(task.status)) throw new AppError("INVALID_STATE", "This task is closed", 400);
    const body = updateSchema.parse(req.body);
    const [update] = await db.insert(taskUpdates).values({ taskId: task.id, userId: req.user!.sub, kind: body.kind, body: body.body, progressPercent: body.progressPercent ?? null, branchOrLink: body.branchOrLink || null }).returning();
    if (body.progressPercent !== undefined) await db.update(tasks).set({ progressPercent: body.progressPercent, updatedAt: new Date() }).where(eq(tasks.id, task.id));
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: body.kind === "blocker" ? "blocker" : "progress", note: body.body });
    const others = [task.assigneeId, task.createdBy].filter((id): id is string => !!id && id !== req.user!.sub);
    if (others.length) {
      await notify(db, {
        userIds: others,
        actorUserId: req.user!.sub,
        kind: body.kind === "blocker" ? "task.blocked" : "task.progress",
        title: body.kind === "blocker" ? `Blocked: ${task.title}` : `Update on ${task.title}${body.progressPercent !== undefined ? ` (${body.progressPercent}%)` : ""}`,
        body: body.body.length > 240 ? `${body.body.slice(0, 240)}…` : body.body,
        link: `/tasks/${task.id}`,
        email: body.kind === "blocker",
      });
    }
    res.status(201).json({ update });
  });

  router.get("/:id/timeline", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    res.json({ timeline: await db.query.taskEvents.findMany({ where: eq(taskEvents.taskId, task.id), orderBy: (e, { asc }) => [asc(e.createdAt)] }) });
  });

  router.post("/:id/comments", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const body = commentSchema.parse(req.body);
    // Only people who can open the task can be mentioned on it.
    const candidates = [...new Set(body.mentionedUserIds)].filter((id) => id !== req.user!.sub);
    const mentioned: string[] = [];
    if (candidates.length) {
      const people = await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, candidates), columns: { id: true, role: true } });
      for (const p of people) if (await canAccessTask(db, p.id, p.role, task)) mentioned.push(p.id);
    }
    const [comment] = await db.insert(taskComments).values({ taskId: task.id, authorId: req.user!.sub, body: body.body, mentionedUserIds: mentioned }).returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "comment" });
    await addWatchers(db, task.id, [req.user!.sub, ...mentioned]);
    const ref = await taskRef(db, task);
    const excerpt = body.body.length > 200 ? `${body.body.slice(0, 200)}…` : body.body;
    const who = await displayNameFor(db, req.user!.sub);
    if (mentioned.length) {
      await notify(db, { userIds: mentioned, actorUserId: req.user!.sub, kind: "task.mention", title: `${who} mentioned you on ${ref}`, body: excerpt, link: `/tasks/${task.id}`, email: true });
    }
    const followers = (await projectSettings(db, task.projectId)).notifications.comment
      ? (await watcherIds(db, task.id)).concat([task.assigneeId, task.createdBy].filter((x): x is string => !!x))
      : [];
    await emitAutomation(db, "comment_added", task, { actorUserId: req.user!.sub });
    await notify(db, {
      userIds: [...new Set(followers)].filter((id) => !mentioned.includes(id)),
      actorUserId: req.user!.sub,
      kind: "task.comment",
      title: `New comment on ${ref}`,
      body: excerpt,
      link: `/tasks/${task.id}`,
    });
    res.status(201).json({ comment });
  });

  router.get("/:id/comments", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    res.json({ comments: await db.query.taskComments.findMany({ where: eq(taskComments.taskId, task.id), orderBy: (c, { asc }) => [asc(c.createdAt)] }) });
  });

  router.post("/:id/attachments", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const body = attachmentSchema.parse(req.body);
    const file = await claimFile(db, body.fileUrl, req.user!.sub, "task_attachment", { allowLinks: true });
    const [attachment] = await db.insert(taskAttachments).values({ taskId: task.id, ...body, uploadedBy: req.user!.sub }).returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "attachment_added" });
    res.status(201).json({ attachment: { ...attachment, file: file ? publicFile(file) : null } });
  });

  router.delete("/:id/attachments/:attachmentId", requireAuth(env), async (req, res) => {
    const attachment = await db.query.taskAttachments.findFirst({ where: and(eq(taskAttachments.id, req.params.attachmentId), eq(taskAttachments.taskId, req.params.id)) });
    if (!attachment) throw new NotFoundError("Attachment not found");
    const privileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (attachment.uploadedBy !== req.user!.sub && !privileged) throw new ForbiddenError("Only the person who added it can remove it");
    await db.delete(taskAttachments).where(eq(taskAttachments.id, attachment.id));
    res.status(204).end();
  });

  router.get("/:id/attachments", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const rows = await db.query.taskAttachments.findMany({ where: eq(taskAttachments.taskId, task.id), orderBy: (a, { asc }) => [asc(a.uploadedAt)] });
    res.json({ attachments: await Promise.all(rows.map(async (a) => ({ ...a, file: await fileForUrl(db, a.fileUrl).then((f) => (f ? publicFile(f) : null)) }))) });
  });

  router.post("/:id/time-entries", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (task.assigneeId !== req.user!.sub) throw new ForbiddenError("Only the assignee can log time against this task");
    const body = timeEntrySchema.parse(req.body);

    const [entry] = await db.insert(taskTimeEntries).values({ taskId: task.id, userId: req.user!.sub, hours: body.hours.toString(), entryDate: new Date(body.entryDate), note: body.note }).returning();
    const total = await recomputeHours(db, task.id);
    // Logging work burns down the remaining estimate, as in Jira.
    if (body.remainingHours !== undefined || task.remainingHours !== null) {
      const remaining = body.remainingHours ?? Math.max(0, Number(task.remainingHours) - body.hours);
      await db.update(tasks).set({ remainingHours: remaining.toString() }).where(eq(tasks.id, task.id));
    }
    res.status(201).json({ entry, taskActualHours: total });
  });

  router.get("/:id/time-entries", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const entries = await db.query.taskTimeEntries.findMany({ where: eq(taskTimeEntries.taskId, task.id), orderBy: (e, { desc }) => [desc(e.entryDate), desc(e.createdAt)] });
    const who = await namesFor(db, entries.map((e) => e.userId));
    const canManage = await canEditTask(db, req.user!.sub, req.user!.role, task);
    res.json({ entries: entries.map((e) => ({ ...e, userName: who.get(e.userId) ?? "Someone", canEdit: e.userId === req.user!.sub || canManage })) });
  });

  /** People fix their own work logs; the task's creator and project leads can fix anyone's. */
  async function editableEntry(req: { params: Record<string, string>; user?: { sub: string; role: string } }) {
    const entry = await db.query.taskTimeEntries.findFirst({ where: and(eq(taskTimeEntries.id, req.params.entryId), eq(taskTimeEntries.taskId, req.params.id)) });
    if (!entry) throw new NotFoundError("Work log not found");
    const task = (await db.query.tasks.findFirst({ where: eq(tasks.id, entry.taskId) }))!;
    if (entry.userId !== req.user!.sub && !(await canEditTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError("You can only change your own work logs");
    return entry;
  }

  router.put("/:id/time-entries/:entryId", requireAuth(env), async (req, res) => {
    const entry = await editableEntry(req);
    const body = timeEntryEditSchema.parse(req.body);
    const [updated] = await db
      .update(taskTimeEntries)
      .set({ hours: body.hours?.toString(), entryDate: body.entryDate ? new Date(body.entryDate) : undefined, note: body.note })
      .where(eq(taskTimeEntries.id, entry.id))
      .returning();
    res.json({ entry: updated, taskActualHours: await recomputeHours(db, entry.taskId) });
  });

  router.delete("/:id/time-entries/:entryId", requireAuth(env), async (req, res) => {
    const entry = await editableEntry(req);
    await db.delete(taskTimeEntries).where(eq(taskTimeEntries.id, entry.id));
    res.json({ taskActualHours: await recomputeHours(db, entry.taskId) });
  });

  router.post("/templates", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const body = templateSchema.parse(req.body);
    const [template] = await db.insert(taskTemplates).values({ ...body, defaultEstimateHours: body.defaultEstimateHours?.toString(), createdBy: req.user!.sub }).returning();
    res.status(201).json({ template });
  });

  router.get("/templates", requireAuth(env), async (_req, res) => {
    res.json({ templates: await db.query.taskTemplates.findMany() });
  });

  router.post("/from-template", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const body = fromTemplateSchema.parse(req.body);
    if (body.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, body.projectId))) throw new ForbiddenError();
    if (body.projectId && !(await allowedOnProject(db, req.user!, body.projectId, "createIssues"))) throw new ForbiddenError("On this project only the owner and leads create issues");
    await assertCanAssign(db, req.user!, body.assigneeId, body.projectId);
    const template = await db.query.taskTemplates.findFirst({ where: eq(taskTemplates.id, body.templateId) });
    if (!template) throw new NotFoundError("Task template not found");

    const [task] = await db
      .insert(tasks)
      .values({
        projectId: body.projectId,
        title: template.title,
        description: template.description,
        assigneeId: body.assigneeId,
        estimateHours: template.defaultEstimateHours,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        createdBy: req.user!.sub,
      })
      .returning();

    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "create_from_template", toStatus: "todo" });
    await notifyAssigned(db, task, req.user!.sub);
    res.status(201).json({ task });
  });

  router.post("/:id/recurrence", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canEditTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const body = recurrenceSchema.parse(req.body);
    const [recurrence] = await db.insert(taskRecurrences).values({ templateTaskId: task.id, frequency: body.frequency, nextRunAt: new Date(body.nextRunAt) }).returning();
    res.status(201).json({ recurrence });
  });

  router.post("/recurrences/:id/generate-next", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const recurrence = await db.query.taskRecurrences.findFirst({ where: eq(taskRecurrences.id, req.params.id) });
    if (!recurrence) throw new NotFoundError("Recurrence not found");
    if (!recurrence.active) throw new AppError("INACTIVE_RECURRENCE", "This recurrence is no longer active", 400);
    if (recurrence.nextRunAt > new Date()) {
      throw new AppError("NOT_DUE_YET", `Next occurrence isn't due until ${recurrence.nextRunAt.toISOString()}`, 400);
    }

    const templateTask = await db.query.tasks.findFirst({ where: eq(tasks.id, recurrence.templateTaskId) });
    if (!templateTask) throw new NotFoundError("Template task not found");
    if (!(await canEditTask(db, req.user!.sub, req.user!.role, templateTask))) throw new ForbiddenError();

    const { task: newTask, recurrence: updatedRecurrence } = await generateOccurrence(db, recurrence, templateTask, req.user!.sub);
    res.status(201).json({ task: newTask, recurrence: updatedRecurrence });
  });

  router.get("/me/dashboard", requireAuth(env), async (req, res) => {
    const mine = await db.query.tasks.findMany({ where: eq(tasks.assigneeId, req.user!.sub) });
    const byStatus: Record<string, number> = {};
    for (const t of mine) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const overdue = mine.filter((t) => t.dueDate && t.dueDate < new Date() && !["done", "cancelled"].includes(t.status));
    res.json({ totalTasks: mine.length, byStatus, overdueCount: overdue.length, tasks: mine });
  });

  router.get("/workload", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    if (projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, projectId))) throw new ForbiddenError();

    let rows: (typeof tasks.$inferSelect)[];
    if (projectId) {
      rows = await db.query.tasks.findMany({ where: eq(tasks.projectId, projectId) });
    } else if (PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number])) {
      rows = await db.query.tasks.findMany();
    } else {
      // A manager's team = projects they own or lead, plus anyone they've
      // handed a personal task to.
      const owned = await db.query.projects.findMany({ where: eq(projects.ownerId, req.user!.sub) });
      const led = await db.query.projectMembers.findMany({ where: and(eq(projectMembers.userId, req.user!.sub), eq(projectMembers.roleOnProject, "lead")) });
      const projectIds = [...new Set([...owned.map((p) => p.id), ...led.map((m) => m.projectId)])];
      const createdByMe = eq(tasks.createdBy, req.user!.sub);
      rows = await db.query.tasks.findMany({ where: projectIds.length ? or(inArray(tasks.projectId, projectIds), createdByMe) : createdByMe });
    }
    const byAssignee: Record<string, { total: number; active: number; overdue: number }> = {};
    for (const t of rows) {
      if (!t.assigneeId) continue;
      byAssignee[t.assigneeId] ??= { total: 0, active: 0, overdue: 0 };
      byAssignee[t.assigneeId].total += 1;
      if (!["done", "cancelled"].includes(t.status)) byAssignee[t.assigneeId].active += 1;
      if (t.dueDate && t.dueDate < new Date() && !["done", "cancelled"].includes(t.status)) byAssignee[t.assigneeId].overdue += 1;
    }
    res.json({ workload: byAssignee });
  });

  router.get("/growth/:userId", requireAuth(env), async (req, res) => {
    const targetUserId = req.params.userId;
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (targetUserId !== req.user!.sub && !isPrivileged) {
      // Managers see growth for their own direct reports only.
      const report = req.user!.role === "manager" ? await db.query.employees.findFirst({ where: and(eq(employees.userId, targetUserId), eq(employees.managerId, req.user!.sub)) }) : undefined;
      if (!report) throw new ForbiddenError();
    }

    const [myTasks, enrollments, applicationsForUser, skills] = await Promise.all([
      db.query.tasks.findMany({ where: eq(tasks.assigneeId, targetUserId) }),
      db.query.courseEnrollments.findMany({ where: eq(courseEnrollments.userId, targetUserId) }),
      db.query.applications.findMany({ where: eq(applications.userId, targetUserId) }),
      db.query.candidateSkills.findMany({ where: eq(candidateSkills.userId, targetUserId) }),
    ]);

    const applicationIds = applicationsForUser.map((a) => a.id);
    const attempts = applicationIds.length ? await db.query.assessmentAttempts.findMany({ where: (a, { inArray }) => inArray(a.applicationId, applicationIds) }) : [];
    const certs = await db.query.certificates.findMany({ where: eq(certificates.userId, targetUserId) });

    res.json({
      tasksCompleted: myTasks.filter((t) => t.status === "done").length,
      tasksActive: myTasks.filter((t) => !["done", "cancelled"].includes(t.status)).length,
      coursesCompleted: enrollments.filter((e) => e.status === "completed").length,
      coursesInProgress: enrollments.filter((e) => e.status === "enrolled").length,
      assessmentsPassed: attempts.filter((a) => a.passed === true).length,
      certificatesActive: certs.filter((c) => c.status === "issued").length,
      skillsCount: skills.length,
    });
  });

  // NOTE: /:id and /:id/... routes are registered AFTER every literal
  // single-segment path (templates, workload) on purpose — Express matches
  // routes in registration order, and "/templates" or "/workload" would
  // otherwise be captured by "/:id" first (treating the literal word as an
  // id and failing a uuid cast at the DB). Caught by live testing.
  // Accepts the id or the key (INV-42).
  /**
   * Hours logged per person per day. Everyone sees their own; project leads see
   * their projects' people; HR and admins see everyone. ?format=csv downloads it.
   */
  router.get("/timesheet", requireAuth(env), async (req, res) => {
    const q = timesheetSchema.parse(req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) throw new AppError("INVALID_RANGE", "Pick a range of up to three months", 400);
    const privileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (q.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, q.projectId))) throw new ForbiddenError();
    const scope: SQL[] = [sql`e.entry_date >= ${from}`, sql`e.entry_date < ${to}`];
    if (q.projectId) scope.push(sql`t.project_id = ${q.projectId}`);
    if (q.userId) scope.push(sql`e.user_id = ${q.userId}`);
    if (!privileged) {
      // Own logs, plus anyone's on projects the caller owns or leads.
      scope.push(sql`(e.user_id = ${req.user!.sub} OR t.project_id IN (
        SELECT id FROM projects WHERE owner_id = ${req.user!.sub}
        UNION SELECT project_id FROM project_members WHERE user_id = ${req.user!.sub} AND role_on_project = 'lead'))`);
    }
    const r = await db.execute<{ user_id: string; day: string; task_id: string; key: string | null; title: string; project: string | null; hours: string; note: string | null }>(sql`
      SELECT e.user_id, to_char(e.entry_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, t.id AS task_id,
             CASE WHEN p.key IS NOT NULL AND t.number IS NOT NULL THEN p.key || '-' || t.number END AS key,
             t.title, p.title AS project, e.hours::text AS hours, e.note
      FROM task_time_entries e JOIN tasks t ON t.id = e.task_id LEFT JOIN projects p ON p.id = t.project_id
      WHERE ${sql.join(scope, sql` AND `)}
      ORDER BY day, e.user_id
    `);
    const who = await namesFor(db, r.rows.map((x) => x.user_id));
    const rows = r.rows.map((x) => ({ userId: x.user_id, name: who.get(x.user_id) ?? "Someone", day: x.day, taskId: x.task_id, key: x.key, title: x.title, project: x.project, hours: Number(x.hours), note: x.note }));
    if (q.format === "csv") {
      const cell = (v: unknown) => {
        const text = v === null || v === undefined ? "" : String(v);
        // Quote, and defuse spreadsheet formulas.
        return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
      };
      const lines = [["Date", "Person", "Issue", "Title", "Project", "Hours", "Note"].map(cell).join(","), ...rows.map((x) => [x.day, x.name, x.key ?? "", x.title, x.project ?? "", x.hours, x.note ?? ""].map(cell).join(","))];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="timesheet-${q.from.slice(0, 10)}-to-${q.to.slice(0, 10)}.csv"`);
      return void res.send(lines.join("\r\n"));
    }
    const people = new Map<string, { userId: string; name: string; total: number; days: Record<string, number> }>();
    for (const x of rows) {
      const person = people.get(x.userId) ?? { userId: x.userId, name: x.name, total: 0, days: {} };
      person.total = Math.round((person.total + x.hours) * 100) / 100;
      person.days[x.day] = Math.round(((person.days[x.day] ?? 0) + x.hours) * 100) / 100;
      people.set(x.userId, person);
    }
    res.json({ people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), entries: rows });
  });

  /** Apply one change to many issues. Every issue must be one the caller may edit. */
  router.post("/bulk", requireAuth(env), async (req, res) => {
    const { taskIds, patch } = bulkSchema.parse(req.body);
    const rows = await db.query.tasks.findMany({ where: inArray(tasks.id, taskIds) });
    if (rows.length !== new Set(taskIds).size) throw new NotFoundError("Some of those issues no longer exist");
    for (const t of rows) {
      if (!(await canEditTask(db, req.user!.sub, req.user!.role, t))) throw new ForbiddenError(`You can't edit ${(await taskRef(db, t))}`);
      if (patch.assigneeId !== undefined) await assertCanAssign(db, req.user!, patch.assigneeId, t.projectId);
      if (patch.sprintId) await assertSprintFits(db, patch.sprintId, t.projectId);
      if (patch.fixVersionId) await assertVersionFits(db, patch.fixVersionId, t.projectId);
      if (patch.type === "epic" && t.parentTaskId) throw new AppError("INVALID_PARENT", `${await taskRef(db, t)} is a subtask and can't be an epic`, 400);
    }
    const names = {
      person: async (id: string) => (await namesFor(db, [id])).get(id) ?? "Someone",
      phase: async () => "A phase",
      task: async () => "A task",
      sprint: async (id: string) => (await db.query.sprints.findFirst({ where: eq(sprints.id, id), columns: { name: true } }))?.name ?? "A sprint",
      version: async (id: string) => (await db.query.projectVersions.findFirst({ where: eq(projectVersions.id, id), columns: { name: true } }))?.name ?? "A version",
    };
    const updated: TaskRow[] = [];
    for (const t of rows) {
      let labels = t.labels;
      if (patch.addLabels?.length) labels = [...new Set([...labels, ...patch.addLabels])].slice(0, 10);
      if (patch.removeLabels?.length) labels = labels.filter((l) => !patch.removeLabels!.includes(l));
      const [u] = await db
        .update(tasks)
        .set({
          assigneeId: patch.assigneeId,
          priority: patch.priority,
          type: patch.type,
          dueDate: patch.dueDate === null ? null : patch.dueDate ? new Date(patch.dueDate) : undefined,
          sprintId: patch.sprintId,
          fixVersionId: patch.fixVersionId,
          storyPoints: patch.storyPoints,
          labels,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, t.id))
        .returning();
      await recordChanges(db, t, u, req.user!.sub, names);
      if (u.assigneeId && u.assigneeId !== t.assigneeId) {
        await addWatchers(db, u.id, [u.assigneeId]);
        await notifyAssigned(db, u, req.user!.sub);
      }
      updated.push(u);
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "task.bulk_edit", entityType: "task", entityId: taskIds[0], ipAddress: req.ip, metadata: { count: taskIds.length, fields: Object.keys(patch) } });
    res.json({ updated: updated.length, tasks: await withKeys(db, updated) });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    const task = await findTaskByRef(db, req.params.id);
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const subtasks = await db.query.tasks.findMany({ where: eq(tasks.parentTaskId, task.id), orderBy: (t, { asc }) => [asc(t.createdAt)] });
    const parent = task.parentTaskId ? await db.query.tasks.findFirst({ where: eq(tasks.id, task.parentTaskId) }) : undefined;
    const watchers = await watcherIds(db, task.id);
    const names = await namesFor(db, watchers);
    const [keyed, ...keyedSubs] = await withKeys(db, [task, ...subtasks]);
    res.json({
      task: keyed,
      subtasks: keyedSubs,
      parent: parent ? (await withKeys(db, [parent]))[0] : null,
      watchers: watchers.map((id) => ({ id, name: names.get(id) ?? "Someone" })),
      watching: watchers.includes(req.user!.sub),
    });
  });

  router.post("/:id/watch", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    await addWatchers(db, task.id, [req.user!.sub]);
    res.json({ watching: true });
  });

  router.delete("/:id/watch", requireAuth(env), async (req, res) => {
    await db.delete(taskWatchers).where(and(eq(taskWatchers.taskId, req.params.id), eq(taskWatchers.userId, req.user!.sub)));
    res.json({ watching: false });
  });

  router.put("/:id", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    const body = updateTaskSchema.parse(req.body);
    // The assignee may edit their task's details; changing who it's
    // assigned to (or editing someone else's task) needs edit rights.
    const isEditor = await canEditTask(db, req.user!.sub, req.user!.role, task);
    if (!isEditor && task.assigneeId !== req.user!.sub) throw new ForbiddenError();
    if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
      if (!isEditor) throw new ForbiddenError("Only the task's creator or a project lead can reassign it");
      await assertCanAssign(db, req.user!, body.assigneeId, task.projectId);
    }

    if (body.milestoneId !== undefined && body.milestoneId !== task.milestoneId) {
      if (!isEditor) throw new ForbiddenError("Only the task's creator or a project lead can move it between roadmap phases");
      await assertMilestoneFits(db, body.milestoneId, task.projectId);
    }
    if (body.type === "epic" && task.parentTaskId) throw new AppError("INVALID_PARENT", "A subtask can't be an epic", 400);
    if (body.sprintId !== undefined && body.sprintId !== task.sprintId) {
      if (!isEditor) throw new ForbiddenError("Only the task's creator or a project lead can move it between sprints");
      await assertSprintFits(db, body.sprintId, task.projectId);
    }
    if (body.fixVersionId !== undefined && body.fixVersionId !== task.fixVersionId) {
      if (!isEditor) throw new ForbiddenError("Only the task's creator or a project lead can change its version");
      await assertVersionFits(db, body.fixVersionId, task.projectId);
    }

    const [updated] = await db
      .update(tasks)
      .set({
        ...body,
        estimateHours: body.estimateHours?.toString(),
        dueDate: body.dueDate === null ? null : body.dueDate ? new Date(body.dueDate) : undefined,
        startDate: body.startDate === null ? null : body.startDate ? new Date(body.startDate) : undefined,
        remainingHours: body.remainingHours === null ? null : body.remainingHours?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))
      .returning();
    await recordChanges(db, task, updated, req.user!.sub, {
      person: async (id) => (await namesFor(db, [id])).get(id) ?? "Someone",
      phase: async (id) => (await db.query.projectMilestones.findFirst({ where: eq(projectMilestones.id, id), columns: { title: true } }))?.title ?? "A phase",
      task: async (id) => {
        const t = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
        return t ? taskRef(db, t) : "A task";
      },
      sprint: async (id) => (await db.query.sprints.findFirst({ where: eq(sprints.id, id), columns: { name: true } }))?.name ?? "A sprint",
      version: async (id) => (await db.query.projectVersions.findFirst({ where: eq(projectVersions.id, id), columns: { name: true } }))?.name ?? "A version",
    });
    if (updated.assigneeId && updated.assigneeId !== task.assigneeId) {
      await addWatchers(db, task.id, [updated.assigneeId]);
      await notifyAssigned(db, updated, req.user!.sub);
    }
    if (updated.assigneeId !== task.assigneeId) await emitAutomation(db, "issue_assigned", updated, { actorUserId: req.user!.sub });
    res.json({ task: (await withKeys(db, [updated]))[0] });
  });

  return router;
}

type TaskRow = typeof tasks.$inferSelect;

/** Who answers requests on a task: its creator and its project's owner and leads. */
async function taskReviewerIds(db: Database, task: TaskRow) {
  const ids = new Set<string>([task.createdBy]);
  if (task.projectId) {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, task.projectId) });
    if (project) ids.add(project.ownerId);
    const leads = await db.query.projectMembers.findMany({ where: and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.roleOnProject, "lead")) });
    leads.forEach((l) => ids.add(l.userId));
  }
  return [...ids];
}

async function notifyAssigned(db: Database, task: TaskRow, actorUserId: string) {
  if (!(await projectSettings(db, task.projectId)).notifications.assigned) return;
  const due = task.dueDate ? ` It's due ${formatWhen(task.dueDate)}.` : "";
  await notify(db, {
    userIds: [task.assigneeId],
    actorUserId,
    kind: "task.assigned",
    title: `New task: ${task.title}`,
    body: `You've been assigned "${task.title}" (${task.priority} priority).${due}`,
    link: `/tasks/${task.id}`,
    email: true,
  });
}

/** Who hears about a move: the other side of the assignee/reviewer pair. */
async function notifyTransition(db: Database, task: TaskRow, to: TaskStatus, actorUserId: string, note?: string, rating?: number) {
  const link = `/tasks/${task.id}`;
  const withNote = (text: string) => (note ? `${text}\n\n"${note}"` : text);
  switch (to) {
    case "in_review":
      await notify(db, { userIds: [task.createdBy], actorUserId, kind: "task.in_review", title: `Ready for review: ${task.title}`, body: `"${task.title}" has been submitted for your review.`, link, email: true });
      break;
    case "changes_requested":
      await notify(db, { userIds: [task.assigneeId], actorUserId, kind: "task.changes_requested", title: `Changes requested: ${task.title}`, body: withNote(`Your reviewer asked for changes on "${task.title}".`), link, email: true });
      break;
    case "done":
      await notify(db, { userIds: [task.assigneeId], actorUserId, kind: "task.done", title: `Approved: ${task.title}`, body: `"${task.title}" was reviewed and marked done.${rating ? ` Your reviewer rated it ${rating} out of 5 stars.` : ""}`, link });
      break;
    case "cancelled":
      await notify(db, { userIds: [task.assigneeId, task.createdBy], actorUserId, kind: "task.cancelled", title: `Cancelled: ${task.title}`, body: withNote(`"${task.title}" was cancelled.`), link });
      break;
    default:
      break;
  }
}

type RecurrenceRow = typeof taskRecurrences.$inferSelect;

/** Creates the next task in a series and moves the series' next run on. */
async function generateOccurrence(db: Database, recurrence: RecurrenceRow, templateTask: TaskRow, actorUserId: string) {
  const [newTask] = await db
    .insert(tasks)
    .values({
      projectId: templateTask.projectId,
      title: templateTask.title,
      description: templateTask.description,
      assigneeId: templateTask.assigneeId,
      priority: templateTask.priority,
      estimateHours: templateTask.estimateHours,
      createdBy: actorUserId,
    })
    .returning();
  await db.insert(taskEvents).values({ taskId: newTask.id, actorUserId, action: "create_from_recurrence", toStatus: "todo" });
  const [updated] = await db.update(taskRecurrences).set({ nextRunAt: addInterval(recurrence.nextRunAt, recurrence.frequency) }).where(eq(taskRecurrences.id, recurrence.id)).returning();
  await notifyAssigned(db, newTask, actorUserId);
  return { task: newTask, recurrence: updated };
}

/**
 * Run by the job worker: creates every recurring task that has come due,
 * as its original creator. The conditional update on nextRunAt means two
 * workers racing on the same series create it once.
 */
export async function generateDueRecurrences(db: Database, now = new Date()) {
  const due = await db.query.taskRecurrences.findMany({ where: and(eq(taskRecurrences.active, true), lte(taskRecurrences.nextRunAt, now)), limit: 200 });
  let created = 0;
  for (const recurrence of due) {
    const templateTask = await db.query.tasks.findFirst({ where: eq(tasks.id, recurrence.templateTaskId) });
    if (!templateTask) continue;
    const [claimed] = await db
      .update(taskRecurrences)
      .set({ nextRunAt: addInterval(recurrence.nextRunAt, recurrence.frequency) })
      .where(and(eq(taskRecurrences.id, recurrence.id), eq(taskRecurrences.nextRunAt, recurrence.nextRunAt)))
      .returning();
    if (!claimed) continue;
    // generateOccurrence advances nextRunAt itself, so hand it the pre-claim row.
    await generateOccurrence(db, { ...recurrence, nextRunAt: recurrence.nextRunAt }, templateTask, templateTask.createdBy);
    created++;
  }
  return created;
}

/** "INV-42 Fix the login page", or just the title for a personal task. */
async function taskRef(db: Database, task: TaskRow) {
  const [keyed] = await withKeys(db, [task]);
  return keyed.key ? `${keyed.key} ${task.title}` : `"${task.title}"`;
}

/** Display names for user ids. */
async function namesFor(db: Database, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out = new Map<string, string>();
  await Promise.all(unique.map(async (id) => out.set(id, await displayNameFor(db, id))));
  return out;
}

/** Watchers hear when a task is approved, cancelled or sent for review; the assignee and creator already get their own alerts. */
async function notifyWatchersOfMove(db: Database, task: TaskRow, to: TaskStatus, actorUserId: string) {
  if (!["in_review", "done", "cancelled"].includes(to)) return;
  const others = (await watcherIds(db, task.id)).filter((id) => id !== task.assigneeId && id !== task.createdBy);
  if (!others.length) return;
  const label = { in_review: "is ready for review", done: "is done", cancelled: "was cancelled" }[to as "in_review" | "done" | "cancelled"];
  await notify(db, { userIds: others, actorUserId, kind: "task.watch", title: `${await taskRef(db, task)} ${label}`, body: `A task you follow ${label}.`, link: `/tasks/${task.id}` });
}

/** Re-adds a task's logged hours after a work log changes. */
async function recomputeHours(db: Database, taskId: string) {
  const [{ total }] = await db.select({ total: sql<string>`coalesce(sum(${taskTimeEntries.hours}), 0)::text` }).from(taskTimeEntries).where(eq(taskTimeEntries.taskId, taskId));
  await db.update(tasks).set({ actualHours: total, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  return Number(total);
}
