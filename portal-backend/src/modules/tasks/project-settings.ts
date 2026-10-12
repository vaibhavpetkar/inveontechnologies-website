import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { projects } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";

/**
 * A project's schemes, Jira-style but kept to what this portal's fixed
 * workflow can honour:
 * - workflow: rename board columns, hide "Changes requested", and decide
 *   whether work needs a reviewer's approval before it's done.
 * - permissions: who may create issues, plan sprints and edit any issue.
 * - notifications: which project events tell people.
 */

const STATUSES = ["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"] as const;
type Who = "members" | "leads";

export interface ProjectSettings {
  workflow: { labels: Partial<Record<(typeof STATUSES)[number], string>>; requireReview: boolean; showChangesRequested: boolean };
  permissions: { createIssues: Who; planSprints: Who; editAnyIssue: Who };
  notifications: { assigned: boolean; comment: boolean; statusChange: boolean; sprintStarted: boolean };
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  workflow: { labels: {}, requireReview: true, showChangesRequested: true },
  permissions: { createIssues: "members", planSprints: "leads", editAnyIssue: "leads" },
  notifications: { assigned: true, comment: true, statusChange: true, sprintStarted: true },
};

const who = z.enum(["members", "leads"]);
const settingsSchema = z.object({
  workflow: z
    .object({
      labels: z.record(z.enum(STATUSES), z.string().trim().max(30)).optional(),
      requireReview: z.boolean().optional(),
      showChangesRequested: z.boolean().optional(),
    })
    .optional(),
  permissions: z.object({ createIssues: who.optional(), planSprints: who.optional(), editAnyIssue: who.optional() }).optional(),
  notifications: z
    .object({ assigned: z.boolean().optional(), comment: z.boolean().optional(), statusChange: z.boolean().optional(), sprintStarted: z.boolean().optional() })
    .optional(),
});

/** Stored settings over the defaults, so older projects and new keys always have a value. */
export function mergeSettings(stored: unknown): ProjectSettings {
  const s = (stored ?? {}) as Partial<ProjectSettings>;
  const labels = Object.fromEntries(Object.entries(s.workflow?.labels ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
  return {
    workflow: { ...DEFAULT_SETTINGS.workflow, ...s.workflow, labels },
    permissions: { ...DEFAULT_SETTINGS.permissions, ...s.permissions },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...s.notifications },
  };
}

export async function projectSettings(db: Database, projectId: string | null | undefined): Promise<ProjectSettings> {
  if (!projectId) return DEFAULT_SETTINGS;
  const p = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { settings: true } });
  return mergeSettings(p?.settings);
}

/** Leads always pass; plain members pass when the project's permission is set to "members". */
export async function allowedOnProject(db: Database, user: { sub: string; role: string }, projectId: string, permission: keyof ProjectSettings["permissions"]) {
  if (await canManageProject(db, user.sub, user.role, projectId)) return true;
  const settings = await projectSettings(db, projectId);
  return settings.permissions[permission] === "members" && (await canAccessProject(db, user.sub, user.role, projectId));
}

export function projectSettingsRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/projects/:id/settings", requireAuth(env), async (req, res) => {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id), columns: { id: true, settings: true } });
    if (!project) throw new NotFoundError("Project not found");
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, project.id))) throw new ForbiddenError();
    res.json({ settings: mergeSettings(project.settings), canManage: await canManageProject(db, req.user!.sub, req.user!.role, project.id) });
  });

  router.put("/projects/:id/settings", requireAuth(env), async (req, res) => {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, req.params.id), columns: { id: true, settings: true } });
    if (!project) throw new NotFoundError("Project not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, project.id))) throw new ForbiddenError("Only the project's owner or leads can change its settings");
    const body = settingsSchema.parse(req.body);
    const current = mergeSettings(project.settings);
    const next: ProjectSettings = {
      workflow: { ...current.workflow, ...body.workflow, labels: body.workflow?.labels ?? current.workflow.labels },
      permissions: { ...current.permissions, ...body.permissions },
      notifications: { ...current.notifications, ...body.notifications },
    };
    const clean = mergeSettings(next);
    await db.update(projects).set({ settings: clean as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(projects.id, project.id));
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "project.settings", entityType: "project", entityId: project.id, ipAddress: req.ip });
    res.json({ settings: clean });
  });

  return router;
}
