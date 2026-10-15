import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { memberships, organizations, refreshTokens, userRecoveryCodes, users } from "../../db/schema.js";
import { decryptValue, encryptValue } from "../../lib/crypto.js";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp, base32Encode } from "../../lib/totp.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, ConflictError, UnauthorizedError } from "../../lib/errors.js";
import { authRateLimiter, requireAuth } from "./middleware.js";

export const totpAad = (userId: string) => `totp:${userId}`;
export const totpPendingAad = (userId: string) => `totp-pending:${userId}`;

const CHALLENGE_TTL_SEC = 5 * 60;
const CHALLENGE_AUDIENCE = "inveon-2fa-challenge";

type User = typeof users.$inferSelect;

/**
 * The login challenge is signed with a key derived from the JWT secret, so
 * it can never pass as an access token (and an access token never passes
 * as a challenge).
 */
const challengeKey = (env: Env) => createHmac("sha256", env.INVEON_JWT_SECRET).update("inveon-2fa-challenge").digest();

export function signChallenge(userId: string, env: Env) {
  return jwt.sign({ sub: userId, typ: "2fa" }, challengeKey(env), { expiresIn: CHALLENGE_TTL_SEC, audience: CHALLENGE_AUDIENCE });
}

export function verifyChallenge(token: string, env: Env): string {
  try {
    const payload = jwt.verify(token, challengeKey(env), { audience: CHALLENGE_AUDIENCE }) as { sub?: unknown; typ?: unknown };
    if (payload.typ !== "2fa" || typeof payload.sub !== "string") throw new Error("bad challenge");
    return payload.sub;
  } catch {
    throw new AppError("INVALID_CHALLENGE", "The sign-in step expired. Enter your email and password again.", 401);
  }
}

/** Whether the user must have two-factor on: an owner anywhere, or an admin where the org asks for it. */
export async function twoFactorRequired(db: Database, userId: string) {
  const rows = await db
    .select({ role: memberships.role, requireAdmins: organizations.require2faForAdmins })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId));
  return rows.some((r) => r.role === "owner" || (r.role === "admin" && r.requireAdmins));
}

export async function twoFactorSummary(db: Database, user: User) {
  const [{ left }] = await db
    .select({ left: sql<number>`count(*)::int` })
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, user.id), isNull(userRecoveryCodes.usedAt)));
  return { enabled: !!user.totpEnabledAt, enabledAt: user.totpEnabledAt, recoveryCodesLeft: user.totpEnabledAt ? left : 0, required: await twoFactorRequired(db, user.id) };
}

async function replaceRecoveryCodes(db: Database, userId: string) {
  const codes = generateRecoveryCodes(10);
  await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  await db.insert(userRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashRecoveryCode(userId, c) })));
  return codes;
}

/**
 * Accepts a TOTP code once: the matched step must be newer than the last
 * accepted one, set in one conditional UPDATE so two requests racing with
 * the same code can't both pass.
 */
async function consumeTotp(db: Database, user: User, code: string): Promise<boolean> {
  if (!user.totpSecretEnc) return false;
  const secret = Buffer.from(decryptValue(user.totpSecretEnc, totpAad(user.id)), "base64");
  const step = verifyTotp(secret, code);
  secret.fill(0);
  if (step === null) return false;
  const [hit] = await db
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return !!hit;
}

async function consumeRecoveryCode(db: Database, userId: string, code: string): Promise<boolean> {
  const [hit] = await db
    .update(userRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(userRecoveryCodes.userId, userId), eq(userRecoveryCodes.codeHash, hashRecoveryCode(userId, code)), isNull(userRecoveryCodes.usedAt)))
    .returning({ id: userRecoveryCodes.id });
  return !!hit;
}

export const secondFactorSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code").optional(),
    recoveryCode: z.string().trim().min(10).max(32).optional(),
  })
  .refine((b) => !!b.code !== !!b.recoveryCode, { message: "Give either a code or a recovery code" });

/** Verifies (and uses up) a second factor. Returns the method that worked, or null. */
export async function checkSecondFactor(db: Database, user: User, body: { code?: string; recoveryCode?: string }): Promise<"totp" | "recovery_code" | null> {
  if (!user.totpEnabledAt) return null;
  if (body.code) return (await consumeTotp(db, user, body.code)) ? "totp" : null;
  if (body.recoveryCode) return (await consumeRecoveryCode(db, user.id, body.recoveryCode)) ? "recovery_code" : null;
  return null;
}

/** Turns two-factor off for a user and signs them out everywhere else. */
export async function clearTwoFactor(db: Database, userId: string, keepRefreshHash?: string) {
  await db.update(users).set({ totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastStep: null, updatedAt: new Date() }).where(eq(users.id, userId));
  await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  await revokeSessions(db, userId, keepRefreshHash);
}

export async function revokeSessions(db: Database, userId: string, keepRefreshHash?: string) {
  const where = [eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)];
  if (keepRefreshHash) where.push(sql`${refreshTokens.tokenHash} <> ${keepRefreshHash}`);
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(...where));
}

/** /api/v1/auth/2fa: the signed-in user's own two-factor settings. */
export function twoFactorRouter(db: Database, env: Env, currentRefreshHash: (cookie: unknown) => string | undefined) {
  const router = Router();
  router.use(requireAuth(env));
  const verifyLimit = authRateLimiter(env.INVEON_AUTH_RATE_LIMIT);

  const loadUser = async (id: string) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) throw new UnauthorizedError();
    return user;
  };
  const log = (userId: string, action: string, ip: string | undefined, metadata: Record<string, unknown> = {}) =>
    writeAudit(db, { orgId: null, actorUserId: userId, action, entityType: "user", entityId: userId, metadata, ipAddress: ip });

  router.get("/", async (req, res) => {
    res.json({ twoFactor: await twoFactorSummary(db, await loadUser(req.user!.sub)) });
  });

  // Step 1: a new secret, kept pending until a code from it is confirmed.
  router.post("/setup", async (req, res) => {
    const user = await loadUser(req.user!.sub);
    if (user.totpEnabledAt) throw new ConflictError("Two-factor is already on. Turn it off first to move it to another device.");
    const secret = generateTotpSecret();
    await db.update(users).set({ totpPendingSecretEnc: encryptValue(secret.toString("base64"), totpPendingAad(user.id)), updatedAt: new Date() }).where(eq(users.id, user.id));
    res.json({ secret: base32Encode(secret), otpauthUri: otpauthUri(secret, user.email) });
  });

  // Step 2: confirm with a code; returns the recovery codes, once.
  router.post("/enable", verifyLimit, async (req, res) => {
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).parse(req.body);
    const user = await loadUser(req.user!.sub);
    if (user.totpEnabledAt) throw new ConflictError("Two-factor is already on");
    if (!user.totpPendingSecretEnc) throw new AppError("NO_PENDING_SETUP", "Start the setup again", 400);
    const plain = decryptValue(user.totpPendingSecretEnc, totpPendingAad(user.id));
    const step = verifyTotp(Buffer.from(plain, "base64"), code);
    if (step === null) throw new AppError("INVALID_CODE", "That code doesn't match. Check the time on your phone and try again.", 400);
    const [enabled] = await db
      .update(users)
      .set({ totpSecretEnc: encryptValue(plain, totpAad(user.id)), totpPendingSecretEnc: null, totpEnabledAt: new Date(), totpLastStep: step, updatedAt: new Date() })
      .where(and(eq(users.id, user.id), isNull(users.totpEnabledAt)))
      .returning({ id: users.id });
    if (!enabled) throw new ConflictError("Two-factor is already on");
    const recoveryCodes = await replaceRecoveryCodes(db, user.id);
    // Sessions opened with only a password end; this one stays.
    await revokeSessions(db, user.id, currentRefreshHash(req.cookies));
    await log(user.id, "user.2fa_enable", req.ip);
    res.json({ recoveryCodes, twoFactor: await twoFactorSummary(db, await loadUser(user.id)) });
  });

  router.post("/disable", verifyLimit, async (req, res) => {
    const body = secondFactorSchema.parse(req.body);
    const user = await loadUser(req.user!.sub);
    if (!user.totpEnabledAt) throw new AppError("NOT_ENABLED", "Two-factor is not on", 400);
    const method = await checkSecondFactor(db, user, body);
    if (!method) throw new AppError("INVALID_CODE", "That code is wrong or was already used", 400);
    await clearTwoFactor(db, user.id, currentRefreshHash(req.cookies));
    await log(user.id, "user.2fa_disable", req.ip, { method });
    res.json({ twoFactor: await twoFactorSummary(db, await loadUser(user.id)) });
  });

  router.post("/recovery-codes", verifyLimit, async (req, res) => {
    const body = secondFactorSchema.parse(req.body);
    const user = await loadUser(req.user!.sub);
    if (!user.totpEnabledAt) throw new AppError("NOT_ENABLED", "Two-factor is not on", 400);
    const method = await checkSecondFactor(db, user, body);
    if (!method) throw new AppError("INVALID_CODE", "That code is wrong or was already used", 400);
    const recoveryCodes = await replaceRecoveryCodes(db, user.id);
    await log(user.id, "user.2fa_recovery_codes", req.ip, { method });
    res.json({ recoveryCodes });
  });

  return router;
}
