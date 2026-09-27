# LMS + Employee Management Roadmap

Goal (from the project brief): one portal where people **enroll in courses or internship programs**, take **quizzes and exams**, and where staff **manage employees, assign tasks, onboard new users automatically**, schedule **Google Meet / Zoom meetings** on a shared **calendar**, and everyone gets **notifications** — all in a dynamic, animated UI.

This doc maps that goal against what `portal-backend` and `portal-frontend` already contain (surveyed at commit `55e407d`), then lays out the build order.

## 1. The short version

- **The backend is ~70% of the way there.** Phases 1–4, 6, 7, 8, 10 and 11 in `docs/decisions.md` shipped real APIs for courses, lessons, enrollments, certificates, MCQ assessments, recruitment, employee records, onboarding checklists, projects, tasks, chat and reports.
- **The frontend is ~15% of the way there.** It has login/register, the candidate journey (opportunities → apply → exam → course) and three thin dashboards. There is **no staff UI** for tasks, employees, courses, onboarding or reports beyond a recruitment summary and the Team accounts panel.
- **Four things don't exist at all:** in-app notifications, a scheduler (everything expires "lazily"), calendar/meetings, and an "internship program" as something you enroll in.
- **The UI has no design system or animation.** `portal-frontend` is plain CSS (`styles.css`, 474 lines) with React + wouter only — no component kit, no motion library.

So the fastest route to the goal is **UI-first on top of existing APIs**, adding the missing backend pieces (notifications, scheduler, calendar) as they're needed.

## 2. What exists vs. what's missing

| Goal area | Backend today | Frontend today | Missing |
|---|---|---|---|
| Course enrollment | Courses, modules, lessons (video/document/assignment/test), enroll, progress, completion, payment gate + 2-day grace | Catalog + course detail pages (candidate) | Lesson player (embedded video), progress visuals, **course authoring UI for staff** |
| Internship program enrollment | Opportunities + applications pipeline (apply → assess → shortlist → select → offer) | Browse + apply | Opportunities have **no type** (internship vs job), no duration/stipend/batch fields; "enroll in internship" is really "apply" — needs a program + cohort concept |
| Quizzes | Lesson "test" type is **reviewer-graded pass/fail**, not auto-scored | – | Auto-graded lesson quizzes (reuse the MCQ engine from `assessments/`) |
| Exams | Timed MCQ attempts, auto-scoring, lazy expiry | Take-assessment page | Resume after reload (known gap), question bank / authoring UI, free-text questions |
| Employee management | Employee records, departments, designations, documents, letters (versioned), access activation | "Your workspace" shows 4 fields | **Staff employee directory**, profile pages, document review, letter generation UI |
| Task assignment | Full task state machine, subtasks, templates, comments, time entries, workload, growth metrics | **None** | Kanban board, "assign task" form, My tasks, manager workload view |
| Automatic onboarding | Onboarding checklist (application-scoped) + employee onboarding tasks + activation gate — all **manually triggered** by HR | – | Auto-create employee on offer accepted, auto-apply checklist templates, welcome email with set-password link, CSV bulk invite |
| Notifications | `notification_preferences` table only; emails are real via SMTP (`shared/mailer.ts`) when configured; task reminders are `[NOTIFICATION STUB]` logs | – | `notifications` table, bell + unread count, live push (SSE), email templates for each event |
| Calendar | – | – | `calendar_events` table fed by interviews, meetings, exam windows, task due dates, class sessions; month/week UI; `.ics` invites |
| Google Meet / Zoom | Interviews have a plain `meetingUrl` text field | – | Provider integration that creates the meeting and returns the join link |
| Background jobs | None (lazy expiry everywhere, recurrence is a manual call) | – | A job runner for reminders, expiries, recurring tasks, digest emails |
| Animated dynamic UI | – | Plain CSS | Design system, app shell with sidebar, motion, toasts, skeletons, dark mode |

## 3. Build phases

Each phase is one or two PRs, shippable on its own, and ends with the feature usable in production.

### Phase A — UI foundation + Tasks (first PR, see §4) — done
- Add **Tailwind + Radix** (matches decision #4 and the marketing site) and **Framer Motion** to `portal-frontend`.
- New **app shell**: collapsible sidebar with role-based nav, top bar, page transitions, toasts, skeleton loaders, empty states, dark mode.
- **Tasks**: Kanban board with drag between columns (calls the existing `/tasks/:id/transition`), task drawer with comments/timeline/time entries, **Assign task** form for managers/HR, **My tasks** for employees and interns.
- Uses only APIs that already exist — no migration.

### Phase B — Notifications + job runner
- `notifications` table (user, type, title, body, link, readAt) and a `notify()` helper that writes in-app + sends email per the user's `notification_preferences`.
- Live delivery with **Server-Sent Events** (no new infra; Redis already exists for Events if fan-out is needed later).
- Bell with unread badge and animated dropdown; notifications page.
- **Job runner** (`pg-boss` on the existing Postgres — no new service): task due reminders, recurring task generation, assessment/offer/payment expiry sweeps, daily digest.
- Replace every `[NOTIFICATION STUB]` log with a real `notify()` call.

**Built:** `notifications` + `jobs` tables, `notify()` in `modules/notifications/service.ts`, SSE at `GET /api/v1/notifications/stream`, bell dropdown in the top bar. The job runner is a small queue on the `jobs` table (`modules/shared/jobs.ts`, `FOR UPDATE SKIP LOCKED`) instead of pg-boss: it needs no extra schema and its email log is readable at `GET /reports/email-jobs`. Periodic work: task due/overdue reminders and recurring-task generation. Assessment/offer expiry stays lazy (checked on read) and the daily digest is not built.

### Phase C — Automatic onboarding + employee management UI
- On **offer accepted**: create the employee record, apply an onboarding **checklist template** for the employee type, and email a welcome message with a set-password link — no HR click needed. HR can still review and activate.
- **Invite users** directly (staff, or a CSV of interns) → account created, role set, invite email, onboarding checklist attached.
- **Employee directory** (search, filters by department/status), employee profile page with documents, letters and onboarding progress; **onboarding tracker** board for HR.
- Manager team scoping (a manager sees their direct reports) — flagged as deferred in phases 2, 6 and 7.

**Built:** accepting an offer that carries structured terms (type + joining date) creates the employee record, sets the portal role and seeds the default checklist (`employees/onboarding.ts`); without terms, HR is notified to onboard by hand. `/api/v1/people` gives the directory (managers see their direct reports), single and CSV invites with a dry-run preview, and HR edits. The People page, invite dialog and the joiner's own checklist are in the portal. HR is told when a joiner finishes the required steps; activation completes the last one.

### Phase D — LMS experience
- **Internship programs**: add `type` (internship / job / program), duration, stipend, start date and cohort to opportunities; a program page with **Enroll** that runs the existing application pipeline and, once selected, auto-enrolls the intern in the program's courses.
- **Course authoring UI** for staff (modules, lessons, drag-to-reorder, publish).
- **Lesson player**: embedded YouTube/Vimeo/Drive video, document viewer, progress ring, "next lesson" flow, confetti on completion.
- **Auto-graded quizzes** inside lessons by generalising the MCQ engine from application-scoped to "attempt for any owner" (the refactor flagged in Phase 8's limitations).
- **Exams**: question bank, exam resume after reload, result page with animated score breakdown.
- **Certificates as real PDFs** + public verify page (already exists).

### Phase E — Calendar + Google Meet / Zoom
- `calendar_events` (title, start, end, attendees, source, meeting provider, join URL) populated from interviews, meetings, exam windows, class sessions and task due dates.
- Calendar UI: month / week / agenda views, click-to-create meeting, attendee picker.
- **Meeting provider adapter** with three implementations:
  1. **Manual link** (paste any URL) — works today, no credentials.
  2. **Google Meet** via Google Calendar API (`conferenceData.createRequest`) — needs a Google Cloud project + OAuth consent; also puts the event in attendees' Google Calendars.
  3. **Zoom** via a Server-to-Server OAuth app — needs a Zoom account and app credentials.
- Every event also emails an `.ics` invite so it lands in any calendar app even without an integration.
- Reminder notifications 15 minutes before (Phase B job runner).

### Phase F — Deferred items (only if wanted)
Cashfree payments (decision #10 / Phase 5), attendance and leave, payroll, XLSX/PDF report exports, real file storage for resumes/documents/attachments (every file field is still a placeholder URL — this becomes urgent once people upload documents during onboarding, so it may move up into Phase C).

## 4. First PR to open

**"Portal UI foundation: animated app shell + task board"** (Phase A)

- `portal-frontend`: add Tailwind, Radix primitives, Framer Motion, lucide icons.
- `AppShell` replacing `DashboardShell`: sidebar nav per role (`lib/roles.ts`), animated route transitions, toast provider.
- Pages: `/tasks` (Kanban + list toggle), `/tasks/:id` drawer, assign-task dialog (staff roles), and task widgets on the employee and staff dashboards.
- No backend or migration changes; typecheck + build green in CI.

Why this first: it's pure upside on APIs that are already built and tested, it sets the look and feel every later phase reuses, and "assign tasks" is the most visible gap for staff today.

## 5. Decisions needed

1. **Meeting provider for Phase E** — Google Meet, Zoom, or both. Recommendation: Google Meet first, since it also syncs to Google Calendar; Zoom as a second adapter.
2. **Internship enrollment model** — is an internship always "apply and get selected", or can some programs be open self-enroll (possibly paid)? Default assumed here: both, controlled by a per-program `enrollmentMode` flag.
3. **File storage** — where uploaded documents should live (S3-compatible bucket, or a volume on the VPS). Needed before Phase C ships document uploads.

## 6. Branching

LMS work stays on its own branch, separate from other portal fixes (Vaibhav's request, 2026-09-27).

- A long-lived **`feature/lms`** branch is cut from `main` when Phase D starts.
- Every LMS PR (internship programs, course authoring, lesson player, quizzes, exams, certificates) branches from `feature/lms` and targets it, not `main`.
- Non-LMS work (Phase A UI foundation and tasks, notifications, onboarding, employee management, calendar) and ordinary portal fixes keep going to `main`.
- `main` is merged into `feature/lms` regularly so the shared UI foundation and fixes flow in. `feature/lms` merges back to `main` in one reviewed PR when the LMS is ready to ship.
