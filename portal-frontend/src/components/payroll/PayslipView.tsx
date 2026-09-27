import { useState } from "react";
import { motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { downloadWithAuth, inr, type Payslip } from "../../lib/payroll";
import { useToast } from "../Toast";

/** A payslip in a modal: facts, earnings next to deductions, net pay, PDF download. */
export function PayslipView({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const lop = Number(slip.lopDays);

  async function download() {
    setBusy(true);
    try {
      await downloadWithAuth(`/api/v1/payroll/slips/${slip.id}/pdf`, accessToken, `payslip-${slip.period}.pdf`);
    } catch {
      toast("Couldn't download the PDF.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className="modal modal-wide payslip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slip-title"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <div>
            <span className="payslip-eyebrow">Payslip{slip.status === "draft" ? " · draft" : ""}</span>
            <h2 id="slip-title">{slip.periodLabel}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {slip.employee && (
          <dl className="payslip-facts">
            <div><dt>Employee</dt><dd>{slip.employee.name}</dd></div>
            <div><dt>Employee ID</dt><dd>{slip.employee.businessId ?? "–"}</dd></div>
            <div><dt>Designation</dt><dd>{slip.employee.designation ?? "–"}</dd></div>
            <div><dt>Paid days</dt><dd>{Number(slip.payableDays)} of {slip.daysInMonth}{lop ? ` (${lop} LOP)` : ""}</dd></div>
          </dl>
        )}
        <div className="payslip-cols">
          {([["Earnings", slip.earnings, slip.gross, "Gross"], ["Deductions", slip.deductions, slip.totalDeductions, "Total"]] as const).map(([title, rows, total, totalLabel]) => (
            <div key={title} className="payslip-col">
              <h3>{title}</h3>
              <ul>
                {rows.length === 0 && <li className="muted-small">None</li>}
                {rows.map((r) => <li key={r.name}><span>{r.name}</span><span>{inr(r.amount)}</span></li>)}
              </ul>
              <div className="payslip-total"><span>{totalLabel}</span><span>{inr(total)}</span></div>
            </div>
          ))}
        </div>
        <div className="payslip-net">
          <span>Net pay</span>
          <strong>{inr(slip.net)}</strong>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={download} disabled={busy}><Download size={16} /> {busy ? "Preparing…" : "Download PDF"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
