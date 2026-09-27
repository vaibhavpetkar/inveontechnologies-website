import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { displayName } from "../../lib/nav";
import { useDirectory } from "../../lib/useDirectory";
import { Avatar } from "../Avatar";

type Workload = Record<string, { total: number; active: number; overdue: number }>;

/** Who has how much open work — managers see their projects, HR and admins everyone. */
export function WorkloadWidget() {
  const { accessToken } = useAuth();
  const { byId } = useDirectory();
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ workload: Workload }>("/api/v1/tasks/workload", { accessToken })
      .then((r) => setWorkload(r.workload))
      .catch(() => setFailed(true));
  }, [accessToken]);

  if (failed) return null;

  const rows = Object.entries(workload ?? {})
    .sort(([, a], [, b]) => b.active - a.active)
    .slice(0, 8);
  const max = Math.max(1, ...rows.map(([, w]) => w.active));

  return (
    <motion.section className="panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }}>
      <div className="panel-head">
        <h2>Team workload</h2>
        <Link href="/tasks" className="link-arrow">
          Tasks <ArrowRight size={16} />
        </Link>
      </div>
      {!workload ? (
        <div className="skeleton-stack">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : rows.length === 0 ? (
        <p className="muted-small">No assigned tasks yet. Assign one from the task board.</p>
      ) : (
        <ul className="workload-list">
          {rows.map(([userId, w], i) => {
            const person = byId.get(userId);
            return (
              <li key={userId}>
                {person ? <Avatar email={person.email} size={28} /> : <span className="avatar placeholder" />}
                <div className="workload-main">
                  <div className="workload-name">
                    <span>{person ? displayName(person.email) : "Team member"}</span>
                    <span className="muted-small">
                      {w.active} open{w.overdue ? <strong className="meta-overdue"> · {w.overdue} overdue</strong> : null}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${(w.active / max) * 100}%` }} transition={{ duration: 0.7, delay: 0.05 * i, ease: "easeOut" }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
