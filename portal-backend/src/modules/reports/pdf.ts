import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { safe } from "../certificates/pdf.js";
import type { Column } from "./columns.js";
import { display } from "./xlsx.js";

const NAVY = rgb(0.043, 0.071, 0.125);
const BLUE = rgb(0.145, 0.388, 0.922);
const MUTED = rgb(0.392, 0.455, 0.545);
const LINE = rgb(0.886, 0.91, 0.941);
const HEAD = rgb(0.91, 0.933, 0.976);
const STRIPE = rgb(0.976, 0.98, 0.992);

const W = 841.89; // A4 landscape
const H = 595.28;
const M = 32;
const SIZE = 8;
const ROW = 15;
/** PDFs over this many rows get cut, with a note to use Excel for the rest. */
export const PDF_ROW_LIMIT = 2000;

function fit(text: string, font: PDFFont, size: number, width: number) {
  let t = safe(text).replace(/\s+/g, " ");
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

/** A landscape table report: title, what was included, the rows, page numbers. */
export async function toPdf(opts: { title: string; subtitle: string; columns: Column[]; rows: Record<string, unknown>[] }): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setCreator("Inveon Portal");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const rows = opts.rows.slice(0, PDF_ROW_LIMIT);
  const cells = rows.map((r) => opts.columns.map((c) => display(r[c.key], c)));

  // Column widths follow the content, within limits, then scale to the page.
  const natural = opts.columns.map((c, i) => {
    const sample = cells.slice(0, 300).map((row) => font.widthOfTextAtSize(safe(row[i]), SIZE));
    return Math.min(220, Math.max(bold.widthOfTextAtSize(safe(c.label), SIZE), ...sample, 30) + 10);
  });
  const total = natural.reduce((s, w) => s + w, 0);
  const widths = natural.map((w) => (w * (W - 2 * M)) / total);
  const numeric = opts.columns.map((c) => c.type === "number" || c.type === "money");

  let page = doc.addPage([W, H]);
  let y = H - M;
  const drawHeader = (first: boolean) => {
    if (first) {
      page.drawText("INVEON TECHNOLOGIES", { x: M, y: y - 8, size: 8, font: bold, color: BLUE });
      page.drawText(safe(opts.title), { x: M, y: y - 28, size: 18, font: bold, color: NAVY });
      page.drawText(safe(opts.subtitle), { x: M, y: y - 44, size: 9, font, color: MUTED });
      y -= 62;
    }
    page.drawRectangle({ x: M, y: y - ROW + 4, width: W - 2 * M, height: ROW, color: HEAD });
    let x = M;
    opts.columns.forEach((c, i) => {
      const label = fit(c.label, bold, SIZE, widths[i] - 8);
      const tx = numeric[i] ? x + widths[i] - 4 - bold.widthOfTextAtSize(label, SIZE) : x + 4;
      page.drawText(label, { x: tx, y: y - 7, size: SIZE, font: bold, color: NAVY });
      x += widths[i];
    });
    y -= ROW;
  };
  drawHeader(true);

  cells.forEach((row, ri) => {
    if (y - ROW < M + 14) {
      page = doc.addPage([W, H]);
      y = H - M;
      drawHeader(false);
    }
    if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - ROW + 4, width: W - 2 * M, height: ROW, color: STRIPE });
    let x = M;
    row.forEach((text, i) => {
      const t = fit(text, font, SIZE, widths[i] - 8);
      const tx = numeric[i] ? x + widths[i] - 4 - font.widthOfTextAtSize(t, SIZE) : x + 4;
      page.drawText(t, { x: tx, y: y - 7, size: SIZE, font, color: NAVY });
      x += widths[i];
    });
    page.drawLine({ start: { x: M, y: y - ROW + 4 }, end: { x: W - M, y: y - ROW + 4 }, thickness: 0.4, color: LINE });
    y -= ROW;
  });

  if (rows.length === 0) page.drawText("Nothing to show for these dates.", { x: M + 4, y: y - 10, size: 9, font, color: MUTED });
  if (opts.rows.length > rows.length) {
    if (y - ROW < M + 14) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
    page.drawText(`Showing the first ${PDF_ROW_LIMIT} of ${opts.rows.length} rows. Download Excel for all of them.`, { x: M + 4, y: y - 12, size: 9, font: bold, color: MUTED });
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 8), y: M - 14, size: 8, font, color: MUTED });
  });
  return Buffer.from(await doc.save());
}
