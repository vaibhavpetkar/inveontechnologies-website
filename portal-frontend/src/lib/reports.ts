import { ApiError } from "./api";
import { authedFetch } from "./files";

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "label" | "number" | "money" | "date" | "datetime" | "boolean";
}

export interface ReportInfo {
  key: string;
  title: string;
  description: string;
  columns: ReportColumn[];
}

export type ExportFormat = "xlsx" | "pdf" | "csv";

/** Fetches an export and saves it as <report>-<date>.<format>. */
export async function downloadReport(body: { reportKey: string; format: ExportFormat; from?: string; to?: string }, accessToken: string | null) {
  const res = await authedFetch("/api/v1/reports/export", accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error?.code ?? "EXPORT_FAILED", data?.error?.message ?? "The export didn't work. Try again.", res.status);
  }
  // Content-Disposition isn't readable cross-origin in development, so name it the same way here.
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${body.reportKey}-${new Date().toISOString().slice(0, 10)}.${body.format}`;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export function formatCell(value: unknown, c: ReportColumn) {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (c.type === "money") return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (c.type === "date" || c.type === "datetime") {
    const s = String(value);
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    if (Number.isNaN(d.getTime())) return s;
    return c.type === "date"
      ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", ...(s.length === 10 ? { timeZone: "UTC" } : {}) })
      : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  return String(value);
}

/** Date presets, as ISO instants for the start and end of the days in local time. */
export type RangeKey = "this_month" | "last_month" | "this_year" | "all" | "custom";
export function rangeFor(key: RangeKey, custom: { from: string; to: string }) {
  const now = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const end = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  switch (key) {
    case "this_month":
      return { from: start(new Date(now.getFullYear(), now.getMonth(), 1)), to: end(now) };
    case "last_month":
      return { from: start(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: end(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "this_year":
      return { from: start(new Date(now.getFullYear(), 0, 1)), to: end(now) };
    case "custom":
      return {
        from: custom.from ? start(new Date(`${custom.from}T00:00:00`)) : undefined,
        to: custom.to ? end(new Date(`${custom.to}T00:00:00`)) : undefined,
      };
    default:
      return { from: undefined, to: undefined };
  }
}
