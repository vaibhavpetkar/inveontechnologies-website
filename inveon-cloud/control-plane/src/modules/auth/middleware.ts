import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { and, eq, sql } from "drizzle-orm";
import type { Env } from "../../env.js";
import type { Database } from "../../db/client.js";
import { memberships, organizations, users } from "../../db/schema.js";
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";

export type MemberRole = "owner" | "admin" | "developer" | "viewer";

export interface AccessTokenPayload {
  sub: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      member?: { orgId: string; role: MemberRole };
      server?: { id: string; orgId: string };
    }
  }
}

/**
 * viewer: read everything (secrets masked)
 * developer: + deploy, rollback, env vars, container logs, backup now
 * admin: + servers, apps, environments, domains, health, backup config, restore, invites
 * owner: + member roles, removing members, owner invites
 */
export const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, developer: 1, admin: 2, owner: 3 };

export function signAccessToken(userId: string, env: Env): string {
  return jwt.sign({ sub: userId }, env.INVEON_JWT_SECRET, { expiresIn: `${env.INVEON_ACCESS_TOKEN_TTL_MIN}m` });
}

export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedError();
    try {
      const payload = jwt.verify(header.slice(7), env.INVEON_JWT_SECRET) as AccessTokenPayload & { typ?: unknown };
      if (typeof payload.sub !== "string" || payload.typ !== undefined) throw new Error("bad token");
      req.user = { sub: payload.sub };
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
    next();
  };
}

/**
 * Loads the caller's membership in :orgId. Non-members get 404 (not 403) so
 * org ids can't be probed.
 */
export function requireMember(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    const orgId = req.params.orgId;
    if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) throw new NotFoundError("Organization not found");
    const [m] = await db
      .select({
        role: memberships.role,
        requireAdmins: organizations.require2faForAdmins,
        // TOTP or a passkey (the same as hasSecondFactorSql in two-factor.ts).
        secondFactor: sql<boolean>`(${users.totpEnabledAt} IS NOT NULL OR EXISTS (SELECT 1 FROM user_passkeys p WHERE p.user_id = ${users.id}))`,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, req.user.sub)))
      .limit(1);
    if (!m) throw new NotFoundError("Organization not found");
    // Owners (and admins, when the organization asks) must turn on two-factor
    // (TOTP or a passkey) before anything else in the organization works.
    if (!m.secondFactor && (m.role === "owner" || (m.role === "admin" && m.requireAdmins))) {
      throw new AppError("TWO_FACTOR_REQUIRED", "Turn on two-factor authentication to continue (Account, Two-factor)", 403);
    }
    req.member = { orgId, role: m.role };
    next();
  };
}

export function requireRole(min: MemberRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.member) throw new UnauthorizedError();
    if (ROLE_RANK[req.member.role] < ROLE_RANK[min]) throw new ForbiddenError(`This needs the ${min} role or higher`);
    next();
  };
}

export function hasRole(req: Request, min: MemberRole) {
  return !!req.member && ROLE_RANK[req.member.role] >= ROLE_RANK[min];
}

export function authRateLimiter(limit: number, windowMinutes = 15) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
  });
}
