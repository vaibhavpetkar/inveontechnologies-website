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

These need your explicit answer — I'm not guessing them:

1. **Migration tool**: Drizzle ORM or Prisma? (Drizzle is lighter and closer to raw SQL; Prisma has a more batteries-included DX.)
2. **Where does Postgres run?** New container in this compose file, or does it point at an existing DB server you already run for the CRM?
3. **Who are your actual initial roles?** The plan suggests Candidate, Intern, Employee, Manager, HR, Admin, Super Admin — confirm or trim this list for MVP.
4. **Email/SMS for OTP or verification** — in scope for Phase 1 login, or can email verification be deferred until Phase 9 (Mailcow phase) lands? (Recommendation: stub it — log the link instead of sending — until Phase 9.)
