import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { channelBans, channelMembers, channels, communities, conversationParticipants, privateConversations, readStates } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

/**
 * What the chat screen needs on top of the raw messages API: an inbox with
 * last messages and unread counts, a people directory for new chats and
 * @mentions, group chats with titles and admins, and a default community
 * (#general, #announcements) everyone lands in.
 */

export const DEFAULT_COMMUNITY = "Inveon Community";
const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"];

// A person's display name, same fallback the calendar uses.
const NAME_SQL = sql.raw(`coalesce(nullif(u.full_name, ''), nullif(cp.full_name, ''), initcap(replace(split_part(u.email, '@', 1), '.', ' ')))`);
// Staff, interns and employees chat; a candidate joins once they're in a program (trial, paid or free).
const ELIGIBLE_SQL = sql.raw(
  `(u.role <> 'candidate' OR EXISTS (SELECT 1 FROM program_enrollments pe WHERE pe.user_id = u.id AND pe.status IN ('trial', 'paid', 'waived')))`,
);

export async function isChatEligible(db: Database, userId: string) {
  const { rows } = await db.execute<{ ok: boolean }>(sql`SELECT ${ELIGIBLE_SQL} AS ok FROM users u WHERE u.id = ${userId}`);
  return !!rows[0]?.ok;
}

export async function assertChatEligible(db: Database, userId: string) {
  if (!(await isChatEligible(db, userId))) throw new ForbiddenError("Chat opens once you've joined a program");
}

/** Makes sure the default community exists and the user is in its channels (unless they left #general). */
async function ensureDefaultSpace(db: Database, userId: string) {
  let community = await db.query.communities.findFirst({ where: eq(communities.name, DEFAULT_COMMUNITY) });
  if (!community) {
    [community] = await db.insert(communities).values({ name: DEFAULT_COMMUNITY, description: "Everyone at Inveon: staff, interns and program members.", createdBy: userId }).onConflictDoNothing().returning();
    community ??= await db.query.communities.findFirst({ where: eq(communities.name, DEFAULT_COMMUNITY) });
  }
  if (!community) return;
  const existing = await db.query.channels.findMany({ where: eq(channels.communityId, community.id) });
  const want: { name: string; type: "public" | "announcement" }[] = [
    { name: "general", type: "public" },
    { name: "announcements", type: "announcement" },
  ];
  for (const w of want) {
    let channel = existing.find((c) => c.name === w.name);
    if (!channel) [channel] = await db.insert(channels).values({ communityId: community.id, name: w.name, type: w.type, createdBy: userId }).returning();
    const banned = await db.query.channelBans.findFirst({ where: and(eq(channelBans.channelId, channel.id), eq(channelBans.userId, userId)) });
    if (banned) continue;
    // Someone who opened a channel and then left it stays out.
    const seen = await db.query.readStates.findFirst({ where: and(eq(readStates.userId, userId), eq(readStates.channelId, channel.id)) });
    const member = await db.query.channelMembers.findFirst({ where: and(eq(channelMembers.channelId, channel.id), eq(channelMembers.userId, userId)) });
    if (!member && (!seen || w.type === "announcement")) {
      await db.insert(channelMembers).values({ channelId: channel.id, userId }).onConflictDoNothing();
    }
  }
}

async function groupOr404(db: Database, id: string) {
  const conv = await db.query.privateConversations.findFirst({ where: eq(privateConversations.id, id) });
  if (!conv || !conv.isGroup) throw new NotFoundError("Group not found");
  return conv;
}

async function participantRow(db: Database, conversationId: string, userId: string) {
  return db.query.conversationParticipants.findFirst({ where: and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)) });
}

async function assertEligibleIds(db: Database, ids: string[]) {
  if (ids.length === 0) return;
  const { rows } = await db.execute<{ id: string }>(sql`SELECT u.id FROM users u WHERE u.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND ${ELIGIBLE_SQL}`);
  if (rows.length !== new Set(ids).size) throw new AppError("VALIDATION_ERROR", "Some of those people can't be added to chats", 400);
}

const groupSchema = z.object({ title: z.string().trim().min(2).max(80), memberIds: z.array(z.string().uuid()).min(1).max(100) });

export function chatRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/people", requireAuth(env), async (req, res) => {
    await assertChatEligible(db, req.user!.sub);
    const { rows } = await db.execute<{ id: string; name: string; email: string; role: string }>(sql`
      SELECT u.id, ${NAME_SQL} AS name, u.email, u.role
      FROM users u LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE ${ELIGIBLE_SQL}
      ORDER BY name LIMIT 2000
    `);
    res.json({ people: rows });
  });

  router.get("/inbox", requireAuth(env), async (req, res) => {
    const me = req.user!.sub;
    await assertChatEligible(db, me);
    await ensureDefaultSpace(db, me);

    const channelRows = await db.execute(sql`
      SELECT 'channel' AS kind, ch.id, ch.name AS title, ch.type AS channel_type, co.name AS community, cm.role AS my_role,
        lm.body AS last_body, lm.author_id AS last_author_id, lm.created_at AS last_at, lm.deleted_at AS last_deleted,
        (SELECT count(*)::int FROM messages m WHERE m.channel_id = ch.id AND m.seq_number > coalesce(rs.last_read_seq, 0) AND m.author_id <> ${me} AND m.deleted_at IS NULL) AS unread,
        (SELECT count(*)::int FROM message_mentions mm JOIN messages m ON m.id = mm.message_id WHERE m.channel_id = ch.id AND mm.mentioned_user_id = ${me} AND m.seq_number > coalesce(rs.last_read_seq, 0)) AS mentions,
        (SELECT count(*)::int FROM channel_members x WHERE x.channel_id = ch.id) AS member_count
      FROM channel_members cm
      JOIN channels ch ON ch.id = cm.channel_id
      JOIN communities co ON co.id = ch.community_id
      LEFT JOIN LATERAL (SELECT body, author_id, created_at, deleted_at FROM messages m WHERE m.channel_id = ch.id ORDER BY m.seq_number DESC LIMIT 1) lm ON true
      LEFT JOIN LATERAL (SELECT max(last_read_seq) AS last_read_seq FROM read_states r WHERE r.user_id = ${me} AND r.channel_id = ch.id) rs ON true
      WHERE cm.user_id = ${me}
    `);
    const conversationRows = await db.execute(sql`
      SELECT CASE WHEN pc.is_group THEN 'group' ELSE 'dm' END AS kind, pc.id, pc.title, pc.created_at,
        lm.body AS last_body, lm.author_id AS last_author_id, lm.created_at AS last_at, lm.deleted_at AS last_deleted,
        (SELECT count(*)::int FROM messages m WHERE m.conversation_id = pc.id AND m.seq_number > coalesce(rs.last_read_seq, 0) AND m.author_id <> ${me} AND m.deleted_at IS NULL) AS unread,
        (SELECT count(*)::int FROM message_mentions mm JOIN messages m ON m.id = mm.message_id WHERE m.conversation_id = pc.id AND mm.mentioned_user_id = ${me} AND m.seq_number > coalesce(rs.last_read_seq, 0)) AS mentions,
        (SELECT json_agg(json_build_object('id', u.id, 'name', ${NAME_SQL}, 'email', u.email, 'role', u.role) ORDER BY u.email)
           FROM conversation_participants p JOIN users u ON u.id = p.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
           WHERE p.conversation_id = pc.id) AS members
      FROM conversation_participants mine
      JOIN private_conversations pc ON pc.id = mine.conversation_id
      LEFT JOIN LATERAL (SELECT body, author_id, created_at, deleted_at FROM messages m WHERE m.conversation_id = pc.id ORDER BY m.seq_number DESC LIMIT 1) lm ON true
      LEFT JOIN LATERAL (SELECT max(last_read_seq) AS last_read_seq FROM read_states r WHERE r.user_id = ${me} AND r.conversation_id = pc.id) rs ON true
      WHERE mine.user_id = ${me}
    `);

    type Row = Record<string, unknown> & { last_at: string | null; created_at?: string };
    const threads = [...(channelRows.rows as Row[]), ...(conversationRows.rows as Row[])]
      // A DM nobody has written in yet only shows for the person who started it (it's in their list anyway).
      .map((r) => ({
        kind: r.kind as "channel" | "dm" | "group",
        id: r.id as string,
        title: (r.title as string | null) ?? null,
        channelType: (r.channel_type as string | undefined) ?? null,
        community: (r.community as string | undefined) ?? null,
        memberCount: (r.member_count as number | undefined) ?? (Array.isArray(r.members) ? r.members.length : 0),
        members: (r.members as { id: string; name: string; email: string; role: string }[] | undefined) ?? null,
        unread: r.unread as number,
        mentions: r.mentions as number,
        last: r.last_at ? { body: r.last_deleted ? "Message deleted" : (r.last_body as string), authorId: r.last_author_id as string, at: r.last_at } : null,
        sortAt: (r.last_at ?? r.created_at ?? "1970-01-01") as string,
      }))
      .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
    res.json({ threads });
  });

  /** Channels in every community, to browse and join. */
  router.get("/channels", requireAuth(env), async (req, res) => {
    await assertChatEligible(db, req.user!.sub);
    const { rows } = await db.execute(sql`
      SELECT ch.id, ch.name, ch.type, co.id AS community_id, co.name AS community,
        (SELECT count(*)::int FROM channel_members x WHERE x.channel_id = ch.id) AS member_count,
        EXISTS (SELECT 1 FROM channel_members x WHERE x.channel_id = ch.id AND x.user_id = ${req.user!.sub}) AS joined
      FROM channels ch JOIN communities co ON co.id = ch.community_id
      ORDER BY co.name, ch.name
    `);
    res.json({ channels: rows });
  });

  /** Header info for an open chat: title, members and what I can do there. */
  router.get("/threads/:kind/:id", requireAuth(env), async (req, res) => {
    const me = req.user!.sub;
    await assertChatEligible(db, me);
    const privileged = PRIVILEGED_ROLES.includes(req.user!.role);
    if (req.params.kind === "channel") {
      const channel = await db.query.channels.findFirst({ where: eq(channels.id, req.params.id) });
      if (!channel) throw new NotFoundError("Channel not found");
      const mine = await db.query.channelMembers.findFirst({ where: and(eq(channelMembers.channelId, channel.id), eq(channelMembers.userId, me)) });
      if (!mine && !privileged) throw new ForbiddenError("Join the channel first");
      const { rows } = await db.execute(sql`
        SELECT u.id, ${NAME_SQL} AS name, u.email, u.role, m.role AS channel_role
        FROM channel_members m JOIN users u ON u.id = m.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE m.channel_id = ${channel.id} ORDER BY name LIMIT 500
      `);
      const moderator = privileged || mine?.role === "owner" || mine?.role === "moderator";
      res.json({
        kind: "channel",
        id: channel.id,
        title: channel.name,
        channelType: channel.type,
        members: rows,
        canPost: channel.type !== "announcement" || moderator,
        canManage: moderator,
        mutedUntil: mine?.mutedUntil ?? null,
      });
      return;
    }
    const conv = await db.query.privateConversations.findFirst({ where: eq(privateConversations.id, req.params.id) });
    if (!conv) throw new NotFoundError("Chat not found");
    const mine = await participantRow(db, conv.id, me);
    if (!mine) throw new ForbiddenError();
    const { rows } = await db.execute(sql`
      SELECT u.id, ${NAME_SQL} AS name, u.email, u.role, p.is_admin
      FROM conversation_participants p JOIN users u ON u.id = p.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE p.conversation_id = ${conv.id} ORDER BY p.is_admin DESC, name
    `);
    res.json({ kind: conv.isGroup ? "group" : "dm", id: conv.id, title: conv.title, members: rows, canPost: true, canManage: conv.isGroup && mine.isAdmin });
  });

  /** Direct message with one person: reuses the existing DM if there is one. */
  router.post("/dm", requireAuth(env), async (req, res) => {
    const me = req.user!.sub;
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
    if (userId === me) throw new AppError("VALIDATION_ERROR", "Pick someone else", 400);
    await assertChatEligible(db, me);
    await assertEligibleIds(db, [userId]);
    const { rows } = await db.execute<{ id: string }>(sql`
      SELECT pc.id FROM private_conversations pc
      WHERE pc.is_group = false
        AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = pc.id AND p.user_id = ${me})
        AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = pc.id AND p.user_id = ${userId})
        AND (SELECT count(*) FROM conversation_participants p WHERE p.conversation_id = pc.id) = 2
      LIMIT 1
    `);
    if (rows[0]) {
      res.json({ conversation: { id: rows[0].id }, existing: true });
      return;
    }
    const conversation = await db.transaction(async (tx) => {
      const [created] = await tx.insert(privateConversations).values({ isGroup: false, createdBy: me }).returning();
      await tx.insert(conversationParticipants).values([{ conversationId: created.id, userId: me }, { conversationId: created.id, userId }]);
      return created;
    });
    res.status(201).json({ conversation, existing: false });
  });

  router.post("/groups", requireAuth(env), async (req, res) => {
    const me = req.user!.sub;
    const body = groupSchema.parse(req.body);
    await assertChatEligible(db, me);
    const memberIds = [...new Set(body.memberIds.filter((id) => id !== me))];
    await assertEligibleIds(db, memberIds);
    const group = await db.transaction(async (tx) => {
      const [created] = await tx.insert(privateConversations).values({ isGroup: true, title: body.title, createdBy: me }).returning();
      await tx.insert(conversationParticipants).values([{ conversationId: created.id, userId: me, isAdmin: true }, ...memberIds.map((userId) => ({ conversationId: created.id, userId }))]);
      return created;
    });
    await writeAuditLog(db, { actorUserId: me, action: "chat.group_create", entityType: "private_conversation", entityId: group.id, metadata: { members: memberIds.length + 1 }, ipAddress: req.ip });
    res.status(201).json({ group });
  });

  router.patch("/groups/:id", requireAuth(env), async (req, res) => {
    const { title } = z.object({ title: z.string().trim().min(2).max(80) }).parse(req.body);
    const group = await groupOr404(db, req.params.id);
    const mine = await participantRow(db, group.id, req.user!.sub);
    if (!mine?.isAdmin) throw new ForbiddenError("Only group admins can rename the group");
    const [updated] = await db.update(privateConversations).set({ title }).where(eq(privateConversations.id, group.id)).returning();
    res.json({ group: updated });
  });

  router.post("/groups/:id/members", requireAuth(env), async (req, res) => {
    const { userIds } = z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }).parse(req.body);
    const group = await groupOr404(db, req.params.id);
    const mine = await participantRow(db, group.id, req.user!.sub);
    if (!mine?.isAdmin) throw new ForbiddenError("Only group admins can add people");
    await assertEligibleIds(db, userIds);
    await db.insert(conversationParticipants).values(userIds.map((userId) => ({ conversationId: group.id, userId }))).onConflictDoNothing();
    res.json({ ok: true });
  });

  router.post("/groups/:id/admins/:userId", requireAuth(env), async (req, res) => {
    const group = await groupOr404(db, req.params.id);
    const mine = await participantRow(db, group.id, req.user!.sub);
    if (!mine?.isAdmin) throw new ForbiddenError("Only group admins can do that");
    const [updated] = await db
      .update(conversationParticipants)
      .set({ isAdmin: true })
      .where(and(eq(conversationParticipants.conversationId, group.id), eq(conversationParticipants.userId, req.params.userId)))
      .returning();
    if (!updated) throw new NotFoundError("Not in this group");
    res.json({ ok: true });
  });

  /** Remove someone (admins) or leave (anyone). The last admin leaving hands admin to the longest-standing member. */
  router.delete("/groups/:id/members/:userId", requireAuth(env), async (req, res) => {
    const me = req.user!.sub;
    const group = await groupOr404(db, req.params.id);
    const mine = await participantRow(db, group.id, me);
    if (!mine) throw new ForbiddenError();
    const leaving = req.params.userId === me;
    if (!leaving && !mine.isAdmin) throw new ForbiddenError("Only group admins can remove people");
    await db.delete(conversationParticipants).where(and(eq(conversationParticipants.conversationId, group.id), eq(conversationParticipants.userId, req.params.userId)));

    const rest = await db.query.conversationParticipants.findMany({ where: eq(conversationParticipants.conversationId, group.id), orderBy: (p, { asc }) => [asc(p.joinedAt)] });
    if (rest.length > 0 && !rest.some((p) => p.isAdmin)) {
      await db.update(conversationParticipants).set({ isAdmin: true }).where(and(eq(conversationParticipants.conversationId, group.id), eq(conversationParticipants.userId, rest[0].userId)));
    }
    res.json({ ok: true });
  });

  return router;
}

/** Who may see a message in this target, for filtering @mentions to people who can open it. */
export async function usersWithAccess(db: Database, target: { channelId?: string; conversationId?: string }, userIds: string[]) {
  if (userIds.length === 0) return [];
  if (target.conversationId) {
    const rows = await db.query.conversationParticipants.findMany({ where: and(eq(conversationParticipants.conversationId, target.conversationId), inArray(conversationParticipants.userId, userIds)) });
    return rows.map((r) => r.userId);
  }
  const rows = await db.query.channelMembers.findMany({ where: and(eq(channelMembers.channelId, target.channelId!), inArray(channelMembers.userId, userIds)) });
  return rows.map((r) => r.userId);
}
