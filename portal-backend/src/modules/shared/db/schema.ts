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
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), // heartbeat-driven presence, see chat/presence-routes.ts
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

/**
 * Phase 4 schema: recruitment operations — document requests, interviews,
 * offers, and the onboarding checklist. All four are deliberately kept
 * OUTSIDE the applications.status state machine (see decisions.md Phase 4)
 * rather than adding more enum values — an application stays "selected"
 * while these run in parallel/afterward, each tracked by its own status.
 *
 * Scoping decision: document uploads are metadata-only in this phase —
 * `fileUrl` is a placeholder text column, same pattern as
 * candidateProfiles.resumeUrl. Real private object storage with signed
 * URLs (as the plan specifies) is still deferred; wiring it in later only
 * means populating this column for real instead of leaving it null.
 */

export const documentRequestStatusEnum = pgEnum("document_request_status", ["requested", "uploaded", "verified", "rejected"]);

export const documentRequests = pgTable("document_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  documentName: text("document_name").notNull(),
  status: documentRequestStatusEnum("status").notNull().default("requested"),
  fileUrl: text("file_url"), // placeholder — see module comment above
  note: text("note"),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  verifiedBy: uuid("verified_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interviewStatusEnum = pgEnum("interview_status", ["scheduled", "completed", "rescheduled", "no_show", "cancelled"]);
export const interviewDecisionEnum = pgEnum("interview_decision", ["pass", "fail", "hold"]);

export const interviewRounds = pgTable("interview_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull().default(1),
  interviewerId: uuid("interviewer_id").notNull().references(() => users.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  meetingUrl: text("meeting_url"),
  status: interviewStatusEnum("status").notNull().default("scheduled"),
  feedback: text("feedback"),
  scorecard: jsonb("scorecard"), // freeform { criteria: [{name, rating, comment}], ... }
  decision: interviewDecisionEnum("decision"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offerStatusEnum = pgEnum("offer_status", ["draft", "sent", "accepted", "rejected", "expired"]);

export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  status: offerStatusEnum("status").notNull().default("draft"),
  // Immutable-once-sent content snapshot (role, stipend/salary, start date,
  // etc., rendered as text). A later "reissue" is a NEW row with version+1,
  // never an edit to a sent offer — preserves what was actually offered.
  content: text("content").notNull(),
  acceptanceDeadline: timestamp("acceptance_deadline", { withTimezone: true }),
  generatedBy: uuid("generated_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingTaskStatusEnum = pgEnum("onboarding_task_status", ["pending", "completed"]);

export const onboardingTasks = pgTable("onboarding_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  taskType: text("task_type", { enum: ["policy_consent", "emergency_contact", "document", "custom"] }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  status: onboardingTaskStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Phase 8 schema: courses, modules, lessons, enrollment/progress,
 * certificates. Scoping decisions recorded here + docs/decisions.md:
 *
 * - Lesson content is metadata-only (contentUrl placeholder), same pattern
 *   as resumeUrl/document fileUrl in earlier phases — no real video/file
 *   hosting yet.
 * - "test" lessons do NOT reuse the Phase 3 assessment engine. That engine
 *   is application-scoped (assessmentAttempts.applicationId is NOT NULL);
 *   decoupling it into a reusable "gradable thing" abstraction shared by
 *   both applications and course lessons is real work deferred to a later
 *   refactor, not done silently here. Course "test" lessons are marked
 *   pass/fail by a privileged reviewer for Phase 8.
 * - Certificates use TWO identifiers: businessId (INV-CERT-YYYY-######,
 *   human-readable, sequential — same transactional pattern as
 *   opportunities/applications) for display, and a separate random
 *   verificationCode for the public verification URL. Sequential IDs are
 *   guessable; the public lookup key must not be.
 * - Certificate PDF generation is NOT implemented — `snapshotContent` is
 *   the immutable rendered text at issue time. Turning that into an actual
 *   PDF file is future work (would use the pdf skill / object storage);
 *   this phase gives the exact content a PDF renderer would need.
 * - "Certificate audit history" reuses the existing generic audit_logs
 *   table rather than a new one — issue/revoke/reissue already fit its
 *   shape (actor, action, entity, metadata).
 */

export const courseStatusEnum = pgEnum("course_status", ["draft", "published", "archived"]);
export const lessonContentTypeEnum = pgEnum("lesson_content_type", ["video", "document", "assignment", "test"]);
export const courseEnrollmentStatusEnum = pgEnum("course_enrollment_status", ["enrolled", "completed", "dropped"]);
export const lessonProgressStatusEnum = pgEnum("lesson_progress_status", ["not_started", "in_progress", "completed"]);
export const certificateStatusEnum = pgEnum("certificate_status", ["issued", "revoked"]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: courseStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coursePrerequisites = pgTable(
  "course_prerequisites",
  {
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    prerequisiteCourseId: uuid("prerequisite_course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.courseId, t.prerequisiteCourseId] }) }),
);

export const courseModules = pgTable("course_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const courseLessons = pgTable("course_lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id").notNull().references(() => courseModules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  contentType: lessonContentTypeEnum("content_type").notNull(),
  contentUrl: text("content_url"), // placeholder — see module comment above
  contentText: text("content_text"), // for text-based lessons/instructions
  required: boolean("required").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
});

export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: courseEnrollmentStatusEnum("status").notNull().default("enrolled"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({ uniqCourseUser: unique("course_enrollments_course_user_unique").on(t.courseId, t.userId) }),
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    status: lessonProgressStatusEnum("status").notNull().default("not_started"),
    // For "test" lessons only — set by a privileged reviewer's pass/fail call.
    passed: boolean("passed"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({ uniqEnrollmentLesson: unique("lesson_progress_enrollment_lesson_unique").on(t.enrollmentId, t.lessonId) }),
);

export const certificateTemplates = pgTable("certificate_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  // Merge-field body, e.g. "This certifies that {{recipientName}} completed {{courseTitle}} on {{issuedDate}}."
  bodyTemplate: text("body_template").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: text("business_id").unique(), // set post-insert in a transaction, same pattern as opportunities/applications
    seqNumber: integer("seq_number").generatedAlwaysAsIdentity(),
    verificationCode: text("verification_code").notNull().unique(), // random, unguessable — the public lookup key
    userId: uuid("user_id").notNull().references(() => users.id),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    templateId: uuid("template_id").notNull().references(() => certificateTemplates.id),
    snapshotContent: text("snapshot_content").notNull(), // immutable rendered text at issue time
    status: certificateStatusEnum("status").notNull().default("issued"),
    issuedBy: uuid("issued_by").notNull().references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid("revoked_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    // A reissue creates a NEW row pointing back at the one it replaces —
    // the old row is separately marked revoked with reason "reissued".
    // Never mutate a previously issued certificate's snapshotContent.
    supersedesCertificateId: uuid("supersedes_certificate_id"),
  },
  (t) => ({
    // One ACTIVE (issued) certificate per user+course at a time is enforced
    // in application code (see certificates/routes.ts), not here — a
    // simple DB unique on (userId, courseId) would also block a legitimate
    // reissue-after-revoke, and Drizzle can't express a partial unique
    // index (WHERE status = 'issued') declaratively yet.
  }),
);

/**
 * Phase 6 schema: employee/intern records, department/designation
 * taxonomy, protected employee documents, and joining/appointment
 * letters. Scoping decisions recorded here + docs/decisions.md:
 *
 * - Employees are created ONLY from a selected application with an
 *   ACCEPTED offer (checked in code, not the schema) — "authorized
 *   selection-to-onboarding workflow" per the plan. employees.applicationId
 *   preserves the link back to full application history; nothing about the
 *   original application is deleted or overwritten on the transition.
 * - employeeType (intern/full_time/contract) is a DIFFERENT axis from the
 *   platform `role` enum (candidate/intern/employee/...). Creating an
 *   employee record also promotes the underlying user's role
 *   (intern->intern, full_time/contract->employee) so their portal access
 *   actually changes, not just a label on a new table.
 * - Documents and letters are deliberately restricted to the employee
 *   themselves + HR/Admin/Super Admin — NOT Manager — per the plan's
 *   explicit requirement that these are "protected" and the required test
 *   that "employees cannot access another employee's private data."
 * - Letters are versioned, immutable once generated (a correction is a new
 *   version, never an edit) — same pattern as offers/certificates.
 * - `portalAccessActive` is a real gate, not just a status label — the
 *   employee dashboard endpoint checks it and 403s until activated.
 */

export const employeeTypeEnum = pgEnum("employee_type", ["intern", "full_time", "contract"]);
export const employeeStatusEnum = pgEnum("employee_status", ["preboarding", "active", "on_leave", "offboarded"]);
export const employeeDocumentStatusEnum = pgEnum("employee_document_status", ["uploaded", "verified", "rejected"]);
export const letterTypeEnum = pgEnum("letter_type", ["joining", "appointment"]);

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

export const designations = pgTable("designations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().unique(),
});

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: text("business_id").unique(), // set post-insert in a transaction — same pattern as opportunities/applications/certificates
  seqNumber: integer("seq_number").generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().references(() => users.id),
  applicationId: uuid("application_id").references(() => applications.id).unique(), // preserves application history; unique so one application can only ever produce one employee record
  employeeType: employeeTypeEnum("employee_type").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  designationId: uuid("designation_id").references(() => designations.id),
  managerId: uuid("manager_id").references(() => users.id),
  hrManagerId: uuid("hr_manager_id").references(() => users.id),
  joiningDate: timestamp("joining_date", { withTimezone: true }).notNull(),
  durationMonths: integer("duration_months"), // for interns/contract; null = indefinite
  status: employeeStatusEnum("status").notNull().default("preboarding"),
  portalAccessActive: boolean("portal_access_active").notNull().default(false),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeOnboardingTasks = pgTable("employee_onboarding_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  taskType: text("task_type", { enum: ["policy_consent", "access_activation", "document", "custom"] }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  status: onboardingTaskStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeDocuments = pgTable("employee_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  fileUrl: text("file_url").notNull(), // placeholder — see earlier phases' note on deferred object storage
  status: employeeDocumentStatusEnum("status").notNull().default("uploaded"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  note: text("note"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letterTemplates = pgTable("letter_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  letterType: letterTypeEnum("letter_type").notNull(),
  title: text("title").notNull(),
  bodyTemplate: text("body_template").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeLetters = pgTable("employee_letters", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  letterType: letterTypeEnum("letter_type").notNull(),
  version: integer("version").notNull().default(1),
  content: text("content").notNull(), // immutable rendered snapshot — see module comment above
  signatoryName: text("signatory_name").notNull(),
  signatoryTitle: text("signatory_title").notNull(),
  generatedBy: uuid("generated_by").notNull().references(() => users.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Phase 7 schema: projects, tasks, and growth tracking. Scoping decisions
 * recorded here + docs/decisions.md:
 *
 * - Reminders/escalation say "through the background-job/outbox
 *   mechanism" in the plan, but Phase 9 (the real outbox) doesn't exist
 *   yet — same stubbed-log pattern used everywhere else in this codebase
 *   for "would notify" is used here too, not a fake queue.
 * - Recurring tasks: no scheduler exists in this stack (documented
 *   limitation repeated from assessment/offer lazy-expiry) — a recurring
 *   task's next occurrence is generated by an explicit privileged call,
 *   not a cron. The `nextRunAt` field is there so a future cron can drive
 *   this without a schema change.
 * - Manager/team scope is enforced in application code (see
 *   projects/routes.ts and tasks/routes.ts helper functions), not via
 *   row-level security — this stack doesn't use Postgres RLS anywhere.
 * - actualHours on a task is a denormalized running sum of its
 *   task_time_entries, updated on each entry insert — read-heavy access
 *   pattern (task dashboards) shouldn't need to re-sum every time.
 */

export const projectStatusEnum = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "cancelled"]);
export const projectRoleEnum = pgEnum("project_member_role", ["lead", "member"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high"]);
export const riskStatusEnum = pgEnum("risk_status", ["open", "mitigated", "closed"]);
export const issueStatusEnum = pgEnum("issue_status", ["open", "resolved"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "in_review", "changes_requested", "done", "cancelled"]);
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", ["daily", "weekly", "monthly"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default("planning"),
  ownerId: uuid("owner_id").notNull().references(() => users.id), // the manager accountable for the project
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    roleOnProject: projectRoleEnum("role_on_project").notNull().default("member"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqProjectUser: unique("project_members_project_user_unique").on(t.projectId, t.userId) }),
);

export const projectMilestones = pgTable("project_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status", { enum: ["pending", "completed"] }).notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const projectRisks = pgTable("project_risks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  severity: severityEnum("severity").notNull().default("medium"),
  status: riskStatusEnum("status").notNull().default("open"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectIssues = pgTable("project_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  severity: severityEnum("severity").notNull().default("medium"),
  status: issueStatusEnum("status").notNull().default("open"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskTemplates = pgTable("task_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  defaultEstimateHours: numeric("default_estimate_hours", { precision: 6, scale: 2 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }), // nullable — personal/ad-hoc tasks are allowed
  parentTaskId: uuid("parent_task_id"), // subtasks — self-reference, no FK constraint to keep Drizzle table definition simple; validated in code
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: uuid("assignee_id").references(() => users.id),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  status: taskStatusEnum("status").notNull().default("todo"),
  estimateHours: numeric("estimate_hours", { precision: 6, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskRecurrences = pgTable("task_recurrences", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateTaskId: uuid("template_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  frequency: recurrenceFrequencyEnum("frequency").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const taskAttachments = pgTable("task_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // placeholder — see earlier phases' note on deferred object storage
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskTimeEntries = pgTable("task_time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Activity timeline — every status transition and key event on a task.
export const taskEvents = pgTable("task_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // e.g. "status_change", "comment", "attachment_added"
  fromStatus: taskStatusEnum("from_status"),
  toStatus: taskStatusEnum("to_status"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Phase 10 schema: moderated communication. Scoping decisions recorded
 * here + docs/decisions.md:
 *
 * - REAL-TIME DELIVERY IS NOT IMPLEMENTED. The plan asks for
 *   "permission-aware real-time delivery with reconnect handling and
 *   message ordering." This stack has no WebSocket/SSE server and adding
 *   one is a meaningfully different runtime shape (persistent connections,
 *   a pub/sub layer) that can't be responsibly bolted on and verified in
 *   this pass. What IS built: every message gets a server-assigned
 *   monotonic seqNumber (a single global identity column across the whole
 *   messages table — NOT reset per channel/conversation), so
 *   ordering is well-defined regardless of transport — a client can poll
 *   `GET .../messages?afterSeq=N` today, and a future WebSocket layer can
 *   push the exact same ordered rows without a data model change.
 * - Malware scanning is a STUB — `malwareScanStatus` starts at "pending"
 *   and a scan function immediately marks it "clean" (see
 *   chat/attachments.ts). This is the named "integration point" the plan
 *   asks for, not a real scanner.
 * - Messages belong to EITHER a channel OR a private conversation, never
 *   both — enforced in application code (see chat/messages-routes.ts),
 *   not a DB constraint (Drizzle doesn't express XOR constraints
 *   declaratively here).
 * - Presence is a simple `users.lastSeenAt` heartbeat, not a real
 *   connection-tracking presence system (which would need the WebSocket
 *   layer above to exist first).
 */

export const channelTypeEnum = pgEnum("channel_type", ["public", "announcement"]);
export const channelMemberRoleEnum = pgEnum("channel_member_role", ["owner", "moderator", "member"]);
export const messageReportStatusEnum = pgEnum("message_report_status", ["open", "reviewed", "dismissed"]);
export const malwareScanStatusEnum = pgEnum("malware_scan_status", ["pending", "clean", "flagged"]);

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: channelTypeEnum("type").notNull().default("public"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelMembers = pgTable(
  "channel_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: channelMemberRoleEnum("role").notNull().default("member"),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqChannelUser: unique("channel_members_channel_user_unique").on(t.channelId, t.userId) }),
);

export const channelBans = pgTable(
  "channel_bans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    bannedBy: uuid("banned_by").notNull().references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqChannelUser: unique("channel_bans_channel_user_unique").on(t.channelId, t.userId) }),
);

export const privateConversations = pgTable("private_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id").notNull().references(() => privateConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.conversationId, t.userId] }) }),
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  seqNumber: integer("seq_number").generatedAlwaysAsIdentity(), // global monotonic ordering — see module comment above
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => privateConversations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  replyToMessageId: uuid("reply_to_message_id"),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Full edit/delete history — every prior version of a message's body, kept
// even after an edit or delete so moderation can see what was actually said.
export const messageRevisions = pgTable("message_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  revisionType: text("revision_type", { enum: ["original", "edit", "delete"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageMentions = pgTable("message_mentions", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  mentionedUserId: uuid("mentioned_user_id").notNull().references(() => users.id),
});

export const messageAttachments = pgTable("message_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // placeholder — see earlier phases' note on deferred object storage
  fileSizeBytes: integer("file_size_bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  malwareScanStatus: malwareScanStatusEnum("malware_scan_status").notNull().default("pending"),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageReports = pgTable("message_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  reportedBy: uuid("reported_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: messageReportStatusEnum("status").notNull().default("open"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-user, per-channel-or-conversation read pointer. Exactly one of
// channelId/conversationId is set per row (app-enforced, same pattern as
// messages above).
export const readStates = pgTable("read_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => privateConversations.id, { onDelete: "cascade" }),
  lastReadSeq: integer("last_read_seq").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Phase 11 schema: reporting and administration. Scoping decisions
 * recorded here + docs/decisions.md:
 *
 * - NO payment or email-job reporting tables here. The plan asks for
 *   payment and email-job reports and a payment/gateway reconciliation
 *   report, but Phase 5 (Cashfree) and Phase 9 (real email/outbox) were
 *   never built in this priority order (4, 8, 6, 7, 10, 11 — 5 and 9
 *   were skipped). Building reconciliation logic against data that
 *   doesn't exist would mean either faking rows or writing dead code
 *   against tables with nothing in them. Those two reports are simply
 *   not implemented; the report endpoints that DO exist cover every
 *   other phase that's actually been built.
 * - Export jobs genuinely generate CSV synchronously (real data, real
 *   file, returned immediately). XLSX/PDF are schema-ready (the enum
 *   includes them) but return a clear "not implemented" response rather
 *   than fake success — no xlsx/pdf generation library is wired in.
 * - "Rules" (from "departments, designations, skills, technologies,
 *   employee types, rules, templates...") is too undefined to build
 *   without a real spec of what a "rule" is in this system — not
 *   implemented, flagged rather than guessed at.
 * - Bulk actions: ONE concrete bulk action is implemented (bulk
 *   application status transition) rather than a generic bulk-action
 *   framework, since building a truly generic one is its own project.
 *   Preview (dry-run) and partial-success are real; each item transitions
 *   in its own independent small transaction, so "rollback" is
 *   per-item-atomic rather than all-or-nothing across the whole batch —
 *   an all-or-nothing rollback would actually contradict the
 *   "partial-success report" requirement, so per-item atomicity is the
 *   correct resolution of that tension, not a shortcut.
 */

export const exportFormatEnum = pgEnum("export_format", ["csv", "xlsx", "pdf"]);
export const exportJobStatusEnum = pgEnum("export_job_status", ["completed", "failed", "not_implemented"]);

export const savedReportViews = pgTable("saved_report_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  reportKey: text("report_key").notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  reportKey: text("report_key").notNull(),
  format: exportFormatEnum("format").notNull(),
  filters: jsonb("filters").notNull().default({}),
  status: exportJobStatusEnum("status").notNull(),
  rowCount: integer("row_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
