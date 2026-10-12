import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ChevronDown, ChevronRight, Package, Plus, Rocket, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { STATUS_META, type IssueType, type TaskPriority, type TaskStatus } from "../../lib/tasks";
import { useToast } from "../Toast";
import { IssueKey, IssueTypeIcon } from "./IssueBits";
import "../../styles/engineering.css";

interface Version {
  id: string;
  name: string;
  description: string | null;
  status: "unreleased" | "released" | "archived";
  startDate: string | null;
  releaseDate: string | null;
  releasedAt: string | null;
  progress: { issues: number; done: number; inProgress: number; points: number };
}
interface VersionIssue {
  id: string;
  key: string | null;
  title: string;
  type: IssueType;
  status: TaskStatus;
  priority: TaskPriority;
  storyPoints: number | null;
  assignee: { id: string; name: string } | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

/** A project's releases: what's in each version, how far along it is, and shipping it. */
export function Releases({ projectId, onOpenTask, version = 0 }: { projectId: string; onOpenTask: (ref: string) => void; version?: number }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ versions: Version[]; canManage: boolean } | null>(null);
  const [open, setOpen] = useState<Record<string, VersionIssue[] | "loading">>({});
  const [creating, setCreating] = useState(false);
  const [releasing, setReleasing] = useState<Version | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ versions: Version[]; canManage: boolean }>(`/api/v1/projects/${projectId}/versions`, { accessToken }).then(setData).catch(() => setData({ versions: [], canManage: false }));
  }, [projectId, accessToken]);
  useEffect(() => {
    load();
    setOpen({});
  }, [load, version]);

  async function toggle(v: Version) {
    if (open[v.id]) return setOpen(({ [v.id]: _, ...rest }) => rest);
    setOpen((o) => ({ ...o, [v.id]: "loading" }));
    const r = await apiFetch<{ issues: VersionIssue[] }>(`/api/v1/versions/${v.id}`, { accessToken }).catch(() => ({ issues: [] }));
    setOpen((o) => ({ ...o, [v.id]: r.issues }));
  }

  async function archive(v: Version) {
    try {
      await apiFetch(`/api/v1/versions/${v.id}`, { method: "PUT", body: { status: v.status === "archived" ? "unreleased" : "archived" }, accessToken });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update the version.", "error");
    }
  }
  async function remove(v: Version) {
    if (!window.confirm(`Delete ${v.name}? Its issues stay, without a version.`)) return;
    await apiFetch(`/api/v1/versions/${v.id}`, { method: "DELETE", accessToken }).catch(() => undefined);
    load();
  }

  if (!data) return <div className="skeleton" style={{ height: 200 }} />;
  const shown = data.versions.filter((v) => showArchived || v.status !== "archived");
  const archivedCount = data.versions.filter((v) => v.status === "archived").length;

  return (
    <div className="releases">
      <div className="backlog-head">
        <p className="muted-small">Set an issue's fix version in its details, or from the issue list with bulk edit.</p>
        <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
          {archivedCount > 0 && (
            <label className="toggle"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived ({archivedCount})</label>
          )}
          {data.canManage && <button className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> New version</button>}
        </span>
      </div>

      {shown.length === 0 && (
        <div className="empty-state">
          <Package size={28} />
          <h3>No versions yet</h3>
          <p>Create a version like "v1.0" to group the issues that ship together.</p>
        </div>
      )}

      {shown.map((v) => {
        const p = v.progress;
        const late = v.status === "unreleased" && v.releaseDate && new Date(v.releaseDate) < new Date();
        const issues = open[v.id];
        return (
          <section key={v.id} className={`release-card${v.status !== "unreleased" ? " released" : ""}`}>
            <div className="release-head">
              <button type="button" className="sprint-toggle" aria-expanded={!!issues} onClick={() => toggle(v)}>
                {issues ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <h3><Package size={16} /> {v.name}</h3>
              </button>
              <span className={`pill pill-${v.status === "released" ? "green" : v.status === "archived" ? "slate" : late ? "red" : "blue"}`}>
                {v.status === "released" ? "Released" : v.status === "archived" ? "Archived" : late ? "Overdue" : "Unreleased"}
              </span>
              {data.canManage && (
                <span className="release-actions">
                  {v.status === "unreleased" && <button className="btn btn-sm" onClick={() => setReleasing(v)}><Rocket size={13} /> Release</button>}
                  {v.status !== "released" && <button className="icon-button" aria-label={v.status === "archived" ? `Restore ${v.name}` : `Archive ${v.name}`} onClick={() => archive(v)}><Archive size={14} /></button>}
                  <button className="icon-button" aria-label={`Delete ${v.name}`} onClick={() => remove(v)}><Trash2 size={14} /></button>
                </span>
              )}
            </div>
            {v.description && <p className="muted-small" style={{ margin: 0 }}>{v.description}</p>}
            <div className="release-bar" role="img" aria-label={`${p.done} of ${p.issues} issues done`}>
              <span className="done" style={{ width: `${p.issues ? (p.done / p.issues) * 100 : 0}%` }} />
              <span className="doing" style={{ width: `${p.issues ? (p.inProgress / p.issues) * 100 : 0}%` }} />
            </div>
            <div className="release-meta">
              <span>{p.done} of {p.issues} issues done</span>
              {p.points > 0 && <span>{p.points} points</span>}
              {v.startDate && <span>Starts {fmt(v.startDate)}</span>}
              {v.status === "released" ? <span>Released {fmt(v.releasedAt ?? v.releaseDate)}</span> : v.releaseDate && <span>Due {fmt(v.releaseDate)}</span>}
            </div>
            {issues === "loading" && <div className="skeleton" style={{ height: 40 }} />}
            {Array.isArray(issues) && (
              issues.length ? (
                <ul className="release-issues">
                  {issues.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => onOpenTask(i.key ?? i.id)}>
                        <IssueTypeIcon type={i.type} size={15} />
                        <IssueKey value={i.key} />
                        <span className="title">{i.title}</span>
                        <span className="muted-small">{i.assignee?.name ?? "Unassigned"}</span>
                        <span className={`pill pill-${STATUS_META[i.status].tone}`}>{STATUS_META[i.status].label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-small">No issues in this version yet.</p>
              )
            )}
          </section>
        );
      })}

      <AnimatePresence>
        {creating && <VersionDialog projectId={projectId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
        {releasing && (
          <ReleaseDialog
            version={releasing}
            others={data.versions.filter((v) => v.status === "unreleased" && v.id !== releasing.id)}
            onClose={() => setReleasing(null)}
            onDone={(msg) => {
              setReleasing(null);
              toast(msg);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function VersionDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({ name: "", description: "", startDate: "", releaseDate: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/v1/projects/${projectId}/versions`, {
        method: "POST",
        body: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          startDate: form.startDate ? new Date(`${form.startDate}T00:00:00`).toISOString() : undefined,
          releaseDate: form.releaseDate ? new Date(`${form.releaseDate}T23:59:00`).toISOString() : undefined,
        },
        accessToken,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the version.");
      setSaving(false);
    }
  }
  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="version-title" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
        <div className="modal-head">
          <h2 id="version-title">New version</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="v-name">Name</label>
          <input id="v-name" autoFocus required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. v1.0 or June launch" />
        </div>
        <div className="field">
          <label htmlFor="v-desc">What's in it</label>
          <textarea id="v-desc" rows={2} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="v-start">Starts</label>
            <input id="v-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="v-release">Release date</label>
            <input id="v-release" type="date" min={form.startDate || undefined} value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Create version"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function ReleaseDialog({ version, others, onClose, onDone }: { version: Version; others: Version[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { accessToken } = useAuth();
  const open = version.progress.issues - version.progress.done;
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await apiFetch<{ movedOpen: number }>(`/api/v1/versions/${version.id}/release`, { method: "POST", body: { moveOpenTo: moveTo || null }, accessToken });
      onDone(r.movedOpen ? `${version.name} released. ${r.movedOpen} unfinished issue${r.movedOpen === 1 ? "" : "s"} moved on.` : `${version.name} released`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't release the version.");
      setSaving(false);
    }
  }
  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="release-title" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
        <div className="modal-head">
          <h2 id="release-title">Release {version.name}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <p>{version.progress.done} of {version.progress.issues} issues are done.</p>
        {open > 0 && (
          <div className="field">
            <label htmlFor="rel-move">Move the {open} unfinished issue{open === 1 ? "" : "s"} to</label>
            <select id="rel-move" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {others.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="">No version</option>
            </select>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving}>{saving ? "Releasing…" : "Release"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
