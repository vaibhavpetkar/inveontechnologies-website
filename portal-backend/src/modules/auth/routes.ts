import { Router } from "express";
import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { users, refreshTokens, verificationTokens } from "../shared/db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateOneTimeToken,
} from "./tokens.js";
import { sendVerificationEmailStub, sendPasswordResetEmailStub } from "./email-stub.js";
import { requireAuth, authRateLimiter } from "./middleware.js";
import { writeAuditLog } from "../shared/audit.js";
import { AppError, UnauthorizedError } from "../shared/errors.js";
import type { Env } from "../shared/env.js";

const REFRESH_COOKIE = "portal_refresh_token";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Emails are compared case-insensitively: "Asha@x.com" and "asha@x.com" are
// the same inbox, so they must be the same account (not two), and logging
// in must not depend on how the address was capitalised at sign-up.
const emailSchema = z.string().trim().email().transform((e) => e.toLowerCase());
const emailEquals = (email: string) => sql`lower(${users.email}) = ${email}`;

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(10, "Password must be at least 10 characters"),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({ token: z.string().min(1) });
const forgotPasswordSchema = z.object({ email: emailSchema });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(10, "Password must be at least 10 characters"),
});

function refreshCookieOptions(env: Env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/v1/auth",
    maxAge: env.PORTAL_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function authRouter(db: Database, env: Env) {
  const router = Router();

  router.post("/register", authRateLimiter, async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await db.query.users.findFirst({ where: emailEquals(body.email) });
    if (existing) {
      // Same response shape as success to avoid confirming which emails are
      // registered (user-enumeration prevention).
      res.status(201).json({ message: "If registration succeeded, check your email to verify your account." });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    const [user] = await db.insert(users).values({ email: body.email, passwordHash }).returning();

    const { plaintext, hash } = generateOneTimeToken();
    await db.insert(verificationTokens).values({
      userId: user.id,
      tokenHash: hash,
      purpose: "email_verify",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    sendVerificationEmailStub(user.email, `${env.PORTAL_APP_URL}/verify-email?token=${plaintext}`);
    await writeAuditLog(db, { actorUserId: user.id, action: "user.register", entityType: "user", entityId: user.id, ipAddress: req.ip });

    res.status(201).json({ message: "If registration succeeded, check your email to verify your account." });
  });

  router.post("/verify-email", authRateLimiter, async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    const hash = hashRefreshToken(token);

    const record = await db.query.verificationTokens.findFirst({
      where: and(eq(verificationTokens.tokenHash, hash), eq(verificationTokens.purpose, "email_verify"), isNull(verificationTokens.usedAt)),
    });
    if (!record || record.expiresAt < new Date()) {
      throw new AppError("INVALID_TOKEN", "Verification link is invalid or expired", 400);
    }

    await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, record.userId));
    await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, record.id));
    await writeAuditLog(db, { actorUserId: record.userId, action: "user.verify_email", entityType: "user", entityId: record.userId });

    res.json({ message: "Email verified." });
  });

  router.post("/login", authRateLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const genericError = () => new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);

    const user = await db.query.users.findFirst({ where: emailEquals(body.email) });
    if (!user) throw genericError();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError("ACCOUNT_LOCKED", "Account temporarily locked due to failed login attempts", 423);
    }

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      await db
        .update(users)
        .set({
          failedLoginAttempts: locked ? 0 : attempts,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      await writeAuditLog(db, { actorUserId: user.id, action: "user.login_failed", entityType: "user", entityId: user.id, ipAddress: req.ip });
      throw genericError();
    }

    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const accessToken = signAccessToken({ sub: user.id, role: user.role }, env);
    const { plaintext, hash } = generateRefreshToken();
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + env.PORTAL_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    });

    res.cookie(REFRESH_COOKIE, plaintext, refreshCookieOptions(env));
    await writeAuditLog(db, { actorUserId: user.id, action: "user.login", entityType: "user", entityId: user.id, ipAddress: req.ip });

    res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role, emailVerified: user.emailVerified } });
  });

  router.post("/refresh", async (req, res) => {
    const plaintext = req.cookies?.[REFRESH_COOKIE];
    if (!plaintext) throw new UnauthorizedError("No refresh token provided");
    const hash = hashRefreshToken(plaintext);

    const record = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, hash) });

    if (!record) throw new UnauthorizedError("Invalid refresh token");

    if (record.revokedAt) {
      // Reuse of an already-rotated/revoked token: possible theft.
      // Defensive response: revoke every active session for this user.
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, record.userId), isNull(refreshTokens.revokedAt)));
      await writeAuditLog(db, {
        actorUserId: record.userId,
        action: "auth.refresh_token_reuse_detected",
        entityType: "user",
        entityId: record.userId,
        ipAddress: req.ip,
      });
      res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
      throw new UnauthorizedError("Session revoked; please log in again");
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, record.userId) });
    if (!user) throw new UnauthorizedError();

    // Rotate: issue a new token, mark this one revoked + linked to its replacement.
    const next = generateRefreshToken();
    const [newRecord] = await db
      .insert(refreshTokens)
      .values({
        userId: user.id,
        tokenHash: next.hash,
        expiresAt: new Date(Date.now() + env.PORTAL_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        userAgent: req.headers["user-agent"] ?? null,
        ipAddress: req.ip ?? null,
      })
      .returning();
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenId: newRecord.id })
      .where(eq(refreshTokens.id, record.id));

    const accessToken = signAccessToken({ sub: user.id, role: user.role }, env);
    res.cookie(REFRESH_COOKIE, next.plaintext, refreshCookieOptions(env));
    res.json({ accessToken });
  });

  router.post("/logout", async (req, res) => {
    const plaintext = req.cookies?.[REFRESH_COOKIE];
    if (plaintext) {
      const hash = hashRefreshToken(plaintext);
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hash));
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    res.json({ message: "Logged out." });
  });

  router.post("/forgot-password", authRateLimiter, async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await db.query.users.findFirst({ where: emailEquals(email) });

    // Always respond the same way regardless of whether the account exists.
    if (user) {
      const { plaintext, hash } = generateOneTimeToken();
      await db.insert(verificationTokens).values({
        userId: user.id,
        tokenHash: hash,
        purpose: "password_reset",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      sendPasswordResetEmailStub(user.email, `${env.PORTAL_APP_URL}/reset-password?token=${plaintext}`);
      await writeAuditLog(db, { actorUserId: user.id, action: "user.password_reset_requested", entityType: "user", entityId: user.id, ipAddress: req.ip });
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  });

  router.post("/reset-password", authRateLimiter, async (req, res) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const hash = hashRefreshToken(token);

    const record = await db.query.verificationTokens.findFirst({
      where: and(eq(verificationTokens.tokenHash, hash), eq(verificationTokens.purpose, "password_reset"), isNull(verificationTokens.usedAt)),
    });
    if (!record || record.expiresAt < new Date()) {
      throw new AppError("INVALID_TOKEN", "Reset link is invalid or expired", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, record.userId));
    await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, record.id));

    // Password reset invalidates every existing session — a stolen session
    // shouldn't survive the legitimate owner regaining control.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, record.userId), isNull(refreshTokens.revokedAt)));

    await writeAuditLog(db, { actorUserId: record.userId, action: "user.password_reset", entityType: "user", entityId: record.userId, ipAddress: req.ip });
    res.json({ message: "Password reset. Please log in again." });
  });

  router.get("/me", requireAuth(env), async (req, res) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, req.user!.sub) });
    if (!user) throw new UnauthorizedError();
    res.json({ id: user.id, email: user.email, role: user.role, emailVerified: user.emailVerified, mfaEnabled: user.mfaEnabled });
  });

  return router;
}
