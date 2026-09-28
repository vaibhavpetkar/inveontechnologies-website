import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "../shared/env.js";
import { AppError } from "../shared/errors.js";

/** The handful of GitHub REST calls the task sync needs, authenticated with one org token. */
export interface GithubConfig {
  token: string;
  baseUrl: string;
  defaultRepo: string | null;
  webhookSecret: string | null;
}

export interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  assignees?: { login: string }[];
  labels?: ({ name: string } | string)[];
  pull_request?: unknown;
}

export function githubConfig(env: Env): GithubConfig | null {
  if (!env.GITHUB_TOKEN) return null;
  return {
    token: env.GITHUB_TOKEN,
    baseUrl: env.GITHUB_API_BASE ?? "https://api.github.com",
    defaultRepo: env.GITHUB_DEFAULT_REPO ?? null,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? null,
  };
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
export const isRepo = (s: string) => REPO_RE.test(s);

async function call<T>(config: GithubConfig, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "inveon-portal",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (res.status === 404) throw new AppError("GITHUB_NOT_FOUND", "GitHub couldn't find that repository or issue, or the token can't see it", 404);
  if (!res.ok) throw new AppError("GITHUB_ERROR", `GitHub: ${json.message ?? `HTTP ${res.status}`}`, 502);
  return json;
}

export function createIssue(config: GithubConfig, repo: string, input: { title: string; body?: string; assignees?: string[]; labels?: string[] }) {
  return call<GithubIssue>(config, "POST", `/repos/${repo}/issues`, input);
}

export function getIssue(config: GithubConfig, repo: string, number: number) {
  return call<GithubIssue>(config, "GET", `/repos/${repo}/issues/${number}`);
}

export function setIssueState(config: GithubConfig, repo: string, number: number, state: "open" | "closed", stateReason?: "completed" | "not_planned") {
  return call<GithubIssue>(config, "PATCH", `/repos/${repo}/issues/${number}`, { state, ...(stateReason ? { state_reason: stateReason } : {}) });
}

export function commentOnIssue(config: GithubConfig, repo: string, number: number, body: string) {
  return call<unknown>(config, "POST", `/repos/${repo}/issues/${number}/comments`, { body });
}

/** Open issues in a repo, pull requests left out, up to `max`. */
export async function listOpenIssues(config: GithubConfig, repo: string, max = 200) {
  const out: GithubIssue[] = [];
  for (let page = 1; out.length < max && page <= 10; page++) {
    const batch = await call<GithubIssue[]>(config, "GET", `/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    out.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return out.slice(0, max);
}

/**
 * Accepts "#12", "12", "owner/repo#12" or an issue URL. A bare number needs a
 * fallback repo (the task's project repo or the default).
 */
export function parseIssueRef(ref: string, fallbackRepo: string | null): { repo: string; number: number } | null {
  const s = ref.trim();
  const url = s.match(/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)/);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const full = s.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
  if (full) return { repo: full[1], number: Number(full[2]) };
  const bare = s.match(/^#?(\d+)$/);
  if (bare && fallbackRepo) return { repo: fallbackRepo, number: Number(bare[1]) };
  return null;
}

/** GitHub signs webhook bodies as "sha256=" + hex HMAC-SHA256 with the webhook secret. */
export function verifyGithubSignature(secret: string, rawBody: string, header: string | undefined) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
