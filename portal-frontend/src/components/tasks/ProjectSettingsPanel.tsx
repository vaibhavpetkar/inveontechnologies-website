import { useEffect, useState } from "react";
import { Bell, GitBranch, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { setCachedProjectSettings, type ProjectSettings, type Who } from "../../lib/projectSettings";
import { BOARD_COLUMNS, STATUS_META, type TaskStatus } from "../../lib/tasks";
import { ReadOnlyNote, Switch } from "../settings/ui";
import { useToast } from "../Toast";
import { AutomationRules } from "./AutomationRules";
import "../../styles/settings.css";
import "../../styles/automation.css";

/** The project's schemes (workflow, permissions, notifications) and its automation rules. */
export function ProjectSettingsPanel({ projectId, canManage, people }: { projectId: string; canManage: boolean; people: { id: string; name: string }[] }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [labels, setLabels] = useState<Partial<Record<TaskStatus, string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ settings: ProjectSettings }>(`/api/v1/projects/${projectId}/settings`, { accessToken })
      .then((r) => {
        setSettings(r.settings);
        setLabels(r.settings.workflow.labels);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the settings."));
  }, [projectId, accessToken]);

  async function save(patch: Partial<{ [K in keyof ProjectSettings]: Partial<ProjectSettings[K]> }>, what = "Saved") {
    try {
      const r = await apiFetch<{ settings: ProjectSettings }>(`/api/v1/projects/${projectId}/settings`, { method: "PUT", body: patch, accessToken });
      setSettings(r.settings);
      setCachedProjectSettings(projectId, r.settings);
      toast(what);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!settings) return <div className="skeleton" style={{ height: 320 }} />;
  const w = settings.workflow;
  const labelsChanged = BOARD_COLUMNS.some((s) => (labels[s] ?? "") !== (w.labels[s] ?? ""));
  const whoSelect = (key: keyof ProjectSettings["permissions"], label: string, hint: string) => (
    <label className="ps-perm">
      <span>
        <strong>{label}</strong>
        <span className="muted-small">{hint}</span>
      </span>
      <select value={settings.permissions[key]} disabled={!canManage} onChange={(e) => save({ permissions: { [key]: e.target.value as Who } }, "Permissions saved")}>
        <option value="members">Everyone on the project</option>
        <option value="leads">Owner and leads only</option>
      </select>
    </label>
  );

  return (
    <div className="ps-grid">
      {!canManage && <ReadOnlyNote>Only the project's owner and leads can change these. You can read them.</ReadOnlyNote>}
      <section className="report-card">
        <header className="report-head"><h3><GitBranch size={17} /> Workflow</h3></header>
        <p className="muted-small">Rename the board's columns to match how your team talks. The steps themselves stay the same, so reports and sprints keep working.</p>
        <div className="ps-labels">
          {BOARD_COLUMNS.map((s) => (
            <label key={s}>
              <span className="muted-small">{STATUS_META[s].label}</span>
              <input value={labels[s] ?? ""} placeholder={STATUS_META[s].label} maxLength={30} disabled={!canManage} onChange={(e) => setLabels({ ...labels, [s]: e.target.value })} />
            </label>
          ))}
        </div>
        {canManage && labelsChanged && (
          <button className="btn btn-sm" style={{ width: "fit-content" }} onClick={() => save({ workflow: { labels: Object.fromEntries(Object.entries(labels).filter(([, v]) => v?.trim())) } }, "Column names saved")}>
            Save column names
          </button>
        )}
        <Switch
          id="ps-review"
          checked={w.requireReview}
          disabled={!canManage}
          onChange={(v) => save({ workflow: { requireReview: v } }, v ? "Work now needs a review" : "Assignees now close their own work")}
          label="Work needs a reviewer's approval"
          hint="Off: the assignee marks their own issue done, with no review step."
        />
        <Switch
          id="ps-changes"
          checked={w.showChangesRequested}
          disabled={!canManage}
          onChange={(v) => save({ workflow: { showChangesRequested: v } })}
          label={`Show the "${w.labels.changes_requested || "Changes requested"}" column`}
          hint="When hidden, it still appears while an issue is in it."
        />
      </section>

      <section className="report-card">
        <header className="report-head"><h3><ShieldCheck size={17} /> Permissions</h3></header>
        {whoSelect("createIssues", "Create issues", "Who can add issues to this project.")}
        {whoSelect("planSprints", "Plan sprints", "Create, start and complete sprints, and rank the backlog.")}
        {whoSelect("editAnyIssue", "Edit any issue", "Change issues someone else created. Assignees can always edit their own.")}
      </section>

      <section className="report-card">
        <header className="report-head"><h3><Bell size={17} /> Notifications</h3></header>
        <p className="muted-small">What this project tells people about. @mentions always notify.</p>
        <Switch id="ps-n-assigned" checked={settings.notifications.assigned} disabled={!canManage} onChange={(v) => save({ notifications: { assigned: v } })} label="Someone is assigned an issue" />
        <Switch id="ps-n-comment" checked={settings.notifications.comment} disabled={!canManage} onChange={(v) => save({ notifications: { comment: v } })} label="New comments, to watchers" />
        <Switch id="ps-n-status" checked={settings.notifications.statusChange} disabled={!canManage} onChange={(v) => save({ notifications: { statusChange: v } })} label="Status changes, reviews and approvals" />
        <Switch id="ps-n-sprint" checked={settings.notifications.sprintStarted} disabled={!canManage} onChange={(v) => save({ notifications: { sprintStarted: v } })} label="A sprint starts" />
      </section>

      <AutomationRules projectId={projectId} people={people} />
    </div>
  );
}
