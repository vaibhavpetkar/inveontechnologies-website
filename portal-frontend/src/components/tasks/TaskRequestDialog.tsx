import { createPortal } from "react-dom";
import { useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarClock, UserRoundCog, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { Colleague } from "../../lib/calendar";
import { dateInputToIso, formatDay, toDateInput, type Task, type TaskRequestKind } from "../../lib/tasks";
import { PeoplePicker } from "../PeoplePicker";
import { useToast } from "../Toast";
import { useColleagues } from "./useColleagues";
import "../../styles/performance.css";

/** One person from the colleague list (PeoplePicker, limited to a single choice). */
export function PersonSelect({ id, people, value, onChange, exclude }: { id: string; people: Colleague[]; value: string | null; onChange: (id: string | null) => void; exclude?: string[] }) {
  return (
    <PeoplePicker
      id={id}
      people={people}
      value={value ? [{ id: value }] : []}
      exclude={exclude}
      placeholder="Search by name or email"
      onChange={(next) => onChange(next.length ? next[next.length - 1].id : null)}
    />
  );
}

/** The modal frame these task dialogs share. */
export function TaskModal({ titleId, title, icon, onCancel, onSubmit, children }: { titleId: string; title: string; icon: ReactNode; onCancel: () => void; onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return createPortal(
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onCancel}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title-icon">{icon} {title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}><X size={18} /></button>
        </div>
        {children}
      </motion.form>
    </motion.div>,
    document.body,
  );
}

interface Props {
  task: Task;
  kind: TaskRequestKind;
  onCancel: () => void;
  onSent: () => void;
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateInput(d);
}

/** The assignee asks their reviewer for more time, or to hand the task to someone else. */
export function TaskRequestDialog({ task, kind, onCancel, onSent }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const { people } = useColleagues();
  const suggestedDate = () => {
    const base = task.dueDate && new Date(task.dueDate) > new Date() ? new Date(task.dueDate) : new Date();
    base.setDate(base.getDate() + 3);
    return toDateInput(base);
  };
  const [date, setDate] = useState(suggestedDate);
  const [reason, setReason] = useState("");
  const [person, setPerson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      const body =
        kind === "extension"
          ? { kind, reason: reason.trim(), requestedDueDate: dateInputToIso(date) }
          : { kind, reason: reason.trim(), ...(person ? { proposedAssigneeId: person } : {}) };
      await apiFetch(`/api/v1/tasks/${task.id}/requests`, { method: "POST", body, accessToken });
      toast(kind === "extension" ? "Asked for more time. Your reviewer has been told." : "Hand-over requested. Your reviewer has been told.");
      onSent();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send the request.", "error");
      setBusy(false);
    }
  }

  const extension = kind === "extension";
  return (
    <TaskModal
      titleId="task-request-title"
      title={extension ? "Ask for more time" : "Hand over this task"}
      icon={extension ? <CalendarClock size={20} /> : <UserRoundCog size={20} />}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <p className="muted-small">
        {task.title}
        {task.dueDate && <> · due {formatDay(task.dueDate)}</>}
      </p>
      {extension ? (
        <div className="field">
          <label htmlFor="req-date">New due date</label>
          <input id="req-date" type="date" required value={date} min={tomorrow()} onChange={(e) => setDate(e.target.value)} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="req-person">Who could take it over? (optional)</label>
          <PersonSelect id="req-person" people={people} value={person} onChange={setPerson} exclude={user ? [user.id] : []} />
          <span className="muted-small">Your reviewer makes the final call.</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="req-reason">Why?</label>
        <textarea
          id="req-reason"
          autoFocus
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={extension ? "What's taking longer than planned?" : "Why should someone else pick this up?"}
        />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy || reason.trim().length < 3 || (extension && !date)}>Send request</button>
      </div>
    </TaskModal>
  );
}
