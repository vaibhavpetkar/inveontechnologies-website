import { EventEmitter } from "node:events";
import { inArray } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { notificationPreferences, notifications, users } from "../shared/db/schema.js";
import { enqueueJob, registerJobHandler } from "../shared/jobs.js";
import { deliverEmail, type OutgoingEmail } from "../shared/mailer.js";
import { logger } from "../shared/logger.js";

export type NotificationRow = typeof notifications.$inferSelect;

/**
 * In-process fan-out to open SSE streams (GET /notifications/stream).
 * One backend process today; with several, each process only reaches the
 * streams it holds, and the others see new rows on their next list fetch.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

let appUrl = "";
/** Called once at startup: email bodies link back to the portal. */
/** The portal's base URL for links in emails ("" until configured). */
export const portalUrl = () => appUrl;

export function configureNotifications(options: { appUrl: string }) {
  appUrl = options.appUrl.replace(/\/$/, "");
}

export function subscribe(userId: string, listener: (n: NotificationRow) => void) {
  bus.on(userId, listener);
  return () => bus.off(userId, listener);
}

export interface NotifyInput {
  /** Recipients. Duplicates and the actor (when given) are dropped. */
  userIds: (string | null | undefined)[];
  actorUserId?: string | null;
  kind: string;
  title: string;
  body?: string;
  /** Portal path to open, e.g. "/tasks/<id>". */
  link?: string;
  /** Same key for the same person = sent once (reminders). */
  dedupeKey?: string;
  /**
   * Send an email too, if the person allows email. Leave false for events
   * that already send their own email (assessment invites, certificates).
   */
  email?: boolean;
}

/**
 * The one way features tell people something happened: stores the
 * notification, pushes it to their open portal tabs, and queues an email
 * when they have email notifications on. Never throws — a notification
 * problem must not fail the action that caused it.
 */
export async function notify(db: Database, input: NotifyInput): Promise<void> {
  try {
    const ids = [...new Set(input.userIds.filter((id): id is string => !!id && id !== input.actorUserId))];
    if (ids.length === 0) return;

    const prefs = await db.query.notificationPreferences.findMany({ where: inArray(notificationPreferences.userId, ids) });
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
    const people = input.email ? await db.query.users.findMany({ where: inArray(users.id, ids), columns: { id: true, email: true } }) : [];
    const emailByUser = new Map(people.map((p) => [p.id, p.email]));

    for (const userId of ids) {
      const pref = prefByUser.get(userId);
      const inApp = pref?.inAppEnabled ?? true;
      const [row] = await db
        .insert(notifications)
        .values({ userId, kind: input.kind, title: input.title, body: input.body, link: input.link, dedupeKey: input.dedupeKey, inApp })
        .onConflictDoNothing()
        .returning();
      if (!row) continue; // already sent under this dedupeKey

      if (inApp) bus.emit(userId, row);

      const to = emailByUser.get(userId);
      if (input.email && to && (pref?.emailEnabled ?? true)) {
        const link = input.link && appUrl ? `\n\nOpen it in the portal:\n${appUrl}${input.link}` : "";
        await enqueueJob(db, "email.send", { to, subject: input.title, text: `${input.body ?? input.title}${link}\n\nYou can turn these emails off from the notifications menu in the portal.` });
      }
    }
  } catch (err) {
    logger.error({ err, kind: input.kind }, "Could not create notification");
  }
}

registerJobHandler("email.send", async (payload) => {
  await deliverEmail(payload as unknown as OutgoingEmail);
});
