import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { ISSUE_TYPE_META, PRIORITY_META, type IssueType, type TaskPriority } from "../../lib/tasks";
import { useToast } from "../Toast";
import "../../styles/engineering.css";

interface Props {
  ids: string[];
  people: { id: string; name: string }[];
  labels: string[];
  onDone: () => void;
  onClear: () => void;
}

/** Change many issues at once: assignee, priority, type, due date or labels. */
export function BulkEditBar({ ids, people, labels, onDone, onClear }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function apply(patch: Record<string, unknown>, what: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ updated: number }>("/api/v1/tasks/bulk", { method: "POST", body: { taskIds: ids, patch }, accessToken });
      toast(`${what} on ${r.updated} issue${r.updated === 1 ? "" : "s"}`);
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change those issues.", "error");
    }
    setBusy(false);
  }

  const pick = (handler: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    e.target.value = "";
    if (v) handler(v);
  };

  return (
    <motion.div className="bulk-bar" role="region" aria-label="Bulk edit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
      <strong>{ids.length} selected</strong>
      <select aria-label="Assign to" disabled={busy} defaultValue="" onChange={pick((v) => apply({ assigneeId: v === "none" ? null : v }, v === "none" ? "Unassigned" : "Reassigned"))}>
        <option value="">Assign to…</option>
        <option value="none">Nobody</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Priority" disabled={busy} defaultValue="" onChange={pick((v) => apply({ priority: v as TaskPriority }, "Priority changed"))}>
        <option value="">Priority…</option>
        {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
      </select>
      <select aria-label="Type" disabled={busy} defaultValue="" onChange={pick((v) => apply({ type: v as IssueType }, "Type changed"))}>
        <option value="">Type…</option>
        {(Object.keys(ISSUE_TYPE_META) as IssueType[]).map((t) => <option key={t} value={t}>{ISSUE_TYPE_META[t].label}</option>)}
      </select>
      <select
        aria-label="Labels"
        disabled={busy}
        defaultValue=""
        onChange={pick((v) => {
          if (v === "__new") {
            const label = window.prompt("Label to add")?.trim();
            if (label) apply({ addLabels: [label] }, `Added "${label}"`);
          } else if (v.startsWith("-")) apply({ removeLabels: [v.slice(1)] }, `Removed "${v.slice(1)}"`);
          else apply({ addLabels: [v] }, `Added "${v}"`);
        })}
      >
        <option value="">Labels…</option>
        <option value="__new">Add a new label…</option>
        <optgroup label="Add">{labels.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
        <optgroup label="Remove">{labels.map((l) => <option key={l} value={`-${l}`}>{l}</option>)}</optgroup>
      </select>
      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        Due
        <input
          type="date"
          disabled={busy}
          style={{ padding: "0.25rem 0.4rem", borderRadius: 8, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)", color: "#fff", font: "inherit", fontSize: "0.82rem" }}
          onChange={(e) => e.target.value && apply({ dueDate: new Date(`${e.target.value}T23:59:00`).toISOString() }, "Due date set")}
        />
      </label>
      <button type="button" className="link-button" style={{ marginLeft: "auto" }} onClick={onClear}>Clear selection</button>
    </motion.div>
  );
}
