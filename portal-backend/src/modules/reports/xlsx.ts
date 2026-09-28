import { zip } from "./zip.js";
import type { Column } from "./columns.js";

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Excel stores dates as days since 1899-12-30.
const excelDate = (d: Date) => d.getTime() / 86_400_000 + 25569;

/**
 * A single-sheet .xlsx: bold, frozen header row, auto filter, sensible
 * column widths, real numbers and dates. Text is written as inline strings,
 * so it is never evaluated as a formula.
 */
export function toXlsx(title: string, columns: Column[], rows: Record<string, unknown>[]): Buffer {
  const widths = columns.map((c) => Math.min(60, Math.max(c.label.length + 2, ...rows.slice(0, 200).map((r) => display(r[c.key], c).length + 1))));
  const cell = (ref: string, value: unknown, c: Column) => {
    if (value === null || value === undefined || value === "") return "";
    if (c.type === "number" || c.type === "money") {
      const n = Number(value);
      if (Number.isFinite(n)) return `<c r="${ref}" s="${c.type === "money" ? 3 : 0}"><v>${n}</v></c>`;
    }
    if (c.type === "date" || c.type === "datetime") {
      const d = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00Z` : String(value));
      if (!Number.isNaN(d.getTime())) {
        // Datetimes are shown in India time.
        const shifted = c.type === "datetime" ? new Date(d.getTime() + 330 * 60_000) : d;
        return `<c r="${ref}" s="${c.type === "date" ? 1 : 2}"><v>${excelDate(shifted)}</v></c>`;
      }
    }
    if (typeof value === "boolean") return `<c r="${ref}" t="inlineStr"><is><t>${value ? "Yes" : "No"}</t></is></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
  };

  const header = `<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="4"><is><t>${esc(c.label)}</t></is></c>`).join("")}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, ci) => cell(`${colName(ci)}${ri + 2}`, r[c.key], c)).join("")}</row>`).join("");
  const lastRef = `${colName(columns.length - 1)}${rows.length + 1}`;

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${header}${body}</sheetData>
${rows.length ? `<autoFilter ref="A1:${lastRef}"/>` : ""}
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/><numFmt numFmtId="165" formatCode="dd mmm yyyy hh:mm"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF9"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const sheetName = esc(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>${rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$1:$${colName(columns.length - 1)}$${rows.length + 1}</definedName></definedNames>` : ""}</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: styles },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

/** How a value reads in a PDF or a width estimate. */
export function display(value: unknown, c: Column): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (c.type === "money") {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(value);
  }
  if (c.type === "date" || c.type === "datetime") {
    const d = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00Z` : String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-IN", c.type === "date" ? { day: "2-digit", month: "short", year: "numeric", timeZone: String(value).length === 10 ? "UTC" : "Asia/Kolkata" } : { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
