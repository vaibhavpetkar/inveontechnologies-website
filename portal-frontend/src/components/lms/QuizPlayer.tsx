import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Trophy, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { Lesson, QuizQuestion } from "../../lib/lms";

interface Attempt { id: string; scorePercent: number; passed: boolean; submittedAt: string }
interface Review { questionId: string; selectedOptionId: string | null; correct: boolean; correctOptionId: string; explanation: string | null }
interface Result { attempt: Attempt; passingScorePercent: number; bestScorePercent: number; lessonPassed: boolean; courseCompleted: boolean; review: Review[] }

/** One question at a time, instant grading, per-question feedback and retakes. */
export function QuizPlayer({ lesson, onGraded }: { lesson: Lesson; onGraded: (r: { lessonPassed: boolean; courseCompleted: boolean }) => void }) {
  const { accessToken } = useAuth();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ questions: QuizQuestion[]; attempts?: Attempt[] }>(`/api/v1/courses/lessons/${lesson.id}/quiz`, { accessToken });
      setQuestions(r.questions);
      setAttempts(r.attempts ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the quiz.");
    }
  }, [lesson.id, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!questions) return;
    setBusy(true);
    try {
      const r = await apiFetch<Result>(`/api/v1/courses/lessons/${lesson.id}/quiz/submit`, {
        method: "POST",
        body: { answers: questions.map((q) => ({ questionId: q.id, selectedOptionId: answers[q.id!] ?? null })) },
        accessToken,
      });
      setResult(r);
      setAttempts((a) => [r.attempt, ...a]);
      onGraded(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit.");
    }
    setBusy(false);
  }

  function retake() {
    setAnswers({});
    setIndex(0);
    setResult(null);
    setStarted(true);
  }

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
        <button className="btn btn-secondary" onClick={retake}><RotateCcw size={16} /> Retake quiz</button>
      </motion.div>
    );
  }

  if (!started) {
    return (
      <div className="quiz-intro">
        <p>{questions.length} question{questions.length > 1 ? "s" : ""}. You need {lesson.passingScorePercent}% to pass, and you can retake it as often as you like.</p>
        {attempts.length > 0 && <p className="muted-small">{passedBefore ? "Passed" : "Not passed yet"} · best score {best}% · {attempts.length} attempt{attempts.length > 1 ? "s" : ""}</p>}
        <motion.button className="btn" onClick={() => setStarted(true)} whileTap={{ scale: 0.96 }}>{attempts.length ? "Retake quiz" : "Start quiz"}</motion.button>
      </div>
    );
  }

  const q = questions[index];
  const answeredCount = Object.keys(answers).length;
  const last = index === questions.length - 1;

  return (
    <div className="quiz">
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
                  onClick={() => setAnswers({ ...answers, [q.id!]: o.id })}
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
