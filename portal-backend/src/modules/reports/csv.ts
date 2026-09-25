/** Minimal, dependency-free CSV writer — good enough for admin report exports. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    let str = value instanceof Date ? value.toISOString() : String(value);
    // Spreadsheet formula injection: user-controlled text (task titles, etc.)
    // starting with = + - @ would be executed as a formula when the export is
    // opened in Excel/Sheets. Prefixing a quote makes it plain text. Numbers
    // (e.g. a negative value) are left alone.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c])).join(","));
  return [header, ...lines].join("\n");
}
