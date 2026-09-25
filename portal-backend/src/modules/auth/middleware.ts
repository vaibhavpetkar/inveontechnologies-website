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
 * Populates req.user when a valid access token is present, but never
 * rejects the request otherwise. Used on endpoints that behave differently
 * for privileged vs anonymous/candidate callers (e.g. opportunity browsing
 * shows drafts to HR/Admin) without requiring login for everyone.
 */
export function optionalAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        req.user = verifyAccessToken(header.slice("Bearer ".length), env);
      } catch {
        // Invalid/expired token on an optional-auth route — proceed as anonymous.
      }
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
// stricter than a general API rate limit. Each endpoint gets its OWN counter
// — with one shared limiter, signing up and then logging in (plus a
// verification click) ate into the same 10-attempt budget.
// Keyed by req.ip: correct only if nginx resolves the real client IP when
// Cloudflare is in front (see the real_ip block in nginx/inveontechnologies.in.conf).
export function createAuthRateLimiter(limit = 10, windowMinutes = 15) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
  });
}
