# Role & Permission Matrix — Phase 0

Roles per the reviewed plan. **Confirm or trim this list before Phase 1** (see open decision #3 in `decisions.md`) — shipping fewer roles for MVP is fine and recommended.

| Action | Candidate | Intern/Employee | Manager | HR | Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Register / log in | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View published opportunities | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit own application | ✅ | – | – | – | – | – |
| Withdraw own application | ✅ | – | – | – | – | – |
| View own assessment attempts | ✅ | – | – | – | – | – |
| Create/edit opportunities | – | – | – | ✅ | ✅ | ✅ |
| Publish/archive opportunities | – | – | – | – | ✅ | ✅ |
| View candidate pipeline | – | – | ✅ (own team) | ✅ | ✅ | ✅ |
| Move application stage | – | – | ✅ (own team) | ✅ | ✅ | ✅ |
| Approve/reject application | – | – | – | ✅ (recommend) | ✅ (approve) | ✅ |
| View own employee record | – | ✅ | ✅ | ✅ | ✅ | ✅ |
| View team's employee records | – | – | ✅ (own team) | ✅ | ✅ | ✅ |
| Edit any employee record | – | – | – | ✅ | ✅ | ✅ |
| Approve refunds/terminations/salary changes | – | – | – | – | ✅ (requires 2nd approver) | ✅ |
| View audit logs | – | – | – | – | ✅ | ✅ |
| Manage roles/permissions | – | – | – | – | – | ✅ |
| Manage MFA policy | – | – | – | – | – | ✅ |

## Enforcement rule

Every row above must be enforced **server-side**, on every request, independent of what the frontend shows or hides. The frontend matrix is for UX only (hiding buttons the user can't use) — it is never the source of truth for authorization.

## Sensitive-action rule (separation of duties)

Refunds, employee termination, salary/stipend changes, and certificate revocation require the action to be *proposed* by one privileged user and *approved* by a second — no single Admin account can both create and approve these alone. This is a Phase 4+/Phase 6+ concern but is recorded here now so the schema design in later phases accounts for a `proposed_by` / `approved_by` pair on those tables.

## Chat

| Action | Who |
| --- | --- |
| Open chat, DM, create groups, join channels | Staff and employees; candidates only while their program enrollment is on trial, paid or waived |
| Post in #announcements | Channel admins |
| Rename a group, add or remove people, make admins | Group admins (the creator starts as admin) |
| Leave a group or channel | Any member (not #announcements). When the last group admin leaves, the longest-standing member becomes admin |
| @mention | Only people who can open that chat get the alert |

## Files

Files are stored on the server (the `portal-uploads` volume, `PORTAL_UPLOAD_DIR`), never on a public URL. Uploads are checked by extension and by content, up to 10 MB each.

| File | Who can open it |
| --- | --- |
| Resume | The candidate, HR and admins, and staff who can view one of their applications |
| Requested application document | The candidate, whoever can view that application (the hiring team), HR and admins |
| Employee document | The employee, HR and admins |
| Task file | Anyone who can open the task. The person who added it, HR and admins can remove it |
| Chat file | Members of that chat |

## Attendance and leave

| Action | Who |
| --- | --- |
| Check in and out, ask for leave, cancel own leave | Anyone with an employee record (approved leave only before it starts) |
| See the team's day, approve or decline leave, mark present, half day or absent | Managers for their direct reports; HR and admins for everyone. Nobody decides their own leave |
| Cancel approved leave after it started | HR and admins |
| Add or remove holidays, set yearly paid leave | HR and admins |

Leave goes to the person's manager, or to HR when they have none. Weekends (Saturday and Sunday) and holidays don't count as leave days. Approved unpaid leave, and absences or half days no leave covers, become the loss-of-pay days on a new payslip draft.

## Reports

| Report | Who can open and download it (Excel, PDF or CSV) |
| --- | --- |
| Candidates, applications, exam results, attendance, leave, payroll, tasks, projects, courses, course certificates | HR, admin, super admin |
| Employees, audit log | Admin, super admin |

Every download is recorded in the export log (admins see it at `GET /api/v1/reports/export/jobs`). PDFs stop at 2000 rows; Excel and CSV hold everything.

## Live classes

| Action | Who |
| --- | --- |
| Schedule a live class for a course (once or weekly) | Managers, HR and admins |
| Change or cancel a class, or the rest of a weekly series | The person who scheduled it; admins |
| See a course's classes and join them | Everyone enrolled in the course (their invite is added automatically, also when they enroll later) |

## GitHub issues on tasks

| Action | Who |
| --- | --- |
| Open a GitHub issue for a task, or link an existing one | The task's creator, its assignee, project leads, managers, HR and admins |
| Unlink an issue | The task's creator, project leads, managers, HR and admins |
| Import a repo's open issues as tasks | Managers, HR and admins; project owners and leads into their project |
| Sync | Automatic: closing the issue finishes the task, reopening puts it back in progress, and approving or cancelling the task closes the issue |

## Hiring, payroll and certificates

| Action | Who |
| --- | --- |
| Hire someone from a program (paid or waived) | HR, admin, super admin |
| Set pay, draft, adjust loss of pay, publish payslips | HR, admin, super admin |
| See a payslip | HR, admin, super admin; the employee once it's published |
| Issue or revoke a completion or experience certificate | HR, admin, super admin. Also automatic: interns when their internship ends, anyone when they're offboarded |
| Verify a certificate | Anyone with the link (name, role, dates and ID only) |

## Appointment letters and company policies

| Action | Who |
| --- | --- |
| Issue an appointment letter (emailed with the company policies attached as PDFs) | Admin, super admin |
| See someone's appointment letters, download them, resend the email | HR, admin, super admin; the employee sees and downloads their own |
| Accept an appointment letter | Only the person it's addressed to. Accepting ticks their policy-consent and signed-letter checklist items |
| Read and download company policies | Everyone signed in |
| Add, edit or retire a policy | Admin, super admin. Rewording creates a new version; letters already sent keep the version they attached |

## Internship tracks and coding exercises

| Action | Who |
| --- | --- |
| Set up the six tracks (courses, exams, openings, assignments) | Admin, super admin |
| Open a track's roadmap, run and submit exercises, submit projects | Participants who have paid (or been waived) for a track that includes the assignment |
| Review projects and exercises that couldn't be checked automatically | Manager, HR, admin, super admin (never their own work) |

Coding exercises are checked by the portal, not a person. JavaScript, Python, C, C++, C#, Java and SQL are run against test cases by Judge0 (`PORTAL_JUDGE0_URL`, `PORTAL_JUDGE0_KEY`); "Run" uses the visible examples, "Submit" adds hidden tests, and passing every check approves the exercise with full marks. HTML, CSS, Bootstrap, React, Django, Spring Boot, Express, DevOps and cloud exercises are checked by inspecting the code and need no runner. When Judge0 isn't set up or is unreachable, code that has to run goes to the Reviews queue for a mentor instead. The portal never runs student code itself in production.
