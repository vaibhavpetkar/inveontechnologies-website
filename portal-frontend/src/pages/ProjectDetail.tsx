import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarRange, Check, Crown, Flag, Github, KanbanSquare, NotebookPen, Pencil, Plus, Trash2, UserMinus, Users, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { Avatar } from "../components/Avatar";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskDrawer } from "../components/tasks/TaskDrawer";
import { StartWorkDialog, type Kickoff } from "../components/tasks/StartWorkDialog";
import { ImportIssuesDialog } from "../components/tasks/ImportIssuesDialog";
import { PeoplePicker, type Picked } from "../components/PeoplePicker";
import { NotesList } from "../components/notes/NotesList";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { useGithubStatus } from "../lib/github";
import { ROLE_LABELS } from "../lib/nav";
import { allowedMoves, BOARD_COLUMNS, STATUS_META, type Task, type TaskPriority, type TaskStatus } from "../lib/tasks";
import type { DirectoryUser } from "../lib/useDirectory";
import { fmtDate, PROJECT_STATUS, useColleagues, type Milestone, type ProjectOverview, type ProjectStatus } from "../lib/workspace";
import { ProgressRing } from "./Projects";

type Tab = "board" | "roadmap" | "team" | "notes";
const TABS: { id: Tab; label: string; icon: typeof KanbanSquare }[] = [
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "roadmap", label: "Roadmap", icon: CalendarRange },
  { id: "team", label: "Team", icon: Users },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

/** One project: its task board, roadmap phases, team and shared notes. */
export default function ProjectDetail() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ?? "";
  const search = useSearch();
  const [, navigate] = useLocation();
  const openTask = new URLSearchParams(search).get("task");
  const [data, setData] = useState<ProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [phase, setPhase] = useState<string>("all");
  const [adding, setAdding] = useState<{ milestoneId?: string } | null>(null);
  const [editingPhase, setEditingPhase] = useState<Milestone | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [starting, setStarting] = useState<{ task: Task; resolve: (k: Kickoff | undefined | false) => void } | null>(null);
  const { status: github } = useGithubStatus(accessToken);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<ProjectOverview>(`/api/v1/projects/${projectId}/overview`, { accessToken }));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You're not on this project." : "Couldn't load this project.");
    }
  }, [projectId, accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map<string, DirectoryUser>((data?.members ?? []).map((m) => [m.userId, { id: m.userId, email: m.email, role: m.role as DirectoryUser["role"] }])), [data]);
  const tasks = useMemo(() => (data?.tasks ?? []).filter((t) => !t.parentTaskId && (phase === "all" || (phase === "none" ? !t.milestoneId : t.milestoneId === phase))), [data, phase]);

  const move = useCallback(
    async (task: Task, to: TaskStatus, note?: string) => {
      let kickoff: Kickoff | undefined;
      if (to === "in_progress" && task.assigneeId === user?.id) {
        const answer = await new Promise<Kickoff | undefined | false>((resolve) => setStarting({ task, resolve }));
        if (answer === false) return false;
        kickoff = answer;
      }
      setData((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, status: to } : t)) } : d));
      try {
        await apiFetch(`/api/v1/tasks/${task.id}/transition`, { method: "POST", body: { toStatus: to, note, kickoff }, accessToken });
        toast(`Moved to ${STATUS_META[to].label.toLowerCase()}`);
        load();
        return true;
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't move the task.", "error");
        load();
        return false;
      }
    },
    [accessToken, toast, load, user?.id],
  );

  async function setStatus(status: ProjectStatus) {
    try {
      await apiFetch(`/api/v1/projects/${projectId}`, { method: "PUT", body: { status }, accessToken });
      toast(`Project is ${PROJECT_STATUS[status].label.toLowerCase()}`);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update the project.", "error");
    }
  }

  async function linkRepo() {
    const repo = window.prompt("GitHub repository (owner/name)", data?.project.githubRepo ?? "")?.trim();
    if (!repo) return;
    try {
      await apiFetch(`/api/v1/github/projects/${projectId}/repo`, { method: "PUT", body: { repo: repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "") }, accessToken });
      toast("Repository linked. New task issues go there.");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't link the repository.", "error");
    }
  }

  const p = data?.project;

  return (
    <DashboardShell wide>
      <Link href="/projects" className="back-link"><ArrowLeft size={16} /> Projects</Link>
      {error && <div className="error-banner">{error}</div>}
      {!data && !error && <div className="skeleton" style={{ height: 140, marginTop: "1rem" }} />}

      {data && p && (
        <>
          <motion.header className="project-hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <ProgressRing percent={data.progress.percent} size={78} />
            <div className="project-hero-main">
              <div className="project-hero-pills">
                {data.canManage ? (
                  <select className={`pill-select pill pill-${PROJECT_STATUS[p.status].tone}`} value={p.status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} aria-label="Project stage">
                    {Object.entries(PROJECT_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                  </select>
                ) : (
                  <span className={`pill pill-${PROJECT_STATUS[p.status].tone}`}>{PROJECT_STATUS[p.status].label}</span>
                )}
                {p.githubRepo ? (
                  <a className="gh-chip open" href={`https://github.com/${p.githubRepo}`} target="_blank" rel="noreferrer"><Github size={13} /> {p.githubRepo}</a>
                ) : data.canManage && github?.enabled ? (
                  <button className="btn btn-secondary btn-sm" onClick={linkRepo}><Github size={14} /> Link a repo</button>
                ) : null}
              </div>
              <h1>{p.title}</h1>
              {p.description && <p className="project-hero-desc">{p.description}</p>}
              <div className="project-hero-meta">
                <span>{data.progress.done} of {data.progress.total} tasks done</span>
                <span>{data.milestones.filter((m) => m.status === "completed").length} of {data.milestones.length} phases done</span>
                <span className="avatar-stack">{data.members.slice(0, 8).map((m) => <Avatar key={m.userId} email={m.email} name={m.name} size={26} />)}</span>
              </div>
            </div>
            <div className="page-head-actions">
              {data.canManage && github?.enabled && <button className="btn btn-secondary" onClick={() => setImporting(true)}><Github size={16} /> Import issues</button>}
              <motion.button className="btn" whileTap={{ scale: 0.96 }} onClick={() => setAdding({ milestoneId: phase !== "all" && phase !== "none" ? phase : undefined })}><Plus size={17} /> Add task</motion.button>
            </div>
          </motion.header>

          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
                {tab === t.id && <motion.span layoutId="project-tab" className="tab-underline" />}
                <t.icon size={15} /> {t.label}
                {t.id === "team" && <span className="tab-count">{data.members.length}</span>}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              {tab === "board" && (
                <>
                  {data.milestones.length > 0 && (
                    <div className="phase-filter" role="radiogroup" aria-label="Roadmap phase">
                      {[{ id: "all", title: "All phases" }, ...data.milestones, { id: "none", title: "No phase" }].map((m) => (
                        <button key={m.id} role="radio" aria-checked={phase === m.id} className={`phase-chip${phase === m.id ? " on" : ""}`} onClick={() => setPhase(m.id)}>{m.title}</button>
                      ))}
                    </div>
                  )}
                  <div className="board">
                    {BOARD_COLUMNS.map((col) => {
                      const items = tasks.filter((t) => t.status === col);
                      const canDrop = !!dragging && !!user && allowedMoves(dragging, user).includes(col);
                      return (
                        <section
                          key={col}
                          className={`board-column${canDrop ? " can-drop" : ""}`}
                          onDragOver={(e) => canDrop && e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const t = dragging;
                            setDragging(null);
                            if (t && canDrop && t.status !== col) {
                              if (col === "changes_requested") {
                                const note = window.prompt("What needs to change?");
                                if (note !== null) move(t, col, note || undefined);
                              } else move(t, col);
                            }
                          }}
                        >
                          <header className="column-head">
                            <span className={`status-dot tone-${STATUS_META[col].tone}`} />
                            <span>{STATUS_META[col].label}</span>
                            <span className="column-count">{items.length}</span>
                          </header>
                          <div className="column-body">
                            <AnimatePresence mode="popLayout">
                              {items.map((t) => (
                                <TaskCard
                                  key={t.id}
                                  task={t}
                                  assignee={t.assigneeId ? byId.get(t.assigneeId) : undefined}
                                  draggable={!!user && allowedMoves(t, user).length > 0}
                                  onOpen={() => navigate(`/projects/${projectId}?task=${t.id}`)}
                                  onDragStart={() => setDragging(t)}
                                  onDragEnd={() => setDragging(null)}
                                />
                              ))}
                            </AnimatePresence>
                            {items.length === 0 && <div className="column-empty">{canDrop ? "Drop here" : "Nothing here"}</div>}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </>
              )}

              {tab === "roadmap" && (
                <Roadmap
                  data={data}
                  onEdit={(m) => setEditingPhase(m)}
                  onAddTask={(milestoneId) => setAdding({ milestoneId })}
                  onOpenTask={(id) => navigate(`/projects/${projectId}?task=${id}`)}
                  onChanged={load}
                />
              )}

              {tab === "team" && <Team data={data} onChanged={load} />}

              {tab === "notes" && <NotesList projectId={projectId} compact />}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>
        {openTask && data && <TaskDrawer key={openTask} taskId={openTask} byId={byId} onClose={() => navigate(`/projects/${projectId}`)} onMove={move} onChanged={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {adding && data && (
          <ProjectTaskDialog
            data={data}
            initialMilestoneId={adding.milestoneId}
            onClose={() => setAdding(null)}
            onCreated={() => {
              setAdding(null);
              toast("Task added");
              load();
            }}
          />
        )}
        {editingPhase && data && (
          <PhaseDialog
            projectId={projectId}
            phase={editingPhase === "new" ? null : editingPhase}
            onClose={() => setEditingPhase(null)}
            onSaved={() => {
              setEditingPhase(null);
              load();
            }}
          />
        )}
        {importing && data && (
          <ImportIssuesDialog
            people={[...byId.values()]}
            defaultRepo={data.project.githubRepo}
            initialProjectId={projectId}
            onClose={() => setImporting(false)}
            onImported={(n) => {
              toast(`Imported ${n} ${n === 1 ? "issue" : "issues"}`);
              load();
            }}
          />
        )}
        {starting && (
          <StartWorkDialog
            task={starting.task}
            onCancel={() => {
              starting.resolve(false);
              setStarting(null);
            }}
            onStart={(k) => {
              starting.resolve(k);
              setStarting(null);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

/** Phases as a timeline: dates, a bar of how far along each is, and its tasks. */
function Roadmap({ data, onEdit, onAddTask, onOpenTask, onChanged }: { data: ProjectOverview; onEdit: (m: Milestone | "new") => void; onAddTask: (milestoneId: string) => void; onOpenTask: (id: string) => void; onChanged: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const now = Date.now();

  // The span the timeline strip covers: first start to last due date.
  const dated = data.milestones.filter((m) => m.startDate || m.dueDate);
  const min = Math.min(...dated.map((m) => new Date(m.startDate ?? m.dueDate!).getTime()), now);
  const max = Math.max(...dated.map((m) => new Date(m.dueDate ?? m.startDate!).getTime()), now + 86400000);
  const pos = (iso: string) => ((new Date(iso).getTime() - min) / (max - min)) * 100;

  async function toggle(m: Milestone) {
    try {
      await apiFetch(`/api/v1/projects/milestones/${m.id}`, { method: "PUT", body: { status: m.status === "completed" ? "pending" : "completed" }, accessToken });
      toast(m.status === "completed" ? "Phase reopened" : "Phase complete");
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update the phase.", "error");
    }
  }

  async function remove(m: Milestone) {
    if (!window.confirm(`Delete the phase "${m.title}"? Its tasks stay on the board without a phase.`)) return;
    try {
      await apiFetch(`/api/v1/projects/milestones/${m.id}`, { method: "DELETE", accessToken });
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete the phase.", "error");
    }
  }

  return (
    <div className="project-roadmap">
      {data.canManage && (
        <div className="roadmap-actions">
          <button className="btn btn-secondary" onClick={() => onEdit("new")}><Flag size={16} /> Add a phase</button>
        </div>
      )}

      {dated.length > 0 && (
        <div className="gantt" aria-hidden="true">
          {dated.map((m, i) => {
            const start = m.startDate ?? m.dueDate!;
            const end = m.dueDate ?? m.startDate!;
            const left = pos(start);
            const width = Math.max(2, pos(end) - left);
            return (
              <div key={m.id} className="gantt-row">
                <span className="gantt-label">{m.title}</span>
                <span className="gantt-track">
                  <motion.span className={`gantt-bar${m.status === "completed" ? " done" : ""}`} style={{ left: `${left}%` }} initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ delay: i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                    <span className="gantt-fill" style={{ width: `${m.progress.percent}%` }} />
                  </motion.span>
                  <span className="gantt-today" style={{ left: `${pos(new Date(now).toISOString())}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {data.milestones.length === 0 ? (
        <div className="empty-state">
          <Flag size={34} />
          <h3>No roadmap yet</h3>
          <p>{data.canManage ? "Break the project into phases (for example: design, build, test, launch), then add tasks to each." : "The project lead hasn't laid out the phases yet."}</p>
        </div>
      ) : (
        <ol className="phase-list">
          {data.milestones.map((m, i) => {
            const items = data.tasks.filter((t) => t.milestoneId === m.id);
            const late = m.status !== "completed" && m.dueDate && new Date(m.dueDate).getTime() < now;
            return (
              <motion.li key={m.id} className={`phase${m.status === "completed" ? " done" : ""}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <span className="phase-node">{m.status === "completed" ? <Check size={14} /> : i + 1}</span>
                <div className="phase-card">
                  <div className="phase-head">
                    <div>
                      <h3>{m.title}</h3>
                      <span className={`muted-small${late ? " meta-overdue" : ""}`}>
                        {m.startDate ? fmtDate(m.startDate) : "No start"} to {m.dueDate ? fmtDate(m.dueDate) : "no end date"}
                        {late ? " · past due" : ""}
                      </span>
                    </div>
                    {data.canManage && (
                      <div className="phase-tools">
                        <button className="icon-button" title={m.status === "completed" ? "Reopen" : "Mark complete"} aria-label={m.status === "completed" ? "Reopen phase" : "Mark phase complete"} onClick={() => toggle(m)}><Check size={16} /></button>
                        <button className="icon-button" title="Edit" aria-label="Edit phase" onClick={() => onEdit(m)}><Pencil size={15} /></button>
                        <button className="icon-button" title="Delete" aria-label="Delete phase" onClick={() => remove(m)}><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                  {m.description && <p className="phase-desc">{m.description}</p>}
                  <div className="phase-progress">
                    <span className="progress-bar"><motion.span className="progress-fill" initial={{ width: 0 }} animate={{ width: `${m.progress.percent}%` }} transition={{ duration: 0.7 }} /></span>
                    <span className="muted-small">{m.progress.done}/{m.progress.total} tasks · {m.progress.percent}%</span>
                  </div>
                  <ul className="phase-tasks">
                    {items.map((t) => (
                      <li key={t.id}>
                        <button onClick={() => onOpenTask(t.id)}>
                          <span className={`status-dot tone-${STATUS_META[t.status].tone}`} />
                          <span className={t.status === "done" ? "struck" : ""}>{t.title}</span>
                          {t.assigneeId && <Avatar email={data.members.find((x) => x.userId === t.assigneeId)?.email ?? t.assigneeId} name={data.members.find((x) => x.userId === t.assigneeId)?.name} size={20} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button className="btn btn-secondary btn-sm" onClick={() => onAddTask(m.id)}><Plus size={14} /> Task in this phase</button>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Team({ data, onChanged }: { data: ProjectOverview; onChanged: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { people } = useColleagues();
  const [adding, setAdding] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    for (const p of adding) {
      try {
        await apiFetch(`/api/v1/projects/${data.project.id}/members`, { method: "POST", body: { userId: p.id }, accessToken });
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't add someone.", "error");
      }
    }
    setAdding([]);
    setBusy(false);
    onChanged();
  }

  async function remove(userId: string, name: string) {
    if (!window.confirm(`Take ${name} off this project? Their tasks stay assigned to them.`)) return;
    try {
      await apiFetch(`/api/v1/projects/${data.project.id}/members/${userId}`, { method: "DELETE", accessToken });
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove them.", "error");
    }
  }

  return (
    <div className="team-tab">
      {data.canManage && (
        <div className="team-add">
          <PeoplePicker id="pm-add" people={people} value={adding} onChange={setAdding} exclude={data.members.map((m) => m.userId)} placeholder="Add people to the project" />
          <button className="btn" disabled={busy || adding.length === 0} onClick={add}>{busy ? "Adding…" : "Add"}</button>
        </div>
      )}
      <div className="member-grid">
        {data.members.map((m, i) => {
          const theirs = data.tasks.filter((t) => t.assigneeId === m.userId);
          const active = theirs.filter((t) => t.status === "in_progress");
          const done = theirs.filter((t) => t.status === "done").length;
          return (
            <motion.div key={m.userId} className="member-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="member-top">
                <Avatar email={m.email} name={m.name} size={40} />
                <div>
                  <strong>{m.name} {m.roleOnProject === "lead" && <Crown size={14} className="lead-crown" aria-label="Lead" />}</strong>
                  <span className="muted-small">{m.roleOnProject === "lead" ? "Lead" : ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}</span>
                </div>
                {data.canManage && m.userId !== data.project.ownerId && (
                  <button className="icon-button" title="Remove from project" aria-label={`Remove ${m.name}`} onClick={() => remove(m.userId, m.name)}><UserMinus size={16} /></button>
                )}
              </div>
              <div className="member-stats"><span>{active.length} in progress</span><span>{done} done</span><span>{theirs.length} total</span></div>
              {active.map((t) => (
                <div key={t.id} className="member-working">
                  <span className="pulse-dot" /> {t.title}
                  {(t.progressPercent ?? 0) > 0 && <span className="muted-small"> · {t.progressPercent}%</span>}
                </div>
              ))}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectTaskDialog({ data, initialMilestoneId, onClose, onCreated }: { data: ProjectOverview; initialMilestoneId?: string; onClose: () => void; onCreated: () => void }) {
  const { user, accessToken } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", assigneeId: data.canManage ? "" : user?.id ?? "", milestoneId: initialMilestoneId ?? "", priority: "medium" as TaskPriority, dueDate: "", estimateHours: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { projectId: data.project.id, title: form.title.trim(), priority: form.priority };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.assigneeId) body.assigneeId = form.assigneeId;
      if (form.milestoneId) body.milestoneId = form.milestoneId;
      if (form.dueDate) body.dueDate = new Date(`${form.dueDate}T23:59:00`).toISOString();
      if (form.estimateHours) body.estimateHours = Number(form.estimateHours);
      await apiFetch("/api/v1/tasks", { method: "POST", body, accessToken });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the task.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="pt-title" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
        <div className="modal-head">
          <h2 id="pt-title">Add a task to {data.project.title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="pt-name">Title</label>
          <input id="pt-name" autoFocus required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Seat map screen" />
        </div>
        <div className="field">
          <label htmlFor="pt-desc">Details</label>
          <textarea id="pt-desc" rows={3} maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does done look like?" />
        </div>
        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="pt-who">Assign to</label>
            <select id="pt-who" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              {data.canManage && <option value="">Nobody yet</option>}
              {(data.canManage ? data.members : data.members.filter((m) => m.userId === user?.id)).map((m) => <option key={m.userId} value={m.userId}>{m.userId === user?.id ? `${m.name} (me)` : m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pt-phase">Phase</label>
            <select id="pt-phase" value={form.milestoneId} onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}>
              <option value="">No phase</option>
              {data.milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pt-pri">Priority</label>
            <select id="pt-pri" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pt-due">Due</label>
            <input id="pt-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pt-est">Estimate (h)</label>
            <input id="pt-est" type="number" min={0} step={0.5} value={form.estimateHours} onChange={(e) => setForm({ ...form, estimateHours: e.target.value })} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || form.title.trim().length < 2}>{saving ? "Adding…" : "Add task"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function PhaseDialog({ projectId, phase, onClose, onSaved }: { projectId: string; phase: Milestone | null; onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuth();
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const [form, setForm] = useState({ title: phase?.title ?? "", description: phase?.description ?? "", startDate: day(phase?.startDate ?? null), dueDate: day(phase?.dueDate ?? null) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
      setError("The phase has to end after it starts.");
      return;
    }
    setSaving(true);
    const toIso = (d: string, end: boolean) => (d ? new Date(`${d}T${end ? "23:59:00" : "00:00:00"}`).toISOString() : phase ? null : undefined);
    const body = { title: form.title.trim(), description: form.description.trim() || (phase ? null : undefined), startDate: toIso(form.startDate, false), dueDate: toIso(form.dueDate, true) };
    try {
      if (phase) await apiFetch(`/api/v1/projects/milestones/${phase.id}`, { method: "PUT", body, accessToken });
      else await apiFetch(`/api/v1/projects/${projectId}/milestones`, { method: "POST", body, accessToken });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the phase.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="phase-title" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
        <div className="modal-head">
          <h2 id="phase-title">{phase ? "Edit phase" : "New roadmap phase"}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="ph-name">Name</label>
          <input id="ph-name" autoFocus required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Phase 1: search and booking" />
        </div>
        <div className="field">
          <label htmlFor="ph-desc">Goal</label>
          <textarea id="ph-desc" rows={3} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this phase delivers" />
        </div>
        <div className="field-row field-row-2">
          <div className="field"><label htmlFor="ph-start">Starts</label><input id="ph-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="field"><label htmlFor="ph-end">Ends</label><input id="ph-end" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || form.title.trim().length < 2}>{saving ? "Saving…" : phase ? "Save" : "Add phase"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
