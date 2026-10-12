import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { projectMembers, projects, projectVersions, sprints, taskDevLinks, taskEvents, taskLinks, tasks, users } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { logger } from "../shared/logger.js";
import type { Env } from "../shared/env.js";
import { canAccessProject, canManageProject } from "../projects/routes.js";
import { displayNameFor } from "../employees/onboarding.js";
import { canAccessTask, canEditTask } from "./routes.js";
import { addWatchers, findTaskByRef, ISSUE_TYPES, labelsSchema, withKeys } from "./issues.js";

/**
 * Engineering workflow around issues: links between issues, the GitHub
 * branches, commits and pull requests that mention them, releases
 * (versions), the project timeline, and CSV import.
 */

type TaskRow = typeof tasks.$inferSelect;
const LINK_TYPES = ["blocks", "relates", "duplicates", "clones"] as const;
// How each link reads from the source's side, and from the target's.
export const LINK_WORDS: Record<(typeof LINK_TYPES)[number], { outward: string; inward: string }> = {
  blocks: { outward: "blocks", inward: "is blocked by" },
  relates: { outward: "relates to", inward: "relates to" },
  duplicates: { outward: "duplicates", inward: "is duplicated by" },
  clones: { outward: "clones", inward: "is cloned by" },
};
const OPEN_STATUSES = ["todo", "in_progress", "in_review", "changes_requested"];

const linkSchema = z.object({ target: z.string().trim().min(1).max(60), type: z.enum(LINK_TYPES), inward: z.boolean().default(false) });
const isoDate = z.string().datetime({ offset: true });
const versionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(2000).optional(),
  startDate: isoDate.optional(),
  releaseDate: isoDate.optional(),
});
const versionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  releaseDate: isoDate.nullable().optional(),
  status: z.enum(["unreleased", "archived"]).optional(),
});
// Unfinished issues move to another version, or lose their version.
const releaseSchema = z.object({ moveOpenTo: z.string().uuid().nullable().default(null) });
const importRowSchema = z.object({
  title: z.string().trim().min(2).max(200),
  type: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined), z.enum(ISSUE_TYPES).default("task")),
  priority: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined), z.enum(["low", "medium", "high", "urgent"]).default("medium")),
  description: z.string().max(5000).optional(),
  assignee: z.string().trim().max(200).optional(), // email
  labels: z.preprocess((v) => (typeof v === "string" ? v.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : v ?? []), labelsSchema),
  storyPoints: z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)), z.number().int().min(0).max(100).optional()),
  estimateHours: z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)), z.number().min(0).max(9999).optional()),
  dueDate: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional()),
  // Key of an epic or parent issue in the same project, e.g. RAIL-4.
  parent: z.string().trim().max(30).optional(),
});
const importSchema = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(500), dryRun: z.boolean().default(false) });

async function names(db: Database, ids: (string | null)[]) {
  const out = new Map<string, string>();
  await Promise.all([...new Set(ids.filter((x): x is string => !!x))].map(async (id) => out.set(id, await displayNameFor(db, id))));
  return out;
}

/** Issue keys like RAIL-12 in a commit message, branch name or PR title. Branch names may be lower case. */
export function issueKeysIn(text: string): { key: string; number: number }[] {
  const out = new Map<string, { key: string; number: number }>();
  for (const m of text.matchAll(/(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})(?![0-9])/g)) {
    const key = m[1].toUpperCase();
    out.set(`${key}-${m[2]}`, { key, number: Number(m[2]) });
  }
  return [...out.values()];
}

/** Tasks the keys point at, only in projects linked to this repository. */
async function tasksForKeys(db: Database, repo: string, text: string) {
  const keys = issueKeysIn(text);
  if (!keys.length) return [];
  const linked = await db.query.projects.findMany({ where: and(ilike(projects.githubRepo, repo), inArray(projects.key, [...new Set(keys.map((k) => k.key))])) });
  if (!linked.length) return [];
  const out: TaskRow[] = [];
  for (const k of keys) {
    const project = linked.find((p) => p.key === k.key);
    if (!project) continue;
    const t = await db.query.tasks.findFirst({ where: and(eq(tasks.projectId, project.id), eq(tasks.number, k.number)) });
    if (t) out.push(t);
  }
  return out;
}

async function upsertDevLink(db: Database, taskId: string, link: { kind: "branch" | "commit" | "pull_request"; repo: string; ref: string; title?: string | null; url?: string | null; state?: (typeof taskDevLinks.$inferInsert)["state"]; author?: string | null }) {
  const [row] = await db
    .insert(taskDevLinks)
    .values({ taskId, ...link })
    .onConflictDoUpdate({
      target: [taskDevLinks.taskId, taskDevLinks.kind, taskDevLinks.repo, taskDevLinks.ref],
      set: { title: link.title ?? sql`${taskDevLinks.title}`, url: link.url ?? sql`${taskDevLinks.url}`, state: link.state ?? sql`${taskDevLinks.state}`, updatedAt: new Date() },
    })
    .returning();
  return row;
}

interface PushPayload {
  ref?: string;
  deleted?: boolean;
  created?: boolean;
  repository?: { full_name?: string; html_url?: string };
  commits?: { id: string; message: string; url?: string; author?: { username?: string; name?: string } }[];
}
interface PullRequestPayload {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: { number: number; title: string; body?: string | null; html_url: string; state: "open" | "closed"; draft?: boolean; merged?: boolean; head?: { ref?: string }; user?: { login?: string } };
}

/**
 * GitHub "push", "create" and "pull_request" events: link branches, commits
 * and PRs to the issues they name. Opening a PR moves an issue that's being
 * worked on to "In review"; merging tells the reviewers it's ready to approve
 * (approval itself stays with them).
 */
export async function handleDevEvent(db: Database, event: string, payload: unknown): Promise<{ linked: number }> {
  let linked = 0;
  if (event === "push" || event === "create") {
    const p = payload as PushPayload & { ref_type?: string };
    const repo = p.repository?.full_name;
    if (!repo || !p.ref) return { linked };
    if (event === "create" && p.ref_type !== "branch") return { linked };
    const branch = p.ref.replace(/^refs\/heads\//, "");
    if (p.ref.startsWith("refs/tags/")) return { linked };
    for (const t of await tasksForKeys(db, repo, branch)) {
      await upsertDevLink(db, t.id, { kind: "branch", repo, ref: branch, url: p.repository?.html_url ? `${p.repository.html_url}/tree/${encodeURIComponent(branch)}` : null, state: p.deleted ? "deleted" : "open" });
      linked++;
    }
    for (const c of (p.commits ?? []).slice(0, 50)) {
      for (const t of await tasksForKeys(db, repo, c.message)) {
        await upsertDevLink(db, t.id, { kind: "commit", repo, ref: c.id, title: c.message.split("\n")[0].slice(0, 300), url: c.url ?? null, author: c.author?.username ?? c.author?.name ?? null });
        linked++;
      }
    }
    return { linked };
  }
  if (event === "pull_request") {
    const p = payload as PullRequestPayload;
    const repo = p.repository?.full_name;
    const pr = p.pull_request;
    if (!repo || !pr) return { linked };
    const state = pr.merged ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : "open";
    const found = await tasksForKeys(db, repo, `${pr.title}\n${pr.head?.ref ?? ""}\n${(pr.body ?? "").slice(0, 2000)}`);
    for (const t of found) {
      await upsertDevLink(db, t.id, { kind: "pull_request", repo, ref: String(pr.number), title: pr.title.slice(0, 300), url: pr.html_url, state, author: pr.user?.login ?? null });
      linked++;
      const label = `PR #${pr.number}`;
      if ((p.action === "opened" || p.action === "ready_for_review" || p.action === "reopened") && !pr.draft && ["in_progress", "changes_requested"].includes(t.status)) {
        const [moved] = await db.update(tasks).set({ status: "in_review", updatedAt: new Date() }).where(and(eq(tasks.id, t.id), eq(tasks.status, t.status))).returning();
        if (moved) {
          await db.insert(taskEvents).values({ taskId: t.id, actorUserId: null, action: "status_change", fromStatus: t.status, toStatus: "in_review", note: `${label} opened on GitHub` });
          await notifyReviewers(db, moved, `${label} is open for review`, `${pr.title}`);
        }
      } else if (p.action === "closed" && pr.merged) {
        await db.insert(taskEvents).values({ taskId: t.id, actorUserId: null, action: "github_pr", note: `${label} was merged` });
        if (t.status === "in_review") await notifyReviewers(db, t, `${label} was merged`, "The code is in. Approve the task when you've checked it.");
      }
    }
    return { linked };
  }
  return { linked };
}

async function notifyReviewers(db: Database, task: TaskRow, title: string, body: string) {
  const ids = new Set<string>([task.createdBy]);
  if (task.projectId) {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, task.projectId) });
    if (project) ids.add(project.ownerId);
    (await db.query.projectMembers.findMany({ where: and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.roleOnProject, "lead")) })).forEach((m) => ids.add(m.userId));
  }
  if (task.assigneeId) ids.delete(task.assigneeId);
  if (!ids.size) return;
  const [keyed] = await withKeys(db, [task]);
  await notify(db, { userIds: [...ids], actorUserId: null, kind: "task.github", title: `${keyed.key ?? task.title}: ${title}`, body, link: `/tasks/${keyed.key ?? task.id}` }).catch((err) => logger.warn({ err }, "Couldn't notify reviewers"));
}

/** Issues each issue is blocked by, still open. */
export async function openBlockers(db: Database, taskIds: string[]) {
  if (!taskIds.length) return new Map<string, string[]>();
  const r = await db.execute<{ blocked: string; blocker: string }>(sql`
    SELECT l.target_task_id AS blocked, l.source_task_id AS blocker FROM task_links l JOIN tasks s ON s.id = l.source_task_id
    WHERE l.type = 'blocks' AND l.target_task_id IN (${sql.join(taskIds.map((id) => sql`${id}`), sql`, `)}) AND s.status NOT IN ('done', 'cancelled')
  `);
  const out = new Map<string, string[]>();
  for (const x of r.rows) out.set(x.blocked, [...(out.get(x.blocked) ?? []), x.blocker]);
  return out;
}

function versionProgress(rows: { fixVersionId: string | null; status: string; storyPoints: number | null }[], id: string) {
  const mine = rows.filter((t) => t.fixVersionId === id && t.status !== "cancelled");
  const done = mine.filter((t) => t.status === "done");
  return { issues: mine.length, done: done.length, inProgress: mine.filter((t) => t.status !== "todo" && t.status !== "done").length, points: mine.reduce((n, t) => n + (t.storyPoints ?? 0), 0) };
}

export function engineeringRouter(db: Database, env: Env) {
  const router = Router();

  async function taskFor(req: { params: Record<string, string>; user?: { sub: string; role: string } }, edit = false) {
    const task = await findTaskByRef(db, req.params.id);
    if (!task) throw new NotFoundError("Task not found");
    if (!(await canAccessTask(db, req.user!.sub, req.user!.role, task))) throw new ForbiddenError();
    if (edit && !(await canEditTask(db, req.user!.sub, req.user!.role, task)) && task.assigneeId !== req.user!.sub) throw new ForbiddenError();
    return task;
  }

  // ---- Issue links ----

  router.get("/tasks/:id/links", requireAuth(env), async (req, res) => {
    const task = await taskFor(req);
    const rows = await db.select().from(taskLinks).where(or(eq(taskLinks.sourceTaskId, task.id), eq(taskLinks.targetTaskId, task.id)));
    const otherIds = rows.map((l) => (l.sourceTaskId === task.id ? l.targetTaskId : l.sourceTaskId));
    const others = otherIds.length ? await withKeys(db, await db.query.tasks.findMany({ where: inArray(tasks.id, otherIds) })) : [];
    const byId = new Map(others.map((t) => [t.id, t]));
    res.json({
      links: rows.map((l) => {
        const outward = l.sourceTaskId === task.id;
        const other = byId.get(outward ? l.targetTaskId : l.sourceTaskId)!;
        return {
          id: l.id,
          type: l.type,
          direction: outward ? "outward" : "inward",
          label: LINK_WORDS[l.type][outward ? "outward" : "inward"],
          task: { id: other.id, key: other.key, title: other.title, status: other.status, type: other.type, priority: other.priority },
        };
      }),
    });
  });

  router.post("/tasks/:id/links", requireAuth(env), async (req, res) => {
    const task = await taskFor(req, true);
    const body = linkSchema.parse(req.body);
    const other = await findTaskByRef(db, body.target);
    if (!other || !(await canAccessTask(db, req.user!.sub, req.user!.role, other))) throw new NotFoundError(`No issue ${body.target} that you can see`);
    if (other.id === task.id) throw new AppError("INVALID_LINK", "An issue can't link to itself", 400);
    const [source, target] = body.inward ? [other, task] : [task, other];
    // "Relates to" reads the same both ways, so don't store it twice.
    if (body.type === "relates") {
      const existing = await db.query.taskLinks.findFirst({ where: and(eq(taskLinks.type, "relates"), eq(taskLinks.sourceTaskId, target.id), eq(taskLinks.targetTaskId, source.id)) });
      if (existing) throw new AppError("LINK_EXISTS", "Those issues are already linked", 409);
    }
    if (body.type === "blocks") {
      // Refuse a direct cycle: A blocks B while B blocks A.
      const loop = await db.query.taskLinks.findFirst({ where: and(eq(taskLinks.type, "blocks"), eq(taskLinks.sourceTaskId, target.id), eq(taskLinks.targetTaskId, source.id)) });
      if (loop) throw new AppError("INVALID_LINK", "That would make the two issues block each other", 400);
    }
    const [link] = await db.insert(taskLinks).values({ sourceTaskId: source.id, targetTaskId: target.id, type: body.type, createdBy: req.user!.sub }).onConflictDoNothing().returning();
    if (!link) throw new AppError("LINK_EXISTS", "Those issues are already linked", 409);
    const [s, t] = await withKeys(db, [source, target]);
    await db.insert(taskEvents).values([
      { taskId: source.id, actorUserId: req.user!.sub, action: "link_added", note: `${LINK_WORDS[body.type].outward} ${t.key ?? t.title}` },
      { taskId: target.id, actorUserId: req.user!.sub, action: "link_added", note: `${LINK_WORDS[body.type].inward} ${s.key ?? s.title}` },
    ]);
    res.status(201).json({ link });
  });

  router.delete("/task-links/:linkId", requireAuth(env), async (req, res) => {
    const link = await db.query.taskLinks.findFirst({ where: eq(taskLinks.id, req.params.linkId) });
    if (!link) throw new NotFoundError("Link not found");
    const [source, target] = await Promise.all([db.query.tasks.findFirst({ where: eq(tasks.id, link.sourceTaskId) }), db.query.tasks.findFirst({ where: eq(tasks.id, link.targetTaskId) })]);
    const allowed = (await Promise.all([source, target].map(async (t) => !!t && ((await canEditTask(db, req.user!.sub, req.user!.role, t)) || t.assigneeId === req.user!.sub)))).some(Boolean);
    if (!allowed) throw new ForbiddenError();
    await db.delete(taskLinks).where(eq(taskLinks.id, link.id));
    res.status(204).end();
  });

  // ---- Development (GitHub) ----

  router.get("/tasks/:id/development", requireAuth(env), async (req, res) => {
    const task = await taskFor(req);
    const rows = await db.query.taskDevLinks.findMany({ where: eq(taskDevLinks.taskId, task.id), orderBy: (d, { desc }) => [desc(d.updatedAt)] });
    const [keyed] = await withKeys(db, [task]);
    const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
    res.json({
      branchName: keyed.key ? `${keyed.key}-${slug}` : null,
      branches: rows.filter((r) => r.kind === "branch"),
      commits: rows.filter((r) => r.kind === "commit").slice(0, 30),
      pullRequests: rows.filter((r) => r.kind === "pull_request"),
    });
  });

  // ---- Releases ----

  router.get("/projects/:id/versions", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const versions = await db.query.projectVersions.findMany({ where: eq(projectVersions.projectId, req.params.id), orderBy: [asc(projectVersions.releaseDate), asc(projectVersions.createdAt)] });
    const rows = await db.select({ fixVersionId: tasks.fixVersionId, status: tasks.status, storyPoints: tasks.storyPoints }).from(tasks).where(eq(tasks.projectId, req.params.id));
    res.json({
      versions: versions.map((v) => ({ ...v, progress: versionProgress(rows, v.id) })),
      canManage: await canManageProject(db, req.user!.sub, req.user!.role, req.params.id),
    });
  });

  router.get("/versions/:id", requireAuth(env), async (req, res) => {
    const version = await db.query.projectVersions.findFirst({ where: eq(projectVersions.id, req.params.id) });
    if (!version) throw new NotFoundError("Version not found");
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, version.projectId))) throw new ForbiddenError();
    const issues = await withKeys(db, await db.query.tasks.findMany({ where: eq(tasks.fixVersionId, version.id), orderBy: [asc(tasks.rank)] }));
    const who = await names(db, issues.map((t) => t.assigneeId));
    res.json({ version, issues: issues.map((t) => ({ id: t.id, key: t.key, title: t.title, type: t.type, status: t.status, priority: t.priority, storyPoints: t.storyPoints, assignee: t.assigneeId ? { id: t.assigneeId, name: who.get(t.assigneeId) ?? "Someone" } : null })) });
  });

  router.post("/projects/:id/versions", requireAuth(env), async (req, res) => {
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError("Only the project's owner or leads can manage releases");
    const body = versionSchema.parse(req.body);
    if (body.startDate && body.releaseDate && new Date(body.releaseDate) < new Date(body.startDate)) throw new AppError("INVALID_DATES", "The release date must be after the start", 400);
    try {
      const [version] = await db
        .insert(projectVersions)
        .values({ projectId: req.params.id, name: body.name, description: body.description, startDate: body.startDate ? new Date(body.startDate) : undefined, releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined, createdBy: req.user!.sub })
        .returning();
      await writeAuditLog(db, { actorUserId: req.user!.sub, action: "version.create", entityType: "project_version", entityId: version.id, ipAddress: req.ip });
      res.status(201).json({ version });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new AppError("VERSION_EXISTS", `There's already a version called ${body.name}`, 409);
      throw err;
    }
  });

  async function managedVersion(req: { params: Record<string, string>; user?: { sub: string; role: string } }) {
    const version = await db.query.projectVersions.findFirst({ where: eq(projectVersions.id, req.params.id) });
    if (!version) throw new NotFoundError("Version not found");
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, version.projectId))) throw new ForbiddenError("Only the project's owner or leads can manage releases");
    return version;
  }

  router.put("/versions/:id", requireAuth(env), async (req, res) => {
    const version = await managedVersion(req);
    const body = versionUpdateSchema.parse(req.body);
    const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);
    try {
      const [updated] = await db.update(projectVersions).set({ name: body.name, description: body.description, startDate: d(body.startDate), releaseDate: d(body.releaseDate), status: body.status }).where(eq(projectVersions.id, version.id)).returning();
      res.json({ version: updated });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new AppError("VERSION_EXISTS", "There's already a version with that name", 409);
      throw err;
    }
  });

  /** Mark a version shipped. Unfinished issues move to another version or lose their version. */
  router.post("/versions/:id/release", requireAuth(env), async (req, res) => {
    const version = await managedVersion(req);
    if (version.status === "released") throw new AppError("ALREADY_RELEASED", "This version is already released", 400);
    const { moveOpenTo } = releaseSchema.parse(req.body);
    if (moveOpenTo) {
      const next = await db.query.projectVersions.findFirst({ where: eq(projectVersions.id, moveOpenTo) });
      if (!next || next.projectId !== version.projectId || next.status !== "unreleased" || next.id === version.id) throw new AppError("INVALID_VERSION", "Pick another unreleased version on this project", 400);
    }
    const open = await db.query.tasks.findMany({ where: and(eq(tasks.fixVersionId, version.id), inArray(tasks.status, OPEN_STATUSES as ["todo"])) });
    if (open.length) await db.update(tasks).set({ fixVersionId: moveOpenTo, updatedAt: new Date() }).where(inArray(tasks.id, open.map((t) => t.id)));
    const [released] = await db.update(projectVersions).set({ status: "released", releasedAt: new Date(), releaseDate: version.releaseDate ?? new Date() }).where(eq(projectVersions.id, version.id)).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "version.release", entityType: "project_version", entityId: version.id, ipAddress: req.ip, metadata: { movedOpen: open.length } });
    const members = (await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, version.projectId) })).map((m) => m.userId).filter((id) => id !== req.user!.sub);
    if (members.length) await notify(db, { userIds: members, actorUserId: req.user!.sub, kind: "version.released", title: `${version.name} is released`, body: open.length ? `${open.length} unfinished issue${open.length === 1 ? "" : "s"} moved on.` : "Every issue in it was done.", link: `/projects/${version.projectId}?view=releases` });
    res.json({ version: released, movedOpen: open.length });
  });

  router.delete("/versions/:id", requireAuth(env), async (req, res) => {
    const version = await managedVersion(req);
    await db.update(tasks).set({ fixVersionId: null }).where(eq(tasks.fixVersionId, version.id));
    await db.delete(projectVersions).where(eq(projectVersions.id, version.id));
    res.status(204).end();
  });

  // ---- Timeline ----

  /**
   * Bars for the project's epics and their issues: planned start to due date,
   * falling back to the sprint's dates or when work started. Arrows come from
   * "blocks" links between issues on the timeline.
   */
  router.get("/projects/:id/timeline", requireAuth(env), async (req, res) => {
    if (!(await canAccessProject(db, req.user!.sub, req.user!.role, req.params.id))) throw new ForbiddenError();
    const all = await withKeys(db, await db.query.tasks.findMany({ where: and(eq(tasks.projectId, req.params.id), ne(tasks.status, "cancelled")), orderBy: [asc(tasks.rank)] }));
    const epics = all.filter((t) => t.type === "epic");
    const epicIds = new Set(epics.map((e) => e.id));
    const items = all.filter((t) => !t.parentTaskId || epicIds.has(t.parentTaskId));
    const sprintRows = await db.query.sprints.findMany({ where: and(eq(sprints.projectId, req.params.id), ne(sprints.status, "completed")) });
    const allSprints = await db.query.sprints.findMany({ where: eq(sprints.projectId, req.params.id) });
    const sprintById = new Map(allSprints.map((s) => [s.id, s]));
    const versions = await db.query.projectVersions.findMany({ where: and(eq(projectVersions.projectId, req.params.id), ne(projectVersions.status, "archived")) });
    const ids = items.map((t) => t.id);
    const links = ids.length
      ? await db.select().from(taskLinks).where(and(eq(taskLinks.type, "blocks"), inArray(taskLinks.sourceTaskId, ids), inArray(taskLinks.targetTaskId, ids)))
      : [];
    const who = await names(db, items.map((t) => t.assigneeId));
    const span = (t: (typeof items)[number]) => {
      const sprint = t.sprintId ? sprintById.get(t.sprintId) : undefined;
      const start = t.startDate ?? sprint?.startDate ?? t.startedAt ?? null;
      const end = t.dueDate ?? sprint?.endDate ?? t.expectedFinishAt ?? null;
      return { start, end };
    };
    const rows = items.map((t) => ({ id: t.id, key: t.key, title: t.title, type: t.type, status: t.status, parentId: t.parentTaskId && epicIds.has(t.parentTaskId) ? t.parentTaskId : null, assignee: t.assigneeId ? who.get(t.assigneeId) ?? "Someone" : null, ...span(t), progressPercent: t.status === "done" ? 100 : t.progressPercent }));
    // An epic without dates of its own spans its issues.
    for (const r of rows.filter((x) => x.type === "epic")) {
      const kids = rows.filter((x) => x.parentId === r.id);
      if (!r.start) r.start = kids.map((k) => k.start ?? k.end).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      if (!r.end) r.end = kids.map((k) => k.end ?? k.start).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const live = kids.length;
      if (live) r.progressPercent = Math.round((kids.filter((k) => k.status === "done").length / live) * 100);
    }
    res.json({
      items: rows,
      dependencies: links.map((l) => ({ from: l.sourceTaskId, to: l.targetTaskId })),
      sprints: sprintRows.map((s) => ({ id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, status: s.status })),
      versions: versions.map((v) => ({ id: v.id, name: v.name, releaseDate: v.releaseDate, status: v.status })),
    });
  });

  // ---- CSV import ----

  /**
   * Create issues from spreadsheet rows (parsed in the browser). With
   * dryRun it only checks the rows. Rows can name an epic or parent by key,
   * including issues created earlier in the same file.
   */
  router.post("/projects/:id/import", requireAuth(env), async (req, res) => {
    const projectId = req.params.id;
    if (!(await canManageProject(db, req.user!.sub, req.user!.role, projectId))) throw new ForbiddenError("Only the project's owner or leads can import issues");
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!project) throw new NotFoundError("Project not found");
    const { rows, dryRun } = importSchema.parse(req.body);
    const members = await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, projectId) });
    const memberIds = new Set([...members.map((m) => m.userId), project.ownerId]);
    const people = await db.query.users.findMany({ where: inArray(users.id, [...memberIds]), columns: { id: true, email: true } });
    const byEmail = new Map(people.map((u) => [u.email.toLowerCase(), u.id]));

    type Parsed = z.infer<typeof importRowSchema>;
    const checked: { row: number; data?: Parsed; errors: string[] }[] = rows.map((raw, i) => {
      const r = importRowSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : v === null ? undefined : v])));
      if (!r.success) return { row: i + 1, errors: r.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`) };
      const errors: string[] = [];
      if (r.data.assignee && !byEmail.has(r.data.assignee.toLowerCase())) errors.push(`assignee: ${r.data.assignee} isn't on this project`);
      if (r.data.parent && !/^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/.test(r.data.parent)) errors.push("parent: use an issue key like RAIL-4");
      return { row: i + 1, data: r.data, errors };
    });
    const bad = checked.filter((c) => c.errors.length);
    if (dryRun || bad.length) {
      return void res.status(bad.length && !dryRun ? 400 : 200).json({ ok: !bad.length, rows: checked.length, errors: bad.map((b) => ({ row: b.row, errors: b.errors })) });
    }

    const created: TaskRow[] = [];
    const keyed = new Map<string, string>(); // KEY-n → id, for parents created in this file
    await db.transaction(async (tx) => {
      for (const c of checked) {
        const d = c.data!;
        let parentTaskId: string | undefined;
        if (d.parent) {
          const ref = d.parent.toUpperCase();
          parentTaskId = keyed.get(ref);
          if (!parentTaskId) {
            const parent = await findTaskByRef(tx as unknown as Database, ref);
            if (!parent || parent.projectId !== projectId) throw new AppError("IMPORT_FAILED", `Row ${c.row}: parent ${d.parent} isn't on this project`, 400);
            parentTaskId = parent.id;
          }
        }
        const [t] = await tx
          .insert(tasks)
          .values({
            projectId,
            parentTaskId,
            title: d.title,
            description: d.description || undefined,
            type: d.type,
            priority: d.priority,
            labels: d.labels,
            storyPoints: d.storyPoints,
            estimateHours: d.estimateHours?.toString(),
            dueDate: d.dueDate ? new Date(`${d.dueDate}T23:59:00+05:30`) : undefined,
            assigneeId: d.assignee ? byEmail.get(d.assignee.toLowerCase()) : undefined,
            createdBy: req.user!.sub,
          })
          .returning();
        keyed.set(`${project.key}-${t.number}`, t.id);
        await tx.insert(taskEvents).values({ taskId: t.id, actorUserId: req.user!.sub, action: "create", toStatus: "todo", note: "Imported from a spreadsheet" });
        await addWatchers(tx, t.id, [req.user!.sub, t.assigneeId]);
        created.push(t);
      }
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "task.import", entityType: "project", entityId: projectId, ipAddress: req.ip, metadata: { count: created.length } });
    // One notification per person, not per issue.
    const perPerson = new Map<string, number>();
    created.forEach((t) => t.assigneeId && t.assigneeId !== req.user!.sub && perPerson.set(t.assigneeId, (perPerson.get(t.assigneeId) ?? 0) + 1));
    for (const [userId, n] of perPerson) {
      await notify(db, { userIds: [userId], actorUserId: req.user!.sub, kind: "task.assigned", title: `${n} new issue${n === 1 ? "" : "s"} for you in ${project.title}`, body: "They were imported from a spreadsheet.", link: `/projects/${projectId}` });
    }
    res.status(201).json({ ok: true, created: created.length, tasks: (await withKeys(db, created)).map((t) => ({ id: t.id, key: t.key, title: t.title })) });
  });

  return router;
}
