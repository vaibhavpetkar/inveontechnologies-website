import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Clock, GraduationCap, IndianRupee, MapPin, Pencil, Rocket } from "lucide-react";
import { ExamsPanel } from "../components/exams/ExamsPanel";
import { ApplicantsPanel } from "../components/applicants/ApplicantsPanel";
import { DashboardShell } from "../components/DashboardShell";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { durationLabel, KIND_META, OPPORTUNITY_ADMIN_ROLES, OPPORTUNITY_PUBLISH_ROLES, startLabel, stipendLabel, type LinkedCourse, type Opportunity } from "../lib/opportunities";

interface Skill { id: string; name: string }
interface ExamInfo { id: string; title: string; language: string | null; durationMinutes: number; passingScorePercent: number; maxAttempts: number; questionCount: number }

export default function OpportunityDetail() {
  const [, params] = useRoute("/opportunities/:id");
  const [, navigate] = useLocation();
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const isAdmin = !!user && OPPORTUNITY_ADMIN_ROLES.includes(user.role);
  const [data, setData] = useState<{ opportunity: Opportunity; skills: Skill[]; courses: LinkedCourse[]; exams?: ExamInfo[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    if (!params?.id) return;
    apiFetch<{ opportunity: Opportunity; skills: Skill[]; courses: LinkedCourse[]; exams?: ExamInfo[] }>(`/api/v1/opportunities/${params.id}`, { accessToken })
      .then(setData)
      .catch(() => setError("Couldn't load this opportunity."));
  }, [params?.id, accessToken]);

  async function handleApply() {
    if (!params?.id) return;
    setApplying(true);
    setApplyError(null);
    setProfileIncomplete(false);
    setNeedsVerification(false);
    try {
      const res = await apiFetch<{ application: { id: string }; examRequired?: boolean; eligibilityWarning: string[] | null }>(
        `/api/v1/applications/opportunities/${params.id}/apply`,
        { method: "POST", body: {}, accessToken },
      );
      if (res.examRequired) {
        toast("Application sent. Next up: your exam.");
        navigate(`/assessments/${res.application.id}`);
      } else if (res.eligibilityWarning?.length) {
        // Applied successfully, but flag the mismatch honestly rather than
        // pretending everything matched.
        setWarnings(res.eligibilityWarning);
      } else {
        navigate("/candidate");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "PROFILE_INCOMPLETE") setProfileIncomplete(true);
        else if (err.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
        else if (err.code === "DUPLICATE_APPLICATION") setApplyError("You've already applied to this opportunity.");
        else setApplyError(err.message);
      } else {
        setApplyError("Couldn't submit your application. Try again.");
      }
    } finally {
      setApplying(false);
    }
  }

  async function publish() {
    if (!data) return;
    try {
      await apiFetch(`/api/v1/opportunities/${data.opportunity.id}/publish`, { method: "POST", accessToken });
      setData({ ...data, opportunity: { ...data.opportunity, status: "published" } });
      toast("Published. It's now open for applications.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't publish.", "error");
    }
  }

  async function resendVerification() {
    setResendState("sending");
    try {
      await apiFetch("/api/v1/auth/resend-verification", { method: "POST", accessToken });
      setResendState("sent");
    } catch {
      setResendState("failed");
    }
  }

  if (error) {
    return (
      <DashboardShell>
        <div className="error-banner">{error}</div>
      </DashboardShell>
    );
  }

  if (!data) {
    return (
      <DashboardShell>
        <p className="empty">Loading…</p>
      </DashboardShell>
    );
  }

  const { opportunity, skills, courses } = data;
  const exams = data.exams ?? [];
  const meta = KIND_META[opportunity.kind];
  const facts = [
    opportunity.location && { icon: MapPin, label: "Location", text: opportunity.location },
    durationLabel(opportunity.durationMonths) && { icon: Clock, label: "Duration", text: durationLabel(opportunity.durationMonths)! },
    stipendLabel(opportunity) && { icon: IndianRupee, label: opportunity.kind === "job" ? "Pay" : "Stipend", text: stipendLabel(opportunity)! },
    startLabel(opportunity.startDate) && { icon: CalendarDays, label: "Start", text: startLabel(opportunity.startDate)!.replace("Starts ", "") },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; text: string }[];

  return (
    <DashboardShell>
      <motion.section className={`opp-hero kind-${opportunity.kind}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="opp-hero-top">
          <span className="opp-hero-kind">{meta.label}</span>
          {isAdmin && opportunity.status !== "published" && <span className="opp-hero-kind">{opportunity.status === "draft" ? "Draft" : opportunity.status}</span>}
          <span className="opp-hero-id">{opportunity.businessId}</span>
        </div>
        <h1>{opportunity.title}</h1>
        <p className="opp-hero-blurb">{meta.blurb}</p>
        {facts.length > 0 && (
          <div className="opp-hero-facts">
            {facts.map((f, i) => (
              <motion.div key={f.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                <f.icon size={18} />
                <span><span>{f.label}</span><strong>{f.text}</strong></span>
              </motion.div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="opp-hero-actions">
            <Link href={`/opportunities/${opportunity.id}/edit`} className="btn btn-light"><Pencil size={16} /> Edit</Link>
            {opportunity.status === "draft" && user && OPPORTUNITY_PUBLISH_ROLES.includes(user.role) && <button className="btn btn-ghost-light" onClick={publish}><Rocket size={16} /> Publish</button>}
          </div>
        )}
        <GraduationCap className="opp-hero-art" size={130} />
      </motion.section>

      <div className="opp-body">
        <div>
          <h2 className="opp-section-title">About</h2>
          <div className="opp-desc">{opportunity.description}</div>
          {skills.length > 0 && (
            <div className="opp-skills">
              {skills.map((s) => <span key={s.id} className="badge">{s.name}</span>)}
            </div>
          )}
        </div>
        {(courses.length > 0 || (!isAdmin && exams.length > 0)) && (
          <div className="opp-side">
        {!isAdmin && exams.length > 0 && (
          <aside className="opp-training opp-exam-card">
            <h2 className="opp-section-title"><ClipboardCheck size={18} /> Exam after you apply</h2>
            <p className="muted-small">
              {exams.length > 1 ? `Pick one language: ${exams.map((e) => e.language ?? e.title).join(", ")}.` : `${exams[0].language ? `${exams[0].language}, ` : ""}${exams[0].questionCount} multiple-choice questions.`} You start it straight after applying, and the timer only runs once you press Start.
            </p>
            <div className="exam-facts">
              <span><Clock size={14} /> {Math.min(...exams.map((e) => e.durationMinutes))}{exams.some((e) => e.durationMinutes !== exams[0].durationMinutes) ? "+" : ""} min</span>
              <span>Pass {Math.min(...exams.map((e) => e.passingScorePercent))}%+</span>
              <span>Up to {Math.max(...exams.map((e) => e.maxAttempts))} attempts</span>
            </div>
          </aside>
        )}
        {courses.length > 0 && (
          <aside className="opp-training">
            <h2 className="opp-section-title"><BookOpen size={18} /> Training included</h2>
            <p className="muted-small">{opportunity.kind === "program" ? "You're enrolled in these the moment you're selected." : "You're enrolled in these when you accept the offer."}</p>
            <ol>
              {courses.map((c, i) => (
                <motion.li key={c.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05 }}>
                  <span className="opp-step">{i + 1}</span>
                  <span><strong>{c.title}</strong>{isAdmin && c.status !== "published" && <span className="muted-small"> · {c.status}</span>}</span>
                </motion.li>
              ))}
            </ol>
          </aside>
        )}
          </div>
        )}
      </div>

      {isAdmin && <ApplicantsPanel opportunityId={opportunity.id} opportunityTitle={opportunity.title} />}
      {isAdmin && <ExamsPanel opportunityId={opportunity.id} />}

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

      {needsVerification && (
        <div className="notice notice-warn">
          Verify your email address before applying — open the link we emailed you.{" "}
          {resendState === "sent" ? (
            <strong>New link sent.</strong>
          ) : (
            <button className="btn btn-secondary" onClick={resendVerification} disabled={resendState === "sending"} style={{ marginLeft: "0.5rem" }}>
              {resendState === "sending" ? "Sending…" : resendState === "failed" ? "Try again" : "Resend link"}
            </button>
          )}
        </div>
      )}

      {applyError && <div className="error-banner" style={{ marginTop: "1rem" }}>{applyError}</div>}

      {!warnings && !isAdmin && opportunity.status === "published" && (
        <div className="opp-apply">
          <motion.button className="btn btn-lg" onClick={handleApply} disabled={applying} whileTap={{ scale: 0.97 }}>
            {applying ? "Submitting…" : meta.apply} <ArrowRight size={18} />
          </motion.button>
        </div>
      )}
    </DashboardShell>
  );
}
