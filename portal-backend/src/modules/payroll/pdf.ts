import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { safe } from "../certificates/pdf.js";

export interface PayslipPdfInput {
  periodLabel: string;
  employeeName: string;
  employeeId: string;
  designation: string | null;
  department: string | null;
  joiningDate: Date;
  daysInMonth: number;
  payableDays: number;
  lopDays: number;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  publishedAt: Date | null;
}

const NAVY = rgb(0.043, 0.071, 0.125);
const BLUE = rgb(0.145, 0.388, 0.922);
const VIOLET = rgb(0.486, 0.227, 0.929);
const MUTED = rgb(0.392, 0.455, 0.545);
const LINE = rgb(0.886, 0.91, 0.941);
const SOFT = rgb(0.973, 0.98, 0.988);

const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

function right(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = NAVY) {
  const t = safe(text);
  page.drawText(t, { x: x - font.widthOfTextAtSize(t, size), y, size, font, color });
}

/** Rupees in words, Indian grouping (lakh, crore), for the net pay line. */
export function amountInWords(n: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x));
  let r = Math.round(n);
  if (r === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7); r %= 1e7;
  const lakh = Math.floor(r / 1e5); r %= 1e5;
  const thousand = Math.floor(r / 1e3); r %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (r) parts.push(three(r));
  return `${parts.join(" ")} Rupees Only`;
}

/** A portrait A4 payslip: header, employee facts, earnings and deductions side by side, net pay. */
export async function renderPayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payslip - ${safe(input.periodLabel)}`);
  pdf.setAuthor("Inveon Technologies");
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = 48;
  const R = width - 48;

  page.drawRectangle({ x: 0, y: height - 10, width: width / 2, height: 10, color: BLUE });
  page.drawRectangle({ x: width / 2, y: height - 10, width: width / 2, height: 10, color: VIOLET });
  page.drawRectangle({ x: L, y: height - 78, width: 34, height: 34, color: BLUE });
  page.drawText("IN", { x: L + 8, y: height - 66, size: 14, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Inveon Technologies", { x: L + 46, y: height - 58, size: 16, font: bold, color: NAVY });
  page.drawText("inveontechnologies.in", { x: L + 46, y: height - 74, size: 9, font: sans, color: MUTED });
  right(page, "PAYSLIP", R, height - 58, bold, 16, BLUE);
  right(page, input.periodLabel, R, height - 74, sans, 10, MUTED);

  // Employee facts.
  let y = height - 120;
  page.drawRectangle({ x: L, y: y - 88, width: R - L, height: 98, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
  const facts: [string, string][] = [
    ["Employee", input.employeeName],
    ["Employee ID", input.employeeId],
    ["Designation", input.designation ?? "-"],
    ["Department", input.department ?? "-"],
    ["Date of joining", date(input.joiningDate)],
    ["Paid days", `${input.payableDays} of ${input.daysInMonth}${input.lopDays ? ` (LOP ${input.lopDays})` : ""}`],
  ];
  facts.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? L + 14 : L + (R - L) / 2 + 6;
    const yy = y - 12 - row * 26;
    page.drawText(k.toUpperCase(), { x, y: yy, size: 7, font: bold, color: MUTED });
    page.drawText(safe(v), { x, y: yy - 11, size: 10, font: sans, color: NAVY });
  });

  // Earnings | deductions.
  y -= 118;
  const mid = L + (R - L) / 2;
  const colW = (R - L) / 2 - 8;
  const table = (x: number, title: string, rows: { name: string; amount: number }[], total: number, totalLabel: string) => {
    page.drawRectangle({ x, y: y - 4, width: colW, height: 22, color: NAVY });
    page.drawText(title, { x: x + 10, y: y + 3, size: 9, font: bold, color: rgb(1, 1, 1) });
    right(page, "AMOUNT", x + colW - 10, y + 3, bold, 8, rgb(1, 1, 1));
    let yy = y - 22;
    for (const r of rows.length ? rows : [{ name: "-", amount: 0 }]) {
      page.drawText(safe(r.name), { x: x + 10, y: yy, size: 10, font: sans, color: NAVY });
      right(page, r.name === "-" ? "-" : money(r.amount), x + colW - 10, yy, sans, 10);
      page.drawLine({ start: { x, y: yy - 7 }, end: { x: x + colW, y: yy - 7 }, thickness: 0.5, color: LINE });
      yy -= 22;
    }
    return { yy, draw: (atY: number) => {
      page.drawText(totalLabel, { x: x + 10, y: atY, size: 10, font: bold, color: NAVY });
      right(page, money(total), x + colW - 10, atY, bold, 10);
    } };
  };
  const a = table(L, "EARNINGS", input.earnings, input.gross, "Gross earnings");
  const b = table(mid + 8, "DEDUCTIONS", input.deductions, input.totalDeductions, "Total deductions");
  const totalY = Math.min(a.yy, b.yy) - 4;
  a.draw(totalY);
  b.draw(totalY);

  // Net pay.
  y = totalY - 40;
  page.drawRectangle({ x: L, y: y - 26, width: R - L, height: 50, color: rgb(0.933, 0.953, 1), borderColor: BLUE, borderWidth: 0.8 });
  page.drawText("NET PAY", { x: L + 14, y: y + 6, size: 9, font: bold, color: BLUE });
  page.drawText(safe(amountInWords(input.net)), { x: L + 14, y: y - 12, size: 9, font: sans, color: MUTED });
  right(page, money(input.net), R - 14, y - 4, bold, 18, NAVY);

  page.drawText("This is a system-generated payslip and does not need a signature.", { x: L, y: 60, size: 8, font: sans, color: MUTED });
  if (input.publishedAt) right(page, `Issued ${date(input.publishedAt)}`, R, 60, sans, 8, MUTED);
  return pdf.save();
}
