import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

interface Application {
  id: string;
  businessId: string | null;
  status: string;
  createdAt: string;
  opportunity?: { title: string };
}

const WITHDRAWABLE = ["submitted", "under_review", "assessment_invited", "assessment_completed", "shortlisted"];

function statusClass(status: string) {
  if (status === "selected") return "badge badge-good";
  if (status === "rejected" || status === "withdrawn") return "badge badge-bad";
  if (status === "assessment_invited") return "badge badge-warn";
  return "badge badge-active";
}

export default function CandidateDashboard() {
  const { accessToken } = useAuth();
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Record<string, { id: string; toStatus: string; note: string | null; createdAt: string }[]>>({});

  const load = useCallback(() => {
    apiFetch<{ applications: Application[] }>("/api/v1/applications/me", { accessToken })
      .then((r) => setApplications(r.applications))
      .catch(() => setError("Couldn't load your applications."));
  }, [accessToken]);

  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  async function toggleTimeline(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!timeline[id]) {
      try {
        const r = await apiFetch<{ timeline: typeof timeline[string] }>(`/api/v1/applications/${id}/timeline`, { accessToken });
        setTimeline((t) => ({ ...t, [id]: r.timeline }));
      } catch {
        // Timeline is supplementary — a failure here shouldn't break the page.
      }
    }
  }

  async function withdraw(id: string) {
    try {
      await apiFetch(`/api/v1/applications/${id}/withdraw`, { method: "POST", accessToken });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't withdraw that application.");
    }
  }

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>Your applications</h1>
      <p>Track where each application stands.</p>

      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}
      {!error && applications === null && <p className="empty">Loading…</p>}
      {applications?.length === 0 && (
        <p className="empty">
          No applications yet. <Link href="/opportunities" style={{ color: "var(--primary)", fontWeight: 600 }}>Browse opportunities →</Link>
        </p>
      )}

      <div className="stack">
        {applications?.map((app) => (
          <div key={app.id} className="card">
            <div className="card-row">
              <div>
                <div className="card-title">{app.opportunity?.title ?? "Opportunity"}</div>
                <div className="card-meta">{app.businessId}</div>
              </div>
              <span className={statusClass(app.status)}>{app.status.replace(/_/g, " ")}</span>
            </div>

            {app.status === "assessment_invited" && (
              <div className="notice notice-warn">
                You've been invited to take an assessment.{" "}
                <Link href="/assessments" style={{ fontWeight: 600 }}>Go to assessments →</Link>
              </div>
            )}

            <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-secondary" onClick={() => toggleTimeline(app.id)}>
                {expanded === app.id ? "Hide history" : "View history"}
              </button>
              {WITHDRAWABLE.includes(app.status) && (
                <button className="btn btn-danger" onClick={() => withdraw(app.id)}>Withdraw</button>
              )}
            </div>

            {expanded === app.id && (
              <div style={{ marginTop: "0.9rem" }}>
                {(timeline[app.id] ?? []).map((ev) => (
                  <div key={ev.id} className="timeline-item">
                    <span className="timeline-date">{new Date(ev.createdAt).toLocaleDateString()}</span>
                    <span>
                      {ev.toStatus.replace(/_/g, " ")}
                      {ev.note ? ` — ${ev.note}` : ""}
                    </span>
                  </div>
                ))}
                {(timeline[app.id]?.length ?? 0) === 0 && <p className="card-meta">No history to show.</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
