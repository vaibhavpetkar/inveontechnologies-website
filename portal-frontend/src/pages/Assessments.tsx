import { useEffect, useState } from "react";
import { Link } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

interface Application {
  id: string;
  businessId: string | null;
  status: string;
  opportunity?: { title: string };
}

/**
 * The backend has no "list my assessment attempts" endpoint — attempts are
 * reached via the application they belong to. So this page derives the list
 * from applications in an assessment-related status, rather than inventing
 * an endpoint that doesn't exist.
 */
export default function Assessments() {
  const { accessToken } = useAuth();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ applications: Application[] }>("/api/v1/applications/me", { accessToken })
      .then((r) => setApps(r.applications.filter((a) => a.status === "assessment_invited" || a.status === "assessment_completed")))
      .catch(() => setError("Couldn't load your assessments."));
  }, [accessToken]);

  return (
    <DashboardShell>
      <h1>Your exams</h1>
      <p>Exams for the openings you've applied to.</p>

      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}
      {!error && apps === null && <p className="empty">Loading…</p>}
      {apps?.length === 0 && <p className="empty">No exams yet. You'll see one here after you apply to an opening that has an exam.</p>}

      <div className="stack">
        {apps?.map((a) => (
          <div key={a.id} className="card">
            <div className="card-row">
              <div>
                <div className="card-title">{a.opportunity?.title ?? "Assessment"}</div>
                <div className="card-meta">{a.businessId}</div>
              </div>
              {a.status === "assessment_invited" ? (
                <Link href={`/assessments/${a.id}`} className="btn">Take exam</Link>
              ) : (
                <Link href={`/assessments/${a.id}`} className="btn btn-secondary">See result</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
