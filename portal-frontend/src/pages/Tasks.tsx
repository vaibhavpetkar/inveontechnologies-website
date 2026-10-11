import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CircleDot, Columns3, Eye, Github, List, Plus } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskDrawer } from "../components/tasks/TaskDrawer";
import { NewTaskDialog } from "../components/tasks/NewTaskDialog";
import { ImportIssuesDialog } from "../components/tasks/ImportIssuesDialog";
import { StartWorkDialog, type Kickoff } from "../components/tasks/StartWorkDialog";
import { useGithubStatus } from "../lib/github";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { apiFetch, ApiError } from "../lib/api";
import { displayName } from "../lib/nav";
import { allowedMoves, BOARD_COLUMNS, CAN_ASSIGN_OTHERS, EMPTY_FILTERS, filtersToQuery, isOverdue, STATUS_META, type IssueFilters, type SearchTask, type Task, type TaskStatus } from "../lib/tasks";
import { useDirectory } from "../lib/useDirectory";
import { IssueFiltersBar } from "../components/tasks/IssueFilters";
import { IssueList } from "../components/tasks/IssueList";
import { useColleagues } from "../components/tasks/useColleagues";
import "../styles/issues.css";

type View = "board" | "list";
const VIEW_KEY = "portal.tasks.view";
const LIST_PAGE = 50;

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

export default function Tasks() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/tasks/:id");
  const openId = params?.id ?? null;
  const { people, byId } = useDirectory();

  const [tasks, setTasks] = useState<SearchTask[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(savedView);
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState<{ id: string; key: string; title: string }[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const colleagues = useColleagues();
  const [showCancelled, setShowCancelled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { status: github } = useGithubStatus(accessToken);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  // Starting work asks for a short plan first; the promise resolves once they start or back out.
  const [starting, setStarting] = useState<{ task: Task; resolve: (k: Kickoff | undefined | false) => void } | null>(null);
  const askKickoff = (task: Task) => new Promise<Kickoff | undefined | false>((resolve) => setStarting({ task, resolve }));

  const isStaff = !!user && CAN_ASSIGN_OTHERS.includes(user.role);

  // The board shows every match at once; the list pages through them.
  const load = useCallback(async () => {
    if (!accessToken) return;
    const extra: Record<string, number> = view === "list" ? { page, pageSize: LIST_PAGE } : { pageSize: 500 };
    try {
      const res = await apiFetch<{ tasks: SearchTask[]; total: number }>(`/api/v1/tasks/search?${filtersToQuery(filters, extra)}`, { accessToken });
      setTasks(res.tasks);
      setTotal(res.total);
      setError(null);
    } catch {
      setError("Couldn't load tasks right now.");
    }
  }, [accessToken, filters, view, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ projects: { id: string; key: string; title: string }[] }>("/api/v1/projects", { accessToken })
      .then((r) => setProjects(r.projects.map(({ id, key, title }) => ({ id, key, title }))))
      .catch(() => undefined);
    apiFetch<{ labels: string[] }>("/api/v1/tasks/labels", { accessToken })
      .then((r) => setLabels(r.labels))
      .catch(() => undefined);
  }, [accessToken]);

  function changeFilters(next: IssueFilters) {
    setFilters(next);
    setPage(1);
  }
  function changeView(next: View) {
    setView(next);
    setTasks(null);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private windows: the choice just isn't remembered.
    }
  }
  const openTask = (t: Task) => navigate(`/tasks/${t.key ?? t.id}`);

  // Something happened to someone's task (assigned, reviewed…): refresh the board.
  const { arrivals } = useNotifications();
  useEffect(() => {
    if (arrivals) load();
  }, [arrivals]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = tasks ?? [];
  const noFilters = filtersToQuery({ ...filters, sort: undefined, order: undefined }) === "";

  const stats = useMemo(
    () => ({
      active: visible.filter((t) => t.status === "todo" || t.status === "in_progress" || t.status === "changes_requested").length,
      review: visible.filter((t) => t.status === "in_review").length,
      overdue: visible.filter(isOverdue).length,
      done: visible.filter((t) => t.status === "done").length,
    }),
    [visible],
  );

  const columns: TaskStatus[] = showCancelled ? [...BOARD_COLUMNS, "cancelled"] : BOARD_COLUMNS;
  const dropTargets = dragging && user ? allowedMoves(dragging, user) : [];

  /** Optimistically moves the card, rolling back if the API refuses. */
  const move = useCallback(
    async (task: Task, to: TaskStatus, note?: string) => {
      let kickoff: Kickoff | undefined;
      if (to === "in_progress" && task.assigneeId === user?.id) {
        const answer = await askKickoff(task);
        if (answer === false) return false;
        kickoff = answer;
      }
      const before = tasks;
      setTasks((ts) => ts?.map((t) => (t.id === task.id ? { ...t, status: to } : t)) ?? ts);
      try {
        await apiFetch(`/api/v1/tasks/${task.id}/transition`, { method: "POST", body: { toStatus: to, note, kickoff }, accessToken });
        toast(`Moved to ${STATUS_META[to].label.toLowerCase()}`);
        return true;
      } catch (err) {
        setTasks(before);
        toast(err instanceof ApiError ? err.message : "Couldn't move the task.", "error");
        return false;
      }
    },
    [tasks, accessToken, toast, user?.id],
  );

  function onDrop(to: TaskStatus) {
    const task = dragging;
    setDragging(null);
    setOverColumn(null);
    if (!task || task.status === to) return;
    if (!dropTargets.includes(to)) {
      toast(`You can't move this task to ${STATUS_META[to].label.toLowerCase()}.`, "error");
      return;
    }
    if (to === "changes_requested") {
      const note = window.prompt("What needs to change?");
      if (note === null) return;
      move(task, to, note || undefined);
      return;
    }
    move(task, to);
  }

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>{isStaff ? "Tasks" : "My tasks"}</h1>
          <p>{isStaff ? "Assign work, follow progress and review what's submitted." : "Your work and your projects' issues, from to-do to done."}</p>
        </div>
        <div className="page-head-actions">
          {isStaff && github?.enabled && (
            <motion.button className="btn btn-secondary" onClick={() => setImporting(true)} whileTap={{ scale: 0.96 }}>
              <Github size={17} /> Import issues
            </motion.button>
          )}
          <motion.button className="btn" onClick={() => setCreating(true)} whileTap={{ scale: 0.96 }}>
            <Plus size={18} /> {isStaff ? "Assign task" : "New task"}
          </motion.button>
        </div>
      </div>

      {view === "board" && <div className="stat-grid">
        {[
          { label: "Active", value: stats.active, icon: CircleDot, tone: "blue" },
          { label: "Waiting for review", value: stats.review, icon: Eye, tone: "violet" },
          { label: "Overdue", value: stats.overdue, icon: AlertTriangle, tone: "red" },
          { label: "Done", value: stats.done, icon: CheckCircle2, tone: "green" },
        ].map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <span className="stat-icon">
              <s.icon size={18} />
            </span>
            <span className="stat-value">
              <AnimatedNumber value={s.value} />
            </span>
            <span className="stat-label">{s.label}</span>
          </motion.div>
        ))}
      </div>}

      <div className="board-toolbar">
        <div className="segmented" role="tablist" aria-label="View">
          {(
            [
              ["board", "Board", Columns3],
              ["list", "List", List],
            ] as [View, string, typeof List][]
          ).map(([value, label, Icon]) => (
            <button key={value} role="tab" aria-selected={view === value} className={view === value ? "active" : ""} onClick={() => changeView(value)}>
              {view === value && <motion.span layoutId="view-pill" className="segmented-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span><Icon size={14} /> {label}</span>
            </button>
          ))}
        </div>
        {view === "board" && (
          <label className="toggle">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled
          </label>
        )}
      </div>

      <IssueFiltersBar filters={filters} onChange={changeFilters} people={colleagues.people.map((p) => ({ id: p.id, name: p.name }))} projects={projects} labels={labels} />

      {error && <div className="error-banner">{error}</div>}

      {!tasks && !error && view === "list" && <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />}

      {tasks && view === "list" && tasks.length > 0 && (
        <IssueList
          tasks={tasks}
          total={total}
          page={page}
          pageSize={LIST_PAGE}
          sort={filters.sort}
          order={filters.order}
          onSort={(sort) => changeFilters({ ...filters, sort, order: filters.sort === sort && filters.order === "desc" ? "asc" : "desc" })}
          onPage={setPage}
          onOpen={openTask}
          onLabel={(label) => changeFilters({ ...filters, label })}
        />
      )}

      {!tasks && !error && view === "board" && (
        <div className="board">
          {BOARD_COLUMNS.map((c) => (
            <div key={c} className="board-column">
              <div className="skeleton" style={{ height: 18, width: "50%" }} />
              <div className="skeleton" style={{ height: 88 }} />
              <div className="skeleton" style={{ height: 88 }} />
            </div>
          ))}
        </div>
      )}

      {tasks && view === "board" && tasks.length > 0 && (
        <div className="board">
          {columns.map((status) => {
            const items = visible.filter((t) => t.status === status);
            const canDrop = !!dragging && dragging.status !== status && dropTargets.includes(status);
            return (
              <section
                key={status}
                className={`board-column${canDrop ? " can-drop" : ""}${canDrop && overColumn === status ? " over" : ""}${dragging && !canDrop && dragging.status !== status ? " no-drop" : ""}`}
                aria-label={STATUS_META[status].label}
                onDragOver={(e) => {
                  if (!canDrop) return;
                  e.preventDefault();
                  setOverColumn(status);
                }}
                onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(status);
                }}
              >
                <header className="column-head">
                  <span className={`status-dot tone-${STATUS_META[status].tone}`} />
                  <span>{STATUS_META[status].label}</span>
                  <motion.span key={items.length} className="column-count" initial={{ scale: 1.4 }} animate={{ scale: 1 }}>
                    {items.length}
                  </motion.span>
                </header>
                <div className="column-body">
                  <AnimatePresence mode="popLayout">
                    {items.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        assignee={t.assigneeId ? byId.get(t.assigneeId) : undefined}
                        draggable={!!user && allowedMoves(t, user).length > 0}
                        onOpen={() => openTask(t)}
                        onDragStart={() => setDragging(t)}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverColumn(null);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                  {items.length === 0 && <div className="column-empty">{canDrop ? "Drop here" : "Nothing here"}</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tasks && tasks.length === 0 && (
        <motion.div className="empty-state" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <CheckCircle2 size={36} />
          <h3>{noFilters ? "No tasks yet" : "No issues match"}</h3>
          <p>{!noFilters ? "Try fewer filters, or clear them." : isStaff ? "Assign the first task to someone on the team." : "When someone assigns you work, it shows up here."}</p>
        </motion.div>
      )}

      <AnimatePresence>
        {openId && <TaskDrawer key={openId} taskId={openId} byId={byId} onClose={() => navigate("/tasks")} onMove={move} onChanged={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {importing && (
          <ImportIssuesDialog
            people={people}
            defaultRepo={github?.defaultRepo ?? null}
            onClose={() => setImporting(false)}
            onImported={(n) => {
              toast(`Imported ${n} ${n === 1 ? "issue" : "issues"}`);
              load();
            }}
          />
        )}
        {creating && (
          <NewTaskDialog
            people={people}
            onClose={() => setCreating(false)}
            onCreated={(task) => {
              setCreating(false);
              load();
              const who = task.assigneeId && task.assigneeId !== user?.id ? byId.get(task.assigneeId) : undefined;
              toast(who ? `Assigned to ${displayName(who.email)}` : "Task created");
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
