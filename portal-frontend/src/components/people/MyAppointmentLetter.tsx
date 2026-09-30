import { useCallback, useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Download, FileSignature, ScrollText } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDate } from "../../lib/people";
import { openPdf, type AppointmentLetter } from "../../lib/letters";
import { useToast } from "../Toast";

/** The joiner's own appointment letter: read it, read the policies, accept it. */
export function MyAppointmentLetter({ employeeId, onAccepted }: { employeeId: string; onAccepted: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [letter, setLetter] = useState<AppointmentLetter | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<{ letters: AppointmentLetter[] }>(`/api/v1/employees/${employeeId}/appointment-letters`, { accessToken }).catch(() => ({ letters: [] }));
    setLetter(r.letters[0] ?? null);
  }, [employeeId, accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  if (!letter) return null;
  const open = (path: string) => openPdf(path, accessToken).catch((err) => toast(err instanceof ApiError ? err.message : "Couldn't open it.", "error"));

  async function accept(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/v1/appointment-letters/${letter!.id}/accept`, { method: "POST", body: { fullName: name.trim() }, accessToken });
      toast("Letter accepted. Welcome aboard!");
      await load();
      onAccepted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't accept it.", "error");
    }
    setBusy(false);
  }

  return (
    <motion.section className="panel my-letter" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="panel-head">
        <h2><FileSignature size={18} /> Your appointment letter</h2>
        {letter.acceptedAt ? <span className="pill pill-green"><CheckCircle2 size={12} /> Accepted</span> : <span className="pill pill-amber">Please accept</span>}
      </div>
      <p className="my-letter-role"><strong>{letter.details.designation}</strong> · {letter.details.department}</p>
      <p className="muted-small">
        {letter.referenceNo} · issued {formatDate(letter.generatedAt)} · joining {formatDate(letter.details.joiningDate)}
        {letter.details.endDate ? ` to ${formatDate(letter.details.endDate)}` : ""}
      </p>
      <button className="btn btn-secondary btn-sm" onClick={() => open(`/api/v1/appointment-letters/${letter.id}/pdf`)}><Download size={14} /> Read the letter (PDF)</button>

      {letter.policies.length > 0 && (
        <div className="my-letter-policies">
          <span className="muted-small">Policies that come with it</span>
          <ul>
            {letter.policies.map((p) => (
              <li key={p.slug}>
                <button className="link-button" onClick={() => open(`/api/v1/appointment-letters/${letter.id}/policies/${p.slug}/pdf`)}><ScrollText size={14} /> {p.title}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {letter.acceptedAt ? (
        <p className="muted-small">You accepted this letter on {formatDate(letter.acceptedAt)} as "{letter.acceptedName}".</p>
      ) : (
        <form className="accept-form" onSubmit={accept}>
          <div className="field">
            <label htmlFor="accept-name">Type your full name to sign</label>
            <input id="accept-name" required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder={letter.details.name} />
          </div>
          <label className="check-line">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I have read the letter and the policies above, and I accept the terms.
          </label>
          <button className="btn" disabled={busy || !agree || name.trim().length < 2}>{busy ? "Accepting…" : "Accept and sign"}</button>
        </form>
      )}
    </motion.section>
  );
}
