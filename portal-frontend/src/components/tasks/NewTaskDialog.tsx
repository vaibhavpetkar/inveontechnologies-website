import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName, ROLE_LABELS } from "../../lib/nav";
import { CAN_ASSIGN_OTHERS, type Task, type TaskPriority } from "../../lib/tasks";
import type { DirectoryUser } from "../../lib/useDirectory";

interface Props {
  people: DirectoryUser[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}

/** Create a task, and — for managers, HR and admins — assign it to someone. */
export function NewTaskDialog({ people, onClose, onCreated }: Props) {
  const { user, accessToken } = useAuth();
  const canAssignOthers = !!user && CAN_ASSIGN_OTHERS.includes(user.role);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assigneeId: canAssignOthers ? "" : user?.id ?? "",
    priority: "medium" as TaskPriority,
    dueDate: "",
    estimateHours: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignable = people.filter((p) => p.id !== user?.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: form.title.trim(), priority: form.priority };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.assigneeId) body.assigneeId = form.assigneeId;
      // A due date means "by the end of that day" in the person's own timezone.
      if (form.dueDate) body.dueDate = new Date(`${form.dueDate}T23:59:00`).toISOString();
      if (form.estimateHours) body.estimateHours = Number(form.estimateHours);
      const res = await apiFetch<{ task: Task }>("/api/v1/tasks", { method: "POST", body, accessToken });
      onCreated(res.task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the task.");
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="new-task-title">{canAssignOthers ? "Assign a task" : "New task"}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input id="task-title" autoFocus required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Prepare onboarding deck" />
        </div>
        <div className="field">
          <label htmlFor="task-desc">Details</label>
          <textarea id="task-desc" rows={3} maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does done look like?" />
        </div>

        {canAssignOthers && (
          <div className="field">
            <label htmlFor="task-assignee">Assign to</label>
            <select id="task-assignee" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Nobody yet</option>
              <option value={user!.id}>Myself</option>
              {assignable.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p.email)} · {ROLE_LABELS[p.role]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-due">Due</label>
            <input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="task-est">Estimate (h)</label>
            <input id="task-est" type="number" min={0} step={0.5} value={form.estimateHours} onChange={(e) => setForm({ ...form, estimateHours: e.target.value })} />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={saving || form.title.trim().length < 2}>
            {saving ? "Saving…" : canAssignOthers && form.assigneeId && form.assigneeId !== user?.id ? "Assign task" : "Create task"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
