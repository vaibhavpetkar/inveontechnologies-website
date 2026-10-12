import type { Env } from "../env.js";
import { AppError } from "./errors.js";

/** Accepts https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git). */
export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = url.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function gh(env: Env, path: string, accept = "application/vnd.github+json") {
  const headers: Record<string, string> = { Accept: accept, "User-Agent": "inveon-cloud", "X-GitHub-Api-Version": "2022-11-28" };
  if (env.INVEON_GITHUB_TOKEN) headers.Authorization = `Bearer ${env.INVEON_GITHUB_TOKEN}`;
  let res: globalThis.Response;
  try {
    res = await fetch(env.INVEON_GITHUB_API_BASE.replace(/\/$/, "") + path, { headers, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new AppError("GITHUB_UNREACHABLE", "Could not reach GitHub", 502);
  }
  if (res.status === 404) throw new AppError("GITHUB_NOT_FOUND", "GitHub could not find that repository, branch or file (private repos need INVEON_GITHUB_TOKEN)", 400);
  if (!res.ok) throw new AppError("GITHUB_ERROR", `GitHub returned ${res.status}`, 502);
  return res;
}

export async function fetchHeadCommit(env: Env, owner: string, repo: string, ref: string) {
  const res = await gh(env, `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  const body = (await res.json()) as { sha?: string; commit?: { message?: string } };
  if (!body.sha || !/^[0-9a-f]{40}$/.test(body.sha)) throw new AppError("GITHUB_ERROR", "GitHub returned no commit", 502);
  return { sha: body.sha, message: body.commit?.message ?? null };
}

export async function fetchFileAtCommit(env: Env, owner: string, repo: string, path: string, sha: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await gh(env, `/repos/${owner}/${repo}/contents/${encoded}?ref=${sha}`, "application/vnd.github.raw");
  const text = await res.text();
  if (text.length > 256 * 1024) throw new AppError("COMPOSE_TOO_LARGE", "Compose file is larger than 256 KB", 400);
  return text;
}
