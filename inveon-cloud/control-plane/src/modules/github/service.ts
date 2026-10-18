import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, domains, githubInstallations, githubPrComments } from "../../db/schema.js";
import { GithubApiError, githubAppConfigured, githubRequest, installationToken } from "../../lib/github-app.js";
import { logger } from "../../lib/logger.js";
import { dashboardLink } from "../alerts/service.js";

type App = typeof apps.$inferSelect;

/**
 * Where the GitHub App is used: reading a repo (commit lookups and the
 * compose file), cloning it on the server for builds, and the preview
 * comment and commit status on pull requests. Each needs an installation
 * linked to the app's organization on the repo's owner; without one, reads
 * fall back to INVEON_GITHUB_TOKEN and clones to the deploy key (or an
 * anonymous clone), and nothing is posted.
 */

/** The linked, active installation for this organization on that GitHub account. */
export async function installationFor(db: Database, orgId: string, owner: string): Promise<number | null> {
  if (!githubAppConfigured()) return null;
  const row = await db.query.githubInstallations.findFirst({
    where: and(eq(githubInstallations.orgId, orgId), sql`lower(${githubInstallations.accountLogin}) = ${owner.toLowerCase()}`, isNull(githubInstallations.suspendedAt)),
    columns: { installationId: true },
  });
  return row?.installationId ?? null;
}

/** A token that can only read this one repo's contents, for an hour. */
async function repoToken(db: Database, app: App): Promise<string | null> {
  const installationId = await installationFor(db, app.orgId, app.repoOwner);
  if (!installationId) return null;
  return installationToken(installationId, { repositories: [app.repoName], permissions: { contents: "read" } });
}

/** For lib/github.ts reads: the installation token, else INVEON_GITHUB_TOKEN (the fallback). */
export async function repoReadToken(db: Database, env: Env, app: App): Promise<string | undefined> {
  try {
    return (await repoToken(db, app)) ?? env.INVEON_GITHUB_TOKEN;
  } catch (err) {
    logger.warn({ err, appId: app.id }, "No GitHub App token for this repo; falling back to INVEON_GITHUB_TOKEN");
    return env.INVEON_GITHUB_TOKEN;
  }
}

/**
 * How the agent clones for a build. An installation token (short-lived,
 * this repo only, contents read) when the App is installed; else the app's
 * deploy key; else anonymous. The long-lived INVEON_GITHUB_TOKEN never
 * leaves the control plane.
 */
export async function cloneTokenFor(db: Database, app: App): Promise<string | null> {
  try {
    return await repoToken(db, app);
  } catch (err) {
    logger.warn({ err, appId: app.id }, "Could not mint a GitHub App token for the clone");
    return null;
  }
}

// ---------------------------------------------------------------- pull request comments

export type PreviewState = "deploying" | "live" | "failed" | "removed";

export interface PreviewNotice {
  app: App;
  pr: number;
  state: PreviewState;
  commitSha?: string | null;
  environmentId?: string | null;
  hostname?: string | null;
  error?: string | null;
}

const MARKER = "<!-- inveon-cloud-preview -->";

export function previewCommentBody(n: PreviewNotice, url: string | null) {
  const sha = n.commitSha ? `\`${n.commitSha.slice(0, 7)}\`` : "";
  const status = {
    deploying: `Deploying ${sha}…`,
    live: `Live at ${sha}`,
    failed: `Deploy of ${sha} failed. The previous preview, if any, is still serving.`,
    removed: "Torn down (the pull request was closed).",
  }[n.state];
  const lines = [MARKER, "**Inveon Cloud preview**", "", `| | |`, `|---|---|`, `| Status | ${status} |`];
  if (url && n.state !== "removed") lines.push(`| Preview | ${url} |`);
  if (n.environmentId && n.state !== "removed") lines.push(`| Dashboard | ${dashboardLink(`/apps/${n.app.id}?env=${n.environmentId}`)} |`);
  if (n.state === "failed" && n.error) lines.push("", "```", n.error.slice(0, 600).replace(/```/g, "'''"), "```");
  return lines.join("\n");
}

async function previewUrl(db: Database, n: PreviewNotice) {
  if (!n.hostname) return null;
  const d = await db.query.domains.findFirst({ where: eq(domains.hostname, n.hostname), columns: { status: true } });
  // HTTPS once the preview's certificate is issued; until then plain HTTP works.
  return `${d?.status === "active" ? "https" : "http"}://${n.hostname}`;
}

/** Creates the PR's one comment, or edits it (a new one if somebody deleted it). */
async function upsertComment(db: Database, token: string, n: PreviewNotice, body: string) {
  const repo = `/repos/${n.app.repoOwner}/${n.app.repoName}`;
  const existing = await db.query.githubPrComments.findFirst({ where: and(eq(githubPrComments.appId, n.app.id), eq(githubPrComments.prNumber, n.pr)) });
  if (existing) {
    try {
      await githubRequest("PATCH", `${repo}/issues/comments/${existing.commentId}`, { token, body: { body } });
      await db.update(githubPrComments).set({ updatedAt: new Date() }).where(eq(githubPrComments.id, existing.id));
      return;
    } catch (err) {
      if (!(err instanceof GithubApiError) || err.status !== 404) throw err;
    }
  }
  const created = await githubRequest<{ id?: number }>("POST", `${repo}/issues/${n.pr}/comments`, { token, body: { body } });
  if (typeof created.id !== "number") throw new GithubApiError(502, "GitHub returned no comment id");
  await db
    .insert(githubPrComments)
    .values({ appId: n.app.id, prNumber: n.pr, commentId: created.id })
    .onConflictDoUpdate({ target: [githubPrComments.appId, githubPrComments.prNumber], set: { commentId: created.id, updatedAt: new Date() } });
}

async function postNotice(db: Database, n: PreviewNotice) {
  const installationId = await installationFor(db, n.app.orgId, n.app.repoOwner);
  if (!installationId) return;
  const token = await installationToken(installationId, { repositories: [n.app.repoName], permissions: { pull_requests: "write", statuses: "write" } });
  const url = await previewUrl(db, n);
  await upsertComment(db, token, n, previewCommentBody(n, url));
  if (n.commitSha && n.state !== "removed") {
    const state = { deploying: "pending", live: "success", failed: "failure" }[n.state];
    const description = { deploying: "Deploying the preview", live: "Preview is live", failed: "Preview deploy failed" }[n.state];
    await githubRequest("POST", `/repos/${n.app.repoOwner}/${n.app.repoName}/statuses/${n.commitSha}`, {
      token,
      body: { state, description, context: "inveon-cloud/preview", ...(url && n.state === "live" ? { target_url: url } : n.environmentId ? { target_url: dashboardLink(`/apps/${n.app.id}?env=${n.environmentId}`) } : {}) },
    });
  }
}

// One at a time per pull request, in order, so "deploying" never lands after "live".
const queues = new Map<string, Promise<void>>();

/**
 * Posts or updates the PR's preview comment and the commit status. Runs in
 * the background: GitHub being slow or down never holds up or fails a
 * deploy. Returns the promise for tests and callers that want to wait.
 */
export function notifyPreview(db: Database, n: PreviewNotice): Promise<void> {
  if (!githubAppConfigured()) return Promise.resolve();
  const key = `${n.app.id}#${n.pr}`;
  const next = (queues.get(key) ?? Promise.resolve())
    .then(() => postNotice(db, n))
    .catch((err) => logger.warn({ err: err instanceof GithubApiError ? err.message : err, appId: n.app.id, pr: n.pr, state: n.state }, "Could not update the pull request's preview comment"));
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}
