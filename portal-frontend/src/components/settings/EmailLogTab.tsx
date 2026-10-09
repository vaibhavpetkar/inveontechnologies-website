import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Inbox, Paperclip, RefreshCw, RotateCw, Search, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { EMAIL_KINDS, EMAIL_STATUS, fullTime, kindLabel, relativeTime, type EmailLogRow, type EmailStatus } from "../../lib/settings";
import { useToast } from "../Toast";
import { SendDocumentsDialog } from "./SendDocumentsDialog";

const PAGE = 50;
type StatusFilter = "all" | EmailStatus;

/** Every email the portal sent (or tried to), with filters, errors and "Send again". */
export function EmailLogTab() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [emails, setEmails] = useState<EmailLogRow[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const request = useRef(0);

  // Search as you type, a moment after the typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const url = useCallback(
    (before?: string) => {
      const p = new URLSearchParams({ limit: String(PAGE) });
      if (status !== "all") p.set("status", status);
      if (kind) p.set("kind", kind);
      if (q) p.set("q", q);
      if (before) p.set("before", before);
      return `/api/v1/email-log?${p}`;
    },
    [status, kind, q],
  );

  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    try {
      const r = await apiFetch<{ emails: EmailLogRow[]; nextBefore: string | null }>(url(), { accessToken });
      if (id !== request.current) return;
      setEmails(r.emails);
      setNextBefore(r.nextBefore);
      setError(null);
    } catch {
      if (id === request.current) setError("Couldn't load the email log.");
    } finally {
      if (id === request.current) setRefreshing(false);
    }
  }, [url, accessToken]);

  useEffect(() => {
    setEmails(null);
    load();
  }, [load]);

  async function loadMore() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const r = await apiFetch<{ emails: EmailLogRow[]; nextBefore: string | null }>(url(nextBefore), { accessToken });
      setEmails((list) => [...(list ?? []), ...r.emails.filter((e) => !list?.some((x) => x.id === e.id))]);
      setNextBefore(r.nextBefore);
    } catch {
      toast("Couldn't load more emails.", "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function resend(row: EmailLogRow) {
    setResending(row.id);
    try {
      const r = await apiFetch<{ emailQueued: boolean; to: string }>(`/api/v1/email-log/${row.id}/resend`, { method: "POST", accessToken });
      toast(`Sending again to ${r.to}. It shows up here in a moment.`);
      setTimeout(load, 2500);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send it again.", "error");
    } finally {
      setResending(null);
    }
  }

  const chips: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "sent", label: "Sent" },
    { id: "failed", label: "Failed" },
    { id: "logged", label: "Not sent" },
  ];

  return (
    <motion.div className="st-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="st-tab-head">
        <p className="st-lead">Every email the portal sent or tried to send, newest first. Open one to read it.</p>
        <div className="st-tab-head-actions">
          <button className="btn btn-secondary" onClick={load} disabled={refreshing} aria-label="Refresh the log">
            <RefreshCw size={16} className={refreshing ? "spin" : ""} /> <span className="st-hide-sm">Refresh</span>
          </button>
          <button className="btn" onClick={() => setSending(true)}><Send size={16} /> Send documents</button>
        </div>
      </div>

      <div className="board-toolbar st-log-toolbar">
        <div className="note-filters" role="tablist" aria-label="Status">
          {chips.map((c) => (
            <button key={c.id} role="tab" aria-selected={status === c.id} className={`phase-chip${status === c.id ? " on" : ""}`} onClick={() => setStatus(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <select className="st-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of email">
          <option value="">Every kind</option>
          {Object.entries(EMAIL_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search address or subject" aria-label="Search address or subject" />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!emails && !error && <div className="st-log">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}</div>}
      {emails && emails.length === 0 && (
        <div className="empty-state">
          <Inbox size={34} />
          <h3>No emails here</h3>
          <p>{status !== "all" || kind || q ? "Nothing matches these filters." : "Emails the portal sends show up here."}</p>
        </div>
      )}

      {emails && emails.length > 0 && (
        <div className="st-log" role="table" aria-label="Email log">
          <div className="st-log-row st-log-headrow" role="row">
            <span role="columnheader">Status</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">When</span>
            <span role="columnheader"><span className="st-sr-only">Actions</span></span>
          </div>
          {emails.map((row, i) => {
            const meta = EMAIL_STATUS[row.status];
            const open = openId === row.id;
            return (
              <motion.div key={row.id} className={`st-log-item status-${row.status}`} role="row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
                <div className="st-log-row">
                  <span role="cell" className="st-log-status"><span className={`pill pill-${meta.tone}`}>{meta.label}</span></span>
                  <span role="cell" className="st-log-main">
                    <button className="st-log-subject" aria-expanded={open} onClick={() => setOpenId(open ? null : row.id)}>
                      <strong>{row.subject}</strong>
                      <ChevronDown size={15} className={`chevron${open ? " open" : ""}`} />
                    </button>
                    <span className="muted-small st-ellipsis">To {row.toEmail}</span>
                    {row.attachments.length > 0 && (
                      <span className="st-attachments">
                        {row.attachments.map((a) => <span key={a} className="st-attachment" title={a}><Paperclip size={12} /> {a}</span>)}
                      </span>
                    )}
                    {row.status === "failed" && row.error && <span className="st-error-text">{row.error}</span>}
                  </span>
                  <span role="cell" className="st-log-kind"><span className="pill pill-slate">{kindLabel(row.kind)}</span></span>
                  <span role="cell" className="st-log-when muted-small" title={fullTime(row.createdAt)}>{relativeTime(row.createdAt)}</span>
                  <span role="cell" className="st-log-actions">
                    {row.canResend && (
                      <button className="btn btn-secondary btn-sm" disabled={resending === row.id} onClick={() => resend(row)}>
                        <RotateCw size={14} /> {resending === row.id ? "Sending…" : "Send again"}
                      </button>
                    )}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div className="st-log-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <div className="st-log-body-inner">
                        <span className="muted-small">{fullTime(row.createdAt)} · to {row.toEmail}</span>
                        {row.body ? <pre>{row.body}</pre> : <p className="muted-small">The text of this email wasn't kept (letters and offers are re-made from their record when sent again).</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {nextBefore && emails && (
        <div className="st-load-more">
          <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button>
        </div>
      )}

      <AnimatePresence>
        {sending && (
          <SendDocumentsDialog
            onClose={() => setSending(false)}
            onSent={() => {
              setSending(false);
              setTimeout(load, 2500);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
