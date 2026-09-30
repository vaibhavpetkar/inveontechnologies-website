import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CheckCircle2, FileSignature, FileText, Mail, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDate } from "../../lib/people";
import { openPdf, type AppointmentLetter } from "../../lib/letters";
import { useToast } from "../Toast";
import { IssueLetterDialog } from "./IssueLetterDialog";

/** HR's and admins' view of someone's appointment letters in the People drawer. */
export function AppointmentLetterCard({ employeeId }: { employeeId: string }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [letters, setLetters] = useState<AppointmentLetter[] | null>(null);
  const [canIssue, setCanIssue] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<{ letters: AppointmentLetter[]; canIssue: boolean }>(`/api/v1/employees/${employeeId}/appointment-letters`, { accessToken }).catch(() => ({ letters: [], canIssue: false }));
    setLetters(r.letters);
    setCanIssue(r.canIssue);
  }, [employeeId, accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  const open = (path: string) => openPdf(path, accessToken).catch((err) => toast(err instanceof ApiError ? err.message : "Couldn't open it.", "error"));

  async function resend(letter: AppointmentLetter) {
    setBusy(true);
    try {
      const r = await apiFetch<{ to: string }>(`/api/v1/appointment-letters/${letter.id}/resend`, { method: "POST", accessToken });
      toast(`Sending it again to ${r.to}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't resend it.", "error");
    }
    setBusy(false);
  }

  const latest = letters?.[0];

  return (
    <div className="drawer-section letter-card">
      <h3><FileSignature size={15} /> Appointment letter</h3>
      {letters === null && <div className="skeleton" style={{ height: 40 }} />}
      {letters?.length === 0 && <p className="muted-small">No appointment letter yet.{canIssue ? "" : " An admin issues it."}</p>}
      {latest && (
        <div className="letter-line">
          <div>
            <strong>{latest.details.designation}</strong>
            <span className="muted-small">
              {latest.referenceNo} · v{latest.version} · issued {formatDate(latest.generatedAt)}
              {latest.issuedBy ? ` by ${latest.issuedBy}` : ""}
            </span>
            <span className="letter-states">
              {latest.emailedAt ? <span className="pill pill-blue"><Mail size={12} /> Emailed {formatDate(latest.emailedAt)}</span> : <span className="pill pill-slate">Not emailed yet</span>}
              {latest.acceptedAt ? <span className="pill pill-green"><CheckCircle2 size={12} /> Accepted {formatDate(latest.acceptedAt)}</span> : <span className="pill pill-amber">Waiting for acceptance</span>}
            </span>
            <span className="muted-small">{latest.policies.length} {latest.policies.length === 1 ? "policy" : "policies"} attached</span>
          </div>
          <div className="letter-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => open(`/api/v1/appointment-letters/${latest.id}/pdf`)}><FileText size={14} /> View PDF</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => resend(latest)}><Send size={14} /> Resend</button>
          </div>
        </div>
      )}
      {letters && letters.length > 1 && (
        <details className="letter-history">
          <summary className="muted-small">Earlier versions ({letters.length - 1})</summary>
          {letters.slice(1).map((l) => (
            <button key={l.id} className="link-button" onClick={() => open(`/api/v1/appointment-letters/${l.id}/pdf`)}>
              v{l.version} · {l.details.designation} · {formatDate(l.generatedAt)}
            </button>
          ))}
        </details>
      )}
      {canIssue && (
        <button className="btn btn-sm" onClick={() => setIssuing(true)}>
          <FileSignature size={14} /> {latest ? "Issue a new version" : "Issue appointment letter"}
        </button>
      )}
      <AnimatePresence>
        {issuing && (
          <IssueLetterDialog
            employeeId={employeeId}
            onClose={() => setIssuing(false)}
            onIssued={(to) => {
              setIssuing(false);
              toast(to ? `Letter issued. Emailing it with the policies to ${to}.` : "Letter issued");
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
