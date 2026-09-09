import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { documentRequests, applications } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

const PIPELINE_ROLES = ["manager", "hr", "admin", "super_admin"] as const;

const requestSchema = z.object({ documentName: z.string().min(2).max(200), note: z.string().max(1000).optional() });
const uploadSchema = z.object({ fileUrl: z.string().min(1).max(2000) });
const verifySchema = z.object({ approve: z.boolean(), note: z.string().max(1000).optional() });

async function getApplicationOr404(db: Database, applicationId: string) {
  const application = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!application) throw new NotFoundError("Application not found");
  return application;
}

export function documentsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/applications/:applicationId/documents", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = requestSchema.parse(req.body);
    await getApplicationOr404(db, req.params.applicationId);

    const [created] = await db
      .insert(documentRequests)
      .values({ applicationId: req.params.applicationId, documentName: body.documentName, note: body.note, requestedBy: req.user!.sub })
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "document_request.create", entityType: "document_request", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ documentRequest: created });
  });

  router.get("/applications/:applicationId/documents", requireAuth(env), async (req, res) => {
    const application = await getApplicationOr404(db, req.params.applicationId);
    const isPrivileged = PIPELINE_ROLES.includes(req.user!.role as (typeof PIPELINE_ROLES)[number]);
    if (application.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    const rows = await db.query.documentRequests.findMany({ where: eq(documentRequests.applicationId, application.id) });
    res.json({ documentRequests: rows });
  });

  router.post("/documents/:id/upload", requireAuth(env), async (req, res) => {
    const body = uploadSchema.parse(req.body);
    const doc = await db.query.documentRequests.findFirst({ where: eq(documentRequests.id, req.params.id) });
    if (!doc) throw new NotFoundError("Document request not found");

    const application = await getApplicationOr404(db, doc.applicationId);
    if (application.userId !== req.user!.sub) throw new ForbiddenError();
    if (doc.status !== "requested" && doc.status !== "rejected") {
      throw new AppError("INVALID_STATE", `Cannot upload against a document request in status "${doc.status}"`, 400);
    }

    const [updated] = await db
      .update(documentRequests)
      .set({ status: "uploaded", fileUrl: body.fileUrl, updatedAt: new Date() })
      .where(eq(documentRequests.id, doc.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "document_request.upload", entityType: "document_request", entityId: doc.id, ipAddress: req.ip });
    res.json({ documentRequest: updated });
  });

  router.post("/documents/:id/verify", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = verifySchema.parse(req.body);
    const doc = await db.query.documentRequests.findFirst({ where: eq(documentRequests.id, req.params.id) });
    if (!doc) throw new NotFoundError("Document request not found");
    if (doc.status !== "uploaded") {
      throw new AppError("INVALID_STATE", `Cannot verify a document request in status "${doc.status}"`, 400);
    }

    const [updated] = await db
      .update(documentRequests)
      .set({ status: body.approve ? "verified" : "rejected", note: body.note ?? doc.note, verifiedBy: req.user!.sub, updatedAt: new Date() })
      .where(eq(documentRequests.id, doc.id))
      .returning();

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: body.approve ? "document_request.verify" : "document_request.reject",
      entityType: "document_request",
      entityId: doc.id,
      ipAddress: req.ip,
    });
    res.json({ documentRequest: updated });
  });

  return router;
}
