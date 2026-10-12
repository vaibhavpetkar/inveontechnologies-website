import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { auditLogs, invites, memberships, organizations, users } from "../../db/schema.js";
import { ROLE_RANK, requireRole, type MemberRole } from "../auth/middleware.js";
import { createOrganization } from "../auth/routes.js";
import { randomToken, sha256Hex } from "../../lib/crypto.js";
import { audit, writeAudit } from "../../lib/audit.js";
import { AppError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { sendMail } from "../../lib/mailer.js";
import { clearTwoFactor } from "../auth/two-factor.js";

const roleSchema = z.enum(["owner", "admin", "developer", "viewer"]);
const INVITE_TTL_DAYS = 7;

/** POST /api/v1/orgs: any signed-in user can create another organization. */
export function orgCreateRouter(db: Database) {
  const router = Router();
  router.post("/", async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const org = await createOrganization(db, name, req.user!.sub);
    await writeAudit(db, { orgId: org.id, actorUserId: req.user!.sub, action: "org.create", entityType: "organization", entityId: org.id, metadata: { name }, ipAddress: req.ip });
    res.status(201).json({ organization: { ...org, role: "owner" } });
  });
  return router;
}

/** Mounted at /api/v1/orgs/:orgId after requireMember. */
export function orgRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, req.member!.orgId) });
    res.json({ organization: { ...org, role: req.member!.role } });
  });

  router.patch("/", requireRole("owner"), async (req, res) => {
    const body = z
      .object({ name: z.string().trim().min(2).max(80).optional(), require2faForAdmins: z.boolean().optional() })
      .refine((b) => b.name !== undefined || b.require2faForAdmins !== undefined, { message: "Nothing to change" })
      .parse(req.body);
    const [org] = await db.update(organizations).set(body).where(eq(organizations.id, req.member!.orgId)).returning();
    await audit(db, req, "org.update", "organization", org.id, body);
    res.json({ organization: { ...org, role: req.member!.role } });
  });

  // ---------------------------------------------------------------- members

  router.get("/members", async (req, res) => {
    const rows = await db
      .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, joinedAt: memberships.createdAt, twoFactorEnabled: sql<boolean>`${users.totpEnabledAt} IS NOT NULL` })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, req.member!.orgId))
      .orderBy(asc(users.email));
    res.json({ members: rows });
  });

  async function ownerCount(orgId: string) {
    const [{ n }] = await db.select({ n: count() }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
    return n;
  }

  router.patch("/members/:userId", requireRole("owner"), async (req, res) => {
    const { role } = z.object({ role: roleSchema }).parse(req.body);
    const orgId = req.member!.orgId;
    const target = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, req.params.userId)) });
    if (!target) throw new NotFoundError("Member not found");
    if (target.role === "owner" && role !== "owner" && (await ownerCount(orgId)) <= 1) throw new AppError("LAST_OWNER", "An organization needs at least one owner", 400);
    await db.update(memberships).set({ role }).where(eq(memberships.id, target.id));
    await audit(db, req, "member.role_change", "user", target.userId, { from: target.role, to: role });
    res.json({ ok: true });
  });

  /**
   * An owner resets a member's two-factor (lost phone and recovery codes).
   * Only for members whose every other organization is one where this
   * owner is an owner too, so it can't weaken accounts elsewhere.
   */
  router.post("/members/:userId/2fa/reset", requireRole("owner"), async (req, res) => {
    const orgId = req.member!.orgId;
    if (req.params.userId === req.user!.sub) throw new AppError("SELF_RESET", "Turn your own two-factor off from your account page", 400);
    const target = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, req.params.userId)) });
    if (!target) throw new NotFoundError("Member not found");
    const elsewhere = await db.select({ orgId: memberships.orgId }).from(memberships).where(and(eq(memberships.userId, target.userId), ne(memberships.orgId, orgId)));
    for (const other of elsewhere) {
      const mine = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, other.orgId), eq(memberships.userId, req.user!.sub)) });
      if (mine?.role !== "owner") throw new ForbiddenError("This member also belongs to another organization; an owner of each of their organizations has to do this");
    }
    const user = await db.query.users.findFirst({ where: eq(users.id, target.userId) });
    if (!user?.totpEnabledAt) throw new AppError("NOT_ENABLED", "This member doesn't have two-factor on", 400);
    await clearTwoFactor(db, target.userId);
    await audit(db, req, "member.2fa_reset", "user", target.userId, { email: user.email });
    res.json({ ok: true });
  });

  router.delete("/members/:userId", async (req, res) => {
    const orgId = req.member!.orgId;
    const self = req.params.userId === req.user!.sub;
    if (!self && req.member!.role !== "owner") throw new ForbiddenError("Only owners can remove members");
    const target = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, req.params.userId)) });
    if (!target) throw new NotFoundError("Member not found");
    if (target.role === "owner" && (await ownerCount(orgId)) <= 1) throw new AppError("LAST_OWNER", "An organization needs at least one owner", 400);
    await db.delete(memberships).where(eq(memberships.id, target.id));
    await audit(db, req, self ? "member.leave" : "member.remove", "user", target.userId, { role: target.role });
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- invites

  router.get("/invites", requireRole("admin"), async (req, res) => {
    const rows = await db
      .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
      .from(invites)
      .where(and(eq(invites.orgId, req.member!.orgId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
      .orderBy(desc(invites.createdAt));
    res.json({ invites: rows.map((r) => ({ ...r, expired: r.expiresAt < new Date() })) });
  });

  router.post("/invites", requireRole("admin"), async (req, res) => {
    const body = z.object({ email: z.string().trim().email().transform((e) => e.toLowerCase()), role: roleSchema }).parse(req.body);
    // Nobody can grant a role above their own.
    if (ROLE_RANK[body.role as MemberRole] > ROLE_RANK[req.member!.role]) throw new ForbiddenError("You can't invite someone with a higher role than yours");
    const token = randomToken(32);
    const [invite] = await db
      .insert(invites)
      .values({ orgId: req.member!.orgId, email: body.email, role: body.role, tokenHash: sha256Hex(token), invitedBy: req.user!.sub, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000) })
      .returning();
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, req.member!.orgId) });
    const inviteUrl = `${env.INVEON_PUBLIC_URL.replace(/\/$/, "")}/invite/${token}`;
    void sendMail([body.email], `You're invited to ${org?.name ?? "an organization"} on Inveon Cloud`, `You've been invited to join ${org?.name} on Inveon Cloud as ${body.role}.\n\nAccept the invite: ${inviteUrl}\n\nThe link expires in ${INVITE_TTL_DAYS} days.`);
    await audit(db, req, "invite.create", "invite", invite.id, { email: body.email, role: body.role });
    // The link is returned once so it can be shared directly too.
    res.status(201).json({ invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, inviteUrl });
  });

  router.delete("/invites/:id", requireRole("admin"), async (req, res) => {
    const [revoked] = await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.id, req.params.id), eq(invites.orgId, req.member!.orgId), isNull(invites.acceptedAt)))
      .returning();
    if (!revoked) throw new NotFoundError("Invite not found");
    await audit(db, req, "invite.revoke", "invite", revoked.id, { email: revoked.email });
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- audit log

  router.get("/audit", requireRole("admin"), async (req, res) => {
    const q = z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const where: SQL[] = [eq(auditLogs.orgId, req.member!.orgId)];
    if (q.before) where.push(lt(auditLogs.createdAt, new Date(q.before)));
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        actorServerId: auditLogs.actorServerId,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(and(...where))
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.limit);
    res.json({ entries: rows });
  });

  return router;
}
