import { Router } from "express";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { users } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import type { Env } from "../shared/env.js";

// A user is "online" if they've heartbeated in the last 2 minutes. Simple
// and honest about what it is — see schema.ts comment on why there's no
// real connection-tracking presence system here.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function presenceRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/heartbeat", requireAuth(env), async (req, res) => {
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, req.user!.sub));
    res.json({ status: "ok" });
  });

  router.get("/", requireAuth(env), async (req, res) => {
    const userIds = z.array(z.string().uuid()).min(1).max(100).parse(
      typeof req.query.userIds === "string" ? req.query.userIds.split(",") : req.query.userIds,
    );
    const rows = await db.query.users.findMany({ where: inArray(users.id, userIds) });
    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
    res.json({
      presence: rows.map((u) => ({ userId: u.id, online: !!u.lastSeenAt && u.lastSeenAt > cutoff, lastSeenAt: u.lastSeenAt })),
    });
  });

  return router;
}
