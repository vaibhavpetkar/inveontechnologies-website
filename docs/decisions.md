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

