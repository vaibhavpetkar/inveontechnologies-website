import { useEffect, useState, useCallback, useRef } from "react";
import { useRoute, Link } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

interface Question { id: string; questionText: string; options: { id: string; text: string }[]; points: number }
interface Attempt { id: string; status: string; expiresAt: string | null; scorePercent: number | null; passed: boolean | null }

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

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function TakeAssessment() {
  const [, params] = useRoute("/assessments/:applicationId");
  const { accessToken } = useAuth();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Load the attempt for this application. If it's already in progress
  // (the page was reloaded mid-attempt), fetch its questions too — the
  // backend serves them without answer keys while the attempt is open.
  const applicationId = params?.applicationId;
  const hasToken = !!accessToken;
  useEffect(() => {
    if (!applicationId || !hasToken) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch<{ attempt: Attempt }>(`/api/v1/assessment-attempts/by-application/${applicationId}`, { accessToken });
        if (r.attempt.status !== "in_progress") {
          if (!cancelled) setAttempt(r.attempt);
          return;
        }
        const full = await apiFetch<{ attempt: Attempt; questions: Question[] }>(`/api/v1/assessment-attempts/${r.attempt.id}`, { accessToken });
        if (cancelled) return;
        setAttempt(full.attempt);
        if (full.attempt.status === "in_progress") {
          setQuestions(full.questions);
          setAnswers(loadSavedAnswers(full.attempt.id));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load your assessment.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Load once per application — a silent token refresh changes
    // accessToken but must not reload the attempt mid-exam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, hasToken]);

  useEffect(() => {
    if (attempt?.status === "in_progress") saveAnswers(attempt.id, answers);
  }, [attempt?.id, attempt?.status, answers]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (!attempt || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const payload = (questions ?? []).map((q) => ({ questionId: q.id, selectedOptionId: answers[q.id] ?? null }));
      const r = await apiFetch<{ scorePercent: number; passed: boolean }>(
        `/api/v1/assessment-attempts/${attempt.id}/submit`,
        { method: "POST", body: { answers: payload }, accessToken },
      );
      setAttempt({ ...attempt, status: "scored", scorePercent: r.scorePercent, passed: r.passed });
      setQuestions(null);
      try {
        sessionStorage.removeItem(answersKey(attempt.id));
      } catch {
        // ignore
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_ATTEMPT_STATE") {
        // Already submitted or expired server-side — show the final result
        // rather than letting the countdown retry every second.
        apiFetch<{ attempt: Attempt }>(`/api/v1/assessment-attempts/${attempt.id}`, { accessToken })
          .then((r) => { setAttempt(r.attempt); setQuestions(null); })
          .catch(() => {});
      } else {
        submittedRef.current = false;
      }
      setError(err instanceof ApiError ? err.message : (auto ? "Time ran out, but submitting failed." : "Couldn't submit."));
    } finally {
      setSubmitting(false);
    }
  }, [attempt, questions, answers, accessToken]);

  // Countdown. The server is the real authority on expiry (it scores an
  // expired attempt as unanswered); this just mirrors it for the candidate
  // and auto-submits so their answers aren't lost at the buzzer.
  useEffect(() => {
    if (!attempt?.expiresAt || attempt.status !== "in_progress") return;
    const tick = () => {
      const left = new Date(attempt.expiresAt!).getTime() - Date.now();
      setRemaining(left);
      if (left <= 0 && questions) handleSubmit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt, questions, handleSubmit]);

  async function handleStart() {
    if (!attempt) return;
    setStarting(true);
    setError(null);
    try {
      const r = await apiFetch<{ attempt: Attempt; questions: Question[] }>(
        `/api/v1/assessment-attempts/${attempt.id}/start`,
        { method: "POST", accessToken },
      );
      setAttempt(r.attempt);
      setQuestions(r.questions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the assessment.");
    } finally {
      setStarting(false);
    }
  }

  if (error && !attempt) {
    return <DashboardShell nav={<CandidateNav />}><div className="error-banner">{error}</div></DashboardShell>;
  }
  if (!attempt) {
    return <DashboardShell nav={<CandidateNav />}><p className="empty">Loading…</p></DashboardShell>;
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions?.length ?? 0;

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>Assessment</h1>

      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}

      {(attempt.status === "scored" || attempt.status === "expired") && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <div className="card-title">
            {attempt.status === "expired" ? "Time expired" : "Assessment submitted"}
          </div>
          <div className="card-meta">
            Score: {attempt.scorePercent ?? 0}% — {attempt.passed ? "Passed" : "Did not meet the passing score"}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/candidate" className="btn">Back to applications</Link>
          </div>
        </div>
      )}

      {attempt.status === "not_started" && (
        <>
          <div className="notice notice-warn">
            Once you start, a timer begins and can't be paused. Unanswered questions are scored as incorrect if time runs out.
          </div>
          <div style={{ marginTop: "1.25rem" }}>
            <button className="btn" onClick={handleStart} disabled={starting}>
              {starting ? "Starting…" : "Start assessment"}
            </button>
          </div>
        </>
      )}

      {attempt.status === "in_progress" && questions && (
        <>
          <div className={`exam-timer ${remaining !== null && remaining < 60000 ? "urgent" : ""}`} style={{ marginTop: "1.25rem" }}>
            <span>Time remaining: {remaining !== null ? formatRemaining(remaining) : "—"}</span>
            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.85rem" }}>
              {answeredCount} of {totalQuestions} answered
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${totalQuestions ? (answeredCount / totalQuestions) * 100 : 0}%` }} />
          </div>

          {questions.map((q, i) => (
            <div key={q.id} className="question-block">
              <div className="question-text">{i + 1}. {q.questionText}</div>
              {q.options.map((opt) => (
                <label key={opt.id} className={`option-label ${answers[q.id] === opt.id ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === opt.id}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          ))}

          <div style={{ marginTop: "1.5rem" }}>
            <button className="btn" onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit assessment"}
            </button>
          </div>
        </>
      )}

      {attempt.status === "in_progress" && !questions && !submitting && <p className="empty">Loading questions…</p>}
    </DashboardShell>
  );
}
