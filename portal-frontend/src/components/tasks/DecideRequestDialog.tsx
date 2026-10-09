import { useState, type FormEvent } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { dateInputToIso, formatDay, toDateInput, type TaskRequest } from "../../lib/tasks";
import { useToast } from "../Toast";
import { PersonSelect, TaskModal } from "./TaskRequestDialog";
import { useColleagues } from "./useColleagues";

interface Props {
  request: TaskRequest;
  approve: boolean;
  taskTitle: string;
  /** Who has the task now: they can't be the new assignee. */
  currentAssigneeId: string | null;
  requesterName: string;
  onCancel: () => void;
  onDone: () => void;
}

/**
 * A reviewer answers a request. Approving more time can adjust the date
 * (starts at the asked date); approving a hand-over needs the new person
 * (starts at the suggested one). Declining takes an optional note.
 */
export function DecideRequestDialog({ request, approve, taskTitle, currentAssigneeId, requesterName, onCancel, onDone }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { people } = useColleagues();
  const extension = request.kind === "extension";
  const [date, setDate] = useState(request.requestedDueDate ? toDateInput(request.requestedDueDate) : "");
  const [newDue, setNewDue] = useState("");
  const [person, setPerson] = useState<string | null>(request.proposedAssigneeId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const needsPerson = approve && !extension && !person;
  const needsDate = approve && extension && !date;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (needsPerson || needsDate) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { approve, note: note.trim() || undefined };
      if (approve && extension) body.dueDate = dateInputToIso(date);
      if (approve && !extension) {
        body.assigneeId = person;
        if (newDue) body.dueDate = dateInputToIso(newDue);
      }
      await apiFetch(`/api/v1/tasks/requests/${request.id}/decide`, { method: "POST", body, accessToken });
      toast(approve ? (extension ? "New due date set" : "Task handed over") : "Request declined");
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save your answer.", "error");
      setBusy(false);
    }
  }

  const title = approve ? (extension ? "Give more time" : "Approve the hand-over") : extension ? "Keep the current date" : "Keep it with them";

  return (
    <TaskModal
      titleId="decide-title"
      title={title}
      icon={approve ? <CheckCircle2 size={20} className="tone-good" /> : <XCircle size={20} className="tone-bad" />}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <p className="muted-small">{taskTitle}</p>
      <blockquote className="request-quote">
        <strong>{requesterName}:</strong> “{request.reason}”
      </blockquote>

      {approve && extension && (
        <div className="field">
          <label htmlFor="decide-date">New due date</label>
          <input id="decide-date" type="date" required value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} />
          <span className="muted-small">
            {request.currentDueDate ? `Was due ${formatDay(request.currentDueDate)}. ` : ""}
            {request.requestedDueDate ? `They asked for ${formatDay(request.requestedDueDate)}.` : ""}
          </span>
        </div>
      )}

      {approve && !extension && (
        <>
          <div className="field">
            <label htmlFor="decide-person">Who takes it over?</label>
            <PersonSelect id="decide-person" people={people} value={person} onChange={setPerson} exclude={currentAssigneeId ? [currentAssigneeId] : []} />
            <span className="muted-small">
              {request.proposedAssigneeId ? "They suggested this person; you can pick someone else." : "They didn't suggest anyone."} The new person starts the task fresh.
            </span>
          </div>
          <div className="field">
            <label htmlFor="decide-due">New due date (optional)</label>
            <input id="decide-due" type="date" value={newDue} min={toDateInput(new Date())} onChange={(e) => setNewDue(e.target.value)} />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="decide-note">{approve ? "Note (optional)" : "Let them know why (optional)"}</label>
        <textarea id="decide-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus={!approve} />
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Back</button>
        <button className={`btn${approve ? "" : " btn-danger"}`} disabled={busy || needsPerson || needsDate}>
          {approve ? "Approve" : "Decline"}
        </button>
      </div>
    </TaskModal>
  );
}
