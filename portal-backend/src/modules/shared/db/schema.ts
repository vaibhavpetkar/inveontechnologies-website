import { pgTable, uuid, text, timestamp, boolean, jsonb, pgEnum, integer, primaryKey, unique, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

/**
 * Phase 2 schema: opportunities, skills taxonomy, candidate profile,
 * applications, and application timeline.
 *
 * Scoping decision (recorded here + docs/decisions.md): the application
 * status enum includes the full set from docs/state-machines.md, including
 * assessment_invited/assessment_completed — but Phase 2 only wires
 * transitions for the non-assessment path (submitted -> under_review ->
 * shortlisted -> selected, with rejected/withdrawn as applicable). The
 * assessment states are reserved now so Phase 3 doesn't need an enum
 * migration, but are unreachable until Phase 3 adds those transitions.
 */

export const opportunityStatusEnum = pgEnum("opportunity_status", ["draft", "published", "archived"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "submitted",
  "under_review",
  "assessment_invited", // reserved for Phase 3 — not reachable yet
  "assessment_completed", // reserved for Phase 3 — not reachable yet
  "shortlisted",
  "selected",
  "rejected",
  "withdrawn",
]);

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Human-readable business ID, e.g. OPP-2026-00001. Set in a follow-up
  // UPDATE inside the same transaction as the insert (once seqNumber is
  // known) — see shared/business-id.ts. Nullable at the DB level only to
  // allow that brief window; application code never leaves it null after
  // the transaction commits.
  businessId: text("business_id").unique(),
  seqNumber: integer("seq_number").generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  status: opportunityStatusEnum("status").notNull().default("draft"),
  // Configurable eligibility, e.g. { "minCgpa": 7, "degrees": ["B.Tech","M.Tech"], "maxGraduationYear": 2026 }.
  // Soft-checked against the candidate profile at application time (see
  // applications/eligibility.ts) — a mismatch warns but does not hard-block
  // in Phase 2, since candidates may have legitimate context an automated
  // check can't see. Hard-blocking is a documented option to switch on later.
  eligibility: jsonb("eligibility").notNull().default({}),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunitySkills = pgTable(
  "opportunity_skills",
  {
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.opportunityId, t.skillId] }) }),
);

export const candidateProfiles = pgTable("candidate_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  phone: text("phone"),
  bio: text("bio"),
  degree: text("degree"),
  graduationYear: integer("graduation_year"),
  cgpa: numeric("cgpa", { precision: 4, scale: 2 }),
  resumeUrl: text("resume_url"), // placeholder — real private file storage lands in a later phase
  profileCompleted: boolean("profile_completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidateSkills = pgTable(
  "candidate_skills",
  {
    userId: uuid("user_id").notNull().references(() => candidateProfiles.userId, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.skillId] }) }),
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Same nullable-then-set-in-transaction pattern as opportunities.businessId.
    businessId: text("business_id").unique(),
    seqNumber: integer("seq_number").generatedAlwaysAsIdentity(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Duplicate-prevention at the DB level (not just app-level): a
    // candidate can only have one row per (user, opportunity) at all —
    // including withdrawn ones. This is intentionally strict for Phase 2
    // (simplest correct rule); if candidates should be able to re-apply
    // after withdrawing, that needs a partial unique index instead
    // (WHERE status != 'withdrawn'), which Drizzle can't express
    // declaratively yet and would be hand-added to the migration.
    uniqUserOpportunity: unique("applications_user_opportunity_unique").on(t.userId, t.opportunityId),
  }),
);

export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  fromStatus: applicationStatusEnum("from_status"),
  toStatus: applicationStatusEnum("to_status").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunitiesRelations = relations(opportunities, ({ many }) => ({
  opportunitySkills: many(opportunitySkills),
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  opportunity: one(opportunities, { fields: [applications.opportunityId], references: [opportunities.id] }),
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  events: many(applicationEvents),
}));

/**
 * Phase 3 schema: MCQ-based assessment engine. Wires into the two
 * reserved application_status values (assessment_invited/
 * assessment_completed) that Phase 2 left unreachable — see
 * applications/state-machine.ts for the updated transition table.
 *
 * Scoping decisions (recorded here + docs/decisions.md):
 * - MCQ only, auto-scored. Free-text/manually-graded questions are a
 *   later phase.
 * - One assessment belongs to exactly one opportunity (not a reusable
 *   template library) — simplest correct thing for MVP; can be
 *   decoupled into a template + per-opportunity assignment later
 *   without breaking this shape (assessment stays the "instance").
 * - One attempt per application, enforced by a DB unique constraint.
 * - Expiry is checked lazily (on next read/submit of the attempt), not
 *   via a background job/cron — there is no scheduler in this stack yet.
 *   An attempt that nobody ever looks at again after expiring will sit as
 *   "in_progress" until someone (candidate or admin) next hits it. This
 *   is an accepted limitation for Phase 3, not an oversight — a cron-based
 *   sweep can be added later without changing this schema.
 */

export const assessmentAttemptStatusEnum = pgEnum("assessment_attempt_status", [
  "not_started",
  "in_progress",
  "submitted",
  "expired",
  "scored",
]);

export const assessments = pgTable("assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull(),
  // Percentage (0-100) of total points required to pass.
  passingScorePercent: integer("passing_score_percent").notNull().default(60),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentQuestions = pgTable("assessment_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  // [{ id: "a", text: "..." }, { id: "b", text: "..." }, ...]
  options: jsonb("options").notNull(),
  correctOptionId: text("correct_option_id").notNull(),
  points: integer("points").notNull().default(1),
  orderIndex: integer("order_index").notNull().default(0),
});

export const assessmentAttempts = pgTable("assessment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().unique().references(() => applications.id, { onDelete: "cascade" }),
  assessmentId: uuid("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  status: assessmentAttemptStatusEnum("status").notNull().default("not_started"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  scorePercent: integer("score_percent"),
  passed: boolean("passed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentAttemptAnswers = pgTable(
  "assessment_attempt_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => assessmentQuestions.id, { onDelete: "cascade" }),
    selectedOptionId: text("selected_option_id"),
    isCorrect: boolean("is_correct"),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqAttemptQuestion: unique("attempt_answers_attempt_question_unique").on(t.attemptId, t.questionId) }),
);

export const assessmentsRelations = relations(assessments, ({ many }) => ({
  questions: many(assessmentQuestions),
}));

export const assessmentAttemptsRelations = relations(assessmentAttempts, ({ one, many }) => ({
  assessment: one(assessments, { fields: [assessmentAttempts.assessmentId], references: [assessments.id] }),
  application: one(applications, { fields: [assessmentAttempts.applicationId], references: [applications.id] }),
  answers: many(assessmentAttemptAnswers),
}));
