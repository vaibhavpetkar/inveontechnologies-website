import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Pencil, Play, Plus, Target, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { PRIORITY_META, sprintDates, STATUS_META, type BacklogIssue, type BacklogView, type ListStats, type Sprint } from "../../lib/tasks";
import { useToast } from "../Toast";
import { IssueKey, IssueTypeIcon, LabelChips } from "./IssueBits";
import "../../styles/sprints.css";

interface Props {
  projectId: string;
  onOpenTask: (ref: string) => void;
  /** Called after a change the rest of the project page should see (sprint started, issues moved). */
  onChanged: () => void;
  /** Bumped by the page when issues change elsewhere, to reload. */
  version?: number;
}

type ListId = string | null; // a sprint id, or null for the backlog

/**
 * Scrum planning: sprints at the top, the ranked backlog below. Project
 * managers drag issues to rank them and plan them into sprints, set story
 * points, and start and complete sprints.
 */
export function Backlog({ projectId, onOpenTask, onChanged, version = 0 }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<BacklogView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<BacklogIssue | null>(null);
  const [dropAt, setDropAt] = useState<{ list: ListId; before: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ sprint?: Sprint; start?: boolean } | null>(null);
  const [completing, setCompleting] = useState<(Sprint & { stats: ListStats }) | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await apiFetch<BacklogView>(`/api/v1/projects/${projectId}/backlog`, { accessToken }));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the backlog.");
    }
  }, [projectId, accessToken]);
  useEffect(() => {
    load();
  }, [load, version]);

  const lists: { id: ListId; issues: BacklogIssue[] }[] = view ? [...view.sprints.map((s) => ({ id: s.id as ListId, issues: s.issues })), { id: null, issues: view.backlog.issues }] : [];

  /** Move issues into a list, placed before `beforeId` (or at the end). */
  async function moveTo(issue: BacklogIssue, list: ListId, beforeId: string | null) {
    const target = lists.find((l) => l.id === list)?.issues.filter((i) => i.id !== issue.id) ?? [];
    const at = beforeId ? target.findIndex((i) => i.id === beforeId) : target.length;
    const after = at > 0 ? target[at - 1] : undefined;
    const before = at >= 0 && at < target.length ? target[at] : undefined;
    // Dropped where it already is.
    if (issue.sprintId === list && beforeId === issue.id) return;
    // Show it in place straight away.
    setView((v) => {
      if (!v) return v;
      const strip = (xs: BacklogIssue[]) => xs.filter((i) => i.id !== issue.id);
      const place = (xs: BacklogIssue[]) => {
        const out = strip(xs);
        const idx = beforeId ? out.findIndex((i) => i.id === beforeId) : -1;
        out.splice(idx < 0 ? out.length : idx, 0, { ...issue, sprintId: list });
        return out;
      };
      return {
        ...v,
        sprints: v.sprints.map((s) => ({ ...s, issues: s.id === list ? place(s.issues) : strip(s.issues) })),
        backlog: { ...v.backlog, issues: list === null ? place(v.backlog.issues) : strip(v.backlog.issues) },
      };
    });
    try {
      await apiFetch(`/api/v1/projects/${projectId}/backlog/move`, {
        method: "POST",
        body: { taskIds: [issue.id], sprintId: list, ...(after ? { afterId: after.id } : {}), ...(before ? { beforeId: before.id } : {}) },
        accessToken,
      });
      if (issue.sprintId !== list) onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't move that issue.", "error");
    }
    load();
  }

  async function setPoints(issue: BacklogIssue, value: string) {
    const storyPoints = value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
    if (storyPoints === issue.storyPoints || Number.isNaN(storyPoints)) return;
    try {
      await apiFetch(`/api/v1/tasks/${issue.id}`, { method: "PUT", body: { storyPoints }, accessToken });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the points.", "error");
    }
  }

  async function remove(sprint: Sprint) {
    if (!window.confirm(`Delete ${sprint.name}? Its issues go back to the backlog.`)) return;
    try {
      await apiFetch(`/api/v1/sprints/${sprint.id}`, { method: "DELETE", accessToken });
      toast(`${sprint.name} deleted`);
      load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete the sprint.", "error");
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!view) return <div className="skeleton" style={{ height: 240 }} />;

  const canManage = view.canManage;
  const active = view.sprints.find((s) => s.status === "active");
  const listProps = (list: ListId, issues: BacklogIssue[]) => ({
    issues,
    list,
    canManage,
    dragging,
    dropAt,
    lists: view.sprints.map((s) => ({ id: s.id, name: s.name })),
    onDragStart: setDragging,
    onDragEnd: () => {
      setDragging(null);
      setDropAt(null);
    },
    onHover: (before: string | null) => setDropAt({ list, before }),
    onDrop: (before: string | null) => {
      const d = dragging;
      setDragging(null);
      setDropAt(null);
      if (d) moveTo(d, list, before);
    },
    onMove: (issue: BacklogIssue, to: ListId, top: boolean) => moveTo(issue, to, top ? (lists.find((l) => l.id === to)?.issues.find((i) => i.id !== issue.id)?.id ?? null) : null),
    onOpen: (i: BacklogIssue) => onOpenTask(i.key ?? i.id),
    onPoints: setPoints,
  });

  return (
    <div className="backlog">
      <div className="backlog-head">
        <p className="muted-small">
          {canManage ? "Drag issues to rank them or plan them into a sprint. " : ""}
          {view.completedSprints > 0 ? `${view.completedSprints} sprint${view.completedSprints === 1 ? "" : "s"} completed so far.` : "No sprints completed yet."}
        </p>
        {canManage && (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing({})}>
            <Plus size={14} /> Create sprint
          </button>
        )}
      </div>

      {view.sprints.map((s) => {
        const open = !collapsed.has(s.id);
        return (
          <section key={s.id} className={`sprint-box${s.status === "active" ? " active" : ""}`} aria-label={s.name}>
            <header className="sprint-head">
              <button
                type="button"
                className="sprint-toggle"
                aria-expanded={open}
                onClick={() => setCollapsed((c) => {
                  const n = new Set(c);
                  if (n.has(s.id)) n.delete(s.id);
                  else n.add(s.id);
                  return n;
                })}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <strong>{s.name}</strong>
              </button>
              {s.status === "active" && <span className="pill pill-blue">Active</span>}
              <span className="sprint-dates"><CalendarRange size={13} /> {sprintDates(s)}</span>
              <span className="sprint-stats">
                {s.stats.issues} issue{s.stats.issues === 1 ? "" : "s"} · <PointsSummary stats={s.stats} />
              </span>
              {canManage && (
                <span className="sprint-actions">
                  {s.status === "planned" && (
                    <button className="btn btn-sm" disabled={!!active || s.issues.length === 0} title={active ? `${active.name} is still running` : s.issues.length === 0 ? "Add issues first" : undefined} onClick={() => setEditing({ sprint: s, start: true })}>
                      <Play size={13} /> Start sprint
                    </button>
                  )}
                  {s.status === "active" && (
                    <button className="btn btn-sm" onClick={() => setCompleting(s)}>
                      <CheckCircle2 size={13} /> Complete sprint
                    </button>
                  )}
                  <button className="icon-button" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ sprint: s })}>
                    <Pencil size={14} />
                  </button>
                  {s.status === "planned" && (
                    <button className="icon-button" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              )}
            </header>
            {s.goal && open && (
              <p className="sprint-goal">
                <Target size={13} /> {s.goal}
              </p>
            )}
            {open && <IssueRows {...listProps(s.id, s.issues)} empty={canManage ? "Drag issues here from the backlog to plan this sprint." : "Nothing planned yet."} />}
          </section>
        );
      })}

      <section className="sprint-box backlog-box" aria-label="Backlog">
        <header className="sprint-head">
          <strong>Backlog</strong>
          <span className="sprint-stats">
            {view.backlog.stats.issues} issue{view.backlog.stats.issues === 1 ? "" : "s"} · {view.backlog.stats.points} points
          </span>
        </header>
        <IssueRows {...listProps(null, view.backlog.issues)} empty="The backlog is empty. New issues land here." />
      </section>

      <AnimatePresence>
        {editing && (
          <SprintDialog
            projectId={projectId}
            sprint={editing.sprint}
            start={editing.start}
            onClose={() => setEditing(null)}
            onSaved={(msg) => {
              setEditing(null);
              toast(msg);
              load();
              onChanged();
            }}
          />
        )}
        {completing && (
          <CompleteSprintDialog
            sprint={completing}
            planned={view.sprints.filter((s) => s.status === "planned")}
            onClose={() => setCompleting(null)}
            onDone={(msg) => {
              setCompleting(null);
              toast(msg);
              load();
              onChanged();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PointsSummary({ stats }: { stats: ListStats }) {
  return (
    <span title={`${stats.donePoints} of ${stats.points} points done`}>
      {stats.donePoints > 0 ? `${stats.donePoints} / ${stats.points}` : stats.points} points
    </span>
  );
}

interface RowsProps {
  issues: BacklogIssue[];
  list: ListId;
  lists: { id: string; name: string }[];
  canManage: boolean;
  dragging: BacklogIssue | null;
  dropAt: { list: ListId; before: string | null } | null;
  empty: string;
  onDragStart: (i: BacklogIssue) => void;
  onDragEnd: () => void;
  onHover: (before: string | null) => void;
  onDrop: (before: string | null) => void;
  onMove: (i: BacklogIssue, to: ListId, top: boolean) => void;
  onOpen: (i: BacklogIssue) => void;
  onPoints: (i: BacklogIssue, value: string) => void;
}

function IssueRows({ issues, list, lists, canManage, dragging, dropAt, empty, onDragStart, onDragEnd, onHover, onDrop, onMove, onOpen, onPoints }: RowsProps) {
  const here = dropAt?.list === list;
  return (
    <ul
      className={`backlog-list${dragging ? " dragging" : ""}${here && dropAt?.before === null ? " drop-end" : ""}`}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        if (e.target === e.currentTarget) onHover(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) onDrop(null);
      }}
    >
      {issues.length === 0 && (
        <li className="backlog-empty" onDragOver={(e) => { if (dragging) { e.preventDefault(); onHover(null); } }} onDrop={(e) => { e.preventDefault(); onDrop(null); }}>
          {empty}
        </li>
      )}
      <AnimatePresence initial={false}>
        {issues.map((i) => {
          const done = i.status === "done" || i.status === "cancelled";
          return (
            <motion.li
              layout
              key={i.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`backlog-row${done ? " done" : ""}${here && dropAt?.before === i.id ? " drop-before" : ""}${dragging?.id === i.id ? " is-dragging" : ""}`}
            >
              <div
                className="backlog-row-inner"
                role="button"
                tabIndex={0}
                draggable={canManage}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", i.id);
                  onDragStart(i);
                }}
                onDragEnd={onDragEnd}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  // Lower half of a row means "after it", i.e. before the next one.
                  const idx = issues.findIndex((x) => x.id === i.id);
                  onHover(e.clientY > box.top + box.height / 2 ? issues[idx + 1]?.id ?? null : i.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrop(dropAt?.list === list ? dropAt.before : i.id);
                }}
                onClick={() => onOpen(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(i);
                }}
              >
                <IssueTypeIcon type={i.type} size={16} />
                <IssueKey value={i.key} />
                <span className="backlog-title">{i.title}</span>
                <LabelChips labels={i.labels} max={2} />
                {i.subtaskCount > 0 && <span className="muted-small">{i.subtaskCount} sub</span>}
                <span className={`pill pill-${PRIORITY_META[i.priority].tone} hide-sm`}>{PRIORITY_META[i.priority].label}</span>
                <span className={`pill pill-${STATUS_META[i.status].tone}`}>{STATUS_META[i.status].label}</span>
                <span className="backlog-assignee" title={i.assignee?.name ?? "Unassigned"}>
                  {i.assignee ? initials(i.assignee.name) : "–"}
                </span>
                {canManage ? (
                  <input
                    className="points-input"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={i.storyPoints ?? ""}
                    key={`${i.id}-${i.storyPoints}`}
                    placeholder="–"
                    aria-label={`Story points for ${i.key ?? i.title}`}
                    title="Story points"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={(e) => onPoints(i, e.target.value)}
                  />
                ) : (
                  <span className="points-badge" title="Story points">{i.storyPoints ?? "–"}</span>
                )}
                {canManage && (
                  <select
                    className="move-select"
                    aria-label={`Move ${i.key ?? i.title}`}
                    value=""
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "top") onMove(i, list, true);
                      else if (v === "backlog") onMove(i, null, false);
                      else if (v) onMove(i, v, false);
                    }}
                  >
                    <option value="">Move…</option>
                    <option value="top">To the top</option>
                    {lists.filter((l) => l.id !== list).map((l) => (
                      <option key={l.id} value={l.id}>To {l.name}</option>
                    ))}
                    {list !== null && <option value="backlog">To the backlog</option>}
                  </select>
                )}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

const toDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Create or edit a sprint, or confirm its dates and goal when starting it. */
function SprintDialog({ projectId, sprint, start, onClose, onSaved }: { projectId: string; sprint?: Sprint; start?: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const { accessToken } = useAuth();
  const today = new Date();
  const [form, setForm] = useState({
    name: sprint?.name ?? "",
    goal: sprint?.goal ?? "",
    startDate: toDay(sprint?.startDate ?? null) || (start ? toDay(today.toISOString()) : ""),
    endDate: toDay(sprint?.endDate ?? null) || (start ? toDay(addDays(today, 14).toISOString()) : ""),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iso = (day: string, end = false) => (day ? new Date(`${day}T${end ? "23:59:00" : "00:00:00"}`).toISOString() : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (start && sprint) {
        await apiFetch(`/api/v1/sprints/${sprint.id}/start`, { method: "POST", body: { goal: form.goal.trim() || undefined, startDate: iso(form.startDate), endDate: iso(form.endDate, true) }, accessToken });
        onSaved(`${sprint.name} started`);
      } else if (sprint) {
        await apiFetch(`/api/v1/sprints/${sprint.id}`, { method: "PUT", body: { name: form.name.trim() || undefined, goal: form.goal.trim() || null, startDate: iso(form.startDate) ?? null, endDate: iso(form.endDate, true) ?? null }, accessToken });
        onSaved("Sprint saved");
      } else {
        const r = await apiFetch<{ sprint: Sprint }>(`/api/v1/projects/${projectId}/sprints`, { method: "POST", body: { name: form.name.trim() || undefined, goal: form.goal.trim() || undefined, startDate: iso(form.startDate), endDate: iso(form.endDate, true) }, accessToken });
        onSaved(`${r.sprint.name} created`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the sprint.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="sprint-dialog-title" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}>
        <div className="modal-head">
          <h2 id="sprint-dialog-title">{start ? `Start ${sprint?.name}` : sprint ? "Edit sprint" : "Create sprint"}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {!start && (
          <div className="field">
            <label htmlFor="sprint-name">Name</label>
            <input id="sprint-name" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={sprint ? undefined : "Leave empty for the next number"} />
          </div>
        )}
        <div className="field">
          <label htmlFor="sprint-goal">Sprint goal</label>
          <textarea id="sprint-goal" rows={2} maxLength={1000} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="What should this sprint deliver?" />
        </div>
        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="sprint-start">Starts</label>
            <input id="sprint-start" type="date" required={start} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sprint-end">Ends</label>
            <input id="sprint-end" type="date" required={start} min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        {!sprint?.status || sprint.status === "planned" ? (
          <div className="chip-row" role="group" aria-label="Length">
            {[1, 2, 3, 4].map((w) => (
              <button type="button" key={w} className="phase-chip" onClick={() => {
                const from = form.startDate ? new Date(`${form.startDate}T00:00:00`) : today;
                setForm({ ...form, startDate: toDay(from.toISOString()), endDate: toDay(addDays(from, w * 7 - 1).toISOString()) });
              }}>{w} week{w > 1 ? "s" : ""}</button>
            ))}
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving}>{saving ? "Saving…" : start ? "Start sprint" : sprint ? "Save" : "Create sprint"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

/** Close the running sprint and choose where its unfinished issues go. */
function CompleteSprintDialog({ sprint, planned, onClose, onDone }: { sprint: Sprint & { stats: ListStats }; planned: Sprint[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { accessToken } = useAuth();
  const open = sprint.stats.issues - sprint.stats.done;
  const [moveTo, setMoveTo] = useState(planned[0]?.id ?? "new");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await apiFetch<{ carriedOver: number }>(`/api/v1/sprints/${sprint.id}/complete`, { method: "POST", body: { moveTo }, accessToken });
      onDone(r.carriedOver ? `${sprint.name} completed. ${r.carriedOver} unfinished issue${r.carriedOver === 1 ? "" : "s"} moved on.` : `${sprint.name} completed`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't complete the sprint.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="complete-sprint-title" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}>
        <div className="modal-head">
          <h2 id="complete-sprint-title">Complete {sprint.name}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="sprint-summary">
          <div><strong>{sprint.stats.done}</strong><span>issues done</span></div>
          <div><strong>{open}</strong><span>still open</span></div>
          <div><strong>{sprint.stats.donePoints}</strong><span>of {sprint.stats.points} points</span></div>
        </div>
        {open > 0 ? (
          <div className="field">
            <label htmlFor="move-open">Move the {open} open issue{open === 1 ? "" : "s"} to</label>
            <select id="move-open" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {planned.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="new">A new sprint</option>
              <option value="backlog">The backlog</option>
            </select>
          </div>
        ) : (
          <p className="muted-small">Every issue in this sprint is done.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving}>{saving ? "Completing…" : "Complete sprint"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
