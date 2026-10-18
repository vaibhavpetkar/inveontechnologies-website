import { Router, type Response } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { invites, memberships, organizations, refreshTokens, users } from "../../db/schema.js";
import { authRateLimiter, requireAuth, signAccessToken } from "./middleware.js";
import { randomToken, sha256Hex } from "../../lib/crypto.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, ConflictError, UnauthorizedError } from "../../lib/errors.js";
import { isPlatformAdmin } from "../keys/routes.js";
import { checkSecondFactor, passkeyCount, secondFactorSchema, signChallenge, twoFactorRouter, twoFactorSummary, verifyChallenge } from "./two-factor.js";
import { passkeyRouter } from "./passkeys.js";

const REFRESH_COOKIE = "inveon_refresh_token";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const emailSchema = z.string().trim().email().max(254).transform((e) => e.toLowerCase());
const passwordSchema = z.string().min(10, "Password must be at least 10 characters").max(200);

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  orgName: z.string().trim().min(2).max(80).optional(),
  inviteToken: z.string().min(10).max(200).optional(),
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

export function slugify(input: string, max = 40) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "x"
  );
}

export async function createOrganization(db: Database, name: string, ownerId: string) {
  const slug = `${slugify(name, 30)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 40);
  const [org] = await db.insert(organizations).values({ name, slug }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: ownerId, role: "owner" });
  return org;
}

export async function findUsableInvite(db: Database, token: string) {
  const invite = await db.query.invites.findFirst({ where: and(eq(invites.tokenHash, sha256Hex(token)), isNull(invites.acceptedAt), isNull(invites.revokedAt)) });
  if (!invite || invite.expiresAt < new Date()) throw new AppError("INVALID_INVITE", "This invite is invalid or has expired", 400);
  return invite;
}

export async function acceptInvite(db: Database, inviteId: string, orgId: string, role: "owner" | "admin" | "developer" | "viewer", userId: string, ip?: string) {
  // Single use: only the first accept flips accepted_at.
  const [claimed] = await db
    .update(invites)
    .set({ acceptedAt: new Date(), acceptedBy: userId })
    .where(and(eq(invites.id, inviteId), isNull(invites.acceptedAt)))
    .returning();
  if (!claimed) throw new AppError("INVALID_INVITE", "This invite was already used", 400);
  await db.insert(memberships).values({ orgId, userId, role }).onConflictDoNothing();
  await writeAudit(db, { orgId, actorUserId: userId, action: "invite.accept", entityType: "invite", entityId: inviteId, metadata: { role }, ipAddress: ip });
}

function cookieOptions(env: Env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/v1/auth",
    maxAge: env.INVEON_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

async function issueSession(db: Database, env: Env, res: Response, userId: string, meta: { ua?: string; ip?: string }) {
  const plaintext = randomToken(48);
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: sha256Hex(plaintext),
    expiresAt: new Date(Date.now() + env.INVEON_REFRESH_TOKEN_TTL_DAYS * 86400000),
    userAgent: meta.ua ?? null,
    ipAddress: meta.ip ?? null,
  });
  res.cookie(REFRESH_COOKIE, plaintext, cookieOptions(env));
  return signAccessToken(userId, env);
}

async function profile(db: Database, env: Env, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new UnauthorizedError();
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.name);
  return { id: user.id, email: user.email, name: user.name, organizations: orgs, twoFactor: await twoFactorSummary(db, user), platformAdmin: await isPlatformAdmin(db, env, user) };
}

const refreshHashOf = (cookies: unknown) => {
  const value = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === "string" ? sha256Hex(value) : undefined;
};

export function authRouter(db: Database, env: Env) {
  const router = Router();
  const signupLimit = authRateLimiter(env.INVEON_AUTH_RATE_LIMIT);
  const loginLimit = authRateLimiter(env.INVEON_AUTH_RATE_LIMIT);
  const secondFactorLimit = authRateLimiter(env.INVEON_AUTH_RATE_LIMIT);

  /** A wrong password or second factor counts towards the same lockout. */
  async function recordFailure(user: typeof users.$inferSelect, action: string, ip: string | undefined) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(users)
      .set({ failedLoginAttempts: locked ? 0 : attempts, lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null })
      .where(eq(users.id, user.id));
    await writeAudit(db, { orgId: null, actorUserId: user.id, action, entityType: "user", entityId: user.id, ipAddress: ip });
  }

  router.post("/signup", signupLimit, async (req, res) => {
    const body = signupSchema.parse(req.body);
    const invite = body.inviteToken ? await findUsableInvite(db, body.inviteToken) : null;
    // With sign-up closed, only the very first account (the installer's) can be created without an invite.
    if (!invite && !env.INVEON_OPEN_SIGNUP) {
      const anyone = await db.query.users.findFirst({ columns: { id: true } });
      if (anyone) throw new AppError("SIGNUP_CLOSED", "Sign-up needs an invite", 403);
    }
    const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${body.email}` });
    if (existing) throw new ConflictError("An account with this email already exists. Sign in instead.");

    const [user] = await db.insert(users).values({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) }).returning();
    await writeAudit(db, { orgId: null, actorUserId: user.id, action: "user.signup", entityType: "user", entityId: user.id, ipAddress: req.ip });
    if (invite) {
      await acceptInvite(db, invite.id, invite.orgId, invite.role, user.id, req.ip);
    } else {
      const org = await createOrganization(db, body.orgName ?? `${body.name}'s team`, user.id);
      await writeAudit(db, { orgId: org.id, actorUserId: user.id, action: "org.create", entityType: "organization", entityId: org.id, metadata: { name: org.name }, ipAddress: req.ip });
    }
    const accessToken = await issueSession(db, env, res, user.id, { ua: req.headers["user-agent"], ip: req.ip });
    res.status(201).json({ accessToken, user: await profile(db, env, user.id) });
  });

  router.post("/login", loginLimit, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const invalid = () => new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${body.email}` });
    if (!user) {
      // Spend similar time as a real verify so timing doesn't reveal unknown emails.
      await argon2.hash(body.password, { type: argon2.argon2id }).catch(() => undefined);
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", "Account temporarily locked after failed sign-ins", 423);
    if (!(await argon2.verify(user.passwordHash, body.password).catch(() => false))) {
      await recordFailure(user, "user.login_failed", req.ip);
      throw invalid();
    }
    const passkeys = await passkeyCount(db, user.id);
    if (user.totpEnabledAt || passkeys > 0) {
      // Step two: no session yet, only a short-lived challenge for a code or a passkey.
      const methods = [...(user.totpEnabledAt ? ["totp"] : []), ...(passkeys ? ["passkey"] : [])];
      res.json({ twoFactorRequired: true, challengeToken: signChallenge(user.id, env), methods });
      return;
    }
    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const accessToken = await issueSession(db, env, res, user.id, { ua: req.headers["user-agent"], ip: req.ip });
    await writeAudit(db, { orgId: null, actorUserId: user.id, action: "user.login", entityType: "user", entityId: user.id, ipAddress: req.ip });
    res.json({ accessToken, user: await profile(db, env, user.id) });
  });

  router.post("/login/2fa", secondFactorLimit, async (req, res) => {
    const { challengeToken, ...factor } = z.object({ challengeToken: z.string().min(10).max(2000) }).and(secondFactorSchema).parse(req.body);
    const userId = verifyChallenge(challengeToken, env);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new AppError("INVALID_CHALLENGE", "The sign-in step expired. Enter your email and password again.", 401);
    if (!user.totpEnabledAt) throw new AppError("USE_PASSKEY", "This account has no authenticator app; use your passkey", 400);
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", "Account temporarily locked after failed sign-ins", 423);
    const method = await checkSecondFactor(db, user, factor);
    if (!method) {
      await recordFailure(user, "user.2fa_failed", req.ip);
      throw new AppError("INVALID_CODE", "That code is wrong or was already used", 401);
    }
    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const accessToken = await issueSession(db, env, res, user.id, { ua: req.headers["user-agent"], ip: req.ip });
    await writeAudit(db, { orgId: null, actorUserId: user.id, action: "user.login", entityType: "user", entityId: user.id, metadata: { secondFactor: method }, ipAddress: req.ip });
    res.json({ accessToken, user: await profile(db, env, user.id) });
  });

  router.use("/2fa", twoFactorRouter(db, env, refreshHashOf));
  router.use("/passkeys", passkeyRouter(db, env, { issueSession, profile, recordFailure, currentRefreshHash: refreshHashOf }));

  router.post("/refresh", async (req, res) => {
    const plaintext = req.cookies?.[REFRESH_COOKIE];
    if (!plaintext || typeof plaintext !== "string") throw new UnauthorizedError("No refresh token");
    const record = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, sha256Hex(plaintext)) });
    if (!record) throw new UnauthorizedError("Invalid refresh token");
    if (record.revokedAt) {
      // A rotated token used again: possible theft. Revoke every session.
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, record.userId), isNull(refreshTokens.revokedAt)));
      await writeAudit(db, { orgId: null, actorUserId: record.userId, action: "auth.refresh_reuse_detected", entityType: "user", entityId: record.userId, ipAddress: req.ip });
      res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
      throw new UnauthorizedError("Session revoked; please sign in again");
    }
    if (record.expiresAt < new Date()) throw new UnauthorizedError("Refresh token expired");
    const next = randomToken(48);
    const [newRecord] = await db
      .insert(refreshTokens)
      .values({
        userId: record.userId,
        tokenHash: sha256Hex(next),
        expiresAt: new Date(Date.now() + env.INVEON_REFRESH_TOKEN_TTL_DAYS * 86400000),
        userAgent: req.headers["user-agent"] ?? null,
        ipAddress: req.ip ?? null,
      })
      .returning();
    await db.update(refreshTokens).set({ revokedAt: new Date(), replacedByTokenId: newRecord.id }).where(eq(refreshTokens.id, record.id));
    res.cookie(REFRESH_COOKIE, next, cookieOptions(env));
    res.json({ accessToken: signAccessToken(record.userId, env) });
  });

  router.post("/logout", async (req, res) => {
    const plaintext = req.cookies?.[REFRESH_COOKIE];
    if (typeof plaintext === "string") {
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256Hex(plaintext)));
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    res.json({ ok: true });
  });

  router.get("/me", requireAuth(env), async (req, res) => {
    res.json({ user: await profile(db, env, req.user!.sub) });
  });

  // Accept an invite as an already signed-in user.
  router.post("/invites/accept", requireAuth(env), async (req, res) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    const invite = await findUsableInvite(db, token);
    await acceptInvite(db, invite.id, invite.orgId, invite.role, req.user!.sub, req.ip);
    res.json({ orgId: invite.orgId, user: await profile(db, env, req.user!.sub) });
  });

  // Invite preview for the accept page (no secrets: org name, role, email).
  router.get("/invites/:token", async (req, res) => {
    const invite = await findUsableInvite(db, req.params.token);
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, invite.orgId) });
    res.json({ invite: { email: invite.email, role: invite.role, orgName: org?.name ?? "" } });
  });

  return router;
}
