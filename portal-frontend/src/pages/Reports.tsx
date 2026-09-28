import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, FileText, Download, Loader2 } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { downloadReport, formatCell, rangeFor, type ExportFormat, type RangeKey, type ReportColumn, type ReportInfo } from "../lib/reports";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];
const PREVIEW = 50;

/** Pick a report and dates, preview it, and download it as Excel, PDF or CSV. */
export default function Reports() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [reports, setReports] = useState<ReportInfo[] | null>(null);
  const [key, setKey] = useState<string>("applications");
  const [rangeKey, setRangeKey] = useState<RangeKey>("this_month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [data, setData] = useState<{ total: number; columns: ReportColumn[]; rows: Record<string, unknown>[] } | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  useEffect(() => {
    apiFetch<{ reports: ReportInfo[] }>("/api/v1/reports", { accessToken })
      .then((r) => setReports(r.reports))
      .catch(() => toast("Couldn't load reports.", "error"));
  }, [accessToken, toast]);

  const range = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);
  const report = reports?.find((r) => r.key === key);

  useEffect(() => {
    if (!report) return;
    let live = true;
    setData(null);
    const q = new URLSearchParams({ limit: String(PREVIEW) });
    if (range.from) q.set("from", range.from);
    if (range.to) q.set("to", range.to);
    apiFetch<{ total: number; columns: ReportColumn[]; rows: Record<string, unknown>[] }>(`/api/v1/reports/${report.key}?${q}`, { accessToken })
      .then((r) => live && setData(r))
      .catch((err) => live && toast(err instanceof ApiError ? err.message : "Couldn't load the report.", "error"));
    return () => {
      live = false;
    };
  }, [report, range, accessToken, toast]);

  async function download(format: ExportFormat) {
    if (!report) return;
    setBusy(format);
    try {
      await downloadReport({ reportKey: report.key, format, ...range }, accessToken);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The download didn't work.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Pick a report and the dates, check the preview, then download it for Excel or as a PDF.</p>
        </div>
      </div>

      {!reports ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : (
        <div className="reports-layout">
          <nav className="reports-list" aria-label="Reports">
            {reports.map((r) => (
              <button key={r.key} className={r.key === key ? "on" : ""} aria-current={r.key === key} onClick={() => setKey(r.key)}>
                <strong>{r.title}</strong>
                <span>{r.description}</span>
              </button>
            ))}
          </nav>

          <section className="panel reports-main" aria-label={report?.title}>
            <div className="reports-bar">
              <div className="seg-tabs" role="tablist" aria-label="Dates">
                {RANGES.map((r) => (
                  <button key={r.key} role="tab" aria-selected={rangeKey === r.key} className={rangeKey === r.key ? "on" : ""} onClick={() => setRangeKey(r.key)}>{r.label}</button>
                ))}
              </div>
              {rangeKey === "custom" && (
                <div className="reports-custom">
                  <input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                  <span>to</span>
                  <input type="date" aria-label="To" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                </div>
              )}
            </div>

            <div className="reports-head">
              <div>
                <h2>{report?.title}</h2>
                <p className="muted-small">{data ? `${data.total} ${data.total === 1 ? "row" : "rows"}${data.total > PREVIEW ? `, showing the first ${PREVIEW}` : ""}` : "Loading…"}</p>
              </div>
              <div className="reports-actions">
                <button className="btn" disabled={!!busy || !data} onClick={() => download("xlsx")}>{busy === "xlsx" ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />} Excel</button>
                <button className="btn btn-secondary" disabled={!!busy || !data} onClick={() => download("pdf")}>{busy === "pdf" ? <Loader2 size={16} className="spin" /> : <FileText size={16} />} PDF</button>
                <button className="btn btn-secondary" disabled={!!busy || !data} onClick={() => download("csv")}>{busy === "csv" ? <Loader2 size={16} className="spin" /> : <Download size={16} />} CSV</button>
              </div>
            </div>

            {!data ? (
              <div className="skeleton" style={{ height: 180 }} />
            ) : data.rows.length === 0 ? (
              <p className="empty">Nothing for these dates.</p>
            ) : (
              <motion.div className="reports-table-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <table className="reports-table">
                  <thead>
                    <tr>{data.columns.map((c) => <th key={c.key} className={c.type === "number" || c.type === "money" ? "num" : ""}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={String(r.id ?? i)}>
                        {data.columns.map((c) => <td key={c.key} className={c.type === "number" || c.type === "money" ? "num" : ""}>{formatCell(r[c.key], c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
