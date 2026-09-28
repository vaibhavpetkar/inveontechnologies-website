import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, IndianRupee, Send, Sparkles, Wallet } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { Avatar } from "../components/Avatar";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { inr, periodName, periodOf, shiftPeriod, type Payslip, type PayrollRow } from "../lib/payroll";
import { SalaryDialog } from "../components/payroll/SalaryDialog";
import { PayslipView } from "../components/payroll/PayslipView";

/** HR's monthly payroll: who is paid what, draft slips, loss of pay, publish. */
export default function Payroll() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const search = useSearch();
  const [period, setPeriod] = useState(() => new URLSearchParams(search).get("period") ?? periodOf());
  const [rows, setRows] = useState<PayrollRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [viewing, setViewing] = useState<Payslip | null>(null);
  const [lop, setLop] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ people: PayrollRow[] }>(`/api/v1/payroll/overview?period=${period}`, { accessToken });
      setRows(r.people);
      setLop(Object.fromEntries(r.people.filter((p) => p.slipId).map((p) => [p.slipId!, String(Number(p.lopDays ?? 0))])));
      setError(null);
    } catch {
      setError("Couldn't load payroll.");
    }
  }, [period, accessToken]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const withSlip = list.filter((r) => r.slipId);
    return {
      total: withSlip.reduce((s, r) => s + Number(r.net ?? 0), 0),
      drafts: withSlip.filter((r) => r.slipStatus === "draft").length,
      published: withSlip.filter((r) => r.slipStatus === "published").length,
      missingPay: list.filter((r) => !r.salary).length,
    };
  }, [rows]);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    try {
      toast(await fn());
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work.", "error");
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    act(async () => {
      const r = await apiFetch<{ created: number; updated: number }>("/api/v1/payroll/run", { method: "POST", body: { period }, accessToken });
      return r.created + r.updated === 0 ? "Nothing to draft: set pay for people first" : `Drafted ${r.created + r.updated} ${r.created + r.updated === 1 ? "payslip" : "payslips"}`;
    });

  const publishAll = () => {
    if (!window.confirm(`Publish ${stats.drafts} payslips for ${periodName(period)}? Everyone will be emailed and published slips can't be changed.`)) return;
    act(async () => {
      const r = await apiFetch<{ published: number }>("/api/v1/payroll/publish", { method: "POST", body: { period }, accessToken });
      return `Published ${r.published} ${r.published === 1 ? "payslip" : "payslips"}`;
    });
  };

  async function saveLop(row: PayrollRow) {
    const days = Number(lop[row.slipId!] ?? 0);
    if (days === Number(row.lopDays ?? 0)) return;
    await act(async () => {
      await apiFetch(`/api/v1/payroll/slips/${row.slipId}`, { method: "PATCH", body: { lopDays: days }, accessToken });
      return `Updated ${row.name.split(" ")[0]}'s slip`;
    });
  }

  async function view(row: PayrollRow) {
    try {
      const r = await apiFetch<{ slip: Payslip }>(`/api/v1/payroll/slips/${row.slipId}`, { accessToken });
      setViewing(r.slip);
    } catch {
      toast("Couldn't open the payslip.", "error");
    }
  }

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Payroll</h1>
          <p>Set everyone's monthly pay, review the drafted payslips, then publish. Drafts are made automatically near the end of each month.</p>
        </div>
        <div className="period-picker" role="group" aria-label="Month">
          <button className="icon-button" aria-label="Previous month" onClick={() => setPeriod((p) => shiftPeriod(p, -1))}><ChevronLeft size={18} /></button>
          <strong>{periodName(period)}</strong>
          <button className="icon-button" aria-label="Next month" onClick={() => setPeriod((p) => shiftPeriod(p, 1))}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="stat-grid">
        {[
          { label: "Net payout", value: stats.total, icon: IndianRupee, tone: "blue", money: true },
          { label: "Drafts to review", value: stats.drafts, icon: FileText, tone: "violet" },
          { label: "Published", value: stats.published, icon: Send, tone: "green" },
          { label: "No pay set", value: stats.missingPay, icon: Wallet, tone: "red" },
        ].map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <span className="stat-icon">
              <s.icon size={18} />
            </span>
            <span className="stat-value">{s.money ? inr(s.value) : <AnimatedNumber value={s.value} />}</span>
            <span className="stat-label">{s.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="payroll-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={generate}><Sparkles size={16} /> {stats.drafts + stats.published ? "Refresh drafts" : "Draft payslips"}</button>
        <button className="btn" disabled={busy || stats.drafts === 0} onClick={publishAll}><Send size={16} /> Publish {stats.drafts || ""} {stats.drafts === 1 ? "payslip" : "payslips"}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {rows === null ? (
        <div className="skeleton" style={{ height: 220 }} />
      ) : rows.length === 0 ? (
        <p className="empty">No employees yet. Hire someone from an opening or invite them from People.</p>
      ) : (
        <div className="payroll-table" role="table" aria-label={`Payroll for ${periodName(period)}`}>
          <div className="payroll-row payroll-head" role="row">
            <span role="columnheader">Person</span>
            <span role="columnheader">Monthly pay</span>
            <span role="columnheader">LOP days</span>
            <span role="columnheader">This month</span>
            <span role="columnheader">Payslip</span>
          </div>
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.div key={r.id} className="payroll-row" role="row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span className="payroll-who" role="cell">
                  <Avatar email={r.email} name={r.name} size={34} />
                  <span>
                    <strong>{r.name}</strong>
                    <span className="muted-small">{[r.designation, r.businessId].filter(Boolean).join(" · ")}</span>
                  </span>
                </span>
                <span role="cell" data-label="Monthly pay">
                  <button className={`link-button${r.salary ? "" : " warn"}`} onClick={() => setEditing(r)}>
                    {r.salary ? `${inr(r.salary.net)} net` : "Set pay"}
                  </button>
                </span>
                <span role="cell" data-label="LOP days">
                  {r.slipStatus === "draft" ? (
                    <input
                      className="lop-input"
                      type="number"
                      min={0}
                      max={31}
                      step={0.5}
                      value={lop[r.slipId!] ?? "0"}
                      onChange={(e) => setLop((l) => ({ ...l, [r.slipId!]: e.target.value }))}
                      onBlur={() => saveLop(r)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      aria-label={`Loss of pay days for ${r.name}`}
                    />
                  ) : (
                    <span className="muted-small">{r.slipId ? Number(r.lopDays) : "–"}</span>
                  )}
                </span>
                <span role="cell" data-label="This month">
                  {r.slipId ? (
                    <>
                      <strong>{inr(r.net)}</strong>
                      <span className="muted-small"> · {Number(r.payableDays)}/{r.daysInMonth} days</span>
                    </>
                  ) : (
                    <span className="muted-small">–</span>
                  )}
                </span>
                <span role="cell" data-label="Payslip">
                  {r.slipId ? (
                    <button className={`slip-pill ${r.slipStatus}`} onClick={() => view(r)}>{r.slipStatus === "published" ? "Published" : "Draft"}</button>
                  ) : (
                    <span className="muted-small">{r.salary ? "Not drafted" : "Needs pay"}</span>
                  )}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <SalaryDialog
            employeeId={editing.id}
            name={editing.name}
            current={editing.salary?.components ?? null}
            isIntern={editing.employeeType === "intern"}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              toast("Pay saved");
              load();
            }}
          />
        )}
        {viewing && <PayslipView slip={viewing} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </DashboardShell>
  );
}
