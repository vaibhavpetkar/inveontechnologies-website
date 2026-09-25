import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { onboardingTasks } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { PIPELINE_ROLES, assertCanManageApplication, canViewApplication, getApplicationOr404 } from "../applications/access.js";


const createTaskSchema = z.object({
  taskType: z.enum(["policy_consent", "emergency_contact", "document", "custom"]),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  required: z.boolean().default(true),
});

export function onboardingRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/applications/:applicationId/onboarding-tasks", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = createTaskSchema.parse(req.body);
    const application = await getApplicationOr404(db, req.params.applicationId);
    await assertCanManageApplication(db, req, application);
    if (application.status !== "selected") {
      throw new AppError("INVALID_STATE", `Can only add onboarding tasks for a "selected" application, not "${application.status}"`, 400);
    }

    const [created] = await db
      .insert(onboardingTasks)
      .values({ applicationId: application.id, ...body })
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "onboarding_task.create", entityType: "onboarding_task", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ task: created });
  });

  router.get("/applications/:applicationId/onboarding-tasks", requireAuth(env), async (req, res) => {
    const application = await getApplicationOr404(db, req.params.applicationId);
    if (!(await canViewApplication(db, req, application))) throw new ForbiddenError();

    const rows = await db.query.onboardingTasks.findMany({ where: eq(onboardingTasks.applicationId, application.id) });
    res.json({ tasks: rows });
  });

  router.post("/onboarding-tasks/:id/complete", requireAuth(env), async (req, res) => {
    const task = await db.query.onboardingTasks.findFirst({ where: eq(onboardingTasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Onboarding task not found");

    const application = await getApplicationOr404(db, task.applicationId);
    if (application.userId !== req.user!.sub) await assertCanManageApplication(db, req, application);

    if (task.status !== "pending") {
      throw new AppError("INVALID_STATE", `Task is already "${task.status}"`, 400);
    }

    const [updated] = await db
      .update(onboardingTasks)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(onboardingTasks.id, task.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "onboarding_task.complete", entityType: "onboarding_task", entityId: task.id, ipAddress: req.ip });
    res.json({ task: updated });
  });

  return router;
}
