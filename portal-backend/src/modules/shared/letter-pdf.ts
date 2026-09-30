import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { safe, wrap } from "../certificates/pdf.js";

/**
 * A small layout engine for A4 letters and policy documents: letterhead,
 * flowing text that breaks across pages, fact tables, numbered clauses and
 * a signature block, with a running footer. Used for appointment letters,
 * company policies and internship offers.
 */

export type LetterBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string; bold?: boolean }
  | { kind: "bullets"; items: string[] }
  | { kind: "clauses"; items: { title: string; text: string }[] }
  | { kind: "facts"; rows: [string, string][] }
  | { kind: "callout"; title: string; text: string }
  | { kind: "signatures"; left: SignatureSide; right?: SignatureSide }
  | { kind: "spacer"; height: number };

export interface SignatureSide {
  caption: string; // "For Inveon Technologies"
  name: string;
  title: string;
  note?: string; // e.g. "Accepted electronically on 3 Oct 2026"
}

export interface LetterDocument {
  title: string; // PDF metadata
  kicker: string; // "APPOINTMENT LETTER", shown top right
  reference?: string;
  date?: Date;
  companyAddress?: string | null;
  recipient?: string[]; // address block lines
  subject?: string;
  blocks: LetterBlock[];
  footerNote?: string;
}

const NAVY = rgb(0.043, 0.071, 0.125);
const INK = rgb(0.2, 0.235, 0.29);
const BLUE = rgb(0.145, 0.388, 0.922);
const VIOLET = rgb(0.486, 0.227, 0.929);
const MUTED = rgb(0.392, 0.455, 0.545);
const LINE = rgb(0.886, 0.91, 0.941);
const SOFT = rgb(0.965, 0.973, 0.988);
const GOLD = rgb(0.851, 0.467, 0.024);

const W = 595.28;
const H = 841.89;
const L = 56;
const R = W - 56;
const BOTTOM = 72; // keep clear for the footer

export const longDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

/**
 * Turns the plain policy format into blocks: "## " starts a heading,
 * "- " a bullet, blank lines separate paragraphs.
 */
export function parseRichText(text: string): LetterBlock[] {
  const blocks: LetterBlock[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join(" ") });
    if (bullets.length) blocks.push({ kind: "bullets", items: bullets });
    para = [];
    bullets = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(3).trim() });
    } else if (/^[-*] /.test(line)) {
      if (para.length) {
        blocks.push({ kind: "para", text: para.join(" ") });
        para = [];
      }
      bullets.push(line.slice(2).trim());
    } else {
      if (bullets.length) {
        blocks.push({ kind: "bullets", items: bullets });
        bullets = [];
      }
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** The same blocks as plain text, for the letter's stored snapshot and email previews. */
export function blocksToText(blocks: LetterBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "title" || b.kind === "heading") out.push(b.text.toUpperCase());
    else if (b.kind === "para") out.push(b.text);
    else if (b.kind === "bullets") out.push(b.items.map((i) => `- ${i}`).join("\n"));
    else if (b.kind === "clauses") out.push(b.items.map((c, i) => `${i + 1}. ${c.title}. ${c.text}`).join("\n\n"));
    else if (b.kind === "facts") out.push(b.rows.map(([k, v]) => `${k}: ${v}`).join("\n"));
    else if (b.kind === "callout") out.push(`${b.title}\n${b.text}`);
    else if (b.kind === "signatures") out.push([b.left, b.right].filter(Boolean).map((s) => `${s!.caption}\n${s!.name}\n${s!.title}${s!.note ? `\n${s!.note}` : ""}`).join("\n\n"));
  }
  return out.join("\n\n");
}

export async function renderLetterPdf(doc: LetterDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(doc.title));
  pdf.setAuthor("Inveon Technologies");
  pdf.setCreator("Inveon Portal");
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const text = (t: string, x: number, yy: number, font: PDFFont, size: number, color = INK) => page.drawText(safe(t), { x, y: yy, size, font, color });
  const right = (t: string, x: number, yy: number, font: PDFFont, size: number, color = INK) => {
    const s = safe(t);
    page.drawText(s, { x: x - font.widthOfTextAtSize(s, size), y: yy, size, font, color });
  };

  function brandBar() {
    page.drawRectangle({ x: 0, y: H - 8, width: W / 2, height: 8, color: BLUE });
    page.drawRectangle({ x: W / 2, y: H - 8, width: W / 2, height: 8, color: VIOLET });
  }

  function firstPage() {
    page = pdf.addPage([W, H]);
    pages.push(page);
    brandBar();
    page.drawRectangle({ x: L, y: H - 84, width: 38, height: 38, color: BLUE });
    text("IN", L + 8.5, H - 71, bold, 16, rgb(1, 1, 1));
    text("Inveon Technologies", L + 50, H - 62, serif, 19, NAVY);
    text("inveontechnologies.in", L + 50, H - 78, sans, 9, MUTED);
    right(doc.kicker, R, H - 60, bold, 11, BLUE);
    if (doc.reference) right(`Ref: ${doc.reference}`, R, H - 75, sans, 9, MUTED);
    if (doc.date) right(`Date: ${longDate(doc.date)}`, R, H - 88, sans, 9, MUTED);
    let top = H - 100;
    if (doc.companyAddress) {
      for (const line of wrap(doc.companyAddress, sans, 8.5, 300)) {
        text(line, L + 50, top + 8, sans, 8.5, MUTED);
        top -= 11;
      }
    }
    page.drawLine({ start: { x: L, y: top - 4 }, end: { x: R, y: top - 4 }, thickness: 0.8, color: LINE });
    y = top - 30;
  }

  function nextPage() {
    page = pdf.addPage([W, H]);
    pages.push(page);
    brandBar();
    text("Inveon Technologies", L, H - 40, bold, 10, NAVY);
    right(doc.kicker, R, H - 40, sans, 9, MUTED);
    page.drawLine({ start: { x: L, y: H - 50 }, end: { x: R, y: H - 50 }, thickness: 0.6, color: LINE });
    y = H - 78;
  }

  /** Makes room for `needed` points, starting a page if the current one is full. */
  function room(needed: number) {
    if (y - needed < BOTTOM) nextPage();
  }

  function lines(content: string, font: PDFFont, size: number, x: number, maxWidth: number, color = INK, leading = size * 1.5) {
    for (const line of wrap(content, font, size, maxWidth)) {
      room(leading);
      text(line, x, y, font, size, color);
      y -= leading;
    }
  }

  firstPage();

  if (doc.recipient?.length) {
    text("To,", L, y, sans, 10.5, MUTED);
    y -= 16;
    doc.recipient.forEach((line, i) => {
      text(line, L, y, i === 0 ? bold : sans, 10.5, i === 0 ? NAVY : INK);
      y -= 15;
    });
    y -= 10;
  }
  if (doc.subject) {
    const subject = `Subject: ${doc.subject}`;
    for (const line of wrap(subject, bold, 11, R - L)) {
      room(16);
      text(line, L, y, bold, 11, NAVY);
      y -= 16;
    }
    y -= 8;
  }

  for (const block of doc.blocks) {
    switch (block.kind) {
      case "title": {
        for (const line of wrap(block.text, serif, 20, R - L)) {
          room(28);
          text(line, L, y, serif, 20, NAVY);
          y -= 26;
        }
        y -= 2;
        break;
      }
      case "heading": {
        room(40);
        y -= 6;
        text(block.text, L, y, bold, 12, NAVY);
        page.drawRectangle({ x: L, y: y - 6, width: 28, height: 2, color: BLUE });
        y -= 22;
        break;
      }
      case "para": {
        lines(block.text, block.bold ? bold : sans, 10.5, L, R - L);
        y -= 7;
        break;
      }
      case "bullets": {
        for (const item of block.items) {
          const wrapped = wrap(item, sans, 10.5, R - L - 18);
          wrapped.forEach((line, i) => {
            room(15.5);
            if (i === 0) page.drawCircle({ x: L + 5, y: y + 3.5, size: 1.8, color: BLUE });
            text(line, L + 16, y, sans, 10.5);
            y -= 15.5;
          });
          y -= 2;
        }
        y -= 6;
        break;
      }
      case "clauses": {
        block.items.forEach((clause, i) => {
          room(34);
          const num = `${i + 1}.`;
          text(num, L, y, bold, 10.5, BLUE);
          text(clause.title, L + 20, y, bold, 10.5, NAVY);
          y -= 15.5;
          lines(clause.text, sans, 10.5, L + 20, R - L - 20);
          y -= 7;
        });
        break;
      }
      case "facts": {
        const rowH = 21;
        const labelW = 150;
        room(Math.min(block.rows.length, 4) * rowH + 10);
        block.rows.forEach(([label, value], i) => {
          const valueLines = wrap(value || "-", sans, 10, R - L - labelW - 24);
          const h = Math.max(rowH, valueLines.length * 14 + 8);
          room(h);
          if (i % 2 === 0) page.drawRectangle({ x: L, y: y - h + 14, width: R - L, height: h, color: SOFT });
          text(label, L + 10, y, bold, 9.5, MUTED);
          valueLines.forEach((vl, j) => text(vl, L + labelW, y - j * 14, sans, 10, NAVY));
          y -= h;
        });
        page.drawLine({ start: { x: L, y: y + 14 }, end: { x: R, y: y + 14 }, thickness: 0.6, color: LINE });
        y -= 12;
        break;
      }
      case "callout": {
        const body = wrap(block.text, sans, 10, R - L - 32);
        const h = 26 + body.length * 14.5;
        y -= 8;
        room(h + 8);
        page.drawRectangle({ x: L, y: y - h + 16, width: R - L, height: h, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
        page.drawRectangle({ x: L, y: y - h + 16, width: 3, height: h, color: GOLD });
        text(block.title, L + 16, y, bold, 10.5, NAVY);
        y -= 17;
        for (const line of body) {
          text(line, L + 16, y, sans, 10);
          y -= 14.5;
        }
        y -= 16;
        break;
      }
      case "signatures": {
        room(110);
        y -= 18;
        const sides = [block.left, block.right].filter(Boolean) as SignatureSide[];
        const colW = (R - L) / 2;
        const top = y;
        sides.forEach((s, i) => {
          const x = L + i * colW;
          let yy = top;
          text(s.caption, x, yy, sans, 10, MUTED);
          yy -= 40;
          page.drawLine({ start: { x, y: yy + 12 }, end: { x: x + colW - 40, y: yy + 12 }, thickness: 0.7, color: NAVY });
          text(s.name, x, yy, bold, 10.5, NAVY);
          yy -= 14;
          text(s.title, x, yy, sans, 9.5, MUTED);
          if (s.note) {
            yy -= 14;
            for (const line of wrap(s.note, italic, 8.5, colW - 40)) {
              text(line, x, yy, italic, 8.5, GOLD);
              yy -= 11;
            }
          }
        });
        y = top - 110;
        break;
      }
      case "spacer":
        y -= block.height;
        break;
    }
  }

  // Footer on every page, once the page count is known.
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: L, y: 50 }, end: { x: R, y: 50 }, thickness: 0.6, color: LINE });
    p.drawText(safe(doc.footerNote ?? "Inveon Technologies · inveontechnologies.in"), { x: L, y: 36, size: 8, font: sans, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: R - sans.widthOfTextAtSize(label, 8), y: 36, size: 8, font: sans, color: MUTED });
    if (doc.reference) {
      const ref = safe(doc.reference);
      p.drawText(ref, { x: (W - sans.widthOfTextAtSize(ref, 8)) / 2, y: 36, size: 8, font: sans, color: MUTED });
    }
  });

  return pdf.save();
}
