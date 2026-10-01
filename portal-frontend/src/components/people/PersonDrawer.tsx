import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, Circle, KeyRound, Mail, Plus, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName } from "../../lib/nav";
import { formatDate, onboardingStage, STATUS_META, TYPE_LABELS, type ChecklistItem, type EmployeeStatus, type Person } from "../../lib/people";
import { useDirectory } from "../../lib/useDirectory";
import { Avatar } from "../Avatar";
import { useToast } from "../Toast";
import { PersonPayCard } from "../payroll/PersonPayCard";
import { AppointmentLetterCard } from "./AppointmentLetterCard";

interface Props {
  personId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function PersonDrawer({ personId, canManage, onClose, onChanged }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { people: staff } = useDirectory();
  const [person, setPerson] = useState<Person | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [form, setForm] = useState({ fullName: "", departmentName: "", designationTitle: "", managerId: "", status: "preboarding" as EmployeeStatus, joiningDate: "" });

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ person: Person; checklist: ChecklistItem[] }>(`/api/v1/people/${personId}`, { accessToken });
      setPerson(r.person);
      setChecklist(r.checklist);
      setForm({
        fullName: r.person.name,
        departmentName: r.person.department ?? "",
        designationTitle: r.person.designation ?? "",
        managerId: r.person.managerId ?? "",
        status: r.person.status,
        joiningDate: r.person.joiningDate.slice(0, 10),
      });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This person isn't in your list." : "Couldn't load this person.");
    }
  }, [personId, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast(success);
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong.", "error");
    }
    setBusy(false);
  }

  const complete = (item: ChecklistItem) => run(() => apiFetch(`/api/v1/employees/onboarding-tasks/${item.id}/complete`, { method: "POST", accessToken }), `Marked "${item.title}" done`);
  const activate = () => run(() => apiFetch(`/api/v1/employees/${personId}/activate-access`, { method: "POST", accessToken }), "Portal access activated");

  function addItem(e: FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    run(async () => {
      await apiFetch(`/api/v1/employees/${personId}/onboarding-tasks`, { method: "POST", body: { taskType: "custom", title: newItem.trim(), required: true }, accessToken });
      setNewItem("");
    }, "Checklist item added");
  }

  function save(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await apiFetch(`/api/v1/people/${personId}`, {
        method: "PUT",
        body: { fullName: form.fullName.trim() || undefined, departmentName: form.departmentName, designationTitle: form.designationTitle, managerId: form.managerId || null, status: form.status, joiningDate: form.joiningDate || undefined },
        accessToken,
      });
      setEditing(false);
    }, "Saved");
  }

  const stage = person ? onboardingStage(person) : null;
  const done = checklist.filter((c) => c.status === "completed").length;
  const managers = staff.filter((s) => s.id !== person?.userId && ["manager", "hr", "admin", "super_admin"].includes(s.role));

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="task-drawer" role="dialog" aria-modal="true" aria-label="Person details" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}>
        <div className="drawer-head">
          {person && <span className={`pill pill-${STATUS_META[person.status].tone}`}>{STATUS_META[person.status].label}</span>}
          {stage && <span className={`pill pill-${stage.tone}`}>{stage.label}</span>}
          <button className="icon-button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {!person && !error && (
          <div className="skeleton-stack">
            <div className="skeleton" style={{ height: 48 }} />
            <div className="skeleton" />
            <div className="skeleton" style={{ width: "60%" }} />
          </div>
        )}

        {person && (
          <div className="drawer-body">
            <div className="person-hero">
              <Avatar email={person.email} name={person.name} size={56} />
              <div>
                <h2 className="drawer-title">{person.name}</h2>
                <div className="muted-small">{[person.designation, person.department].filter(Boolean).join(" · ") || "No role details yet"}</div>
              </div>
            </div>

            {!editing ? (
              <dl className="drawer-facts">
                <div><dt>Employee ID</dt><dd>{person.businessId ?? "—"}</dd></div>
                <div><dt>Type</dt><dd>{TYPE_LABELS[person.employeeType]}</dd></div>
                <div><dt>Email</dt><dd><Mail size={15} /> <span className="truncate">{person.email}</span></dd></div>
                <div><dt>Joins</dt><dd><CalendarDays size={15} /> {formatDate(person.joiningDate)}</dd></div>
                <div><dt>Reports to</dt><dd>{person.managerName ?? "No manager"}</dd></div>
                <div><dt>Portal access</dt><dd><KeyRound size={15} /> {person.portalAccessActive ? "Active" : "Not yet"}</dd></div>
              </dl>
            ) : (
              <motion.form className="edit-grid" onSubmit={save} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <div className="field"><label htmlFor="p-name">Name</label><input id="p-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
                <div className="field"><label htmlFor="p-dept">Department</label><input id="p-dept" value={form.departmentName} onChange={(e) => setForm({ ...form, departmentName: e.target.value })} placeholder="e.g. Engineering" /></div>
                <div className="field"><label htmlFor="p-title">Designation</label><input id="p-title" value={form.designationTitle} onChange={(e) => setForm({ ...form, designationTitle: e.target.value })} placeholder="e.g. Software Engineer" /></div>
                <div className="field">
                  <label htmlFor="p-manager">Reports to</label>
                  <select id="p-manager" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                    <option value="">No manager</option>
                    {managers.map((m) => <option key={m.id} value={m.id}>{displayName(m.email)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p-status">Status</label>
                  <select id="p-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EmployeeStatus })}>
                    {(Object.keys(STATUS_META) as EmployeeStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="p-join">Joining date</label><input id="p-join" type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></div>
                <div className="drawer-actions">
                  <button className="btn" disabled={busy}>Save</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </motion.form>
            )}

            {canManage && !editing && (
              <div className="drawer-actions">
                {!person.portalAccessActive && (
                  <button className="btn" disabled={busy || person.requiredOpen > 0} onClick={activate} title={person.requiredOpen > 0 ? "Finish the required checklist first" : undefined}>
                    <ShieldCheck size={17} /> Activate portal access
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit details</button>
              </div>
            )}

            <div className="drawer-section">
              <div className="checklist-head">
                <h3>Onboarding checklist</h3>
                <span className="muted-small">{done} of {checklist.length} done</span>
              </div>
              <div className="progress-bar" aria-hidden>
                <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${checklist.length ? (done / checklist.length) * 100 : 0}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
              </div>
              <ul className="checklist">
                <AnimatePresence initial={false}>
                  {checklist.map((item) => (
                    <motion.li key={item.id} layout className={item.status === "completed" ? "done" : ""} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                      <span className="check-icon">{item.status === "completed" ? <Check size={14} /> : <Circle size={14} />}</span>
                      <span className="check-text">
                        <span>{item.title}{!item.required && <span className="muted-small"> (optional)</span>}</span>
                        {item.description && <span className="muted-small">{item.description}</span>}
                      </span>
                      {canManage && item.status === "pending" && item.taskType !== "access_activation" && (
                        <button className="link-button" disabled={busy} onClick={() => complete(item)}>Mark done</button>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {canManage && !person.portalAccessActive && (
                <form className="comment-form" onSubmit={addItem}>
                  <input aria-label="Add a checklist item" placeholder="Add a checklist item…" value={newItem} maxLength={200} onChange={(e) => setNewItem(e.target.value)} />
                  <button className="icon-button primary" aria-label="Add item" disabled={busy || newItem.trim().length < 2}>
                    <Plus size={16} />
                  </button>
                </form>
              )}
            </div>
            {canManage && <AppointmentLetterCard employeeId={person.id} />}
            {canManage && <PersonPayCard employeeId={person.id} />}
          </div>
        )}
      </motion.aside>
    </>
  );
}
