import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { communities, channels, channelMembers, channelBans } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;

const createCommunitySchema = z.object({ name: z.string().min(2).max(200), description: z.string().max(2000).optional() });
const createChannelSchema = z.object({ name: z.string().min(2).max(200), type: z.enum(["public", "announcement"]).default("public") });

export async function getChannelMembership(db: Database, channelId: string, userId: string) {
  return db.query.channelMembers.findFirst({ where: and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)) });
}

export async function isChannelModerator(db: Database, channelId: string, userId: string, role: string): Promise<boolean> {
  if (PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])) return true;
  const membership = await getChannelMembership(db, channelId, userId);
  return membership?.role === "owner" || membership?.role === "moderator";
}

export function communitiesRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/", requireAuth(env), async (req, res) => {
    const body = createCommunitySchema.parse(req.body);
    const [community] = await db.insert(communities).values({ ...body, createdBy: req.user!.sub }).returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "community.create", entityType: "community", entityId: community.id, ipAddress: req.ip });
    res.status(201).json({ community });
  });

  router.get("/", requireAuth(env), async (_req, res) => {
    res.json({ communities: await db.query.communities.findMany() });
  });

  router.post("/:id/channels", requireAuth(env), async (req, res) => {
    const community = await db.query.communities.findFirst({ where: eq(communities.id, req.params.id) });
    if (!community) throw new NotFoundError("Community not found");
    const body = createChannelSchema.parse(req.body);

    const [channel] = await db.insert(channels).values({ communityId: community.id, ...body, createdBy: req.user!.sub }).returning();
    await db.insert(channelMembers).values({ channelId: channel.id, userId: req.user!.sub, role: "owner" });
    res.status(201).json({ channel });
  });

  router.get("/:id/channels", requireAuth(env), async (req, res) => {
    const community = await db.query.communities.findFirst({ where: eq(communities.id, req.params.id) });
    if (!community) throw new NotFoundError("Community not found");
    res.json({ channels: await db.query.channels.findMany({ where: eq(channels.communityId, req.params.id) }) });
  });

  router.post("/channels/:channelId/join", requireAuth(env), async (req, res) => {
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, req.params.channelId) });
    if (!channel) throw new NotFoundError("Channel not found");

    const banned = await db.query.channelBans.findFirst({ where: and(eq(channelBans.channelId, channel.id), eq(channelBans.userId, req.user!.sub)) });
    if (banned) throw new ForbiddenError("You are banned from this channel");

    try {
      const [member] = await db.insert(channelMembers).values({ channelId: channel.id, userId: req.user!.sub }).returning();
      res.status(201).json({ member });
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
        throw new AppError("ALREADY_MEMBER", "Already a member of this channel", 409);
      }
      throw err;
    }
  });

  router.post("/channels/:channelId/leave", requireAuth(env), async (req, res) => {
    await db.delete(channelMembers).where(and(eq(channelMembers.channelId, req.params.channelId), eq(channelMembers.userId, req.user!.sub)));
    res.json({ message: "Left channel." });
  });

  router.get("/channels/:channelId/members", requireAuth(env), async (req, res) => {
    const membership = await getChannelMembership(db, req.params.channelId, req.user!.sub);
    const isPrivileged = PRIVILEGED_ROLES.includes(req.user!.role as (typeof PRIVILEGED_ROLES)[number]);
    if (!membership && !isPrivileged) throw new ForbiddenError("Join the channel to view its members");
    res.json({ members: await db.query.channelMembers.findMany({ where: eq(channelMembers.channelId, req.params.channelId) }) });
  });

  router.post("/channels/:channelId/members/:userId/mute", requireAuth(env), async (req, res) => {
    if (!(await isChannelModerator(db, req.params.channelId, req.user!.sub, req.user!.role))) throw new ForbiddenError();
    const { minutes } = z.object({ minutes: z.number().int().min(1).max(60 * 24 * 30) }).parse(req.body);
    const mutedUntil = new Date(Date.now() + minutes * 60 * 1000);

    const [updated] = await db
      .update(channelMembers)
      .set({ mutedUntil })
      .where(and(eq(channelMembers.channelId, req.params.channelId), eq(channelMembers.userId, req.params.userId)))
      .returning();
    if (!updated) throw new NotFoundError("That user is not a member of this channel");

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "channel.mute_member", entityType: "channel_member", entityId: updated.id, metadata: { targetUserId: req.params.userId, mutedUntil }, ipAddress: req.ip });
    res.json({ member: updated });
  });

  router.post("/channels/:channelId/members/:userId/ban", requireAuth(env), async (req, res) => {
    if (!(await isChannelModerator(db, req.params.channelId, req.user!.sub, req.user!.role))) throw new ForbiddenError();
    const { reason } = z.object({ reason: z.string().min(3).max(1000) }).parse(req.body);

    await db.delete(channelMembers).where(and(eq(channelMembers.channelId, req.params.channelId), eq(channelMembers.userId, req.params.userId)));
    const [ban] = await db.insert(channelBans).values({ channelId: req.params.channelId, userId: req.params.userId, bannedBy: req.user!.sub, reason }).onConflictDoNothing().returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "channel.ban_member", entityType: "channel_ban", entityId: ban?.id ?? null, metadata: { targetUserId: req.params.userId, reason }, ipAddress: req.ip });
    res.json({ message: "User banned and removed from channel." });
  });

  return router;
}
