import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { formatDue, isOverdue, STATUS_META, type Task } from "../../lib/tasks";
import { AnimatedNumber } from "../AnimatedNumber";

interface MyDashboard {
  totalTasks: number;
  byStatus: Record<string, number>;
  overdueCount: number;
  tasks: Task[];
}

/** "What's on my plate": counts plus the next few open tasks by due date. */
export function MyTasksWidget() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<MyDashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<MyDashboard>("/api/v1/tasks/me/dashboard", { accessToken })
      .then(setData)
      .catch(() => setFailed(true));
  }, [accessToken]);

  if (failed) return null;

  const open = (data?.tasks ?? [])
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 4);
  const active = (data?.byStatus.todo ?? 0) + (data?.byStatus.in_progress ?? 0) + (data?.byStatus.changes_requested ?? 0);

  return (
    <motion.section className="panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="panel-head">
        <h2>My tasks</h2>
        <Link href="/tasks" className="link-arrow">
          Open board <ArrowRight size={16} />
        </Link>
      </div>
      {!data ? (
        <div className="skeleton-stack">
          <div className="skeleton" style={{ height: 56 }} />
          <div className="skeleton" />
        </div>
      ) : (
        <>
          <div className="mini-stats">
            <div><span className="stat-value"><AnimatedNumber value={active} /></span><span className="stat-label">Active</span></div>
            <div><span className="stat-value"><AnimatedNumber value={data.byStatus.in_review ?? 0} /></span><span className="stat-label">In review</span></div>
            <div className={data.overdueCount ? "tone-red" : ""}><span className="stat-value"><AnimatedNumber value={data.overdueCount} /></span><span className="stat-label">Overdue</span></div>
            <div><span className="stat-value"><AnimatedNumber value={data.byStatus.done ?? 0} /></span><span className="stat-label">Done</span></div>
          </div>
          {open.length === 0 ? (
            <p className="muted-small">Nothing open right now.</p>
          ) : (
            <ul className="task-list">
              {open.map((t, i) => (
                <motion.li key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                  <Link href={`/tasks/${t.id}`}>
                    <span className={`status-dot tone-${STATUS_META[t.status].tone}`} />
                    <span className="task-list-title">{t.title}</span>
                    {t.dueDate && (
                      <span className={`task-list-due${isOverdue(t) ? " meta-overdue" : ""}`}>
                        <CalendarClock size={14} /> {formatDue(t.dueDate)}
                      </span>
                    )}
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </>
      )}
    </motion.section>
  );
}
