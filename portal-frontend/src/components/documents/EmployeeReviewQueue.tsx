import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileCheck2, Inbox, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { AnimatedNumber } from "../AnimatedNumber";
import { useToast } from "../Toast";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import { fetchReviewQueue, reviewEmployeeDoc, type DocCounts, type EmployeeDocStatus, type QueueDocument } from "../../lib/employeeDocs";
import { EmployeeDocRow } from "./EmployeeDocRow";
import "../../styles/employee-docs.css";

/** Managers, HR and admins check the documents employees and interns upload. */
export function EmployeeReviewQueue({ tabs }: { tabs?: ReactNode }) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const isManager = user?.role === "manager";
  const [status, setStatus] = useState<EmployeeDocStatus>("uploaded");
  const [docs, setDocs] = useState<QueueDocument[] | null>(null);
  const [counts, setCounts] = useState<DocCounts>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState<QueueDocument | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchReviewQueue(status, accessToken);
      setDocs(r.documents);
      setCounts(r.counts);
      setError(null);
    } catch {
      setError("Couldn't load documents.");
    }
  }, [accessToken, status]);
  useEffect(() => {
    setDocs(null);
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? []).filter((d) => !q || [d.documentType, d.description ?? "", d.employee.name, d.employee.businessId ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [docs, query]);

  /** Returns true when it went through, so the send-back dialog can close. */
  async function review(d: QueueDocument, approve: boolean, note?: string) {
    setBusy(d.id);
    try {
      await reviewEmployeeDoc(d.id, approve, note, accessToken);
      toast(approve ? `${d.documentType} verified` : `Sent back to ${d.employee.name}`);
      setDocs((list) => list?.filter((x) => x.id !== d.id) ?? list);
      const to = approve ? "verified" : "rejected";
      setCounts((c) => ({ ...c, uploaded: Math.max(0, (c.uploaded ?? 1) - 1), [to]: (c[to] ?? 0) + 1 }));
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work.", "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const chips: { id: EmployeeDocStatus; label: string; count: number }[] = [
    { id: "uploaded", label: "Waiting", count: counts.uploaded ?? 0 },
    { id: "verified", label: "Verified", count: counts.verified ?? 0 },
    { id: "rejected", label: "Sent back", count: counts.rejected ?? 0 },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Verify documents</h1>
          <p>
            {isManager ? "Documents from people on your team. " : "Documents from employees and interns. "}
            Verify them or send them back with a note; they get an email if something needs fixing.
          </p>
        </div>
      </div>
      {tabs}

      <div className="stat-grid">
        {[
          { label: "Waiting for review", value: counts.uploaded ?? 0, tone: "amber", icon: Inbox },
          { label: "Verified", value: counts.verified ?? 0, tone: "green", icon: ShieldCheck },
          { label: "Sent back", value: counts.rejected ?? 0, tone: "red", icon: RotateCcw },
        ].map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <s.icon size={20} className="stat-icon" />
            <div className="stat-value"><AnimatedNumber value={s.value} /></div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="board-toolbar">
        <div className="note-filters" role="tablist" aria-label="Status">
          {chips.map((t) => (
            <button key={t.id} role="tab" aria-selected={status === t.id} className={`phase-chip${status === t.id ? " on" : ""}`} onClick={() => setStatus(t.id)}>
              {t.label} <span className="tab-count">{t.count}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID or document" aria-label="Search documents" />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!docs && !error && <div className="doc-list">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>}
      {docs && visible.length === 0 && (
        <div className="empty-state">
          <FileCheck2 size={34} />
          <h3>{query.trim() ? "No matches" : status === "uploaded" ? "All caught up" : "Nothing here"}</h3>
          <p>
            {query.trim()
              ? "Try a different name or document."
              : status === "uploaded"
                ? isManager
                  ? "When someone on your team uploads a document, it shows up here."
                  : "New uploads from employees and interns show up here."
                : "Try another tab."}
          </p>
        </div>
      )}

      <div className="doc-list">
        <AnimatePresence>
          {visible.map((d, i) => (
            <EmployeeDocRow key={d.id} doc={d} index={i} staff>
              {d.status === "uploaded" &&
                (d.employee.userId === user?.id ? (
                  <span className="pill pill-slate" title="Someone else checks your own documents">Your own</span>
                ) : (
                  <>
                    <button className="btn btn-sm btn-secondary" disabled={busy === d.id} onClick={() => setSendingBack(d)}><RotateCcw size={14} /> Send back</button>
                    <button className="btn btn-sm" disabled={busy === d.id} onClick={() => review(d, true)}><Check size={14} /> Verify</button>
                  </>
                ))}
            </EmployeeDocRow>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {sendingBack && (
          <SendBackDialog
            doc={sendingBack}
            busy={busy === sendingBack.id}
            onClose={() => setSendingBack(null)}
            onSend={async (note) => {
              if (await review(sendingBack, false, note)) setSendingBack(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function SendBackDialog({ doc, busy, onClose, onSend }: { doc: QueueDocument; busy: boolean; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState("");
  const ok = note.trim().length >= 2;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ok && !busy) onSend(note.trim());
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal event-dialog edoc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edoc-back-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="edoc-back-title">Send back</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="edoc-subject">
          {doc.documentType} from {doc.employee.name}
        </p>
        <div className="field">
          <label htmlFor="edoc-note">What needs fixing?</label>
          <textarea
            id="edoc-note"
            required
            autoFocus
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The photo is blurry. Please upload a clear scan of both sides."
          />
          <p className="muted-small">{doc.employee.name.split(" ")[0]} sees this note and gets an email.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!ok || busy}>{busy ? "Sending…" : "Send back"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
