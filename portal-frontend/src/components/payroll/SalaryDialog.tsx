import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { inr, STARTER_COMPONENTS, type SalaryComponent } from "../../lib/payroll";

interface Props {
  employeeId: string;
  name: string;
  current: SalaryComponent[] | null;
  isIntern: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Monthly pay as a list of earnings and deductions, effective from a date. */
export function SalaryDialog({ employeeId, name, current, isIntern, onClose, onSaved }: Props) {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<SalaryComponent[]>(current?.length ? current : isIntern ? [{ name: "Stipend", amount: 0, kind: "earning" }] : STARTER_COMPONENTS);
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const earnings = rows.filter((r) => r.kind === "earning").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const deductions = rows.filter((r) => r.kind === "deduction").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const set = (i: number, patch: Partial<SalaryComponent>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const components = rows.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim(), amount: Number(r.amount) || 0 }));
      await apiFetch(`/api/v1/payroll/employees/${employeeId}/salary`, { method: "PUT", body: { effectiveFrom: from, components }, accessToken });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the salary.");
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="salary-title"
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="salary-title">Monthly pay for {name}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="salary-rows">
          <div className="salary-row salary-row-head"><span>Component</span><span>Type</span><span>Monthly (₹)</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} className="salary-row">
              <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Component name" maxLength={60} />
              <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as SalaryComponent["kind"] })} aria-label="Type">
                <option value="earning">Earning</option>
                <option value="deduction">Deduction</option>
              </select>
              <input type="number" min={0} step={1} value={r.amount} onChange={(e) => set(i, { amount: e.target.value === "" ? 0 : Number(e.target.value) })} aria-label="Monthly amount" />
              <button type="button" className="icon-button" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((rs) => [...rs, { name: "", amount: 0, kind: "earning" }])}><Plus size={15} /> Add component</button>
        </div>
        <div className="salary-summary">
          <div><span>Gross</span><strong>{inr(earnings)}</strong></div>
          <div><span>Deductions</span><strong>{inr(deductions)}</strong></div>
          <div><span>Net per month</span><strong>{inr(earnings - deductions)}</strong></div>
        </div>
        <div className="field">
          <label htmlFor="salary-from">Effective from</label>
          <input id="salary-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <p className="muted-small">Earnings are paid for the days worked in the month (from the joining date, minus loss of pay). Deductions are fixed. Earlier pay is kept in the history.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || earnings <= 0}>{busy ? "Saving…" : "Save pay"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
