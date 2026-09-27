import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../Toast";

export interface ExamRow {
  id: string;
  title: string;
  description: string | null;
  language: string | null;
  durationMinutes: number;
  passingScorePercent: number;
  maxAttempts: number;
  isActive: boolean;
  questionCount: number;
  attemptCount: number;
  passCount: number;
}

interface Question { questionText: string; options: { id: string; text: string }[]; correctOptionId: string; points: number }

const blankQuestion = (): Question => ({ questionText: "", options: [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }], correctOptionId: "a", points: 1 });
const LANGUAGE_SUGGESTIONS = ["JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "Go", "PHP", "Kotlin", "Swift", "SQL", "Aptitude"];

interface Props {
  opportunityId: string;
  exam: ExamRow | null; // null = new exam
  onClose: () => void;
  onSaved: () => void;
}

/** Side drawer to create or edit an opening's exam: its language, rules and multiple-choice questions. */
export function ExamEditor({ opportunityId, exam, onClose, onSaved }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const locked = !!exam && exam.attemptCount > 0;
  const [form, setForm] = useState({
    title: exam?.title ?? "",
    language: exam?.language ?? "",
    description: exam?.description ?? "",
    durationMinutes: String(exam?.durationMinutes ?? 30),
    passingScorePercent: String(exam?.passingScorePercent ?? 60),
    maxAttempts: String(exam?.maxAttempts ?? 2),
  });
  const [questions, setQuestions] = useState<Question[]>(exam ? [] : [blankQuestion()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exam) return;
    apiFetch<{ questions: Question[] }>(`/api/v1/assessments/${exam.id}`, { accessToken })
      .then((r) => setQuestions(r.questions.map((q) => ({ questionText: q.questionText, options: q.options, correctOptionId: q.correctOptionId, points: q.points }))))
      .catch(() => setError("Couldn't load the questions."));
  }, [exam, accessToken]);

  const updateQ = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = questions
      .filter((q) => q.questionText.trim())
      .map((q) => ({ ...q, questionText: q.questionText.trim(), options: q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim() })) }));
    if (!locked) {
      if (clean.length === 0) return setError("Add at least one question.");
      const bad = clean.findIndex((q) => q.options.length < 2 || !q.options.some((o) => o.id === q.correctOptionId));
      if (bad >= 0) return setError(`Question ${bad + 1} needs at least two options, with the correct one filled in.`);
    }
    setBusy(true);
    const body = {
      title: form.title.trim(),
      language: form.language.trim() || null,
      description: form.description.trim() || undefined,
      durationMinutes: Number(form.durationMinutes),
      passingScorePercent: Number(form.passingScorePercent),
      maxAttempts: Number(form.maxAttempts),
      ...(locked ? {} : { questions: clean }),
    };
    try {
      if (exam) await apiFetch(`/api/v1/assessments/${exam.id}`, { method: "PUT", body, accessToken });
      else await apiFetch("/api/v1/assessments", { method: "POST", body: { ...body, opportunityId }, accessToken });
      toast(exam ? "Exam saved" : "Exam added. New applicants will take it straight after applying.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.code === "VALIDATION_ERROR" ? "Check the title (3+ characters) and each question (3+ characters)." : err.message) : "Couldn't save the exam.");
      setBusy(false);
    }
  }

  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="task-drawer lesson-editor" role="dialog" aria-modal="true" aria-label={exam ? "Edit exam" : "New exam"} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}>
        <form onSubmit={save}>
          <div className="drawer-head">
            <h2 className="drawer-title">{exam ? "Edit exam" : "New exam"}</h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}><X size={18} /></button>
          </div>
          {error && <div className="error-banner">{error}</div>}

          <div className="field">
            <label htmlFor="ex-lang">Language or track</label>
            <input id="ex-lang" list="ex-lang-list" maxLength={60} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="e.g. JavaScript" />
            <datalist id="ex-lang-list">{LANGUAGE_SUGGESTIONS.map((l) => <option key={l} value={l} />)}</datalist>
            <span className="muted-small">Add one exam per language. Candidates pick the one they're strongest in and only need to pass one.</span>
          </div>
          <div className="field"><label htmlFor="ex-title">Title</label><input id="ex-title" required minLength={3} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.language ? `${form.language} fundamentals` : "e.g. JavaScript fundamentals"} /></div>
          <div className="field"><label htmlFor="ex-desc">What it covers (optional)</label><textarea id="ex-desc" rows={2} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label htmlFor="ex-dur">Time limit (min)</label><input id="ex-dur" type="number" required min={1} max={300} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
            <div className="field"><label htmlFor="ex-pass">Pass mark (%)</label><input id="ex-pass" type="number" required min={0} max={100} value={form.passingScorePercent} onChange={(e) => setForm({ ...form, passingScorePercent: e.target.value })} /></div>
            <div className="field"><label htmlFor="ex-att">Attempts allowed</label><input id="ex-att" type="number" required min={1} max={10} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })} /></div>
          </div>

          <div className="quiz-editor">
            <h3>Questions {questions.length > 0 && <span className="muted-small">· {questions.length} questions, {totalPoints} points</span>}</h3>
            {locked && (
              <div className="notice notice-warn"><Lock size={14} /> {exam!.attemptCount} candidate{exam!.attemptCount === 1 ? " has" : "s have"} sat this exam, so its questions are locked. You can still change the rules, or switch it off and add a new exam.</div>
            )}
            <AnimatePresence initial={false}>
              {questions.map((q, i) => (
                <motion.div key={i} className="qe-card" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <div className="qe-head">
                    <span className="outline-num">{i + 1}</span>
                    <input className="qe-q" aria-label={`Question ${i + 1}`} placeholder="Question" disabled={locked} value={q.questionText} onChange={(e) => updateQ(i, { questionText: e.target.value })} />
                    <input className="qe-points" type="number" min={1} max={20} aria-label="Points" title="Points" disabled={locked} value={q.points} onChange={(e) => updateQ(i, { points: Number(e.target.value) || 1 })} />
                    {!locked && <button type="button" className="icon-button" aria-label="Remove question" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
                  </div>
                  {q.options.map((o, oi) => (
                    <div key={o.id} className={`qe-option${q.correctOptionId === o.id ? " correct" : ""}`}>
                      <button type="button" className="qe-correct" disabled={locked} aria-label={`Mark option ${oi + 1} correct`} title="Mark as the correct answer" onClick={() => updateQ(i, { correctOptionId: o.id })}>
                        {q.correctOptionId === o.id ? <Check size={14} /> : String.fromCharCode(65 + oi)}
                      </button>
                      <input aria-label={`Option ${oi + 1}`} disabled={locked} placeholder={`Option ${String.fromCharCode(65 + oi)}`} value={o.text} onChange={(e) => updateQ(i, { options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
                      {!locked && q.options.length > 2 && (
                        <button type="button" className="icon-button" aria-label="Remove option" onClick={() => updateQ(i, { options: q.options.filter((x) => x.id !== o.id), correctOptionId: q.correctOptionId === o.id ? q.options.find((x) => x.id !== o.id)!.id : q.correctOptionId })}><X size={14} /></button>
                      )}
                    </div>
                  ))}
                  {!locked && q.options.length < 6 && (
                    <div className="qe-foot">
                      <button type="button" className="link-button" onClick={() => updateQ(i, { options: [...q.options, { id: nextOptionId(q), text: "" }] })}><Plus size={14} /> Option</button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {!locked && <button type="button" className="btn btn-secondary" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}><Plus size={16} /> Add question</button>}
          </div>

          <div className="drawer-actions sticky-actions">
            <button className="btn" disabled={busy}>{busy ? "Saving…" : exam ? "Save exam" : "Add exam"}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </motion.aside>
    </>
  );
}

function nextOptionId(q: Question) {
  const used = new Set(q.options.map((o) => o.id));
  for (const c of "abcdefgh") if (!used.has(c)) return c;
  return `o${q.options.length}`;
}
