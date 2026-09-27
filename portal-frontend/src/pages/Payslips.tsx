import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Award, ChevronRight, Download, ExternalLink, ReceiptIndianRupee } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/people";
import { CERT_LABELS, certificatePdfUrl, downloadWithAuth, inr, type EmploymentCertificate, type Payslip, type SalaryComponent } from "../lib/payroll";
import { PayslipView } from "../components/payroll/PayslipView";

interface MePay {
  employee: { id: string; businessId: string | null; employeeType: string; joiningDate: string; durationMonths: number | null } | null;
  slips: Payslip[];
  certificates: EmploymentCertificate[];
  salary: { components: SalaryComponent[]; gross: number; net: number } | null;
}

/** An employee's own pay: current monthly pay, published payslips, and completion or experience certificates. */
export default function Payslips() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [data, setData] = useState<MePay | null>(null);
  const [open, setOpen] = useState<Payslip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openId = new URLSearchParams(search).get("slip");

  useEffect(() => {
    apiFetch<MePay>("/api/v1/payroll/me", { accessToken }).then(setData).catch(() => setError("Couldn't load your pay details."));
  }, [accessToken]);

  // Opening from a notification: /payslips?slip=<id>
  useEffect(() => {
    if (!openId || !accessToken) return;
    apiFetch<{ slip: Payslip }>(`/api/v1/payroll/slips/${openId}`, { accessToken }).then((r) => setOpen(r.slip)).catch(() => undefined);
  }, [openId, accessToken]);

  async function show(slip: Payslip) {
    try {
      setOpen((await apiFetch<{ slip: Payslip }>(`/api/v1/payroll/slips/${slip.id}`, { accessToken })).slip);
    } catch {
      toast("Couldn't open that payslip.", "error");
    }
  }

  async function download(slip: Payslip) {
    try {
      await downloadWithAuth(`/api/v1/payroll/slips/${slip.id}/pdf`, accessToken, `payslip-${slip.period}.pdf`);
    } catch {
      toast("Couldn't download the PDF.", "error");
    }
  }

  const earnings = data?.salary?.components.filter((c) => c.kind === "earning") ?? [];
  const deductions = data?.salary?.components.filter((c) => c.kind === "deduction") ?? [];

  return (
    <DashboardShell>
      <h1>Pay &amp; certificates</h1>
      <p>Your payslips appear here once HR publishes them each month.</p>
      {error && <div className="error-banner">{error}</div>}

      {!data ? (
        <div className="skeleton" style={{ height: 180, marginTop: "1.5rem" }} />
      ) : !data.employee ? (
        <p className="empty">You don't have an employee record yet.</p>
      ) : (
        <div className="pay-layout">
          <section className="panel pay-now">
            <h2 className="opp-section-title"><ReceiptIndianRupee size={18} /> Monthly pay</h2>
            {data.salary ? (
              <>
                <div className="pay-now-net">
                  <strong>{inr(data.salary.net)}</strong>
                  <span className="muted-small">net per month · {inr(data.salary.gross)} gross</span>
                </div>
                <ul className="pay-components">
                  {earnings.map((c) => <li key={c.name}><span>{c.name}</span><span>{inr(c.amount)}</span></li>)}
                  {deductions.map((c) => <li key={c.name} className="deduction"><span>{c.name}</span><span>−{inr(c.amount)}</span></li>)}
                </ul>
              </>
            ) : (
              <p className="muted-small">HR hasn't set your pay yet.</p>
            )}
          </section>

          <section className="panel">
            <h2 className="opp-section-title">Payslips</h2>
            {data.slips.length === 0 ? (
              <p className="empty">No payslips yet. Your first one arrives at the end of your first month.</p>
            ) : (
              <ul className="slip-list">
                {data.slips.map((s, i) => (
                  <motion.li key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <button className="slip-row" onClick={() => show(s)}>
                      <span className="slip-month">{s.periodLabel}</span>
                      <span className="slip-net">{inr(s.net)}</span>
                      <ChevronRight size={16} />
                    </button>
                    <button className="icon-button" aria-label={`Download ${s.periodLabel} payslip`} title="Download PDF" onClick={() => download(s)}><Download size={16} /></button>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="opp-section-title"><Award size={18} /> Certificates</h2>
            {data.certificates.length === 0 ? (
              <p className="empty">
                {data.employee.employeeType === "intern" && data.employee.durationMonths
                  ? "Your internship completion certificate is issued automatically when your internship ends."
                  : "Your experience certificate is issued when you move on."}
              </p>
            ) : (
              <ul className="cert-list">
                {data.certificates.map((c) => (
                  <li key={c.id} className={c.status}>
                    <span className="cert-icon"><Award size={20} /></span>
                    <span className="cert-main">
                      <strong>{CERT_LABELS[c.kind]}</strong>
                      <span className="muted-small">{c.roleTitle} · {formatDate(c.fromDate)} to {formatDate(c.toDate)}{c.status === "revoked" ? " · revoked" : ""}</span>
                    </span>
                    {c.status === "issued" && (
                      <span className="cert-actions">
                        <a className="btn btn-secondary btn-sm" href={`/verify/${c.verificationCode}`} onClick={(e) => { e.preventDefault(); navigate(`/verify/${c.verificationCode}`); }}><ExternalLink size={14} /> Verify</a>
                        <a className="btn btn-sm" href={`${certificatePdfUrl(c.verificationCode)}?download=1`}><Download size={14} /> PDF</a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <PayslipView
            slip={open}
            onClose={() => {
              setOpen(null);
              if (openId) navigate("/payslips", { replace: true });
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
