import { Router } from "express";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  tasks,
  taskTemplates,
  taskRecurrences,
  taskAttachments,
  taskComments,
  taskTimeEntries,
  taskEvents,
  courseEnrollments,
  assessmentAttempts,
  applications,
  certificates,
  candidateSkills,
} from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { logger } from "../shared/logger.js";
import { isAssigneeTransitionAllowed, isReviewerTransitionAllowed, type TaskStatus } from "./state-machine.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";
import type { Env } from "../shared/env.js";

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
});

const updateTaskSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  estimateHours: z.number().min(0).optional(),
  dueDate: z.string().datetime().optional(),
});

const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"]).optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const transitionSchema = z.object({ toStatus: z.enum(["in_progress", "in_review", "done", "changes_requested", "cancelled"]), note: z.string().max(2000).optional() });
const commentSchema = z.object({ body: z.string().min(1).max(5000) });
const attachmentSchema = z.object({ fileName: z.string().min(1).max(300), fileUrl: z.string().min(1).max(2000) });
const timeEntrySchema = z.object({ hours: z.number().min(0.1).max(24), entryDate: z.string().datetime(), note: z.string().max(1000).optional() });
const templateSchema = z.object({ title: z.string().min(2).max(200), description: z.string().max(5000).optional(), defaultEstimateHours: z.number().min(0).optional() });
const fromTemplateSchema = z.object({ templateId: z.string().uuid(), projectId: z.string().uuid().optional(), assigneeId: z.string().uuid().optional(), dueDate: z.string().datetime().optional() });
const recurrenceSchema = z.object({ frequency: z.enum(["daily", "weekly", "monthly"]), nextRunAt: z.string().datetime() });

function addInterval(date: Date, frequency: "daily" | "weekly" | "monthly"): Date {
  const d = new Date(date);
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
}

async function canAccessTask(db: Database, userId: string, role: string, task: typeof tasks.$inferSelect): Promise<boolean> {
  if (PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])) return true;
  if (task.assigneeId === userId || task.createdBy === userId) return true;
  if (task.projectId) return canAccessProject(db, userId, role, task.projectId);
  return false;
}

export function tasksRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), async (req, res) => {
    const body = createTaskSchema.parse(req.body);
    if (body.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, body.projectId))) throw new ForbiddenError();

    if (body.parentTaskId) {
      const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, body.parentTaskId) });
      if (!parent) throw new NotFoundError("Parent task not found");
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
        createdBy: req.user!.sub,
      })
      .returning();

    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "create", toStatus: "todo" });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "task.create", entityType: "task", entityId: task.id, ipAddress: req.ip });
    res.status(201).json({ task });
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

    const rows = await db.query.tasks.findMany({ where: conditions.length ? and(...conditions) : undefined, limit: query.limit });
    res.json({ tasks: rows });
  });

  router.post("/:id/transition", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();

    const body = transitionSchema.parse(req.body);
    const from = task.status as TaskStatus;
    const isAssignee = task.assigneeId === req.user!.sub;
    const isReviewer =
      PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]) ||
      task.createdBy === req.user!.sub ||
      (task.projectId ? await canManageProject(db, req.user!.sub, req.user!.role, task.projectId) : false);

    const allowed = (isAssignee && isAssigneeTransitionAllowed(from, body.toStatus)) || (isReviewer && isReviewerTransitionAllowed(from, body.toStatus));
    if (!allowed) {
      throw new AppError("INVALID_TRANSITION", `Cannot move task from "${from}" to "${body.toStatus}" as this user`, 400);
    }

    await db.transaction(async (tx) => {
      await tx.update(tasks).set({ status: body.toStatus, updatedAt: new Date() }).where(eq(tasks.id, task.id));
      await tx.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "status_change", fromStatus: from, toStatus: body.toStatus, note: body.note });
    });

    if (body.toStatus === "changes_requested") {
      logger.info({ taskId: task.id, assigneeId: task.assigneeId, note: body.note }, "[NOTIFICATION STUB] Changes requested on task");
    }

    res.json({ message: `Task moved to ${body.toStatus}.` });
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
    const [comment] = await db.insert(taskComments).values({ taskId: task.id, authorId: req.user!.sub, body: body.body }).returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "comment" });
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
    const [attachment] = await db.insert(taskAttachments).values({ taskId: task.id, ...body, uploadedBy: req.user!.sub }).returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "attachment_added" });
    res.status(201).json({ attachment });
  });

  router.get("/:id/attachments", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    res.json({ attachments: await db.query.taskAttachments.findMany({ where: eq(taskAttachments.taskId, task.id) }) });
  });

  router.post("/:id/time-entries", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (task.assigneeId !== req.user!.sub) throw new ForbiddenError("Only the assignee can log time against this task");
    const body = timeEntrySchema.parse(req.body);

    const [entry] = await db.insert(taskTimeEntries).values({ taskId: task.id, userId: req.user!.sub, hours: body.hours.toString(), entryDate: new Date(body.entryDate), note: body.note }).returning();

    const allEntries = await db.query.taskTimeEntries.findMany({ where: eq(taskTimeEntries.taskId, task.id) });
    const total = allEntries.reduce((sum, e) => sum + Number(e.hours), 0);
    await db.update(tasks).set({ actualHours: total.toString(), updatedAt: new Date() }).where(eq(tasks.id, task.id));

    res.status(201).json({ entry, taskActualHours: total });
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
    res.status(201).json({ task });
  });

  router.post("/:id/recurrence", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
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

    const [newTask] = await db
      .insert(tasks)
      .values({
        projectId: templateTask.projectId,
        title: templateTask.title,
        description: templateTask.description,
        assigneeId: templateTask.assigneeId,
        priority: templateTask.priority,
        estimateHours: templateTask.estimateHours,
        createdBy: req.user!.sub,
      })
      .returning();
    await db.insert(taskEvents).values({ taskId: newTask.id, actorUserId: req.user!.sub, action: "create_from_recurrence", toStatus: "todo" });

    const [updatedRecurrence] = await db.update(taskRecurrences).set({ nextRunAt: addInterval(recurrence.nextRunAt, recurrence.frequency) }).where(eq(taskRecurrences.id, recurrence.id)).returning();

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

    const rows = await db.query.tasks.findMany({ where: projectId ? eq(tasks.projectId, projectId) : undefined });
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
    const isManager = req.user!.role === "manager"; // MVP: any manager can view; team-scoping deferred (same limitation as earlier phases' manager role)
    if (targetUserId !== req.user!.sub && !isPrivileged && !isManager) throw new ForbiddenError();

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
  router.get("/:id", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const subtasks = await db.query.tasks.findMany({ where: eq(tasks.parentTaskId, task.id) });
    res.json({ task, subtasks });
  });

  router.put("/:id", requireAuth(env), async (req, res) => {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const body = updateTaskSchema.parse(req.body);

    const [updated] = await db
      .update(tasks)
      .set({ ...body, estimateHours: body.estimateHours?.toString(), dueDate: body.dueDate ? new Date(body.dueDate) : undefined, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    res.json({ task: updated });
  });

  return router;
}
