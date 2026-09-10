import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { featureFlags, notificationPreferences, applications } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { writeAuditLog } from "../shared/audit.js";
import { isAdminTransitionAllowed, type ApplicationStatus } from "../applications/state-machine.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import type { Env } from "../shared/env.js";

const SENSITIVE_ROLES = ["admin", "super_admin"] as const;

const setFlagSchema = z.object({ key: z.string().min(1).max(200), enabled: z.boolean(), description: z.string().max(1000).optional() });
const prefsSchema = z.object({ emailEnabled: z.boolean().optional(), inAppEnabled: z.boolean().optional() });
const bulkTransitionSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(500),
  toStatus: z.enum(["under_review", "shortlisted", "selected", "rejected"]),
  note: z.string().max(2000).optional(),
  dryRun: z.boolean().default(true),
});

export function featureFlagsRouter(db: Database, env: Env) {
  const router = Router();

  router.put("/", requireAuth(env), requireRole(...SENSITIVE_ROLES), async (req, res) => {
    const body = setFlagSchema.parse(req.body);
    const existing = await db.query.featureFlags.findFirst({ where: eq(featureFlags.key, body.key) });

    let flag;
    if (existing) {
      [flag] = await db.update(featureFlags).set({ enabled: body.enabled, description: body.description ?? existing.description, updatedBy: req.user!.sub, updatedAt: new Date() }).where(eq(featureFlags.id, existing.id)).returning();
    } else {
      [flag] = await db.insert(featureFlags).values({ key: body.key, enabled: body.enabled, description: body.description, updatedBy: req.user!.sub }).returning();
    }

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "feature_flag.set", entityType: "feature_flag", entityId: flag.id, metadata: { key: body.key, enabled: body.enabled }, ipAddress: req.ip });
    res.json({ flag });
  });

  router.get("/", requireAuth(env), async (_req, res) => {
    res.json({ flags: await db.query.featureFlags.findMany() });
  });

  return router;
}

export function notificationPreferencesRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/", requireAuth(env), async (req, res) => {
    const existing = await db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, req.user!.sub) });
    res.json({ preferences: existing ?? { userId: req.user!.sub, emailEnabled: true, inAppEnabled: true } });
  });

  router.put("/", requireAuth(env), async (req, res) => {
    const body = prefsSchema.parse(req.body);
    const existing = await db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, req.user!.sub) });

    let prefs;
    if (existing) {
      [prefs] = await db.update(notificationPreferences).set({ ...body, updatedAt: new Date() }).where(eq(notificationPreferences.userId, req.user!.sub)).returning();
    } else {
      [prefs] = await db.insert(notificationPreferences).values({ userId: req.user!.sub, ...body }).returning();
    }
    res.json({ preferences: prefs });
  });

  return router;
}

interface BulkTransitionResult {
  applicationId: string;
  valid?: boolean;
  success?: boolean;
  reason?: string;
  error?: string;
}

export function bulkActionsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/applications/transition", requireAuth(env), requireRole(...SENSITIVE_ROLES), async (req, res) => {
    const body = bulkTransitionSchema.parse(req.body);
    const results: BulkTransitionResult[] = [];

    for (const applicationId of body.applicationIds) {
      const application = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
      if (!application) {
        results.push({ applicationId, valid: false, success: false, error: "Application not found" });
        continue;
      }

      const from = application.status as ApplicationStatus;
      const allowed = isAdminTransitionAllowed(from, body.toStatus);
      if (!allowed) {
        results.push({ applicationId, valid: false, success: false, reason: `Cannot move from "${from}" to "${body.toStatus}"` });
        continue;
      }

      if (body.dryRun) {
        results.push({ applicationId, valid: true });
        continue;
      }

      try {
        await applyApplicationTransition(db, { applicationId, from, to: body.toStatus, actorUserId: req.user!.sub, note: body.note });
        results.push({ applicationId, success: true });
      } catch (err) {
        results.push({ applicationId, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    if (!body.dryRun) {
      const succeeded = results.filter((r) => r.success).length;
      await writeAuditLog(db, {
        actorUserId: req.user!.sub,
        action: "bulk.application_transition",
        entityType: "application",
        metadata: { toStatus: body.toStatus, requested: body.applicationIds.length, succeeded, failed: body.applicationIds.length - succeeded },
        ipAddress: req.ip,
      });
    }

    const succeeded = results.filter((r) => r.success || r.valid).length;
    res.json({ dryRun: body.dryRun, requested: body.applicationIds.length, succeeded, failed: body.applicationIds.length - succeeded, results });
  });

  return router;
}
