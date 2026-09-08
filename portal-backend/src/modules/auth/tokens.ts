import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import type { Env } from "../shared/env.js";

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload, env: Env): string {
  return jwt.sign(payload, env.PORTAL_JWT_SECRET, {
    expiresIn: `${env.PORTAL_ACCESS_TOKEN_TTL_MIN}m`,
  });
}

export function verifyAccessToken(token: string, env: Env): AccessTokenPayload {
  return jwt.verify(token, env.PORTAL_JWT_SECRET) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings, NOT JWTs — the DB is the
 * source of truth for validity/revocation, so a leaked JWT secret alone
 * can't be used to forge a long-lived session. Only a SHA-256 hash of the
 * token is ever stored; the plaintext is returned to the client once and
 * never persisted server-side.
 */
export function generateRefreshToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(48).toString("base64url");
  return { plaintext, hash: hashRefreshToken(plaintext) };
}

export function hashRefreshToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Single-use tokens for email verification / password reset — same pattern as refresh tokens. */
export function generateOneTimeToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("base64url");
  return { plaintext, hash: hashRefreshToken(plaintext) };
}
