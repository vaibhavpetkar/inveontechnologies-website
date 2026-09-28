import type { SalaryComponent } from "../shared/db/schema.js";

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** First instant of the month and of the next month, in UTC (joining dates are stored as UTC midnights). */
export function periodBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end, daysInMonth: Math.round((end.getTime() - start.getTime()) / 86_400_000) };
}

export function periodLabel(period: string) {
  const { start } = periodBounds(period);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
}

export function currentPeriod(now = new Date()) {
  // Payroll runs on India time.
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface SlipFigures {
  daysInMonth: number;
  payableDays: number;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
}

/**
 * One month's pay: earnings are prorated by payable days (calendar-day
 * basis, starting from the joining date if they joined that month, less
 * loss-of-pay days); deductions are fixed monthly amounts, never more than
 * what was earned.
 */
export function computeSlip(components: SalaryComponent[], opts: { period: string; joiningDate: Date; lopDays: number }): SlipFigures {
  const { start, end, daysInMonth } = periodBounds(opts.period);
  let eligible = daysInMonth;
  if (opts.joiningDate >= end) eligible = 0;
  else if (opts.joiningDate > start) eligible = daysInMonth - Math.floor((opts.joiningDate.getTime() - start.getTime()) / 86_400_000);
  const payableDays = Math.max(0, eligible - Math.max(0, opts.lopDays));
  const factor = payableDays / daysInMonth;

  const earnings = components.filter((c) => c.kind === "earning").map((c) => ({ name: c.name, amount: Math.round(c.amount * factor) }));
  const gross = earnings.reduce((s, e) => s + e.amount, 0);
  let room = gross;
  const deductions = components
    .filter((c) => c.kind === "deduction")
    .map((c) => {
      const amount = payableDays > 0 ? Math.min(Math.round(c.amount), room) : 0;
      room -= amount;
      return { name: c.name, amount };
    });
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  return { daysInMonth, payableDays, earnings, deductions, gross, totalDeductions, net: gross - totalDeductions };
}

export const monthlyGross = (components: SalaryComponent[]) => components.filter((c) => c.kind === "earning").reduce((s, c) => s + c.amount, 0);
export const monthlyNet = (components: SalaryComponent[]) => monthlyGross(components) - components.filter((c) => c.kind === "deduction").reduce((s, c) => s + c.amount, 0);
