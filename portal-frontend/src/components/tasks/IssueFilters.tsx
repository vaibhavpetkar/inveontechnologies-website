import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, BookmarkPlus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { EMPTY_FILTERS, ISSUE_TYPE_META, type IssueFilters, type IssueType, type SavedFilter } from "../../lib/tasks";
import { useToast } from "../Toast";
import { IssueTypeIcon } from "./IssueBits";

interface Props {
  filters: IssueFilters;
  onChange: (next: IssueFilters) => void;
  people: { id: string; name: string }[];
  projects: { id: string; key: string; title: string }[];
  labels: string[];
  /** The project page fixes the project, so its picker is hidden. */
  fixedProject?: boolean;
}

const TYPES: IssueType[] = ["epic", "story", "task", "bug"];

/** Search box, quick filters and saved searches over the issue list and board. */
export function IssueFiltersBar({ filters, onChange, people, projects, labels, fixedProject = false }: Props) {
  const [text, setText] = useState(filters.q);
  const set = <K extends keyof IssueFilters>(key: K, value: IssueFilters[K]) => onChange({ ...filters, [key]: value });

  // Search as they type, without a request per keystroke.
  useEffect(() => setText(filters.q), [filters.q]);
  useEffect(() => {
    if (text === filters.q) return;
    const t = setTimeout(() => onChange({ ...filters, q: text }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const active =
    filters.q || (!fixedProject && filters.projectId) || filters.assignee || filters.reporter || filters.status.length || filters.priority.length || filters.type.length || filters.label || filters.state !== "all" || filters.watching;

  return (
    <div className="issue-filters">
      <label className="search-box">
        <Search size={16} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search, or type a key like INV-12" aria-label="Search issues" />
        {text && (
          <button type="button" className="icon-button" aria-label="Clear search" onClick={() => setText("")} style={{ width: 22, height: 22 }}>
            <X size={14} />
          </button>
        )}
      </label>

      <div className="type-toggle" role="group" aria-label="Issue type">
        {TYPES.map((t) => {
          const on = filters.type.includes(t);
          return (
            <button key={t} type="button" aria-pressed={on} onClick={() => set("type", on ? filters.type.filter((x) => x !== t) : [...filters.type, t])}>
              <IssueTypeIcon type={t} size={16} /> {ISSUE_TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {!fixedProject && projects.length > 0 && (
        <select aria-label="Project" className={filters.projectId ? "on" : ""} value={filters.projectId} onChange={(e) => set("projectId", e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.key} · {p.title}</option>
          ))}
        </select>
      )}

      <select aria-label="Assignee" className={filters.assignee ? "on" : ""} value={filters.assignee} onChange={(e) => set("assignee", e.target.value)}>
        <option value="">Anyone</option>
        <option value="me">Assigned to me</option>
        <option value="none">Unassigned</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <select aria-label="Priority" className={filters.priority.length ? "on" : ""} value={filters.priority.join(",")} onChange={(e) => set("priority", e.target.value ? (e.target.value.split(",") as IssueFilters["priority"]) : [])}>
        <option value="">Any priority</option>
        <option value="urgent">Urgent</option>
        <option value="high,urgent">High and urgent</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {labels.length > 0 && (
        <select aria-label="Label" className={filters.label ? "on" : ""} value={filters.label} onChange={(e) => set("label", e.target.value)}>
          <option value="">Any label</option>
          {labels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      )}

      <select aria-label="State" className={filters.state !== "all" ? "on" : ""} value={filters.state} onChange={(e) => set("state", e.target.value as IssueFilters["state"])}>
        <option value="all">Open and closed</option>
        <option value="open">Open</option>
        <option value="overdue">Overdue</option>
        <option value="closed">Done or cancelled</option>
      </select>

      <label className="toggle">
        <input type="checkbox" checked={filters.watching} onChange={(e) => set("watching", e.target.checked)} /> Watching
      </label>

      {active ? (
        <button type="button" className="link-button" onClick={() => onChange({ ...EMPTY_FILTERS, projectId: fixedProject ? filters.projectId : "", sort: filters.sort, order: filters.order })}>
          Clear
        </button>
      ) : null}

      <SavedFilters filters={filters} onApply={(f) => onChange({ ...EMPTY_FILTERS, ...f, projectId: fixedProject ? filters.projectId : f.projectId ?? "" })} />
    </div>
  );
}

function SavedFilters({ filters, onApply }: { filters: IssueFilters; onApply: (f: Partial<IssueFilters>) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedFilter[] | null>(null);
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || saved) return;
    apiFetch<{ filters: SavedFilter[] }>("/api/v1/tasks/filters", { accessToken }).then((r) => setSaved(r.filters)).catch(() => setSaved([]));
  }, [open, saved, accessToken]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { q, projectId, assignee, reporter, status, priority, type, label, state, watching, sort, order } = filters;
      const r = await apiFetch<{ filter: SavedFilter }>("/api/v1/tasks/filters", {
        method: "POST",
        body: { name: name.trim(), filters: Object.fromEntries(Object.entries({ q, projectId, assignee, reporter, status, priority, type, label, state, watching, sort, order }).filter(([, v]) => v !== "" && v !== false && !(Array.isArray(v) && !v.length))) },
        accessToken,
      });
      setSaved((s) => [...(s ?? []), r.filter].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      toast(`Saved "${r.filter.name}"`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save this search.", "error");
    }
  }

  async function remove(f: SavedFilter) {
    setSaved((s) => s?.filter((x) => x.id !== f.id) ?? s);
    await apiFetch(`/api/v1/tasks/filters/${f.id}`, { method: "DELETE", accessToken }).catch(() => undefined);
  }

  return (
    <div className="saved-filters" ref={box}>
      <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bookmark size={14} /> Saved searches
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="saved-menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
            {saved === null ? (
              <div className="skeleton" style={{ height: 60 }} />
            ) : saved.length === 0 ? (
              <p className="muted-small">Set some filters, then save them here to come back in one click.</p>
            ) : (
              <ul>
                {saved.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => { onApply(f.filters); setOpen(false); }}>{f.name}</button>
                    <button type="button" className="icon-button" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={save}>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Name this search" aria-label="Name for this search" />
              <button className="btn btn-sm" disabled={!name.trim()} aria-label="Save current search"><BookmarkPlus size={14} /></button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
