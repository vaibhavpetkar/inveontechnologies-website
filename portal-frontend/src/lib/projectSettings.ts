import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { STATUS_META, type TaskStatus } from "./tasks";

export type Who = "members" | "leads";
export interface ProjectSettings {
  workflow: { labels: Partial<Record<TaskStatus, string>>; requireReview: boolean; showChangesRequested: boolean };
  permissions: { createIssues: Who; planSprints: Who; editAnyIssue: Who };
  notifications: { assigned: boolean; comment: boolean; statusChange: boolean; sprintStarted: boolean };
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  workflow: { labels: {}, requireReview: true, showChangesRequested: true },
  permissions: { createIssues: "members", planSprints: "leads", editAnyIssue: "leads" },
  notifications: { assigned: true, comment: true, statusChange: true, sprintStarted: true },
};

// One fetch per project per page load; saving a change updates it for everyone listening.
const cache = new Map<string, ProjectSettings>();
const listeners = new Set<() => void>();

export function setCachedProjectSettings(projectId: string, settings: ProjectSettings) {
  cache.set(projectId, settings);
  listeners.forEach((l) => l());
}

/** The project's settings, or the defaults while they load (and for personal tasks). */
export function useProjectSettings(projectId: string | null | undefined, accessToken: string | null): ProjectSettings {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    if (!projectId || cache.has(projectId)) return;
    apiFetch<{ settings: ProjectSettings }>(`/api/v1/projects/${projectId}/settings`, { accessToken })
      .then((r) => setCachedProjectSettings(projectId, r.settings))
      .catch(() => undefined);
  }, [projectId, accessToken]);
  return (projectId && cache.get(projectId)) || DEFAULT_PROJECT_SETTINGS;
}

/** A status's name on this project's board ("In review" can be renamed "QA"). */
export function statusLabel(status: TaskStatus, settings: ProjectSettings = DEFAULT_PROJECT_SETTINGS) {
  return settings.workflow.labels[status]?.trim() || STATUS_META[status].label;
}
