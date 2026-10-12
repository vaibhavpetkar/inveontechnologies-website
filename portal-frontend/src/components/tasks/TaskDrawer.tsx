import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { CalendarClock, Clock, Eye, EyeOff, Plus, Send, Star, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName } from "../../lib/nav";
import { allowedMoves, formatDue, isOverdue, ISSUE_TYPE_META, MOVE_LABELS, PRIORITY_META, STATUS_META, timeAgo, toDateInput, type IssueType, type Task, type TaskComment, type TaskEvent, type TaskPriority, type TaskRequest, type TaskStatus } from "../../lib/tasks";
import { IssueKey, IssueTypeIcon, LabelChips } from "./IssueBits";
import type { Colleague } from "../../lib/calendar";
import type { DirectoryUser } from "../../lib/useDirectory";
import { Avatar } from "../Avatar";
import { statusLabel, useProjectSettings } from "../../lib/projectSettings";
import { useToast } from "../Toast";
import { GithubPanel } from "./GithubPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { TaskUpdates } from "./TaskUpdates";
import { CAN_ASSIGN_OTHERS } from "../../lib/tasks";
import { RatingDialog } from "./RatingDialog";
import { Stars } from "./StarRating";
import { TaskRequestsPanel } from "./TaskRequestsPanel";
import { DevelopmentPanel, LinkedIssues, useVersions, WorkLog } from "./EngineeringPanels";
import { useColleagues } from "./useColleagues";

interface Props {
  taskId: string;
  byId: Map<string, DirectoryUser>;
  onClose: () => void;
  onMove: (task: Task, to: TaskStatus, note?: string) => Promise<boolean>;
  onChanged: () => void;
  /** Opens another task (a subtask or the parent) by key or id; defaults to /tasks/:ref. */
  onOpenTask?: (ref: string) => void;
}

type Tab = "updates" | "comments" | "worklog" | "activity";

export function TaskDrawer({ taskId, byId, onClose, onMove, onChanged, onOpenTask }: Props) {
  const { user, accessToken } = useAuth();
  const [, navigate] = useLocation();
  const openTask = onOpenTask ?? ((ref: string) => navigate(`/tasks/${ref}`));
  const [parent, setParent] = useState<Task | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchers, setWatchers] = useState<{ id: string; name: string }[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeline, setTimeline] = useState<TaskEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("updates");
  const [comment, setComment] = useState("");
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<TaskRequest[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [rating, setRating] = useState<"approve" | "rate" | null>(null);
  const colleagues = useColleagues();

  const load = useCallback(async () => {
    try {
      // taskId may be a key (INV-42); everything after this uses the real id.
      const t = await apiFetch<{ task: Task; subtasks: Task[]; parent: Task | null; watching: boolean; watchers: { id: string; name: string }[] }>(`/api/v1/tasks/${taskId}`, { accessToken });
      const id = t.task.id;
      const [c, tl] = await Promise.all([
        apiFetch<{ comments: TaskComment[] }>(`/api/v1/tasks/${id}/comments`, { accessToken }),
        apiFetch<{ timeline: TaskEvent[] }>(`/api/v1/tasks/${id}/timeline`, { accessToken }),
      ]);
      setTask(t.task);
      setSubtasks(t.subtasks);
      setParent(t.parent);
      setWatching(t.watching);
      setWatchers(t.watchers);
      setComments(c.comments);
      setTimeline(tl.timeline);
      // Requests are extra: the drawer still works if they can't be read.
      apiFetch<{ requests: TaskRequest[]; canDecide: boolean }>(`/api/v1/tasks/${id}/requests`, { accessToken })
        .then((r) => {
          setRequests(r.requests);
          setCanDecide(r.canDecide);
        })
        .catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This task no longer exists." : err instanceof ApiError && err.status === 403 ? "You don't have access to this task." : "Couldn't load this task.");
    }
  }, [taskId, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A dialog on top of the drawer closes first.
      if (document.querySelector(".modal-scrim, .task-drawer .mention-pop")) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = (id: string | null) => {
    if (!id) return "Someone";
    if (id === user?.id) return "You";
    const c = colleagues.byId.get(id);
    if (c) return c.name;
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
    // Approving someone else's work asks for a star rating first.
    if (to === "done" && task.assigneeId && task.assigneeId !== user?.id) {
      setRating("approve");
      return;
    }
    setBusy(true);
    if (await onMove(task, to, note || undefined)) await load();
    setBusy(false);
  }

  async function addComment(e?: FormEvent) {
    e?.preventDefault();
    if (!comment.trim() || !task) return;
    setBusy(true);
    try {
      const body = comment.trim();
      const mentionedUserIds = [...mentioned.current.values()].filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      await apiFetch(`/api/v1/tasks/${task.id}/comments`, { method: "POST", body: { body, mentionedUserIds }, accessToken });
      mentioned.current.clear();
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
      await apiFetch(`/api/v1/tasks/${task!.id}/time-entries`, { method: "POST", body: { hours: h, entryDate: new Date().toISOString() }, accessToken });
      setHours("");
      toast(`Logged ${h}h`);
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't log time.", "error");
    }
    setBusy(false);
  }

  // ---- @mentions in comments ----
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentioned = useRef(new Map<string, Colleague>());
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return colleagues.people.filter((p) => p.id !== user?.id && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q))).slice(0, 6);
  }, [mentionQuery, colleagues.people, user?.id]);
  function typeComment(value: string) {
    setComment(value);
    const m = value.match(/(?:^|\s)@([^@\n]*)$/);
    setMentionQuery(m && m[1].length <= 30 ? m[1] : null);
    setMentionIndex(0);
  }
  function pickMention(p: Colleague) {
    setComment((c) => c.replace(/@([^@\n]*)$/, `@${p.name} `));
    mentioned.current.set(p.id, p);
    setMentionQuery(null);
  }
  function commentKeys(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(suggestions[mentionIndex]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMentionQuery(null); }
  }

  // ---- Editing details, watching, subtasks ----
  const canEditDetails = !!task && !!user && (task.createdBy === user.id || task.assigneeId === user.id || CAN_ASSIGN_OTHERS.includes(user.role));
  const versions = useVersions(task?.projectId);
  async function saveDetails(patch: Partial<{ type: IssueType; priority: TaskPriority; labels: string[]; dueDate: string | null; storyPoints: number | null; startDate: string | null; fixVersionId: string | null; remainingHours: number | null }>) {
    if (!task) return;
    const before = task;
    setTask({ ...task, ...patch } as Task);
    try {
      const r = await apiFetch<{ task: Task }>(`/api/v1/tasks/${task.id}`, { method: "PUT", body: patch, accessToken });
      setTask(r.task);
      apiFetch<{ timeline: TaskEvent[] }>(`/api/v1/tasks/${task.id}/timeline`, { accessToken }).then((tl) => setTimeline(tl.timeline)).catch(() => undefined);
      onChanged();
    } catch (err) {
      setTask(before);
      toast(err instanceof ApiError ? err.message : "Couldn't save that change.", "error");
    }
  }
  async function toggleWatch() {
    if (!task) return;
    const next = !watching;
    setWatching(next);
    try {
      await apiFetch(`/api/v1/tasks/${task.id}/watch`, { method: next ? "POST" : "DELETE", accessToken });
      setWatchers((w) => (next ? [...w.filter((x) => x.id !== user!.id), { id: user!.id, name: "You" }] : w.filter((x) => x.id !== user!.id)));
      toast(next ? "You'll hear about comments and status changes." : "You stopped watching this task.");
    } catch {
      setWatching(!next);
    }
  }
  async function addSubtask(e: FormEvent) {
    e.preventDefault();
    if (!task || newSubtask.trim().length < 2) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks`, { method: "POST", body: { title: newSubtask.trim(), parentTaskId: task.id, ...(task.projectId ? { projectId: task.projectId } : {}), assigneeId: user!.id }, accessToken });
      setNewSubtask("");
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add the subtask.", "error");
    }
    setBusy(false);
  }

  const settings = useProjectSettings(task?.projectId, accessToken);
  const moves = task && user ? allowedMoves(task, user, { requireReview: settings.workflow.requireReview }) : [];
  // Reviewers (per the server) rate done work; nobody rates their own.
  const canRate = !!task && !!user && task.status === "done" && canDecide && !!task.assigneeId && task.assigneeId !== user.id;

  function changed() {
    load();
    onChanged();
  }
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
          {task && (
            <span className="drawer-crumbs">
              {parent && (
                <>
                  <button type="button" className="link-button" onClick={() => openTask(parent.key ?? parent.id)}>{parent.key ?? parent.title}</button>
                  <span className="muted-small">/</span>
                </>
              )}
              <IssueTypeIcon type={task.type} size={18} />
              <IssueKey value={task.key} />
              <span className={`pill pill-${STATUS_META[task.status].tone}`}>{statusLabel(task.status, settings)}</span>
            </span>
          )}
          {task && (
            <button type="button" className="btn btn-secondary btn-sm watch-button" style={{ marginLeft: "auto" }} onClick={toggleWatch} aria-pressed={watching} title={watchers.length ? `Watching: ${watchers.map((w) => (w.id === user?.id ? "You" : w.name)).join(", ")}` : undefined}>
              {watching ? <EyeOff size={14} /> : <Eye size={14} />} {watching ? "Unwatch" : "Watch"} {watchers.length > 0 && <span className="tab-count">{watchers.length}</span>}
            </button>
          )}
          <button className="icon-button" aria-label="Close" onClick={onClose} style={task ? undefined : { marginLeft: "auto" }}>
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
              {!canEditDetails && (
                <>
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
                </>
              )}
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

            {canEditDetails ? (
              <div className="issue-edit-grid">
                <div className="field">
                  <label htmlFor="iss-type">Type</label>
                  <select id="iss-type" value={task.type ?? "task"} onChange={(e) => saveDetails({ type: e.target.value as IssueType })}>
                    {(Object.keys(ISSUE_TYPE_META) as IssueType[]).filter((t) => !(t === "epic" && task.parentTaskId)).map((t) => (
                      <option key={t} value={t}>{ISSUE_TYPE_META[t].label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="iss-priority">Priority</label>
                  <select id="iss-priority" value={task.priority} onChange={(e) => saveDetails({ priority: e.target.value as TaskPriority })}>
                    {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                    ))}
                  </select>
                </div>
                {task.projectId && (
                  <div className="field">
                    <label htmlFor="iss-start">Starts</label>
                    <input id="iss-start" type="date" value={task.startDate ? toDateInput(task.startDate) : ""} onChange={(e) => saveDetails({ startDate: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null })} />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="iss-due">Due</label>
                  <input id="iss-due" type="date" value={task.dueDate ? toDateInput(task.dueDate) : ""} onChange={(e) => saveDetails({ dueDate: e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : null })} />
                </div>
                {task.projectId && versions.length > 0 && (
                  <div className="field">
                    <label htmlFor="iss-version">Fix version</label>
                    <select id="iss-version" value={task.fixVersionId ?? ""} onChange={(e) => saveDetails({ fixVersionId: e.target.value || null })}>
                      <option value="">None</option>
                      {versions.filter((v) => v.status === "unreleased" || v.id === task.fixVersionId).map((v) => (
                        <option key={v.id} value={v.id}>{v.name}{v.status === "released" ? " (released)" : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="iss-remaining">Remaining (h)</label>
                  <input
                    id="iss-remaining"
                    type="number"
                    min={0}
                    step={0.5}
                    key={`rem-${task.remainingHours ?? ""}`}
                    defaultValue={task.remainingHours != null ? Number(task.remainingHours) : ""}
                    placeholder="–"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                      if (v !== (task.remainingHours != null ? Number(task.remainingHours) : null) && !Number.isNaN(v)) saveDetails({ remainingHours: v });
                    }}
                  />
                </div>
                {task.projectId && task.type !== "epic" && (
                  <div className="field">
                    <label htmlFor="iss-points">Story points</label>
                    <input
                      id="iss-points"
                      type="number"
                      min={0}
                      max={100}
                      key={`pts-${task.storyPoints ?? ""}`}
                      defaultValue={task.storyPoints ?? ""}
                      placeholder="None"
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value))));
                        if (v !== (task.storyPoints ?? null) && !Number.isNaN(v)) saveDetails({ storyPoints: v });
                      }}
                    />
                  </div>
                )}
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="iss-labels">Labels</label>
                  <LabelEditor id="iss-labels" labels={task.labels ?? []} onChange={(labels) => saveDetails({ labels })} />
                </div>
              </div>
            ) : (
              !!task.labels?.length && <LabelChips labels={task.labels} max={10} />
            )}

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

            <LinkedIssues task={task} canEdit={canEditDetails} onOpen={openTask} />

            <DevelopmentPanel task={task} />

            <AttachmentsPanel taskId={task.id} onChanged={() => load()} />

            <TaskRequestsPanel task={task} requests={requests} canDecide={canDecide} name={name} onChanged={changed} />

            {task.status === "done" && (task.rating || canRate) && (
              <div className="rating-card">
                <div className="rating-card-head">
                  <h3>Reviewer's rating</h3>
                  {canRate && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRating("rate")}>
                      <Star size={14} /> {task.rating ? "Change rating" : "Rate this work"}
                    </button>
                  )}
                </div>
                {task.rating ? (
                  <>
                    <div className="rating-card-stars">
                      <Stars value={task.rating} size={20} />
                      <span className="muted-small">{task.rating}/5{task.ratedBy ? ` from ${name(task.ratedBy)}` : ""}{task.ratedAt ? ` · ${timeAgo(task.ratedAt)}` : ""}</span>
                    </div>
                    {task.ratingNote && <p className="rating-card-note">“{task.ratingNote}”</p>}
                  </>
                ) : (
                  <p className="muted-small">Not rated yet. Unrated work counts as 3 stars.</p>
                )}
              </div>
            )}

            {moves.length > 0 && (
              <div className="drawer-actions">
                {moves.map((to) => (
                  <button key={to} className={`btn ${to === "cancelled" ? "btn-danger" : to === "changes_requested" ? "btn-secondary" : ""}`} disabled={busy} onClick={() => move(to)}>
                    {to === "done" && !settings.workflow.requireReview && task.assigneeId === user?.id ? "Mark done" : to === "in_review" && settings.workflow.labels.in_review ? `Move to ${statusLabel("in_review", settings)}` : MOVE_LABELS[to]}
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

            {(subtasks.length > 0 || (canEditDetails && task.type !== "bug" && !task.parentTaskId)) && (
              <div className="drawer-section">
                <h3>Subtasks {subtasks.length > 0 && <span className="muted-small">{subtasks.filter((s) => s.status === "done").length} of {subtasks.length} done</span>}</h3>
                {subtasks.map((s) => (
                  <div key={s.id} className="subtask-row clickable" role="button" tabIndex={0} onClick={() => openTask(s.key ?? s.id)} onKeyDown={(e) => e.key === "Enter" && openTask(s.key ?? s.id)}>
                    <span className={`status-dot tone-${STATUS_META[s.status].tone}`} />
                    <span>{s.title}</span>
                    <IssueKey value={s.key} />
                  </div>
                ))}
                {canEditDetails && !task.parentTaskId && (
                  <form className="subtask-add" onSubmit={addSubtask}>
                    <input value={newSubtask} maxLength={200} onChange={(e) => setNewSubtask(e.target.value)} placeholder="Add a subtask" aria-label="New subtask title" />
                    <button className="btn btn-secondary btn-sm" disabled={busy || newSubtask.trim().length < 2}><Plus size={14} /> Add</button>
                  </form>
                )}
              </div>
            )}

            <div className="tabs" role="tablist">
              {(["updates", "comments", "worklog", "activity"] as Tab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                  {tab === t && <motion.span layoutId="drawer-tab" className="tab-underline" />}
                  {t === "updates" ? "Work updates" : t === "comments" ? `Comments (${comments.length})` : t === "worklog" ? "Work log" : "Activity"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === "updates" ? (
                <motion.div key="updates" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  <TaskUpdates
                    task={task}
                    canPost={!!user && (task.assigneeId === user.id || task.createdBy === user.id || CAN_ASSIGN_OTHERS.includes(user.role))}
                    name={name}
                    onChanged={() => {
                      load();
                      onChanged();
                    }}
                  />
                </motion.div>
              ) : tab === "comments" ? (
                <motion.div key="comments" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  {comments.length === 0 && <p className="muted-small">No comments yet.</p>}
                  {comments.map((c) => (
                    <div key={c.id} className="comment">
                      {byId.get(c.authorId) ? <Avatar email={byId.get(c.authorId)!.email} size={26} /> : <span className="avatar placeholder" />}
                      <div>
                        <div className="comment-head">
                          <strong>{name(c.authorId)}</strong> <span>{timeAgo(c.createdAt)}</span>
                        </div>
                        <div className="comment-body">{renderMentions(c.body, (c.mentionedUserIds ?? []).map((id) => (id === user?.id ? colleagues.byId.get(id)?.name ?? "You" : colleagues.byId.get(id)?.name)).filter((n): n is string => !!n))}</div>
                      </div>
                    </div>
                  ))}
                  <form className="comment-form" onSubmit={addComment}>
                    <AnimatePresence>
                      {suggestions.length > 0 && (
                        <motion.ul className="mention-pop" role="listbox" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                          {suggestions.map((p, i) => (
                            <li key={p.id} role="option" aria-selected={i === mentionIndex}>
                              <button type="button" className={i === mentionIndex ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}>
                                <Avatar email={p.email} size={22} /> <span>{p.name}</span>
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                    <input aria-label="Add a comment" placeholder="Add a comment · type @ to mention" value={comment} maxLength={5000} onChange={(e) => typeComment(e.target.value)} onKeyDown={commentKeys} />
                    <button className="icon-button primary" aria-label="Post comment" disabled={busy || !comment.trim()}>
                      <Send size={16} />
                    </button>
                  </form>
                </motion.div>
              ) : tab === "worklog" ? (
                <motion.div key="worklog" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  <WorkLog task={task} onChanged={() => { load(); onChanged(); }} />
                </motion.div>
              ) : (
                <motion.ol key="activity" className="activity" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  {timeline.map((ev) => (
                    <li key={ev.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>{ev.action === "github_sync" || ev.action === "github_pr" || (!ev.actorUserId && ev.note?.includes("GitHub")) ? "GitHub" : name(ev.actorUserId)}</strong> {describeEvent(ev)}
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
      <AnimatePresence>
        {task && rating && (
          <RatingDialog
            key="rating"
            task={task}
            mode={rating}
            assigneeName={name(task.assigneeId)}
            onCancel={() => setRating(null)}
            onDone={() => {
              setRating(null);
              changed();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Highlights "@Name" for the people the comment mentioned. */
function renderMentions(body: string, names: string[]) {
  if (!names.length) return body;
  const sorted = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = body.split(new RegExp(`(@(?:${sorted.join("|")}))`, "g"));
  return parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="mention">{p}</span> : <Fragment key={i}>{p}</Fragment>));
}

/** Labels as chips with a box to type more; Enter or comma adds one. */
function LabelEditor({ id, labels, onChange }: { id: string; labels: string[]; onChange: (labels: string[]) => void }) {
  const [text, setText] = useState("");
  function add() {
    const l = text.trim().toLowerCase().replace(/\s+/g, "-").replace(/,/g, "");
    setText("");
    if (!l || labels.includes(l) || labels.length >= 10) return;
    onChange([...labels, l.slice(0, 30)]);
  }
  return (
    <div className="label-editor">
      {labels.map((l) => (
        <span key={l} className="label-chip">
          {l}
          <button type="button" aria-label={`Remove label ${l}`} onClick={() => onChange(labels.filter((x) => x !== l))}>×</button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        maxLength={30}
        placeholder={labels.length ? "" : "Add labels, e.g. frontend"}
        onChange={(e) => (e.target.value.endsWith(",") ? (setText(e.target.value.slice(0, -1)), setTimeout(add)) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !text && labels.length) onChange(labels.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

function describeEvent(ev: TaskEvent): string {
  switch (ev.action) {
    case "field_change":
      if (ev.field === "description") return ev.toValue === "cleared" ? "cleared the details" : "edited the details";
      if (!ev.fromValue) return `set the ${ev.field} to ${ev.toValue}`;
      if (!ev.toValue) return `cleared the ${ev.field} (was ${ev.fromValue})`;
      return `changed the ${ev.field} from ${ev.fromValue} to ${ev.toValue}`;
    case "create":
    case "create_from_template":
    case "create_from_recurrence":
      return "created the task";
    case "status_change":
    case "github_sync":
      return `moved it to ${ev.toStatus ? STATUS_META[ev.toStatus].label.toLowerCase() : "a new status"}`;
    case "link_added":
      return `linked it: ${ev.note ?? "another issue"}`;
    case "github_pr":
      return ev.note ? ev.note.replace(/^PR/, "pull request").replace(/^./, (c) => c.toLowerCase()) : "updated a pull request";
    case "comment":
      return "commented";
    case "attachment_added":
      return "added an attachment";
    case "progress":
      return "posted a progress update";
    case "blocker":
      return "raised a blocker";
    case "rated":
      return "rated the work";
    case "extension_requested":
      return "asked for more time";
    case "reassign_requested":
      return "asked to hand the task over";
    case "extension_approved":
      return "gave more time";
    case "extension_declined":
      return "kept the due date as it was";
    case "reassign_approved":
      return "handed the task to someone else";
    case "reassign_declined":
      return "declined the hand-over";
    default:
      if (ev.action === "github_link") return "linked a GitHub issue";
      if (ev.action === "github_unlink") return "unlinked the GitHub issue";
      return ev.action.replace(/_/g, " ");
  }
}
