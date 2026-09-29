import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Award, CheckCircle2, Cloud, RotateCcw, Timer, Trophy, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { Lesson, QuizQuestion } from "../../lib/lms";
import { useToast } from "../Toast";

interface Attempt { id: string; scorePercent: number; passed: boolean; submittedAt: string }
interface Review { questionId: string; selectedOptionId: string | null; correct: boolean; correctOptionId: string; explanation: string | null }
interface Result { attempt: Attempt; passingScorePercent: number; bestScorePercent: number; lessonPassed: boolean; courseCompleted: boolean; review: Review[]; late?: boolean; attemptsLeft?: number | null; internship?: { trackSlug: string; offerId: string | null } | null }
interface Draft { questionId: string; selectedOptionId: string | null }
interface LiveAttempt { id: string; startedAt: string; deadlineAt: string; answers: Draft[] }
interface QuizData { questions: QuizQuestion[]; attempts?: Attempt[]; attemptsLeft?: number | null; inProgress?: LiveAttempt | null; serverTime?: string }

const toMap = (d: Draft[]) => Object.fromEntries(d.filter((a) => a.selectedOptionId).map((a) => [a.questionId, a.selectedOptionId!]));

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One question at a time, instant grading, per-question feedback and
 * retakes. With a time limit it becomes an exam: the clock runs on the
 * server, answers are saved as you go, a reload picks up where you were,
 * and it submits itself when time runs out.
 */
export function QuizPlayer({ lesson, onGraded }: { lesson: Lesson; onGraded: (r: { lessonPassed: boolean; courseCompleted: boolean }) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const timed = !!lesson.timeLimitMinutes;
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveAttempt | null>(null);
  const [offset, setOffset] = useState(0); // server clock minus ours
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const submitting = useRef(false);
  const autoSubmitted = useRef<string | null>(null);
  const welcomed = useRef<string | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<QuizData>(`/api/v1/courses/lessons/${lesson.id}/quiz`, { accessToken });
      setQuestions(r.questions);
      setAttempts(r.attempts ?? []);
      setAttemptsLeft(r.attemptsLeft ?? null);
      if (r.serverTime) setOffset(new Date(r.serverTime).getTime() - Date.now());
      if (r.inProgress) {
        setLive(r.inProgress);
        setAnswers(toMap(r.inProgress.answers));
        setStarted(true);
        if (welcomed.current !== r.inProgress.id) {
          welcomed.current = r.inProgress.id;
          toast("Welcome back. Your exam picked up where you left off.");
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the quiz.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const draft = useCallback(() => (questions ?? []).map((q) => ({ questionId: q.id!, selectedOptionId: answers[q.id!] ?? null })), [questions, answers]);

  // Save a timed exam's answers shortly after each change.
  useEffect(() => {
    if (!live || !dirty.current) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await apiFetch(`/api/v1/courses/quiz-attempts/${live.id}/answers`, { method: "PUT", body: { answers: draft() }, accessToken });
        setSaveState("saved");
        dirty.current = false;
      } catch {
        setSaveState("offline");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [answers, live, draft, accessToken]);

  const submit = useCallback(async () => {
    if (!questions || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const r = await apiFetch<Result>(`/api/v1/courses/lessons/${lesson.id}/quiz/submit`, {
        method: "POST",
        body: { answers: draft(), ...(live ? { attemptId: live.id } : {}) },
        accessToken,
      });
      setResult(r);
      setLive(null);
      setAttempts((a) => [r.attempt, ...a]);
      if (r.attemptsLeft !== undefined) setAttemptsLeft(r.attemptsLeft);
      onGraded(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit.");
    }
    setBusy(false);
    submitting.current = false;
  }, [questions, lesson.id, draft, live, accessToken, onGraded]);

  // The countdown, and the automatic submit when it reaches zero.
  const remaining = live ? new Date(live.deadlineAt).getTime() - (now + offset) : null;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [live]);
  useEffect(() => {
    if (live && remaining !== null && remaining <= 0 && !submitting.current && autoSubmitted.current !== live.id) {
      autoSubmitted.current = live.id;
      toast("Time's up. Your answers were submitted.");
      submit();
    }
  }, [remaining, submit, toast, live]);

  async function begin() {
    setError(null);
    setAnswers({});
    setIndex(0);
    setResult(null);
    if (!timed) {
      setStarted(true);
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch<{ attempt: LiveAttempt; resumed: boolean; serverTime: string }>(`/api/v1/courses/lessons/${lesson.id}/quiz/start`, { method: "POST", accessToken });
      setOffset(new Date(r.serverTime).getTime() - Date.now());
      setLive(r.attempt);
      setAnswers(toMap(r.attempt.answers));
      setSaveState("idle");
      setStarted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the exam.");
    }
    setBusy(false);
  }

  const choose = (questionId: string, optionId: string) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
  };

  if (error) return <div className="error-banner">{error}</div>;
  if (!questions) return <div className="skeleton" style={{ height: 200 }} />;
  if (questions.length === 0) return <p className="muted-small">This quiz has no questions yet.</p>;

  const best = attempts.reduce((m, a) => Math.max(m, a.scorePercent), 0);
  const passedBefore = attempts.some((a) => a.passed);

  if (result) {
    const byId = new Map(result.review.map((r) => [r.questionId, r]));
    return (
      <motion.div className="quiz-result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <div className={`quiz-score ${result.attempt.passed ? "pass" : "fail"}`}>
          <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
            {result.attempt.passed ? <Trophy size={44} /> : <RotateCcw size={40} />}
          </motion.div>
          <div>
            <div className="quiz-score-num">{result.attempt.scorePercent}%</div>
            <div>{result.attempt.passed ? "Passed!" : `You need ${result.passingScorePercent}% to pass. Have another go.`}</div>
            {!result.attempt.passed && result.lessonPassed && <div className="muted-small">You already passed this quiz earlier (best {result.bestScorePercent}%).</div>}
          </div>
        </div>
        {result.internship?.offerId && (
          <motion.div className="quiz-offer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}>
            <Award size={22} />
            <div>
              <strong>You've earned an internship offer!</strong>
              <span>Your offer letter for the 6-month program is ready and on its way to your inbox.</span>
            </div>
            <Link href={`/internships/${result.internship.trackSlug}`} className="btn btn-sm">View offer</Link>
          </motion.div>
        )}
        <ol className="quiz-review">
          {questions.map((q, i) => {
            const r = byId.get(q.id!)!;
            return (
              <motion.li key={q.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }} className={r.correct ? "right" : "wrong"}>
                <div className="quiz-review-q">{r.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {q.questionText}</div>
                {!r.correct && (
                  <div className="muted-small">
                    {r.selectedOptionId ? <>You chose "{q.options.find((o) => o.id === r.selectedOptionId)?.text}". </> : "No answer. "}
                    Correct: "{q.options.find((o) => o.id === r.correctOptionId)?.text}"
                  </div>
                )}
                {r.explanation && <div className="quiz-explain">{r.explanation}</div>}
              </motion.li>
            );
          })}
        </ol>
        {result.late && <p className="muted-small">Time ran out, so the answers saved before the deadline were graded.</p>}
        {attemptsLeft === 0 ? (
          <p className="muted-small">You've used all your attempts for this {timed ? "exam" : "quiz"}.</p>
        ) : (
          <button className="btn btn-secondary" disabled={busy} onClick={begin}><RotateCcw size={16} /> {timed ? "Try again" : "Retake quiz"}{attemptsLeft ? ` (${attemptsLeft} left)` : ""}</button>
        )}
      </motion.div>
    );
  }

  if (!started) {
    return (
      <div className="quiz-intro">
        {timed ? (
          <div className="exam-facts">
            <span><Timer size={16} /> {lesson.timeLimitMinutes} minutes</span>
            <span>{questions.length} question{questions.length > 1 ? "s" : ""}</span>
            <span>Pass mark {lesson.passingScorePercent}%</span>
            {lesson.maxAttempts && <span>{attemptsLeft ?? lesson.maxAttempts} of {lesson.maxAttempts} attempts left</span>}
          </div>
        ) : (
          <p>{questions.length} question{questions.length > 1 ? "s" : ""}. You need {lesson.passingScorePercent}% to pass{lesson.maxAttempts ? `, with ${attemptsLeft ?? lesson.maxAttempts} of ${lesson.maxAttempts} attempts left.` : ", and you can retake it as often as you like."}</p>
        )}
        {timed && <p className="muted-small">The timer starts when you press Start and keeps running if you leave. Answers are saved as you go, and the exam submits itself when time is up.</p>}
        {attempts.length > 0 && <p className="muted-small">{passedBefore ? "Passed" : "Not passed yet"} · best score {best}% · {attempts.length} attempt{attempts.length > 1 ? "s" : ""}</p>}
        {attemptsLeft === 0 ? (
          <p className="muted-small">You've used all your attempts.</p>
        ) : (
          <motion.button className="btn" disabled={busy} onClick={begin} whileTap={{ scale: 0.96 }}>{timed ? (attempts.length ? "Start another attempt" : "Start exam") : attempts.length ? "Retake quiz" : "Start quiz"}</motion.button>
        )}
      </div>
    );
  }

  const q = questions[index];
  const answeredCount = Object.keys(answers).length;
  const last = index === questions.length - 1;

  return (
    <div className="quiz">
      {live && remaining !== null && (
        <div className={`exam-bar${remaining < 60_000 ? " urgent" : remaining < 5 * 60_000 ? " soon" : ""}`}>
          <span className="exam-clock"><Timer size={16} /> {clock(remaining)}</span>
          <div className="exam-track"><motion.div className="exam-fill" animate={{ width: `${Math.max(0, Math.min(100, (remaining / (lesson.timeLimitMinutes! * 60_000)) * 100))}%` }} transition={{ ease: "linear", duration: 0.5 }} /></div>
          <span className={`exam-save ${saveState}`}><Cloud size={14} /> {saveState === "saving" ? "Saving…" : saveState === "offline" ? "Not saved, retrying" : saveState === "saved" ? "Saved" : "Autosave on"}</span>
        </div>
      )}
      <div className="quiz-top">
        <span className="muted-small">Question {index + 1} of {questions.length}</span>
        <div className="quiz-dots">
          {questions.map((qq, i) => (
            <button key={qq.id} aria-label={`Question ${i + 1}`} className={`quiz-dot${i === index ? " current" : ""}${answers[qq.id!] ? " answered" : ""}`} onClick={() => setIndex(i)} />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          <h3 className="quiz-q">{q.questionText}</h3>
          <div className="quiz-options" role="radiogroup">
            {q.options.map((o, oi) => {
              const selected = answers[q.id!] === o.id;
              return (
                <motion.button
                  key={o.id}
                  role="radio"
                  aria-checked={selected}
                  className={`quiz-option${selected ? " selected" : ""}`}
                  onClick={() => choose(q.id!, o.id)}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="quiz-letter">{String.fromCharCode(65 + oi)}</span>
                  <span>{o.text}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="quiz-nav">
        <button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} /> Back</button>
        {last ? (
          <button className="btn" disabled={busy} onClick={submit}>{busy ? "Grading…" : answeredCount < questions.length ? `Submit (${questions.length - answeredCount} unanswered)` : "Submit answers"}</button>
        ) : (
          <button className="btn" onClick={() => setIndex(index + 1)}>Next <ArrowRight size={16} /></button>
        )}
      </div>
    </div>
  );
}
