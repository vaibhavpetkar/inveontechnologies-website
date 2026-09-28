import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface GithubStatus {
  enabled: boolean;
  defaultRepo: string | null;
  webhook: boolean;
  username: string | null;
}

let cached: Promise<GithubStatus> | null = null;

/** Whether GitHub is connected, and the signed-in person's GitHub username. Fetched once per page load. */
export function useGithubStatus(accessToken: string | null) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    cached ??= apiFetch<GithubStatus>("/api/v1/github/status", { accessToken }).catch(() => ({ enabled: false, defaultRepo: null, webhook: false, username: null }));
    cached.then(setStatus);
  }, [accessToken]);
  const setUsername = (username: string | null) => {
    setStatus((s) => (s ? { ...s, username } : s));
    cached = cached?.then((s) => ({ ...s, username })) ?? null;
  };
  return { status, setUsername };
}

export const issueLabel = (repo: string, n: number) => `${repo.split("/")[1]}#${n}`;
