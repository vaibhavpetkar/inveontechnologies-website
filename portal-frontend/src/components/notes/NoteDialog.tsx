import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Lock, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { NOTE_KINDS, useColleagues, type Note, type NoteKind } from "../../lib/workspace";
import { PeoplePicker, type Picked } from "../PeoplePicker";

interface Props {
  note: Note | null;
  kind: NoteKind;
  projectId?: string;
  meId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Write or edit a note, bookmark or password, and choose who it's shared with. */
export function NoteDialog({ note, kind: initialKind, projectId, meId, onClose, onSaved }: Props) {
  const { accessToken } = useAuth();
  const { people } = useColleagues();
  const isOwner = !note || note.access === "owner";
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? initialKind);
  const [form, setForm] = useState({ title: note?.title ?? "", body: note?.body ?? "", url: note?.url ?? "", username: note?.username ?? "", secret: "", tags: note?.tags.join(", ") ?? "", important: note?.important ?? false });
  const [shares, setShares] = useState<Picked[]>(note?.sharedWith.map((s) => ({ id: s.id, canEdit: s.canEdit })) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      kind,
      title: form.title.trim(),
      body: form.body.trim() || null,
      url: form.url.trim() || null,
      username: kind === "secret" ? form.username.trim() || null : null,
      important: form.important,
      tags: form.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 20),
      projectId: note ? note.projectId : projectId ?? null,
    };
    if (kind === "secret" && form.secret) body.secret = form.secret;
    if (isOwner) body.shares = shares.map((s) => ({ userId: s.id, canEdit: !!s.canEdit }));
    try {
      if (note) await apiFetch(`/api/v1/notes/${note.id}`, { method: "PUT", body, accessToken });
      else await apiFetch("/api/v1/notes", { method: "POST", body, accessToken });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? (err.code === "VALIDATION_ERROR" && kind === "bookmark" ? "Add a full link, starting with https://" : err.message) : "Couldn't save it.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-dialog-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="note-dialog-title">{note ? `Edit ${NOTE_KINDS[kind].label.toLowerCase()}` : `New ${NOTE_KINDS[kind].label.toLowerCase()}`}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}

        {isOwner && (
          <div className="segmented kind-pick" role="radiogroup" aria-label="Kind">
            {(Object.keys(NOTE_KINDS) as NoteKind[]).map((k) => (
              <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
                {kind === k && <motion.span layoutId="note-kind" className="segmented-pill" />}
                <span>{NOTE_KINDS[k].label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <label htmlFor="nd-title">Title</label>
          <input id="nd-title" autoFocus required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={kind === "secret" ? "e.g. AWS console" : kind === "bookmark" ? "e.g. React docs" : kind === "plan" ? "e.g. Sprint 4 plan" : "e.g. Client call notes"} />
        </div>

        {(kind === "bookmark" || kind === "secret") && (
          <div className="field">
            <label htmlFor="nd-url">{kind === "bookmark" ? "Link" : "Website (optional)"}</label>
            <input id="nd-url" type="url" required={kind === "bookmark"} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
          </div>
        )}

        {kind === "secret" && (
          <div className="field-row field-row-2 even">
            <div className="field">
              <label htmlFor="nd-user">Username or email</label>
              <input id="nd-user" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="nd-secret">Password or key</label>
              <input id="nd-secret" type="password" autoComplete="new-password" required={!note?.hasSecret} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={note?.hasSecret ? "Leave blank to keep it" : ""} />
            </div>
          </div>
        )}
        {kind === "secret" && <p className="muted-small secure-note"><Lock size={13} /> Encrypted before it's saved. Each reveal or copy is logged.</p>}

        <div className="field">
          <label htmlFor="nd-body">{kind === "plan" ? "Plan" : kind === "note" ? "Note" : "Notes (optional)"}</label>
          <textarea id="nd-body" rows={kind === "plan" || kind === "note" ? 7 : 3} maxLength={20000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={kind === "plan" ? "Goals, steps, owners, dates…" : ""} />
        </div>

        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="nd-tags">Tags</label>
            <input id="nd-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="client, sprint-4" />
          </div>
          <label className="check-field">
            <input type="checkbox" checked={form.important} onChange={(e) => setForm({ ...form, important: e.target.checked })} />
            <span>Important (pinned to the top)</span>
          </label>
        </div>

        {isOwner && (
          <div className="field">
            <label htmlFor="nd-share">Share with</label>
            <PeoplePicker id="nd-share" people={people} value={shares} onChange={setShares} exclude={[meId]} editToggle placeholder="Only you can see it until you share it" />
            {shares.length > 0 && <p className="muted-small">Tap the pencil on someone to let them edit too.</p>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || !form.title.trim()}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
