import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { automationRules, automationRuns, projectMembers, projects, sprints, taskComments, taskEvents, tasks } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { enqueueJob, every, registerJobHandler } from "../shared/jobs.js";
import { logger } from "../shared/logger.js";
import { notify } from "../notifications/service.js";
import type { Env } from "../shared/env.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";
import { displayNameFor } from "../employees/onboarding.js";
import { addWatchers, recordChanges, watcherIds, withKeys } from "./issues.js";

/**
 * Project automation, Jira-style: "when an issue is created, if it's a bug,
 * assign it to Asha and add the triage label". Events from the issue routes
 * queue an `automation.run` job; the worker checks each enabled rule's
 * conditions and runs its actions. Changes made by a rule never fire rules
 * again, so two rules can't loop. Every run is logged.
 */

export const TRIGGERS = ["issue_created", "status_changed", "issue_assigned", "comment_added", "due_soon", "sprint_started"] as const;
export type Trigger = (typeof TRIGGERS)[number];
const STATUSES = ["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TYPES = ["epic", "story", "task", "bug"] as const;
const OPEN = ["todo", "in_progress", "in_review", "changes_requested"] as const;

const conditionsSchema = z
  .object({
    types: z.array(z.enum(TYPES)).max(5).optional(),
    priorities: z.array(z.enum(PRIORITIES)).max(4).optional(),
    labels: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional(),
    fromStatus: z.enum(STATUSES).optional(),
    toStatus: z.enum(STATUSES).optional(),
    unassigned: z.boolean().optional(),
    // due_soon: how far ahead to look.
    withinHours: z.number().int().min(1).max(24 * 14).optional(),
  })
  .strict();
const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("assign"), to: z.union([z.string().uuid(), z.enum(["creator", "unassign"])]) }),
  z.object({ kind: z.literal("set_priority"), priority: z.enum(PRIORITIES) }),
  z.object({ kind: z.literal("add_label"), label: z.string().trim().toLowerCase().min(1).max(30) }),
  z.object({ kind: z.literal("add_watcher"), userId: z.string().uuid() }),
  z.object({ kind: z.literal("notify"), to: z.union([z.string().uuid(), z.enum(["assignee", "creator", "watchers", "leads"])]), message: z.string().trim().min(1).max(500) }),
  z.object({ kind: z.literal("comment"), body: z.string().trim().min(1).max(2000) }),
  z.object({ kind: z.literal("move_to_sprint"), sprint: z.literal("active") }),
]);
export type AutomationAction = z.infer<typeof actionSchema>;
type Conditions = z.infer<typeof conditionsSchema>;

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  trigger: z.enum(TRIGGERS),
  conditions: conditionsSchema.default({}),
  actions: z.array(actionSchema).min(1).max(10),
});
const updateRuleSchema = ruleSchema.partial();

type TaskRow = typeof tasks.$inferSelect;
type RuleRow = typeof automationRules.$inferSelect;

interface EventContext {
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
}

/**
 * Called by the issue routes after something happens. Queues a run only
 * when the project has an enabled rule for this trigger, so projects
 * without automation cost one indexed lookup.
 */
export async function emitAutomation(db: Database, trigger: Trigger, task: Pick<TaskRow, "id" | "projectId">, ctx: EventContext = {}) {
  if (!task.projectId) return;
  try {
    const rule = await db.query.automationRules.findFirst({
      where: and(eq(automationRules.projectId, task.projectId), eq(automationRules.trigger, trigger), eq(automationRules.enabled, true)),
      columns: { id: true },
    });
    if (!rule) return;
    await enqueueJob(db, "automation.run", { trigger, taskId: task.id, ...ctx });
  } catch (err) {
    // Automation must never fail the action that triggered it.
    logger.error({ err, trigger, taskId: task.id }, "Couldn't queue automation");
  }
}

export function matches(task: TaskRow, c: Conditions, ctx: EventContext): string | null {
  if (c.types?.length && !c.types.includes(task.type as (typeof TYPES)[number])) return `type is ${task.type}`;
  if (c.priorities?.length && !c.priorities.includes(task.priority as (typeof PRIORITIES)[number])) return `priority is ${task.priority}`;
  if (c.labels?.length && !c.labels.some((l) => (task.labels ?? []).includes(l))) return "none of the labels";
  if (c.fromStatus && ctx.fromStatus !== c.fromStatus) return `moved from ${ctx.fromStatus ?? "nowhere"}`;
  if (c.toStatus && (ctx.toStatus ?? task.status) !== c.toStatus) return `status is ${ctx.toStatus ?? task.status}`;
  if (c.unassigned !== undefined && c.unassigned !== !task.assigneeId) return c.unassigned ? "it's assigned" : "it's unassigned";
  return null;
}

async function onProject(db: Database, projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { ownerId: true } });
  if (project?.ownerId === userId) return true;
  return !!(await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)) }));
}

async function leadIds(db: Database, projectId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { ownerId: true } });
  const leads = await db.query.projectMembers.findMany({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.roleOnProject, "lead")), columns: { userId: true } });
  return [...new Set([project?.ownerId, ...leads.map((l) => l.userId)].filter((x): x is string => !!x))];
}

/** Runs one rule's actions on an issue. Returns what it did, for the run log. */
async function runActions(db: Database, rule: RuleRow, task: TaskRow): Promise<string[]> {
  const did: string[] = [];
  const note = `Automation: ${rule.name}`;
  const [{ key }] = await withKeys(db, [task]);
  const ref = key ?? task.title;
  const patch: Partial<TaskRow> = {};
  let current = task;
  for (const raw of rule.actions) {
    const parsed = actionSchema.safeParse(raw);
    if (!parsed.success) {
      did.push("skipped an action it couldn't read");
      continue;
    }
    const a = parsed.data;
    switch (a.kind) {
      case "assign": {
        const to = a.to === "unassign" ? null : a.to === "creator" ? task.createdBy : a.to;
        if (to && !(await onProject(db, task.projectId!, to))) {
          did.push("didn't assign: that person isn't on the project");
          break;
        }
        patch.assigneeId = to;
        did.push(to ? `assigned to ${await displayNameFor(db, to)}` : "unassigned");
        break;
      }
      case "set_priority":
        patch.priority = a.priority;
        did.push(`set priority to ${a.priority}`);
        break;
      case "add_label": {
        const labels = patch.labels ?? current.labels ?? [];
        if (!labels.includes(a.label)) patch.labels = [...labels, a.label];
        did.push(`added label ${a.label}`);
        break;
      }
      case "add_watcher":
        if (await onProject(db, task.projectId!, a.userId)) {
          await addWatchers(db, task.id, [a.userId]);
          did.push(`added ${await displayNameFor(db, a.userId)} as a watcher`);
        } else did.push("didn't add a watcher: that person isn't on the project");
        break;
      case "notify": {
        const to =
          a.to === "assignee" ? [current.assigneeId] : a.to === "creator" ? [task.createdBy] : a.to === "watchers" ? await watcherIds(db, task.id) : a.to === "leads" ? await leadIds(db, task.projectId!) : [a.to];
        const people = [];
        for (const id of to) if (id && (await onProject(db, task.projectId!, id))) people.push(id);
        if (a.to !== "assignee" && a.to !== "creator" && a.to !== "watchers" && a.to !== "leads" && !people.length) {
          did.push("didn't notify: that person isn't on the project");
          break;
        }
        await notify(db, { userIds: people, kind: "automation", title: `${ref}: ${rule.name}`, body: a.message, link: `/tasks/${task.id}` });
        did.push(`notified ${people.length} ${people.length === 1 ? "person" : "people"}`);
        break;
      }
      case "comment":
        await db.insert(taskComments).values({ taskId: task.id, authorId: rule.createdBy, body: a.body, mentionedUserIds: [] });
        await db.insert(taskEvents).values({ taskId: task.id, actorUserId: rule.createdBy, action: "comment", note });
        did.push("added a comment");
        break;
      case "move_to_sprint": {
        const active = await db.query.sprints.findFirst({ where: and(eq(sprints.projectId, task.projectId!), eq(sprints.status, "active")), columns: { id: true, name: true } });
        if (!active) {
          did.push("didn't move to the sprint: none is running");
          break;
        }
        const parent = task.parentTaskId ? await db.query.tasks.findFirst({ where: eq(tasks.id, task.parentTaskId), columns: { type: true } }) : null;
        if (parent && parent.type !== "epic") {
          did.push("didn't move a subtask on its own");
          break;
        }
        patch.sprintId = active.id;
        did.push(`moved into ${active.name}`);
        break;
      }
    }
    current = { ...current, ...patch };
  }
  if (Object.keys(patch).length) {
    const [updated] = await db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await recordChanges(db, task, updated, rule.createdBy, {
      person: (id) => displayNameFor(db, id),
      phase: async () => "A phase",
      task: async () => "A task",
      sprint: async (id) => (await db.query.sprints.findFirst({ where: eq(sprints.id, id), columns: { name: true } }))?.name ?? "A sprint",
    }, note);
    if (updated.assigneeId && updated.assigneeId !== task.assigneeId) {
      await addWatchers(db, task.id, [updated.assigneeId]);
      await notify(db, { userIds: [updated.assigneeId], kind: "task.assigned", title: `New task: ${updated.title}`, body: `"${updated.title}" was assigned to you by the "${rule.name}" rule.`, link: `/tasks/${task.id}`, email: true });
    }
  }
  return did;
}

/** Checks every enabled rule for this trigger on the issue and runs those whose conditions hold. */
export async function runAutomation(db: Database, trigger: Trigger, taskId: string, ctx: EventContext = {}, onlyRuleId?: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task?.projectId) return;
  const rules = await db.query.automationRules.findMany({
    where: and(eq(automationRules.projectId, task.projectId), eq(automationRules.trigger, trigger), eq(automationRules.enabled, true), ...(onlyRuleId ? [eq(automationRules.id, onlyRuleId)] : [])),
    orderBy: (r, { asc }) => [asc(r.createdAt)],
  });
  for (const rule of rules) {
    // Re-read: an earlier rule may have changed the issue.
    const fresh = (await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) })) ?? task;
    const miss = matches(fresh, rule.conditions as Conditions, ctx);
    if (miss) {
      await db.insert(automationRuns).values({ ruleId: rule.id, taskId, status: "skipped", message: `Conditions not met: ${miss}` });
      continue;
    }
    try {
      const did = await runActions(db, rule, fresh);
      await db.insert(automationRuns).values({ ruleId: rule.id, taskId, status: "success", message: did.join("; ") });
      await db.update(automationRules).set({ runCount: sql`${automationRules.runCount} + 1`, lastRunAt: new Date() }).where(eq(automationRules.id, rule.id));
    } catch (err) {
      logger.error({ err, ruleId: rule.id, taskId }, "Automation rule failed");
      await db.insert(automationRuns).values({ ruleId: rule.id, taskId, status: "failed", message: err instanceof Error ? err.message.slice(0, 500) : "Failed" });
    }
  }
}

/** Issues whose due date falls inside a due_soon rule's window, once per issue and due date. */
export async function runDueSoon(db: Database, now = new Date()) {
  const rules = await db.query.automationRules.findMany({ where: and(eq(automationRules.trigger, "due_soon"), eq(automationRules.enabled, true)) });
  for (const rule of rules) {
    const hours = (rule.conditions as Conditions).withinHours ?? 24;
    const due = await db.query.tasks.findMany({
      where: and(
        eq(tasks.projectId, rule.projectId),
        inArray(tasks.status, [...OPEN]),
        isNotNull(tasks.dueDate),
        gte(tasks.dueDate, now),
        lte(tasks.dueDate, new Date(now.getTime() + hours * 3600_000)),
      ),
      limit: 200,
    });
    for (const t of due) {
      const windowStart = new Date(t.dueDate!.getTime() - hours * 3600_000);
      const done = await db.query.automationRuns.findFirst({ where: and(eq(automationRuns.ruleId, rule.id), eq(automationRuns.taskId, t.id), gte(automationRuns.createdAt, windowStart)), columns: { id: true } });
      if (!done) await runAutomation(db, "due_soon", t.id, {}, rule.id);
    }
  }
}

export function registerAutomation(db: Database) {
  registerJobHandler("automation.run", async (p) => {
    await runAutomation(db, p.trigger as Trigger, p.taskId as string, { actorUserId: p.actorUserId as string | null, fromStatus: p.fromStatus as string | null, toStatus: p.toStatus as string | null });
  });
  every("automation-due-soon", 60 * 60 * 1000, () => runDueSoon(db));
}

/** A sprint started: one run per open issue in it, when the project has a sprint_started rule. */
export async function emitSprintStarted(db: Database, projectId: string, sprintId: string, actorUserId: string) {
  const rule = await db.query.automationRules.findFirst({ where: and(eq(automationRules.projectId, projectId), eq(automationRules.trigger, "sprint_started"), eq(automationRules.enabled, true)), columns: { id: true } });
  if (!rule) return;
  const issues = await db.query.tasks.findMany({ where: and(eq(tasks.sprintId, sprintId), notInArray(tasks.status, ["done", "cancelled"])), columns: { id: true, projectId: true } });
  for (const t of issues) await enqueueJob(db, "automation.run", { trigger: "sprint_started", taskId: t.id, actorUserId });
}

export function automationRouter(db: Database, env: Env) {
  const router = Router();

  async function loadRule(id: string) {
    const rule = await db.query.automationRules.findFirst({ where: eq(automationRules.id, id) });
    if (!rule) throw new NotFoundError("Rule not found");
    return rule;
  }
  async function mustManage(req: { user?: { sub: string; role: string } }, projectId: string) {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, projectId))) throw new ForbiddenError("Only the project's owner or leads can change its automation");
  }
  // People named in a rule must be on the project.
  async function checkPeople(projectId: string, actions: AutomationAction[]) {
    for (const a of actions) {
      const id = a.kind === "assign" && a.to !== "creator" && a.to !== "unassign" ? a.to : a.kind === "add_watcher" ? a.userId : a.kind === "notify" && !["assignee", "creator", "watchers", "leads"].includes(a.to) ? a.to : null;
      if (id && !(await onProject(db, projectId, id))) throw new AppError("NOT_ON_PROJECT", "Everyone a rule names must be on the project", 400);
    }
  }

  router.get("/projects/:id/automation", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const rules = await db.query.automationRules.findMany({ where: eq(automationRules.projectId, req.params.id), orderBy: (r, { asc }) => [asc(r.createdAt)] });
    res.json({ rules, canManage: await canManageProject(db, req.user!.sub, req.user!.role, req.params.id) });
  });

  router.post("/projects/:id/automation", requireAuth(env), async (req, res) => {
    await mustManage(req, req.params.id);
    const body = ruleSchema.parse(req.body);
    await checkPeople(req.params.id, body.actions);
    const count = (await db.select({ n: sql<number>`count(*)::int` }).from(automationRules).where(eq(automationRules.projectId, req.params.id)))[0].n;
    if (count >= 50) throw new AppError("TOO_MANY_RULES", "A project can have up to 50 rules", 400);
    const [rule] = await db.insert(automationRules).values({ ...body, projectId: req.params.id, createdBy: req.user!.sub }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "automation.create", entityType: "automation_rule", entityId: rule.id, ipAddress: req.ip });
    res.status(201).json({ rule });
  });

  router.put("/automation/:id", requireAuth(env), async (req, res) => {
    const rule = await loadRule(req.params.id);
    await mustManage(req, rule.projectId);
    const body = updateRuleSchema.parse(req.body);
    if (body.actions) await checkPeople(rule.projectId, body.actions);
    const [updated] = await db.update(automationRules).set(body).where(eq(automationRules.id, rule.id)).returning();
    res.json({ rule: updated });
  });

  router.delete("/automation/:id", requireAuth(env), async (req, res) => {
    const rule = await loadRule(req.params.id);
    await mustManage(req, rule.projectId);
    await db.delete(automationRules).where(eq(automationRules.id, rule.id));
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "automation.delete", entityType: "automation_rule", entityId: rule.id, ipAddress: req.ip });
    res.status(204).end();
  });

  /** The rule's audit log: the last 50 runs with the issue each ran on. */
  router.get("/automation/:id/runs", requireAuth(env), async (req, res) => {
    const rule = await loadRule(req.params.id);
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, rule.projectId))) throw new ForbiddenError();
    const runs = await db.select().from(automationRuns).where(eq(automationRuns.ruleId, rule.id)).orderBy(desc(automationRuns.createdAt)).limit(50);
    const ids = [...new Set(runs.map((r) => r.taskId).filter((x): x is string => !!x))];
    const issues = ids.length ? await withKeys(db, await db.query.tasks.findMany({ where: inArray(tasks.id, ids) })) : [];
    const byId = new Map(issues.map((t) => [t.id, { key: t.key, title: t.title }]));
    res.json({ runs: runs.map((r) => ({ ...r, issue: r.taskId ? byId.get(r.taskId) ?? null : null })) });
  });

  return router;
}
