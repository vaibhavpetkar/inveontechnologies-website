import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Rocket, X } from "lucide-react";
import type { Task } from "../../lib/tasks";

export interface Kickoff {
  plan: string;
  expectedFinishAt?: string;
  branchOrLink?: string;
}

interface Props {
  task: Task;
  onCancel: () => void;
  onStart: (kickoff: Kickoff | undefined) => void;
}

function inDays(n: number) {
  const d = new Date(Date.now() + n * 86400000);
  d.setHours(18, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Asked when someone starts a task: how they'll approach it, when they
 * expect to finish and where the work lives. Their reviewer is told, and it
 * shows on the task and the team board.
 */
export function StartWorkDialog({ task, onCancel, onStart }: Props) {
  const due = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "";
  const [plan, setPlan] = useState("");
  const [finish, setFinish] = useState(due || inDays(2));
  const [link, setLink] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    onStart({
      plan: plan.trim(),
      expectedFinishAt: finish ? new Date(`${finish}T18:00:00`).toISOString() : undefined,
      branchOrLink: link.trim() || undefined,
    });
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onCancel}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-work-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="start-work-title"><Rocket size={20} className="kickoff-icon" /> Start work</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}><X size={18} /></button>
        </div>
        <p className="muted-small kickoff-task">{task.title}</p>
        <div className="field">
          <label htmlFor="ko-plan">Your plan</label>
          <textarea id="ko-plan" autoFocus required minLength={3} rows={4} maxLength={4000} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="How will you approach it? What will you do first?" />
        </div>
        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="ko-finish">Expect to finish by</label>
            <input id="ko-finish" type="date" value={finish} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setFinish(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ko-link">Branch or PR (optional)</label>
            <input id="ko-link" value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} placeholder="feature/seat-map" />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onStart(undefined)}>Skip and start</button>
          <button className="btn" disabled={plan.trim().length < 3}>Start work</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
