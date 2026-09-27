import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { ENROLLMENT_LABELS, type EnrollmentStatus } from "../../lib/journey";
import { Avatar } from "../Avatar";
import { ApplicantDrawer } from "./ApplicantDrawer";

export interface ApplicantRow {
  id: string;
  businessId: string | null;
  status: string;
  createdAt: string;
  userId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  enrollmentId: string | null;
  enrollmentStatus: EnrollmentStatus | null;
  trialEndsAt: string | null;
  joiningSubmittedAt: string | null;
  exam: { scorePercent: number | null; passed: boolean | null; language: string | null } | null;
  interview: { scheduledAt: string; status: string; decision: string | null } | null;
}

type Filter = "all" | "exam" | "hr" | "program" | "closed";
const FILTERS: { key: Filter; label: string; match: (a: ApplicantRow) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "exam", label: "Exam", match: (a) => ["submitted", "under_review", "assessment_invited"].includes(a.status) },
  { key: "hr", label: "HR round", match: (a) => a.status === "assessment_completed" || (!a.enrollmentId && !["rejected", "withdrawn"].includes(a.status) && !!a.interview) },
  { key: "program", label: "In program", match: (a) => !!a.enrollmentId },
  { key: "closed", label: "Closed", match: (a) => ["rejected", "withdrawn"].includes(a.status) },
];

/** Next thing staff need to do for an applicant, in a few words. */
function nextUp(a: ApplicantRow): { text: string; tone: "warn" | "good" | "muted" } {
  if (a.status === "rejected") return { text: "Rejected", tone: "muted" };
  if (a.status === "withdrawn") return { text: "Withdrawn", tone: "muted" };
  if (a.enrollmentStatus) {
    if (a.enrollmentStatus === "paid" || a.enrollmentStatus === "waived") return a.joiningSubmittedAt ? { text: "Book sessions", tone: "warn" } : { text: "Waiting for joining form", tone: "muted" };
    return { text: ENROLLMENT_LABELS[a.enrollmentStatus], tone: a.enrollmentStatus === "trial_expired" ? "warn" : "muted" };
  }
  if (a.interview?.status === "scheduled") return { text: "HR round booked", tone: "muted" };
  if (a.interview?.status === "completed") return { text: a.interview.decision === "hold" ? "HR on hold" : "HR done", tone: "muted" };
  if (a.status === "assessment_completed") return a.exam?.passed ? { text: "Book HR round", tone: "warn" } : { text: "Failed exam", tone: "muted" };
  if (a.status === "assessment_invited") return { text: "Taking exam", tone: "muted" };
  return { text: "Review", tone: "warn" };
}

export function ApplicantsPanel({ opportunityId, opportunityTitle }: { opportunityId: string; opportunityTitle: string }) {
  const { accessToken } = useAuth();
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [rows, setRows] = useState<ApplicantRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const openId = new URLSearchParams(search).get("applicant");

  const load = useCallback(() => {
    apiFetch<{ applicants: ApplicantRow[] }>(`/api/v1/program/applicants?opportunityId=${opportunityId}`, { accessToken })
      .then((r) => setRows(r.applicants))
      .catch(() => setRows([]));
  }, [opportunityId, accessToken]);
  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, rows?.filter(f.match).length ?? 0])), [rows]);
  const shown = rows?.filter(FILTERS.find((f) => f.key === filter)!.match) ?? [];
  const open = (id: string | null) => navigate(id ? `${location}?applicant=${id}` : location, { replace: true });

  return (
    <section className="panel applicants-panel">
      <div className="exams-panel-head">
        <h2 className="opp-section-title"><Users size={18} /> Applicants {rows && <span className="muted-small">· {rows.length}</span>}</h2>
      </div>
      <div className="seg-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
            {f.label} <span>{counts[f.key]}</span>
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : shown.length === 0 ? (
        <p className="empty">{rows.length === 0 ? "No one has applied yet." : "No one at this stage."}</p>
      ) : (
        <ul className="applicant-rows">
          <AnimatePresence initial={false}>
            {shown.map((a) => {
              const next = nextUp(a);
              return (
                <motion.li key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <button className="applicant-row" onClick={() => open(a.id)}>
                    <Avatar email={a.email} name={a.fullName ?? undefined} size={34} />
                    <span className="applicant-who">
                      <strong>{a.fullName || a.email}</strong>
                      <span className="muted-small">{a.fullName ? a.email : a.businessId}</span>
                    </span>
                    <span className="applicant-exam">
                      {a.exam ? (
                        <span className={`score-pill ${a.exam.passed ? "good" : "bad"}`}>{a.exam.language ?? "Exam"} {a.exam.scorePercent}%</span>
                      ) : (
                        <span className="muted-small">No exam</span>
                      )}
                    </span>
                    <span className={`next-pill ${next.tone}`}>{next.text}</span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <AnimatePresence>
        {openId && (
          <ApplicantDrawer key={openId} applicationId={openId} opportunityTitle={opportunityTitle} onClose={() => open(null)} onChanged={load} />
        )}
      </AnimatePresence>
    </section>
  );
}
