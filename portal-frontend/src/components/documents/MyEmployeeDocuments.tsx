import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileCheck2, FilePlus2, FileText, Info, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { FileChip } from "../files/FileChip";
import { UploadButton } from "../files/UploadButton";
import { useToast } from "../Toast";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import type { StoredFile } from "../../lib/files";
import { EMP_DOC_TYPES, OTHER_TYPE, addEmployeeDoc, fetchEmployeeDocs, fetchMyEmployeeId, removeEmployeeDoc, type EmployeeDocument } from "../../lib/employeeDocs";
import { EmployeeDocRow } from "./EmployeeDocRow";
import "../../styles/employee-docs.css";

/** Interns and employees: upload ID, certificates and bank details for their manager and HR to check. */
export function MyEmployeeDocuments() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [docs, setDocs] = useState<EmployeeDocument[] | null>(null);
  const [noRecord, setNoRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ replacing?: EmployeeDocument } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const id = idRef.current ?? (await fetchMyEmployeeId(accessToken));
      idRef.current = id;
      setEmployeeId(id);
      setDocs(await fetchEmployeeDocs(id, accessToken));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNoRecord(true);
      else setError("Couldn't load your documents. Try refreshing the page.");
    }
  }, [accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(d: EmployeeDocument) {
    if (!window.confirm(`Remove "${d.documentType}"? You can upload it again later.`)) return;
    setBusy(d.id);
    try {
      await removeEmployeeDoc(d.id, accessToken);
      setDocs((list) => list?.filter((x) => x.id !== d.id) ?? list);
      toast(`${d.documentType} removed`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove it.", "error");
    } finally {
      setBusy(null);
    }
  }

  const list = docs ?? [];
  const fix = list.filter((d) => d.status === "rejected");
  const rest = list.filter((d) => d.status !== "rejected");
  const ready = !!employeeId && !noRecord;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My documents</h1>
          <p>Upload your ID, certificates and bank details here. Your manager and HR check each one.</p>
        </div>
        {ready && (
          <div className="page-head-actions">
            <motion.button className="btn" whileTap={{ scale: 0.96 }} onClick={() => setDialog({})}>
              <FilePlus2 size={18} /> Upload a document
            </motion.button>
          </div>
        )}
      </div>

      {list.length > 0 && <Progress docs={list} />}
      {error && <div className="error-banner">{error}</div>}
      {!docs && !error && !noRecord && <div className="doc-list">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>}

      {noRecord && (
        <div className="empty-state">
          <FileText size={34} />
          <h3>Your employee record isn't set up yet</h3>
          <p>Once HR finishes setting you up, you can upload your documents here. If that seems wrong, let HR know.</p>
        </div>
      )}

      {docs && list.length === 0 && (
        <div className="empty-state">
          <FileText size={34} />
          <h3>No documents yet</h3>
          <p>Start with your Aadhaar card, PAN card and bank details. Your manager and HR check them for you.</p>
          <button className="btn" style={{ marginTop: "0.6rem" }} onClick={() => setDialog({})}>
            <Upload size={16} /> Upload a document
          </button>
        </div>
      )}

      {fix.length > 0 && (
        <section className="doc-section">
          <h2 className="section-title"><RotateCcw size={18} /> Needs a fix</h2>
          <div className="doc-list">
            <AnimatePresence>
              {fix.map((d, i) => (
                <EmployeeDocRow key={d.id} doc={d} index={i}>
                  <button className="btn btn-sm btn-secondary" disabled={busy === d.id} onClick={() => remove(d)}><Trash2 size={14} /> Remove</button>
                  <button className="btn btn-sm" disabled={busy === d.id} onClick={() => setDialog({ replacing: d })}><Upload size={14} /> Upload again</button>
                </EmployeeDocRow>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="doc-section">
          <h2 className="section-title"><FileCheck2 size={18} /> Uploaded</h2>
          <div className="doc-list">
            <AnimatePresence>
              {rest.map((d, i) => (
                <EmployeeDocRow key={d.id} doc={d} index={i}>
                  {d.status === "uploaded" && (
                    <button className="btn btn-sm btn-secondary" disabled={busy === d.id} onClick={() => remove(d)}><Trash2 size={14} /> Remove</button>
                  )}
                </EmployeeDocRow>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <AnimatePresence>
        {dialog && employeeId && (
          <UploadDialog
            employeeId={employeeId}
            replacing={dialog.replacing}
            onClose={() => setDialog(null)}
            onDone={() => {
              setDialog(null);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Progress({ docs }: { docs: EmployeeDocument[] }) {
  const verified = docs.filter((d) => d.status === "verified").length;
  const waiting = docs.filter((d) => d.status === "uploaded").length;
  const fix = docs.length - verified - waiting;
  return (
    <div className="doc-progress big" aria-label={`${verified} of ${docs.length} documents verified`}>
      <div className="doc-progress-bar">
        <motion.span className="good" initial={{ width: 0 }} animate={{ width: `${(verified / docs.length) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
        <motion.span className="warn" initial={{ width: 0 }} animate={{ width: `${(waiting / docs.length) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }} />
      </div>
      <span className="muted-small">
        {verified} of {docs.length} verified{waiting ? ` · ${waiting} waiting for review` : ""}{fix ? ` · ${fix} need${fix === 1 ? "s" : ""} a fix` : ""}
      </span>
    </div>
  );
}

function UploadDialog({ employeeId, replacing, onClose, onDone }: { employeeId: string; replacing?: EmployeeDocument; onClose: () => void; onDone: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const known = replacing && EMP_DOC_TYPES.includes(replacing.documentType);
  const [type, setType] = useState(replacing ? (known ? replacing.documentType : OTHER_TYPE) : "");
  const [otherName, setOtherName] = useState(replacing && !known ? replacing.documentType : "");
  const [description, setDescription] = useState(replacing?.description ?? "");
  const [file, setFile] = useState<StoredFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const documentType = (type === OTHER_TYPE ? otherName : type).trim();
  const canSend = !!file && documentType.length >= 2 && !saving;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !canSend) return;
    setSaving(true);
    setError(null);
    try {
      await addEmployeeDoc(employeeId, { documentType, fileUrl: file.url, description: description.trim() || undefined }, accessToken);
      // The new upload takes the place of the one that was sent back.
      if (replacing) await removeEmployeeDoc(replacing.id, accessToken).catch(() => undefined);
      toast(`${documentType} sent for review`);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send it. Try again.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal event-dialog edoc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edoc-upload-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="edoc-upload-title">{replacing ? "Upload again" : "Upload a document"}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="edoc-hint">
          <Info size={15} />
          <span>Your manager and HR check it. If anything needs fixing, you'll get an email.{replacing ? " This replaces the one that was sent back." : ""}</span>
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="edoc-type">Document type</label>
          <select id="edoc-type" required value={type} onChange={(e) => setType(e.target.value)}>
            <option value="" disabled>Choose one</option>
            {EMP_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {type === OTHER_TYPE && (
          <div className="field">
            <label htmlFor="edoc-other">What is it?</label>
            <input id="edoc-other" required minLength={2} maxLength={200} value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="e.g. Relieving letter" autoFocus />
          </div>
        )}
        <div className="field">
          <label htmlFor="edoc-desc">Description <span className="muted-small">(optional)</span></label>
          <textarea id="edoc-desc" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. New bank account from this month" />
        </div>
        <div className="field">
          <span className="field-label">File</span>
          {file ? (
            <FileChip file={file} onRemove={() => setFile(null)} />
          ) : (
            <UploadButton purpose="employee_document" label="Choose file" onUploaded={setFile} />
          )}
          <p className="muted-small">PDF, Word or image, up to 10 MB.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!canSend}>{saving ? "Sending…" : "Send for review"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
