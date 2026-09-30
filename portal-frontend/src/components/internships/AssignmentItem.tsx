import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Circle, Clock, Code2, ExternalLink, Github, Lock, MessageSquareWarning, RotateCcw, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { EDITOR_LABEL, LEVEL_LABEL, SUBMISSION_META, type Assignment } from "../../lib/internships";
import { CodeExercise } from "./CodeExercise";
import { useToast } from "../Toast";

interface Props {
  assignment: Assignment;
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  onSubmitted: () => void;
}

/** One roadmap assignment: the brief, its checklist, and the submit form or the review result. */
export function AssignmentItem({ assignment: a, locked, open, onToggle, onSubmitted }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const sub = a.submission;
  const [form, setForm] = useState({ repoUrl: sub?.repoUrl ?? "", linkUrl: sub?.linkUrl ?? "", notes: sub?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const isExercise = a.kind === "exercise";
  const canSubmit = !isExercise && !locked && sub?.status !== "approved" && sub?.status !== "submitted";
  // An automatic "not yet" on an exercise is a retry, not a mentor's request.
  const retry = isExercise && sub?.status === "changes_requested" && sub.autoChecked;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/v1/internships/assignments/${a.id}/submit`, { method: "POST", accessToken, body: { repoUrl: form.repoUrl.trim() || null, linkUrl: form.linkUrl.trim() || null, notes: form.notes.trim() || null } });
      toast(sub ? "Resubmitted for review" : "Submitted for review");
      onSubmitted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't submit it.", "error");
    }
    setBusy(false);
  }

  const icon = locked ? <Lock size={16} /> : sub?.status === "approved" ? <CheckCircle2 size={18} /> : sub?.status === "submitted" ? <Clock size={17} /> : retry ? <RotateCcw size={16} /> : sub?.status === "changes_requested" ? <MessageSquareWarning size={17} /> : isExercise ? <Code2 size={17} /> : <Circle size={17} />;

  return (
    <li id={`assignment-${a.id}`} className={`assignment ${sub ? `is-${sub.status}` : ""}${locked ? " is-locked" : ""}${open ? " is-open" : ""}`}>
      <button className="assignment-head" aria-expanded={open} onClick={onToggle}>
        <span className="assignment-icon">{icon}</span>
        <span className="assignment-title">
          <strong>{a.title}</strong>
          <span className="muted-small">{isExercise && a.exercise ? `${EDITOR_LABEL[a.exercise.editor] ?? a.exercise.editor} · ` : ""}{LEVEL_LABEL[a.level]} · {a.maxMarks} marks</span>
        </span>
        {sub && <span className={`pill pill-${SUBMISSION_META[sub.status].tone}`}>{sub.status === "approved" ? `${sub.marks}/${a.maxMarks}` : retry ? "Try again" : SUBMISSION_META[sub.status].label}</span>}
        <ChevronDown size={17} className={`chevron${open ? " open" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="assignment-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <p>{a.brief}</p>
            <ul className="assignment-steps">
              {a.steps.map((s) => <li key={s}>{s}</li>)}
            </ul>
            {sub?.feedback && !(isExercise && sub.autoChecked) && (
              <div className={`review-note tone-${SUBMISSION_META[sub.status].tone}`}>
                <strong>{sub.status === "approved" ? `Mentor feedback · ${sub.marks}/${a.maxMarks}` : "What to change"}</strong>
                <p>{sub.feedback}</p>
              </div>
            )}
            {isExercise && !locked && a.exercise?.starter !== undefined && <CodeExercise assignment={a} onSubmitted={onSubmitted} />}
            {sub && (sub.repoUrl || sub.linkUrl) && (
              <p className="submission-links">
                {sub.repoUrl && <a href={sub.repoUrl} target="_blank" rel="noopener noreferrer"><Github size={14} /> Repository</a>}
                {sub.linkUrl && <a href={sub.linkUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Live link</a>}
                <span className="muted-small">Attempt {sub.attempt}</span>
              </p>
            )}
            {locked && <p className="muted-small"><Lock size={13} /> Unlocks when you join the program.</p>}
            {sub?.status === "submitted" && !isExercise && <p className="muted-small">Waiting for a mentor's review. You'll get a notification.</p>}
            {canSubmit && (
              <form className="submit-form" onSubmit={submit}>
                <div className="field-row field-row-2">
                  <div className="field">
                    <label htmlFor={`repo-${a.id}`}>GitHub repository</label>
                    <input id={`repo-${a.id}`} type="url" placeholder="https://github.com/you/project" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`link-${a.id}`}>Live link {a.deliverable === "link" ? "" : "(optional)"}</label>
                    <input id={`link-${a.id}`} type="url" placeholder="https://…" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`notes-${a.id}`}>{a.deliverable === "text" ? "Your write-up" : "Notes for the reviewer (optional)"}</label>
                  <textarea id={`notes-${a.id}`} rows={a.deliverable === "text" ? 5 : 2} maxLength={4000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <button className="btn btn-sm" disabled={busy || (!form.repoUrl.trim() && !form.linkUrl.trim() && form.notes.trim().length < 20)}>
                  <Send size={14} /> {sub ? "Resubmit" : "Submit for review"}
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
