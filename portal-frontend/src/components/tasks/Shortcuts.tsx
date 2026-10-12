import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { ISSUE_TYPE_META, PRIORITY_META, type IssueType, type Task, type TaskPriority } from "../../lib/tasks";
import type { ProjectSummary } from "../../lib/workspace";
import { Dialog } from "../settings/ui";
import { useToast } from "../Toast";
import "../../styles/automation.css";

const SHORTCUTS: [string, string][] = [
  ["c", "Create an issue"],
  ["/", "Search issues"],
  ["j / k", "Next / previous issue in a list or board"],
  ["Enter", "Open the selected issue"],
  ["g then d", "Go to dashboards"],
  ["g then t", "Go to tasks"],
  ["g then p", "Go to projects"],
  ["?", "Show these shortcuts"],
  ["Esc", "Close a dialog or drawer"],
];

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * Jira-style keyboard shortcuts for staff: c creates an issue from
 * anywhere, / jumps to search, j/k walk issue lists, g+letter navigates.
 */
export function Shortcuts() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [creating, setCreating] = useState(false);
  const [help, setHelp] = useState(false);
  const pendingG = useRef(0);
  const staff = !!user && user.role !== "candidate";

  useEffect(() => {
    if (!staff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (document.querySelector(".modal-scrim")) return;
      const now = Date.now();
      if (now - pendingG.current < 1200) {
        pendingG.current = 0;
        const to = { d: "/dashboards", t: "/tasks", p: "/projects" }[e.key];
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = now;
        return;
      }
      if (e.key === "c") {
        e.preventDefault();
        setCreating(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === "/") {
        e.preventDefault();
        const box = document.querySelector<HTMLInputElement>("[data-shortcut-search]");
        if (box) box.focus();
        else navigate("/tasks?focus=search");
      } else if (e.key === "j" || e.key === "k") {
        if (document.querySelector(".task-drawer")) return;
        const rows = [...document.querySelectorAll<HTMLElement>("[data-issue-row]")];
        if (!rows.length) return;
        e.preventDefault();
        const at = rows.indexOf(document.activeElement as HTMLElement);
        const next = at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + (e.key === "j" ? 1 : -1)));
        rows[next].focus();
        rows[next].scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staff, navigate]);

  // Arriving from "/" on another page: focus the search box once it's there.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("focus")) return;
    const t = setTimeout(() => document.querySelector<HTMLInputElement>("[data-shortcut-search]")?.focus(), 300);
    return () => clearTimeout(t);
  });

  if (!staff) return null;
  return (
    <AnimatePresence>
      {creating && <QuickCreate key="qc" onClose={() => setCreating(false)} />}
      {help && (
        <Dialog key="help" id="shortcuts-title" title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <ul className="shortcut-list">
            {SHORTCUTS.map(([k, what]) => (
              <li key={k}>
                <span>{what}</span>
                <span>{k.split(" ").map((p, i) => (["then", "/"].includes(p) ? <span key={i} className="muted-small"> {p} </span> : <kbd key={i} className="kbd">{p}</kbd>))}</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

/** Create an issue from anywhere: title, project, type, priority, and whether it's mine. */
function QuickCreate({ onClose }: { onClose: () => void }) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState(() => {
    try {
      return localStorage.getItem("portal.quickcreate.project") ?? "";
    } catch {
      return "";
    }
  });
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("task");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [mine, setMine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ projects: ProjectSummary[] }>("/api/v1/projects", { accessToken })
      .then((r) => {
        setProjects(r.projects);
        // Default to the project on screen, else the last one used.
        const here = window.location.pathname.match(/^\/projects\/([0-9a-f-]{36})/)?.[1];
        if (here && r.projects.some((p) => p.id === here)) setProjectId(here);
        else if (!r.projects.some((p) => p.id === projectId)) setProjectId("");
      })
      .catch(() => setProjects([]));
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2) return setError("Give it a title.");
    setBusy(true);
    try {
      const r = await apiFetch<{ task: Task }>("/api/v1/tasks", {
        method: "POST",
        body: { title: title.trim(), type, priority, ...(projectId ? { projectId } : {}), ...(mine && user ? { assigneeId: user.id } : {}) },
        accessToken,
      });
      try {
        localStorage.setItem("portal.quickcreate.project", projectId);
      } catch {
        /* private window */
      }
      toast(`Created ${r.task.key ?? "the issue"}`);
      onClose();
      navigate(projectId ? `/projects/${projectId}?task=${r.task.key ?? r.task.id}` : `/tasks/${r.task.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the issue.");
      setBusy(false);
    }
  }

  return (
    <Dialog id="qc-title" title="Create an issue" onClose={onClose} onSubmit={submit}>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" maxLength={200} autoFocus />
      </label>
      <label className="field">
        <span>Project</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!projects}>
          <option value="">No project (a personal task)</option>
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ""}{p.title}</option>)}
        </select>
      </label>
      <div className="auto-row">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as IssueType)}>
            {(Object.keys(ISSUE_TYPE_META) as IssueType[]).map((t) => <option key={t} value={t}>{ISSUE_TYPE_META[t].label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </label>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assign it to me
      </label>
      {error && <div className="error-banner">{error}</div>}
      <div className="modal-actions">
        <span className="muted-small" style={{ marginRight: "auto" }}>Press <kbd className="kbd">?</kbd> for all shortcuts</span>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      </div>
    </Dialog>
  );
}
