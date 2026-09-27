import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CircleDot, Eye, Plus, Search } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskDrawer } from "../components/tasks/TaskDrawer";
import { NewTaskDialog } from "../components/tasks/NewTaskDialog";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { displayName } from "../lib/nav";
import { allowedMoves, BOARD_COLUMNS, CAN_ASSIGN_OTHERS, isOverdue, STATUS_META, type Task, type TaskStatus } from "../lib/tasks";
import { useDirectory } from "../lib/useDirectory";

type Scope = "all" | "mine" | "created";

export default function Tasks() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/tasks/:id");
  const openId = params?.id ?? null;
  const { people, byId } = useDirectory();

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);

  const isStaff = !!user && CAN_ASSIGN_OTHERS.includes(user.role);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await apiFetch<{ tasks: Task[] }>("/api/v1/tasks?limit=50", { accessToken });
      setTasks(res.tasks);
      setError(null);
    } catch {
      setError("Couldn't load tasks right now.");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!tasks || !user) return [];
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scope === "mine" && t.assigneeId !== user.id) return false;
      if (scope === "created" && t.createdBy !== user.id) return false;
      if (!q) return true;
      const who = t.assigneeId ? byId.get(t.assigneeId)?.email ?? "" : "";
      return t.title.toLowerCase().includes(q) || who.toLowerCase().includes(q) || displayName(who).toLowerCase().includes(q);
    });
  }, [tasks, user, scope, search, byId]);

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
      const before = tasks;
      setTasks((ts) => ts?.map((t) => (t.id === task.id ? { ...t, status: to } : t)) ?? ts);
      try {
        await apiFetch(`/api/v1/tasks/${task.id}/transition`, { method: "POST", body: { toStatus: to, note }, accessToken });
        toast(`Moved to ${STATUS_META[to].label.toLowerCase()}`);
        return true;
      } catch (err) {
        setTasks(before);
        toast(err instanceof ApiError ? err.message : "Couldn't move the task.", "error");
        return false;
      }
    },
    [tasks, accessToken, toast],
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
          <p>{isStaff ? "Assign work, follow progress and review what's submitted." : "Everything assigned to you, from to-do to done."}</p>
        </div>
        <motion.button className="btn" onClick={() => setCreating(true)} whileTap={{ scale: 0.96 }}>
          <Plus size={18} /> {isStaff ? "Assign task" : "New task"}
        </motion.button>
      </div>

      <div className="stat-grid">
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
      </div>

      <div className="board-toolbar">
        <div className="segmented" role="tablist" aria-label="Which tasks">
          {(
            [
              ["all", isStaff ? "All" : "All mine"],
              ["mine", "Assigned to me"],
              ["created", "Created by me"],
            ] as [Scope, string][]
          ).map(([value, label]) => (
            <button key={value} role="tab" aria-selected={scope === value} className={scope === value ? "active" : ""} onClick={() => setScope(value)}>
              {scope === value && <motion.span layoutId="scope-pill" className="segmented-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input placeholder={isStaff ? "Search tasks or people" : "Search tasks"} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!tasks && !error && (
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

      {tasks && tasks.length > 0 && (
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
                        onOpen={() => navigate(`/tasks/${t.id}`)}
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
          <h3>No tasks yet</h3>
          <p>{isStaff ? "Assign the first task to someone on the team." : "When someone assigns you work, it shows up here."}</p>
        </motion.div>
      )}

      <AnimatePresence>
        {openId && <TaskDrawer key={openId} taskId={openId} byId={byId} onClose={() => navigate("/tasks")} onMove={move} onChanged={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {creating && (
          <NewTaskDialog
            people={people}
            onClose={() => setCreating(false)}
            onCreated={(task) => {
              setCreating(false);
              setTasks((ts) => [task, ...(ts ?? [])]);
              const who = task.assigneeId && task.assigneeId !== user?.id ? byId.get(task.assigneeId) : undefined;
              toast(who ? `Assigned to ${displayName(who.email)}` : "Task created");
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
