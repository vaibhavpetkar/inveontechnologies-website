import { Router } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { offers, applications } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

// Drafting an offer (HR) and sending it (Admin/Super Admin only) are
// deliberately different privilege levels — a lightweight version of the
// two-person separation-of-duties rule in docs/permissions.md for
// sensitive actions, without building a full proposal/approval table for it.
const DRAFT_ROLES = ["hr", "admin", "super_admin"] as const;
const SEND_ROLES = ["admin", "super_admin"] as const;

const createOfferSchema = z.object({
  content: z.string().min(10).max(20000),
  acceptanceDeadline: z.string().datetime().optional(),
});

async function resolveExpiryIfNeeded(db: Database, offer: typeof offers.$inferSelect) {
  if (offer.status !== "sent" || !offer.acceptanceDeadline || offer.acceptanceDeadline > new Date()) {
    return offer;
  }
  const [updated] = await db.update(offers).set({ status: "expired" }).where(eq(offers.id, offer.id)).returning();
  return updated;
}

export function offersRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/applications/:applicationId/offers", requireAuth(env), requireRole(...DRAFT_ROLES), async (req, res) => {
    const body = createOfferSchema.parse(req.body);
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");
    if (application.status !== "selected") {
      throw new AppError("INVALID_STATE", `Can only generate an offer for a "selected" application, not "${application.status}"`, 400);
    }

    const existing = await db.query.offers.findMany({ where: eq(offers.applicationId, application.id) });
    const nextVersion = existing.length === 0 ? 1 : Math.max(...existing.map((o) => o.version)) + 1;

    const [created] = await db
      .insert(offers)
      .values({
        applicationId: application.id,
        version: nextVersion,
        content: body.content,
        acceptanceDeadline: body.acceptanceDeadline ? new Date(body.acceptanceDeadline) : null,
        generatedBy: req.user!.sub,
      })
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "offer.create", entityType: "offer", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ offer: created });
  });

  router.get("/applications/:applicationId/offers", requireAuth(env), async (req, res) => {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");
    const isPrivileged = DRAFT_ROLES.includes(req.user!.role as (typeof DRAFT_ROLES)[number]) || req.user!.role === "manager";
    if (application.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    const rows = await db.query.offers.findMany({ where: eq(offers.applicationId, application.id), orderBy: desc(offers.version) });
    const resolved = [];
    for (const row of rows) resolved.push(await resolveExpiryIfNeeded(db, row));

    // Candidates only see offers that have actually been sent to them, not drafts.
    const visible = isPrivileged ? resolved : resolved.filter((o) => o.status !== "draft");
    res.json({ offers: visible });
  });

  router.post("/offers/:id/send", requireAuth(env), requireRole(...SEND_ROLES), async (req, res) => {
    const offer = await db.query.offers.findFirst({ where: eq(offers.id, req.params.id) });
    if (!offer) throw new NotFoundError("Offer not found");
    if (offer.status !== "draft") {
      throw new AppError("INVALID_STATE", `Cannot send an offer in status "${offer.status}"`, 400);
    }
    if (offer.generatedBy === req.user!.sub) {
      throw new ForbiddenError("The person who drafted an offer cannot also approve sending it");
    }

    const [updated] = await db
      .update(offers)
      .set({ status: "sent", sentAt: new Date(), approvedBy: req.user!.sub })
      .where(eq(offers.id, offer.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "offer.send", entityType: "offer", entityId: offer.id, ipAddress: req.ip });
    res.json({ offer: updated });
  });

  router.post("/offers/:id/accept", requireAuth(env), async (req, res) => {
    const initial = await db.query.offers.findFirst({ where: eq(offers.id, req.params.id) });
    if (!initial) throw new NotFoundError("Offer not found");

    const application = await db.query.applications.findFirst({ where: eq(applications.id, initial.applicationId) });
    if (!application || application.userId !== req.user!.sub) throw new ForbiddenError();

    const offer = await resolveExpiryIfNeeded(db, initial);
    if (offer.status !== "sent") {
      throw new AppError("INVALID_STATE", `Cannot accept an offer in status "${offer.status}"`, 400);
    }

    const [updated] = await db
      .update(offers)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(offers.id, offer.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "offer.accept", entityType: "offer", entityId: offer.id, ipAddress: req.ip });
    res.json({ offer: updated });
  });

  router.post("/offers/:id/reject", requireAuth(env), async (req, res) => {
    const initial = await db.query.offers.findFirst({ where: eq(offers.id, req.params.id) });
    if (!initial) throw new NotFoundError("Offer not found");

    const application = await db.query.applications.findFirst({ where: eq(applications.id, initial.applicationId) });
    if (!application || application.userId !== req.user!.sub) throw new ForbiddenError();

    const offer = await resolveExpiryIfNeeded(db, initial);
    if (offer.status !== "sent") {
      throw new AppError("INVALID_STATE", `Cannot reject an offer in status "${offer.status}"`, 400);
    }

    const [updated] = await db
      .update(offers)
      .set({ status: "rejected", respondedAt: new Date() })
      .where(eq(offers.id, offer.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "offer.reject", entityType: "offer", entityId: offer.id, ipAddress: req.ip });
    res.json({ offer: updated });
  });

  return router;
}
