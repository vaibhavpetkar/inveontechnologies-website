import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import type { Database } from "../shared/db/client.js";
import {
  messages,
  messageRevisions,
  messageMentions,
  messageAttachments,
  messageReports,
  readStates,
  channels,
} from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { getChannelMembership, isChannelModerator } from "./communities-routes.js";
import { isConversationParticipant } from "./conversations-routes.js";
import { scanAttachmentStub, MAX_ATTACHMENT_BYTES, ALLOWED_MIME_TYPES } from "./attachments.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;

const sendMessageSchema = z.object({
  channelId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  body: z.string().min(1).max(10000),
  replyToMessageId: z.string().uuid().optional(),
  mentionedUserIds: z.array(z.string().uuid()).max(50).default([]),
});

const editSchema = z.object({ body: z.string().min(1).max(10000) });
const reportSchema = z.object({ reason: z.string().min(3).max(1000) });
const attachSchema = z.object({ fileName: z.string().min(1).max(300), fileUrl: z.string().min(1).max(2000), fileSizeBytes: z.number().int().min(1), mimeType: z.string().min(1) });
const listQuerySchema = z.object({ channelId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(), afterSeq: z.coerce.number().int().optional(), beforeSeq: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
const markReadSchema = z.object({ channelId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(), lastReadSeq: z.number().int() });

// Keyed per-user (not per-IP) so one abusive account can't hide behind a
// shared office/NAT IP, and legitimate users on the same network aren't
// collectively throttled by someone else's behavior.
const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as import("express").Request & { user?: { sub: string } }).user?.sub ?? req.ip ?? "unknown",
  message: { error: { code: "RATE_LIMITED", message: "You're sending messages too fast — slow down" } },
});

async function assertCanAccessTarget(db: Database, userId: string, role: string, channelId?: string, conversationId?: string) {
  if (channelId) {
    const isPrivileged = PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number]);
    const membership = await getChannelMembership(db, channelId, userId);
    if (!membership && !isPrivileged) throw new ForbiddenError("Join the channel first");
    return;
  }
  if (conversationId) {
    if (!(await isConversationParticipant(db, conversationId, userId))) throw new ForbiddenError();
    return;
  }
  throw new AppError("MISSING_TARGET", "Provide either channelId or conversationId", 400);
}

export function messagesRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), sendMessageLimiter, async (req, res) => {
    const body = sendMessageSchema.parse(req.body);
    if (!!body.channelId === !!body.conversationId) {
      throw new AppError("INVALID_TARGET", "Provide exactly one of channelId or conversationId, not both or neither", 400);
    }
    await assertCanAccessTarget(db, req.user!.sub, req.user!.role, body.channelId, body.conversationId);

    if (body.channelId) {
      const membership = await getChannelMembership(db, body.channelId, req.user!.sub);
      if (membership?.mutedUntil && membership.mutedUntil > new Date()) {
        throw new AppError("MUTED", `You are muted in this channel until ${membership.mutedUntil.toISOString()}`, 403);
      }
      const channel = await db.query.channels.findFirst({ where: eq(channels.id, body.channelId) });
      if (channel?.type === "announcement") {
        const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
        if (membership?.role !== "owner" && membership?.role !== "moderator" && !isPrivileged) {
          throw new ForbiddenError("Only channel owners/moderators can post in an announcement channel");
        }
      }
    }

    if (body.replyToMessageId) {
      const parent = await db.query.messages.findFirst({ where: eq(messages.id, body.replyToMessageId) });
      if (!parent) throw new NotFoundError("Message being replied to not found");
    }

    const message = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(messages)
        .values({ channelId: body.channelId, conversationId: body.conversationId, authorId: req.user!.sub, body: body.body, replyToMessageId: body.replyToMessageId })
        .returning();
      await tx.insert(messageRevisions).values({ messageId: created.id, body: body.body, revisionType: "original" });
      if (body.mentionedUserIds.length > 0) {
        await tx.insert(messageMentions).values(body.mentionedUserIds.map((mentionedUserId) => ({ messageId: created.id, mentionedUserId })));
      }
      return created;
    });

    res.status(201).json({ message });
  });

  router.get("/", requireAuth(env), async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    if (!!query.channelId === !!query.conversationId) {
      throw new AppError("INVALID_TARGET", "Provide exactly one of channelId or conversationId", 400);
    }
    await assertCanAccessTarget(db, req.user!.sub, req.user!.role, query.channelId, query.conversationId);

    const targetCondition = query.channelId ? eq(messages.channelId, query.channelId) : eq(messages.conversationId, query.conversationId!);
    const conditions = [targetCondition];
    let rows: (typeof messages.$inferSelect)[];
    if (query.afterSeq !== undefined) {
      // Polling for new messages: everything after the client's last seen seq, oldest first.
      conditions.push(gt(messages.seqNumber, query.afterSeq));
      rows = await db.query.messages.findMany({ where: and(...conditions), orderBy: (m, { asc }) => [asc(m.seqNumber)], limit: query.limit });
    } else {
      // Opening a chat (or scrolling back with beforeSeq): the most recent
      // page, returned oldest-first so it renders top-to-bottom.
      if (query.beforeSeq !== undefined) conditions.push(lt(messages.seqNumber, query.beforeSeq));
      rows = (await db.query.messages.findMany({ where: and(...conditions), orderBy: desc(messages.seqNumber), limit: query.limit })).reverse();
    }
    const shaped = rows.map((m) => (m.deletedAt ? { ...m, body: "[message deleted]" } : m));
    res.json({ messages: shaped });
  });

  router.put("/:id", requireAuth(env), async (req, res) => {
    const body = editSchema.parse(req.body);
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");
    if (message.authorId !== req.user!.sub) throw new ForbiddenError("Only the author can edit this message");
    if (message.deletedAt) throw new AppError("MESSAGE_DELETED", "Cannot edit a deleted message", 400);

    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx.update(messages).set({ body: body.body, editedAt: new Date() }).where(eq(messages.id, message.id)).returning();
      await tx.insert(messageRevisions).values({ messageId: message.id, body: body.body, revisionType: "edit" });
      return [row];
    });
    res.json({ message: updated });
  });

  router.delete("/:id", requireAuth(env), async (req, res) => {
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");

    const isAuthor = message.authorId === req.user!.sub;
    const isModerator = message.channelId ? await isChannelModerator(db, message.channelId, req.user!.sub, req.user!.role) : PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (!isAuthor && !isModerator) throw new ForbiddenError();
    if (message.deletedAt) throw new AppError("ALREADY_DELETED", "Message is already deleted", 400);

    await db.transaction(async (tx) => {
      await tx.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, message.id));
      await tx.insert(messageRevisions).values({ messageId: message.id, body: message.body, revisionType: "delete" });
    });

    if (!isAuthor) {
      await writeAuditLog(db, { actorUserId: req.user!.sub, action: "message.moderator_delete", entityType: "message", entityId: message.id, ipAddress: req.ip });
    }
    res.json({ message: "Message deleted." });
  });

  router.get("/:id/history", requireAuth(env), async (req, res) => {
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");
    const isModerator = message.channelId ? await isChannelModerator(db, message.channelId, req.user!.sub, req.user!.role) : PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (message.authorId !== req.user!.sub && !isModerator) throw new ForbiddenError();
    res.json({ revisions: await db.query.messageRevisions.findMany({ where: eq(messageRevisions.messageId, message.id), orderBy: (r, { asc }) => [asc(r.createdAt)] }) });
  });

  router.post("/:id/pin", requireAuth(env), async (req, res) => {
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");
    if (!message.channelId) throw new AppError("CANNOT_PIN_DM", "Only channel messages can be pinned", 400);
    if (!(await isChannelModerator(db, message.channelId, req.user!.sub, req.user!.role))) throw new ForbiddenError();

    const [updated] = await db.update(messages).set({ pinnedAt: new Date() }).where(eq(messages.id, message.id)).returning();
    res.json({ message: updated });
  });

  router.post("/:id/unpin", requireAuth(env), async (req, res) => {
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");
    if (!message.channelId || !(await isChannelModerator(db, message.channelId, req.user!.sub, req.user!.role))) throw new ForbiddenError();

    const [updated] = await db.update(messages).set({ pinnedAt: null }).where(eq(messages.id, message.id)).returning();
    res.json({ message: updated });
  });

  router.post("/:id/attachments", requireAuth(env), async (req, res) => {
    const body = attachSchema.parse(req.body);
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");
    if (message.authorId !== req.user!.sub) throw new ForbiddenError("Only the message author can attach files to it");

    if (body.fileSizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new AppError("FILE_TOO_LARGE", `File exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit`, 400);
    }
    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      throw new AppError("UNSUPPORTED_FILE_TYPE", `File type "${body.mimeType}" is not allowed`, 400);
    }

    const scanResult = scanAttachmentStub(body.fileName, body.fileSizeBytes);
    const [attachment] = await db
      .insert(messageAttachments)
      .values({ messageId: message.id, ...body, malwareScanStatus: scanResult, uploadedBy: req.user!.sub })
      .returning();

    res.status(201).json({ attachment });
  });

  router.post("/:id/report", requireAuth(env), async (req, res) => {
    const body = reportSchema.parse(req.body);
    const message = await db.query.messages.findFirst({ where: eq(messages.id, req.params.id) });
    if (!message) throw new NotFoundError("Message not found");

    const [report] = await db.insert(messageReports).values({ messageId: message.id, reportedBy: req.user!.sub, reason: body.reason }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "message.report", entityType: "message_report", entityId: report.id, ipAddress: req.ip });
    res.status(201).json({ report });
  });

  router.get("/reports", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ reports: await db.query.messageReports.findMany({ where: status ? eq(messageReports.status, status as "open" | "reviewed" | "dismissed") : undefined }) });
  });

  router.post("/reports/:id/resolve", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const { status } = z.object({ status: z.enum(["reviewed", "dismissed"]) }).parse(req.body);
    const [updated] = await db.update(messageReports).set({ status, reviewedBy: req.user!.sub }).where(eq(messageReports.id, req.params.id)).returning();
    if (!updated) throw new NotFoundError("Report not found");
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "message_report.resolve", entityType: "message_report", entityId: updated.id, metadata: { status }, ipAddress: req.ip });
    res.json({ report: updated });
  });

  router.post("/read-state", requireAuth(env), async (req, res) => {
    const body = markReadSchema.parse(req.body);
    if (!!body.channelId === !!body.conversationId) throw new AppError("INVALID_TARGET", "Provide exactly one of channelId or conversationId", 400);
    await assertCanAccessTarget(db, req.user!.sub, req.user!.role, body.channelId, body.conversationId);

    const targetCondition = body.channelId ? eq(readStates.channelId, body.channelId) : eq(readStates.conversationId, body.conversationId!);
    const existing = await db.query.readStates.findFirst({ where: and(eq(readStates.userId, req.user!.sub), targetCondition) });

    let updated;
    if (existing) {
      [updated] = await db.update(readStates).set({ lastReadSeq: body.lastReadSeq, updatedAt: new Date() }).where(eq(readStates.id, existing.id)).returning();
    } else {
      [updated] = await db.insert(readStates).values({ userId: req.user!.sub, channelId: body.channelId, conversationId: body.conversationId, lastReadSeq: body.lastReadSeq }).returning();
    }
    res.json({ readState: updated });
  });

  return router;
}
