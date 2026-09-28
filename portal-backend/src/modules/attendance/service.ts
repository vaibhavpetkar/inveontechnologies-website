import { and, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { attendanceRecords, employees, holidays, leavePolicies, leaveRequests } from "../shared/db/schema.js";
import { AppError } from "../shared/errors.js";
import { periodBounds } from "../payroll/calc.js";

export const HR_ROLES = ["hr", "admin", "super_admin"] as const;
export const isHr = (role: string) => (HR_ROLES as readonly string[]).includes(role);
export const PAID_LEAVE = ["casual", "sick", "earned"] as const;
export type LeaveType = "casual" | "sick" | "earned" | "unpaid";
type Employee = typeof employees.$inferSelect;

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Today's date in India, where the team works. */
export function todayIst(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

const toUtc = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function eachDate(start: string, end: string) {
  const out: string[] = [];
  for (let d = toUtc(start); d <= toUtc(end); d = new Date(d.getTime() + 86_400_000)) out.push(fmt(d));
  return out;
}

/** Saturday and Sunday are off. */
export const isWeekend = (d: string) => [0, 6].includes(toUtc(d).getUTCDay());

export async function holidayDates(db: Database, start: string, end: string) {
  const rows = await db.select({ date: holidays.date }).from(holidays).where(and(gte(holidays.date, start), lte(holidays.date, end)));
  return new Set(rows.map((r) => r.date));
}

/** Working days between two dates (inclusive): no weekends, no holidays. */
export async function workingDays(db: Database, start: string, end: string) {
  const off = await holidayDates(db, start, end);
  return eachDate(start, end).filter((d) => !isWeekend(d) && !off.has(d));
}

/** The person's employee record, if they have one that's still current. */
export async function currentEmployee(db: Database, userId: string) {
  return db.query.employees.findFirst({ where: and(eq(employees.userId, userId), ne(employees.status, "offboarded")) });
}

export function requireEmployee(employee: Employee | undefined): Employee {
  if (!employee) throw new AppError("NOT_AN_EMPLOYEE", "Attendance and leave are for people on the team.", 403);
  return employee;
}

/** A manager decides for their direct reports; HR and admins for everyone. Nobody decides their own. */
export function canManage(user: { sub: string; role: string }, employee: Pick<Employee, "userId" | "managerId">) {
  if (employee.userId === user.sub) return false;
  return isHr(user.role) || employee.managerId === user.sub;
}

/** Paid leave allowance, used (approved) and held (pending) for a calendar year. */
export async function balances(db: Database, employee: Employee, year: number) {
  const policies = await db.select().from(leavePolicies).where(eq(leavePolicies.employeeType, employee.employeeType));
  const taken = await db
    .select({ type: leaveRequests.leaveType, status: leaveRequests.status, days: leaveRequests.days })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, employee.id), inArray(leaveRequests.status, ["pending", "approved"]), gte(leaveRequests.startDate, `${year}-01-01`), lte(leaveRequests.startDate, `${year}-12-31`)));
  return (["casual", "sick", "earned", "unpaid"] as LeaveType[]).map((type) => {
    const allowance = type === "unpaid" ? null : Number(policies.find((p) => p.leaveType === type)?.daysPerYear ?? 0);
    const used = taken.filter((t) => t.type === type && t.status === "approved").reduce((s, t) => s + Number(t.days), 0);
    const pending = taken.filter((t) => t.type === type && t.status === "pending").reduce((s, t) => s + Number(t.days), 0);
    return { type, allowance, used, pending, remaining: allowance === null ? null : Math.max(0, allowance - used - pending) };
  });
}

/** Leave that's approved or waiting, overlapping these dates. */
export async function overlapping(db: Database, employeeId: string, start: string, end: string) {
  return db.query.leaveRequests.findFirst({
    where: and(eq(leaveRequests.employeeId, employeeId), inArray(leaveRequests.status, ["pending", "approved"]), lte(leaveRequests.startDate, end), gte(leaveRequests.endDate, start)),
  });
}

/**
 * Loss-of-pay days a month's leave and attendance point to: approved unpaid
 * leave, plus days HR marked absent (1) or half day (0.5) that no approved
 * leave covers. Payroll uses this as the starting value for a new draft.
 */
export async function suggestedLopDays(db: Database, employeeId: string, period: string) {
  const { start, end } = periodBounds(period);
  const first = fmt(start);
  const last = fmt(new Date(end.getTime() - 86_400_000));
  const off = await holidayDates(db, first, last);
  const leave = await db.query.leaveRequests.findMany({
    where: and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, last), gte(leaveRequests.endDate, first)),
  });
  const onLeave = new Set<string>();
  let lop = 0;
  for (const l of leave) {
    for (const d of eachDate(l.startDate < first ? first : l.startDate, l.endDate > last ? last : l.endDate)) {
      if (isWeekend(d) || off.has(d)) continue;
      onLeave.add(d);
      if (l.leaveType === "unpaid") lop += l.halfDay ? 0.5 : 1;
    }
  }
  const marks = await db
    .select({ date: attendanceRecords.date, status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.employeeId, employeeId), gte(attendanceRecords.date, first), lte(attendanceRecords.date, last), or(eq(attendanceRecords.status, "absent"), eq(attendanceRecords.status, "half_day"))));
  for (const m of marks) if (!onLeave.has(m.date)) lop += m.status === "absent" ? 1 : 0.5;
  return lop;
}
