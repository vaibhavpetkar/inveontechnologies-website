import { Router } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { documentRequests, users } from "../shared/db/schema.js";
import { displayNameFor } from "../employees/onboarding.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";
import { claimFile } from "../files/service.js";
import { notify } from "../notifications/service.js";
import { notifyHiringTeam } from "../assessments/exams.js";
import { PIPELINE_ROLES, assertCanManageApplication, canViewApplication, getApplicationOr404, isRecruitmentAdmin } from "../applications/access.js";


const requestSchema = z.object({ documentName: z.string().min(2).max(200), note: z.string().max(1000).optional() });
const uploadSchema = z.object({ fileUrl: z.string().min(1).max(2000) });
const verifySchema = z.object({ approve: z.boolean(), note: z.string().max(1000).optional() });
// applicationId is optional: without it the document is for the candidate's own file, checked by HR.
const selfUploadSchema = z.object({ applicationId: z.string().uuid().nullish(), documentName: z.string().trim().min(2).max(200), fileUrl: z.string().min(1).max(2000) });

type DocRow = {
  id: string; application_id: string; document_name: string; document_type: string | null; status: string; file_url: string | null; note: string | null;
  created_at: string; updated_at: string; opportunity_id: string | null; opportunity: string | null; application_status: string | null; candidate_id: string; candidate_name: string; candidate_email: string;
};

const shapeDoc = (r: DocRow) => ({
  id: r.id,
  applicationId: r.application_id,
  documentName: r.document_name,
  documentType: r.document_type,
  status: r.status,
  fileUrl: r.file_url,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  opportunity: r.opportunity_id ? { id: r.opportunity_id, title: r.opportunity } : null,
  applicationStatus: r.application_status,
  candidate: { id: r.candidate_id, name: r.candidate_name, email: r.candidate_email },
});

/** Tells HR (everyone with the role) a candidate sent a document that isn't for an opening. */
async function notifyHr(db: Database, userId: string, documentName: string) {
  const hr = await db.query.users.findMany({ where: eq(users.role, "hr"), columns: { id: true } });
  if (!hr.length) return;
  const who = await displayNameFor(db, userId);
  await notify(db, { userIds: hr.map((u) => u.id), actorUserId: userId, kind: "document.uploaded", title: `${documentName} uploaded`, body: `${who} sent their ${documentName}. It's ready to check.`, link: "/documents", email: true });
}

export function documentsRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/applications/:applicationId/documents", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = requestSchema.parse(req.body);
    await assertCanManageApplication(db, req, await getApplicationOr404(db, req.params.applicationId));

    const [created] = await db
      .insert(documentRequests)
      .values({ applicationId: req.params.applicationId, userId: (await getApplicationOr404(db, req.params.applicationId)).userId, documentName: body.documentName, note: body.note, requestedBy: req.user!.sub })
      .returning();

    const application = await getApplicationOr404(db, req.params.applicationId);
    await notify(db, {
      userIds: [application.userId],
      actorUserId: req.user!.sub,
      kind: "document.requested",
      title: `Please upload: ${body.documentName}`,
      body: body.note ?? "Upload it from My documents in the portal.",
      link: "/documents",
      email: true,
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "document_request.create", entityType: "document_request", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ documentRequest: created });
  });

  /**
   * Everything a candidate has been asked for or has sent, across all their
   * applications, plus the applications they can attach a new document to.
   */
  router.get("/me/documents", requireAuth(env), async (req, res) => {
    const me = req.user!.sub;
    const rows = await db.execute<DocRow>(sql`
      SELECT d.id, d.application_id, d.document_name, d.document_type, d.status, d.file_url, d.note, d.created_at, d.updated_at,
        o.id AS opportunity_id, o.title AS opportunity, a.status AS application_status, u.id AS candidate_id,
        coalesce(u.full_name, cp.full_name, u.email) AS candidate_name, u.email AS candidate_email
      FROM document_requests d
      LEFT JOIN applications a ON a.id = d.application_id
      LEFT JOIN opportunities o ON o.id = a.opportunity_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE d.user_id = ${me}
      ORDER BY (d.status IN ('requested', 'rejected')) DESC, d.updated_at DESC
    `);
    const apps = await db.execute<{ id: string; title: string; status: string }>(sql`
      SELECT a.id, o.title, a.status FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
      WHERE a.user_id = ${me} AND a.status NOT IN ('rejected', 'withdrawn') ORDER BY a.created_at DESC
    `);
    res.json({ documents: rows.rows.map(shapeDoc), applications: apps.rows });
  });

  /** A candidate sends a document nobody asked for yet (a certificate, an ID), for HR to check. */
  router.post("/me/documents", requireAuth(env), async (req, res) => {
    const body = selfUploadSchema.parse(req.body);
    const application = body.applicationId ? await getApplicationOr404(db, body.applicationId) : null;
    if (application && application.userId !== req.user!.sub) throw new ForbiddenError();
    if (application && ["rejected", "withdrawn"].includes(application.status)) throw new AppError("INVALID_STATE", "This application is closed", 400);
    await claimFile(db, body.fileUrl, req.user!.sub, "application_document");
    const [created] = await db
      .insert(documentRequests)
      .values({ applicationId: application?.id ?? null, userId: req.user!.sub, documentName: body.documentName, documentType: "candidate_upload", status: "uploaded", fileUrl: body.fileUrl })
      .returning();
    if (application) {
      await notifyHiringTeam(db, application.opportunityId, application.userId, {
        kind: "document.uploaded",
        title: `${body.documentName} uploaded`,
        body: (who) => `${who} sent their ${body.documentName}. It's ready to check.`,
        link: "/documents",
      });
    } else {
      await notifyHr(db, req.user!.sub, body.documentName);
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "document_request.self_upload", entityType: "document_request", entityId: created.id, ipAddress: req.ip });
    res.status(201).json({ documentRequest: created });
  });

  /** HR's review queue: documents across every applicant they can manage. Managers see their own openings. */
  router.get("/documents/queue", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const { status } = z.object({ status: z.enum(["uploaded", "requested", "verified", "rejected", "all"]).default("uploaded") }).parse(req.query);
    const admin = isRecruitmentAdmin(req.user!.role);
    const rows = await db.execute<DocRow>(sql`
      SELECT d.id, d.application_id, d.document_name, d.document_type, d.status, d.file_url, d.note, d.created_at, d.updated_at,
        o.id AS opportunity_id, o.title AS opportunity, a.status AS application_status, u.id AS candidate_id,
        coalesce(u.full_name, cp.full_name, u.email) AS candidate_name, u.email AS candidate_email
      FROM document_requests d
      LEFT JOIN applications a ON a.id = d.application_id
      LEFT JOIN opportunities o ON o.id = a.opportunity_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE (${status} = 'all' OR d.status::text = ${status})
        AND (${admin} OR o.hiring_manager_id = ${req.user!.sub})
      ORDER BY d.updated_at ${status === "uploaded" ? sql`ASC` : sql`DESC`}
      LIMIT 500
    `);
    const counts = await db.execute<{ status: string; n: number }>(sql`
      SELECT d.status::text AS status, count(*)::int AS n FROM document_requests d
      LEFT JOIN applications a ON a.id = d.application_id LEFT JOIN opportunities o ON o.id = a.opportunity_id
      WHERE (${admin} OR o.hiring_manager_id = ${req.user!.sub}) GROUP BY d.status
    `);
    res.json({ documents: rows.rows.map(shapeDoc), counts: Object.fromEntries(counts.rows.map((c) => [c.status, c.n])) });
  });

  router.get("/applications/:applicationId/documents", requireAuth(env), async (req, res) => {
    const application = await getApplicationOr404(db, req.params.applicationId);
    if (!(await canViewApplication(db, req, application))) throw new ForbiddenError();

    const rows = await db.query.documentRequests.findMany({ where: eq(documentRequests.applicationId, application.id) });
    res.json({ documentRequests: rows });
  });

  router.post("/documents/:id/upload", requireAuth(env), async (req, res) => {
    const body = uploadSchema.parse(req.body);
    const doc = await db.query.documentRequests.findFirst({ where: eq(documentRequests.id, req.params.id) });
    if (!doc) throw new NotFoundError("Document request not found");

    if (doc.userId !== req.user!.sub) throw new ForbiddenError();
    const application = doc.applicationId ? await getApplicationOr404(db, doc.applicationId) : null;
    if (doc.status !== "requested" && doc.status !== "rejected") {
      throw new AppError("INVALID_STATE", `Cannot upload against a document request in status "${doc.status}"`, 400);
    }
    await claimFile(db, body.fileUrl, req.user!.sub, "application_document");

    const [updated] = await db
      .update(documentRequests)
      .set({ status: "uploaded", fileUrl: body.fileUrl, updatedAt: new Date() })
      .where(eq(documentRequests.id, doc.id))
      .returning();

    const link = application ? `/opportunities/${application.opportunityId}?applicant=${application.id}` : "/documents";
    if (!application) {
      await notifyHr(db, req.user!.sub, doc.documentName);
    } else if (doc.requestedBy) {
      await notify(db, { userIds: [doc.requestedBy], actorUserId: req.user!.sub, kind: "document.uploaded", title: `${doc.documentName} uploaded`, body: "It's ready to check.", link });
    } else {
      // Asked for by the joining form, so whoever runs hiring checks it.
      await notifyHiringTeam(db, application.opportunityId, application.userId, { kind: "document.uploaded", title: `${doc.documentName} uploaded`, body: (who) => `${who} uploaded their ${doc.documentName}. It's ready to check.`, link });
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "document_request.upload", entityType: "document_request", entityId: doc.id, ipAddress: req.ip });
    res.json({ documentRequest: updated });
  });

  router.post("/documents/:id/verify", requireAuth(env), requireRole(...PIPELINE_ROLES), async (req, res) => {
    const body = verifySchema.parse(req.body);
    const doc = await db.query.documentRequests.findFirst({ where: eq(documentRequests.id, req.params.id) });
    if (!doc) throw new NotFoundError("Document request not found");
    // Documents sent without an application are checked by HR and admins.
    if (doc.applicationId) await assertCanManageApplication(db, req, await getApplicationOr404(db, doc.applicationId));
    else if (!isRecruitmentAdmin(req.user!.role)) throw new ForbiddenError("HR checks documents that aren't for an opening");
    if (doc.status !== "uploaded") {
      throw new AppError("INVALID_STATE", `Cannot verify a document request in status "${doc.status}"`, 400);
    }

    const [updated] = await db
      .update(documentRequests)
      .set({ status: body.approve ? "verified" : "rejected", note: body.note ?? doc.note, verifiedBy: req.user!.sub, updatedAt: new Date() })
      .where(eq(documentRequests.id, doc.id))
      .returning();

    if (!body.approve) {
      await notify(db, {
        userIds: [doc.userId],
        actorUserId: req.user!.sub,
        kind: "document.rejected",
        title: `Please upload ${doc.documentName} again`,
        body: body.note ?? "The file you sent couldn't be accepted.",
        link: "/documents",
        email: true,
      });
    }
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
