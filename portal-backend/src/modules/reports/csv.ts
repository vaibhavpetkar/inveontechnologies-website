/** Minimal, dependency-free CSV writer — good enough for admin report exports. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c])).join(","));
  return [header, ...lines].join("\n");
}
