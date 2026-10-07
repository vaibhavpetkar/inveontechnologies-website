import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileSignature, Save } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "./Toast";

type HireType = "intern" | "full_time" | "contract";

interface TypeTerms {
  workLocation: string;
  workHours: string;
  noticeDays: number;
  probationMonths: number | null;
  defaultDurationMonths: number | null;
  additionalTerms: string | null;
}

interface JoiningTerms {
  signatoryName: string;
  signatoryTitle: string;
  department: string;
  intern: TypeTerms;
  full_time: TypeTerms;
  contract: TypeTerms;
}

const TYPES: { id: HireType; label: string }[] = [
  { id: "intern", label: "Interns" },
  { id: "full_time", label: "Full-time" },
  { id: "contract", label: "Contract" },
];

/**
 * The terms every join letter starts from: who signs, where and when people
 * work, notice and probation, and any extra conditions, per kind of hire.
 * HR and admins can read them; admins change them.
 */
export function JoiningTermsCard() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [terms, setTerms] = useState<JoiningTerms | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HireType>("intern");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    apiFetch<{ terms: JoiningTerms; canEdit: boolean }>("/api/v1/settings/joining-terms", { accessToken })
      .then((r) => {
        setTerms(r.terms);
        setCanEdit(r.canEdit);
      })
      .catch(() => setHidden(true));
  }, [accessToken]);

  if (hidden) return null;

  function set<K extends keyof JoiningTerms>(key: K, value: JoiningTerms[K]) {
    setTerms((t) => (t ? { ...t, [key]: value } : t));
    setDirty(true);
  }
  function setType<K extends keyof TypeTerms>(key: K, value: TypeTerms[K]) {
    setTerms((t) => (t ? { ...t, [tab]: { ...t[tab], [key]: value } } : t));
    setDirty(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!terms) return;
    setSaving(true);
    try {
      const r = await apiFetch<{ terms: JoiningTerms }>("/api/v1/settings/joining-terms", { method: "PUT", body: terms, accessToken });
      setTerms(r.terms);
      setDirty(false);
      toast("Joining terms saved. New join letters use them.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the terms.", "error");
    } finally {
      setSaving(false);
    }
  }

  const t = terms?.[tab];
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));

  return (
    <motion.section className="panel policy-card joining-terms" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <button className="policy-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="policy-icon tone-violet"><FileSignature size={18} /></span>
        <span className="policy-title">
          <strong>Join letter terms</strong>
          <span className="muted-small">Signatory, work hours, location, notice, probation and extra conditions in every join letter.</span>
        </span>
        <span className="policy-meta">{terms && <span className="muted-small">Signed by {terms.signatoryName}</span>}</span>
        <ChevronDown size={18} className={`chevron${open ? " open" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && terms && t && (
          <motion.form className="policy-body terms-form" onSubmit={save} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <fieldset disabled={!canEdit}>
              <div className="field-row field-row-3">
                <div className="field"><label htmlFor="jt-sig">Signed by</label><input id="jt-sig" required minLength={2} maxLength={200} value={terms.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} /></div>
                <div className="field"><label htmlFor="jt-sigt">Their title</label><input id="jt-sigt" required minLength={2} maxLength={200} value={terms.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} /></div>
                <div className="field"><label htmlFor="jt-dept">Default department</label><input id="jt-dept" required minLength={2} maxLength={200} value={terms.department} onChange={(e) => set("department", e.target.value)} /></div>
              </div>

              <div className="segmented small" role="tablist" aria-label="Kind of hire">
                {TYPES.map((x) => (
                  <button type="button" key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "active" : ""} onClick={() => setTab(x.id)}>
                    {tab === x.id && <motion.span layoutId="terms-tab" className="segmented-pill" />}
                    <span>{x.label}</span>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                  <div className="field-row field-row-2 even">
                    <div className="field"><label htmlFor="jt-loc">Work location</label><input id="jt-loc" required minLength={2} maxLength={300} value={t.workLocation} onChange={(e) => setType("workLocation", e.target.value)} /></div>
                    <div className="field"><label htmlFor="jt-hours">Working hours</label><input id="jt-hours" required minLength={2} maxLength={300} value={t.workHours} onChange={(e) => setType("workHours", e.target.value)} /></div>
                  </div>
                  <div className="field-row field-row-3">
                    <div className="field"><label htmlFor="jt-notice">Notice (days)</label><input id="jt-notice" type="number" min={0} max={180} required value={t.noticeDays} onChange={(e) => setType("noticeDays", num(e.target.value) ?? 0)} /></div>
                    <div className="field"><label htmlFor="jt-prob">Probation (months)</label><input id="jt-prob" type="number" min={0} max={24} value={t.probationMonths ?? ""} placeholder="None" onChange={(e) => setType("probationMonths", num(e.target.value))} /></div>
                    <div className="field"><label htmlFor="jt-dur">Usual length (months)</label><input id="jt-dur" type="number" min={1} max={60} value={t.defaultDurationMonths ?? ""} placeholder="Open-ended" onChange={(e) => setType("defaultDurationMonths", num(e.target.value) || null)} /></div>
                  </div>
                  <div className="field">
                    <label htmlFor="jt-extra">Extra terms and conditions</label>
                    <textarea id="jt-extra" rows={5} maxLength={3000} value={t.additionalTerms ?? ""} onChange={(e) => setType("additionalTerms", e.target.value || null)} placeholder="e.g. Laptop provided and returned on exit. Work you do belongs to Inveon. Keep client details confidential." />
                    <span className="muted-small">Printed in the letter after the standard terms. The active company policies below are attached too.</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </fieldset>
            {canEdit ? (
              <div className="policy-actions">
                <button className="btn btn-sm" disabled={saving || !dirty}><Save size={14} /> {saving ? "Saving…" : "Save terms"}</button>
                <span className="muted-small">Letters already sent keep the terms they were issued with.</span>
              </div>
            ) : (
              <p className="muted-small">Only admins can change these.</p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
