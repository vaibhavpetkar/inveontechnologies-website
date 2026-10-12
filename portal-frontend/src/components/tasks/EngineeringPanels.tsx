import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { STATUS_META, timeAgo, type IssueType, type Task, type TaskPriority, type TaskStatus } from "../../lib/tasks";
import { useToast } from "../Toast";
import { IssueKey, IssueTypeIcon } from "./IssueBits";
import "../../styles/engineering.css";

interface LinkRow {
  id: string;
  type: "blocks" | "relates" | "duplicates" | "clones";
  direction: "outward" | "inward";
  label: string;
  task: { id: string; key: string | null; title: string; status: TaskStatus; type: IssueType; priority: TaskPriority };
}

const LINK_CHOICES = [
  { value: "blocks:out", label: "blocks" },
  { value: "blocks:in", label: "is blocked by" },
  { value: "relates:out", label: "relates to" },
  { value: "duplicates:out", label: "duplicates" },
  { value: "duplicates:in", label: "is duplicated by" },
  { value: "clones:out", label: "clones" },
];

/** "Linked issues" on the task drawer: blocks, relates to, duplicates. */
export function LinkedIssues({ task, canEdit, onOpen }: { task: Task; canEdit: boolean; onOpen: (ref: string) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("blocks:out");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ links: LinkRow[] }>(`/api/v1/tasks/${task.id}/links`, { accessToken }).then((r) => setLinks(r.links)).catch(() => setLinks([]));
  }, [task.id, accessToken]);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const [type, dir] = kind.split(":");
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks/${task.id}/links`, { method: "POST", body: { target: target.trim(), type, inward: dir === "in" }, accessToken });
      setTarget("");
      setAdding(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't link the issues.", "error");
    }
    setBusy(false);
  }

  async function remove(link: LinkRow) {
    setLinks((l) => l?.filter((x) => x.id !== link.id) ?? l);
    await apiFetch(`/api/v1/task-links/${link.id}`, { method: "DELETE", accessToken }).catch(() => load());
  }

  if (!task.projectId || links === null) return null;
  if (!links.length && !canEdit) return null;
  const groups = [...new Set(links.map((l) => l.label))];
  const blockedBy = links.filter((l) => l.label === "is blocked by" && l.task.status !== "done" && l.task.status !== "cancelled");

  return (
    <div className="drawer-section">
      <h3>
        <Link2 size={15} /> Linked issues
        {canEdit && !adding && (
          <button type="button" className="link-button" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>
            <Plus size={13} /> Link
          </button>
        )}
      </h3>
      {blockedBy.length > 0 && <p className="blocked-note">Blocked until {blockedBy.map((b) => b.task.key ?? b.task.title).join(", ")} {blockedBy.length === 1 ? "is" : "are"} done.</p>}
      {groups.map((g) => (
        <div key={g} className="link-group">
          <span className="link-label">{g}</span>
          {links.filter((l) => l.label === g).map((l) => (
            <div key={l.id} className="subtask-row clickable" role="button" tabIndex={0} onClick={() => onOpen(l.task.key ?? l.task.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(l.task.key ?? l.task.id)}>
              <IssueTypeIcon type={l.task.type} size={15} />
              <IssueKey value={l.task.key} />
              <span className={l.task.status === "done" ? "struck" : undefined}>{l.task.title}</span>
              <span className={`pill pill-${STATUS_META[l.task.status].tone}`} style={{ marginLeft: "auto" }}>{STATUS_META[l.task.status].label}</span>
              {canEdit && (
                <button type="button" className="icon-button" aria-label={`Remove link to ${l.task.key ?? l.task.title}`} onClick={(e) => { e.stopPropagation(); remove(l); }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {adding && (
        <form className="link-add" onSubmit={add}>
          <select aria-label="Link type" value={kind} onChange={(e) => setKind(e.target.value)}>
            {LINK_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input autoFocus value={target} maxLength={60} onChange={(e) => setTarget(e.target.value)} placeholder="Issue key, e.g. RAIL-12" aria-label="Issue to link" />
          <button className="btn btn-sm" disabled={busy || !target.trim()}>Link</button>
          <button type="button" className="icon-button" aria-label="Cancel" onClick={() => setAdding(false)}><X size={15} /></button>
        </form>
      )}
      {!links.length && !adding && <p className="muted-small">No links yet. Say which issues block this one, or which it duplicates.</p>}
    </div>
  );
}

interface DevLink {
  id: string;
  kind: "branch" | "commit" | "pull_request";
  repo: string;
  ref: string;
  title: string | null;
  url: string | null;
  state: "open" | "closed" | "merged" | "draft" | "deleted" | null;
  author: string | null;
  updatedAt: string;
}

/** Branches, commits and pull requests that mention the issue's key. */
export function DevelopmentPanel({ task }: { task: Task }) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<{ branchName: string | null; branches: DevLink[]; commits: DevLink[]; pullRequests: DevLink[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<NonNullable<typeof data>>(`/api/v1/tasks/${task.id}/development`, { accessToken }).then(setData).catch(() => setData(null));
  }, [task.id, task.updatedAt, accessToken]);

  if (!data?.branchName) return null;
  const command = `git checkout -b ${data.branchName}`;
  const any = data.branches.length + data.commits.length + data.pullRequests.length > 0;

  return (
    <div className="drawer-section dev-panel">
      <h3><GitBranch size={15} /> Development</h3>
      <div className="branch-copy">
        <code>{command}</code>
        <button
          type="button"
          className="icon-button"
          aria-label="Copy the branch command"
          onClick={() => {
            navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {!any && <p className="muted-small">Put {task.key} in a branch name, commit message or pull request title and it shows up here. Opening the pull request moves this issue to review.</p>}
      {data.pullRequests.map((pr) => (
        <a key={pr.id} className="dev-row" href={pr.url ?? undefined} target="_blank" rel="noreferrer">
          {pr.state === "merged" ? <GitMerge size={15} className="tone-merged" /> : <GitPullRequest size={15} className={`tone-${pr.state ?? "open"}`} />}
          <span className="dev-title">#{pr.ref} {pr.title}</span>
          <span className={`pill pill-${pr.state === "merged" ? "violet" : pr.state === "closed" ? "slate" : pr.state === "draft" ? "slate" : "green"}`}>{pr.state === "draft" ? "Draft" : pr.state === "merged" ? "Merged" : pr.state === "closed" ? "Closed" : "Open"}</span>
        </a>
      ))}
      {data.branches.map((b) => (
        <a key={b.id} className="dev-row" href={b.url ?? undefined} target="_blank" rel="noreferrer">
          <GitBranch size={15} />
          <span className="dev-title"><code>{b.ref}</code></span>
          <span className="muted-small">{b.state === "deleted" ? "deleted" : b.repo}</span>
        </a>
      ))}
      {data.commits.map((c) => (
        <a key={c.id} className="dev-row" href={c.url ?? undefined} target="_blank" rel="noreferrer">
          <GitCommitHorizontal size={15} />
          <code className="sha">{c.ref.slice(0, 7)}</code>
          <span className="dev-title">{c.title}</span>
          <span className="muted-small">{c.author ? `${c.author} · ` : ""}{timeAgo(c.updatedAt)}</span>
        </a>
      ))}
    </div>
  );
}

interface Entry {
  id: string;
  userId: string;
  userName: string;
  hours: string;
  entryDate: string;
  note: string | null;
  canEdit: boolean;
}

/** The task's work log: who logged what, editable by its author and the task's managers. */
export function WorkLog({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ hours: "", note: "" });

  const load = useCallback(() => {
    apiFetch<{ entries: Entry[] }>(`/api/v1/tasks/${task.id}/time-entries`, { accessToken }).then((r) => setEntries(r.entries)).catch(() => setEntries([]));
  }, [task.id, accessToken]);
  useEffect(load, [load, task.actualHours]);

  async function save(e: FormEvent, entry: Entry) {
    e.preventDefault();
    try {
      await apiFetch(`/api/v1/tasks/${task.id}/time-entries/${entry.id}`, { method: "PUT", body: { hours: Number(form.hours), note: form.note.trim() || null }, accessToken });
      setEditing(null);
      load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the work log.", "error");
    }
  }
  async function remove(entry: Entry) {
    if (!window.confirm(`Delete ${Number(entry.hours)}h logged by ${entry.userName}?`)) return;
    try {
      await apiFetch(`/api/v1/tasks/${task.id}/time-entries/${entry.id}`, { method: "DELETE", accessToken });
      load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete the work log.", "error");
    }
  }

  if (!entries) return <div className="skeleton" style={{ height: 80 }} />;
  const est = Number(task.estimateHours ?? 0);
  const spent = Number(task.actualHours ?? 0);
  const remaining = task.remainingHours != null ? Number(task.remainingHours) : null;

  return (
    <div className="worklog">
      <div className="time-tracking" aria-label="Time tracking">
        <div><span>Estimate</span><strong>{est ? `${est}h` : "–"}</strong></div>
        <div><span>Logged</span><strong>{spent}h</strong></div>
        <div><span>Remaining</span><strong>{remaining !== null ? `${remaining}h` : "–"}</strong></div>
      </div>
      {entries.length === 0 ? (
        <p className="muted-small">No time logged yet.</p>
      ) : (
        <ul className="worklog-list">
          {entries.map((e) => (
            <li key={e.id}>
              {editing === e.id ? (
                <form className="worklog-edit" onSubmit={(ev) => save(ev, e)}>
                  <input type="number" min={0.1} max={24} step={0.25} value={form.hours} onChange={(ev) => setForm({ ...form, hours: ev.target.value })} aria-label="Hours" />
                  <input value={form.note} maxLength={1000} onChange={(ev) => setForm({ ...form, note: ev.target.value })} placeholder="What was done" aria-label="Note" />
                  <button className="btn btn-sm" disabled={!Number(form.hours)}>Save</button>
                  <button type="button" className="icon-button" aria-label="Cancel" onClick={() => setEditing(null)}><X size={14} /></button>
                </form>
              ) : (
                <>
                  <strong>{Number(e.hours)}h</strong>
                  <span>{e.userName}</span>
                  <span className="muted-small">{new Date(e.entryDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  {e.note && <span className="worklog-note">{e.note}</span>}
                  {e.canEdit && (
                    <span className="worklog-actions">
                      <button type="button" className="icon-button" aria-label="Edit work log" onClick={() => { setEditing(e.id); setForm({ hours: String(Number(e.hours)), note: e.note ?? "" }); }}><Pencil size={13} /></button>
                      <button type="button" className="icon-button" aria-label="Delete work log" onClick={() => remove(e)}><Trash2 size={13} /></button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface VersionOption {
  id: string;
  name: string;
  status: "unreleased" | "released" | "archived";
}

/** A project's versions, for pickers. */
export function useVersions(projectId: string | null | undefined) {
  const { accessToken } = useAuth();
  const [versions, setVersions] = useState<VersionOption[]>([]);
  useEffect(() => {
    if (!projectId) return setVersions([]);
    apiFetch<{ versions: VersionOption[] }>(`/api/v1/projects/${projectId}/versions`, { accessToken }).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, [projectId, accessToken]);
  return versions;
}
