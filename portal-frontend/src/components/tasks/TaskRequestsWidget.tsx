import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarClock, UserRoundCog } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { apiFetch } from "../../lib/api";
import { formatDay, REQUEST_KIND_LABELS, timeAgo, type PendingTaskRequest } from "../../lib/tasks";
import { Avatar } from "../Avatar";
import { DecideRequestDialog } from "./DecideRequestDialog";
import { useColleagues } from "./useColleagues";
import "../../styles/performance.css";

/** "Waiting for your answer": more-time and hand-over requests on tasks you review. */
export function TaskRequestsWidget() {
  const { accessToken } = useAuth();
  const { byId } = useColleagues();
  const { arrivals } = useNotifications();
  const [requests, setRequests] = useState<PendingTaskRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [deciding, setDeciding] = useState<{ request: PendingTaskRequest; approve: boolean } | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    apiFetch<{ requests: PendingTaskRequest[] }>("/api/v1/tasks/requests/pending", { accessToken })
      .then((r) => setRequests(r.requests))
      .catch(() => setFailed(true));
  }, [accessToken]);

  // A new request usually arrives with a notification.
  useEffect(load, [load, arrivals]);

  if (failed || !requests || requests.length === 0) return null;

  const who = (id: string) => byId.get(id)?.name ?? "A teammate";

  return (
    <motion.section className="panel requests-widget" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="panel-head">
        <h2>Waiting for your answer <span className="count-badge">{requests.length}</span></h2>
        <Link href="/tasks" className="link-arrow">
          Tasks <ArrowRight size={16} />
        </Link>
      </div>
      <ul className="pending-requests">
        <AnimatePresence initial={false}>
          {requests.map((r) => {
            const person = byId.get(r.requestedBy);
            return (
              <motion.li key={r.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
                <div className="pending-request-head">
                  {person ? <Avatar email={person.email} name={person.name} size={28} /> : <span className="avatar placeholder" />}
                  <div className="pending-request-main">
                    <div>
                      <strong>{who(r.requestedBy)}</strong>{" "}
                      <span className={`pill pill-${r.kind === "extension" ? "amber" : "violet"}`}>
                        {r.kind === "extension" ? <CalendarClock size={12} /> : <UserRoundCog size={12} />}&nbsp;{REQUEST_KIND_LABELS[r.kind]}
                      </span>
                    </div>
                    <Link href={`/tasks/${r.task.id}`} className="pending-request-task">{r.task.title}</Link>
                  </div>
                  <span className="muted-small pending-request-ago">{timeAgo(r.createdAt)}</span>
                </div>
                {r.kind === "extension" && r.requestedDueDate && (
                  <div className="request-dates">
                    Due {r.task.dueDate ? formatDay(r.task.dueDate) : "with no date"} <ArrowRight size={14} aria-label="asked for" /> <strong>{formatDay(r.requestedDueDate)}</strong>
                  </div>
                )}
                {r.kind === "reassign" && r.proposedAssigneeId && (
                  <div className="request-dates">Suggested: <strong>{who(r.proposedAssigneeId)}</strong></div>
                )}
                <p className="request-reason">“{r.reason}”</p>
                <div className="request-actions">
                  <button type="button" className="btn btn-sm" onClick={() => setDeciding({ request: r, approve: true })}>Approve</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeciding({ request: r, approve: false })}>Decline</button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <AnimatePresence>
        {deciding && (
          <DecideRequestDialog
            request={deciding.request}
            approve={deciding.approve}
            taskTitle={deciding.request.task.title}
            currentAssigneeId={deciding.request.task.assigneeId}
            requesterName={who(deciding.request.requestedBy)}
            onCancel={() => setDeciding(null)}
            onDone={() => {
              const id = deciding.request.id;
              setDeciding(null);
              setRequests((rs) => rs?.filter((x) => x.id !== id) ?? rs);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}
