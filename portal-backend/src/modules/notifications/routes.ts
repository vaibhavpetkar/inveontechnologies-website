import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { notifications } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { NotFoundError } from "../shared/errors.js";
import type { Env } from "../shared/env.js";
import { subscribe } from "./service.js";

const listQuerySchema = z.object({
  // createdAt of the last row on the previous page.
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(["true", "false"]).optional(),
});

const HEARTBEAT_MS = 25_000;

export function notificationsRouter(db: Database, env: Env) {
  const router = Router();

  const unreadCount = async (userId: string) => {
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.inApp, true), isNull(notifications.readAt)));
    return row?.n ?? 0;
  };

  router.get("/", requireAuth(env), async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const conditions = [eq(notifications.userId, req.user!.sub), eq(notifications.inApp, true)];
    if (query.before) conditions.push(lt(notifications.createdAt, new Date(query.before)));
    if (query.unread === "true") conditions.push(isNull(notifications.readAt));
    const rows = await db.query.notifications.findMany({
      where: and(...conditions),
      orderBy: [desc(notifications.createdAt)],
      limit: query.limit,
      columns: { dedupeKey: false, inApp: false },
    });
    res.json({
      notifications: rows,
      unreadCount: await unreadCount(req.user!.sub),
      nextBefore: rows.length === query.limit ? rows[rows.length - 1].createdAt.toISOString() : null,
    });
  });

  router.get("/unread-count", requireAuth(env), async (req, res) => {
    res.json({ unreadCount: await unreadCount(req.user!.sub) });
  });

  router.post("/read-all", requireAuth(env), async (req, res) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.user!.sub), isNull(notifications.readAt)));
    res.json({ unreadCount: 0 });
  });

  router.post("/:id/read", requireAuth(env), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const [row] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, req.user!.sub), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (!row) {
      const exists = await db.query.notifications.findFirst({ where: and(eq(notifications.id, id), eq(notifications.userId, req.user!.sub)) });
      if (!exists) throw new NotFoundError("Notification not found");
    }
    res.json({ unreadCount: await unreadCount(req.user!.sub) });
  });

  /**
   * Server-sent events: one "notification" event per new notification.
   * The portal reads this with fetch() (not EventSource) so the access token
   * can go in the Authorization header. `X-Accel-Buffering: no` stops nginx
   * holding events back; the heartbeat keeps nginx/Cloudflare from closing
   * an idle connection. When the access token expires the stream keeps
   * going — the client reconnects with a fresh token if it drops.
   */
  router.get("/stream", requireAuth(env), async (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("ready", { unreadCount: await unreadCount(req.user!.sub) });

    const unsubscribe = subscribe(req.user!.sub, ({ dedupeKey, inApp, ...n }) => send("notification", n));
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
