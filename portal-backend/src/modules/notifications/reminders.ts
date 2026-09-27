import { and, gt, isNotNull, lte, notInArray } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { tasks } from "../shared/db/schema.js";
import { every } from "../shared/jobs.js";
import { generateDueRecurrences } from "../tasks/routes.js";
import { notify } from "./service.js";
import { formatWhen } from "../shared/format.js";

const CLOSED = ["done", "cancelled"] as const;

/**
 * Task deadline reminders: once when a task is due within the next 24
 * hours, and once when it becomes overdue (the assignee and the person who
 * assigned it). The dedupe key includes the due date, so moving the
 * deadline earns a fresh reminder.
 */
export async function sendTaskDueReminders(db: Database, now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const dueSoon = await db.query.tasks.findMany({
    where: and(isNotNull(tasks.assigneeId), isNotNull(tasks.dueDate), gt(tasks.dueDate, now), lte(tasks.dueDate, soon), notInArray(tasks.status, [...CLOSED])),
    limit: 500,
  });
  for (const t of dueSoon) {
    await notify(db, {
      userIds: [t.assigneeId],
      kind: "task.due_soon",
      title: `Due soon: ${t.title}`,
      body: `"${t.title}" is due ${formatWhen(t.dueDate!)}.`,
      link: `/tasks/${t.id}`,
      dedupeKey: `task-due-soon:${t.id}:${t.dueDate!.toISOString()}`,
      email: true,
    });
  }

  // Only look back a week so a long-forgotten task doesn't page anyone.
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const overdue = await db.query.tasks.findMany({
    where: and(isNotNull(tasks.assigneeId), isNotNull(tasks.dueDate), lte(tasks.dueDate, now), gt(tasks.dueDate, weekAgo), notInArray(tasks.status, [...CLOSED])),
    limit: 500,
  });
  for (const t of overdue) {
    const key = `task-overdue:${t.id}:${t.dueDate!.toISOString()}`;
    await notify(db, { userIds: [t.assigneeId], kind: "task.overdue", title: `Overdue: ${t.title}`, body: `"${t.title}" was due ${formatWhen(t.dueDate!)} and isn't finished yet.`, link: `/tasks/${t.id}`, dedupeKey: key, email: true });
    if (t.createdBy !== t.assigneeId) {
      await notify(db, { userIds: [t.createdBy], kind: "task.overdue", title: `Overdue: ${t.title}`, body: `A task you assigned, "${t.title}", is past its due date.`, link: `/tasks/${t.id}`, dedupeKey: key });
    }
  }
  return { dueSoon: dueSoon.length, overdue: overdue.length };
}

export function registerReminderSchedules(db: Database) {
  every("task-due-reminders", 15 * 60 * 1000, async () => {
    await sendTaskDueReminders(db);
  });
  every("task-recurrences", 5 * 60 * 1000, async () => {
    await generateDueRecurrences(db);
  });
}

