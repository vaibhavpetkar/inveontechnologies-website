import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheck, Clock, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../Toast";
import { ExamEditor, type ExamRow } from "./ExamEditor";

/** Staff view of an opening's exams, with add, edit and switch-off. */
export function ExamsPanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [exams, setExams] = useState<ExamRow[] | null>(null);
  const [editing, setEditing] = useState<ExamRow | "new" | null>(null);

  const load = useCallback(() => {
    apiFetch<{ assessments: ExamRow[] }>(`/api/v1/assessments?opportunityId=${opportunityId}`, { accessToken })
      .then((r) => setExams(r.assessments))
      .catch(() => setExams([]));
  }, [opportunityId, accessToken]);
  useEffect(load, [load]);

  async function remove(exam: ExamRow) {
    if (!confirm(exam.attemptCount ? `Switch off "${exam.title}"? Past results are kept.` : `Delete "${exam.title}"?`)) return;
    try {
      const r = await apiFetch<{ deleted: boolean }>(`/api/v1/assessments/${exam.id}`, { method: "DELETE", accessToken });
      toast(r.deleted ? "Exam deleted" : "Exam switched off");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove the exam.", "error");
    }
  }

  async function reactivate(exam: ExamRow) {
    try {
      await apiFetch(`/api/v1/assessments/${exam.id}`, { method: "PUT", body: { title: exam.title, description: exam.description ?? undefined, language: exam.language, durationMinutes: exam.durationMinutes, passingScorePercent: exam.passingScorePercent, maxAttempts: exam.maxAttempts, isActive: true }, accessToken });
      toast("Exam switched back on");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't switch it on.", "error");
    }
  }

  return (
    <section className="panel exams-panel">
      <div className="exams-panel-head">
        <div>
          <h2 className="opp-section-title"><ClipboardCheck size={18} /> Exams</h2>
          <p className="muted-small">Applicants go straight to the exam after applying. Add one per language; passing any one is enough.</p>
        </div>
        <button className="btn btn-sm" onClick={() => setEditing("new")}><Plus size={14} /> Add exam</button>
      </div>
      {exams === null ? (
        <div className="skeleton" style={{ height: 80 }} />
      ) : exams.length === 0 ? (
        <p className="empty">No exam yet. Applicants will go to the normal review queue.</p>
      ) : (
        <ul className="exam-rows">
          {exams.map((e, i) => (
            <motion.li key={e.id} className={e.isActive ? "" : "inactive"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <span className="exam-lang">{e.language ?? "General"}</span>
              <span className="exam-row-main">
                <strong>{e.title}</strong>
                <span className="muted-small"><Clock size={12} /> {e.durationMinutes} min · {e.questionCount} questions · pass {e.passingScorePercent}% · {e.maxAttempts} attempt{e.maxAttempts === 1 ? "" : "s"}{e.isActive ? "" : " · off"}</span>
              </span>
              <span className="exam-row-stats" title="Passed / attempts">{e.passCount}/{e.attemptCount} passed</span>
              <button className="icon-button" aria-label="Edit exam" onClick={() => setEditing(e)}><Pencil size={15} /></button>
              {e.isActive ? (
                <button className="icon-button" aria-label={e.attemptCount ? "Switch off exam" : "Delete exam"} onClick={() => remove(e)}>{e.attemptCount ? <Power size={15} /> : <Trash2 size={15} />}</button>
              ) : (
                <button className="icon-button" aria-label="Switch exam on" onClick={() => reactivate(e)}><Power size={15} /></button>
              )}
            </motion.li>
          ))}
        </ul>
      )}
      <AnimatePresence>
        {editing && <ExamEditor opportunityId={opportunityId} exam={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
      </AnimatePresence>
    </section>
  );
}
