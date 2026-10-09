import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileCheck2, FilePlus2, FileText, Inbox, RotateCcw, Search, ShieldCheck, Upload, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { FileChip } from "../components/files/FileChip";
import { UploadButton } from "../components/files/UploadButton";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { timeAgo } from "../lib/tasks";
import { DOC_STATUS, type CandidateDocument } from "../lib/workspace";
import { MyEmployeeDocuments } from "../components/documents/MyEmployeeDocuments";
import { EmployeeReviewQueue } from "../components/documents/EmployeeReviewQueue";
import { SignatureCard } from "../components/signature/SignatureCard";
import "../styles/employee-docs.css";

/**
 * Candidates upload and track their application documents; interns and
 * employees upload their personal documents; staff check both.
 */
export default function Documents() {
  const { user } = useAuth();
  const role = user?.role;
  return (
    <DashboardShell wide>
      {role === "candidate" ? <MyDocuments /> : role === "intern" || role === "employee" ? <MyEmployeeDocuments /> : <StaffDocuments />}
    </DashboardShell>
  );
}

// ---------------- Staff: candidates and employees tabs ----------------

type StaffTab = "candidates" | "employees";

function StaffDocuments() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const tab: StaffTab = new URLSearchParams(search).get("tab") === "employees" ? "employees" : "candidates";
  const tabs = (
    <div className="seg-tabs docs-tabs" role="tablist" aria-label="Whose documents">
      {(
        [
          { key: "candidates", label: "Candidates" },
          { key: "employees", label: "Employees" },
        ] as const
      ).map((t) => (
        <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => navigate(t.key === "employees" ? "/documents?tab=employees" : "/documents", { replace: true })}>
          {t.label}
        </button>
      ))}
    </div>
  );
  return tab === "employees" ? <EmployeeReviewQueue tabs={tabs} /> : <ReviewQueue tabs={tabs} />;
}

// ---------------- Candidate ----------------

interface MyDocsResponse {
  documents: CandidateDocument[];
  applications: { id: string; title: string; status: string }[];
}

function MyDocuments() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<MyDocsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<MyDocsResponse>("/api/v1/me/documents", { accessToken }));
    } catch {
      setError("Couldn't load your documents.");
    }
  }, [accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(doc: CandidateDocument, fileUrl: string) {
    try {
      await apiFetch(`/api/v1/documents/${doc.id}/upload`, { method: "POST", body: { fileUrl }, accessToken });
      toast(`${doc.documentName} sent for checking`);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't attach that file.", "error");
    }
  }

  const docs = data?.documents ?? [];
  const todo = docs.filter((d) => d.status === "requested" || d.status === "rejected");
  const rest = docs.filter((d) => d.status === "uploaded" || d.status === "verified");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My documents</h1>
          <p>Upload what HR asks for, or send any certificate or ID yourself. You'll be told when each one is checked.</p>
        </div>
        {data && data.applications.length > 0 && (
          <div className="page-head-actions">
            <motion.button className="btn" whileTap={{ scale: 0.96 }} onClick={() => setSending(true)}>
              <FilePlus2 size={18} /> Send a document
            </motion.button>
          </div>
        )}
      </div>

      <SignatureCard />
      {data && docs.length > 0 && <DocStats docs={docs} />}
      {error && <div className="error-banner">{error}</div>}
      {!data && !error && <div className="doc-list">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>}

      {data && docs.length === 0 && (
        <div className="empty-state">
          <FileText size={34} />
          <h3>No documents yet</h3>
          <p>{data.applications.length ? "When HR asks for a document it shows up here. You can also send one yourself." : "Apply for an opening first, then your documents for it show up here."}</p>
        </div>
      )}

      {todo.length > 0 && (
        <section className="doc-section">
          <h2 className="section-title"><Upload size={18} /> To upload</h2>
          <div className="doc-list">
            <AnimatePresence>
              {todo.map((d, i) => (
                <DocRow key={d.id} doc={d} index={i}>
                  <UploadButton purpose="application_document" className="btn btn-sm" label={d.status === "rejected" ? "Upload again" : "Upload"} onUploaded={(f) => upload(d, f.url)} />
                </DocRow>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="doc-section">
          <h2 className="section-title"><FileCheck2 size={18} /> Sent</h2>
          <div className="doc-list">
            <AnimatePresence>
              {rest.map((d, i) => <DocRow key={d.id} doc={d} index={i} />)}
            </AnimatePresence>
          </div>
        </section>
      )}

      <AnimatePresence>
        {sending && data && (
          <SendDocumentDialog
            applications={data.applications}
            onClose={() => setSending(false)}
            onSent={() => {
              setSending(false);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function SendDocumentDialog({ applications, onClose, onSent }: { applications: MyDocsResponse["applications"]; onClose: () => void; onSent: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const [name, setName] = useState("");
  const [file, setFile] = useState<{ url: string; name: string; mimeType: string; sizeBytes: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/v1/me/documents", { method: "POST", body: { applicationId, documentName: name.trim(), fileUrl: file.url }, accessToken });
      toast("Sent to HR for checking");
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send it.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-doc-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="send-doc-title">Send a document</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="sd-app">For</label>
          <select id="sd-app" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sd-name">What it is</label>
          <input id="sd-name" required minLength={2} maxLength={200} list="sd-suggest" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Degree certificate" />
          <datalist id="sd-suggest">
            {["Aadhaar card", "PAN card", "Degree certificate", "Marksheet", "Experience letter", "Relieving letter", "Passport photo", "Bank passbook"].map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div className="field">
          <span className="field-label">File</span>
          {file ? (
            <FileChip file={file} onRemove={() => setFile(null)} />
          ) : (
            <UploadButton
              purpose="application_document"
              label="Choose file"
              onUploaded={(f) => {
                setFile(f);
                if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 200));
              }}
            />
          )}
          <p className="muted-small">PDF or image, up to 10 MB.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || !file || name.trim().length < 2 || !applicationId}>{saving ? "Sending…" : "Send for checking"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

// ---------------- HR / admin ----------------

type QueueStatus = "uploaded" | "requested" | "rejected" | "verified" | "all";

function ReviewQueue({ tabs: pageTabs }: { tabs?: ReactNode }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<QueueStatus>("uploaded");
  const [docs, setDocs] = useState<CandidateDocument[] | null>(null);
  const [counts, setCounts] = useState<Partial<Record<CandidateDocument["status"], number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ documents: CandidateDocument[]; counts: Partial<Record<CandidateDocument["status"], number>> }>(`/api/v1/documents/queue?status=${status}`, { accessToken });
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
    return (docs ?? []).filter((d) => !q || [d.documentName, d.candidate.name, d.candidate.email, d.opportunity.title].some((v) => v.toLowerCase().includes(q)));
  }, [docs, query]);

  async function review(d: CandidateDocument, approve: boolean) {
    const reason = approve ? undefined : window.prompt(`Why is ${d.documentName} being sent back? ${d.candidate.name} sees this.`)?.trim();
    if (!approve && reason === undefined) return;
    setBusy(d.id);
    try {
      await apiFetch(`/api/v1/documents/${d.id}/verify`, { method: "POST", body: { approve, note: reason || undefined }, accessToken });
      toast(approve ? `${d.documentName} accepted` : `Sent back to ${d.candidate.name}`);
      setDocs((list) => (status === "all" ? list?.map((x) => (x.id === d.id ? { ...x, status: approve ? "verified" : "rejected" } : x)) : list?.filter((x) => x.id !== d.id)) ?? list);
      setCounts((c) => ({ ...c, uploaded: Math.max(0, (c.uploaded ?? 1) - 1), [approve ? "verified" : "rejected"]: (c[approve ? "verified" : "rejected"] ?? 0) + 1 }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work.", "error");
    } finally {
      setBusy(null);
    }
  }

  const tabs: { id: QueueStatus; label: string; count?: number }[] = [
    { id: "uploaded", label: "To check", count: counts.uploaded ?? 0 },
    { id: "requested", label: "Waiting for upload", count: counts.requested ?? 0 },
    { id: "rejected", label: "Sent back", count: counts.rejected ?? 0 },
    { id: "verified", label: "Accepted", count: counts.verified ?? 0 },
    { id: "all", label: "All" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>Candidate documents to check. Accept them or send them back with a reason; the candidate is told either way.</p>
        </div>
      </div>
      {pageTabs}

      <div className="stat-grid">
        {[
          { label: "To check", value: counts.uploaded ?? 0, tone: "amber", icon: Inbox },
          { label: "Waiting for upload", value: counts.requested ?? 0, tone: "slate", icon: Upload },
          { label: "Sent back", value: counts.rejected ?? 0, tone: "red", icon: RotateCcw },
          { label: "Accepted", value: counts.verified ?? 0, tone: "green", icon: ShieldCheck },
        ].map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <s.icon size={20} className="stat-icon" />
            <div className="stat-value"><AnimatedNumber value={s.value} /></div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="board-toolbar">
        <div className="note-filters" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={status === t.id} className={`phase-chip${status === t.id ? " on" : ""}`} onClick={() => setStatus(t.id)}>
              {t.label} {t.count !== undefined && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, document or opening" aria-label="Search documents" />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!docs && !error && <div className="doc-list">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>}
      {docs && visible.length === 0 && (
        <div className="empty-state">
          <FileCheck2 size={34} />
          <h3>{status === "uploaded" ? "All caught up" : "Nothing here"}</h3>
          <p>{status === "uploaded" ? "New uploads from candidates show up here for you to check." : "Try another tab."}</p>
        </div>
      )}

      <div className="doc-list">
        <AnimatePresence>
          {visible.map((d, i) => (
            <DocRow key={d.id} doc={d} index={i} staff>
              {d.status === "uploaded" && (
                <>
                  <button className="btn btn-sm btn-secondary" disabled={busy === d.id} onClick={() => review(d, false)}><RotateCcw size={14} /> Send back</button>
                  <button className="btn btn-sm" disabled={busy === d.id} onClick={() => review(d, true)}><Check size={14} /> Accept</button>
                </>
              )}
            </DocRow>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------- Shared ----------------

function DocStats({ docs }: { docs: CandidateDocument[] }) {
  const accepted = docs.filter((d) => d.status === "verified").length;
  const checking = docs.filter((d) => d.status === "uploaded").length;
  return (
    <div className="doc-progress big" aria-label={`${accepted} of ${docs.length} documents accepted`}>
      <div className="doc-progress-bar">
        <motion.span className="good" initial={{ width: 0 }} animate={{ width: `${(accepted / docs.length) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
        <motion.span className="warn" initial={{ width: 0 }} animate={{ width: `${(checking / docs.length) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }} />
      </div>
      <span className="muted-small">{accepted} of {docs.length} accepted{checking ? ` · ${checking} being checked` : ""}</span>
    </div>
  );
}

function DocRow({ doc: d, index, staff = false, children }: { doc: CandidateDocument; index: number; staff?: boolean; children?: React.ReactNode }) {
  const meta = DOC_STATUS[d.status];
  return (
    <motion.div
      layout
      className={`doc-row status-${d.status}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ delay: Math.min(index, 12) * 0.03, type: "spring", stiffness: 340, damping: 30 }}
    >
      <span className={`doc-icon tone-${meta.tone}`}><FileText size={18} /></span>
      <div className="doc-main">
        <div className="doc-title">
          <strong>{d.documentName}</strong>
          <span className={`pill pill-${meta.tone}`}>{meta.label}</span>
          {d.documentType === "candidate_upload" && <span className="pill pill-blue">Sent by candidate</span>}
        </div>
        <span className="muted-small">
          {staff ? (
            <>
              <Link href={`/opportunities/${d.opportunity.id}?applicant=${d.applicationId}`}>{d.candidate.name}</Link> · {d.opportunity.title}
            </>
          ) : (
            d.opportunity.title
          )}{" "}
          · {timeAgo(d.updatedAt)}
        </span>
        {d.note && <span className={`doc-note${d.status === "rejected" ? " bad" : ""}`}>{d.note}</span>}
      </div>
      {d.fileUrl && <FileChip file={{ url: d.fileUrl, name: d.documentName }} />}
      {children && <div className="doc-actions">{children}</div>}
    </motion.div>
  );
}
