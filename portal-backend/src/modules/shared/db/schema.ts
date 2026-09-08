import { pgTable, uuid, text, timestamp, boolean, jsonb, pgEnum, integer } from "drizzle-orm/pg-core";

/**
 * Phase 1 schema: identity + auth only. Opportunities/applications/
 * assessments tables land in their own phases per docs/architecture.md.
 */

export const roleEnum = pgEnum("role", [
  "candidate",
  "intern",
  "employee",
  "manager",
  "hr",
  "admin",
  "super_admin",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("candidate"),
  emailVerified: boolean("email_verified").notNull().default(false),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Refresh tokens are stored hashed, never in plaintext, so a DB leak alone
// doesn't let an attacker mint sessions. Rotation: every refresh issues a
// new row and revokes the old one (replacedByTokenId), so reuse of an
// already-rotated token is detectable (token-reuse-detection -> revoke all).
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  replacedByTokenId: uuid("replaced_by_token_id"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single-use tokens for email verification and password reset. Stored
// hashed; the plaintext token only ever exists in the (currently stubbed —
// logged, not emailed) outbound link.
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose", { enum: ["email_verify", "password_reset"] }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
