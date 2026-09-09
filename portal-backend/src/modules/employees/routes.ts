import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  departments,
  designations,
  employees,
  employeeOnboardingTasks,
  employeeDocuments,
  applications,
  offers,
  users,
} from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { formatBusinessId } from "../shared/business-id.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;
// Deliberately NOT including "manager" — employee records/documents/letters
// are restricted to the employee themselves + HR/Admin/Super Admin only,
// per the plan's "protected personal documents" requirement.

const createEmployeeSchema = z.object({
  employeeType: z.enum(["intern", "full_time", "contract"]),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  hrManagerId: z.string().uuid().optional(),
  joiningDate: z.string().datetime(),
  durationMonths: z.number().int().min(1).optional(),
});

const updateEmployeeSchema = z.object({
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  hrManagerId: z.string().uuid().optional(),
  status: z.enum(["preboarding", "active", "on_leave", "offboarded"]).optional(),
});

const uploadDocumentSchema = z.object({ documentType: z.string().min(2).max(200), fileUrl: z.string().min(1).max(2000) });
const verifyDocumentSchema = z.object({ approve: z.boolean(), note: z.string().max(1000).optional() });
const createTaskSchema = z.object({
  taskType: z.enum(["policy_consent", "access_activation", "document", "custom"]),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  required: z.boolean().default(true),
});

async function isSelfOrPrivileged(req: import("express").Request, employeeUserId: string) {
  if (employeeUserId === req.user!.sub) return true;
  return PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
}

export function employeesRouter(db: Database, env: Env) {
  const router = Router();

  // --- Lightweight taxonomy ---
  router.post("/departments", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const { name } = z.object({ name: z.string().min(2).max(200) }).parse(req.body);
    const [created] = await db.insert(departments).values({ name }).returning();
    res.status(201).json({ department: created });
  });
  router.get("/departments", requireAuth(env), async (_req, res) => {
    res.json({ departments: await db.query.departments.findMany() });
  });
  router.post("/designations", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const { title } = z.object({ title: z.string().min(2).max(200) }).parse(req.body);
    const [created] = await db.insert(designations).values({ title }).returning();
    res.status(201).json({ designation: created });
  });
  router.get("/designations", requireAuth(env), async (_req, res) => {
    res.json({ designations: await db.query.designations.findMany() });
  });

  // --- Authorized selection-to-onboarding: create employee from a selected application with an accepted offer ---
  router.post("/from-application/:applicationId", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createEmployeeSchema.parse(req.body);
    const application = await db.query.applications.findFirst({ where: eq(applications.id, req.params.applicationId) });
    if (!application) throw new NotFoundError("Application not found");
    if (application.status !== "selected") {
      throw new AppError("INVALID_STATE", `Application must be "selected" to onboard, not "${application.status}"`, 400);
    }

    const acceptedOffer = await db.query.offers.findFirst({ where: eq(offers.applicationId, application.id) });
    const hasAcceptedOffer = acceptedOffer?.status === "accepted";
    if (!hasAcceptedOffer) {
      throw new AppError("OFFER_NOT_ACCEPTED", "Cannot onboard without an accepted offer for this application", 400);
    }

    const existing = await db.query.employees.findFirst({ where: eq(employees.applicationId, application.id) });
    if (existing) {
      throw new AppError("EMPLOYEE_ALREADY_EXISTS", "An employee record already exists for this application", 409);
    }

    const newRole = body.employeeType === "intern" ? "intern" : "employee";

    const employee = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(employees)
        .values({
          userId: application.userId,
          applicationId: application.id,
          employeeType: body.employeeType,
          departmentId: body.departmentId,
          designationId: body.designationId,
          managerId: body.managerId,
          hrManagerId: body.hrManagerId,
          joiningDate: new Date(body.joiningDate),
          durationMonths: body.durationMonths,
          createdBy: req.user!.sub,
        })
        .returning();

      const businessId = formatBusinessId("INV-EMP", created.seqNumber);
      const [updated] = await tx.update(employees).set({ businessId }).where(eq(employees.id, created.id)).returning();

      // The actual portal-access transition: the underlying user's role
      // changes, not just a new row appearing in a table nobody checks.
      await tx.update(users).set({ role: newRole, updatedAt: new Date() }).where(eq(users.id, application.userId));

      return updated;
    });

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "employee.create",
      entityType: "employee",
      entityId: employee.id,
      metadata: { applicationId: application.id, businessId: employee.businessId },
      ipAddress: req.ip,
    });

    res.status(201).json({ employee });
  });

  router.get("/me", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.userId, req.user!.sub) });
    if (!employee) throw new NotFoundError("No employee record for this user");
    res.json({ employee });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (!(await isSelfOrPrivileged(req, employee.userId))) throw new ForbiddenError();
    res.json({ employee });
  });

  router.get("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const rows = await db.query.employees.findMany();
    res.json({ employees: rows });
  });

  router.put("/:id", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = updateEmployeeSchema.parse(req.body);
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");

    const [updated] = await db.update(employees).set({ ...body, updatedAt: new Date() }).where(eq(employees.id, employee.id)).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee.update", entityType: "employee", entityId: employee.id, ipAddress: req.ip });
    res.json({ employee: updated });
  });

  // --- Onboarding checklist (employee-scoped, separate from the earlier application-scoped one) ---
  router.post("/:id/onboarding-tasks", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createTaskSchema.parse(req.body);
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");

    const [created] = await db.insert(employeeOnboardingTasks).values({ employeeId: employee.id, ...body }).returning();
    res.status(201).json({ task: created });
  });

  router.get("/:id/onboarding-tasks", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (!(await isSelfOrPrivileged(req, employee.userId))) throw new ForbiddenError();

    res.json({ tasks: await db.query.employeeOnboardingTasks.findMany({ where: eq(employeeOnboardingTasks.employeeId, employee.id) }) });
  });

  router.post("/onboarding-tasks/:id/complete", requireAuth(env), async (req, res) => {
    const task = await db.query.employeeOnboardingTasks.findFirst({ where: eq(employeeOnboardingTasks.id, req.params.id) });
    if (!task) throw new NotFoundError("Onboarding task not found");
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, task.employeeId) });
    if (!employee || !(await isSelfOrPrivileged(req, employee.userId))) throw new ForbiddenError();
    if (task.status !== "pending") throw new AppError("INVALID_STATE", `Task is already "${task.status}"`, 400);

    const [updated] = await db.update(employeeOnboardingTasks).set({ status: "completed", completedAt: new Date() }).where(eq(employeeOnboardingTasks.id, task.id)).returning();
    res.json({ task: updated });
  });

  // --- Access activation: a real gate, checked by /me/dashboard below ---
  router.post("/:id/activate-access", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (employee.portalAccessActive) throw new AppError("ALREADY_ACTIVE", "Portal access is already active", 400);

    const requiredTasks = await db.query.employeeOnboardingTasks.findMany({ where: eq(employeeOnboardingTasks.employeeId, employee.id) });
    const incomplete = requiredTasks.filter((t) => t.required && t.status !== "completed");
    if (incomplete.length > 0) {
      throw new AppError("ONBOARDING_INCOMPLETE", `${incomplete.length} required onboarding task(s) are not yet completed`, 400);
    }

    const [updated] = await db
      .update(employees)
      .set({ portalAccessActive: true, status: "active", updatedAt: new Date() })
      .where(eq(employees.id, employee.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee.activate_access", entityType: "employee", entityId: employee.id, ipAddress: req.ip });
    res.json({ employee: updated });
  });

  router.get("/me/dashboard", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.userId, req.user!.sub) });
    if (!employee) throw new NotFoundError("No employee record for this user");
    if (!employee.portalAccessActive) {
      throw new AppError("ACCESS_NOT_ACTIVATED", "Your employee portal access has not been activated yet — complete onboarding first", 403);
    }

    const tasks = await db.query.employeeOnboardingTasks.findMany({ where: eq(employeeOnboardingTasks.employeeId, employee.id) });
    const documents = await db.query.employeeDocuments.findMany({ where: eq(employeeDocuments.employeeId, employee.id) });

    res.json({
      employee,
      onboarding: { total: tasks.length, completed: tasks.filter((t) => t.status === "completed").length },
      documents: documents.map(({ fileUrl, ...rest }) => rest), // don't leak raw file references into a dashboard summary
      notifications: [], // Phase 9 (real notifications) not built yet
    });
  });

  // --- Protected personal documents: self + HR/Admin/Super Admin ONLY, never Manager ---
  router.post("/:id/documents", requireAuth(env), async (req, res) => {
    const body = uploadDocumentSchema.parse(req.body);
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (employee.userId !== req.user!.sub) throw new ForbiddenError("Only the employee themselves can upload their own documents");

    const [created] = await db.insert(employeeDocuments).values({ employeeId: employee.id, ...body }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee_document.upload", entityType: "employee_document", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ document: created });
  });

  router.get("/:id/documents", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.id) });
    if (!employee) throw new NotFoundError("Employee not found");
    if (!(await isSelfOrPrivileged(req, employee.userId))) throw new ForbiddenError();

    res.json({ documents: await db.query.employeeDocuments.findMany({ where: eq(employeeDocuments.employeeId, employee.id) }) });
  });

  router.post("/documents/:id/verify", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = verifyDocumentSchema.parse(req.body);
    const doc = await db.query.employeeDocuments.findFirst({ where: eq(employeeDocuments.id, req.params.id) });
    if (!doc) throw new NotFoundError("Document not found");
    if (doc.status !== "uploaded") throw new AppError("INVALID_STATE", `Cannot verify a document in status "${doc.status}"`, 400);

    const [updated] = await db
      .update(employeeDocuments)
      .set({ status: body.approve ? "verified" : "rejected", note: body.note, verifiedBy: req.user!.sub, updatedAt: new Date() })
      .where(eq(employeeDocuments.id, doc.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: body.approve ? "employee_document.verify" : "employee_document.reject", entityType: "employee_document", entityId: doc.id, ipAddress: req.ip });
    res.json({ document: updated });
  });

  return router;
}
