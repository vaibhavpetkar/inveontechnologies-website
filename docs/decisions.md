# Decision Log — Inveon Portal

Recorded per the project plan's instruction: the AI must not silently invent these; they are fixed here for Phase 0 and revisited only with an explicit new decision entry (never edited in place).

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Initial release scope | Auth → Opportunities → Applications → Assessments → Admin review → Onboarding. Defer chat, attendance, payroll, advanced analytics. | Matches the reviewed plan's vertical-slice MVP recommendation. |
| 2 | Repo layout | New top-level `portal-frontend/` and `portal-backend/` folders in this repo, alongside the existing marketing site (`src/`). Not a separate repo. | Keeps one source of truth, one CI history, easy to reason about while small. Can be split out later if needed. |
| 3 | Architecture | Modular monolith inside `portal-backend` (modules: auth, opportunities, applications, assessments, onboarding, shared). | Avoids premature microservice complexity; matches plan recommendation. |
| 4 | Frontend stack | React + Vite + TypeScript, same UI kit conventions as the marketing site (Radix + Tailwind) for visual consistency. | Reuses team familiarity and design tokens already in this repo. |
| 5 | Backend stack | Node.js + Express + TypeScript. | Lightweight, matches the Node-based Docker build already used for the marketing site; team can maintain one runtime. |
| 6 | Database | PostgreSQL, UUID primary keys, migrations via a migration tool (Drizzle or Prisma — final pick in Phase 1), separate human-readable business IDs (e.g. `APP-2026-00042`) from internal UUIDs. | Matches plan requirement; relational integrity needed for applications/assessments/payments. |
| 7 | Auth | Server-side sessions or short-lived access token + rotating refresh token; MFA (TOTP) required for HR/Admin/Super Admin. | Matches plan; balances security and simplicity for MVP. |
| 8 | Domain | `portal.inveontechnologies.in`, new dedicated subdomain (user decision, confirmed). | Keeps portal isolated from the marketing site and the existing `crm.` / `api.` subdomains; simplest cert and routing story. |
| 9 | Deployment | New `portal-frontend` and `portal-backend` containers on the existing `crm_crm_network`, reverse-proxied by the existing shared nginx container — same pattern as `crm_frontend` / `crm_backend`. | Reuses working infrastructure instead of introducing a second reverse proxy or TLS story. |
| 10 | Payments | Cashfree, server-side order creation, signed webhook verification, sandbox first. Deferred to its own phase (Phase 5 in the roadmap) — **not** part of this skeleton. | Matches plan; payments should not be built before the non-payment flow is proven. |
| 11 | Email | Mailcow SMTP, templated, queued, retried. Deferred to its own phase (Phase 9) — **not** part of this skeleton. | Same reasoning as payments. |
| 12 | Multi-tenancy | Single-company system. No tenant_id partitioning in Phase 0/1. | Matches plan; avoids unneeded complexity. |
| 13 | What ships in this Phase 0 | Documentation + non-functional project skeleton (folder structure, health-check endpoints, build/Docker config, CI-ready structure). No business logic, no database schema beyond a placeholder migration folder. | Matches the plan's own instruction: "Phase 0 — do not implement feature code yet." |

## Open decisions for you to confirm before Phase 1 starts

**Status: proceeded on defaults below since you said "go with next phase" without objecting to any of them. All are still overridable — say so and I'll adjust.**

1. **Migration tool**: ~~Drizzle ORM or Prisma?~~ → **Decided: Drizzle** (implemented).
2. **Where does Postgres run?** ~~New container vs existing server~~ → **Decided: new `portal-postgres` container**, dedicated `portal` DB/user, on an internal-only `portal_internal` Docker network (not exposed to host or to `crm_crm_network`) — only `portal-backend` can reach it.
3. **Roles**: ~~confirm/trim~~ → **Decided: kept the full list** (Candidate, Intern, Employee, Manager, HR, Admin, Super Admin) as a Postgres enum. Trimming later is a migration, not a rewrite, so this is low-cost to revisit.
4. **Email/OTP**: ~~stub or real~~ → **Decided: stubbed.** Verification and password-reset links are logged (`[EMAIL STUB]` in server logs) instead of emailed, until Phase 9 (Mailcow). The call sites (`auth/routes.ts`) already isolate this behind `auth/email-stub.ts` so swapping in real Mailcow sending later doesn't touch route logic.

## Phase 1 — what shipped

Implemented, typechecked, and verified end-to-end against a real local Postgres instance (not just "should work" — actually run):

- Env validation (fails fast on missing `PORTAL_DATABASE_URL` / `PORTAL_JWT_SECRET` / `PORTAL_REFRESH_SECRET`)
- Drizzle schema + generated migration: `users`, `refresh_tokens`, `verification_tokens`, `audit_logs`
- Registration (with user-enumeration-safe responses), email verification (stubbed), login, logout
- Access token (JWT, 15 min) + rotating refresh token (opaque, hashed at rest, httpOnly cookie scoped to `/api/v1/auth`)
- **Refresh-token reuse detection**: if an already-rotated token is presented again, every active session for that user is revoked (tested — see below)
- Account lockout after 5 failed logins (15 min), tested live
- Forgot/reset password (stubbed email, resets revoke all sessions)
- `requireAuth` / `requireRole` middleware enforcing the permission matrix server-side
- Rate limiting on all auth endpoints (tested — 429 after 10 requests/15min)
- Audit log entries written for register, verify, login, login-failed, reuse-detected, password-reset (confirmed rows in DB)
- `portal-postgres` added to `docker-compose.yml` on a new internal-only network

### Verified live (not just typechecked)
Register → verify-email → login → `/me` → refresh (rotates cookie) → replay old cookie (correctly revoked, "Session revoked") → 5x wrong password (locks account, 6th attempt rejected as `ACCOUNT_LOCKED` even with correct password) → rate limiter trips at request #10.

### Known limitations / explicitly deferred
- MFA (TOTP) for HR/Admin/Super Admin — not yet implemented, flagged as a requirement in `permissions.md`, will land before those roles are used for anything sensitive.
- No `/api/v1/users` admin endpoints yet (list/edit users, change roles) — Phase 1 only covers self-service auth.
- Real email sending — Phase 9.
- Seed script (`npm run db:seed`) creates a Super Admin from env vars but there's no CLI/UI yet to promote other users to privileged roles — direct DB access or a future admin endpoint is the only way for now.

## Phase 2 — what shipped

Verified live end-to-end against real local Postgres (register → verify → complete profile → apply → duplicate-blocked → admin pipeline transitions → timeline → withdraw → cross-user 403s):

- Opportunities: create (draft), edit, publish, archive — draft/archived hidden from non-privileged callers, enforced server-side via `optionalAuth`
- Skills taxonomy: freeform tag input auto-creates/reuses `skills` rows (dedup by slug)
- Candidate profile: name/phone/bio/degree/graduationYear/cgpa + skills; `profileCompleted` gate blocks applying until name+phone are set
- Eligibility: configurable per-opportunity JSON criteria (minCgpa/degrees/maxGraduationYear), checked at apply time as a **soft warning**, not a hard block (documented scoping decision — automated checks can't see legitimate context a human reviewer might)
- Applications: apply, list mine, get one, withdraw — DB-level unique constraint on (user, opportunity) prevents duplicates even under a race, not just an app-level check
- Admin pipeline: list applications per opportunity (filterable by status), transition endpoint enforcing the exact state machine in `state-machines.md` — verified both valid chains and invalid/terminal-state rejections
- Every transition writes an `application_events` row (actor, from, to, note, timestamp) — full timeline verified via API
- Human-readable business IDs (`OPP-2026-00001`, `APP-2026-00001`) generated transactionally from a DB identity sequence, not a naive counter prone to races

**Scoping decision**: `application_status` enum includes `assessment_invited`/`assessment_completed` (reserved) so Phase 3 won't need an enum migration, but no transitions reach them yet — Phase 2's pipeline only goes submitted → under_review → shortlisted → selected/rejected, plus withdrawn. Phase 3 adds the assessment states as an insertion into this chain, not a redesign.

**Known limitations / explicitly deferred**:
- No resume/file upload yet — `resumeUrl` column exists but is unused until the private object storage phase
- Eligibility check is soft (warns, doesn't block) — flip to hard-block is a one-line change in `applications/routes.ts` if you want it enforced instead
- Manager role has no team-scoping yet (`manager` can see/transition any application in the pipeline, not just "their team's") — the plan calls for team scoping later; deferring until org/team structure exists
- No opportunity edit history / diffing, just an audit log entry per edit

## Phase 3 — what shipped

MCQ-based assessment engine, wired into the exact `assessment_invited`/`assessment_completed` states Phase 2 reserved. Verified live end-to-end (not just typechecked): create assessment → answer-key validated at creation → invite → application transitions to `assessment_invited` → candidate starts (gets questions, never sees correct answers) → submits → auto-scored → application **automatically** transitions to `assessment_completed` (system-triggered, not an admin action) → admin reviews full answer breakdown → admin moves to `shortlisted` → full timeline confirmed accurate.

- One assessment belongs to one opportunity (not a reusable template library) — documented scoping decision, see schema.ts
- One attempt per application, DB-enforced (unique constraint on `applicationId`)
- Auto-scoring is a pure function (`assessments/scoring.ts`) shared by both the normal submit path and the expiry path, so they can't drift out of sync
- **Lazy expiry** (no cron/scheduler in this stack): an in-progress attempt past its `expiresAt` is finalized the next time anything reads it (candidate GET, or submit attempt) — scored with unanswered questions counted as incorrect, then the application auto-transitions just like a normal submission. **Verified live**: forced an attempt's `expiresAt` into the past via direct DB update, then GET'd it — attempt correctly resolved to `expired`/scored 0%, application correctly moved to `assessment_completed`. An attempt nobody ever looks at again after expiring will sit as `in_progress` indefinitely — a real background sweep can be added later without a schema change.
- The generic admin `/transition` endpoint deliberately cannot reach `assessment_invited` or `assessment_completed` — those go through the dedicated invite endpoint and the system-triggered path respectively, keeping "who/what causes this transition" unambiguous at the call site
- Admins can still reject an `assessment_invited` application directly (e.g. no-show, suspected cheating) without waiting for the attempt to resolve

**Known limitations / explicitly deferred**:
- MCQ only — free-text/manually-graded questions are a later phase
- No partial credit / negative marking — each question is all-or-nothing at its point value
- No proctoring, tab-switch detection, or plagiarism checks
- Lazy expiry only (see above) — a background sweep for attempts nobody revisits is a nice-to-have, not built
- Assessment templates aren't reusable across opportunities in this MVP shape

## Phase 4 — what shipped

Recruitment operations: document requests, interviews, offers, onboarding checklist. All four deliberately live **outside** the `applications.status` enum (documented in schema.ts) rather than adding more states — an application sits at `selected` while these run. Verified live end-to-end: document request → candidate upload → admin verify; interview schedule → reschedule → feedback (with decision + scorecard) → re-feedback correctly blocked; offer draft (HR) → send blocked when drafter tries it themselves → send succeeds from a different privileged user → candidate can't see the draft before it's sent → candidate accepts; onboarding tasks created → candidate completes one → list reflects both states correctly.

- **Documents**: metadata/status tracking only — `fileUrl` is a placeholder text column (same pattern as `candidateProfiles.resumeUrl`), no real object storage yet (documented, consistent with earlier phases)
- **Interviews**: schedule/reschedule/no-show/cancel/feedback, with a scorecard as freeform JSON. Candidates see scheduling info but never feedback/scorecard/decision (filtered server-side, not just hidden in a UI)
- **Offers**: versioned (a reissue is a new row, `version+1` — a sent offer's content is never mutated), with **separation of duties enforced server-side**: whoever drafts an offer cannot also send it (`generatedBy !== approvedBy`, checked in code, verified live with a 403). Lazy expiry on `acceptanceDeadline`, same pattern as assessment attempts.
- **Onboarding checklist**: simple task list (policy_consent/emergency_contact/document/custom types), gated on the application being `selected`, completable by the candidate or a privileged reviewer

**Known limitations / explicitly deferred**:
- Interview scorecard is unstructured JSON, not a defined rubric schema — fine for MVP, a real rubric builder is future work
- No calendar integration (Google Calendar/Outlook) — `meetingUrl` is just a plain link the admin pastes in
- Offer content is a plain text blob, not a templated/merge-field system — each offer is hand-written per application for now
- No role-promotion endpoint yet — promoting a user to HR/Admin/etc. still requires direct DB access (same limitation flagged in Phase 1); used a direct SQL update to test the offer separation-of-duties flow
## Phase 8 — what shipped

Courses, modules, lessons, enrollment/progress, and certificates. Verified live end-to-end against real local Postgres, including every case the plan explicitly asked for tests on:

- **Course structure**: courses (draft/published/archived) → modules → lessons (video/document/assignment/test), prerequisites (a course can require another be completed first, checked at enroll time)
- **Enrollment gating**: verified — enrolling before publish correctly 404s; enrolling twice correctly 409s (`ALREADY_ENROLLED`, DB-enforced unique constraint)
- **Progress & auto-completion**: video/document/assignment lessons are self-reported complete by the learner; `test` lessons are explicitly rejected from self-report (`USE_GRADE_ENDPOINT`) and must be graded pass/fail by a privileged reviewer. Once every required lesson is done (and passed, for tests), the enrollment **auto-completes** — verified live.
- **Certificates — every required test case verified**:
  - *Incomplete-course denial*: issuing before the enrollment was `completed` correctly 400s
  - *Duplicate-issue prevention*: issuing a second active certificate for the same user+course correctly 409s
  - *Verification*: public `GET /certificates/verify/:verificationCode` (no auth) correctly returns `valid`/`status`/course/recipient for a real code, and a clean "not found" for a bogus one
  - *Revocation*: correctly flips `status`, records `revokedBy`/`revokedAt`/`revokeReason`; re-revoking an already-revoked certificate correctly 400s; public verify immediately reflects `valid: false` after revoke
  - *Reissue*: creates a **new** row (`version` via a fresh `INV-CERT-2026-######` business ID) linked back via `supersedesCertificateId`, while the original is separately revoked with reason "Superseded by reissue: ..." — the old certificate's content is never mutated
- **Two identifiers by design**: `businessId` (sequential, human-readable, for display) and `verificationCode` (random, unguessable, the actual public lookup key) — a sequential ID alone would make every other certificate's code trivially guessable
- **Transaction-safe issue**: insert + businessId assignment + audit log commit together in one DB transaction, per the plan's requirement
- Issuance logs a stubbed "certificate issued" notification (same pattern as every other stubbed email in this codebase) — the plan's "email outbox event" doesn't have a real outbox to land in yet (that's Phase 9)

**Known limitations / explicitly deferred**:
- No real PDF generation — `snapshotContent` is the immutable rendered text a PDF renderer would need; actually producing a downloadable PDF file is future work
- "Test" lessons do NOT reuse the Phase 3 assessment engine (that engine is application-scoped, not lesson-scoped) — course tests are pass/fail marked by a reviewer, not auto-scored MCQ. Unifying these into one "gradable thing" abstraction is a real refactor, not done here.
- `recipientName` on certificates falls back to email since `candidateProfiles.fullName` isn't joined in — cosmetic gap, easy follow-up
- No lesson-level file/video hosting — `contentUrl` is a placeholder, same pattern as every other file reference in this codebase so far
## Phase 6 — what shipped

Employee/intern onboarding and portal. Verified live end-to-end against real local Postgres, including both required tests from the plan: employees cannot access another employee's private data, and unauthorized users cannot generate or download letters.

- **Authorized selection-to-onboarding workflow, enforced not assumed**: creating an employee record requires the application to be `selected` **and** have an **accepted** offer — verified live (attempting without an accepted offer correctly 400s `OFFER_NOT_ACCEPTED`)
- **Real portal transition, not just a new row**: creating the employee record also updates the underlying `users.role` (intern→`intern`, full_time/contract→`employee`) in the same transaction as the `INV-EMP-######` business ID assignment — verified live by re-logging in and confirming the JWT now carries the new role
- **Duplicate prevention**: one application can only ever produce one employee record (DB-unique on `applicationId`) — verified live, second attempt correctly 409s
- **Application history preserved**: `employees.applicationId` links back; nothing about the original application is touched or deleted
- **Protected documents & letters — self + HR/Admin/Super Admin ONLY, explicitly not Manager**: verified live with a second, unrelated candidate account correctly getting 403 on both an employee's documents and their employee record; an unauthorized (candidate-role) user correctly 403s trying to generate or download a letter
- **Access activation is a real gate**: the employee dashboard endpoint 403s (`ACCESS_NOT_ACTIVATED`) until a privileged user explicitly activates access — which itself is blocked (`ONBOARDING_INCOMPLETE`) until all required onboarding tasks are done. Verified live: dashboard blocked → task completed → activation blocked-then-allowed → dashboard now works.
- **Letters are versioned and immutable**: regenerating a joining letter creates version 2, not an edit to version 1 — verified live. Every download is audit-logged (confirmed real rows in `audit_logs`), and a template/letter-type mismatch is rejected at generation time.

**Known limitations / explicitly deferred**:
- No real PDF generation for letters — `content` is the immutable rendered text, same "renderer input, not renderer output" pattern as certificates in Phase 8
- No `authorized signatory` registry/validation — `signatoryName`/`signatoryTitle` are free text typed by whoever generates the letter, not checked against a list of people actually authorized to sign
- Manager role has no read access to their direct reports' employee records in this phase (deliberately, per "protected") — a future phase could add a narrower manager view (e.g. name/department/status only, never documents/letters) if the business wants that
- `employeeOnboardingTasks` is a separate table from the Phase 4 application-scoped `onboardingTasks` by design (see schema.ts) — the two are not merged
## Phase 7 — what shipped

Projects, tasks/subtasks, and growth metrics. Verified live against real local Postgres — and this phase's live testing caught two real bugs before they shipped, both fixed and re-verified:

**Bug found and fixed — self-approval hole**: the task review-transition check originally used `canAccessProject` (true for any project member) to decide who could approve a task, which meant a plain team member — including the task's own assignee — could move their own task `in_review → done` themselves. Live testing caught this (Jack, a regular member, successfully self-approved). Fixed by switching to `canManageProject` (project lead/owner/privileged/task-creator only) for the reviewer check. Re-tested live: a plain member's self-approval now correctly 400s; only a lead/creator/privileged user can approve.

**Bug found and fixed — route shadowing**: `GET /tasks/:id` was registered before the literal routes `GET /tasks/templates` and `GET /tasks/workload`, so Express matched those literal paths to `/:id` first and tried to query the DB with `id = "templates"`, failing a uuid cast (500 error). Caught live. Fixed by moving `/:id` and `/:id`-adjacent single-segment routes to register after every literal single-segment path — noted inline in the code as a reminder for any future routes added to this router.

**What's implemented**:
- Projects: status, ownership, membership (lead/member roles), milestones, risks, issues — access is member-or-owner-or-privileged (`canAccessProject`), management actions (edit, add milestones, resolve risks/issues) require lead-or-owner-or-privileged (`canManageProject`) — verified live that an unrelated user is correctly 403'd from a project they're not on
- Tasks: full state machine (`todo → in_progress → in_review → done`, with `changes_requested` looping back, `cancelled` reachable from active states) — verified live through a complete review cycle including a change-request round-trip
- Subtasks (self-referencing `parentTaskId`, validated to exist), task templates, and manually-triggered recurrence (no scheduler in this stack — same documented limitation as assessment/offer lazy expiry; `generate-next` is an explicit privileged call, gated correctly on `nextRunAt`, verified live both for the "due" and "not yet due" cases)
- Comments, attachments (metadata-only, same placeholder pattern as every other file reference in this codebase), time entries (assignee-only, roll up into `task.actualHours` automatically)
- Full activity timeline per task (create, status changes, comments, attachments all logged)
- Personal dashboard (`/tasks/me/dashboard`), manager workload view (`/tasks/workload`), and a **growth metrics endpoint** that pulls together tasks, course enrollments, assessment results, and certificates across every earlier phase into one read — genuinely exercises the whole system's data, not just this phase's own tables

**Known limitations / explicitly deferred**:
- Due-date reminders/escalation are logged (`[NOTIFICATION STUB]`), not sent — no real outbox exists yet (Phase 9)
- Manager/growth-metrics access is role-based, not team-scoped (any `manager` can view any user's growth metrics) — same deferred team-scoping limitation flagged in earlier phases
- File attachments are metadata-only, no real object storage (consistent with every prior phase)
- Recurrence has no scheduler — generation is a manual privileged call, not automatic
## Phase 10 — what shipped

Moderated communication: communities/channels/membership, private conversations, messages with replies/edit-delete history/pinning/mentions, reports, mute/ban, attachment validation with a malware-scan integration point, per-user rate limiting, and lightweight presence. Verified live end-to-end, including the plan's required security/abuse-prevention checks.

**Scoping decision — real-time delivery is NOT implemented.** The plan asks for "permission-aware real-time delivery with reconnect handling." This stack has no WebSocket/SSE server, and adding one is a genuinely different runtime shape (persistent connections, a pub/sub layer) that couldn't be responsibly built and verified in this pass alongside everything else. What's built instead: every message gets a server-assigned monotonic `seqNumber` (a single global identity column, not reset per channel/conversation — confirmed correct ordering works across a channel and a DM sharing the same counter), so a client can poll `GET /messages?afterSeq=N` today, and a future WebSocket layer could push the exact same ordered rows without any data model change. This is the same kind of honest scoping call as the "no cron" limitation repeated through earlier phases, not a silent omission.

**Verified live**:
- Posting before joining a channel correctly 403s; joining then posting succeeds
- Announcement-channel posting restricted to owner/moderator/privileged
- Edit history preserves every version (original + edit rows, both retrievable)
- Only the author can edit; only author-or-moderator can delete; deleting shows a `[message deleted]` tombstone in listings rather than actually erasing the row (so history/audit stays intact) — confirmed the reply that referenced the deleted message still points at it correctly
- Re-deleting an already-deleted message correctly 400s
- Pinning is moderator-only — a plain member correctly 403s
- Message reporting + moderator review queue (open → resolved/dismissed) works, non-privileged users correctly 403 from the reports list
- Attachment validation is real, not just a stub: oversized files and disallowed MIME types are both rejected with real checks before the malware-scan stub even runs
- Mute is enforced at send-time (a muted member's post correctly 403s with the mute expiry shown); ban removes membership and blocks rejoining
- DM isolation: a non-participant correctly 403s trying to read a private conversation; starting a DM with the same participant set twice returns the existing conversation rather than duplicating it
- **Rate limiting is keyed per-user, not per-IP** — verified with a legitimate member hitting exactly 30 successful posts then 429s on the 31st; also verified the limiter still throttles a user making invalid (403-rejected) requests, since it runs before the handler logic
- **Chat isolation from recruitment/payments verified by construction**, not just intention: grepped the entire `chat/` module for any reference to `applications`, `employees`, `offers`, or `opportunities` tables — zero matches. Chat only ever touches `users`.

**Known limitations / explicitly deferred**:
- No real-time delivery (see scoping decision above) — REST + poll only
- Malware scanning is a stub that always returns "clean" — the real size/MIME-type checks are genuine, but actual file-content scanning isn't integrated
- Presence is a simple `lastSeenAt` heartbeat (2-minute online window), not real connection tracking — would need the WebSocket layer above to exist first
- Search across messages (permission-aware, retention-respecting) is not implemented in this pass — the ordered, paginated list endpoint exists but there's no full-text search yet
- No retention/auto-purge policy implemented — messages persist indefinitely
