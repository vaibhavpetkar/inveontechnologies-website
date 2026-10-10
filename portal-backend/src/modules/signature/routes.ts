import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { userSignatures } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

const MAX_BYTES = 300 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

const signatureSchema = z.object({ image: z.string().regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "Use a PNG or JPEG image").max(Math.ceil((MAX_BYTES * 4) / 3) + 40) });

/** Checks the bytes really are the PNG/JPEG the data URL claims. */
function checkImage(dataUrl: string) {
  const [, type, data] = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/)!;
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > MAX_BYTES) throw new AppError("FILE_TOO_LARGE", "The signature image can be up to 300 KB.", 413);
  const magic = type === "png" ? PNG : JPEG;
  if (!magic.every((b, i) => bytes[i] === b)) throw new AppError("FILE_CONTENT_MISMATCH", "That doesn't look like a real image.", 400);
}

/** The person's saved signature as a data URL, or null. */
export async function signatureFor(db: Database, userId: string): Promise<string | null> {
  const row = await db.query.userSignatures.findFirst({ where: eq(userSignatures.userId, userId) });
  return row?.image ?? null;
}

/** /api/v1/me/signature: everyone manages their own signature. */
export function signatureRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/", requireAuth(env), async (req, res) => {
    const row = await db.query.userSignatures.findFirst({ where: eq(userSignatures.userId, req.user!.sub) });
    res.json({ signature: row ? { image: row.image, updatedAt: row.updatedAt } : null });
  });

  router.put("/", requireAuth(env), async (req, res) => {
    const { image } = signatureSchema.parse(req.body);
    checkImage(image);
    const now = new Date();
    await db
      .insert(userSignatures)
      .values({ userId: req.user!.sub, image, updatedAt: now })
      .onConflictDoUpdate({ target: userSignatures.userId, set: { image, updatedAt: now } });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "signature.save", entityType: "user", entityId: req.user!.sub, ipAddress: req.ip });
    res.json({ signature: { image, updatedAt: now } });
  });

  router.delete("/", requireAuth(env), async (req, res) => {
    await db.delete(userSignatures).where(eq(userSignatures.userId, req.user!.sub));
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "signature.remove", entityType: "user", entityId: req.user!.sub, ipAddress: req.ip });
    res.status(204).end();
  });

  return router;
}
