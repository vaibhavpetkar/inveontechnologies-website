import { useEffect, useState } from "react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { TeamAccounts } from "../components/TeamAccounts";

export default function AdminDashboard() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState<{ totalApplications: number; byStatus: Record<string, number> } | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ totalApplications: number; byStatus: Record<string, number> }>("/api/v1/reports/recruitment-conversion", { accessToken })
      .then(setSummary)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setRestricted(true);
        else setError("Couldn't load the report right now.");
      });
  }, [accessToken]);

  return (
    <DashboardShell>
      <h1>Staff console</h1>
      <p>Recruitment, employees, and reporting for the team.</p>

      {error && <div className="error-banner" style={{ marginTop: "1.5rem" }}>{error}</div>}
      {restricted && <p style={{ marginTop: "1.5rem" }}>Your role ({user?.role}) doesn't include report access — that's HR and above. Everything else in the console is still available to you.</p>}
      {summary && (
        <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ color: "var(--muted)" }}>Total applications</span>
            <span>{summary.totalApplications}</span>
          </div>
          {Object.entries(summary.byStatus).map(([status, count]) => (
            <div key={status} style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{status.replace("_", " ")}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      )}

      {user?.role === "super_admin" && <TeamAccounts />}
    </DashboardShell>
  );
}
