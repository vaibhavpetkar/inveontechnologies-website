import { useEffect, useState } from "react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

interface Application {
  id: string;
  businessId: string;
  status: string;
}

export default function CandidateDashboard() {
  const { accessToken } = useAuth();
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ applications: Application[] }>("/api/v1/applications/me", { accessToken })
      .then((res) => setApplications(res.applications))
      .catch(() => setError("Couldn't load your applications right now."));
  }, [accessToken]);

  return (
    <DashboardShell>
      <h1>Your applications</h1>
      <p>Track where each application stands — from submitted through to an offer.</p>

      {error && <div className="error-banner" style={{ marginTop: "1.5rem" }}>{error}</div>}
      {!error && applications === null && <p>Loading…</p>}
      {applications !== null && applications.length === 0 && <p>You haven't applied to anything yet. Opportunities will show up here once you do.</p>}
      {applications && applications.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, marginTop: "1.5rem" }}>
          {applications.map((app) => (
            <li key={app.id} style={{ padding: "0.9rem 0", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
              <span>{app.businessId}</span>
              <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{app.status.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
