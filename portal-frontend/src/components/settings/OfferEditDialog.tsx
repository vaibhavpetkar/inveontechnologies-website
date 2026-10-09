import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Lock, Save, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { addMonths, isSettled, money, PAYMENT_STATUS, WORK_MODES, type InternshipOffer, type OfferTerms, type WorkMode } from "../../lib/settings";
import { Dialog } from "./ui";

type Category = "student" | "graduate";

/** Correct one offer: student or graduate fee, work mode and dates; optionally email the updated letter. */
export function OfferEditDialog({ offer, terms, onClose, onSaved }: { offer: InternshipOffer; terms: OfferTerms; onClose: () => void; onSaved: (offer: Partial<InternshipOffer> & { id: string }, emailed: boolean) => void }) {
  const { accessToken } = useAuth();
  const settled = isSettled(offer.paymentStatus);
  const [category, setCategory] = useState<Category>(offer.feeCategory ?? (offer.fee === terms.graduateFee && offer.fee !== terms.studentFee ? "graduate" : "student"));
  const [fee, setFee] = useState(String(offer.fee));
  const [workMode, setWorkMode] = useState<WorkMode>(offer.workMode);
  const [joiningDate, setJoiningDate] = useState(offer.joiningDate ?? "");
  const [endDate, setEndDate] = useState(offer.endDate ?? "");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const termFee = (c: Category) => (c === "student" ? terms.studentFee : terms.graduateFee);
  const feeNum = Number(fee);
  const datesBad = !!joiningDate && !!endDate && endDate <= joiningDate;

  function pickCategory(c: Category) {
    setCategory(c);
    setFee(String(termFee(c)));
  }

  function changeJoining(v: string) {
    // Keep the same length when the start moves, or fill the end from the usual length.
    if (v && (!endDate || (offer.joiningDate && endDate === offer.endDate))) setEndDate(addMonths(v, terms.durationMonths));
    setJoiningDate(v);
  }

  async function save(send: boolean) {
    setBusy(send ? "send" : "save");
    setError(null);
    try {
      const body = { feeCategory: category, fee: settled ? offer.fee : feeNum, workMode, joiningDate, endDate };
      const r = await apiFetch<{ offer: { id: string; fee: string | number; feeCategory: Category; workMode: WorkMode; joiningDate: string; endDate: string }; emailQueued: boolean }>(
        `/api/v1/internships/offers/${offer.id}${send ? "?send=1" : ""}`,
        { method: "PUT", body, accessToken },
      );
      onSaved({ id: offer.id, fee: Number(r.offer.fee), feeCategory: r.offer.feeCategory, workMode: r.offer.workMode, joiningDate: r.offer.joiningDate, endDate: r.offer.endDate }, r.emailQueued);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the offer.");
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    save(submitter?.value === "send");
  }

  const valid = !!joiningDate && !!endDate && !datesBad && fee !== "" && feeNum >= 0;

  return (
    <Dialog id="offer-edit-title" title={`Edit offer for ${offer.name}`} onClose={onClose} onSubmit={submit}>
      <p className="muted-small st-dialog-lead">{offer.track.title} · Ref {offer.referenceNo}</p>
      {error && <div className="error-banner">{error}</div>}

      {settled && offer.paymentStatus && (
        <div className="st-readonly">
          <Lock size={15} /> <span>The fee is locked: this offer is {PAYMENT_STATUS[offer.paymentStatus].label.toLowerCase()}. You can still change the work mode and dates.</span>
        </div>
      )}

      <div className="field">
        <span className="field-label">Fee category</span>
        <div className="segmented" role="radiogroup" aria-label="Fee category">
          {(["student", "graduate"] as const).map((c) => (
            <button type="button" key={c} role="radio" aria-checked={category === c} disabled={settled} className={category === c ? "active" : ""} onClick={() => pickCategory(c)}>
              {category === c && <motion.span layoutId="offer-cat" className="segmented-pill" />}
              <span>{c === "student" ? "Student" : "Graduate"} · {money(termFee(c))}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field-row field-row-2 even">
        <div className="field">
          <label htmlFor="of-fee">Fee</label>
          <div className="st-money"><span aria-hidden="true">₹</span><input id="of-fee" type="number" min={0} max={1_000_000} step="1" required disabled={settled} value={fee} onChange={(e) => setFee(e.target.value)} /></div>
          {!settled && fee !== "" && feeNum !== termFee(category) && <span className="muted-small">Different from the usual {category} fee of {money(termFee(category))}.</span>}
        </div>
        <div className="field">
          <label htmlFor="of-mode">Work mode</label>
          <select id="of-mode" value={workMode} onChange={(e) => setWorkMode(e.target.value as WorkMode)}>
            {WORK_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="field-row field-row-2 even">
        <div className="field"><label htmlFor="of-join">Joining date</label><input id="of-join" type="date" required value={joiningDate} onChange={(e) => changeJoining(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="of-end">End date</label>
          <input id="of-end" type="date" required min={joiningDate || undefined} value={endDate} className={datesBad ? "has-error" : ""} onChange={(e) => setEndDate(e.target.value)} />
          {datesBad && <span className="st-error-text">The end date must be after the joining date.</span>}
        </div>
      </div>

      <div className="modal-actions st-wrap-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary" value="save" disabled={!!busy || !valid}><Save size={15} /> {busy === "save" ? "Saving…" : "Save"}</button>
        <button className="btn" value="send" disabled={!!busy || !valid}><Send size={15} /> {busy === "send" ? "Sending…" : "Save and email"}</button>
      </div>
    </Dialog>
  );
}
