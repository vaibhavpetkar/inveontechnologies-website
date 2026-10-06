import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, GitBranch, Rocket, TrendingUp } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { timeAgo, type Task } from "../../lib/tasks";
import type { TaskUpdate } from "../../lib/workspace";
import { useToast } from "../Toast";

const KIND = {
  start: { icon: Rocket, label: "Kickoff", tone: "blue" },
  progress: { icon: TrendingUp, label: "Progress", tone: "green" },
  blocker: { icon: AlertOctagon, label: "Blocked", tone: "red" },
} as const;

interface Props {
  task: Task;
  canPost: boolean;
  name: (id: string | null) => string;
  onChanged: () => void;
}

/** Kickoff, check-ins and blockers on a task, with a progress slider for the assignee. */
export function TaskUpdates({ task, canPost, name, onChanged }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [updates, setUpdates] = useState<TaskUpdate[] | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"progress" | "blocker">("progress");
  const [progress, setProgress] = useState(task.progressPercent ?? 0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ updates: TaskUpdate[] }>(`/api/v1/tasks/${task.id}/updates`, { accessToken }).then((r) => setUpdates(r.updates)).catch(() => setUpdates([]));
  }, [task.id, accessToken]);
  useEffect(load, [load]);
  useEffect(() => setProgress(task.progressPercent ?? 0), [task.progressPercent]);

  async function post(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks/${task.id}/updates`, { method: "POST", body: { kind, body: body.trim(), ...(kind === "progress" ? { progressPercent: progress } : {}) }, accessToken });
      setBody("");
      toast(kind === "blocker" ? "Blocker raised. Your reviewer was emailed." : "Update posted");
      load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't post the update.", "error");
    }
    setBusy(false);
  }

  const open = task.status !== "done" && task.status !== "cancelled";

  return (
    <div className="task-updates">
      {(task.startedAt || task.expectedFinishAt) && (
        <div className="kickoff-facts">
          {task.startedAt && <span>Started {timeAgo(task.startedAt)}</span>}
          {task.expectedFinishAt && <span>Aiming to finish {new Date(task.expectedFinishAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
          <span className="kickoff-progress">
            <span className="progress-bar"><motion.span className="progress-fill" initial={{ width: 0 }} animate={{ width: `${task.progressPercent ?? 0}%` }} transition={{ duration: 0.6 }} /></span>
            {task.progressPercent ?? 0}%
          </span>
        </div>
      )}

      {canPost && open && (
        <form className="update-form" onSubmit={post}>
          <div className="segmented small" role="radiogroup" aria-label="Kind of update">
            {(["progress", "blocker"] as const).map((k) => (
              <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
                {kind === k && <motion.span layoutId="update-kind" className="segmented-pill" />}
                <span>{k === "progress" ? "Progress" : "I'm blocked"}</span>
              </button>
            ))}
          </div>
          {kind === "progress" && (
            <label className="progress-slider">
              <span>Done so far</span>
              <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
              <strong>{progress}%</strong>
            </label>
          )}
          <textarea aria-label="Update" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === "progress" ? "What did you get done?" : "What's stopping you, and what do you need?"} />
          <button className={`btn btn-sm${kind === "blocker" ? " btn-danger" : ""}`} disabled={busy || body.trim().length < 2}>{kind === "blocker" ? "Raise blocker" : "Post update"}</button>
        </form>
      )}

      {updates === null ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : updates.length === 0 ? (
        <p className="muted-small">No updates yet.{task.status === "todo" ? " The assignee writes a short plan when they start." : ""}</p>
      ) : (
        <ol className="update-list">
          <AnimatePresence initial={false}>
            {updates.map((u, i) => {
              const meta = KIND[u.kind];
              const Icon = meta.icon;
              return (
                <motion.li key={u.id} className={`update-item tone-${meta.tone}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <span className="update-icon"><Icon size={14} /></span>
                  <div>
                    <div className="update-head">
                      <strong>{meta.label}</strong> · {name(u.userId)} · <span className="muted-small">{timeAgo(u.createdAt)}</span>
                      {u.progressPercent !== null && u.kind === "progress" && <span className="pill pill-green">{u.progressPercent}%</span>}
                    </div>
                    <div className="update-body">{u.body}</div>
                    {u.branchOrLink && (
                      <div className="update-link">
                        <GitBranch size={13} />
                        {/^https?:\/\//.test(u.branchOrLink) ? <a href={u.branchOrLink} target="_blank" rel="noreferrer">{u.branchOrLink}</a> : <code>{u.branchOrLink}</code>}
                      </div>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
