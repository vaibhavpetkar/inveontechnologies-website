import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Clock, Send, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName } from "../../lib/nav";
import { allowedMoves, formatDue, isOverdue, MOVE_LABELS, PRIORITY_META, STATUS_META, timeAgo, type Task, type TaskComment, type TaskEvent, type TaskStatus } from "../../lib/tasks";
import type { DirectoryUser } from "../../lib/useDirectory";
import { Avatar } from "../Avatar";
import { useToast } from "../Toast";
import { GithubPanel } from "./GithubPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { CAN_ASSIGN_OTHERS } from "../../lib/tasks";

interface Props {
  taskId: string;
  byId: Map<string, DirectoryUser>;
  onClose: () => void;
  onMove: (task: Task, to: TaskStatus, note?: string) => Promise<boolean>;
  onChanged: () => void;
}

type Tab = "comments" | "activity";

export function TaskDrawer({ taskId, byId, onClose, onMove, onChanged }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeline, setTimeline] = useState<TaskEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("comments");
  const [comment, setComment] = useState("");
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, c, tl] = await Promise.all([
        apiFetch<{ task: Task; subtasks: Task[] }>(`/api/v1/tasks/${taskId}`, { accessToken }),
        apiFetch<{ comments: TaskComment[] }>(`/api/v1/tasks/${taskId}/comments`, { accessToken }),
        apiFetch<{ timeline: TaskEvent[] }>(`/api/v1/tasks/${taskId}/timeline`, { accessToken }),
      ]);
      setTask(t.task);
      setSubtasks(t.subtasks);
      setComments(c.comments);
      setTimeline(tl.timeline);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This task no longer exists." : err instanceof ApiError && err.status === 403 ? "You don't have access to this task." : "Couldn't load this task.");
    }
  }, [taskId, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = (id: string | null) => {
    if (!id) return "Someone";
    if (id === user?.id) return "You";
    const p = byId.get(id);
    return p ? displayName(p.email) : "A teammate";
  };

  async function move(to: TaskStatus) {
    if (!task) return;
    let note: string | undefined;
    if (to === "changes_requested") {
      note = window.prompt("What needs to change?") ?? undefined;
      if (note === undefined) return;
    }
    setBusy(true);
    if (await onMove(task, to, note || undefined)) await load();
    setBusy(false);
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks/${taskId}/comments`, { method: "POST", body: { body: comment.trim() }, accessToken });
      setComment("");
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't post the comment.", "error");
    }
    setBusy(false);
  }

  async function logTime(e: FormEvent) {
    e.preventDefault();
    const h = Number(hours);
    if (!h) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks/${taskId}/time-entries`, { method: "POST", body: { hours: h, entryDate: new Date().toISOString() }, accessToken });
      setHours("");
      toast(`Logged ${h}h`);
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't log time.", "error");
    }
    setBusy(false);
  }

  const moves = task && user ? allowedMoves(task, user) : [];
  const assignee = task?.assigneeId ? byId.get(task.assigneeId) : undefined;

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 360, damping: 38 }}
      >
        <div className="drawer-head">
          {task && <span className={`pill pill-${STATUS_META[task.status].tone}`}>{STATUS_META[task.status].label}</span>}
          <button className="icon-button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {!task && !error && <div className="skeleton-stack"><div className="skeleton" style={{ height: 28 }} /><div className="skeleton" /><div className="skeleton" style={{ width: "60%" }} /></div>}

        {task && (
          <div className="drawer-body">
            <h2 className="drawer-title">{task.title}</h2>

            <dl className="drawer-facts">
              <div>
                <dt>Assignee</dt>
                <dd>
                  {assignee && <Avatar email={assignee.email} size={22} />} {task.assigneeId ? name(task.assigneeId) : "Unassigned"}
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd><span className={`pill pill-${PRIORITY_META[task.priority].tone}`}>{PRIORITY_META[task.priority].label}</span></dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd className={isOverdue(task) ? "meta-overdue" : ""}>
                  <CalendarClock size={15} /> {task.dueDate ? formatDue(task.dueDate) : "No date"}
                </dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  <Clock size={15} /> {Number(task.actualHours)}h{task.estimateHours ? ` of ${Number(task.estimateHours)}h` : " logged"}
                </dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>{name(task.createdBy)}</dd>
              </div>
            </dl>

            {task.estimateHours && Number(task.estimateHours) > 0 && (
              <div className="progress-bar" aria-label="Time used">
                <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (Number(task.actualHours) / Number(task.estimateHours)) * 100)}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
              </div>
            )}

            {task.description && <p className="drawer-description">{task.description}</p>}

            <GithubPanel
              task={task}
              canEdit={!!user && (task.createdBy === user.id || CAN_ASSIGN_OTHERS.includes(user.role))}
              onUpdated={(t) => {
                setTask(t);
                load();
                onChanged();
              }}
            />

            <AttachmentsPanel taskId={task.id} onChanged={() => load()} />

            {moves.length > 0 && (
              <div className="drawer-actions">
                {moves.map((to) => (
                  <button key={to} className={`btn ${to === "cancelled" ? "btn-danger" : to === "changes_requested" ? "btn-secondary" : ""}`} disabled={busy} onClick={() => move(to)}>
                    {MOVE_LABELS[to]}
                  </button>
                ))}
              </div>
            )}

            {task.assigneeId === user?.id && task.status !== "done" && task.status !== "cancelled" && (
              <form className="inline-form compact" onSubmit={logTime}>
                <div className="field">
                  <label htmlFor="log-hours">Log time (hours)</label>
                  <input id="log-hours" type="number" min={0.1} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
                </div>
                <button className="btn btn-secondary" disabled={busy || !Number(hours)}>
                  Log
                </button>
              </form>
            )}

            {subtasks.length > 0 && (
              <div className="drawer-section">
                <h3>Subtasks</h3>
                {subtasks.map((s) => (
                  <div key={s.id} className="subtask-row">
                    <span className={`status-dot tone-${STATUS_META[s.status].tone}`} />
                    <span>{s.title}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="tabs" role="tablist">
              {(["comments", "activity"] as Tab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                  {tab === t && <motion.span layoutId="drawer-tab" className="tab-underline" />}
                  {t === "comments" ? `Comments (${comments.length})` : "Activity"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === "comments" ? (
                <motion.div key="comments" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  {comments.length === 0 && <p className="muted-small">No comments yet.</p>}
                  {comments.map((c) => (
                    <div key={c.id} className="comment">
                      {byId.get(c.authorId) ? <Avatar email={byId.get(c.authorId)!.email} size={26} /> : <span className="avatar placeholder" />}
                      <div>
                        <div className="comment-head">
                          <strong>{name(c.authorId)}</strong> <span>{timeAgo(c.createdAt)}</span>
                        </div>
                        <div className="comment-body">{c.body}</div>
                      </div>
                    </div>
                  ))}
                  <form className="comment-form" onSubmit={addComment}>
                    <input aria-label="Add a comment" placeholder="Add a comment…" value={comment} maxLength={5000} onChange={(e) => setComment(e.target.value)} />
                    <button className="icon-button primary" aria-label="Post comment" disabled={busy || !comment.trim()}>
                      <Send size={16} />
                    </button>
                  </form>
                </motion.div>
              ) : (
                <motion.ol key="activity" className="activity" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  {timeline.map((ev) => (
                    <li key={ev.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>{ev.action === "github_sync" ? "GitHub" : name(ev.actorUserId)}</strong> {describeEvent(ev)}
                        {ev.note && <div className="activity-note">“{ev.note}”</div>}
                        <div className="muted-small">{timeAgo(ev.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </motion.ol>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.aside>
    </>
  );
}

function describeEvent(ev: TaskEvent): string {
  switch (ev.action) {
    case "create":
    case "create_from_template":
    case "create_from_recurrence":
      return "created the task";
    case "status_change":
    case "github_sync":
      return `moved it to ${ev.toStatus ? STATUS_META[ev.toStatus].label.toLowerCase() : "a new status"}`;
    case "comment":
      return "commented";
    case "attachment_added":
      return "added an attachment";
    default:
      if (ev.action === "github_link") return "linked a GitHub issue";
      if (ev.action === "github_unlink") return "unlinked the GitHub issue";
      return ev.action.replace(/_/g, " ");
  }
}
