import { Router, type Request, type Response } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { createPublicKey, randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { userPasskeys, users, webauthnChallenges } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { relyingParty, SignCountError, SUPPORTED_ALGS, verifyAssertion, verifyRegistration, WebAuthnError, type RelyingParty } from "../../lib/webauthn.js";
import { authRateLimiter, requireAuth } from "./middleware.js";
import { hasSecondFactor, revokeSessions, verifyChallenge } from "./two-factor.js";

/**
 * Passkeys (WebAuthn), next to password + TOTP:
 *
 * - Register (signed in, and the current password again, since a passkey
 *   can sign in on its own): options with a fresh challenge, then the
 *   browser's credential is checked (lib/webauthn.ts) and stored.
 * - Sign in without a password: a discoverable passkey with user
 *   verification (PIN or biometrics). That is two factors in one, so it
 *   satisfies the owner (and admin) two-factor requirement.
 * - Or as the second step after a password, like a TOTP code.
 *
 * Challenges are random 32 bytes, stored server-side for 5 minutes and
 * deleted when used, so each works once. The rpId is INVEON_PUBLIC_URL's
 * host; the browser's origin must be that URL's origin (or one listed in
 * INVEON_WEBAUTHN_ORIGINS, for a dev server).
 */

type User = typeof users.$inferSelect;

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = "Inveon Cloud";

export interface PasskeyDeps {
  issueSession: (db: Database, env: Env, res: Response, userId: string, meta: { ua?: string; ip?: string }) => Promise<string>;
  profile: (db: Database, env: Env, userId: string) => Promise<unknown>;
  recordFailure: (user: User, action: string, ip: string | undefined) => Promise<void>;
  currentRefreshHash: (cookies: unknown) => string | undefined;
}

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/, "base64url");
const field = (max: number) => b64url.max(max).transform((v) => Buffer.from(v, "base64url"));

const registrationSchema = z.object({
  ceremonyId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  credential: z.object({
    id: b64url.max(1400),
    rawId: field(1400),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: field(4096),
      attestationObject: field(16384),
      transports: z.array(z.enum(["usb", "nfc", "ble", "internal", "hybrid", "smart-card", "cable"])).max(8).optional(),
    }),
  }),
});

const assertionSchema = z.object({
  ceremonyId: z.string().uuid(),
  challengeToken: z.string().min(10).max(2000).optional(),
  credential: z.object({
    id: b64url.max(1400),
    rawId: field(1400),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: field(4096),
      authenticatorData: field(2048),
      signature: field(1024),
      userHandle: field(128).nullable().optional(),
    }),
  }),
});

/** The WebAuthn user handle: the user's UUID as 16 bytes (no email or name in it). */
export const userHandle = (userId: string) => Buffer.from(userId.replace(/-/g, ""), "hex");

export function publicPasskey(p: typeof userPasskeys.$inferSelect) {
  return { id: p.id, name: p.name, alg: p.alg, aaguid: p.aaguid, transports: p.transports, backedUp: p.backedUp, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt };
}

async function newChallenge(db: Database, purpose: "register" | "login", userId: string | null) {
  const challenge = randomBytes(32).toString("base64url");
  const [row] = await db.insert(webauthnChallenges).values({ purpose, userId, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) }).returning({ id: webauthnChallenges.id });
  return { ceremonyId: row.id, challenge };
}

/** Deletes the challenge whatever happens next: it works once. */
async function consumeChallenge(db: Database, id: string, purpose: "register" | "login") {
  const [row] = await db.delete(webauthnChallenges).where(and(eq(webauthnChallenges.id, id), eq(webauthnChallenges.purpose, purpose))).returning();
  if (!row || row.expiresAt.getTime() < Date.now()) throw new AppError("PASSKEY_CHALLENGE_EXPIRED", "That passkey request expired. Try again.", 400);
  return row;
}

/** Scheduler: challenges nobody finished. */
export async function pruneWebauthnChallenges(db: Database) {
  const result = await db.execute(sql`DELETE FROM webauthn_challenges WHERE expires_at < now()`);
  return result.rowCount ?? 0;
}

/** /api/v1/auth/passkeys */
export function passkeyRouter(db: Database, env: Env, deps: PasskeyDeps) {
  const router = Router();
  const rp: RelyingParty = relyingParty(env.INVEON_PUBLIC_URL, env.INVEON_WEBAUTHN_ORIGINS);
  const limit = authRateLimiter(env.INVEON_AUTH_RATE_LIMIT);
  const auth = requireAuth(env);

  const loadUser = async (id: string) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) throw new UnauthorizedError();
    return user;
  };
  const log = (userId: string, action: string, ip: string | undefined, metadata: Record<string, unknown> = {}) =>
    writeAudit(db, { orgId: null, actorUserId: userId, action, entityType: "user", entityId: userId, metadata, ipAddress: ip });

  /** Adding or removing a passkey asks for the password again (a stolen session alone can't). */
  async function checkPassword(user: User, password: string, ip: string | undefined) {
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", "Account temporarily locked after failed sign-ins", 423);
    if (!(await argon2.verify(user.passwordHash, password).catch(() => false))) {
      await deps.recordFailure(user, "user.passkey_password_failed", ip);
      throw new AppError("INVALID_PASSWORD", "That password is wrong", 401);
    }
  }

  router.get("/", auth, async (req, res) => {
    const rows = await db.select().from(userPasskeys).where(eq(userPasskeys.userId, req.user!.sub)).orderBy(asc(userPasskeys.createdAt));
    res.json({ passkeys: rows.map(publicPasskey) });
  });

  // Step 1 of adding a passkey: creation options for navigator.credentials.create().
  router.post("/register/options", limit, auth, async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
    const user = await loadUser(req.user!.sub);
    await checkPassword(user, password, req.ip);
    const existing = await db.select({ credentialId: userPasskeys.credentialId, transports: userPasskeys.transports }).from(userPasskeys).where(eq(userPasskeys.userId, user.id));
    if (existing.length >= 20) throw new AppError("TOO_MANY_PASSKEYS", "Remove a passkey first (20 at most)", 400);
    const { ceremonyId, challenge } = await newChallenge(db, "register", user.id);
    res.json({
      ceremonyId,
      publicKey: {
        challenge,
        rp: { id: rp.id, name: RP_NAME },
        user: { id: userHandle(user.id).toString("base64url"), name: user.email, displayName: user.name ?? user.email },
        pubKeyCredParams: SUPPORTED_ALGS.map((alg) => ({ type: "public-key", alg })),
        timeout: CHALLENGE_TTL_MS,
        attestation: "none",
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
        excludeCredentials: existing.map((c) => ({ type: "public-key", id: c.credentialId, transports: c.transports })),
      },
    });
  });

  // Step 2: the authenticator's answer.
  router.post("/register", limit, auth, async (req, res) => {
    const body = registrationSchema.parse(req.body);
    const user = await loadUser(req.user!.sub);
    const ceremony = await consumeChallenge(db, body.ceremonyId, "register");
    if (ceremony.userId !== user.id) throw new AppError("PASSKEY_CHALLENGE_EXPIRED", "That passkey request expired. Try again.", 400);
    if (body.credential.rawId.toString("base64url") !== body.credential.id) throw new AppError("INVALID_PASSKEY", "The credential id and raw id differ", 400);
    let verified;
    try {
      verified = verifyRegistration(
        { credentialId: body.credential.rawId, clientDataJSON: body.credential.response.clientDataJSON, attestationObject: body.credential.response.attestationObject },
        { challenge: ceremony.challenge, rp, requireUserVerification: true },
      );
    } catch (err) {
      if (err instanceof WebAuthnError) throw new AppError("INVALID_PASSKEY", err.message, 400);
      throw err;
    }
    const credentialId = verified.credentialId.toString("base64url");
    if (await db.query.userPasskeys.findFirst({ where: eq(userPasskeys.credentialId, credentialId), columns: { id: true } })) {
      throw new ConflictError("This passkey is already registered");
    }
    const hadSecondFactor = await hasSecondFactor(db, user);
    const [row] = await db
      .insert(userPasskeys)
      .values({
        userId: user.id,
        credentialId,
        publicKey: verified.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        alg: verified.alg,
        signCount: verified.signCount,
        name: body.name ?? "Passkey",
        aaguid: verified.aaguid,
        transports: body.credential.response.transports ?? [],
        backupEligible: verified.backupEligible,
        backedUp: verified.backedUp,
      })
      .returning();
    // Like turning on TOTP: sessions opened with only a password end; this one stays.
    if (!hadSecondFactor) await revokeSessions(db, user.id, deps.currentRefreshHash(req.cookies));
    await log(user.id, "user.passkey_add", req.ip, { passkeyId: row.id, name: row.name, alg: row.alg, fmt: verified.fmt });
    res.status(201).json({ passkey: publicPasskey(row) });
  });

  router.patch("/:id", auth, async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    const id = z.string().uuid().parse(req.params.id);
    const [row] = await db.update(userPasskeys).set({ name }).where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, req.user!.sub))).returning();
    if (!row) throw new NotFoundError("Passkey not found");
    res.json({ passkey: publicPasskey(row) });
  });

  router.delete("/:id", limit, auth, async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body ?? {});
    const id = z.string().uuid().parse(req.params.id);
    const user = await loadUser(req.user!.sub);
    await checkPassword(user, password, req.ip);
    const [row] = await db.delete(userPasskeys).where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, user.id))).returning();
    if (!row) throw new NotFoundError("Passkey not found");
    await log(user.id, "user.passkey_remove", req.ip, { passkeyId: row.id, name: row.name });
    res.json({ ok: true });
  });

  // Sign-in, step 1: request options for navigator.credentials.get().
  // With a challengeToken (after the password), only that user's passkeys.
  router.post("/login/options", limit, async (req, res) => {
    const { challengeToken } = z.object({ challengeToken: z.string().min(10).max(2000).optional() }).parse(req.body ?? {});
    const userId = challengeToken ? verifyChallenge(challengeToken, env) : null;
    const allow = userId
      ? await db.select({ credentialId: userPasskeys.credentialId, transports: userPasskeys.transports }).from(userPasskeys).where(eq(userPasskeys.userId, userId))
      : [];
    if (userId && allow.length === 0) throw new AppError("NO_PASSKEYS", "This account has no passkeys", 400);
    const { ceremonyId, challenge } = await newChallenge(db, "login", userId);
    res.json({
      ceremonyId,
      publicKey: {
        challenge,
        rpId: rp.id,
        timeout: CHALLENGE_TTL_MS,
        // Without a password first, the passkey must verify the user (PIN or biometrics).
        userVerification: userId ? "preferred" : "required",
        allowCredentials: allow.map((c) => ({ type: "public-key", id: c.credentialId, transports: c.transports })),
      },
    });
  });

  // Sign-in, step 2: the signed assertion. Issues the session.
  router.post("/login", limit, async (req: Request, res: Response) => {
    const body = assertionSchema.parse(req.body);
    const ceremony = await consumeChallenge(db, body.ceremonyId, "login");
    const secondStep = ceremony.userId !== null;
    if (secondStep && (!body.challengeToken || verifyChallenge(body.challengeToken, env) !== ceremony.userId)) {
      throw new AppError("INVALID_CHALLENGE", "The sign-in step expired. Enter your email and password again.", 401);
    }
    const unknown = () => new AppError("UNKNOWN_PASSKEY", "This passkey isn't registered with Inveon Cloud", 401);
    if (body.credential.rawId.toString("base64url") !== body.credential.id) throw unknown();
    const passkey = await db.query.userPasskeys.findFirst({ where: eq(userPasskeys.credentialId, body.credential.id) });
    if (!passkey || (secondStep && passkey.userId !== ceremony.userId)) throw unknown();
    const handle = body.credential.response.userHandle;
    if (handle && handle.length && !handle.equals(userHandle(passkey.userId))) throw unknown();
    const user = await loadUser(passkey.userId);
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", "Account temporarily locked after failed sign-ins", 423);

    let result;
    try {
      result = verifyAssertion(
        { clientDataJSON: body.credential.response.clientDataJSON, authenticatorData: body.credential.response.authenticatorData, signature: body.credential.response.signature },
        { publicKey: createPublicKey({ key: Buffer.from(passkey.publicKey, "base64"), format: "der", type: "spki" }), alg: passkey.alg, signCount: passkey.signCount },
        { challenge: ceremony.challenge, rp, requireUserVerification: !secondStep },
      );
    } catch (err) {
      if (!(err instanceof WebAuthnError)) throw err;
      await deps.recordFailure(user, err instanceof SignCountError ? "user.passkey_clone_suspected" : "user.passkey_failed", req.ip);
      throw new AppError("INVALID_PASSKEY", err.message, 401);
    }
    // Only if nobody else used the counter meanwhile.
    const [used] = await db
      .update(userPasskeys)
      .set({ signCount: result.signCount, backedUp: result.backedUp, lastUsedAt: new Date() })
      .where(and(eq(userPasskeys.id, passkey.id), eq(userPasskeys.signCount, passkey.signCount)))
      .returning({ id: userPasskeys.id });
    if (!used) throw new AppError("INVALID_PASSKEY", "The passkey was used at the same time elsewhere; try again", 401);

    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const accessToken = await deps.issueSession(db, env, res, user.id, { ua: req.headers["user-agent"], ip: req.ip });
    await log(user.id, "user.login", req.ip, secondStep ? { secondFactor: "passkey", passkeyId: passkey.id } : { method: "passkey", passkeyId: passkey.id });
    res.json({ accessToken, user: await deps.profile(db, env, user.id) });
  });

  return router;
}
