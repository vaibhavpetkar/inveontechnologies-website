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

## GitHub issues on tasks

| Action | Who |
| --- | --- |
| Open a GitHub issue for a task, or link an existing one | The task's creator, its assignee, project leads, managers, HR and admins |
| Unlink an issue | The task's creator, project leads, managers, HR and admins |
| Import a repo's open issues as tasks | Managers, HR and admins; project owners and leads into their project |
| Sync | Automatic: closing the issue finishes the task, reopening puts it back in progress, and approving or cancelling the task closes the issue |
