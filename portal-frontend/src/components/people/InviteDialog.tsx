import { useState, type ChangeEvent, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, UserPlus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { displayName } from "../../lib/nav";
import { CSV_TEMPLATE, parseCsv, rowsToInvites, type EmployeeType } from "../../lib/people";
import { useDirectory } from "../../lib/useDirectory";
import { useToast } from "../Toast";

interface Props {
  onClose: () => void;
  onInvited: () => void;
}

interface RowResult {
  row: number;
  email: string;
  status: "ok" | "invited" | "error";
  message?: string;
  newAccount?: boolean;
}

type Mode = "one" | "sheet";

/** Invite one person, or many from a spreadsheet (CSV), with a dry-run preview. */
export function InviteDialog({ onClose, onInvited }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { people: staff } = useDirectory();
  const [mode, setMode] = useState<Mode>("one");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ email: "", fullName: "", employeeType: "full_time" as EmployeeType, role: "", departmentName: "", designationTitle: "", managerEmail: "", joiningDate: "", durationMonths: "" });

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<RowResult[] | null>(null);
  const [done, setDone] = useState<RowResult[] | null>(null);

  const managers = staff.filter((s) => ["manager", "hr", "admin", "super_admin"].includes(s.role));

  async function inviteOne(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { email: form.email, employeeType: form.employeeType, joiningDate: form.joiningDate };
      for (const k of ["fullName", "role", "departmentName", "designationTitle", "managerEmail"] as const) if (form[k].trim()) body[k] = form[k].trim();
      if (form.durationMonths) body.durationMonths = Number(form.durationMonths);
      await apiFetch("/api/v1/people/invite", { method: "POST", body, accessToken });
      toast(`Invited ${form.fullName.trim() || form.email}. A welcome email is on its way.`);
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the invite.");
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setDone(null);
    setError(null);
    const parsed = rowsToInvites(parseCsv(await file.text()));
    if (parsed.rows.length === 0) {
      setError("That file has no rows under the header. Use the template to get the columns right.");
      setRows([]);
      return;
    }
    if (parsed.rows.length > 200) {
      setError("Up to 200 people per file. Split it into smaller files.");
      setRows([]);
      return;
    }
    setRows(parsed.rows);
    setUnknownHeaders(parsed.unknownHeaders);
    // Check every row straight away so problems show before anything is sent.
    setBusy(true);
    try {
      const r = await apiFetch<{ results: RowResult[] }>("/api/v1/people/invite/bulk", { method: "POST", body: { rows: parsed.rows, dryRun: true }, accessToken });
      setPreview(r.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check the file.");
    }
    setBusy(false);
  }

  async function sendSheet() {
    setBusy(true);
    try {
      const r = await apiFetch<{ results: RowResult[]; succeeded: number; failed: number }>("/api/v1/people/invite/bulk", { method: "POST", body: { rows }, accessToken });
      setDone(r.results);
      toast(`Invited ${r.succeeded} ${r.succeeded === 1 ? "person" : "people"}${r.failed ? `, ${r.failed} skipped` : ""}`, r.succeeded ? "success" : "error");
      onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the invites.");
    }
    setBusy(false);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "invite-people-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const results = done ?? preview;
  const okCount = results?.filter((r) => r.status !== "error").length ?? 0;

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="invite-title">Invite people</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="muted-small" style={{ marginTop: 0 }}>
          Each person gets an employee record, the standard onboarding checklist, and a welcome email with a link to set their password.
        </p>

        <div className="segmented" role="tablist" style={{ marginBottom: "1rem" }}>
          {(
            [
              ["one", "One person", UserPlus],
              ["sheet", "From a spreadsheet", FileSpreadsheet],
            ] as const
          ).map(([value, label, Icon]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setError(null); }}>
              {mode === value && <motion.span layoutId="invite-pill" className="segmented-pill" />}
              <span><Icon size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />{label}</span>
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <AnimatePresence mode="wait">
          {mode === "one" ? (
            <motion.form key="one" onSubmit={inviteOne} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="i-email">Work email</label><input id="i-email" type="email" required autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></div>
                <div className="field"><label htmlFor="i-name">Full name</label><input id="i-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Asha Rao" /></div>
                <div className="field">
                  <label htmlFor="i-type">Type</label>
                  <select id="i-type" value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value as EmployeeType })}>
                    <option value="full_time">Full-time</option>
                    <option value="intern">Intern</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="i-role">Portal role</label>
                  <select id="i-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="">Match the type</option>
                    <option value="employee">Employee</option>
                    <option value="intern">Intern</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div className="field"><label htmlFor="i-dept">Department</label><input id="i-dept" value={form.departmentName} onChange={(e) => setForm({ ...form, departmentName: e.target.value })} placeholder="Engineering" /></div>
                <div className="field"><label htmlFor="i-title">Designation</label><input id="i-title" value={form.designationTitle} onChange={(e) => setForm({ ...form, designationTitle: e.target.value })} placeholder="Software Engineer" /></div>
                <div className="field">
                  <label htmlFor="i-manager">Reports to</label>
                  <select id="i-manager" value={form.managerEmail} onChange={(e) => setForm({ ...form, managerEmail: e.target.value })}>
                    <option value="">No manager yet</option>
                    {managers.map((m) => <option key={m.id} value={m.email}>{displayName(m.email)}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="i-join">Joining date</label><input id="i-join" type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></div>
                {form.employeeType !== "full_time" && (
                  <div className="field"><label htmlFor="i-dur">Duration (months)</label><input id="i-dur" type="number" min={1} max={120} value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: e.target.value })} placeholder="6" /></div>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn" disabled={busy}><UserPlus size={17} /> {busy ? "Inviting…" : "Send invite"}</button>
              </div>
            </motion.form>
          ) : (
            <motion.div key="sheet" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
              <label className="dropzone">
                <input type="file" accept=".csv,text/csv" onChange={onFile} />
                <Upload size={22} />
                <span><strong>{fileName || "Choose a CSV file"}</strong></span>
                <span className="muted-small">Export from Excel or Google Sheets as CSV. Columns: email, name, type, department, designation, manager email, joining date, duration months.</span>
              </label>
              <button type="button" className="link-button" onClick={downloadTemplate}><Download size={15} /> Download the template</button>
              {unknownHeaders.length > 0 && <p className="muted-small">Ignored columns: {unknownHeaders.join(", ")}</p>}

              {results && (
                <div className="import-results">
                  <div className="import-summary">
                    <strong>{okCount}</strong> {done ? "invited" : "ready to invite"}{results.length - okCount > 0 && <>, <strong className="meta-overdue">{results.length - okCount}</strong> {done ? "skipped" : "with problems"}</>}
                  </div>
                  <ul>
                    {results.map((r) => (
                      <motion.li key={r.row} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={r.status === "error" ? "bad" : "good"}>
                        {r.status === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                        <span className="muted-small">Row {r.row}</span>
                        <span className="truncate">{r.email || "(no email)"}</span>
                        <span className="muted-small import-note">{r.status === "error" ? r.message : r.status === "invited" ? "Invited" : r.newAccount ? "New account" : "Existing account"}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>{done ? "Close" : "Cancel"}</button>
                {!done && (
                  <button type="button" className="btn" disabled={busy || !preview || okCount === 0} onClick={sendSheet}>
                    {busy ? "Working…" : `Invite ${okCount} ${okCount === 1 ? "person" : "people"}`}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
