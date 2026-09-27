import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { embedFor, TYPE_META, type ContentType, type Lesson, type QuizQuestion } from "../../lib/lms";
import { useToast } from "../Toast";

interface Props {
  lesson: Lesson | null; // null = new lesson
  moduleId: string;
  onClose: () => void;
  onSaved: () => void;
}

const blankQuestion = (): QuizQuestion => ({ questionText: "", options: [{ id: "a", text: "" }, { id: "b", text: "" }], correctOptionId: "a", explanation: "", points: 1 });

/** Side drawer to create or edit a lesson, including a quiz's questions. */
export function LessonEditor({ lesson, moduleId, onClose, onSaved }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    title: lesson?.title ?? "",
    contentType: (lesson?.contentType ?? "video") as ContentType,
    contentUrl: lesson?.contentUrl ?? "",
    contentText: lesson?.contentText ?? "",
    durationMinutes: lesson?.durationMinutes ? String(lesson.durationMinutes) : "",
    required: lesson?.required ?? true,
    passingScorePercent: lesson?.passingScorePercent ?? 70,
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lesson || lesson.contentType !== "test") return;
    apiFetch<{ questions: QuizQuestion[] }>(`/api/v1/courses/lessons/${lesson.id}/quiz`, { accessToken })
      .then((r) => setQuestions(r.questions))
      .catch(() => {});
  }, [lesson, accessToken]);

  useEffect(() => {
    if (form.contentType === "test" && questions.length === 0) setQuestions([blankQuestion()]);
  }, [form.contentType]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateQ = (i: number, patch: Partial<QuizQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        contentType: form.contentType,
        contentUrl: form.contentUrl.trim() || null,
        contentText: form.contentText.trim() || null,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        required: form.required,
        passingScorePercent: Number(form.passingScorePercent),
      };
      let id = lesson?.id;
      if (id) {
        await apiFetch(`/api/v1/courses/lessons/${id}`, { method: "PUT", body, accessToken });
      } else {
        const created = await apiFetch<{ lesson: Lesson }>(`/api/v1/courses/modules/${moduleId}/lessons`, {
          method: "POST",
          body: { ...body, contentUrl: body.contentUrl ?? undefined, contentText: body.contentText ?? undefined, durationMinutes: body.durationMinutes ?? undefined, orderIndex: 999 },
          accessToken,
        });
        id = created.lesson.id;
      }
      if (form.contentType === "test") {
        const clean = questions
          .filter((q) => q.questionText.trim())
          .map((q) => ({ questionText: q.questionText.trim(), options: q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim() })), correctOptionId: q.correctOptionId, explanation: q.explanation?.trim() || null, points: q.points || 1 }));
        await apiFetch(`/api/v1/courses/lessons/${id}/quiz`, { method: "PUT", body: { questions: clean }, accessToken });
      }
      toast(lesson ? "Lesson saved" : "Lesson added");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the lesson.");
      setBusy(false);
    }
  }

  const embed = embedFor(form.contentUrl.trim() || null);

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="task-drawer lesson-editor" role="dialog" aria-modal="true" aria-label="Edit lesson" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}>
        <form onSubmit={save}>
          <div className="drawer-head">
            <h2 className="drawer-title">{lesson ? "Edit lesson" : "New lesson"}</h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}><X size={18} /></button>
          </div>
          {error && <div className="error-banner">{error}</div>}

          <div className="type-picker" role="radiogroup" aria-label="Lesson type">
            {(Object.keys(TYPE_META) as ContentType[]).map((t) => {
              const Icon = TYPE_META[t].icon;
              return (
                <button type="button" key={t} role="radio" aria-checked={form.contentType === t} className={form.contentType === t ? "active" : ""} onClick={() => setForm({ ...form, contentType: t })}>
                  {form.contentType === t && <motion.span layoutId="type-pick" className="type-pick-bg" />}
                  <Icon size={18} />
                  <span>{TYPE_META[t].label}</span>
                </button>
              );
            })}
          </div>

          <div className="field"><label htmlFor="le-title">Title</label><input id="le-title" required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>

          {(form.contentType === "video" || form.contentType === "document") && (
            <div className="field">
              <label htmlFor="le-url">{form.contentType === "video" ? "Video link (YouTube, Vimeo, Google Drive or .mp4)" : "Document link (PDF, Google Docs/Drive)"}</label>
              <input id="le-url" type="url" value={form.contentUrl} onChange={(e) => setForm({ ...form, contentUrl: e.target.value })} placeholder="https://" />
              {embed && <span className="muted-small">{embed.kind === "link" ? "Learners will get a link to open it." : "Learners will see it embedded in the lesson."}</span>}
            </div>
          )}

          <div className="field">
            <label htmlFor="le-text">{form.contentType === "assignment" ? "Instructions" : form.contentType === "test" ? "Intro (optional)" : "Notes or reading (optional)"}</label>
            <textarea id="le-text" rows={form.contentType === "document" || form.contentType === "assignment" ? 7 : 3} value={form.contentText} onChange={(e) => setForm({ ...form, contentText: e.target.value })} />
          </div>

          <div className="form-grid">
            <div className="field"><label htmlFor="le-dur">Length (minutes)</label><input id="le-dur" type="number" min={1} max={1000} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
            {form.contentType === "test" && (
              <div className="field"><label htmlFor="le-pass">Pass mark (%)</label><input id="le-pass" type="number" min={1} max={100} value={form.passingScorePercent} onChange={(e) => setForm({ ...form, passingScorePercent: Number(e.target.value) })} /></div>
            )}
          </div>
          <label className="toggle" style={{ marginBottom: "1rem" }}>
            <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> Required to complete the course
          </label>

          {form.contentType === "test" && (
            <div className="quiz-editor">
              <h3>Questions</h3>
              <AnimatePresence initial={false}>
                {questions.map((q, i) => (
                  <motion.div key={i} className="qe-card" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                    <div className="qe-head">
                      <span className="outline-num">{i + 1}</span>
                      <input className="qe-q" aria-label={`Question ${i + 1}`} placeholder="Question" value={q.questionText} onChange={(e) => updateQ(i, { questionText: e.target.value })} />
                      <button type="button" className="icon-button" aria-label="Remove question" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
                    </div>
                    {q.options.map((o, oi) => (
                      <div key={o.id} className={`qe-option${q.correctOptionId === o.id ? " correct" : ""}`}>
                        <button type="button" className="qe-correct" aria-label={`Mark option ${oi + 1} correct`} title="Mark as the correct answer" onClick={() => updateQ(i, { correctOptionId: o.id })}>
                          {q.correctOptionId === o.id ? <Check size={14} /> : String.fromCharCode(65 + oi)}
                        </button>
                        <input aria-label={`Option ${oi + 1}`} placeholder={`Option ${String.fromCharCode(65 + oi)}`} value={o.text} onChange={(e) => updateQ(i, { options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
                        {q.options.length > 2 && (
                          <button type="button" className="icon-button" aria-label="Remove option" onClick={() => updateQ(i, { options: q.options.filter((x) => x.id !== o.id), correctOptionId: q.correctOptionId === o.id ? q.options.find((x) => x.id !== o.id)!.id : q.correctOptionId })}><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    <div className="qe-foot">
                      {q.options.length < 6 && (
                        <button type="button" className="link-button" onClick={() => updateQ(i, { options: [...q.options, { id: nextOptionId(q), text: "" }] })}><Plus size={14} /> Option</button>
                      )}
                      <input className="qe-explain" placeholder="Why this is the answer (shown after submitting)" value={q.explanation ?? ""} onChange={(e) => updateQ(i, { explanation: e.target.value })} />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <button type="button" className="btn btn-secondary" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}><Plus size={16} /> Add question</button>
            </div>
          )}

          <div className="drawer-actions sticky-actions">
            <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save lesson"}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </motion.aside>
    </>
  );
}

function nextOptionId(q: QuizQuestion) {
  const used = new Set(q.options.map((o) => o.id));
  for (const c of "abcdefgh") if (!used.has(c)) return c;
  return `o${q.options.length}`;
}
