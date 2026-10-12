import { useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import "../../styles/engineering.css";

/** Splits CSV text into rows of cells: quoted fields, doubled quotes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

// Column headings people use, mapped to the fields the import understands.
const HEADINGS: Record<string, string> = {
  title: "title", summary: "title", name: "title",
  type: "type", "issue type": "type",
  priority: "priority",
  description: "description", details: "description",
  assignee: "assignee", "assignee email": "assignee", email: "assignee",
  labels: "labels", label: "labels", tags: "labels",
  "story points": "storyPoints", points: "storyPoints", "story point estimate": "storyPoints",
  estimate: "estimateHours", "estimate hours": "estimateHours", hours: "estimateHours",
  due: "dueDate", "due date": "dueDate",
  parent: "parent", epic: "parent", "epic key": "parent", "parent key": "parent",
};
const TEMPLATE = "Title,Type,Priority,Assignee,Labels,Story points,Due date,Parent,Description\nBooking,Epic,High,,,,,,\nPick a seat on the coach map,Story,High,someone@inveon.in,frontend;booking,5,2026-12-01,KEY-1,Show free seats\n";

interface Result {
  ok: boolean;
  rows?: number;
  created?: number;
  errors?: { row: number; errors: string[] }[];
}

/** Import issues from a spreadsheet saved as CSV: check the rows, then create them. */
export function ImportCsvDialog({ projectId, projectKey, onClose, onImported }: { projectId: string; projectKey: string; onClose: () => void; onImported: (n: number) => void }) {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [check, setCheck] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCheck(null);
    if (file.size > 2 * 1024 * 1024) return setError("That file is over 2 MB. Split it into smaller files.");
    const cells = parseCsv(await file.text());
    if (cells.length < 2) return setError("The file needs a heading row and at least one issue.");
    const heads = cells[0].map((h) => HEADINGS[h.trim().toLowerCase()] ?? null);
    if (!heads.includes("title")) return setError('Add a "Title" column.');
    setUnknown(cells[0].filter((_, i) => !heads[i]).map((h) => h.trim()).filter(Boolean));
    const parsed = cells.slice(1).map((r) => Object.fromEntries(heads.flatMap((h, i) => (h && r[i]?.trim() ? [[h, r[i].trim()]] : []))));
    if (parsed.length > 500) return setError("Up to 500 issues at a time.");
    setRows(parsed);
    setBusy(true);
    try {
      setCheck(await apiFetch<Result>(`/api/v1/projects/${projectId}/import`, { method: "POST", body: { rows: parsed, dryRun: true }, accessToken }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check the file.");
    }
    setBusy(false);
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await apiFetch<Result>(`/api/v1/projects/${projectId}/import`, { method: "POST", body: { rows }, accessToken });
      onImported(r.created ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't import the issues.");
      setBusy(false);
    }
  }

  const badRows = new Set(check?.errors?.map((e) => e.row) ?? []);
  const cols = ["title", "type", "priority", "assignee", "labels", "storyPoints", "dueDate", "parent"];

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
        <div className="modal-head">
          <h2 id="import-title">Import issues from a spreadsheet</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="muted-small">
          Save the sheet as CSV. Columns: Title (needed), Type, Priority, Assignee (email), Labels, Story points, Due date (YYYY-MM-DD), Parent (an epic's key, like {projectKey}-1), Description.{" "}
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE.replace(/KEY/g, projectKey))}`} download="issues-template.csv">Download a template</a>.
        </p>
        <label className="btn btn-secondary" style={{ width: "fit-content" }}>
          <FileSpreadsheet size={16} /> Choose a CSV file
          <input type="file" accept=".csv,text/csv" onChange={load} hidden />
        </label>
        {error && <div className="error-banner" style={{ marginTop: "0.6rem" }}>{error}</div>}
        {unknown.length > 0 && <p className="muted-small">Skipping columns: {unknown.join(", ")}</p>}
        {rows && (
          <>
            <p style={{ margin: "0.6rem 0 0.4rem" }}>
              {rows.length} issue{rows.length === 1 ? "" : "s"} found.{" "}
              {busy && !check ? "Checking…" : check?.ok ? "Everything looks right." : check ? `${badRows.size} row${badRows.size === 1 ? " needs" : "s need"} fixing first.` : ""}
            </p>
            <div className="import-preview">
              <table>
                <thead>
                  <tr><th>#</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className={badRows.has(i + 1) ? "bad" : undefined}>
                      <td>{i + 1}</td>
                      {cols.map((c) => <td key={c}>{r[c] ?? ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!check?.errors?.length && (
              <ul className="import-errors">
                {check.errors.map((e) => <li key={e.row}>Row {e.row}: {e.errors.join("; ")}</li>)}
              </ul>
            )}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !check?.ok} onClick={run}>{busy && check ? "Importing…" : `Import ${rows?.length ?? ""} issues`}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
