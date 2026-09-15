import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

interface Opportunity {
  id: string;
  businessId: string | null;
  title: string;
  description: string;
  eligibility: Record<string, unknown>;
}

interface Skill { id: string; name: string }

export default function OpportunityDetail() {
  const [, params] = useRoute("/opportunities/:id");
  const [, navigate] = useLocation();
  const { accessToken } = useAuth();
  const [data, setData] = useState<{ opportunity: Opportunity; skills: Skill[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    apiFetch<{ opportunity: Opportunity; skills: Skill[] }>(`/api/v1/opportunities/${params.id}`, { accessToken })
      .then(setData)
      .catch(() => setError("Couldn't load this opportunity."));
  }, [params?.id, accessToken]);

  async function handleApply() {
    if (!params?.id) return;
    setApplying(true);
    setApplyError(null);
    setProfileIncomplete(false);
    try {
      const res = await apiFetch<{ eligibilityWarning: string[] | null }>(
        `/api/v1/applications/opportunities/${params.id}/apply`,
        { method: "POST", body: {}, accessToken },
      );
      if (res.eligibilityWarning?.length) {
        // Applied successfully, but flag the mismatch honestly rather than
        // pretending everything matched.
        setWarnings(res.eligibilityWarning);
      } else {
        navigate("/candidate");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "PROFILE_INCOMPLETE") setProfileIncomplete(true);
        else if (err.code === "DUPLICATE_APPLICATION") setApplyError("You've already applied to this opportunity.");
        else setApplyError(err.message);
      } else {
        setApplyError("Couldn't submit your application. Try again.");
      }
    } finally {
      setApplying(false);
    }
  }

  if (error) {
    return (
      <DashboardShell nav={<CandidateNav />}>
        <div className="error-banner">{error}</div>
      </DashboardShell>
    );
  }

  if (!data) {
    return (
      <DashboardShell nav={<CandidateNav />}>
        <p className="empty">Loading…</p>
      </DashboardShell>
    );
  }

  const { opportunity, skills } = data;

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>{opportunity.title}</h1>
      <p>{opportunity.businessId}</p>

      <div className="card" style={{ marginTop: "1.5rem", whiteSpace: "pre-wrap" }}>
        {opportunity.description}
      </div>

      {skills.length > 0 && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {skills.map((s) => (
            <span key={s.id} className="badge">{s.name}</span>
          ))}
        </div>
      )}

      {warnings && (
        <>
          <div className="notice notice-warn">
            Your application was submitted, but some details don't match the listed criteria:
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
            A reviewer will still see your application.
          </div>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/candidate" className="btn">Go to my applications</Link>
          </div>
        </>
      )}

      {profileIncomplete && (
        <div className="notice notice-warn">
          Add your name and phone number before applying.{" "}
          <Link href="/profile" style={{ fontWeight: 600 }}>Complete your profile →</Link>
        </div>
      )}

      {applyError && <div className="error-banner" style={{ marginTop: "1rem" }}>{applyError}</div>}

      {!warnings && (
        <div style={{ marginTop: "1.5rem" }}>
          <button className="btn" onClick={handleApply} disabled={applying}>
            {applying ? "Submitting…" : "Apply now"}
          </button>
        </div>
      )}
    </DashboardShell>
  );
}
