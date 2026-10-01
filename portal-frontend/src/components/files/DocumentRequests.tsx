import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Check, FilePlus2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { DocumentRequest } from "../../lib/journey";
import { useToast } from "../Toast";
import { FileChip } from "./FileChip";
import { UploadButton } from "./UploadButton";

const STATUS: Record<DocumentRequest["status"], { label: string; tone: string }> = {
  requested: { label: "Waiting", tone: "" },
  uploaded: { label: "To check", tone: "warn" },
  verified: { label: "Accepted", tone: "good" },
  rejected: { label: "Sent back", tone: "bad" },
};

interface Props {
  applicationId: string;
  documents: DocumentRequest[];
  /** Staff ask for documents and accept them; the candidate uploads. */
  mode: "staff" | "candidate";
  onChanged: () => void;
}

/**
 * Documents a candidate owes: the ones the joining form asks for (Aadhaar,
 * PAN, marksheet or passing certificate, experience letters) plus any staff
 * ask for by hand. The candidate uploads; staff accept or send back.
 */
export function DocumentRequests({ applicationId, documents, mode, onChanged }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  function ask(e: FormEvent) {
    e.preventDefault();
    run("ask", () => apiFetch(`/api/v1/applications/${applicationId}/documents`, { method: "POST", body: { documentName: name.trim(), note: note.trim() || undefined }, accessToken }), "Request sent").then(() => {
      setName("");
      setNote("");
      setAsking(false);
    });
  }

  function review(doc: DocumentRequest, approve: boolean) {
    const reason = approve ? undefined : window.prompt(`Why is ${doc.documentName} being sent back? The candidate sees this.`)?.trim();
    if (!approve && reason === undefined) return;
    run(doc.id, () => apiFetch(`/api/v1/documents/${doc.id}/verify`, { method: "POST", body: { approve, note: reason || undefined }, accessToken }), approve ? "Document accepted" : "Sent back to the candidate");
  }

  if (mode === "candidate" && documents.length === 0) return null;
  const accepted = documents.filter((d) => d.status === "verified").length;
  const toCheck = documents.filter((d) => d.status === "uploaded").length;

  return (
    <div className="doc-requests">
      {documents.length > 0 && (
        <div className="doc-progress" aria-label={`${accepted} of ${documents.length} documents accepted`}>
          <div className="doc-progress-bar">
            <motion.span className="good" initial={{ width: 0 }} animate={{ width: `${(accepted / documents.length) * 100}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
            <motion.span className="warn" initial={{ width: 0 }} animate={{ width: `${(toCheck / documents.length) * 100}%` }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }} />
          </div>
          <span className="muted-small">{accepted} of {documents.length} accepted{toCheck > 0 ? ` · ${toCheck} ${mode === "staff" ? "to check" : "being checked"}` : ""}</span>
        </div>
      )}
      {documents.length === 0 ? (
        <p className="muted-small">No documents requested.</p>
      ) : (
        <ul className="doc-list">
          {documents.map((d, i) => {
            const needsUpload = mode === "candidate" && (d.status === "requested" || d.status === "rejected");
            return (
              <motion.li key={d.id} className={`doc-${d.status}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                <div className="doc-head">
                  <strong>{d.documentName}</strong>
                  <span className={`score-pill ${STATUS[d.status].tone}`}>{mode === "candidate" && d.status === "uploaded" ? "Being checked" : STATUS[d.status].label}</span>
                </div>
                {d.note && <p className="muted-small doc-note">{d.note}</p>}
                <div className="file-row">
                  {d.file && d.status !== "rejected" && <FileChip file={d.file} />}
                  {needsUpload && (
                    <UploadButton
                      purpose="application_document"
                      className={d.status === "rejected" ? "btn btn-sm" : "btn btn-secondary btn-sm"}
                      label={d.status === "rejected" ? "Upload again" : "Upload"}
                      onUploaded={(file) => run(d.id, () => apiFetch(`/api/v1/documents/${d.id}/upload`, { method: "POST", body: { fileUrl: file.url }, accessToken }), `${d.documentName} uploaded`)}
                    />
                  )}
                  {mode === "staff" && d.status === "uploaded" && (
                    <>
                      <button type="button" className="btn btn-sm" disabled={busy === d.id} onClick={() => review(d, true)}><Check size={14} /> Accept</button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy === d.id} onClick={() => review(d, false)}><X size={14} /> Send back</button>
                    </>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
      {mode === "staff" &&
        (asking ? (
          <form className="doc-ask" onSubmit={ask}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document, e.g. ID proof" aria-label="Document name" required minLength={2} autoFocus />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the candidate (optional)" aria-label="Note" />
            <div className="file-row">
              <button className="btn btn-sm" disabled={busy === "ask" || name.trim().length < 2}>Send request</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}><FilePlus2 size={15} /> Ask for a document</button>
        ))}
    </div>
  );
}
