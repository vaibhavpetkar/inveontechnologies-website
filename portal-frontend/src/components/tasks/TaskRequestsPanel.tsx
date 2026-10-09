import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CalendarClock, UserRoundCog } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDay, isOpenTask, isOverdue, REQUEST_KIND_LABELS, REQUEST_STATUS_META, timeAgo, type Task, type TaskRequest, type TaskRequestKind } from "../../lib/tasks";
import { useToast } from "../Toast";
import { DecideRequestDialog } from "./DecideRequestDialog";
import { TaskRequestDialog } from "./TaskRequestDialog";
import "../../styles/performance.css";

interface Props {
  task: Task;
  requests: TaskRequest[];
  canDecide: boolean;
  name: (id: string | null) => string;
  onChanged: () => void;
}

/**
 * In the task drawer: the assignee's "Ask for more time" / "Hand over"
 * (called out when the task is overdue), and the requests made on this task
 * with cancel (requester) or approve/decline (reviewers).
 */
export function TaskRequestsPanel({ task, requests, canDecide, name, onChanged }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [asking, setAsking] = useState<TaskRequestKind | null>(null);
  const [deciding, setDeciding] = useState<{ request: TaskRequest; approve: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAssignee = !!user && task.assigneeId === user.id && isOpenTask(task);
  const overdue = isOverdue(task);
  const pendingKinds = new Set(requests.filter((r) => r.status === "pending").map((r) => r.kind));

  async function cancel(r: TaskRequest) {
    setBusyId(r.id);
    try {
      await apiFetch(`/api/v1/tasks/requests/${r.id}/cancel`, { method: "POST", accessToken });
      toast("Request cancelled");
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel the request.", "error");
    }
    setBusyId(null);
  }

  const askButtons = (
    <div className="request-ask-buttons">
      <button type="button" className="btn btn-secondary btn-sm" disabled={pendingKinds.has("extension")} onClick={() => setAsking("extension")} title={pendingKinds.has("extension") ? "Already waiting for an answer" : undefined}>
        <CalendarClock size={15} /> Ask for more time
      </button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={pendingKinds.has("reassign")} onClick={() => setAsking("reassign")} title={pendingKinds.has("reassign") ? "Already waiting for an answer" : undefined}>
        <UserRoundCog size={15} /> Hand over
      </button>
    </div>
  );

  return (
    <>
      {isAssignee && overdue && (
        <motion.div className="overdue-banner" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <AlertTriangle size={18} />
          <div className="overdue-text">
            <strong>This task is overdue</strong>
            <span>Need more time, or should someone else take it? Ask your reviewer.</span>
          </div>
          {askButtons}
        </motion.div>
      )}
      {isAssignee && !overdue && <div className="request-ask-row">{askButtons}</div>}

      {requests.length > 0 && (
        <div className="drawer-section">
          <h3>Requests</h3>
          <ul className="request-list">
            {requests.map((r) => {
              const meta = REQUEST_STATUS_META[r.status];
              const mine = r.requestedBy === user?.id;
              return (
                <li key={r.id} className={`request-item${r.status === "pending" ? " pending" : ""}`}>
                  <div className="request-top">
                    {r.kind === "extension" ? <CalendarClock size={16} /> : <UserRoundCog size={16} />}
                    <strong>{REQUEST_KIND_LABELS[r.kind]}</strong>
                    <span className={`pill pill-${meta.tone}`}>{meta.label}</span>
                    <span className="muted-small request-when">{name(r.requestedBy)} · {timeAgo(r.createdAt)}</span>
                  </div>
                  {r.kind === "extension" && r.requestedDueDate && (
                    <div className="request-dates">
                      <span>{r.currentDueDate ? formatDay(r.currentDueDate) : "No date"}</span>
                      <ArrowRight size={14} aria-label="to" />
                      <strong>{formatDay(r.requestedDueDate)}</strong>
                    </div>
                  )}
                  {r.kind === "reassign" && r.proposedAssigneeId && (
                    <div className="request-dates">
                      {r.status === "approved" ? "Handed to" : "Suggested:"} <strong>{name(r.proposedAssigneeId)}</strong>
                    </div>
                  )}
                  <p className="request-reason">“{r.reason}”</p>
                  {r.status !== "pending" && r.status !== "cancelled" && (
                    <p className="muted-small">
                      {r.status === "approved" ? "Approved" : "Declined"} by {name(r.decidedBy)}
                      {r.decidedAt ? ` · ${timeAgo(r.decidedAt)}` : ""}
                      {r.decisionNote ? `: “${r.decisionNote}”` : ""}
                    </p>
                  )}
                  {r.status === "pending" && (mine || canDecide) && (
                    <div className="request-actions">
                      {canDecide && (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => setDeciding({ request: r, approve: true })}>Approve</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeciding({ request: r, approve: false })}>Decline</button>
                        </>
                      )}
                      {mine && (
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => cancel(r)}>
                          Cancel request
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {asking && (
          <TaskRequestDialog
            key="ask"
            task={task}
            kind={asking}
            onCancel={() => setAsking(null)}
            onSent={() => {
              setAsking(null);
              onChanged();
            }}
          />
        )}
        {deciding && (
          <DecideRequestDialog
            key="decide"
            request={deciding.request}
            approve={deciding.approve}
            taskTitle={task.title}
            currentAssigneeId={task.assigneeId}
            requesterName={name(deciding.request.requestedBy)}
            onCancel={() => setDeciding(null)}
            onDone={() => {
              setDeciding(null);
              onChanged();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
