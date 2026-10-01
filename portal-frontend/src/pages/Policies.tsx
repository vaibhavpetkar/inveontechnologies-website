import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, Pencil, Plus, ScrollText, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { formatDate } from "../lib/people";
import { ISSUER_ROLES, openPdf, policySections, type Policy } from "../lib/letters";
import { useToast } from "../components/Toast";

type Draft = { id?: string; title: string; summary: string; body: string };

/** Company policies: everyone reads them; admins edit, add and retire them. */
export default function Policies() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const isAdmin = !!user && ISSUER_ROLES.includes(user.role);
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<{ policies: Policy[] }>(`/api/v1/policies${isAdmin ? "?all=1" : ""}`, { accessToken }).catch(() => ({ policies: [] }));
    setPolicies(r.policies);
  }, [accessToken, isAdmin]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      const body = { title: draft.title, summary: draft.summary, body: draft.body };
      if (draft.id) await apiFetch(`/api/v1/policies/${draft.id}`, { method: "PUT", body, accessToken });
      else await apiFetch(`/api/v1/policies`, { method: "POST", body, accessToken });
      toast(draft.id ? "Policy saved" : "Policy added");
      setDraft(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save it.", "error");
    }
    setBusy(false);
  }

  async function setActive(p: Policy, active: boolean) {
    try {
      await apiFetch(`/api/v1/policies/${p.id}`, { method: "PUT", body: { active }, accessToken });
      toast(active ? "Policy is back in use" : "Policy retired; new letters won't include it");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change it.", "error");
    }
  }

  return (
    <DashboardShell>
      <div className="page-head">
        <div>
          <h1>Company policies</h1>
          <p>{isAdmin ? "Every appointment letter attaches the policies in use here. Editing the wording creates a new version; letters already sent keep theirs." : "The policies that apply to everyone at Inveon."}</p>
        </div>
        {isAdmin && <button className="btn" onClick={() => setDraft({ title: "", summary: "", body: "" })}><Plus size={16} /> Add policy</button>}
      </div>

      {policies === null && <div className="skeleton" style={{ height: 200 }} />}
      <div className="policy-list">
        {policies?.map((p, i) => {
          const expanded = openId === p.id;
          return (
            <motion.article key={p.id} className={`panel policy-card${p.active ? "" : " retired"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <button className="policy-head" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : p.id)}>
                <span className="policy-icon"><ScrollText size={18} /></span>
                <span className="policy-title">
                  <strong>{p.title}</strong>
                  <span className="muted-small">{p.summary}</span>
                </span>
                <span className="policy-meta">
                  {!p.active && <span className="pill pill-slate">Retired</span>}
                  <span className="muted-small">v{p.version} · {formatDate(p.updatedAt)}</span>
                </span>
                <ChevronDown size={18} className={`chevron${expanded ? " open" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div className="policy-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <div className="policy-prose">
                      {policySections(p.body).map((s, j) =>
                        s.kind === "h" ? <h3 key={j}>{s.text}</h3> : s.kind === "p" ? <p key={j}>{s.text}</p> : <ul key={j}>{s.items.map((it, k) => <li key={k}>{it}</li>)}</ul>,
                      )}
                    </div>
                    <div className="policy-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openPdf(`/api/v1/policies/${p.id}/pdf`, accessToken).catch(() => toast("Couldn't open the PDF.", "error"))}><Download size={14} /> PDF</button>
                      {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setDraft({ id: p.id, title: p.title, summary: p.summary, body: p.body })}><Pencil size={14} /> Edit</button>}
                      {isAdmin && <button className="link-button" onClick={() => setActive(p, !p.active)}>{p.active ? "Retire" : "Use again"}</button>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          );
        })}
      </div>

      <AnimatePresence>
        {draft && (
          <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setDraft(null)}>
            <motion.form className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="policy-edit-title" onSubmit={save} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
              <div className="modal-head">
                <h2 id="policy-edit-title">{draft.id ? "Edit policy" : "New policy"}</h2>
                <button type="button" className="icon-button" aria-label="Close" onClick={() => setDraft(null)}><X size={18} /></button>
              </div>
              <div className="field"><label htmlFor="pol-title">Title</label><input id="pol-title" required minLength={3} maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="field"><label htmlFor="pol-summary">One-line summary</label><input id="pol-summary" required minLength={3} maxLength={500} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></div>
              <div className="field">
                <label htmlFor="pol-body">Policy text</label>
                <textarea id="pol-body" required minLength={20} rows={16} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <span className="muted-small">Start a line with "## " for a heading and "- " for a bullet. Leave a blank line between paragraphs.</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
                <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save policy"}</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
