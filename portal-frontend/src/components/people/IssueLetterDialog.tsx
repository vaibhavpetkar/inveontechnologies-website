import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Mail, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName } from "../../lib/nav";
import type { AppointmentDetails } from "../../lib/letters";

interface Props {
  employeeId: string;
  onClose: () => void;
  onIssued: (emailedTo: string | null) => void;
}

type PolicyChoice = { id: string; title: string; summary: string; version: number };

/** Admin form: terms prefilled from the person's record, policies to attach, then issue and email. */
export function IssueLetterDialog({ employeeId, onClose, onIssued }: Props) {
  const { user, accessToken } = useAuth();
  const [form, setForm] = useState<AppointmentDetails | null>(null);
  const [policies, setPolicies] = useState<PolicyChoice[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [signatory, setSignatory] = useState({ name: user ? displayName(user.email) : "", title: "Director" });
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ defaults: AppointmentDetails; policies: PolicyChoice[] }>(`/api/v1/employees/${employeeId}/appointment-defaults`, { accessToken })
      .then((r) => {
        setForm(r.defaults);
        setPolicies(r.policies);
        setPicked(new Set(r.policies.map((p) => p.id)));
      })
      .catch(() => setError("Couldn't load this person's details."));
  }, [employeeId, accessToken]);

  const set = (patch: Partial<AppointmentDetails>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const intern = form?.employeeType === "intern";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/employees/${employeeId}/appointment-letter`, {
        method: "POST",
        accessToken,
        body: {
          designation: form.designation,
          department: form.department,
          joiningDate: form.joiningDate,
          durationMonths: form.durationMonths || null,
          reportingTo: form.reportingTo || null,
          workLocation: form.workLocation,
          workHours: form.workHours,
          monthlyPay: form.monthlyPay ?? null,
          probationMonths: intern ? null : form.probationMonths || null,
          noticeDays: form.noticeDays,
          additionalTerms: form.additionalTerms || null,
          signatoryName: signatory.name,
          signatoryTitle: signatory.title,
          policyIds: [...picked],
          sendEmail,
        },
      });
      onIssued(sendEmail ? form.email : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't issue the letter.");
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal modal-wide letter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="letter-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="letter-title">Appointment letter{form ? ` for ${form.name}` : ""}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {!form && !error && <div className="skeleton" style={{ height: 240 }} />}
        {form && (
          <>
            <div className="field-row field-row-2">
              <div className="field"><label htmlFor="al-desig">Designation</label><input id="al-desig" required minLength={2} value={form.designation} onChange={(e) => set({ designation: e.target.value })} /></div>
              <div className="field"><label htmlFor="al-dept">Department</label><input id="al-dept" required minLength={2} value={form.department} onChange={(e) => set({ department: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label htmlFor="al-join">Joining date</label><input id="al-join" type="date" required value={form.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} /></div>
              <div className="field"><label htmlFor="al-dur">Duration (months)</label><input id="al-dur" type="number" min={1} max={60} placeholder={intern ? "6" : "Permanent"} value={form.durationMonths ?? ""} onChange={(e) => set({ durationMonths: e.target.value ? Number(e.target.value) : null })} /></div>
              <div className="field"><label htmlFor="al-notice">Notice (days)</label><input id="al-notice" type="number" min={0} max={180} required value={form.noticeDays} onChange={(e) => set({ noticeDays: Number(e.target.value) })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label htmlFor="al-pay">{intern ? "Monthly stipend (₹)" : "Monthly gross (₹)"}</label><input id="al-pay" type="number" min={0} placeholder={intern ? "0 = no stipend" : ""} value={form.monthlyPay ?? ""} onChange={(e) => set({ monthlyPay: e.target.value ? Number(e.target.value) : null })} /></div>
              <div className="field"><label htmlFor="al-report">Reporting to</label><input id="al-report" value={form.reportingTo ?? ""} onChange={(e) => set({ reportingTo: e.target.value })} placeholder="Manager's name" /></div>
              {!intern && <div className="field"><label htmlFor="al-prob">Probation (months)</label><input id="al-prob" type="number" min={0} max={24} value={form.probationMonths ?? ""} onChange={(e) => set({ probationMonths: e.target.value ? Number(e.target.value) : null })} /></div>}
            </div>
            <div className="field-row field-row-2">
              <div className="field"><label htmlFor="al-hours">Working hours</label><input id="al-hours" required value={form.workHours} onChange={(e) => set({ workHours: e.target.value })} /></div>
              <div className="field"><label htmlFor="al-loc">Work location</label><input id="al-loc" required value={form.workLocation} onChange={(e) => set({ workLocation: e.target.value })} /></div>
            </div>
            <div className="field"><label htmlFor="al-extra">Additional terms (optional)</label><textarea id="al-extra" rows={2} maxLength={3000} value={form.additionalTerms ?? ""} onChange={(e) => set({ additionalTerms: e.target.value })} /></div>

            <fieldset className="policy-picks">
              <legend>Policies attached ({picked.size} of {policies.length})</legend>
              {policies.map((p) => (
                <label key={p.id} className="policy-pick">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span><strong>{p.title}</strong><span className="muted-small">{p.summary}</span></span>
                </label>
              ))}
            </fieldset>

            <div className="field-row field-row-2">
              <div className="field"><label htmlFor="al-sign">Signed by</label><input id="al-sign" required minLength={2} value={signatory.name} onChange={(e) => setSignatory({ ...signatory, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="al-sign-title">Signatory title</label><input id="al-sign-title" required minLength={2} value={signatory.title} onChange={(e) => setSignatory({ ...signatory, title: e.target.value })} /></div>
            </div>
            <label className="check-line">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <Mail size={15} /> Email the letter and the attached policies to {form.email}
            </label>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !form}>{busy ? "Issuing…" : sendEmail ? "Issue and email" : "Issue letter"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
