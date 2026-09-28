import { createHash, randomUUID } from "node:crypto";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { filePurposeEnum, storedFiles } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { Env } from "../shared/env.js";
import { LocalStorage, storageKeyFor } from "./storage.js";
import { MAX_FILE_BYTES, canReadFile, checkUpload, publicFile } from "./service.js";

const uploadQuery = z.object({
  purpose: z.enum(filePurposeEnum.enumValues),
  name: z.string().trim().min(1).max(200),
});

// Per user, so one account can't fill the disk.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as express.Request & { user?: { sub: string } }).user?.sub ?? req.ip ?? "unknown",
  message: { error: { code: "RATE_LIMITED", message: "Too many uploads. Try again in a few minutes." } },
});

// Shown in the browser; anything else downloads.
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Upload: the raw file is the request body (no multipart), with ?purpose=
 * and ?name=. Mounted before express.json() so a .json-typed body isn't
 * parsed. Download: GET /:id, checked against where the file is attached.
 */
export function filesRouter(db: Database, env: Env) {
  const router = Router();
  const storage = new LocalStorage(env.PORTAL_UPLOAD_DIR);

  router.post("/", requireAuth(env), uploadLimiter, express.raw({ type: () => true, limit: MAX_FILE_BYTES + 1 }), async (req, res) => {
    const { purpose, name } = uploadQuery.parse(req.query);
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mimeType = checkUpload(purpose, name, bytes);

    const id = randomUUID();
    const storageKey = storageKeyFor(id);
    await storage.put(storageKey, bytes);
    try {
      const [file] = await db
        .insert(storedFiles)
        .values({ id, uploadedBy: req.user!.sub, purpose, originalName: name, mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storageKey })
        .returning();
      res.status(201).json({ file: publicFile(file) });
    } catch (err) {
      await storage.remove(storageKey).catch(() => undefined);
      throw err;
    }
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new NotFoundError("File not found");
    const file = await db.query.storedFiles.findFirst({ where: eq(storedFiles.id, id.data) });
    if (!file) throw new NotFoundError("File not found");
    if (!(await canReadFile(db, req, file))) throw new ForbiddenError();

    const opened = await storage.open(file.storageKey);
    if (!opened) {
      logger.error({ fileId: file.id, storageKey: file.storageKey }, "Stored file is missing from disk");
      throw new NotFoundError("File not found");
    }
    const inline = INLINE.has(file.mimeType) && req.query.download === undefined;
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(opened.size));
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.setHeader("Cache-Control", "private, max-age=3600");
    opened.stream.pipe(res);
  });

  return router;
}
