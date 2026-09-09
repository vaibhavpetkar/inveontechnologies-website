import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { letterTemplates, employeeLetters, employees, departments, designations } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

// Deliberately NOT including "manager" — letters are an HR/Admin function
// with a named authorized signatory, per the plan.
const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;

const createTemplateSchema = z.object({
  letterType: z.enum(["joining", "appointment"]),
  title: z.string().min(2).max(200),
  bodyTemplate: z.string().min(10).max(20000),
});

const generateSchema = z.object({
  letterType: z.enum(["joining", "appointment"]),
  templateId: z.string().uuid(),
  signatoryName: z.string().min(2).max(200),
  signatoryTitle: z.string().min(2).max(200),
});

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

export function letterTemplatesRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createTemplateSchema.parse(req.body);
    const [template] = await db.insert(letterTemplates).values({ ...body, createdBy: req.user!.sub }).returning();
    res.status(201).json({ template });
  });

  router.get("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (_req, res) => {
    res.json({ templates: await db.query.letterTemplates.findMany() });
  });

  return router;
}

export function employeeLettersRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/employees/:employeeId/letters/generate", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = generateSchema.parse(req.body);
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.employeeId) });
    if (!employee) throw new NotFoundError("Employee not found");

    const template = await db.query.letterTemplates.findFirst({ where: eq(letterTemplates.id, body.templateId) });
    if (!template) throw new NotFoundError("Letter template not found");
    if (template.letterType !== body.letterType) {
      throw new AppError("TEMPLATE_TYPE_MISMATCH", `Template is for "${template.letterType}" letters, not "${body.letterType}"`, 400);
    }

    const [department, designation] = await Promise.all([
      employee.departmentId ? db.query.departments.findFirst({ where: eq(departments.id, employee.departmentId) }) : null,
      employee.designationId ? db.query.designations.findFirst({ where: eq(designations.id, employee.designationId) }) : null,
    ]);

    const existingVersions = await db.query.employeeLetters.findMany({ where: and(eq(employeeLetters.employeeId, employee.id), eq(employeeLetters.letterType, body.letterType)) });
    const nextVersion = existingVersions.length === 0 ? 1 : Math.max(...existingVersions.map((l) => l.version)) + 1;

    const content = renderTemplate(template.bodyTemplate, {
      employeeBusinessId: employee.businessId ?? "",
      designation: designation?.title ?? "",
      department: department?.name ?? "",
      joiningDate: employee.joiningDate.toISOString().slice(0, 10),
      signatoryName: body.signatoryName,
      signatoryTitle: body.signatoryTitle,
    });

    const [letter] = await db
      .insert(employeeLetters)
      .values({
        employeeId: employee.id,
        letterType: body.letterType,
        version: nextVersion,
        content,
        signatoryName: body.signatoryName,
        signatoryTitle: body.signatoryTitle,
        generatedBy: req.user!.sub,
      })
      .returning();

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "employee_letter.generate",
      entityType: "employee_letter",
      entityId: letter.id,
      metadata: { employeeId: employee.id, letterType: body.letterType, version: nextVersion },
      ipAddress: req.ip,
    });

    res.status(201).json({ letter });
  });

  router.get("/employees/:employeeId/letters", requireAuth(env), async (req, res) => {
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, req.params.employeeId) });
    if (!employee) throw new NotFoundError("Employee not found");
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (employee.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    const rows = await db.query.employeeLetters.findMany({ where: eq(employeeLetters.employeeId, employee.id), orderBy: desc(employeeLetters.generatedAt) });
    res.json({ letters: rows });
  });

  // Download = read the content + write an audit record of who accessed it
  // when. Unauthorized callers (anyone but the employee themselves or
  // HR/Admin/Super Admin) get 403 — never even a "not found" that would
  // leak existence.
  router.get("/letters/:id/download", requireAuth(env), async (req, res) => {
    const letter = await db.query.employeeLetters.findFirst({ where: eq(employeeLetters.id, req.params.id) });
    if (!letter) throw new NotFoundError("Letter not found");

    const employee = await db.query.employees.findFirst({ where: eq(employees.id, letter.employeeId) });
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (!employee || (employee.userId !== req.user!.sub && !isPrivileged)) throw new ForbiddenError();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "employee_letter.download", entityType: "employee_letter", entityId: letter.id, ipAddress: req.ip });
    res.json({ letter });
  });

  return router;
}
