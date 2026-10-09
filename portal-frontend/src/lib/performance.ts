import type { UserRole } from "../context/AuthContext";

/** One person's month, as ranked by GET /performance/leaderboard. */
export interface RankRow {
  userId: string;
  name: string;
  email: string;
  role: UserRole | string;
  designation: string | null;
  score: number;
  tasksDone: number;
  hours: number;
  avgRating: number | null;
  ratedTasks: number;
  onTimePercent: number | null;
  rank: number;
  previousScore: number;
  previousRank: number | null;
}

export interface EmployeeOfMonth {
  id: string;
  month: string;
  monthLabel: string;
  userId: string;
  name: string;
  email: string;
  score: number;
  stats: { tasksDone: number; hours: number; avgRating: number | null; onTimePercent: number | null };
  note: string | null;
  chosenBy: string | null;
  emailedAt: string | null;
  createdAt: string;
}

export interface Leaderboard {
  month: string;
  monthLabel: string;
  rows: RankRow[];
  employeeOfMonth: EmployeeOfMonth | null;
  canPick: boolean;
}

export interface GrowthPoint {
  month: string;
  monthLabel: string;
  score: number;
  rank: number | null;
  of: number;
  tasksDone: number;
  hours: number;
  avgRating: number | null;
  onTimePercent: number | null;
}

export interface Growth {
  userId: string;
  name: string;
  series: GrowthPoint[];
  awards: { month: string; monthLabel: string }[];
}

export interface EomHistory {
  latest: EmployeeOfMonth | null;
  history: EmployeeOfMonth[];
}

/** Roles that can see the ranking (mirrors STAFF_VIEW on the server). */
export const PERFORMANCE_ROLES: UserRole[] = ["intern", "employee", "manager", "hr", "admin", "super_admin"];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2026-10": the month in India time, the same way the server counts months. */
export function currentMonth(at = new Date()): string {
  const d = new Date(at.getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "October 2026" (or "Oct" with short). */
export function monthName(month: string, short = false): string {
  return new Intl.DateTimeFormat(undefined, short ? { month: "short", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

/** Scores have one decimal; drop it when it's .0. */
export function fmtScore(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** "+12.5" / "-3" / "0". */
export function fmtDelta(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${fmtScore(r)}` : r < 0 ? `−${fmtScore(-r)}` : "0";
}
