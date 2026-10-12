import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, BarChart3, LayoutDashboard, Plus, Share2, Trash2, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { Dialog, Switch } from "../components/settings/ui";
import { useToast } from "../components/Toast";
import { IssueKey, IssueTypeIcon } from "../components/tasks/IssueBits";
import { BurndownChart } from "../components/tasks/SprintReports";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { ISSUE_TYPE_META, PRIORITY_META, STATUS_META, type IssueType, type SearchTask, type SprintReport, type TaskPriority, type TaskStatus } from "../lib/tasks";
import { useColleagues, type ProjectOverview, type ProjectSummary } from "../lib/workspace";
import "../styles/sprints.css";
import "../styles/settings.css";
import "../styles/automation.css";

type Kind = "assigned_to_me" | "filter_results" | "pie" | "created_vs_resolved" | "sprint_burndown" | "workload";
type GroupBy = "status" | "priority" | "type" | "assignee" | "label" | "project";
interface Gadget {
  id: string;
  kind: Kind;
  config: { title?: string; projectId?: string; groupBy?: GroupBy; days?: number; type?: IssueType | ""; state?: string; label?: string; priority?: TaskPriority | "" };
}
interface Dashboard {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  gadgets: Gadget[];
}

const KINDS: Record<Kind, { label: string; hint: string; wide?: boolean }> = {
  assigned_to_me: { label: "Assigned to me", hint: "Your open issues, most urgent first." },
  filter_results: { label: "Issue list", hint: "Issues matching a filter: a project, type, priority or label." },
  pie: { label: "Pie chart", hint: "Issues split by status, priority, type, assignee or label." },
  created_vs_resolved: { label: "Created vs resolved", hint: "Is the backlog growing or shrinking?", wide: true },
  sprint_burndown: { label: "Sprint burndown", hint: "The running sprint of one project." },
  workload: { label: "Workload", hint: "Open issues and story points per person." },
};
const GROUP_LABELS: Record<GroupBy, string> = { status: "Status", priority: "Priority", type: "Type", assignee: "Assignee", label: "Label", project: "Project" };
const PALETTE = ["#2563eb", "#f97316", "#16a34a", "#a855f7", "#e11d48", "#0891b2", "#ca8a04", "#64748b", "#db2777", "#4f46e5"];
const newId = () => Math.random().toString(36).slice(2, 10);

/** Dashboards: pages of gadgets for following work across projects. */
export default function Dashboards() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Dashboard[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("portal.dashboard");
    } catch {
      return null;
    }
  });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<{ dashboards: Dashboard[] }>("/api/v1/dashboards", { accessToken });
    setList(r.dashboards);
  }, [accessToken]);
  useEffect(() => {
    load().catch(() => setList([]));
    apiFetch<{ projects: ProjectSummary[] }>("/api/v1/projects", { accessToken }).then((r) => setProjects(r.projects)).catch(() => undefined);
  }, [load, accessToken]);

  const current = list?.find((d) => d.id === currentId) ?? list?.[0] ?? null;
  function pick(id: string) {
    setCurrentId(id);
    try {
      localStorage.setItem("portal.dashboard", id);
    } catch {
      /* private window */
    }
  }

  async function save(d: Dashboard, patch: Partial<Pick<Dashboard, "name" | "shared" | "gadgets">>) {
    setList((l) => l?.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) ?? null);
    try {
      await apiFetch(`/api/v1/dashboards/${d.id}`, { method: "PUT", body: patch, accessToken });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the dashboard.", "error");
      load();
    }
  }

  async function create(name: string, shared: boolean) {
    const gadgets: Gadget[] = [
      { id: newId(), kind: "assigned_to_me", config: {} },
      { id: newId(), kind: "pie", config: { groupBy: "status", state: "open" } },
      { id: newId(), kind: "created_vs_resolved", config: { days: 30 } },
    ];
    const r = await apiFetch<{ dashboard: Dashboard }>("/api/v1/dashboards", { method: "POST", body: { name, shared, gadgets }, accessToken });
    await load();
    pick(r.dashboard.id);
    setCreating(false);
  }

  async function remove(d: Dashboard) {
    if (!window.confirm(`Delete the dashboard "${d.name}"?`)) return;
    await apiFetch(`/api/v1/dashboards/${d.id}`, { method: "DELETE", accessToken });
    toast("Dashboard deleted");
    await load();
  }

  const move = (d: Dashboard, i: number, by: number) => {
    const g = [...d.gadgets];
    const [x] = g.splice(i, 1);
    g.splice(Math.max(0, Math.min(g.length, i + by)), 0, x);
    save(d, { gadgets: g });
  };

  return (
    <DashboardShell wide>
      <header className="page-head">
        <div>
          <h1><LayoutDashboard size={24} style={{ verticalAlign: "-4px" }} /> Dashboards</h1>
          <p className="muted">Charts and issue lists across your projects. Share one to put it in front of the whole team.</p>
        </div>
      </header>

      <div className="dash-toolbar">
        {list && list.length > 0 && (
          <select aria-label="Dashboard" value={current?.id ?? ""} onChange={(e) => pick(e.target.value)}>
            {list.map((d) => <option key={d.id} value={d.id}>{d.name}{d.shared ? (d.mine ? " (shared)" : " (shared with me)") : ""}</option>)}
          </select>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> New dashboard</button>
        {current?.mine && (
          <>
            <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> Add a gadget</button>
            <button className="btn btn-secondary btn-sm" onClick={() => save(current, { shared: !current.shared })}><Share2 size={14} /> {current.shared ? "Stop sharing" : "Share with staff"}</button>
            <button className="icon-button" aria-label="Delete dashboard" onClick={() => remove(current)} style={{ marginLeft: "auto" }}><Trash2 size={16} /></button>
          </>
        )}
      </div>

      {!list && <div className="skeleton" style={{ height: 300 }} />}
      {list && list.length === 0 && (
        <div className="empty-state">
          <BarChart3 size={28} />
          <h3>No dashboards yet</h3>
          <p>Make one to see your work, your team's load and how sprints are going on one page.</p>
          <button className="btn" onClick={() => setCreating(true)}><Plus size={16} /> Make my first dashboard</button>
        </div>
      )}
      {current && current.gadgets.length === 0 && <p className="muted">This dashboard is empty. {current.mine ? "Add a gadget to get started." : ""}</p>}
      {current && (
        <div className="gadget-grid">
          {current.gadgets.map((g, i) => (
            <GadgetCard
              key={g.id}
              gadget={g}
              projects={projects}
              tools={
                current.mine ? (
                  <span className="gadget-tools">
                    <button className="icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(current, i, -1)}><ArrowUp size={14} /></button>
                    <button className="icon-button" aria-label="Move down" disabled={i === current.gadgets.length - 1} onClick={() => move(current, i, 1)}><ArrowDown size={14} /></button>
                    <button className="icon-button" aria-label="Remove gadget" onClick={() => save(current, { gadgets: current.gadgets.filter((x) => x.id !== g.id) })}><X size={14} /></button>
                  </span>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && <NewDashboardDialog key="new" onClose={() => setCreating(false)} onCreate={create} />}
        {adding && current && (
          <AddGadgetDialog
            key="add"
            projects={projects}
            onClose={() => setAdding(false)}
            onAdd={(g) => {
              save(current, { gadgets: [...current.gadgets, g] });
              setAdding(false);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

function NewDashboardDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, shared: boolean) => Promise<void> }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onCreate(name.trim() || "My dashboard", shared).catch(() => setBusy(false));
  }
  return (
    <Dialog id="new-dash" title="New dashboard" onClose={onClose} onSubmit={submit}>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering this week" maxLength={80} autoFocus />
      </label>
      <Switch id="dash-shared" checked={shared} onChange={setShared} label="Share with all staff" hint="They can view it; only you can change it." />
      <p className="muted-small">It starts with your assigned issues, a status chart and created vs resolved. Change them any time.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy}>Create</button>
      </div>
    </Dialog>
  );
}

function AddGadgetDialog({ projects, onClose, onAdd }: { projects: ProjectSummary[]; onClose: () => void; onAdd: (g: Gadget) => void }) {
  const [kind, setKind] = useState<Kind>("pie");
  const [config, setConfig] = useState<Gadget["config"]>({ groupBy: "status", state: "open", days: 30 });
  const needsProject = kind === "sprint_burndown";
  function submit(e: FormEvent) {
    e.preventDefault();
    if (needsProject && !config.projectId) return;
    onAdd({ id: newId(), kind, config: Object.fromEntries(Object.entries(config).filter(([, v]) => v !== "" && v !== undefined)) });
  }
  return (
    <Dialog id="add-gadget" title="Add a gadget" onClose={onClose} onSubmit={submit} wide>
      <div className="gadget-picker">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button type="button" key={k} className={`gadget-option${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
            <strong>{KINDS[k].label}</strong>
            <span>{KINDS[k].hint}</span>
          </button>
        ))}
      </div>
      {kind !== "assigned_to_me" && (
        <div className="auto-row" style={{ marginTop: "0.8rem" }}>
          <select aria-label="Project" value={config.projectId ?? ""} required={needsProject} onChange={(e) => setConfig({ ...config, projectId: e.target.value || undefined })} className="auto-select">
            <option value="">{needsProject ? "Pick a project" : "All my projects"}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {kind === "pie" && (
            <select aria-label="Split by" value={config.groupBy} onChange={(e) => setConfig({ ...config, groupBy: e.target.value as GroupBy })}>
              {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => <option key={g} value={g}>By {GROUP_LABELS[g].toLowerCase()}</option>)}
            </select>
          )}
          {(kind === "pie" || kind === "filter_results") && (
            <select aria-label="Which issues" value={config.state ?? "open"} onChange={(e) => setConfig({ ...config, state: e.target.value })}>
              <option value="open">Open issues</option>
              <option value="overdue">Overdue issues</option>
              <option value="closed">Closed issues</option>
              <option value="all">All issues</option>
            </select>
          )}
          {kind === "filter_results" && (
            <>
              <select aria-label="Type" value={config.type ?? ""} onChange={(e) => setConfig({ ...config, type: e.target.value as IssueType })}>
                <option value="">Any type</option>
                {(Object.keys(ISSUE_TYPE_META) as IssueType[]).map((t) => <option key={t} value={t}>{ISSUE_TYPE_META[t].label}</option>)}
              </select>
              <select aria-label="Priority" value={config.priority ?? ""} onChange={(e) => setConfig({ ...config, priority: e.target.value as TaskPriority })}>
                <option value="">Any priority</option>
                {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </select>
              <input aria-label="Label" placeholder="Label" value={config.label ?? ""} onChange={(e) => setConfig({ ...config, label: e.target.value.trim().toLowerCase() })} />
              <input aria-label="Title" placeholder="Title (optional)" value={config.title ?? ""} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
            </>
          )}
          {kind === "created_vs_resolved" && (
            <select aria-label="Period" value={config.days ?? 30} onChange={(e) => setConfig({ ...config, days: Number(e.target.value) })}>
              <option value={14}>Last 2 weeks</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={needsProject && !config.projectId}>Add</button>
      </div>
    </Dialog>
  );
}

function qs(params: Record<string, string | number | undefined>) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function GadgetCard({ gadget, projects, tools }: { gadget: Gadget; projects: ProjectSummary[]; tools: React.ReactNode }) {
  const c = gadget.config;
  const project = c.projectId ? projects.find((p) => p.id === c.projectId) : null;
  const title =
    c.title ||
    (gadget.kind === "pie" ? `Issues by ${GROUP_LABELS[c.groupBy ?? "status"].toLowerCase()}` : KINDS[gadget.kind].label);
  return (
    <section className={`report-card gadget${KINDS[gadget.kind].wide ? " wide" : ""}`}>
      <header className="report-head">
        <h3>{title}</h3>
        {tools}
      </header>
      <p className="gadget-sub">{project ? project.title : gadget.kind === "assigned_to_me" ? "All projects" : "All my projects"}</p>
      {gadget.kind === "assigned_to_me" && <IssueListGadget query={qs({ assignee: "me", state: "open", sort: "priority", order: "desc", pageSize: 10 })} />}
      {gadget.kind === "filter_results" && <IssueListGadget query={qs({ projectId: c.projectId, state: c.state ?? "open", type: c.type, priority: c.priority, label: c.label, sort: "updated", pageSize: 10 })} />}
      {gadget.kind === "pie" && <PieGadget groupBy={c.groupBy ?? "status"} query={qs({ projectId: c.projectId, state: c.state ?? "open", groupBy: c.groupBy ?? "status" })} projects={projects} />}
      {gadget.kind === "workload" && <WorkloadGadget query={qs({ projectId: c.projectId, state: "open", groupBy: "assignee" })} />}
      {gadget.kind === "created_vs_resolved" && <CreatedResolvedGadget query={qs({ projectId: c.projectId, days: c.days ?? 30 })} />}
      {gadget.kind === "sprint_burndown" && c.projectId && <BurndownGadget projectId={c.projectId} />}
    </section>
  );
}

function useData<T>(path: string | null) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    setData(null);
    apiFetch<T>(path, { accessToken })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this."));
  }, [path, accessToken]);
  return { data, error };
}

function Loading({ error, height = 120 }: { error: string | null; height?: number }) {
  return error ? <div className="error-banner">{error}</div> : <div className="skeleton" style={{ height }} />;
}

function IssueListGadget({ query }: { query: string }) {
  const { data, error } = useData<{ tasks: SearchTask[]; total: number }>(`/api/v1/tasks/search?${query}`);
  if (!data) return <Loading error={error} />;
  if (!data.tasks.length) return <p className="muted-small">Nothing here. Nice.</p>;
  return (
    <>
      <ul className="gadget-issues">
        {data.tasks.map((t) => (
          <li key={t.id}>
            <Link href={t.projectId ? `/projects/${t.projectId}?task=${t.key ?? t.id}` : `/tasks/${t.id}`}>
              <IssueTypeIcon type={t.type} size={15} />
              <IssueKey value={t.key} />
              <span className="title">{t.title}</span>
              <span className={`status-dot tone-${STATUS_META[t.status].tone}`} title={STATUS_META[t.status].label} />
              <span className="muted-small prio">{PRIORITY_META[t.priority].label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {data.total > data.tasks.length && <p className="muted-small">and {data.total - data.tasks.length} more on the <Link href="/tasks">Tasks page</Link></p>}
    </>
  );
}

type StatRow = { value: string | null; count: number; points: number };

function useNamer(groupBy: GroupBy, projects: ProjectSummary[]) {
  const { byId } = useColleagues();
  return useCallback(
    (v: string | null) => {
      if (v === null) return groupBy === "assignee" ? "Unassigned" : groupBy === "label" ? "No label" : groupBy === "project" ? "Personal" : "None";
      if (groupBy === "status") return STATUS_META[v as TaskStatus]?.label ?? v;
      if (groupBy === "priority") return PRIORITY_META[v as TaskPriority]?.label ?? v;
      if (groupBy === "type") return ISSUE_TYPE_META[v as IssueType]?.label ?? v;
      if (groupBy === "assignee") return byId.get(v)?.name ?? "Someone";
      if (groupBy === "project") return projects.find((p) => p.id === v)?.title ?? "A project";
      return v;
    },
    [groupBy, byId, projects],
  );
}

function PieGadget({ groupBy, query, projects }: { groupBy: GroupBy; query: string; projects: ProjectSummary[] }) {
  const { data, error } = useData<{ rows: StatRow[] }>(`/api/v1/dashboards/data/stats?${query}`);
  const name = useNamer(groupBy, projects);
  if (!data) return <Loading error={error} />;
  const total = data.rows.reduce((n, r) => n + r.count, 0);
  if (!total) return <p className="muted-small">No issues match.</p>;
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="pie-wrap">
      <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label={`${total} issues by ${groupBy}`}>
        <g transform="rotate(-90 80 80)">
          {data.rows.map((r, i) => {
            const len = (r.count / total) * C;
            const el = <circle key={r.value ?? "none"} cx={80} cy={80} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={26} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </g>
        <text x={80} y={78} textAnchor="middle" style={{ fontSize: 24, fontWeight: 700, fill: "var(--ink)" }}>{total}</text>
        <text x={80} y={98} textAnchor="middle" style={{ fontSize: 11, fill: "var(--muted)" }}>issues</text>
      </svg>
      <ul className="pie-legend">
        {data.rows.map((r, i) => (
          <li key={r.value ?? "none"}>
            <span className="swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
            {name(r.value)}
            <span className="n">{r.count} · {Math.round((r.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkloadGadget({ query }: { query: string }) {
  const { data, error } = useData<{ rows: StatRow[] }>(`/api/v1/dashboards/data/stats?${query}`);
  const name = useNamer("assignee", []);
  if (!data) return <Loading error={error} />;
  if (!data.rows.length) return <p className="muted-small">No open issues.</p>;
  const max = Math.max(...data.rows.map((r) => r.count));
  return (
    <div className="bar-list">
      {data.rows.map((r) => (
        <div key={r.value ?? "none"} className="bar-row">
          <span className="name" title={name(r.value)}>{name(r.value)}</span>
          <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${(r.count / max) * 100}%` }} /></span>
          <span className="muted-small">{r.count} issue{r.count === 1 ? "" : "s"}{r.points ? ` · ${r.points} pts` : ""}</span>
        </div>
      ))}
    </div>
  );
}

function CreatedResolvedGadget({ query }: { query: string }) {
  const { data, error } = useData<{ days: { day: string; created: number; resolved: number }[] }>(`/api/v1/dashboards/data/created-vs-resolved?${query}`);
  const series = useMemo(() => data?.days ?? [], [data]);
  if (!data) return <Loading error={error} height={180} />;
  const W = 720;
  const H = 180;
  const P = 28;
  const max = Math.max(1, ...series.map((d) => Math.max(d.created, d.resolved)));
  const x = (i: number) => P + (i / Math.max(1, series.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const line = (k: "created" | "resolved") => series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const created = series.reduce((n, d) => n + d.created, 0);
  const resolved = series.reduce((n, d) => n + d.resolved, 0);
  return (
    <>
      <div className="chart-legend">
        <span><span className="swatch" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#e11d48", marginRight: 4 }} />Created {created}</span>
        <span><span className="swatch" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#16a34a", marginRight: 4 }} />Resolved {resolved}</span>
        <span>{created > resolved ? `Backlog grew by ${created - resolved}` : created < resolved ? `Backlog shrank by ${resolved - created}` : "Even"}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 900, height: "auto" }} role="img" aria-label={`${created} created and ${resolved} resolved`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />
            <text className="axis" x={P - 6} y={y(max * f) + 4} textAnchor="end">{Math.round(max * f)}</text>
          </g>
        ))}
        <path d={line("created")} fill="none" stroke="#e11d48" strokeWidth={2.2} />
        <path d={line("resolved")} fill="none" stroke="#16a34a" strokeWidth={2.2} />
        {series.filter((_, i) => i % Math.ceil(series.length / 6) === 0).map((d) => (
          <text key={d.day} className="axis" x={x(series.indexOf(d))} y={H - 8} textAnchor="middle">{new Date(`${d.day}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</text>
        ))}
      </svg>
    </>
  );
}

function BurndownGadget({ projectId }: { projectId: string }) {
  const { data: overview, error } = useData<ProjectOverview>(`/api/v1/projects/${projectId}/overview`);
  const sprintId = overview?.activeSprint?.id ?? null;
  const { data: report } = useData<SprintReport>(sprintId ? `/api/v1/sprints/${sprintId}/report` : null);
  if (!overview) return <Loading error={error} height={180} />;
  if (!sprintId) return <p className="muted-small">No sprint is running on this project.</p>;
  if (!report) return <Loading error={null} height={180} />;
  return (
    <>
      <p className="muted-small" style={{ margin: "0 0 0.4rem" }}>{report.sprint.name}{report.sprint.goal ? ` · ${report.sprint.goal}` : ""}</p>
      <BurndownChart data={report.burndown} />
    </>
  );
}
