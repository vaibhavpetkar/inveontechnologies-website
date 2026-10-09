import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Info, Save, School } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { money, WORK_MODES, type OfferTerms, type WorkMode } from "../../lib/settings";
import { useToast } from "../Toast";
import { PanelSkeleton, ReadOnlyNote } from "./ui";

/** The fee, work mode and length every new internship offer starts from. */
export function FeesTab() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [terms, setTerms] = useState<OfferTerms | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    apiFetch<{ terms: OfferTerms; canEdit: boolean }>("/api/v1/settings/internship-offers", { accessToken })
      .then((r) => {
        setTerms(r.terms);
        setCanEdit(r.canEdit);
      })
      .catch(() => setError("Couldn't load the internship fees."));
  }, [accessToken]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!terms) return <PanelSkeleton height={300} />;

  function set<K extends keyof OfferTerms>(key: K, value: OfferTerms[K]) {
    setTerms((t) => (t ? { ...t, [key]: value } : t));
    setDirty(true);
  }
  const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v)));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!terms) return;
    setSaving(true);
    try {
      const r = await apiFetch<{ terms: OfferTerms }>("/api/v1/settings/internship-offers", { method: "PUT", body: terms, accessToken });
      setTerms(r.terms);
      setDirty(false);
      toast("Internship fees saved. New offers use them.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the fees.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.form className="st-stack" onSubmit={save} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <p className="st-lead">What every new internship offer letter starts from.</p>
      {!canEdit && <ReadOnlyNote />}

      <fieldset disabled={!canEdit} className="st-fieldset">
        <section className="panel">
          <div className="st-fee-grid">
            <div className="st-fee-card">
              <span className="st-fee-icon tone-blue"><School size={18} /></span>
              <div className="field">
                <label htmlFor="fee-student">Student fee</label>
                <div className="st-money"><span aria-hidden="true">₹</span><input id="fee-student" type="number" min={0} max={1_000_000} step="1" required value={terms.studentFee} onChange={(e) => set("studentFee", num(e.target.value))} /></div>
                <span className="muted-small">For people still studying.</span>
              </div>
            </div>
            <div className="st-fee-card">
              <span className="st-fee-icon tone-violet"><GraduationCap size={18} /></span>
              <div className="field">
                <label htmlFor="fee-grad">Graduate fee</label>
                <div className="st-money"><span aria-hidden="true">₹</span><input id="fee-grad" type="number" min={0} max={1_000_000} step="1" required value={terms.graduateFee} onChange={(e) => set("graduateFee", num(e.target.value))} /></div>
                <span className="muted-small">For people who have finished their degree.</span>
              </div>
            </div>
          </div>

          <div className="field-row field-row-2 even">
            <div className="field">
              <label htmlFor="fee-mode">Default work mode</label>
              <select id="fee-mode" value={terms.workMode} onChange={(e) => set("workMode", e.target.value as WorkMode)}>
                {WORK_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fee-len">Length (months)</label>
              <input id="fee-len" type="number" min={1} max={24} step={1} required value={terms.durationMonths} onChange={(e) => set("durationMonths", Math.round(num(e.target.value)))} />
            </div>
          </div>

          <div className="st-note">
            <Info size={16} />
            <span>
              The fee on each offer is picked from the graduation year on the candidate's profile: still studying pays {money(terms.studentFee)}, graduated pays {money(terms.graduateFee)}.
              Staff can change one person's offer under <strong>Internship offers</strong> until it's paid. Offers already issued keep their fee; the fee shown on internship tracks and openings updates when you save.
            </span>
          </div>
        </section>
      </fieldset>

      {canEdit && (
        <div className="st-savebar">
          <button className="btn" disabled={saving || !dirty}><Save size={16} /> {saving ? "Saving…" : "Save fees"}</button>
          {dirty && <span className="muted-small">You have unsaved changes.</span>}
        </div>
      )}
    </motion.form>
  );
}
