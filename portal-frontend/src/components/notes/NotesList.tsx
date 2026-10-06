import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Copy, Eye, EyeOff, ExternalLink, KeyRound, ListTodo, LogOut, NotebookPen, Pencil, Plus, Search, Share2, Star, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { timeAgo } from "../../lib/tasks";
import { NOTE_KINDS, type Note, type NoteKind } from "../../lib/workspace";
import { useToast } from "../Toast";
import { NoteDialog } from "./NoteDialog";

const ICONS: Record<NoteKind, typeof NotebookPen> = { note: NotebookPen, plan: ListTodo, bookmark: Bookmark, secret: KeyRound };
type Filter = "all" | "important" | NoteKind | "shared";

/**
 * The notes grid: planning notes, important notes, bookmarks and passwords,
 * mine and the ones shared with me. With `projectId`, only that project's.
 */
export function NotesList({ projectId, compact = false }: { projectId?: string; compact?: boolean }) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const search = useSearch();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Note | { kind: NoteKind } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ notes: Note[] }>(`/api/v1/notes${projectId ? `?projectId=${projectId}` : ""}`, { accessToken });
      setNotes(r.notes);
    } catch {
      setError("Couldn't load notes.");
    }
  }, [accessToken, projectId]);
  useEffect(() => {
    load();
  }, [load]);

  // Opening from a "shared with you" notification: /notes?open=<id>
  const openId = new URLSearchParams(search).get("open");
  useEffect(() => {
    if (!openId || !notes) return;
    const n = notes.find((x) => x.id === openId);
    if (n) setTimeout(() => document.getElementById(`note-${n.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
  }, [openId, notes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (filter === "important" && !n.important) return false;
      if (filter === "shared" && n.access === "owner") return false;
      if (filter !== "all" && filter !== "important" && filter !== "shared" && n.kind !== filter) return false;
      if (!q) return true;
      return [n.title, n.body ?? "", n.url ?? "", n.username ?? "", ...n.tags].some((v) => v.toLowerCase().includes(q));
    });
  }, [notes, filter, query]);

  const counts = useMemo(() => {
    const list = notes ?? [];
    return { all: list.length, important: list.filter((n) => n.important).length, shared: list.filter((n) => n.access !== "owner").length, note: list.filter((n) => n.kind === "note").length, plan: list.filter((n) => n.kind === "plan").length, bookmark: list.filter((n) => n.kind === "bookmark").length, secret: list.filter((n) => n.kind === "secret").length };
  }, [notes]);

  async function reveal(n: Note) {
    if (revealed[n.id]) {
      setRevealed(({ [n.id]: _, ...rest }) => rest);
      return;
    }
    try {
      const r = await apiFetch<{ secret: string }>(`/api/v1/notes/${n.id}/reveal`, { method: "POST", accessToken });
      setRevealed((s) => ({ ...s, [n.id]: r.secret }));
      // Hide it again after 30 seconds.
      setTimeout(() => setRevealed(({ [n.id]: _, ...rest }) => rest), 30_000);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't reveal it.", "error");
    }
  }

  async function copySecret(n: Note) {
    try {
      const value = revealed[n.id] ?? (await apiFetch<{ secret: string }>(`/api/v1/notes/${n.id}/reveal`, { method: "POST", accessToken })).secret;
      await navigator.clipboard.writeText(value);
      toast("Copied. It's cleared from the clipboard in 30 seconds if nothing else is copied.");
      setTimeout(() => navigator.clipboard.readText().then((t) => { if (t === value) return navigator.clipboard.writeText(""); }).catch(() => undefined), 30_000);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't copy it.", "error");
    }
  }

  async function toggleImportant(n: Note) {
    try {
      await apiFetch(`/api/v1/notes/${n.id}`, { method: "PUT", body: { kind: n.kind, title: n.title, body: n.body, url: n.url, username: n.username, important: !n.important, tags: n.tags, projectId: n.projectId }, accessToken });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update it.", "error");
    }
  }

  async function remove(n: Note) {
    const mine = n.access === "owner";
    if (!window.confirm(mine ? `Delete "${n.title}"? People it's shared with lose it too.` : `Remove "${n.title}" from your notes? ${n.owner.name} keeps it.`)) return;
    try {
      await apiFetch(mine ? `/api/v1/notes/${n.id}` : `/api/v1/notes/${n.id}/share`, { method: "DELETE", accessToken });
      setNotes((list) => list?.filter((x) => x.id !== n.id) ?? list);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove it.", "error");
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "important", label: "Important" },
    { id: "plan", label: "Plans" },
    { id: "note", label: "Notes" },
    { id: "bookmark", label: "Bookmarks" },
    { id: "secret", label: "Passwords" },
    { id: "shared", label: "Shared with me" },
  ];

  return (
    <div className={`notes${compact ? " compact" : ""}`}>
      <div className="board-toolbar">
        <div className="note-filters" role="tablist">
          {filters.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={`phase-chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
              {f.label} <span className="tab-count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
        </label>
        <div className="note-new">
          {(Object.keys(NOTE_KINDS) as NoteKind[]).map((k) => {
            const Icon = ICONS[k];
            return (
              <motion.button key={k} className={`btn btn-sm ${k === "note" ? "" : "btn-secondary"}`} whileTap={{ scale: 0.95 }} onClick={() => setEditing({ kind: k })}>
                {k === "note" ? <Plus size={14} /> : <Icon size={14} />} {NOTE_KINDS[k].label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!notes && !error && <div className="note-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>}
      {notes && visible.length === 0 && (
        <div className="empty-state">
          <NotebookPen size={34} />
          <h3>{notes.length ? "Nothing matches" : "No notes yet"}</h3>
          <p>Keep plans, important notes, useful links and shared passwords here. Only the people you share a note with can see it.</p>
        </div>
      )}

      <div className="note-grid">
        <AnimatePresence>
          {visible.map((n, i) => {
            const Icon = ICONS[n.kind];
            const meta = NOTE_KINDS[n.kind];
            return (
              <motion.article
                key={n.id}
                id={`note-${n.id}`}
                layout
                className={`note-card kind-${n.kind}${n.important ? " important" : ""}${openId === n.id ? " flash" : ""}`}
                initial={{ opacity: 0, y: 14, rotate: -0.6 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ delay: Math.min(i, 12) * 0.03, type: "spring", stiffness: 320, damping: 28 }}
                whileHover={{ y: -3 }}
              >
                <header className="note-head">
                  <span className={`note-kind pill pill-${meta.tone}`}><Icon size={13} /> {meta.label}</span>
                  <button className={`icon-button star${n.important ? " on" : ""}`} aria-label={n.important ? "Unmark important" : "Mark important"} title="Important" disabled={n.access === "view"} onClick={() => toggleImportant(n)}>
                    <Star size={16} />
                  </button>
                </header>
                <h3 className="note-title">{n.title}</h3>
                {n.kind === "bookmark" && n.url && (
                  <a className="note-url" href={n.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {n.url.replace(/^https?:\/\//, "").slice(0, 60)}</a>
                )}
                {n.kind === "secret" && (
                  <div className="secret-box">
                    {n.url && <a className="note-url" href={n.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {n.url.replace(/^https?:\/\//, "").slice(0, 48)}</a>}
                    {n.username && <div className="secret-row"><span className="muted-small">User</span><code>{n.username}</code></div>}
                    <div className="secret-row">
                      <span className="muted-small">Password</span>
                      <AnimatePresence mode="wait">
                        <motion.code key={revealed[n.id] ? "shown" : "hidden"} className="secret-value" initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }}>
                          {revealed[n.id] ?? "••••••••••"}
                        </motion.code>
                      </AnimatePresence>
                      <button className="icon-button" aria-label={revealed[n.id] ? "Hide" : "Reveal"} title={revealed[n.id] ? "Hide" : "Reveal (logged)"} onClick={() => reveal(n)}>{revealed[n.id] ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                      <button className="icon-button" aria-label="Copy password" title="Copy (logged)" onClick={() => copySecret(n)}><Copy size={15} /></button>
                    </div>
                  </div>
                )}
                {n.body && <p className="note-body">{n.body}</p>}
                {n.tags.length > 0 && <div className="note-tags">{n.tags.map((t) => <span key={t} className="note-tag">#{t}</span>)}</div>}
                <footer className="note-foot">
                  <span className="muted-small">
                    {n.access === "owner" ? (n.sharedCount ? <><Share2 size={12} /> Shared with {n.sharedCount}</> : "Only you") : `From ${n.owner.name}${n.access === "edit" ? " · you can edit" : ""}`} · {timeAgo(n.updatedAt)}
                  </span>
                  <span className="note-actions">
                    {n.access !== "view" && <button className="icon-button" aria-label="Edit" title="Edit" onClick={() => setEditing(n)}><Pencil size={15} /></button>}
                    <button className="icon-button" aria-label={n.access === "owner" ? "Delete" : "Remove from my notes"} title={n.access === "owner" ? "Delete" : "Remove from my notes"} onClick={() => remove(n)}>{n.access === "owner" ? <Trash2 size={15} /> : <LogOut size={15} />}</button>
                  </span>
                </footer>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {editing && (
          <NoteDialog
            note={"id" in editing ? editing : null}
            kind={editing.kind}
            projectId={projectId}
            meId={user?.id ?? ""}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
