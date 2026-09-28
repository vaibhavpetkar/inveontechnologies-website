import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleDot, ExternalLink, Github, Link2, RefreshCw, Unlink } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { issueLabel, useGithubStatus } from "../../lib/github";
import type { Task } from "../../lib/tasks";
import { useToast } from "../Toast";

interface Props {
  task: Task;
  canEdit: boolean;
  onUpdated: (task: Task) => void;
}

/** The task's GitHub issue: open one, link one, or see its state and jump to it. */
export function GithubPanel({ task, canEdit, onUpdated }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const { status, setUsername } = useGithubStatus(accessToken);
  const [linking, setLinking] = useState(false);
  const [ref, setRef] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  if (!status?.enabled) return null;
  const mine = task.assigneeId === user?.id;
  const canLink = canEdit || mine;

  async function run(path: string, method: string, body: unknown, done: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ task: Task }>(path, { method, body, accessToken });
      onUpdated(r.task);
      toast(done);
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "GitHub didn't respond. Try again.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function link(e: FormEvent) {
    e.preventDefault();
    if (await run(`/api/v1/github/tasks/${task.id}/link`, "POST", { ref: ref.trim() }, "Issue linked")) {
      setLinking(false);
      setRef("");
    }
  }

  async function saveHandle(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/v1/github/me", { method: "PUT", body: { username: handle.trim() }, accessToken });
      setUsername(handle.trim() || null);
      toast("GitHub username saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    }
  }

  const linked = task.githubRepo && task.githubIssueNumber;
  const closed = task.githubIssueState === "closed";

  return (
    <section className="gh-panel" aria-label="GitHub issue">
      <h3><Github size={16} /> GitHub</h3>
      {linked ? (
        <div className="gh-issue">
          <span className={`gh-state ${closed ? "closed" : "open"}`}>
            {closed ? <CircleCheck size={14} /> : <CircleDot size={14} />} {closed ? "Closed" : "Open"}
          </span>
          <a href={task.githubIssueUrl ?? "#"} target="_blank" rel="noreferrer" className="gh-issue-link">
            {issueLabel(task.githubRepo!, task.githubIssueNumber!)} <ExternalLink size={13} />
          </a>
          <span className="gh-issue-actions">
            <button className="icon-button" title="Refresh from GitHub" aria-label="Refresh from GitHub" disabled={busy} onClick={() => run(`/api/v1/github/tasks/${task.id}/sync`, "POST", undefined, "Up to date with GitHub")}>
              <RefreshCw size={15} />
            </button>
            {canEdit && (
              <button className="icon-button" title="Unlink issue" aria-label="Unlink issue" disabled={busy} onClick={() => window.confirm("Unlink this issue? The issue stays on GitHub.") && run(`/api/v1/github/tasks/${task.id}/link`, "DELETE", undefined, "Issue unlinked")}>
                <Unlink size={15} />
              </button>
            )}
          </span>
        </div>
      ) : canLink ? (
        <AnimatePresence mode="wait" initial={false}>
          {linking ? (
            <motion.form key="link" className="gh-link-form" onSubmit={link} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={status.defaultRepo ? `Issue link or #number (${status.defaultRepo})` : "Issue link or owner/repo#number"} aria-label="GitHub issue" autoFocus />
              <button className="btn btn-small" disabled={busy || !ref.trim()}>Link</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setLinking(false)}>Cancel</button>
            </motion.form>
          ) : (
            <motion.div key="buttons" className="gh-buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button className="btn btn-secondary btn-small" disabled={busy} onClick={() => run(`/api/v1/github/tasks/${task.id}/issue`, "POST", {}, "Issue opened on GitHub")}>
                <Github size={15} /> Open an issue
              </button>
              <button className="btn btn-secondary btn-small" disabled={busy} onClick={() => setLinking(true)}>
                <Link2 size={15} /> Link existing
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <p className="muted-small">No issue linked.</p>
      )}
      {linked && <p className="muted-small gh-hint">Closing the issue on GitHub marks this task done, and approving it here closes the issue.</p>}
      {mine && !status.username && (
        <form className="gh-link-form gh-handle" onSubmit={saveHandle}>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Your GitHub username" aria-label="Your GitHub username" />
          <button className="btn btn-small" disabled={!handle.trim()}>Save</button>
        </form>
      )}
    </section>
  );
}
