import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { FolderKanban, Github, Flag, Plus, Search, Target, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Avatar } from "../components/Avatar";
import { PeoplePicker, type Picked } from "../components/PeoplePicker";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { CAN_ASSIGN_OTHERS } from "../lib/tasks";
import { fmtDate, PROJECT_STATUS, useColleagues, type ProjectStatus, type ProjectSummary } from "../lib/workspace";

/** Projects you lead or are on: progress, roadmap and team at a glance. */
export default function Projects() {
  const { user, accessToken } = useAuth();
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const canCreate = !!user && CAN_ASSIGN_OTHERS.includes(user.role);

  useEffect(() => {
    apiFetch<{ projects: ProjectSummary[] }>("/api/v1/projects", { accessToken })
      .then((r) => setProjects(r.projects))
      .catch(() => setError("Couldn't load projects."));
  }, [accessToken]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects ?? []).filter((p) => (filter === "all" || !["completed", "cancelled"].includes(p.status)) && (!q || p.title.toLowerCase().includes(q) || (p.githubRepo ?? "").toLowerCase().includes(q)));
  }, [projects, filter, search]);

  const stats = useMemo(() => {
    const list = projects ?? [];
    return [
      { label: "Active", value: list.filter((p) => p.status === "active").length, tone: "blue", icon: FolderKanban },
      { label: "Planning", value: list.filter((p) => p.status === "planning").length, tone: "violet", icon: Target },
      { label: "Phases done", value: list.reduce((n, p) => n + p.milestones.done, 0), tone: "green", icon: Flag },
      { label: "Open tasks", value: list.reduce((n, p) => n + (p.progress.total - p.progress.done), 0), tone: "amber", icon: FolderKanban },
    ];
  }, [projects]);

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Plan the roadmap, split it into tasks, and see who's building what.</p>
        </div>
        {canCreate && (
          <div className="page-head-actions">
            <motion.button className="btn" onClick={() => setCreating(true)} whileTap={{ scale: 0.96 }}>
              <Plus size={18} /> New project
            </motion.button>
          </div>
        )}
      </div>

      <div className="stat-grid">
        {stats.map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <s.icon size={20} className="stat-icon" />
            <div className="stat-value"><AnimatedNumber value={s.value} /></div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="board-toolbar">
        <div className="segmented" role="tablist">
          {(["open", "all"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={filter === v} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>
              {filter === v && <motion.span layoutId="proj-filter" className="segmented-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span>{v === "open" ? "In flight" : "All"}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" aria-label="Search projects" />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!projects && !error && <div className="project-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 210 }} />)}</div>}

      {projects && visible.length === 0 && (
        <motion.div className="empty-state" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <FolderKanban size={36} />
          <h3>{projects.length ? "No projects match" : "No projects yet"}</h3>
          <p>{canCreate ? "Start one, add the team and lay out its roadmap." : "When you're added to a project it shows up here."}</p>
        </motion.div>
      )}

      <div className="project-grid">
        <AnimatePresence>
          {visible.map((p, i) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 30 }} whileHover={{ y: -4 }}>
              <Link href={`/projects/${p.id}`} className="project-card">
                <div className="project-card-top">
                  <ProgressRing percent={p.progress.percent} />
                  <div className="project-card-title">
                    <span className={`pill pill-${PROJECT_STATUS[p.status].tone}`}>{PROJECT_STATUS[p.status].label}</span>
                    <h3>{p.title}</h3>
                  </div>
                </div>
                {p.description && <p className="project-card-desc">{p.description}</p>}
                <div className="project-card-meta">
                  <span><Flag size={14} /> {p.milestones.done}/{p.milestones.total} phases</span>
                  <span>{p.progress.done}/{p.progress.total} tasks</span>
                  {p.githubRepo && <span className="gh-chip open"><Github size={13} /> {p.githubRepo.split("/")[1]}</span>}
                </div>
                {p.nextMilestone && (
                  <div className="project-next">
                    <Target size={14} /> Next: <strong>{p.nextMilestone.title}</strong>
                    {p.nextMilestone.dueDate && <span className="muted-small"> · {fmtDate(p.nextMilestone.dueDate)}</span>}
                  </div>
                )}
                <div className="avatar-stack">
                  {p.members.slice(0, 6).map((m) => <Avatar key={m.id} email={m.id} name={m.name} size={28} />)}
                  {p.members.length > 6 && <span className="avatar more">+{p.members.length - 6}</span>}
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {creating && (
          <NewProjectDialog
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              navigate(`/projects/${id}`);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

export function ProgressRing({ percent, size = 54 }: { percent: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="progress-ring" style={{ width: size, height: size }} aria-label={`${percent}% done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * percent) / 100 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="ring-label">{percent}%</span>
    </span>
  );
}

function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user, accessToken } = useAuth();
  const { people } = useColleagues();
  const [form, setForm] = useState({ title: "", description: "", status: "planning" as ProjectStatus, githubRepo: "" });
  const [members, setMembers] = useState<Picked[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const repo = form.githubRepo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
      const r = await apiFetch<{ project: { id: string } }>("/api/v1/projects", {
        method: "POST",
        body: { title: form.title.trim(), description: form.description.trim() || undefined, status: form.status, githubRepo: repo || undefined, memberIds: members.map((m) => m.id) },
        accessToken,
      });
      onCreated(r.project.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the project.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="new-project-title">New project</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="np-title">Name</label>
          <input id="np-title" autoFocus required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Rail booking app" />
        </div>
        <div className="field">
          <label htmlFor="np-desc">What it's for</label>
          <textarea id="np-desc" rows={3} maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="The goal, who it's for, and what done looks like" />
        </div>
        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="np-status">Stage</label>
            <select id="np-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="np-repo">GitHub repo (optional)</label>
            <input id="np-repo" value={form.githubRepo} onChange={(e) => setForm({ ...form, githubRepo: e.target.value })} placeholder="inveon/rail-app" pattern="(https?://github\.com/)?[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/?" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="np-members">Team</label>
          <PeoplePicker id="np-members" people={people} value={members} onChange={setMembers} exclude={user ? [user.id] : []} placeholder="Add the people working on it" />
          <p className="muted-small">You lead it. Leads can add tasks, phases and people later.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || form.title.trim().length < 2}>{saving ? "Creating…" : "Create project"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
