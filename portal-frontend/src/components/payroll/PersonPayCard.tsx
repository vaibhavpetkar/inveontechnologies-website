import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Award, IndianRupee } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDate } from "../../lib/people";
import { CERT_LABELS, inr, type EmploymentCertificate, type SalaryComponent } from "../../lib/payroll";
import { useToast } from "../Toast";

/** HR's view of someone's pay and certificates inside the People drawer. */
export function PersonPayCard({ employeeId }: { employeeId: string }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [pay, setPay] = useState<SalaryComponent[] | null | undefined>(undefined);
  const [certs, setCerts] = useState<EmploymentCertificate[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      apiFetch<{ current: { components: SalaryComponent[] } | null }>(`/api/v1/payroll/employees/${employeeId}/salary`, { accessToken }).catch(() => ({ current: null })),
      apiFetch<{ certificates: EmploymentCertificate[] }>(`/api/v1/payroll/employees/${employeeId}/certificates`, { accessToken }).catch(() => ({ certificates: [] })),
    ]);
    setPay(s.current?.components ?? null);
    setCerts(c.certificates);
  }, [employeeId, accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  async function issue() {
    if (!window.confirm("Issue their certificate now, dated today? They'll get it by email.")) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ created: boolean }>(`/api/v1/payroll/employees/${employeeId}/certificates`, { method: "POST", body: { toDate: new Date().toISOString().slice(0, 10) }, accessToken });
      toast(r.created ? "Certificate issued" : "They already have one");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't issue it.", "error");
    } finally {
      setBusy(false);
    }
  }

  const net = pay ? pay.reduce((s, c) => s + (c.kind === "earning" ? c.amount : -c.amount), 0) : 0;
  const issued = certs.filter((c) => c.status === "issued");

  return (
    <div className="drawer-section person-pay">
      <h3><IndianRupee size={15} /> Pay &amp; certificates</h3>
      <p className="person-pay-line">
        {pay === undefined ? "…" : pay ? <>{inr(net)} net a month</> : "No pay set yet."} <Link href="/payroll" className="link-button">Open payroll</Link>
      </p>
      {issued.map((c) => (
        <p key={c.id} className="person-pay-line">
          <Award size={15} /> {CERT_LABELS[c.kind]} · {formatDate(c.issuedAt)} <Link href={`/verify/${c.verificationCode}`} className="link-button">View</Link>
        </p>
      ))}
      {issued.length === 0 && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={issue}><Award size={14} /> Issue certificate now</button>}
    </div>
  );
}
