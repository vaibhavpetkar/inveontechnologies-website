import express, { Router } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { projects, taskEvents, tasks, users } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { logger } from "../shared/logger.js";
import { every } from "../shared/jobs.js";
import type { Env } from "../shared/env.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";
import { canAccessTask, canEditTask } from "../tasks/routes.js";
import {
  createIssue,
  getIssue,
  githubConfig,
  isRepo,
  listOpenIssues,
  parseIssueRef,
  verifyGithubSignature,
  type GithubConfig,
  type GithubIssue,
} from "./client.js";

type TaskRow = typeof tasks.$inferSelect;
const MANAGER_LIKE_ROLES = ["manager", "hr", "admin", "super_admin"];
const repoSchema = z.string().trim().refine(isRepo, "Use the owner/name form, e.g. inveon/portal");
const usernameSchema = z.string().trim().max(39).regex(/^[A-Za-z0-9-]*$/, "GitHub usernames use letters, numbers and dashes");

function requireGithub(config: GithubConfig | null): GithubConfig {
  if (!config) throw new AppError("GITHUB_NOT_CONFIGURED", "GitHub isn't connected yet. Ask an admin to set GITHUB_TOKEN.", 503);
  return config;
}

async function taskOr404(db: Database, id: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) throw new NotFoundError("Task not found");
  return task;
}

/** The repo a task's new issue goes to: its project's repo, else the org default. */
async function repoForTask(db: Database, config: GithubConfig, task: TaskRow) {
  if (task.projectId) {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, task.projectId) });
    if (project?.githubRepo) return project.githubRepo;
  }
  return config.defaultRepo;
}

async function userForLogin(db: Database, login: string | undefined) {
  if (!login) return null;
  return db.query.users.findFirst({ where: ilike(users.githubUsername, login), columns: { id: true } });
}

/**
 * Brings a task in line with its issue: a closed issue finishes the task, a
 * reopened one puts a finished task back in progress, and the title and
 * assignee follow GitHub. Never calls GitHub back, so it can't loop.
 */
export async function applyIssue(db: Database, task: TaskRow, issue: Pick<GithubIssue, "state" | "title" | "assignees">, actor: string | null) {
  const patch: Partial<TaskRow> = { githubIssueState: issue.state, githubSyncedAt: new Date() };
  let moved: { from: TaskRow["status"]; to: TaskRow["status"]; note: string } | null = null;
  if (issue.state === "closed" && !["done", "cancelled"].includes(task.status)) {
    moved = { from: task.status, to: "done", note: `Issue closed on GitHub${actor ? ` by @${actor}` : ""}` };
  } else if (issue.state === "open" && task.status === "done" && task.githubIssueState === "closed") {
    moved = { from: task.status, to: "in_progress", note: `Issue reopened on GitHub${actor ? ` by @${actor}` : ""}` };
  }
  if (moved) patch.status = moved.to;
  if (issue.title && issue.title !== task.title) patch.title = issue.title.slice(0, 200);
  const login = issue.assignees?.[0]?.login;
  if (login) {
    const person = await userForLogin(db, login);
    if (person && person.id !== task.assigneeId) patch.assigneeId = person.id;
  }

  const [updated] = await db.update(tasks).set({ ...patch, updatedAt: new Date() }).where(eq(tasks.id, task.id)).returning();
  if (moved) {
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: null, action: "github_sync", fromStatus: moved.from, toStatus: moved.to, note: moved.note });
    await notify(db, {
      userIds: [task.assigneeId, task.createdBy],
      kind: moved.to === "done" ? "task.done" : "task.reopened",
      title: `${moved.to === "done" ? "Done" : "Reopened"}: ${updated.title}`,
      body: `${moved.note}, so "${updated.title}" is now ${moved.to === "done" ? "done" : "back in progress"}.`,
      link: `/tasks/${task.id}`,
    });
  }
  return updated;
}

/** Polls linked, unfinished tasks so they stay in sync even without the webhook. */
export async function syncLinkedTasks(db: Database, env: Env, limit = 40) {
  const config = githubConfig(env);
  if (!config) return 0;
  const rows = await db.query.tasks.findMany({
    where: and(isNotNull(tasks.githubIssueNumber), notInArray(tasks.status, ["cancelled"])),
    orderBy: [asc(sql`coalesce(${tasks.githubSyncedAt}, 'epoch'::timestamptz)`)],
    limit,
  });
  let changed = 0;
  for (const task of rows) {
    try {
      const issue = await getIssue(config, task.githubRepo!, task.githubIssueNumber!);
      const updated = await applyIssue(db, task, issue, null);
      if (updated.status !== task.status) changed++;
    } catch (err) {
      logger.warn({ err, taskId: task.id }, "GitHub sync failed for task");
    }
  }
  return changed;
}

export function registerGithubSchedules(db: Database, env: Env) {
  if (!githubConfig(env)) return;
  every("github-issue-sync", 15 * 60 * 1000, async () => {
    await syncLinkedTasks(db, env);
  });
}

export function githubRouter(db: Database, env: Env) {
  const router = Router();
  const config = githubConfig(env);

  router.get("/status", requireAuth(env), async (req, res) => {
    const me = await db.query.users.findFirst({ where: eq(users.id, req.user!.sub), columns: { githubUsername: true } });
    res.json({ enabled: !!config, defaultRepo: config?.defaultRepo ?? null, webhook: !!config?.webhookSecret, username: me?.githubUsername ?? null });
  });

  router.put("/me", requireAuth(env), async (req, res) => {
    const { username } = z.object({ username: usernameSchema }).parse(req.body);
    await db.update(users).set({ githubUsername: username || null, updatedAt: new Date() }).where(eq(users.id, req.user!.sub));
    res.json({ username: username || null });
  });

  /** Opens a GitHub issue for a task and links it. */
  router.post("/tasks/:id/issue", requireAuth(env), async (req, res) => {
    const gh = requireGithub(config);
    const task = await taskOr404(db, req.params.id);
    if (!(await canEditTask(db, req.user!.sub, req.user!.role, task)) && task.assigneeId !== req.user!.sub) throw new ForbiddenError();
    if (task.githubIssueNumber) throw new AppError("ALREADY_LINKED", "This task already has a GitHub issue", 409);
    const body = z.object({ repo: repoSchema.optional() }).parse(req.body ?? {});
    const repo = body.repo ?? (await repoForTask(db, gh, task));
    if (!repo) throw new AppError("NO_REPO", "Pick a repository: this task's project has none and there's no default", 400);

    const assignee = task.assigneeId ? await db.query.users.findFirst({ where: eq(users.id, task.assigneeId), columns: { githubUsername: true } }) : null;
    const text = [task.description?.trim(), `---\nTracked in the Inveon portal: ${env.PORTAL_APP_URL}/tasks/${task.id}`].filter(Boolean).join("\n\n");
    let issue: GithubIssue;
    try {
      issue = await createIssue(gh, repo, { title: task.title, body: text, assignees: assignee?.githubUsername ? [assignee.githubUsername] : undefined });
    } catch (err) {
      // GitHub refuses assignees who aren't collaborators; open it unassigned rather than fail.
      if (!assignee?.githubUsername || (err instanceof AppError && err.code === "GITHUB_NOT_FOUND")) throw err;
      issue = await createIssue(gh, repo, { title: task.title, body: text });
    }
    const [updated] = await db
      .update(tasks)
      .set({ githubRepo: repo, githubIssueNumber: issue.number, githubIssueUrl: issue.html_url, githubIssueState: issue.state, githubSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "github_link", note: `Opened ${repo}#${issue.number}` });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "task.github_issue_create", entityType: "task", entityId: task.id, metadata: { repo, number: issue.number }, ipAddress: req.ip });
    res.status(201).json({ task: updated });
  });

  /** Links an existing issue ("#12", "owner/repo#12" or its URL). */
  router.post("/tasks/:id/link", requireAuth(env), async (req, res) => {
    const gh = requireGithub(config);
    const task = await taskOr404(db, req.params.id);
    if (!(await canEditTask(db, req.user!.sub, req.user!.role, task)) && task.assigneeId !== req.user!.sub) throw new ForbiddenError();
    const { ref } = z.object({ ref: z.string().min(1).max(300) }).parse(req.body);
    const parsed = parseIssueRef(ref, await repoForTask(db, gh, task));
    if (!parsed) throw new AppError("VALIDATION_ERROR", "Paste the issue link, or owner/repo#number", 400);
    const clash = await db.query.tasks.findFirst({ where: and(eq(tasks.githubRepo, parsed.repo), eq(tasks.githubIssueNumber, parsed.number)) });
    if (clash && clash.id !== task.id) throw new AppError("ALREADY_LINKED", `That issue is already linked to "${clash.title}"`, 409);
    const issue = await getIssue(gh, parsed.repo, parsed.number);
    if (issue.pull_request) throw new AppError("VALIDATION_ERROR", "That's a pull request. Link the issue it fixes instead", 400);
    const [updated] = await db
      .update(tasks)
      .set({ githubRepo: parsed.repo, githubIssueNumber: issue.number, githubIssueUrl: issue.html_url, githubIssueState: issue.state, githubSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "github_link", note: `Linked ${parsed.repo}#${issue.number}` });
    res.json({ task: updated });
  });

  router.delete("/tasks/:id/link", requireAuth(env), async (req, res) => {
    const task = await taskOr404(db, req.params.id);
    if (!(await canEditTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    const [updated] = await db
      .update(tasks)
      .set({ githubRepo: null, githubIssueNumber: null, githubIssueUrl: null, githubIssueState: null, githubSyncedAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    if (task.githubIssueNumber) await db.insert(taskEvents).values({ taskId: task.id, actorUserId: req.user!.sub, action: "github_unlink", note: `Unlinked ${task.githubRepo}#${task.githubIssueNumber}` });
    res.json({ task: updated });
  });

  router.post("/tasks/:id/sync", requireAuth(env), async (req, res) => {
    const gh = requireGithub(config);
    const task = await taskOr404(db, req.params.id);
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    if (!task.githubRepo || !task.githubIssueNumber) throw new AppError("NOT_LINKED", "This task has no GitHub issue", 400);
    const issue = await getIssue(gh, task.githubRepo, task.githubIssueNumber);
    res.json({ task: await applyIssue(db, task, issue, null) });
  });

  /** Sets a project's repo (managers/leads). */
  router.put("/projects/:id/repo", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const { repo } = z.object({ repo: repoSchema.nullable() }).parse(req.body);
    const [project] = await db.update(projects).set({ githubRepo: repo, updatedAt: new Date() }).where(eq(projects.id, req.params.id)).returning();
    if (!project) throw new NotFoundError("Project not found");
    res.json({ project });
  });

  /** Creates a task for every open issue in a repo that isn't linked yet. */
  router.post("/import", requireAuth(env), async (req, res) => {
    const gh = requireGithub(config);
    const body = z.object({ repo: repoSchema, projectId: z.string().uuid().optional(), assigneeId: z.string().uuid().optional() }).parse(req.body);
    const me = req.user!;
    if (body.projectId) {
      if (!(await canManageProject(db, me.sub, me.role, body.projectId))) throw new ForbiddenError("Only the project owner or a lead can import into this project");
    } else if (!MANAGER_LIKE_ROLES.includes(me.role)) {
      throw new ForbiddenError("Only managers, HR and admins can import issues outside a project");
    }

    const issues = await listOpenIssues(gh, body.repo);
    const linked = issues.length
      ? await db.query.tasks.findMany({ where: and(eq(tasks.githubRepo, body.repo), inArray(tasks.githubIssueNumber, issues.map((i) => i.number))), columns: { githubIssueNumber: true } })
      : [];
    const have = new Set(linked.map((t) => t.githubIssueNumber));
    const fresh = issues.filter((i) => !have.has(i.number));

    const created: TaskRow[] = [];
    for (const issue of fresh) {
      const person = await userForLogin(db, issue.assignees?.[0]?.login);
      const description = [issue.body?.trim().slice(0, 4500), `From ${issue.html_url}`].filter(Boolean).join("\n\n");
      const [task] = await db
        .insert(tasks)
        .values({
          projectId: body.projectId,
          title: issue.title.slice(0, 200),
          description,
          assigneeId: person?.id ?? body.assigneeId,
          createdBy: me.sub,
          githubRepo: body.repo,
          githubIssueNumber: issue.number,
          githubIssueUrl: issue.html_url,
          githubIssueState: "open",
          githubSyncedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (!task) continue;
      created.push(task);
      await db.insert(taskEvents).values({ taskId: task.id, actorUserId: me.sub, action: "create", toStatus: "todo", note: `Imported from ${body.repo}#${issue.number}` });
      if (task.assigneeId) {
        await notify(db, { userIds: [task.assigneeId], actorUserId: me.sub, kind: "task.assigned", title: `New task: ${task.title}`, body: `You've been assigned "${task.title}" from GitHub issue #${issue.number}.`, link: `/tasks/${task.id}` });
      }
    }
    if (body.projectId) {
      await db.update(projects).set({ githubRepo: body.repo }).where(and(eq(projects.id, body.projectId), sql`${projects.githubRepo} is null`));
    }
    await writeAuditLog(db, { actorUserId: me.sub, action: "task.github_import", entityType: "project", entityId: body.projectId ?? null, metadata: { repo: body.repo, created: created.length }, ipAddress: req.ip });
    res.json({ created: created.length, skipped: issues.length - created.length, tasks: created });
  });

  /** Projects the caller can import into, with their repos. */
  router.get("/projects", requireAuth(env), async (req, res) => {
    const all = await db.query.projects.findMany({ columns: { id: true, title: true, githubRepo: true, status: true } });
    const mine = [];
    for (const p of all) if (await canAccessProject(db, req.user!.sub, req.user!.role, p.id)) mine.push(p);
    res.json({ projects: mine });
  });

  return router;
}

/** POST /api/v1/github/webhook: mounted before express.json so the signature covers the raw body. */
export function githubWebhookRouter(db: Database, env: Env) {
  const router = Router();
  const config = githubConfig(env);

  router.post("/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    if (!config?.webhookSecret) {
      res.status(503).json({ error: { code: "GITHUB_NOT_CONFIGURED", message: "GitHub webhook secret is not set" } });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyGithubSignature(config.webhookSecret, raw, req.header("x-hub-signature-256"))) {
      logger.warn("GitHub webhook with a bad signature");
      res.status(401).json({ error: { code: "BAD_SIGNATURE", message: "Signature mismatch" } });
      return;
    }
    const event = req.header("x-github-event");
    if (event === "ping") {
      res.json({ ok: true });
      return;
    }
    let payload: { action?: string; issue?: GithubIssue; repository?: { full_name?: string }; sender?: { login?: string } };
    try {
      payload = JSON.parse(raw);
    } catch {
      res.status(400).json({ error: { code: "BAD_BODY", message: "Invalid JSON" } });
      return;
    }
    const repo = payload.repository?.full_name;
    const issue = payload.issue;
    if (event !== "issues" || !repo || !issue || !["closed", "reopened", "edited", "assigned", "unassigned"].includes(payload.action ?? "")) {
      res.json({ ok: true, ignored: true });
      return;
    }
    // GitHub repo names are case-insensitive; match the way we stored it.
    const task = await db.query.tasks.findFirst({ where: and(ilike(tasks.githubRepo, repo), eq(tasks.githubIssueNumber, issue.number)) });
    if (!task) {
      res.json({ ok: true, ignored: true });
      return;
    }
    await applyIssue(db, task, issue, payload.sender?.login ?? null);
    res.json({ ok: true });
  });

  return router;
}
