import { useEffect, useState } from "react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

interface Employee {
  businessId: string;
  employeeType: string;
  status: string;
  portalAccessActive: boolean;
}

export default function EmployeeDashboard() {
  const { accessToken } = useAuth();
  const [employee, setEmployee] = useState<Employee | null | "none">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ employee: Employee }>("/api/v1/employees/me", { accessToken })
      .then((res) => setEmployee(res.employee))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setEmployee("none");
        } else {
          setError("Couldn't load your employee record right now.");
        }
      });
  }, [accessToken]);

  return (
    <DashboardShell>
      <h1>Your workspace</h1>
      <p>Your employee record, onboarding status, and documents live here.</p>

      {error && <div className="error-banner" style={{ marginTop: "1.5rem" }}>{error}</div>}
      {employee === null && !error && <p>Loading…</p>}
      {employee === "none" && <p>No employee record is linked to your account yet. Check back after HR completes onboarding.</p>}
      {employee && employee !== "none" && (
        <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
          <Row label="Employee ID" value={employee.businessId} />
          <Row label="Type" value={employee.employeeType.replace("_", " ")} />
          <Row label="Status" value={employee.status.replace("_", " ")} />
          <Row label="Portal access" value={employee.portalAccessActive ? "Active" : "Pending activation"} />
        </div>
      )}
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ textTransform: "capitalize" }}>{value}</span>
    </div>
  );
}
