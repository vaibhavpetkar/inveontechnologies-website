import { PDFDocument, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export interface CertificatePdfInput {
  recipientName: string;
  courseTitle: string;
  body: string; // the snapshot text rendered from the template at issue time
  issuedAt: Date;
  certificateId: string; // e.g. CERT-2026-00012
  verifyUrl: string;
  /** Defaults to "Certificate of Completion" / "has successfully completed" for courses. */
  heading?: string;
  completedLine?: string;
}

const NAVY = rgb(0.043, 0.071, 0.125);
const BLUE = rgb(0.145, 0.388, 0.922);
const VIOLET = rgb(0.486, 0.227, 0.929);
const MUTED = rgb(0.392, 0.455, 0.545);
const GOLD = rgb(0.851, 0.467, 0.024);

// The standard PDF fonts only cover Latin-1; replace anything else so a
// name in another script never breaks generation.
export function safe(text: string) {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = NAVY) {
  const t = safe(text);
  const width = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

/** Largest size (down to a floor) at which the text fits the width. */
function fitSize(font: PDFFont, text: string, max: number, maxWidth: number, min = 14) {
  let size = max;
  while (size > min && font.widthOfTextAtSize(safe(text), size) > maxWidth) size -= 1;
  return size;
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const para of safe(text).split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** A landscape A4 certificate with a verification link. */
export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate - ${safe(input.courseTitle)}`);
  pdf.setAuthor("Inveon Technologies");
  pdf.setSubject(`Certificate ${input.certificateId}`);
  const page = pdf.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Frame: a gradient-like pair of bands and a thin inner rule.
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.988, 0.996) });
  page.drawRectangle({ x: 0, y: height - 14, width: width / 2, height: 14, color: BLUE });
  page.drawRectangle({ x: width / 2, y: height - 14, width: width / 2, height: 14, color: VIOLET });
  page.drawRectangle({ x: 0, y: 0, width: width / 2, height: 14, color: VIOLET });
  page.drawRectangle({ x: width / 2, y: 0, width: width / 2, height: 14, color: BLUE });
  page.drawRectangle({ x: 36, y: 36, width: width - 72, height: height - 72, borderColor: rgb(0.8, 0.84, 0.9), borderWidth: 1 });
  page.drawRectangle({ x: 42, y: 42, width: width - 84, height: height - 84, borderColor: GOLD, borderWidth: 0.6 });

  // Brand mark.
  page.drawRectangle({ x: width / 2 - 18, y: height - 96, width: 36, height: 36, color: BLUE });
  centered(page, "IN", height - 84, sansBold, 15, rgb(1, 1, 1));
  centered(page, "INVEON TECHNOLOGIES", height - 118, sansBold, 11, MUTED);

  centered(page, input.heading ?? "Certificate of Completion", height - 170, serif, fitSize(serif, input.heading ?? "Certificate of Completion", 38, width - 160));
  centered(page, "This is to certify that", height - 212, serifItalic, 15, MUTED);

  const nameSize = fitSize(serif, input.recipientName, 40, width - 200);
  centered(page, input.recipientName, height - 262, serif, nameSize, BLUE);
  const nameWidth = Math.min(width - 200, serif.widthOfTextAtSize(safe(input.recipientName), nameSize) + 60);
  page.drawLine({ start: { x: (width - nameWidth) / 2, y: height - 274 }, end: { x: (width + nameWidth) / 2, y: height - 274 }, thickness: 0.8, color: GOLD });

  centered(page, input.completedLine ?? "has successfully completed", height - 304, serifItalic, 15, MUTED);
  const courseSize = fitSize(sansBold, input.courseTitle, 24, width - 200);
  centered(page, input.courseTitle, height - 338, sansBold, courseSize);

  // The template's own wording, kept short under the title.
  const lines = wrap(input.body, sans, 11, width - 260).slice(0, 3);
  lines.forEach((line, i) => centered(page, line, height - 372 - i * 16, sans, 11, MUTED));

  // Footer: date, id, verification.
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(input.issuedAt);
  const footY = 92;
  page.drawText("DATE OF ISSUE", { x: 90, y: footY + 18, size: 8, font: sansBold, color: MUTED });
  page.drawText(date, { x: 90, y: footY, size: 13, font: sans, color: NAVY });
  const idLabel = "CERTIFICATE ID";
  page.drawText(idLabel, { x: width - 90 - sansBold.widthOfTextAtSize(idLabel, 8), y: footY + 18, size: 8, font: sansBold, color: MUTED });
  page.drawText(safe(input.certificateId), { x: width - 90 - sans.widthOfTextAtSize(safe(input.certificateId), 13), y: footY, size: 13, font: sans, color: NAVY });

  // Seal.
  page.drawCircle({ x: width / 2, y: footY + 10, size: 30, color: GOLD, opacity: 0.12, borderColor: GOLD, borderWidth: 1.2 });
  centered(page, "VERIFIED", footY + 6, sansBold, 8, GOLD);

  centered(page, `Verify at ${input.verifyUrl}`, 54, sans, 8.5, MUTED);
  // Make the verify line a clickable link.
  const linkText = safe(`Verify at ${input.verifyUrl}`);
  const lw = sans.widthOfTextAtSize(linkText, 8.5);
  const link = pdf.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [(width - lw) / 2, 50, (width + lw) / 2, 64],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(input.verifyUrl) },
  });
  page.node.addAnnot(pdf.context.register(link));

  return pdf.save();
}
