import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { projects, projectMembers, projectMilestones, projectRisks, projectIssues } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;
const MANAGER_LIKE_ROLES = ["manager", "hr", "admin", "super_admin"] as const;

const createProjectSchema = z.object({ title: z.string().min(2).max(200), description: z.string().max(5000).optional(), ownerId: z.string().uuid() });
const updateProjectSchema = z.object({ title: z.string().min(2).max(200).optional(), description: z.string().max(5000).optional(), status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).optional() });
const addMemberSchema = z.object({ userId: z.string().uuid(), roleOnProject: z.enum(["lead", "member"]).default("member") });
const createMilestoneSchema = z.object({ title: z.string().min(2).max(200), dueDate: z.string().datetime().optional() });
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
    const [project] = await db.insert(projects).values({ ...body, createdBy: req.user!.sub }).returning();
    await db.insert(projectMembers).values({ projectId: project.id, userId: body.ownerId, roleOnProject: "lead" }).onConflictDoNothing();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "project.create", entityType: "project", entityId: project.id, ipAddress: req.ip });
    res.status(201).json({ project });
  });

  // Only projects the caller is a member/owner of, or all of them if privileged.
  router.get("/", requireAuth(env), async (req, res) => {
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (isPrivileged) {
      res.json({ projects: await db.query.projects.findMany() });
      return;
    }
    const memberships = await db.query.projectMembers.findMany({ where: eq(projectMembers.userId, req.user!.sub) });
    const ownedOrMember = await db.query.projects.findMany();
    const memberProjectIds = new Set(memberships.map((m) => m.projectId));
    res.json({ projects: ownedOrMember.filter((p) => p.ownerId === req.user!.sub || memberProjectIds.has(p.id)) });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id) });
    if (!project) throw new NotFoundError("Project not found");
    const members = await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, project.id) });
    res.json({ project, members });
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
      const [member] = await db.insert(projectMembers).values({ projectId: req.params.id, ...body }).returning();
      res.status(201).json({ member });
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
        throw new AppError("ALREADY_MEMBER", "User is already a project member", 409);
      }
      throw err;
    }
  });

  router.post("/:id/milestones", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const body = createMilestoneSchema.parse(req.body);
    const [milestone] = await db.insert(projectMilestones).values({ projectId: req.params.id, title: body.title, dueDate: body.dueDate ? new Date(body.dueDate) : undefined }).returning();
    res.status(201).json({ milestone });
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
