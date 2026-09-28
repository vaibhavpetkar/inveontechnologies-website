import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Github, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName } from "../../lib/nav";
import type { DirectoryUser } from "../../lib/useDirectory";

interface ProjectOption {
  id: string;
  title: string;
  githubRepo: string | null;
}

interface Props {
  people: DirectoryUser[];
  defaultRepo: string | null;
  onClose: () => void;
  onImported: (created: number) => void;
}

/** Turns a repo's open GitHub issues into tasks, once each. */
export function ImportIssuesDialog({ people, defaultRepo, onClose, onImported }: Props) {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [repo, setRepo] = useState(defaultRepo ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    apiFetch<{ projects: ProjectOption[] }>("/api/v1/github/projects", { accessToken }).then((r) => setProjects(r.projects)).catch(() => undefined);
  }, [accessToken]);

  function pickProject(id: string) {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p?.githubRepo) setRepo(p.githubRepo);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ created: number; skipped: number }>("/api/v1/github/import", {
        method: "POST",
        body: { repo: repo.trim(), projectId: projectId || undefined, assigneeId: assigneeId || undefined },
        accessToken,
      });
      setResult(r);
      if (r.created > 0) onImported(r.created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach GitHub.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="import-title"><Github size={20} style={{ verticalAlign: "-3px" }} /> Import GitHub issues</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="muted-small" style={{ marginTop: 0 }}>Every open issue becomes a task. Issues already on the board are skipped, and people are matched by their GitHub username.</p>
        {error && <div className="error-banner">{error}</div>}
        {result && (
          <div className="notice notice-info">
            {result.created > 0 ? `Added ${result.created} ${result.created === 1 ? "task" : "tasks"}.` : "Nothing new to add."}
            {result.skipped > 0 && ` ${result.skipped} already on the board.`}
          </div>
        )}
        {projects.length > 0 && (
          <div className="field">
            <label htmlFor="imp-project">Project</label>
            <select id="imp-project" value={projectId} onChange={(e) => pickProject(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}{p.githubRepo ? ` (${p.githubRepo})` : ""}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="imp-repo">Repository</label>
          <input id="imp-repo" required value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="inveon/portal" pattern="[\w.\-]+/[\w.\-]+" title="owner/name" />
        </div>
        <div className="field">
          <label htmlFor="imp-assignee">Assign unmatched issues to</label>
          <select id="imp-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Leave unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{displayName(p.email)}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{result ? "Done" : "Cancel"}</button>
          <button className="btn" disabled={busy || !repo.trim()}>{busy ? "Importing…" : "Import issues"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
