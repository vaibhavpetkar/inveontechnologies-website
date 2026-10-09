import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { employeeOfMonth, employees, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { enqueueJob, every } from "../shared/jobs.js";
import { logger } from "../shared/logger.js";
import { notify } from "../notifications/service.js";
import { displayNameFor } from "../employees/onboarding.js";
import { companyProfile } from "../settings/company.js";
import { leaderboard, monthLabel, monthOf, shiftMonth, type PersonScore } from "./score.js";

const STAFF_VIEW = ["intern", "employee", "manager", "hr", "admin", "super_admin"] as const;
const PICKER_ROLES = ["hr", "admin", "super_admin"] as const;
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

const announceSchema = z.object({ month: MONTH, userId: z.string().uuid().optional(), note: z.string().trim().max(1000).optional() });

type EomRow = typeof employeeOfMonth.$inferSelect;

async function withPerson(db: Database, row: EomRow | undefined) {
  if (!row) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId), columns: { email: true } });
  return { ...row, score: Number(row.score), name: await displayNameFor(db, row.userId), email: user?.email ?? "", monthLabel: monthLabel(row.month) };
}

/**
 * Names the Employee of the Month: the given person, or the top of that
 * month's ranking. Everyone hears about it in the portal and the winner
 * gets a congratulation email. Picking again for the same month replaces it.
 */
export async function announceEmployeeOfMonth(db: Database, appUrl: string, input: { month: string; userId?: string; note?: string; chosenBy: string | null }) {
  const board = await leaderboard(db, input.month);
  const pick: PersonScore | undefined = input.userId ? board.find((r) => r.userId === input.userId) : board[0];
  if (!pick) throw new AppError("NOT_RANKED", "That person isn't on this month's ranking", 400);
  if (!input.userId && pick.score <= 0) throw new AppError("NO_SCORES", "Nobody has approved work this month yet", 400);
  const stats = { tasksDone: pick.tasksDone, hours: pick.hours, avgRating: pick.avgRating, onTimePercent: pick.onTimePercent };

  const [row] = await db
    .insert(employeeOfMonth)
    .values({ month: input.month, userId: pick.userId, score: String(pick.score), stats, note: input.note ?? null, chosenBy: input.chosenBy })
    .onConflictDoUpdate({ target: employeeOfMonth.month, set: { userId: pick.userId, score: String(pick.score), stats, note: input.note ?? null, chosenBy: input.chosenBy, emailedAt: null, createdAt: new Date() } })
    .returning();

  const label = monthLabel(input.month);
  const company = companyProfile();
  const first = pick.name.split(" ")[0];
  const everyone = await db.query.users.findMany({ where: inArray(users.role, [...STAFF_VIEW]), columns: { id: true } });
  await notify(db, {
    userIds: everyone.map((u) => u.id).filter((id) => id !== pick.userId),
    kind: "performance.employee_of_month",
    title: `${pick.name} is Employee of the Month for ${label}`,
    body: `Congratulations to ${pick.name}: ${pick.tasksDone} task${pick.tasksDone === 1 ? "" : "s"} approved${pick.avgRating ? ` with an average of ${pick.avgRating} stars` : ""}.${input.note ? `\n\n"${input.note}"` : ""}`,
    link: "/performance",
  });
  await notify(db, {
    userIds: [pick.userId],
    kind: "performance.employee_of_month",
    title: `You're Employee of the Month for ${label}!`,
    body: `Congratulations! Your work in ${label} put you at the top of the team ranking.`,
    link: "/performance",
  });
  await enqueueJob(db, "email.send", {
    to: pick.email,
    subject: `Congratulations, ${first}! You're ${company.name}'s Employee of the Month`,
    kind: "employee_of_month",
    refId: row.id,
    text: [
      `Dear ${first},`,
      "",
      `Congratulations! You have been named Employee of the Month for ${label} at ${company.name}.`,
      "",
      `In ${label} you completed ${pick.tasksDone} task${pick.tasksDone === 1 ? "" : "s"} (${pick.hours} hours of work)${pick.avgRating ? `, with an average reviewer rating of ${pick.avgRating} out of 5` : ""}${pick.onTimePercent !== null ? `, and ${pick.onTimePercent}% finished on time` : ""}.`,
      ...(input.note ? ["", input.note] : []),
      "",
      "Thank you for your hard work and dedication. Keep it up!",
      "",
      `See the team ranking: ${appUrl}/performance`,
      "",
      "Warm regards,",
      company.signatories[0]?.name ?? company.name,
      company.signatories[0]?.title ?? "",
      company.name,
    ].join("\n"),
  });
  await db.update(employeeOfMonth).set({ emailedAt: new Date() }).where(eq(employeeOfMonth.id, row.id));
  return row;
}

export function performanceRouter(db: Database, env: Env) {
  const router = Router();
  const appUrl = env.PORTAL_APP_URL.replace(/\/$/, "");

  /** The month's ranking, with each person's change from the month before. */
  router.get("/leaderboard", requireAuth(env), requireRole(...STAFF_VIEW), async (req, res) => {
    const month = MONTH.optional().parse(req.query.month) ?? monthOf();
    const [board, previous, winner] = await Promise.all([
      leaderboard(db, month),
      leaderboard(db, shiftMonth(month, -1)),
      db.query.employeeOfMonth.findFirst({ where: eq(employeeOfMonth.month, month) }),
    ]);
    const before = new Map(previous.map((r) => [r.userId, r]));
    res.json({
      month,
      monthLabel: monthLabel(month),
      rows: board.map((r) => ({ ...r, previousScore: before.get(r.userId)?.score ?? 0, previousRank: before.get(r.userId)?.rank ?? null })),
      employeeOfMonth: await withPerson(db, winner),
      canPick: (PICKER_ROLES as readonly string[]).includes(req.user!.role),
    });
  });

  /** One person's score month by month (self, their manager, or HR and admins). */
  router.get("/growth/:userId", requireAuth(env), requireRole(...STAFF_VIEW), async (req, res) => {
    const userId = req.params.userId === "me" ? req.user!.sub : req.params.userId;
    if (userId !== req.user!.sub && !(PICKER_ROLES as readonly string[]).includes(req.user!.role)) {
      const report = req.user!.role === "manager" ? await db.query.employees.findFirst({ where: and(eq(employees.userId, userId), eq(employees.managerId, req.user!.sub)) }) : undefined;
      if (!report) throw new ForbiddenError();
    }
    const months = z.coerce.number().int().min(2).max(12).default(6).parse(req.query.months);
    const current = monthOf();
    const series = [];
    for (let i = months - 1; i >= 0; i--) {
      const month = shiftMonth(current, -i);
      const board = await leaderboard(db, month);
      const me = board.find((r) => r.userId === userId);
      series.push({ month, monthLabel: monthLabel(month), score: me?.score ?? 0, rank: me && me.score > 0 ? me.rank : null, of: board.length, tasksDone: me?.tasksDone ?? 0, hours: me?.hours ?? 0, avgRating: me?.avgRating ?? null, onTimePercent: me?.onTimePercent ?? null });
    }
    const awards = await db.query.employeeOfMonth.findMany({ where: eq(employeeOfMonth.userId, userId), orderBy: desc(employeeOfMonth.month) });
    res.json({ userId, name: await displayNameFor(db, userId), series, awards: awards.map((a) => ({ month: a.month, monthLabel: monthLabel(a.month) })) });
  });

  router.get("/employee-of-month", requireAuth(env), requireRole(...STAFF_VIEW), async (_req, res) => {
    const rows = await db.query.employeeOfMonth.findMany({ orderBy: desc(employeeOfMonth.month), limit: 12 });
    const history = await Promise.all(rows.map((r) => withPerson(db, r)));
    res.json({ latest: history[0] ?? null, history });
  });

  router.post("/employee-of-month", requireAuth(env), requireRole(...PICKER_ROLES), async (req, res) => {
    const body = announceSchema.parse(req.body);
    if (body.month > monthOf()) throw new AppError("FUTURE_MONTH", "That month hasn't started yet", 400);
    const row = await announceEmployeeOfMonth(db, appUrl, { ...body, chosenBy: req.user!.sub });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "performance.employee_of_month", entityType: "user", entityId: row.userId, metadata: { month: body.month }, ipAddress: req.ip });
    res.status(201).json({ employeeOfMonth: await withPerson(db, row) });
  });

  router.delete("/employee-of-month/:month", requireAuth(env), requireRole(...PICKER_ROLES), async (req, res) => {
    const month = MONTH.parse(req.params.month);
    const row = await db.query.employeeOfMonth.findFirst({ where: eq(employeeOfMonth.month, month) });
    if (!row) throw new NotFoundError("Nobody was picked for that month");
    await db.delete(employeeOfMonth).where(eq(employeeOfMonth.id, row.id));
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "performance.employee_of_month.remove", entityType: "user", entityId: row.userId, metadata: { month }, ipAddress: req.ip });
    res.status(204).end();
  });

  return router;
}

/**
 * In the first week of a month, picks last month's Employee of the Month
 * from the ranking if nobody has been picked by hand yet.
 */
export async function autoPickEmployeeOfMonth(db: Database, appUrl: string, now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  if (ist.getUTCDate() > 7) return null;
  const month = shiftMonth(monthOf(now), -1);
  if (await db.query.employeeOfMonth.findFirst({ where: eq(employeeOfMonth.month, month) })) return null;
  const top = (await leaderboard(db, month))[0];
  if (!top || top.score <= 0) return null;
  return announceEmployeeOfMonth(db, appUrl, { month, chosenBy: null });
}

export function registerPerformanceSchedules(db: Database, appUrl: string) {
  every("employee-of-month", 60 * 60 * 1000, async () => {
    try {
      const row = await autoPickEmployeeOfMonth(db, appUrl);
      if (row) logger.info({ month: row.month, userId: row.userId }, "Employee of the Month picked");
    } catch (err) {
      logger.error({ err }, "Could not pick the Employee of the Month");
    }
  });
}
