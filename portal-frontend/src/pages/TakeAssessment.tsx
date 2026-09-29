import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, FileQuestion, Languages, RotateCcw, ShieldCheck, Target, Timer, Trophy, XCircle } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";

interface Question { id: string; questionText: string; options: { id: string; text: string }[]; points: number }
interface Attempt { id: string; assessmentId: string; attemptNumber: number; status: string; expiresAt: string | null; startedAt: string | null; submittedAt: string | null; scorePercent: number | null; passed: boolean | null; createdAt: string; examTitle?: string; language?: string | null }
interface Exam { id: string; title: string; description: string | null; language: string | null; durationMinutes: number; passingScorePercent: number; maxAttempts: number; questionCount: number; attemptsUsed: number; attemptsLeft: number; opensAt: string | null; closesAt: string | null; window: "open" | "upcoming" | "closed" }

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "Opens Mon 6 Oct, 10:00", "Closes …" or "Closed …" for an exam with a window; null otherwise. */
function windowLabel(e: Exam): string | null {
  if (e.window === "upcoming" && e.opensAt) return `Opens ${whenFmt.format(new Date(e.opensAt))}`;
  if (e.window === "closed" && e.closesAt) return `Closed ${whenFmt.format(new Date(e.closesAt))}`;
  if (e.closesAt) return `Closes ${whenFmt.format(new Date(e.closesAt))}`;
  return null;
}
interface Summary { applicationStatus: string; exams: Exam[]; attempts: Attempt[] }

// Answers are mirrored to sessionStorage so a reload mid-attempt doesn't wipe
// them. Storage can be unavailable (private mode, blocked site data), so
// every access is best-effort.
const answersKey = (attemptId: string) => `assessment-answers:${attemptId}`;
function loadSavedAnswers(attemptId: string): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(answersKey(attemptId)) ?? "{}");
  } catch {
    return {};
  }
}
function saveAnswers(attemptId: string, answers: Record<string, string>) {
  try {
    sessionStorage.setItem(answersKey(attemptId), JSON.stringify(answers));
  } catch {
    // Non-critical — answers still live in component state.
  }
}
function clearAnswers(attemptId: string) {
  try {
    sessionStorage.removeItem(answersKey(attemptId));
  } catch {
    // ignore
  }
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

type Stage =
  | { kind: "loading" }
  | { kind: "pick" }
  | { kind: "ready"; attempt: Attempt; exam: Exam }
  | { kind: "exam"; attempt: Attempt; exam: Exam | null; questions: Question[] }
  | { kind: "result"; attempt: Attempt; exam: Exam | null };

/** Pick a language, sit the timed exam, see the result and retry while attempts remain. */
export default function TakeAssessment() {
  const [, params] = useRoute("/assessments/:applicationId");
  const applicationId = params?.applicationId;
  const { accessToken } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const loadSummary = useCallback(async () => {
    if (!applicationId) return null;
    const s = await apiFetch<Summary>(`/api/v1/assessment-attempts/by-application/${applicationId}`, { accessToken: tokenRef.current });
    setSummary(s);
    return s;
  }, [applicationId]);

  // Load once per application. A reload mid-exam resumes the open attempt;
  // a silent token refresh must not reload anything.
  const hasToken = !!accessToken;
  useEffect(() => {
    if (!applicationId || !hasToken) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await loadSummary();
        if (!s || cancelled) return;
        const open = s.attempts.find((a) => a.status === "in_progress" || a.status === "not_started");
        const exam = open ? s.exams.find((e) => e.id === open.assessmentId) ?? null : null;
        if (open?.status === "in_progress") {
          const full = await apiFetch<{ attempt: Attempt; questions: Question[] }>(`/api/v1/assessment-attempts/${open.id}`, { accessToken: tokenRef.current });
          if (cancelled) return;
          if (full.attempt.status === "in_progress") {
            setAnswers(loadSavedAnswers(open.id));
            setStage({ kind: "exam", attempt: { ...open, ...full.attempt }, exam, questions: full.questions });
            toast("Welcome back. Your exam carried on while you were away.");
            return;
          }
          await loadSummary();
        } else if (open && exam) {
          setStage({ kind: "ready", attempt: open, exam });
          return;
        }
        setStage({ kind: "pick" });
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load your exam.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, hasToken]);

  useEffect(() => {
    if (stage.kind === "exam") saveAnswers(stage.attempt.id, answers);
  }, [stage, answers]);

  async function choose(exam: Exam) {
    if (!applicationId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ attempt: Attempt }>(`/api/v1/assessment-attempts/by-application/${applicationId}/choose`, { method: "POST", body: { assessmentId: exam.id }, accessToken });
      setStage({ kind: "ready", attempt: r.attempt, exam });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that exam.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (stage.kind !== "ready") return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ attempt: Attempt; questions: Question[] }>(`/api/v1/assessment-attempts/${stage.attempt.id}/start`, { method: "POST", accessToken });
      submittedRef.current = false;
      setAnswers({});
      setCurrent(0);
      setStage({ kind: "exam", attempt: { ...stage.attempt, ...r.attempt }, exam: stage.exam, questions: r.questions });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the exam.");
    } finally {
      setBusy(false);
    }
  }

  const submit = useCallback(async (auto = false) => {
    if (stage.kind !== "exam" || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    const { attempt, exam, questions } = stage;
    try {
      const payload = questions.map((q) => ({ questionId: q.id, selectedOptionId: answers[q.id] ?? null }));
      const r = await apiFetch<{ attempt: Attempt; scorePercent: number; passed: boolean }>(`/api/v1/assessment-attempts/${attempt.id}/submit`, { method: "POST", body: { answers: payload }, accessToken: tokenRef.current });
      clearAnswers(attempt.id);
      setStage({ kind: "result", attempt: { ...attempt, ...r.attempt, scorePercent: r.scorePercent, passed: r.passed }, exam });
      if (auto) toast("Time's up. We submitted your answers.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_ATTEMPT_STATE") {
        const r = await apiFetch<{ attempt: Attempt }>(`/api/v1/assessment-attempts/${attempt.id}`, { accessToken: tokenRef.current }).catch(() => null);
        clearAnswers(attempt.id);
        setStage({ kind: "result", attempt: { ...attempt, ...(r?.attempt ?? {}) }, exam });
      } else {
        submittedRef.current = false;
        setError(err instanceof ApiError ? err.message : auto ? "Time ran out, but submitting failed. Check your connection." : "Couldn't submit.");
      }
    } finally {
      setBusy(false);
      loadSummary().catch(() => undefined);
    }
  }, [stage, answers, accessToken, loadSummary, toast]);

  // Countdown. The server is the real authority on expiry; this mirrors it
  // and auto-submits so answers aren't lost at the buzzer.
  useEffect(() => {
    if (stage.kind !== "exam" || !stage.attempt.expiresAt) return;
    const expiresAt = new Date(stage.attempt.expiresAt).getTime();
    const tick = () => {
      const left = expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [stage, submit]);

  const back = (
    <Link href="/assessments" className="back-link"><ArrowLeft size={16} /> My exams</Link>
  );

  if (error && !summary) return <DashboardShell>{back}<div className="error-banner">{error}</div></DashboardShell>;
  if (!summary || stage.kind === "loading") return <DashboardShell>{back}<div className="skeleton" style={{ height: 320 }} /></DashboardShell>;

  const passedAttempt = summary.attempts.find((a) => a.passed);
  const anyLeft = summary.exams.some((e) => e.attemptsLeft > 0 && e.window !== "closed");

  return (
    <DashboardShell>
      {stage.kind !== "exam" && back}
      {error && <div className="error-banner">{error}</div>}
      <AnimatePresence mode="wait">
        {stage.kind === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="page-head">
              <div>
                <h1>{passedAttempt ? "Exam passed" : "Choose your exam"}</h1>
                <p>
                  {passedAttempt
                    ? "Well done. The hiring team has been told and will set up your HR round."
                    : summary.exams.length > 1
                      ? "Pick the language you're strongest in. You only need to pass one."
                      : "Read the rules, then start when you're ready. The timer only runs once you press Start."}
                </p>
              </div>
            </div>

            {passedAttempt ? (
              <div className="exam-outcome pass">
                <Trophy size={34} />
                <div>
                  <strong>You scored {passedAttempt.scorePercent}% on the {passedAttempt.language ? `${passedAttempt.language} ` : ""}exam</strong>
                  <span>Next up: a short conversation with HR. You'll get an invite with a meeting link.</span>
                </div>
              </div>
            ) : summary.applicationStatus !== "assessment_invited" && !anyLeft ? (
              <div className="exam-outcome fail">
                <XCircle size={30} />
                <div>
                  <strong>No attempts left</strong>
                  <span>Thanks for taking the exam. The hiring team will review your application and let you know.</span>
                </div>
              </div>
            ) : summary.exams.length === 0 ? (
              <p className="empty">This opening doesn't have an exam yet. The hiring team will be in touch.</p>
            ) : (
              <div className="exam-pick-grid">
                {summary.exams.map((e, i) => (
                  <motion.button
                    key={e.id}
                    className="exam-pick"
                    disabled={busy || e.attemptsLeft === 0 || e.window !== "open" || summary.applicationStatus !== "assessment_invited"}
                    onClick={() => choose(e)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="exam-lang"><Languages size={16} /> {e.language ?? "General"}</span>
                    <strong>{e.title}</strong>
                    {e.description && <span className="muted-small">{e.description}</span>}
                    <span className="exam-facts">
                      <span><Clock size={14} /> {e.durationMinutes} min</span>
                      <span><FileQuestion size={14} /> {e.questionCount} questions</span>
                      <span><Target size={14} /> Pass {e.passingScorePercent}%</span>
                    </span>
                    {windowLabel(e) && (
                      <span className={`exam-window ${e.window}`}><CalendarClock size={14} /> {windowLabel(e)}</span>
                    )}
                    <span className={`exam-attempts${e.attemptsLeft === 0 ? " none" : ""}`}>
                      {e.attemptsLeft === 0 ? "No attempts left" : `${e.attemptsLeft} of ${e.maxAttempts} attempt${e.maxAttempts === 1 ? "" : "s"} left`}
                    </span>
                  </motion.button>
                ))}
              </div>
            )}

            {summary.attempts.some((a) => a.status === "scored" || a.status === "expired") && (
              <section className="panel" style={{ marginTop: "1.5rem" }}>
                <h2 className="opp-section-title">Your attempts</h2>
                <ul className="exam-history">
                  {summary.attempts.filter((a) => a.status === "scored" || a.status === "expired").map((a) => (
                    <li key={a.id}>
                      {a.passed ? <CheckCircle2 size={18} className="tone-good" /> : <XCircle size={18} className="tone-bad" />}
                      <span>{a.language ?? a.examTitle} · attempt {a.attemptNumber}{a.status === "expired" ? " · time ran out" : ""}</span>
                      <strong>{a.scorePercent ?? 0}%</strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </motion.div>
        )}

        {stage.kind === "ready" && (
          <motion.div key="ready" className="exam-ready" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <span className="exam-lang"><Languages size={16} /> {stage.exam.language ?? "General"}</span>
            <h1>{stage.exam.title}</h1>
            <div className="exam-ready-facts">
              <div><Timer size={20} /><strong>{stage.exam.durationMinutes} min</strong><span>time limit</span></div>
              <div><FileQuestion size={20} /><strong>{stage.exam.questionCount}</strong><span>questions</span></div>
              <div><Target size={20} /><strong>{stage.exam.passingScorePercent}%</strong><span>to pass</span></div>
              <div><RotateCcw size={20} /><strong>{stage.attempt.attemptNumber} of {stage.exam.maxAttempts}</strong><span>attempt</span></div>
            </div>
            <ul className="exam-rules">
              <li><ShieldCheck size={16} /> The timer starts when you press Start and can't be paused.</li>
              <li><ShieldCheck size={16} /> Your answers are saved as you go, so a dropped connection won't lose them.</li>
              <li><ShieldCheck size={16} /> When time runs out, whatever you've answered is submitted for you.</li>
              {stage.exam.closesAt && new Date(stage.exam.closesAt).getTime() < Date.now() + stage.exam.durationMinutes * 60_000 && (
                <li className="exam-rule-warn"><CalendarClock size={16} /> The exam closes {whenFmt.format(new Date(stage.exam.closesAt))}, so you'll have less than the full {stage.exam.durationMinutes} minutes.</li>
              )}
            </ul>
            <div className="exam-ready-actions">
              <button className="btn btn-secondary" onClick={() => setStage({ kind: "pick" })} disabled={busy}>Pick another</button>
              <motion.button className="btn btn-lg" onClick={start} disabled={busy} whileTap={{ scale: 0.97 }}>{busy ? "Starting…" : "Start exam"}</motion.button>
            </div>
          </motion.div>
        )}

        {stage.kind === "exam" && (() => {
          const q = stage.questions[current];
          const answered = Object.keys(answers).length;
          const urgent = remaining !== null && remaining < 60_000;
          return (
            <motion.div key="exam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className={`exam-bar${urgent ? " urgent" : ""}`}>
                <span className="exam-lang"><Languages size={14} /> {stage.exam?.language ?? stage.attempt.language ?? "Exam"}</span>
                <span className="exam-clock"><Timer size={16} /> {remaining !== null ? formatRemaining(remaining) : "--:--"}</span>
                <span className="muted-small">{answered} of {stage.questions.length} answered</span>
              </div>
              <div className="exam-dots" role="tablist" aria-label="Questions">
                {stage.questions.map((qq, i) => (
                  <button key={qq.id} role="tab" aria-selected={i === current} aria-label={`Question ${i + 1}`} className={`${i === current ? "current" : ""}${answers[qq.id] ? " done" : ""}`} onClick={() => setCurrent(i)}>{i + 1}</button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={q.id} className="exam-question" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
                  <span className="muted-small">Question {current + 1} of {stage.questions.length}{q.points > 1 ? ` · ${q.points} points` : ""}</span>
                  <h2>{q.questionText}</h2>
                  <div className="exam-options">
                    {q.options.map((o, oi) => (
                      <button key={o.id} className={answers[q.id] === o.id ? "selected" : ""} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}>
                        <span className="exam-option-key">{String.fromCharCode(65 + oi)}</span>
                        {o.text}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
              <div className="exam-nav">
                <button className="btn btn-secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</button>
                {current < stage.questions.length - 1 ? (
                  <button className="btn" onClick={() => setCurrent((c) => c + 1)}>Next</button>
                ) : (
                  <button className="btn" onClick={() => submit(false)} disabled={busy}>{busy ? "Submitting…" : answered < stage.questions.length ? `Submit (${stage.questions.length - answered} unanswered)` : "Submit exam"}</button>
                )}
              </div>
            </motion.div>
          );
        })()}

        {stage.kind === "result" && (() => {
          const passed = !!stage.attempt.passed;
          const exam = summary.exams.find((e) => e.id === stage.attempt.assessmentId);
          const left = summary.exams.filter((e) => e.attemptsLeft > 0 && e.window !== "closed");
          return (
            <motion.div key="result" className={`exam-result ${passed ? "pass" : "fail"}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="exam-score" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" className="track" />
                  <motion.circle cx="60" cy="60" r="52" className="fill" strokeDasharray={2 * Math.PI * 52} initial={{ strokeDashoffset: 2 * Math.PI * 52 }} animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - (stage.attempt.scorePercent ?? 0) / 100) }} transition={{ duration: 0.9, ease: "easeOut" }} />
                </svg>
                <strong>{stage.attempt.scorePercent ?? 0}%</strong>
              </motion.div>
              <h1>{passed ? "You passed!" : stage.attempt.status === "expired" ? "Time ran out" : "Not this time"}</h1>
              <p>
                {passed
                  ? "The hiring team has been told. Next is a short HR conversation, and you'll get an invite with a meeting link."
                  : `You needed ${exam?.passingScorePercent ?? stage.exam?.passingScorePercent ?? 0}% to pass.${left.length ? " You can try again." : " You've used all your attempts, so the team will review your application."}`}
              </p>
              <div className="exam-ready-actions">
                <Link href={passed ? `/journey/${applicationId}` : "/candidate"} className={passed ? "btn" : "btn btn-secondary"}>{passed ? "See next steps" : "My applications"}</Link>
                {!passed && left.length > 0 && <button className="btn" onClick={() => setStage({ kind: "pick" })}><RotateCcw size={16} /> Try again</button>}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </DashboardShell>
  );
}
