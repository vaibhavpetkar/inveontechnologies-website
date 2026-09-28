import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { attendanceRecords, employees, holidays, leavePolicies, leaveRequests, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { displayNameFor } from "../employees/onboarding.js";
import type { Env } from "../shared/env.js";
import { PERIOD_RE, periodBounds } from "../payroll/calc.js";
import { DATE_RE, HR_ROLES, PAID_LEAVE, balances, canManage, currentEmployee, eachDate, isHr, isWeekend, overlapping, requireEmployee, todayIst, workingDays } from "./service.js";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD");
const LEAVE_LABELS: Record<string, string> = { casual: "casual leave", sick: "sick leave", earned: "earned leave", unpaid: "unpaid leave" };

const fmtDay = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const span = (l: { startDate: string; endDate: string; halfDay: boolean }) => (l.startDate === l.endDate ? `${fmtDay(l.startDate)}${l.halfDay ? " (half day)" : ""}` : `${fmtDay(l.startDate)} to ${fmtDay(l.endDate)}`);

/** Staff see the people they look after: HR and admins everyone, managers their direct reports. */
function teamFilter(user: { sub: string; role: string }) {
  return isHr(user.role) ? sql`true` : sql`e.manager_id = ${user.sub}`;
}

// --- Attendance ---

export function attendanceRouter(db: Database, env: Env) {
  const router = Router();
  router.use(requireAuth(env));

  /** My month: every day with its check-in, leave or holiday, plus today's state. */
  router.get("/me", async (req, res) => {
    const employee = requireEmployee(await currentEmployee(db, req.user!.sub));
    const month = z.string().regex(PERIOD_RE).parse(req.query.month ?? todayIst().slice(0, 7));
    const { start, end } = periodBounds(month);
    const first = start.toISOString().slice(0, 10);
    const last = new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10);
    const [records, leave, holidayRows] = await Promise.all([
      db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), gte(attendanceRecords.date, first), lte(attendanceRecords.date, last))),
      db.query.leaveRequests.findMany({ where: and(eq(leaveRequests.employeeId, employee.id), inArray(leaveRequests.status, ["pending", "approved"]), lte(leaveRequests.startDate, last), gte(leaveRequests.endDate, first)) }),
      db.select().from(holidays).where(and(gte(holidays.date, first), lte(holidays.date, last))),
    ]);
    const today = todayIst();
    res.json({
      month,
      today,
      todayRecord: records.find((r) => r.date === today) ?? null,
      days: eachDate(first, last).map((date) => {
        const l = leave.find((x) => x.startDate <= date && x.endDate >= date);
        return {
          date,
          weekend: isWeekend(date),
          holiday: holidayRows.find((h) => h.date === date)?.name ?? null,
          record: records.find((r) => r.date === date) ?? null,
          leave: l ? { id: l.id, type: l.leaveType, status: l.status, halfDay: l.halfDay } : null,
        };
      }),
    });
  });

  router.post("/check-in", async (req, res) => {
    const employee = requireEmployee(await currentEmployee(db, req.user!.sub));
    const { workMode } = z.object({ workMode: z.enum(["office", "remote"]).default("office") }).parse(req.body ?? {});
    const date = todayIst();
    const [row] = await db
      .insert(attendanceRecords)
      .values({ employeeId: employee.id, date, status: "present", workMode, checkInAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AppError("ALREADY_CHECKED_IN", "You've already checked in today.", 409);
    res.status(201).json({ record: row });
  });

  router.post("/check-out", async (req, res) => {
    const employee = requireEmployee(await currentEmployee(db, req.user!.sub));
    const [row] = await db
      .update(attendanceRecords)
      .set({ checkOutAt: new Date(), updatedAt: new Date() })
      .where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.date, todayIst()), sql`${attendanceRecords.checkInAt} IS NOT NULL`, sql`${attendanceRecords.checkOutAt} IS NULL`))
      .returning();
    if (!row) throw new AppError("NOT_CHECKED_IN", "Check in first, or you've already checked out today.", 409);
    res.json({ record: row });
  });

  /** One day for the team: who checked in, who is on leave, who hasn't shown up. */
  router.get("/team", requireRole("manager", ...HR_ROLES), async (req, res) => {
    const date = dateSchema.parse(req.query.date ?? todayIst());
    const holiday = await db.query.holidays.findFirst({ where: eq(holidays.date, date) });
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT e.id AS "employeeId", e.business_id AS "businessId", e.employee_type AS "employeeType", u.id AS "userId", u.email,
             coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name,
             a.id AS "recordId", a.status, a.work_mode AS "workMode", a.check_in_at AS "checkInAt", a.check_out_at AS "checkOutAt", a.note, a.marked_by AS "markedBy",
             l.id AS "leaveId", l.leave_type AS "leaveType", l.status AS "leaveStatus", l.half_day AS "leaveHalfDay"
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      LEFT JOIN attendance_records a ON a.employee_id = e.id AND a.date = ${date}
      LEFT JOIN LATERAL (
        SELECT * FROM leave_requests lr
        WHERE lr.employee_id = e.id AND lr.status IN ('approved', 'pending') AND lr.start_date <= ${date} AND lr.end_date >= ${date}
        ORDER BY (lr.status = 'approved') DESC LIMIT 1
      ) l ON true
      WHERE e.status IN ('active', 'on_leave') AND e.joining_date <= (${date}::date + 1) AND ${teamFilter(req.user!)}
      ORDER BY name
    `);
    res.json({ date, weekend: isWeekend(date), holiday: holiday?.name ?? null, people: rows.rows });
  });

  /** HR and managers mark or correct a day: present, half day or absent. */
  router.put("/:employeeId/:date", requireRole("manager", ...HR_ROLES), async (req, res) => {
    const date = dateSchema.parse(req.params.date);
    const body = z.object({ status: z.enum(["present", "half_day", "absent"]).nullable(), note: z.string().trim().max(300).optional() }).parse(req.body);
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.employeeId) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (!canManage(req.user!, employee)) throw new ForbiddenError("You can only mark attendance for your team.");
    if (date > todayIst()) throw new AppError("FUTURE_DATE", "You can't mark attendance for a day that hasn't happened.", 400);
    if (body.status === null) {
      // Clearing a mark HR made; a real check-in stays.
      await db.delete(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.date, date), sql`${attendanceRecords.checkInAt} IS NULL`));
      const record = await db.query.attendanceRecords.findFirst({ where: and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.date, date)) });
      res.json({ record: record ?? null });
      return;
    }
    const values = { status: body.status, note: body.note || null, markedBy: req.user!.sub, updatedAt: new Date() };
    const [record] = await db
      .insert(attendanceRecords)
      .values({ employeeId: employee.id, date, ...values })
      .onConflictDoUpdate({ target: [attendanceRecords.employeeId, attendanceRecords.date], set: values })
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "attendance.mark", entityType: "employee", entityId: employee.id, metadata: { date, status: body.status } });
    res.json({ record });
  });

  return router;
}

// --- Leave ---

const requestSchema = z
  .object({
    leaveType: z.enum(["casual", "sick", "earned", "unpaid"]),
    startDate: dateSchema,
    endDate: dateSchema,
    halfDay: z.boolean().default(false),
    reason: z.string().trim().min(3, "Add a short reason").max(500),
  })
  .refine((b) => b.endDate >= b.startDate, { message: "The last day can't be before the first", path: ["endDate"] })
  .refine((b) => !b.halfDay || b.startDate === b.endDate, { message: "A half day is a single day", path: ["halfDay"] })
  .refine((b) => b.startDate.slice(0, 4) === b.endDate.slice(0, 4), { message: "Split leave across the new year into two requests", path: ["endDate"] });

async function approversFor(db: Database, employee: typeof employees.$inferSelect) {
  if (employee.managerId && employee.managerId !== employee.userId) return [employee.managerId];
  const hr = await db.select({ id: users.id }).from(users).where(and(inArray(users.role, [...HR_ROLES]), ne(users.id, employee.userId)));
  return hr.map((r) => r.id);
}

async function withPeople(db: Database, rows: (typeof leaveRequests.$inferSelect)[]) {
  const out = [];
  for (const r of rows) {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, r.employeeId), columns: { userId: true, businessId: true } });
    out.push({
      ...r,
      employee: employee ? { id: r.employeeId, userId: employee.userId, businessId: employee.businessId, name: await displayNameFor(db, employee.userId) } : null,
      decidedByName: r.decidedBy ? await displayNameFor(db, r.decidedBy) : null,
    });
  }
  return out;
}

export function leaveRouter(db: Database, env: Env) {
  const router = Router();
  router.use(requireAuth(env));

  /** My balances for the year and my requests. */
  router.get("/me", async (req, res) => {
    const employee = requireEmployee(await currentEmployee(db, req.user!.sub));
    const year = z.coerce.number().int().min(2020).max(2100).parse(req.query.year ?? todayIst().slice(0, 4));
    const requests = await db.query.leaveRequests.findMany({
      where: and(eq(leaveRequests.employeeId, employee.id), gte(leaveRequests.startDate, `${year}-01-01`), lte(leaveRequests.startDate, `${year}-12-31`)),
      orderBy: [desc(leaveRequests.startDate)],
    });
    res.json({ year, balances: await balances(db, employee, year), requests: await withPeople(db, requests) });
  });

  /** Working days a date range would take, so the form can show it before sending. */
  router.get("/days", async (req, res) => {
    const start = dateSchema.parse(req.query.start);
    const end = dateSchema.parse(req.query.end ?? start);
    if (end < start) throw new AppError("INVALID_RANGE", "The last day can't be before the first", 400);
    const days = await workingDays(db, start, end);
    res.json({ days: days.length });
  });

  router.post("/", async (req, res) => {
    const employee = requireEmployee(await currentEmployee(db, req.user!.sub));
    const body = requestSchema.parse(req.body);
    const working = await workingDays(db, body.startDate, body.endDate);
    if (working.length === 0) throw new AppError("NO_WORKING_DAYS", "Those dates are all weekends or holidays, so there's nothing to take off.", 400);
    const days = body.halfDay ? 0.5 : working.length;
    if (await overlapping(db, employee.id, body.startDate, body.endDate)) throw new AppError("LEAVE_OVERLAP", "You already have leave on some of those days.", 409);
    if ((PAID_LEAVE as readonly string[]).includes(body.leaveType)) {
      const balance = (await balances(db, employee, Number(body.startDate.slice(0, 4)))).find((b) => b.type === body.leaveType)!;
      if (days > (balance.remaining ?? 0)) {
        throw new AppError("INSUFFICIENT_BALANCE", `You have ${balance.remaining} ${balance.remaining === 1 ? "day" : "days"} of ${LEAVE_LABELS[body.leaveType]} left. Ask for unpaid leave for the rest.`, 400);
      }
    }
    const [row] = await db.insert(leaveRequests).values({ employeeId: employee.id, ...body, days: String(days) }).returning();
    const name = await displayNameFor(db, employee.userId);
    await notify(db, {
      userIds: await approversFor(db, employee),
      actorUserId: req.user!.sub,
      kind: "leave.requested",
      title: `${name} asked for ${LEAVE_LABELS[body.leaveType]}`,
      body: `${span(row)} (${days} ${days === 1 ? "day" : "days"}): ${body.reason}`,
      link: `/attendance?tab=requests`,
      email: true,
    });
    res.status(201).json({ request: row });
  });

  /** The person cancels a request that's waiting, or approved leave that hasn't started. HR can cancel any. */
  router.post("/:id/cancel", async (req, res) => {
    const row = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, req.params.id) });
    if (!row) throw new NotFoundError("Leave request not found");
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, row.employeeId) });
    const own = employee?.userId === req.user!.sub;
    if (!own && !isHr(req.user!.role)) throw new ForbiddenError();
    if (!["pending", "approved"].includes(row.status)) throw new AppError("NOT_CANCELLABLE", "This request is already closed.", 409);
    if (own && !isHr(req.user!.role) && row.status === "approved" && row.startDate <= todayIst()) {
      throw new AppError("ALREADY_STARTED", "This leave has already started. Ask HR to change it.", 409);
    }
    const [updated] = await db.update(leaveRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(leaveRequests.id, row.id)).returning();
    if (!own && employee) {
      await notify(db, { userIds: [employee.userId], actorUserId: req.user!.sub, kind: "leave.cancelled", title: `Your ${LEAVE_LABELS[row.leaveType]} for ${span(row)} was cancelled`, link: "/attendance", email: true });
    }
    res.json({ request: updated });
  });

  /** Requests the caller can decide: their reports' (managers) or everyone's (HR). */
  router.get("/requests", requireRole("manager", ...HR_ROLES), async (req, res) => {
    const status = z.enum(["pending", "approved", "rejected", "cancelled", "all"]).parse(req.query.status ?? "pending");
    const rows = await db
      .select({ r: leaveRequests })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .where(and(status === "all" ? undefined : eq(leaveRequests.status, status), isHr(req.user!.role) ? undefined : eq(employees.managerId, req.user!.sub), ne(employees.userId, req.user!.sub)))
      .orderBy(status === "pending" ? asc(leaveRequests.startDate) : desc(leaveRequests.startDate))
      .limit(200);
    res.json({ requests: await withPeople(db, rows.map((x) => x.r)) });
  });

  router.post("/:id/decide", requireRole("manager", ...HR_ROLES), async (req, res) => {
    const body = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(req.body);
    const row = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, req.params.id) });
    if (!row) throw new NotFoundError("Leave request not found");
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, row.employeeId) });
    if (!employee || !canManage(req.user!, employee)) throw new ForbiddenError("Only their manager or HR can decide this.");
    const [updated] = await db
      .update(leaveRequests)
      .set({ status: body.approve ? "approved" : "rejected", decidedBy: req.user!.sub, decidedAt: new Date(), decisionNote: body.note || null, updatedAt: new Date() })
      .where(and(eq(leaveRequests.id, row.id), eq(leaveRequests.status, "pending")))
      .returning();
    if (!updated) throw new AppError("ALREADY_DECIDED", "Someone already decided this request.", 409);
    await notify(db, {
      userIds: [employee.userId],
      actorUserId: req.user!.sub,
      kind: body.approve ? "leave.approved" : "leave.rejected",
      title: `Your ${LEAVE_LABELS[row.leaveType]} for ${span(row)} was ${body.approve ? "approved" : "declined"}`,
      body: body.note,
      link: "/attendance",
      email: true,
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: body.approve ? "leave.approve" : "leave.reject", entityType: "leave_request", entityId: row.id });
    res.json({ request: updated });
  });

  router.get("/policies", async (_req, res) => {
    res.json({ policies: await db.select().from(leavePolicies) });
  });

  router.put("/policies", requireRole(...HR_ROLES), async (req, res) => {
    const body = z
      .object({ policies: z.array(z.object({ employeeType: z.enum(["intern", "full_time", "contract"]), leaveType: z.enum(PAID_LEAVE), daysPerYear: z.number().min(0).max(60).multipleOf(0.5) })).min(1).max(9) })
      .parse(req.body);
    for (const p of body.policies) {
      await db
        .insert(leavePolicies)
        .values({ ...p, daysPerYear: String(p.daysPerYear) })
        .onConflictDoUpdate({ target: [leavePolicies.employeeType, leavePolicies.leaveType], set: { daysPerYear: String(p.daysPerYear), updatedAt: new Date() } });
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "leave.policy_update", entityType: "leave_policy", metadata: { policies: body.policies } });
    res.json({ policies: await db.select().from(leavePolicies) });
  });

  return router;
}

// --- Holidays ---

export function holidaysRouter(db: Database, env: Env) {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req, res) => {
    const year = z.coerce.number().int().min(2020).max(2100).parse(req.query.year ?? todayIst().slice(0, 4));
    const rows = await db.select().from(holidays).where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`))).orderBy(asc(holidays.date));
    res.json({ year, holidays: rows });
  });

  router.post("/", requireRole(...HR_ROLES), async (req, res) => {
    const body = z.object({ date: dateSchema, name: z.string().trim().min(2).max(80) }).parse(req.body);
    const [row] = await db.insert(holidays).values({ ...body, createdBy: req.user!.sub }).onConflictDoNothing().returning();
    if (!row) throw new AppError("HOLIDAY_EXISTS", "There's already a holiday on that date.", 409);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "holiday.create", entityType: "holiday", entityId: row.id, metadata: body });
    res.status(201).json({ holiday: row });
  });

  router.delete("/:id", requireRole(...HR_ROLES), async (req, res) => {
    const [row] = await db.delete(holidays).where(eq(holidays.id, req.params.id)).returning();
    if (!row) throw new NotFoundError("Holiday not found");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "holiday.delete", entityType: "holiday", entityId: row.id, metadata: { date: row.date, name: row.name } });
    res.status(204).end();
  });

  return router;
}

