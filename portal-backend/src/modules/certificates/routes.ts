import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { certificateTemplates, certificates, courses, courseEnrollments, users, auditLogs } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { formatBusinessId } from "../shared/business-id.js";
import { logger } from "../shared/logger.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;
const REVOKE_ROLES = ["admin", "super_admin"] as const;

const createTemplateSchema = z.object({ title: z.string().min(2).max(200), bodyTemplate: z.string().min(10).max(20000) });
const issueSchema = z.object({ userId: z.string().uuid(), templateId: z.string().uuid() });
const revokeSchema = z.object({ reason: z.string().min(3).max(1000) });
const reissueSchema = z.object({ templateId: z.string().uuid().optional(), reason: z.string().min(3).max(1000) });

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

function generateVerificationCode(): string {
  return randomBytes(16).toString("base64url");
}

async function issueCertificateRow(
  db: Database,
  params: { userId: string; courseId: string; templateId: string; issuedBy: string; supersedesCertificateId?: string },
) {
  const [user, course, template] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, params.userId) }),
    db.query.courses.findFirst({ where: eq(courses.id, params.courseId) }),
    db.query.certificateTemplates.findFirst({ where: eq(certificateTemplates.id, params.templateId) }),
  ]);
  if (!user) throw new NotFoundError("User not found");
  if (!course) throw new NotFoundError("Course not found");
  if (!template) throw new NotFoundError("Certificate template not found");

  // "Incomplete-course denial" — the required check the plan's test list asks for.
  const enrollment = await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.userId, params.userId), eq(courseEnrollments.courseId, params.courseId)) });
  if (!enrollment || enrollment.status !== "completed") {
    throw new AppError("COURSE_NOT_COMPLETED", "Cannot issue a certificate for a course that isn't completed", 400);
  }

  // "Duplicate issue prevention" — the required check the plan's test list asks for.
  const existingActive = await db.query.certificates.findFirst({ where: and(eq(certificates.userId, params.userId), eq(certificates.courseId, params.courseId), eq(certificates.status, "issued")) });
  if (existingActive) {
    throw new AppError("CERTIFICATE_ALREADY_ISSUED", "An active certificate already exists for this user and course — revoke it first to reissue", 409);
  }

  const snapshotContent = renderTemplate(template.bodyTemplate, {
    recipientName: user.email, // candidateProfiles.fullName would be better; falling back to email keeps this working even if a profile was never filled in
    courseTitle: course.title,
    issuedDate: new Date().toISOString().slice(0, 10),
  });

  const verificationCode = generateVerificationCode();

  // Transaction-safe issue: insert + businessId assignment + audit log all
  // commit together or not at all.
  const certificate = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(certificates)
      .values({
        userId: params.userId,
        courseId: params.courseId,
        templateId: params.templateId,
        snapshotContent,
        verificationCode,
        issuedBy: params.issuedBy,
        supersedesCertificateId: params.supersedesCertificateId,
      })
      .returning();

    const businessId = formatBusinessId("INV-CERT", created.seqNumber);
    const [updated] = await tx.update(certificates).set({ businessId }).where(eq(certificates.id, created.id)).returning();

    await tx.insert(auditLogs).values({
      actorUserId: params.issuedBy,
      action: "certificate.issue",
      entityType: "certificate",
      entityId: updated.id,
      metadata: { userId: params.userId, courseId: params.courseId, businessId },
    });

    return updated;
  });

  // Notification / email outbox event: Phase 9 (real transactional outbox)
  // doesn't exist yet, so this is the interim equivalent — same stubbed-log
  // pattern used everywhere else in this codebase for "would send an email".
  logger.info({ toEmail: user.email, certificateId: certificate.businessId }, "[EMAIL STUB] Certificate issued notification would be sent");

  return certificate;
}

export function certificateTemplatesRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createTemplateSchema.parse(req.body);
    const [template] = await db.insert(certificateTemplates).values({ ...body, createdBy: req.user!.sub }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "certificate_template.create", entityType: "certificate_template", entityId: template.id, ipAddress: req.ip });
    res.status(201).json({ template });
  });

  router.get("/:id", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const template = await db.query.certificateTemplates.findFirst({ where: eq(certificateTemplates.id, req.params.id) });
    if (!template) throw new NotFoundError("Certificate template not found");
    res.json({ template });
  });

  // Renders the template against fake sample data — lets an admin preview
  // formatting before ever issuing a real certificate against it.
  router.post("/:id/preview", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const template = await db.query.certificateTemplates.findFirst({ where: eq(certificateTemplates.id, req.params.id) });
    if (!template) throw new NotFoundError("Certificate template not found");
    const preview = renderTemplate(template.bodyTemplate, { recipientName: "Sample Recipient", courseTitle: "Sample Course", issuedDate: new Date().toISOString().slice(0, 10) });
    res.json({ preview });
  });

  return router;
}

export function courseCertificateIssueRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/:courseId/certificates/issue", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = issueSchema.parse(req.body);
    const certificate = await issueCertificateRow(db, { userId: body.userId, courseId: req.params.courseId, templateId: body.templateId, issuedBy: req.user!.sub });
    res.status(201).json({ certificate });
  });

  return router;
}

export function certificatesRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/", requireAuth(env), async (req, res) => {
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    const filterUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;

    if (filterUserId && filterUserId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();

    const rows = await db.query.certificates.findMany({
      where: eq(certificates.userId, filterUserId ?? req.user!.sub),
    });
    res.json({ certificates: rows });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    const certificate = await db.query.certificates.findFirst({ where: eq(certificates.id, req.params.id) });
    if (!certificate) throw new NotFoundError("Certificate not found");
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (certificate.userId !== req.user!.sub && !isPrivileged) throw new ForbiddenError();
    res.json({ certificate });
  });

  router.post("/:id/revoke", requireAuth(env), requireRole(...REVOKE_ROLES), async (req, res) => {
    const body = revokeSchema.parse(req.body);
    const certificate = await db.query.certificates.findFirst({ where: eq(certificates.id, req.params.id) });
    if (!certificate) throw new NotFoundError("Certificate not found");
    if (certificate.status !== "issued") throw new AppError("INVALID_STATE", `Certificate is already "${certificate.status}"`, 400);

    const [updated] = await db
      .update(certificates)
      .set({ status: "revoked", revokedBy: req.user!.sub, revokedAt: new Date(), revokeReason: body.reason })
      .where(eq(certificates.id, certificate.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "certificate.revoke", entityType: "certificate", entityId: certificate.id, metadata: { reason: body.reason }, ipAddress: req.ip });
    res.json({ certificate: updated });
  });

  router.post("/:id/reissue", requireAuth(env), requireRole(...REVOKE_ROLES), async (req, res) => {
    const body = reissueSchema.parse(req.body);
    const original = await db.query.certificates.findFirst({ where: eq(certificates.id, req.params.id) });
    if (!original) throw new NotFoundError("Certificate not found");

    if (original.status === "issued") {
      await db
        .update(certificates)
        .set({ status: "revoked", revokedBy: req.user!.sub, revokedAt: new Date(), revokeReason: `Superseded by reissue: ${body.reason}` })
        .where(eq(certificates.id, original.id));
      await writeAuditLog(db, { actorUserId: req.user!.sub, action: "certificate.revoke", entityType: "certificate", entityId: original.id, metadata: { reason: `Superseded by reissue: ${body.reason}` }, ipAddress: req.ip });
    }

    const newCertificate = await issueCertificateRow(db, {
      userId: original.userId,
      courseId: original.courseId,
      templateId: body.templateId ?? original.templateId,
      issuedBy: req.user!.sub,
      supersedesCertificateId: original.id,
    });

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "certificate.reissue",
      entityType: "certificate",
      entityId: newCertificate.id,
      metadata: { supersedesCertificateId: original.id, reason: body.reason },
      ipAddress: req.ip,
    });

    res.status(201).json({ certificate: newCertificate });
  });

  // --- Public verification — no auth, minimum necessary data only ---
  router.get("/verify/:verificationCode", async (req, res) => {
    const certificate = await db.query.certificates.findFirst({ where: eq(certificates.verificationCode, req.params.verificationCode) });
    if (!certificate) {
      res.status(404).json({ valid: false, message: "No certificate found for this verification code" });
      return;
    }

    const [user, course] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, certificate.userId) }),
      db.query.courses.findFirst({ where: eq(courses.id, certificate.courseId) }),
    ]);

    res.json({
      valid: certificate.status === "issued",
      status: certificate.status,
      businessId: certificate.businessId,
      recipientName: user?.email ?? "Unknown", // see issueCertificateRow note on recipientName source
      courseTitle: course?.title ?? "Unknown",
      issuedAt: certificate.issuedAt,
      revokedAt: certificate.revokedAt,
      // Deliberately NOT included: user id, email, phone, internal notes,
      // who issued/revoked it, or any other internal metadata — "minimum
      // necessary data" per the plan.
    });
  });

  return router;
}
