import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Award, BookOpen, Check, ClipboardCheck, CreditCard, Download, GraduationCap, Lock, Map as MapIcon, ShieldCheck, Trophy } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AssignmentItem } from "../components/internships/AssignmentItem";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { openCashfreeCheckout } from "../lib/journey";
import { openPdf } from "../lib/letters";
import { inr, stageOf, type TrackDetail } from "../lib/internships";
import { useToast } from "../components/Toast";

const STEP_LABELS = ["Course", "Final exam", "Offer letter", "Pay & join", "Roadmap"];
const STEP_ICONS = [BookOpen, ClipboardCheck, Award, CreditCard, MapIcon];

/** One track: how to join, the offer and payment, then the month-by-month roadmap of assignments. */
export default function InternshipTrack() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(search).get("assignment"));
  const [busy, setBusy] = useState(false);
  const verified = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<TrackDetail>(`/api/v1/internships/${slug}`, { accessToken }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This internship track doesn't exist." : "Couldn't load this track.");
    }
  }, [slug, accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  // Back from Cashfree: confirm the payment straight away (the webhook may lag).
  const orderId = new URLSearchParams(search).get("order_id");
  useEffect(() => {
    const enrollmentId = data?.me.enrollment?.id;
    if (!orderId || !enrollmentId || verified.current) return;
    verified.current = true;
    apiFetch<{ orderStatus: string }>(`/api/v1/program/enrollments/${enrollmentId}/verify`, { method: "POST", body: { orderId }, accessToken })
      .then((r) => {
        toast(r.orderStatus === "PAID" ? "Payment received. Welcome to the program!" : "The payment didn't go through. You can try again.");
        navigate(`/internships/${slug}`, { replace: true });
        load();
      })
      .catch(() => toast("We couldn't confirm the payment yet. It'll show here once Cashfree tells us."));
  }, [orderId, data?.me.enrollment?.id, accessToken, toast, navigate, slug, load]);

  // Opening a link to one assignment scrolls to it.
  useEffect(() => {
    if (data && openId) document.getElementById(`assignment-${openId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  async function pay() {
    if (!data?.me.enrollment) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ paymentSessionId: string; mode: "sandbox" | "production" }>(`/api/v1/program/enrollments/${data.me.enrollment.id}/pay`, { method: "POST", accessToken });
      await openCashfreeCheckout(r.paymentSessionId, r.mode);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't open the payment page.", "error");
      setBusy(false);
    }
  }

  async function enrollAndGo() {
    if (!data?.track.courseId) return;
    if (!data.me.course) {
      await apiFetch(`/api/v1/courses/${data.track.courseId}/enroll`, { method: "POST", body: {}, accessToken }).catch(() => null);
    }
    navigate(`/learn/${data.track.courseId}`);
  }

  if (error) return <DashboardShell><div className="error-banner">{error}</div></DashboardShell>;
  if (!data) return <DashboardShell><div className="skeleton" style={{ height: 320 }} /></DashboardShell>;

  const { track, me, progress } = data;
  const stage = stageOf(me);
  const outOfAttempts = !!me.exam && !me.exam.passed && me.exam.attemptsLeft === 0;
  const pct = progress.total ? Math.round((progress.approved / progress.total) * 100) : 0;

  return (
    <DashboardShell>
      <Link href="/internships" className="link-button back-link"><ArrowLeft size={15} /> All internships</Link>
      <header className="track-head">
        <div>
          <h1>{track.title}</h1>
          <p>{track.tagline} · {track.durationMonths} months · {inr(track.fee)}</p>
        </div>
      </header>

      <ol className="track-stepper" aria-label="Your progress">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const Icon = STEP_ICONS[i];
          const state = n < stage.step || (n === 5 && me.unlocked) ? "done" : n === stage.step ? "current" : "todo";
          return (
            <li key={label} className={`step-${state}`}>
              <span className="step-dot">{state === "done" ? <Check size={15} /> : <Icon size={15} />}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {!me.offer && !me.unlocked && (
        <motion.section className="panel join-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <GraduationCap size={28} className="join-icon" />
          <div>
            <h2>{me.course ? "Finish the course, then pass the final exam" : "Start with the free course"}</h2>
            <p className="muted-small">
              {me.course ? `${me.course.done} of ${me.course.total} lessons done.` : "Study each technology on the roadmap at your own pace."} The final exam is at the end of the course: score {me.exam?.passPercent ?? 60}% or more to receive your offer letter.
              {me.exam && me.exam.attempts > 0 && ` Best score so far: ${me.exam.best}%${me.exam.attemptsLeft !== null ? `, ${me.exam.attemptsLeft} attempt${me.exam.attemptsLeft === 1 ? "" : "s"} left` : ""}.`}
            </p>
            {outOfAttempts ? (
              <p className="muted-small">You've used all your exam attempts. Contact the team to ask for another attempt.</p>
            ) : (
              <button className="btn" onClick={enrollAndGo}><BookOpen size={16} /> {me.course ? "Continue the course" : "Start the free course"}</button>
            )}
          </div>
        </motion.section>
      )}

      {me.offer && !me.unlocked && (
        <motion.section className="offer-card" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
          <Trophy size={34} className="offer-trophy" />
          <div className="offer-main">
            <span className="offer-kicker">Offer letter · {me.offer.referenceNo}</span>
            <h2>Congratulations! You scored {me.offer.examScore}% and earned a place in the program.</h2>
            <p>Pay the one-time fee of <strong>{inr(me.offer.fee)}</strong> to accept. Your roadmap unlocks immediately and you join Inveon as an intern, with an employee ID and an appointment letter.</p>
            <div className="offer-actions">
              <button className="btn btn-light" onClick={() => openPdf(`/api/v1/internships/offers/${me.offer!.id}/pdf`, accessToken).catch(() => toast("Couldn't open the letter.", "error"))}><Download size={16} /> Read the offer letter</button>
              {data.payments.enabled ? (
                <button className="btn btn-pay" disabled={busy} onClick={pay}><CreditCard size={16} /> {busy ? "Opening payment…" : `Accept and pay ${inr(me.offer.fee)}`}</button>
              ) : (
                <span className="offer-note">Online payment isn't switched on yet. Contact the team to pay by UPI or bank transfer; your roadmap unlocks as soon as they record it.</span>
              )}
            </div>
            {data.payments.enabled && <p className="offer-secure"><ShieldCheck size={14} /> Paid securely through Cashfree: UPI, cards or net banking.</p>}
          </div>
        </motion.section>
      )}

      {me.unlocked && (
        <section className="roadmap-summary">
          <div className="ring-stat">
            <svg viewBox="0 0 80 80" aria-hidden>
              <circle cx="40" cy="40" r="34" className="ring-bg" />
              <motion.circle cx="40" cy="40" r="34" className="ring-fg" strokeDasharray={2 * Math.PI * 34} initial={{ strokeDashoffset: 2 * Math.PI * 34 }} animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - pct / 100) }} transition={{ duration: 0.9, ease: "easeOut" }} />
            </svg>
            <strong>{pct}%</strong>
          </div>
          <div className="summary-facts">
            <div><strong>{progress.approved}/{progress.total}</strong><span>approved</span></div>
            <div><strong>{progress.marks}/{progress.maxMarks}</strong><span>marks</span></div>
            <div><strong>{progress.waiting}</strong><span>in review</span></div>
            <div><strong>{progress.changes}</strong><span>to fix</span></div>
          </div>
        </section>
      )}

      <h2 className="roadmap-title"><MapIcon size={19} /> Your {track.durationMonths}-month roadmap {!me.unlocked && <span className="pill pill-slate"><Lock size={11} /> Unlocks when you join</span>}</h2>
      <ol className="roadmap">
        {data.phases.map((phase, i) => {
          const items = phase.skills.flatMap((s) => s.assignments);
          const done = items.filter((a) => a.submission?.status === "approved").length;
          return (
            <motion.li key={phase.month} className={`roadmap-month${done === items.length && items.length ? " complete" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <div className="month-marker"><span>M{phase.month}</span></div>
              <div className="month-card">
                <div className="month-head">
                  <div>
                    <span className="muted-small">Month {phase.month}</span>
                    <h3>{phase.title}</h3>
                  </div>
                  <span className="muted-small">{done}/{items.length} done</span>
                </div>
                {phase.skills.map((skill) => (
                  <div key={skill.key} className="month-skill">
                    <span className="skill-chip">{skill.label}</span>
                    <ul className="assignment-list">
                      {skill.assignments.map((a) => (
                        <AssignmentItem key={a.id} assignment={a} locked={!me.unlocked} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} onSubmitted={load} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </DashboardShell>
  );
}
