import { Router, type NextFunction, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { users } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, ForbiddenError, UnauthorizedError } from "../../lib/errors.js";
import { hasSecondFactor } from "../auth/two-factor.js";
import { keyStatus, rotationState, startRotation } from "./service.js";

/**
 * Platform admins run the installation itself (master keys are shared by
 * every organization): the emails in INVEON_PLATFORM_ADMINS or, when that is
 * unset, the first account created on the installation.
 */
export async function isPlatformAdmin(db: Database, env: Env, user: { id: string; email: string }) {
  const listed = (env.INVEON_PLATFORM_ADMINS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (listed.length) return listed.includes(user.email.toLowerCase());
  const [first] = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt), asc(users.id)).limit(1);
  return first?.id === user.id;
}

function requirePlatformAdmin(db: Database, env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    const user = await db.query.users.findFirst({ where: eq(users.id, req.user.sub) });
    if (!user || !(await isPlatformAdmin(db, env, user))) throw new ForbiddenError("Only platform admins can manage encryption keys");
    if (!(await hasSecondFactor(db, user))) throw new AppError("TWO_FACTOR_REQUIRED", "Turn on two-factor authentication or add a passkey to continue (Account)", 403);
    next();
  };
}

/** Mounted at /api/v1/platform after requireAuth. */
export function platformRouter(db: Database, env: Env) {
  const router = Router();
  router.use(requirePlatformAdmin(db, env));

  router.get("/keys", async (_req, res) => {
    res.json({ status: await keyStatus(db), rotation: rotationState() });
  });

  router.post("/keys/rotate", async (req, res) => {
    const started = startRotation(db);
    await writeAudit(db, { orgId: null, actorUserId: req.user!.sub, action: "platform.keys_rotate", entityType: "platform", entityId: null, metadata: { started }, ipAddress: req.ip });
    res.status(202).json({ started, rotation: rotationState() });
  });

  return router;
}
