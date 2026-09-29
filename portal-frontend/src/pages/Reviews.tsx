import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Github, Inbox, MessageSquareWarning, Users, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { formatDate } from "../lib/people";
import { LEVEL_LABEL, type SubmissionStatus } from "../lib/internships";
import { useToast } from "../components/Toast";

interface QueueItem {
  id: string;
  status: SubmissionStatus;
  repoUrl: string | null;
  linkUrl: string | null;
  notes: string | null;
  attempt: number;
  marks: number | null;
  feedback: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  title: string;
  brief: string;
  steps: string[];
  skillLabel: string;
  level: "basic" | "intermediate" | "advanced";
  maxMarks: number;
  trackTitle: string;
  name: string;
  email: string;
}

interface InternRow {
  enrollmentId: string;
  name: string;
  email: string;
  track: { slug: string; title: string };
  joinedAt: string;
  total: number;
  approved: number;
  waiting: number;
  changes: number;
  marks: number;
  maxMarks: number;
}

type Tab = "submitted" | "changes_requested" | "approved" | "interns";

/** Mentors' queue: review assignment submissions, approve with marks or ask for changes. */
export default function Reviews() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("submitted");
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [interns, setInterns] = useState<InternRow[] | null>(null);
  const [counts, setCounts] = useState({ submitted: 0, changes: 0, approved: 0 });
  const [active, setActive] = useState<QueueItem | null>(null);
  const [marks, setMarks] = useState<number | "">("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (tab === "interns") {
      const r = await apiFetch<{ interns: InternRow[] }>("/api/v1/internships/reviews/interns", { accessToken }).catch(() => ({ interns: [] }));
      setInterns(r.interns);
      return;
    }
    const r = await apiFetch<{ submissions: QueueItem[]; counts: typeof counts }>(`/api/v1/internships/reviews/queue?status=${tab}`, { accessToken }).catch(() => ({ submissions: [], counts }));
    setItems(r.submissions);
    setCounts(r.counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, accessToken]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  function openItem(item: QueueItem) {
    setActive(item);
    setMarks(item.marks ?? "");
    setFeedback("");
  }

  async function decide(e: FormEvent, decision: "approve" | "changes") {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/internships/submissions/${active.id}/review`, { method: "POST", accessToken, body: { decision, marks: decision === "approve" ? Number(marks) : null, feedback: feedback.trim() || null } });
      toast(decision === "approve" ? `Approved with ${marks}/${active.maxMarks}` : "Sent back with your notes");
      setActive(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the review.", "error");
    }
    setBusy(false);
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "submitted", label: "To review", count: counts.submitted },
    { key: "changes_requested", label: "Changes requested", count: counts.changes },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "interns", label: "Interns" },
  ];

  return (
    <DashboardShell>
      <div className="page-head">
        <div>
          <h1>Assignment reviews</h1>
          <p>Approve interns' assignments with marks, or send them back with what to change.</p>
        </div>
      </div>
      <div className="segmented review-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab !== "interns" && (
        <>
          {items === null && <div className="skeleton" style={{ height: 160 }} />}
          {items?.length === 0 && (
            <div className="panel empty-state">
              <Inbox size={26} />
              <p>{tab === "submitted" ? "Nothing waiting for review. Nice." : "Nothing here yet."}</p>
            </div>
          )}
          <ul className="review-list">
            {items?.map((it, i) => (
              <motion.li key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <button className="review-row" onClick={() => openItem(it)}>
                  <Avatar email={it.email} name={it.name} size={38} />
                  <span className="review-main">
                    <strong>{it.title}</strong>
                    <span className="muted-small">{it.name} · {it.trackTitle} · {it.skillLabel}</span>
                  </span>
                  <span className="review-side">
                    {it.status === "approved" ? <span className="pill pill-green">{it.marks}/{it.maxMarks}</span> : it.attempt > 1 ? <span className="pill pill-violet">Attempt {it.attempt}</span> : null}
                    <span className="muted-small">{formatDate(it.reviewedAt ?? it.submittedAt)}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      {tab === "interns" && (
        <>
          {interns === null && <div className="skeleton" style={{ height: 160 }} />}
          {interns?.length === 0 && <div className="panel empty-state"><Users size={26} /><p>No interns on a track yet.</p></div>}
          {interns && interns.length > 0 && (
            <div className="panel table-wrap">
              <table className="data-table intern-table">
                <thead><tr><th>Intern</th><th>Track</th><th>Progress</th><th>Marks</th><th>Waiting</th></tr></thead>
                <tbody>
                  {interns.map((r) => (
                    <tr key={r.enrollmentId}>
                      <td><strong>{r.name}</strong><div className="muted-small">{r.email}</div></td>
                      <td>{r.track.title}<div className="muted-small">joined {formatDate(r.joinedAt)}</div></td>
                      <td>
                        <div className="mini-progress"><div style={{ width: `${r.total ? (r.approved / r.total) * 100 : 0}%` }} /></div>
                        <span className="muted-small">{r.approved}/{r.total} approved</span>
                      </td>
                      <td>{r.marks}/{r.maxMarks}</td>
                      <td>{r.waiting}{r.changes ? <span className="muted-small"> · {r.changes} to fix</span> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {active && (
          <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setActive(null)}>
            <motion.form className="modal modal-wide review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onSubmit={(e) => decide(e, "approve")} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
              <div className="modal-head">
                <div>
                  <h2 id="review-title">{active.title}</h2>
                  <p className="muted-small">{active.name} · {active.trackTitle} · {active.skillLabel} · {LEVEL_LABEL[active.level]} · attempt {active.attempt}</p>
                </div>
                <button type="button" className="icon-button" aria-label="Close" onClick={() => setActive(null)}><X size={18} /></button>
              </div>
              <p>{active.brief}</p>
              <ul className="assignment-steps">{active.steps.map((s) => <li key={s}>{s}</li>)}</ul>
              <div className="submission-box">
                <p className="submission-links">
                  {active.repoUrl && <a href={active.repoUrl} target="_blank" rel="noopener noreferrer"><Github size={14} /> {active.repoUrl.replace(/^https?:\/\//, "")}</a>}
                  {active.linkUrl && <a href={active.linkUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> {active.linkUrl.replace(/^https?:\/\//, "")}</a>}
                </p>
                {active.notes && <p className="submission-notes">{active.notes}</p>}
              </div>
              {active.status === "submitted" ? (
                <>
                  <div className="field">
                    <label htmlFor="rv-marks">Marks (out of {active.maxMarks})</label>
                    <div className="marks-picker">
                      {Array.from({ length: active.maxMarks + 1 }, (_, n) => n).filter((n) => n >= Math.floor(active.maxMarks / 2)).map((n) => (
                        <button type="button" key={n} className={marks === n ? "active" : ""} onClick={() => setMarks(n)}>{n}</button>
                      ))}
                      <input id="rv-marks" type="number" min={0} max={active.maxMarks} value={marks} onChange={(e) => setMarks(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Marks" />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="rv-feedback">Feedback</label>
                    <textarea id="rv-feedback" rows={3} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, and what to change (required when sending it back)" />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" disabled={busy || feedback.trim().length < 5} onClick={(e) => decide(e, "changes")}><MessageSquareWarning size={16} /> Request changes</button>
                    <button className="btn" disabled={busy || marks === ""}><CheckCircle2 size={16} /> Approve{marks !== "" ? ` with ${marks}/${active.maxMarks}` : ""}</button>
                  </div>
                </>
              ) : (
                <div className={`review-note tone-${active.status === "approved" ? "green" : "amber"}`}>
                  <strong>{active.status === "approved" ? `Approved ${active.marks}/${active.maxMarks}` : "Changes requested"}{active.reviewedBy ? ` by ${active.reviewedBy}` : ""}</strong>
                  {active.feedback && <p>{active.feedback}</p>}
                </div>
              )}
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
