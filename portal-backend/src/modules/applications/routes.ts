import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, applicationEvents, candidateProfiles, opportunities } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { formatBusinessId } from "../shared/business-id.js";
import { checkEligibility, type EligibilityCriteria } from "./eligibility.js";
import { isAdminTransitionAllowed, isCandidateTransitionAllowed, type ApplicationStatus } from "./state-machine.js";
import type { Env } from "../shared/env.js";

const PIPELINE_ROLES = ["manager", "hr", "admin", "super_admin"] as const;

const applySchema = z.object({}).optional(); // no body fields needed yet — reserved for a future cover-note field

const transitionSchema = z.object({
  toStatus: z.enum(["under_review", "shortlisted", "selected", "rejected"]),
  note: z.string().max(2000).optional(),
});

const listMineQuerySchema = z.object({
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const pipelineQuerySchema = z.object({
  opportunityId: z.string().uuid(),
  status: z.enum(["submitted", "under_review", "shortlisted", "selected", "rejected", "withdrawn"]).optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function applicationsRouter(db: Database, env: Env) {
  const router = Router();

  // --- Candidate: apply to an opportunity ---
  router.post("/opportunities/:opportunityId/apply", requireAuth(env), requireRole("candidate"), async (req, res) => {
    applySchema.parse(req.body ?? {});
    const opportunityId = req.params.opportunityId;

    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId) });
    if (!opportunity || opportunity.status !== "published") {
      throw new NotFoundError("Opportunity not found or not accepting applications");
    }

    const profile = await db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.userId, req.user!.sub) });
    if (!profile?.profileCompleted) {
      throw new AppError("PROFILE_INCOMPLETE", "Complete your profile (name and phone) before applying", 400);
    }

    const eligibility = checkEligibility(opportunity.eligibility as EligibilityCriteria, {
      cgpa: profile.cgpa,
      degree: profile.degree,
      graduationYear: profile.graduationYear,
    });

    let application;
    try {
      application = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(applications)
          .values({ userId: req.user!.sub, opportunityId })
          .returning();
        const businessId = formatBusinessId("APP", created.seqNumber);
        const [updated] = await tx
          .update(applications)
          .set({ businessId })
          .where(eq(applications.id, created.id))
          .returning();
        await tx.insert(applicationEvents).values({
          applicationId: updated.id,
          fromStatus: null,
          toStatus: "submitted",
          actorUserId: req.user!.sub,
        });
        return updated;
      });
    } catch (err: unknown) {
      // Postgres unique_violation on (user_id, opportunity_id) — the DB is
      // the real source of truth for duplicate prevention, this is just a
      // friendlier error message than a raw constraint error.
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
        throw new AppError("DUPLICATE_APPLICATION", "You have already applied to this opportunity", 409);
      }
      throw err;
    }

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "application.submit",
      entityType: "application",
      entityId: application.id,
      metadata: { opportunityId, eligible: eligibility.eligible, eligibilityReasons: eligibility.reasons },
      ipAddress: req.ip,
    });

    res.status(201).json({ application, eligibilityWarning: eligibility.eligible ? null : eligibility.reasons });
  });

  // --- Candidate: my applications ---
  router.get("/me", requireAuth(env), async (req, res) => {
    const query = listMineQuerySchema.parse(req.query);
    const conditions = [eq(applications.userId, req.user!.sub)];

    const rows = await db.query.applications.findMany({
      where: and(...conditions),
      orderBy: desc(applications.seqNumber),
      limit: query.limit,
      with: { opportunity: true },
    });

    res.json({ applications: rows });
  });

  // --- Candidate: withdraw own application ---
  router.post("/:id/withdraw", requireAuth(env), async (req, res) => {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.id) });
    if (!application) throw new NotFoundError("Application not found");
    if (application.userId !== req.user!.sub) throw new ForbiddenError();

    if (!isCandidateTransitionAllowed(application.status as ApplicationStatus, "withdrawn")) {
      throw new AppError("INVALID_TRANSITION", `Cannot withdraw an application in status "${application.status}"`, 400);
    }

    await db.transaction(async (tx) => {
      await tx.update(applications).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(applications.id, application.id));
      await tx.insert(applicationEvents).values({
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: "withdrawn",
        actorUserId: req.user!.sub,
      });
    });

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "application.withdraw", entityType: "application", entityId: application.id, ipAddress: req.ip });
    res.json({ message: "Application withdrawn." });
  });

  // --- Get one (owner or privileged pipeline role) ---
  router.get("/:id", requireAuth(env), async (req, res) => {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.id), with: { opportunity: true } });
    if (!application) throw new NotFoundError("Application not found");

    const isPrivileged = PIPELINE_ROLES.includes(req.user!.role as (typeof PIPELINE_ROLES)[number]);
    if (application.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    res.json({ application });
  });

  // --- Timeline (owner or privileged pipeline role) ---
  router.get("/:id/timeline", requireAuth(env), async (req, res) => {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.id) });
    if (!application) throw new NotFoundError("Application not found");

    const isPrivileged = PIPELINE_ROLES.includes(req.user!.role as (typeof PIPELINE_ROLES)[number]);
    if (application.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    const events = await db.query.applicationEvents.findMany({
      where: eq(applicationEvents.applicationId, application.id),
      orderBy: (e, { asc }) => [asc(e.createdAt)],
    });
    res.json({ timeline: events });
  });

  // --- Admin pipeline: list applications for an opportunity ---
  router.get("/", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const query = pipelineQuerySchema.parse(req.query);
    const conditions = [eq(applications.opportunityId, query.opportunityId)];
    if (query.status) conditions.push(eq(applications.status, query.status));
    if (query.cursor) conditions.push(eq(applications.seqNumber, query.cursor)); // simple cursor placeholder — refined when pagination needs grow

    const rows = await db.query.applications.findMany({
      where: and(...conditions),
      orderBy: desc(applications.seqNumber),
      limit: query.limit,
    });

    res.json({ applications: rows });
  });

  // --- Admin pipeline: move an application through the state machine ---
  router.post("/:id/transition", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = transitionSchema.parse(req.body);
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.id) });
    if (!application) throw new NotFoundError("Application not found");

    const from = application.status as ApplicationStatus;
    if (!isAdminTransitionAllowed(from, body.toStatus)) {
      throw new AppError("INVALID_TRANSITION", `Cannot move an application from "${from}" to "${body.toStatus}"`, 400);
    }

    await db.transaction(async (tx) => {
      await tx.update(applications).set({ status: body.toStatus, updatedAt: new Date() }).where(eq(applications.id, application.id));
      await tx.insert(applicationEvents).values({
        applicationId: application.id,
        fromStatus: from,
        toStatus: body.toStatus,
        actorUserId: req.user!.sub,
        note: body.note,
      });
    });

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "application.transition",
      entityType: "application",
      entityId: application.id,
      metadata: { from, to: body.toStatus, note: body.note },
      ipAddress: req.ip,
    });

    res.json({ message: `Application moved to ${body.toStatus}.` });
  });

  return router;
}
