import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { verifyAccessToken, type AccessTokenPayload } from "./tokens.js";
import { UnauthorizedError, ForbiddenError } from "../shared/errors.js";
import type { Env } from "../shared/env.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }
    const token = header.slice("Bearer ".length);
    try {
      req.user = verifyAccessToken(token, env);
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
    next();
  };
}

/**
 * Server-side role check. This is the enforcement point referenced in
 * docs/permissions.md — never trust a role claim from the frontend for
 * anything the frontend itself asserts; this middleware re-derives the
 * role from the verified JWT signed by this server.
 */
export function requireRole(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
}

// Brute-force protection on the sensitive auth endpoints. Deliberately
// stricter than a general API rate limit.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
});
