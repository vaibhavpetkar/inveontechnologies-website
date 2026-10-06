import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { projects, projectMembers, projectMilestones, projectRisks, projectIssues, tasks, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;
const MANAGER_LIKE_ROLES = ["manager", "hr", "admin", "super_admin"] as const;

const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const createProjectSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(5000).optional(),
  // Defaults to the person creating it.
  ownerId: z.string().uuid().optional(),
  memberIds: z.array(z.string().uuid()).max(200).default([]),
  githubRepo: z.string().trim().regex(repoPattern, "Use owner/name").optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).optional(),
});
const updateProjectSchema = z.object({ title: z.string().min(2).max(200).optional(), description: z.string().max(5000).optional(), status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).optional() });
const addMemberSchema = z.object({ userId: z.string().uuid(), roleOnProject: z.enum(["lead", "member"]).default("member") });
const createMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(4000).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});
const updateMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(["pending", "completed"]).optional(),
  orderIndex: z.number().int().min(0).max(10_000).optional(),
});

type Person = { id: string; name: string; email: string; role: string };
async function peopleById(db: Database, ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute<Person>(sql`
    SELECT u.id, u.email, u.role, coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
    FROM users u LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
    WHERE u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
  return new Map(rows.rows.map((r) => [r.id, r]));
}

/** Done/total counts per project and per roadmap phase, cancelled tasks left out. */
function progressOf(rows: { status: string }[]) {
  const live = rows.filter((t) => t.status !== "cancelled");
  const done = live.filter((t) => t.status === "done").length;
  return { total: live.length, done, percent: live.length ? Math.round((done / live.length) * 100) : 0 };
}
const createRiskSchema = z.object({ title: z.string().min(2).max(200), description: z.string().max(2000).optional(), severity: z.enum(["low", "medium", "high"]).default("medium") });
const createIssueSchema = createRiskSchema;

export async function canAccessProject(db: Database, userId: string, role: string, projectId: string): Promise<boolean> {
  if (PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])) return true;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return false;
  if (project.ownerId === userId) return true;
  const membership = await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)) });
  return !!membership;
}

export async function canManageProject(db: Database, userId: string, role: string, projectId: string): Promise<boolean> {
  if (PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])) return true;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return false;
  if (project.ownerId === userId) return true;
  const membership = await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)) });
  return membership?.roleOnProject === "lead";
}

export function projectsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...MANAGER_LIKE_ROLES), async (req, res) => {
    const body = createProjectSchema.parse(req.body);
    const ownerId = body.ownerId ?? req.user!.sub;
    const memberIds = [...new Set(body.memberIds.filter((id) => id !== ownerId))];
    if (memberIds.length) {
      const found = await db.query.users.findMany({ where: inArray(users.id, memberIds), columns: { id: true, role: true } });
      if (found.length !== memberIds.length || found.some((u) => u.role === "candidate")) throw new AppError("INVALID_MEMBER", "Project members must be staff accounts", 400);
    }
    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({ title: body.title, description: body.description, ownerId, githubRepo: body.githubRepo, status: body.status ?? "planning", createdBy: req.user!.sub })
        .returning();
      await tx.insert(projectMembers).values([{ projectId: created.id, userId: ownerId, roleOnProject: "lead" as const }, ...memberIds.map((userId) => ({ projectId: created.id, userId }))]).onConflictDoNothing();
      return created;
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "project.create", entityType: "project", entityId: project.id, ipAddress: req.ip });
    const added = [ownerId, ...memberIds].filter((id) => id !== req.user!.sub);
    if (added.length) await notify(db, { userIds: added, actorUserId: req.user!.sub, kind: "project.added", title: `Added to project: ${project.title}`, body: project.description?.slice(0, 200) ?? "Open it to see the roadmap and your tasks.", link: `/projects/${project.id}` });
    res.status(201).json({ project });
  });

  // Only projects the caller is a member/owner of, or all of them if privileged, with progress for the list.
  router.get("/", requireAuth(env), async (req, res) => {
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    const all = await db.query.projects.findMany({ orderBy: (p, { desc }) => [desc(p.updatedAt)] });
    let visible = all;
    if (!isPrivileged) {
      const memberships = await db.query.projectMembers.findMany({ where: eq(projectMembers.userId, req.user!.sub) });
      const memberProjectIds = new Set(memberships.map((m) => m.projectId));
      visible = all.filter((p) => p.ownerId === req.user!.sub || memberProjectIds.has(p.id));
    }
    const ids = visible.map((p) => p.id);
    const [taskRows, memberRows, milestoneRows] = ids.length
      ? await Promise.all([
          db.select({ projectId: tasks.projectId, status: tasks.status }).from(tasks).where(inArray(tasks.projectId, ids)),
          db.select({ projectId: projectMembers.projectId, userId: projectMembers.userId }).from(projectMembers).where(inArray(projectMembers.projectId, ids)),
          db.select().from(projectMilestones).where(inArray(projectMilestones.projectId, ids)).orderBy(asc(projectMilestones.orderIndex), asc(projectMilestones.dueDate)),
        ])
      : [[], [], []];
    const who = await peopleById(db, [...new Set([...memberRows.map((m) => m.userId), ...visible.map((p) => p.ownerId)])]);
    res.json({
      projects: visible.map((p) => {
        const next = milestoneRows.find((m) => m.projectId === p.id && m.status === "pending");
        return {
          ...p,
          owner: who.get(p.ownerId) ? { id: p.ownerId, name: who.get(p.ownerId)!.name } : null,
          members: memberRows.filter((m) => m.projectId === p.id).map((m) => ({ id: m.userId, name: who.get(m.userId)?.name ?? "Someone" })),
          progress: progressOf(taskRows.filter((t) => t.projectId === p.id)),
          milestones: { total: milestoneRows.filter((m) => m.projectId === p.id).length, done: milestoneRows.filter((m) => m.projectId === p.id && m.status === "completed").length },
          nextMilestone: next ? { id: next.id, title: next.title, dueDate: next.dueDate } : null,
        };
      }),
    });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id) });
    if (!project) throw new NotFoundError("Project not found");
    const members = await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, project.id) });
    res.json({ project, members });
  });

  /**
   * One call for the project page: members with names, the roadmap with
   * each phase's progress, and every task on the project's board.
   */
  router.get("/:id/overview", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id) });
    if (!project) throw new NotFoundError("Project not found");
    const [members, milestones, projectTasks] = await Promise.all([
      db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, project.id) }),
      db.query.projectMilestones.findMany({ where: eq(projectMilestones.projectId, project.id), orderBy: [asc(projectMilestones.orderIndex), asc(projectMilestones.dueDate)] }),
      db.query.tasks.findMany({ where: eq(tasks.projectId, project.id), orderBy: (t, { desc }) => [desc(t.updatedAt)], limit: 1000 }),
    ]);
    const who = await peopleById(db, [...new Set([project.ownerId, ...members.map((m) => m.userId)])]);
    res.json({
      project,
      canManage: await canManageProject(db, req.user!.sub, req.user!.role, project.id),
      members: members.map((m) => ({ ...m, name: who.get(m.userId)?.name ?? "Someone", email: who.get(m.userId)?.email ?? "", role: who.get(m.userId)?.role ?? "employee" })),
      milestones: milestones.map((m) => ({ ...m, progress: progressOf(projectTasks.filter((t) => t.milestoneId === m.id)) })),
      tasks: projectTasks,
      progress: progressOf(projectTasks),
    });
  });

  router.put("/:id", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const body = updateProjectSchema.parse(req.body);
    const [updated] = await db.update(projects).set({ ...body, updatedAt: new Date() }).where(eq(projects.id, req.params.id)).returning();
    if (!updated) throw new NotFoundError("Project not found");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "project.update", entityType: "project", entityId: updated.id, ipAddress: req.ip });
    res.json({ project: updated });
  });

  router.post("/:id/members", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const body = addMemberSchema.parse(req.body);
    try {
      const person = await db.query.users.findFirst({ where: eq(users.id, body.userId), columns: { role: true } });
      if (!person || person.role === "candidate") throw new AppError("INVALID_MEMBER", "Project members must be staff accounts", 400);
      const [member] = await db.insert(projectMembers).values({ projectId: req.params.id, ...body }).returning();
      const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id), columns: { title: true } });
      if (body.userId !== req.user!.sub) await notify(db, { userIds: [body.userId], actorUserId: req.user!.sub, kind: "project.added", title: `Added to project: ${project?.title ?? "a project"}`, link: `/projects/${req.params.id}` });
      res.status(201).json({ member });
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
        throw new AppError("ALREADY_MEMBER", "User is already a project member", 409);
      }
      throw err;
    }
  });

  router.delete("/:id/members/:userId", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id) });
    if (!project) throw new NotFoundError("Project not found");
    if (project.ownerId === req.params.userId) throw new AppError("OWNER_REQUIRED", "The project owner stays on the project", 400);
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, req.params.userId)));
    res.status(204).end();
  });

  router.post("/:id/milestones", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const body = createMilestoneSchema.parse(req.body);
    const [{ next }] = (await db.execute<{ next: number }>(sql`SELECT coalesce(max(order_index) + 1, 0)::int AS next FROM project_milestones WHERE project_id = ${req.params.id}`)).rows;
    const [milestone] = await db
      .insert(projectMilestones)
      .values({ projectId: req.params.id, title: body.title, description: body.description, startDate: body.startDate ? new Date(body.startDate) : undefined, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, orderIndex: next })
      .returning();
    res.status(201).json({ milestone });
  });

  router.get("/:id/milestones", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    res.json({ milestones: await db.query.projectMilestones.findMany({ where: eq(projectMilestones.projectId, req.params.id), orderBy: [asc(projectMilestones.orderIndex), asc(projectMilestones.dueDate)] }) });
  });

  router.put("/milestones/:id", requireAuth(env), async (req, res) => {
    const milestone = await db.query.projectMilestones.findFirst({ where: eq(projectMilestones.id, req.params.id) });
    if (!milestone) throw new NotFoundError("Milestone not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, milestone.projectId))) throw new ForbiddenError();
    const body = updateMilestoneSchema.parse(req.body);
    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
    const [updated] = await db
      .update(projectMilestones)
      .set({
        title: body.title,
        description: body.description,
        startDate: toDate(body.startDate),
        dueDate: toDate(body.dueDate),
        orderIndex: body.orderIndex,
        ...(body.status ? { status: body.status, completedAt: body.status === "completed" ? new Date() : null } : {}),
      })
      .where(eq(projectMilestones.id, milestone.id))
      .returning();
    res.json({ milestone: updated });
  });

  router.delete("/milestones/:id", requireAuth(env), async (req, res) => {
    const milestone = await db.query.projectMilestones.findFirst({ where: eq(projectMilestones.id, req.params.id) });
    if (!milestone) throw new NotFoundError("Milestone not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, milestone.projectId))) throw new ForbiddenError();
    await db.delete(projectMilestones).where(eq(projectMilestones.id, milestone.id)); // its tasks stay, just without a phase
    res.status(204).end();
  });

  router.post("/milestones/:id/complete", requireAuth(env), async (req, res) => {
    const milestone = await db.query.projectMilestones.findFirst({ where: eq(projectMilestones.id, req.params.id) });
    if (!milestone) throw new NotFoundError("Milestone not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, milestone.projectId))) throw new ForbiddenError();
    const [updated] = await db.update(projectMilestones).set({ status: "completed", completedAt: new Date() }).where(eq(projectMilestones.id, milestone.id)).returning();
    res.json({ milestone: updated });
  });

  router.post("/:id/risks", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const body = createRiskSchema.parse(req.body);
    const [risk] = await db.insert(projectRisks).values({ projectId: req.params.id, ...body, createdBy: req.user!.sub }).returning();
    res.status(201).json({ risk });
  });

  router.get("/:id/risks", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    res.json({ risks: await db.query.projectRisks.findMany({ where: eq(projectRisks.projectId, req.params.id) }) });
  });

  router.post("/risks/:id/status", requireAuth(env), async (req, res) => {
    const { status } = z.object({ status: z.enum(["open", "mitigated", "closed"]) }).parse(req.body);
    const risk = await db.query.projectRisks.findFirst({ where: eq(projectRisks.id, req.params.id) });
    if (!risk) throw new NotFoundError("Risk not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, risk.projectId))) throw new ForbiddenError();
    const [updated] = await db.update(projectRisks).set({ status }).where(eq(projectRisks.id, risk.id)).returning();
    res.json({ risk: updated });
  });

  router.post("/:id/issues", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const body = createIssueSchema.parse(req.body);
    const [issue] = await db.insert(projectIssues).values({ projectId: req.params.id, ...body, createdBy: req.user!.sub }).returning();
    res.status(201).json({ issue });
  });

  router.get("/:id/issues", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    res.json({ issues: await db.query.projectIssues.findMany({ where: eq(projectIssues.projectId, req.params.id) }) });
  });

  router.post("/issues/:id/resolve", requireAuth(env), async (req, res) => {
    const issue = await db.query.projectIssues.findFirst({ where: eq(projectIssues.id, req.params.id) });
    if (!issue) throw new NotFoundError("Issue not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, issue.projectId))) throw new ForbiddenError();
    const [updated] = await db.update(projectIssues).set({ status: "resolved" }).where(eq(projectIssues.id, issue.id)).returning();
    res.json({ issue: updated });
  });

  return router;
}
