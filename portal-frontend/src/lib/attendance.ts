export type LeaveType = "casual" | "sick" | "earned" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type AttendanceStatus = "present" | "half_day" | "absent";

export interface AttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  workMode: "office" | "remote" | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
  markedBy: string | null;
}

export interface MonthDay {
  date: string;
  weekend: boolean;
  holiday: string | null;
  record: AttendanceRecord | null;
  leave: { id: string; type: LeaveType; status: LeaveStatus; halfDay: boolean } | null;
}

export interface MyMonth {
  month: string;
  today: string;
  todayRecord: AttendanceRecord | null;
  days: MonthDay[];
}

export interface LeaveBalance {
  type: LeaveType;
  allowance: number | null;
  used: number;
  pending: number;
  remaining: number | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: string;
  reason: string;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  employee: { id: string; userId: string; businessId: string | null; name: string } | null;
  decidedByName: string | null;
}

export interface TeamRow {
  employeeId: string;
  businessId: string | null;
  employeeType: string;
  userId: string;
  email: string;
  name: string;
  recordId: string | null;
  status: AttendanceStatus | null;
  workMode: "office" | "remote" | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
  markedBy: string | null;
  leaveId: string | null;
  leaveType: LeaveType | null;
  leaveStatus: LeaveStatus | null;
  leaveHalfDay: boolean | null;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface LeavePolicy {
  employeeType: "intern" | "full_time" | "contract";
  leaveType: LeaveType;
  daysPerYear: string;
}

export const LEAVE_LABELS: Record<LeaveType, string> = { casual: "Casual", sick: "Sick", earned: "Earned", unpaid: "Unpaid" };
export const STATUS_LABELS: Record<AttendanceStatus, string> = { present: "Present", half_day: "Half day", absent: "Absent" };
export const LEAVE_STATUS: Record<LeaveStatus, { label: string; tone: string }> = {
  pending: { label: "Waiting", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

/** Today in India, matching the server. */
export function todayIst() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  asDate(d).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

export function leaveSpan(l: { startDate: string; endDate: string; halfDay: boolean }) {
  if (l.startDate === l.endDate) return `${dayLabel(l.startDate)}${l.halfDay ? ", half day" : ""}`;
  return `${dayLabel(l.startDate, { day: "numeric", month: "short" })} to ${dayLabel(l.endDate, { day: "numeric", month: "short" })}`;
}

export const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");

export function hoursBetween(from: string, to: string | null) {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
