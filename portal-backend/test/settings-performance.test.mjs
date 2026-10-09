// Company details on letters, email settings and the email log, sending
// documents again, task time extensions and hand-overs, star ratings, the
// ranking and Employee of the Month, and employee documents reviewed by
// their manager.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "./helpers.mjs";
import { createDb } from "../dist/modules/shared/db/client.js";
import { createEmployeeRecord } from "../dist/modules/employees/onboarding.js";
import { ensureDefaultPolicies } from "../dist/modules/employees/appointment.js";
import { PREVIOUS_DEFAULT_POLICIES } from "../dist/modules/employees/policy-previous.js";
import { DEFAULT_POLICIES } from "../dist/modules/employees/policy-defaults.js";
import { monthOf, monthRange, shiftMonth, taskPoints } from "../dist/modules/performance/score.js";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
let api, admin, hr, dbh, uploadDir;

before(async () => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "portal-uploads-"));
  api = await startServer({ PORTAL_UPLOAD_DIR: uploadDir, PORTAL_VAULT_KEY: "test-vault-key-".padEnd(40, "v") });
  admin = await api.createUser("admin");
  hr = await api.createUser("hr");
  dbh = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
});
after(async () => {
  await api?.stop();
  await dbh?.pool.end();
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

async function waitFor(check, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await check();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function pdfOf(url, token) {
  const res = await fetch(`${api.base}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  return Buffer.from(await res.arrayBuffer());
}

describe("company details on letters", () => {
  test("HR reads them, admins change them, and policy PDFs are drawn with them", async () => {
    const read = await api.call("GET", "/settings/company", { token: hr.token });
    assert.equal(read.status, 200);
    assert.equal(read.json.canEdit, false);
    assert.equal(read.json.profile.email, "office.inveontech@gmail.com");
    assert.equal(read.json.profile.signatories.length, 2);
    assert.match(read.json.previews.logo, /^data:image\/png;base64,/);
    assert.equal((await api.call("GET", "/settings/company", { token: (await api.createUser("employee")).token })).status, 403);

    const profile = { ...read.json.profile, phone: "+91 90000 00000", projectManager: { name: "Asha Patil", title: "Project Manager" } };
    assert.equal((await api.call("PUT", "/settings/company", { token: hr.token, body: profile })).status, 403);
    assert.equal((await api.call("PUT", "/settings/company", { token: admin.token, body: { ...profile, logo: "data:text/html;base64,PGI+" } })).status, 400);
    const saved = await api.call("PUT", "/settings/company", { token: admin.token, body: { ...profile, seal: PNG } });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.profile.phone, "+91 90000 00000");
    assert.equal(saved.json.previews.seal, PNG);

    const policy = (await api.call("GET", "/policies", { token: hr.token })).json.policies.find((p) => p.slug === "code-of-conduct");
    assert.match(policy.body, /authorized Company spokesperson/, "the October 2026 wording");
    assert.equal((await pdfOf(`/policies/${policy.id}/pdf`, hr.token)).subarray(0, 4).toString(), "%PDF");
  });

  test("an unedited policy with the old default wording moves to the new wording; an edited one is left alone", async () => {
    const old = PREVIOUS_DEFAULT_POLICIES.find((p) => p.slug === "remote-work");
    await api.pool.query("UPDATE company_policies SET body = $1, version = 3 WHERE slug = 'remote-work'", [old.body]);
    await api.pool.query("UPDATE company_policies SET body = 'Our own wording for leave, edited by an admin.', version = 4 WHERE slug = 'leave-and-attendance'");
    await ensureDefaultPolicies(dbh.db);
    const rows = (await api.pool.query("SELECT slug, body, version FROM company_policies WHERE slug IN ('remote-work', 'leave-and-attendance')")).rows;
    const remote = rows.find((r) => r.slug === "remote-work");
    assert.equal(remote.body, DEFAULT_POLICIES.find((p) => p.slug === "remote-work").body);
    assert.equal(remote.version, 4);
    assert.deepEqual(rows.find((r) => r.slug === "leave-and-attendance"), { slug: "leave-and-attendance", body: "Our own wording for leave, edited by an admin.", version: 4 });
  });

  test("internship fees are settings admins change", async () => {
    const terms = await api.call("GET", "/settings/internship-offers", { token: hr.token });
    assert.deepEqual(terms.json.terms, { studentFee: 3000, graduateFee: 5000, workMode: "Remote", durationMonths: 6 });
    assert.equal((await api.call("PUT", "/settings/internship-offers", { token: hr.token, body: terms.json.terms })).status, 403);
    const saved = await api.call("PUT", "/settings/internship-offers", { token: admin.token, body: { ...terms.json.terms, graduateFee: 5500 } });
    assert.equal(saved.json.terms.graduateFee, 5500);
    await api.call("PUT", "/settings/internship-offers", { token: admin.token, body: terms.json.terms });
  });
});

describe("email settings and the email log", () => {
  test("admins point email at another server; the password is stored encrypted and never shown", async () => {
    const before = await api.call("GET", "/settings/email", { token: admin.token });
    assert.equal(before.json.settings.saved, false);
    assert.equal(before.json.status.sending, false);
    assert.equal((await api.call("GET", "/settings/email", { token: hr.token })).json.settings, null, "HR sees status only");

    const body = { enabled: true, host: "127.0.0.1", port: 1, secure: false, user: "portal@inveon.test", password: "s3cret-smtp-pass", fromName: "Inveon HR", fromEmail: "hr@inveon.test", replyTo: "" };
    assert.equal((await api.call("PUT", "/settings/email", { token: hr.token, body })).status, 403);
    const saved = await api.call("PUT", "/settings/email", { token: admin.token, body });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.check.ok, false, "nothing listens on port 1");
    assert.equal(saved.json.settings.hasPassword, true);
    assert.equal(saved.json.settings.password, undefined);
    assert.equal(saved.json.status.source, "settings");
    const stored = JSON.stringify((await api.pool.query("SELECT value FROM portal_settings WHERE key = 'email_settings'")).rows[0].value);
    assert.ok(!stored.includes("s3cret-smtp-pass"), "not stored in plain text");

    const test = await api.call("POST", "/settings/email/test", { token: admin.token, body: { to: "someone@inveon.test" } });
    assert.equal(test.json.ok, false);
    assert.ok(test.json.error);
    const failed = await api.call("GET", "/email-log?status=failed", { token: hr.token });
    assert.ok(failed.json.emails.some((e) => e.kind === "test" && e.toEmail === "someone@inveon.test" && e.error));

    // Leaving the password blank keeps it; turning settings off goes back to the environment's (log only).
    const off = await api.call("PUT", "/settings/email", { token: admin.token, body: { ...body, enabled: false, password: "" } });
    assert.equal(off.json.settings.hasPassword, true);
    assert.equal(off.json.status.source, "environment");
    const ok = await api.call("POST", "/settings/email/test", { token: admin.token, body: { to: "someone@inveon.test" } });
    assert.equal(ok.json.ok, true);
    const logged = (await api.call("GET", "/email-log?kind=test&status=logged", { token: hr.token })).json.emails[0];
    assert.equal(logged.canResend, true);
    assert.equal((await api.call("POST", `/email-log/${logged.id}/resend`, { token: hr.token })).json.emailQueued, true);
  });

  test("sign-in emails are logged without their link and can't be resent", async () => {
    const email = `reset-${Date.now()}@test.local`;
    await api.createUser("candidate", { email });
    await api.call("POST", "/auth/forgot-password", { body: { email } });
    const row = await waitFor(async () => (await api.call("GET", `/email-log?q=${encodeURIComponent(email)}`, { token: admin.token })).json.emails[0]);
    assert.ok(row, "the reset email is in the log");
    assert.equal(row.kind, "auth");
    assert.equal(row.body, null);
    assert.equal(row.canResend, false);
    assert.equal((await api.call("POST", `/email-log/${row.id}/resend`, { token: admin.token })).json.error.code, "CANNOT_RESEND");
  });

  test("HR emails someone the policies again, and can resend that email from the log", async () => {
    const person = await api.createUser("employee");
    const available = await api.call("GET", `/send-documents/available?userId=${person.id}`, { token: hr.token });
    assert.equal(available.json.appointmentLetter, null);
    assert.ok(available.json.policies.length >= 7);
    assert.equal((await api.call("POST", "/send-documents", { token: hr.token, body: { userId: person.id } })).json.error.code, "NOTHING_SELECTED");
    assert.equal((await api.call("POST", "/send-documents", { token: hr.token, body: { userId: person.id, appointmentLetter: true } })).json.error.code, "NO_LETTER");
    const sent = await api.call("POST", "/send-documents", { token: hr.token, body: { userId: person.id, policies: ["posh", "code-of-conduct"] } });
    assert.deepEqual(sent.json.queued, ["2 policies"]);
    const row = await waitFor(async () => (await api.call("GET", `/email-log?kind=policies&q=${encodeURIComponent(person.email)}`, { token: hr.token })).json.emails[0]);
    assert.ok(row);
    assert.equal(row.attachments.length, 2);
    assert.equal(row.canResend, true);
    assert.equal((await api.call("POST", `/email-log/${row.id}/resend`, { token: hr.token })).status, 200);
  });
});

describe("overdue tasks: more time or a hand-over", () => {
  test("the assignee asks for more time and the reviewer approves it; a hand-over goes to someone else", async () => {
    const manager = await api.createUser("manager");
    const dev = await api.createUser("employee");
    const other = await api.createUser("employee");
    const due = new Date(Date.now() - 86400000).toISOString();
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Ship the seat map", assigneeId: dev.id, dueDate: due } })).json.task;

    const later = new Date(Date.now() + 3 * 86400000).toISOString();
    assert.equal((await api.call("POST", `/tasks/${task.id}/requests`, { token: other.token, body: { kind: "extension", reason: "Need more time", requestedDueDate: later } })).status, 403);
    const asked = await api.call("POST", `/tasks/${task.id}/requests`, { token: dev.token, body: { kind: "extension", reason: "The API changed under me", requestedDueDate: later } });
    assert.equal(asked.status, 201, JSON.stringify(asked.json));
    assert.equal((await api.call("POST", `/tasks/${task.id}/requests`, { token: dev.token, body: { kind: "extension", reason: "Again", requestedDueDate: later } })).status, 409);

    const pending = await api.call("GET", "/tasks/requests/pending", { token: manager.token });
    assert.ok(pending.json.requests.some((r) => r.id === asked.json.request.id && r.task.title === "Ship the seat map"));
    assert.equal((await api.call("GET", "/tasks/requests/pending", { token: other.token })).json.requests.length, 0);
    assert.equal((await api.call("POST", `/tasks/requests/${asked.json.request.id}/decide`, { token: dev.token, body: { approve: true } })).status, 403);
    const approved = await api.call("POST", `/tasks/requests/${asked.json.request.id}/decide`, { token: manager.token, body: { approve: true, note: "OK, but no later" } });
    assert.equal(approved.json.request.status, "approved");
    const after = (await api.call("GET", `/tasks/${task.id}`, { token: dev.token })).json.task;
    assert.equal(new Date(after.dueDate).toISOString(), later);
    const note = await waitFor(async () => (await api.pool.query("SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'task.request_decided'", [dev.id])).rowCount);
    assert.ok(note);

    // Hand-over: suggested person, approved, the task restarts with them.
    await api.call("POST", `/tasks/${task.id}/transition`, { token: dev.token, body: { toStatus: "in_progress" } });
    const handover = await api.call("POST", `/tasks/${task.id}/requests`, { token: dev.token, body: { kind: "reassign", reason: "I'm moving to the payroll project", proposedAssigneeId: other.id } });
    assert.equal(handover.status, 201);
    const done = await api.call("POST", `/tasks/requests/${handover.json.request.id}/decide`, { token: manager.token, body: { approve: true } });
    assert.equal(done.json.request.status, "approved");
    const moved = (await api.call("GET", `/tasks/${task.id}`, { token: manager.token })).json.task;
    assert.equal(moved.assigneeId, other.id);
    assert.equal(moved.status, "todo");
    const timeline = (await api.call("GET", `/tasks/${task.id}/timeline`, { token: manager.token })).json.timeline.map((e) => e.action);
    assert.ok(timeline.includes("extension_approved") && timeline.includes("reassign_approved"));
  });

  test("a declined request leaves the task as it was; a hand-over without a name needs one to approve", async () => {
    const manager = await api.createUser("manager");
    const dev = await api.createUser("employee");
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Write the release notes", assigneeId: dev.id } })).json.task;
    const ask = await api.call("POST", `/tasks/${task.id}/requests`, { token: dev.token, body: { kind: "reassign", reason: "Not my area" } });
    assert.equal((await api.call("POST", `/tasks/requests/${ask.json.request.id}/decide`, { token: manager.token, body: { approve: true } })).json.error.code, "ASSIGNEE_REQUIRED");
    const declined = await api.call("POST", `/tasks/requests/${ask.json.request.id}/decide`, { token: manager.token, body: { approve: false, note: "You're the best fit" } });
    assert.equal(declined.json.request.status, "declined");
    assert.equal((await api.call("GET", `/tasks/${task.id}`, { token: dev.token })).json.task.assigneeId, dev.id);
  });
});

describe("ratings, ranking and Employee of the Month", () => {
  test("points weigh stars by hours and reward finishing on time", () => {
    const base = { actualHours: "4", estimateHours: null, rating: 5, dueDate: new Date("2026-10-10"), completedAt: new Date("2026-10-09"), updatedAt: new Date("2026-10-09") };
    assert.equal(Math.round(taskPoints(base) * 10) / 10, 44);
    assert.equal(Math.round(taskPoints({ ...base, completedAt: new Date("2026-10-12") }) * 10) / 10, 34);
    assert.equal(taskPoints({ ...base, rating: null, actualHours: "0", estimateHours: "2", dueDate: null }), 12);
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    const { start, end } = monthRange("2026-10");
    assert.equal(start.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.equal(end.toISOString(), "2026-10-31T18:30:00.000Z");
  });

  test("reviewers rate approved work; the ranking and growth follow; HR names the Employee of the Month", async () => {
    const manager = await api.createUser("manager");
    const star = await api.createUser("employee");
    const steady = await api.createUser("intern");

    async function finish(person, title, hours, rating) {
      const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title, assigneeId: person.id, estimateHours: hours, dueDate: new Date(Date.now() + 86400000).toISOString() } })).json.task;
      await api.call("POST", `/tasks/${task.id}/transition`, { token: person.token, body: { toStatus: "in_progress" } });
      await api.call("POST", `/tasks/${task.id}/time-entries`, { token: person.token, body: { hours, entryDate: new Date().toISOString() } });
      await api.call("POST", `/tasks/${task.id}/transition`, { token: person.token, body: { toStatus: "in_review" } });
      const approved = await api.call("POST", `/tasks/${task.id}/transition`, { token: manager.token, body: { toStatus: "done", rating, ratingNote: "Nice" } });
      assert.equal(approved.status, 200, JSON.stringify(approved.json));
      return task;
    }
    const t1 = await finish(star, "Build the leaderboard", 6, 5);
    await finish(star, "Fix the payslip PDF", 2, 4);
    const t3 = await finish(steady, "Tidy the README", 1, 3);

    const stored = (await api.pool.query("SELECT rating, rated_by, completed_at FROM tasks WHERE id = $1", [t1.id])).rows[0];
    assert.equal(stored.rating, 5);
    assert.equal(stored.rated_by, manager.id);
    assert.ok(stored.completed_at);
    assert.equal((await api.call("POST", `/tasks/${t3.id}/rating`, { token: steady.token, body: { rating: 5 } })).status, 403, "no rating your own work");
    assert.equal((await api.call("POST", `/tasks/${t3.id}/rating`, { token: manager.token, body: { rating: 4, note: "Clearer now" } })).json.task.rating, 4);

    const board = await api.call("GET", "/performance/leaderboard", { token: steady.token });
    assert.equal(board.status, 200);
    assert.equal(board.json.month, monthOf());
    const starRow = board.json.rows.find((r) => r.userId === star.id);
    const steadyRow = board.json.rows.find((r) => r.userId === steady.id);
    assert.equal(starRow.tasksDone, 2);
    assert.equal(starRow.hours, 8);
    assert.equal(starRow.avgRating, 4.8, "6h at 5 stars and 2h at 4 stars");
    assert.equal(starRow.onTimePercent, 100);
    assert.ok(starRow.rank < steadyRow.rank);
    assert.equal((await api.call("GET", "/performance/leaderboard", { token: (await api.createUser("candidate")).token })).status, 403);

    const growth = await api.call("GET", "/performance/growth/me?months=3", { token: star.token });
    assert.equal(growth.json.series.length, 3);
    assert.equal(growth.json.series[2].score, starRow.score);
    assert.equal((await api.call("GET", `/performance/growth/${star.id}`, { token: steady.token })).status, 403);

    assert.equal((await api.call("POST", "/performance/employee-of-month", { token: manager.token, body: { month: monthOf() } })).status, 403);
    assert.equal((await api.call("POST", "/performance/employee-of-month", { token: hr.token, body: { month: "2099-01" } })).json.error.code, "FUTURE_MONTH");
    const picked = await api.call("POST", "/performance/employee-of-month", { token: hr.token, body: { month: monthOf(), userId: star.id, note: "For the leaderboard work" } });
    assert.equal(picked.status, 201, JSON.stringify(picked.json));
    assert.equal(picked.json.employeeOfMonth.userId, star.id);
    const email = await waitFor(async () => (await api.pool.query("SELECT subject FROM email_log WHERE kind = 'employee_of_month' AND to_email = $1", [star.email])).rows[0]);
    assert.match(email.subject, /Employee of the Month/);
    const latest = await api.call("GET", "/performance/employee-of-month", { token: steady.token });
    assert.equal(latest.json.latest.userId, star.id);
    assert.equal((await api.call("GET", "/performance/leaderboard", { token: steady.token })).json.employeeOfMonth.userId, star.id);
  });
});

describe("employee documents reviewed by their manager", () => {
  test("an employee uploads a document; their manager sees and verifies it, another manager can't", async () => {
    const manager = await api.createUser("manager");
    const otherManager = await api.createUser("manager");
    const person = await api.createUser("employee");
    const employee = await createEmployeeRecord(dbh.db, { userId: person.id, employeeType: "full_time", managerId: manager.id, joiningDate: new Date("2026-10-05T00:00:00Z"), createdBy: hr.id });

    const up = await fetch(`${api.base}/files?purpose=employee_document&name=pan.pdf`, { method: "POST", headers: { Authorization: `Bearer ${person.token}`, "Content-Type": "application/octet-stream" }, body: PDF });
    const file = (await up.json()).file;
    const created = await api.call("POST", `/employees/${employee.id}/documents`, { token: person.token, body: { documentType: "PAN card", fileUrl: file.url, description: "New PAN" } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const docId = created.json.document.id;

    const queue = await api.call("GET", "/employees/documents/review-queue", { token: manager.token });
    assert.ok(queue.json.documents.some((d) => d.id === docId && d.employee.id === employee.id && d.file));
    assert.equal((await api.call("GET", "/employees/documents/review-queue", { token: otherManager.token })).json.documents.length, 0);
    assert.equal((await api.call("GET", `/employees/${employee.id}/documents`, { token: otherManager.token })).status, 403);
    assert.equal((await fetch(`${api.base}${file.url.replace("/api/v1", "")}`, { headers: { Authorization: `Bearer ${manager.token}` } })).status, 200, "their manager can open the file");
    assert.equal((await fetch(`${api.base}${file.url.replace("/api/v1", "")}`, { headers: { Authorization: `Bearer ${otherManager.token}` } })).status, 403);

    assert.equal((await api.call("POST", `/employees/documents/${docId}/verify`, { token: otherManager.token, body: { approve: true } })).status, 403);
    assert.equal((await api.call("POST", `/employees/documents/${docId}/verify`, { token: manager.token, body: { approve: false } })).json.error.code, "NOTE_REQUIRED");
    const verified = await api.call("POST", `/employees/documents/${docId}/verify`, { token: manager.token, body: { approve: true } });
    assert.equal(verified.json.document.status, "verified");
    assert.ok(verified.json.document.verifiedAt);
    assert.equal((await api.call("DELETE", `/employees/documents/${docId}`, { token: person.token })).status, 400);
    const mine = await api.call("GET", `/employees/${employee.id}/documents`, { token: person.token });
    assert.equal(mine.json.documents[0].reviewerName.length > 0, true);
  });
});

describe("onboarding uploads, the org chart and signatures", () => {
  test("uploading against the government ID step ticks it off", async () => {
    const person = await api.createUser("employee");
    const employee = await createEmployeeRecord(dbh.db, { userId: person.id, employeeType: "full_time", joiningDate: new Date("2026-10-12T00:00:00Z"), createdBy: hr.id });
    const steps = (await api.call("GET", `/employees/${employee.id}/onboarding-tasks`, { token: person.token })).json.tasks;
    const idStep = steps.find((t) => t.title === "Upload a government ID");
    const custom = steps.find((t) => t.taskType === "custom");

    const up = await fetch(`${api.base}/files?purpose=employee_document&name=aadhaar.pdf`, { method: "POST", headers: { Authorization: `Bearer ${person.token}`, "Content-Type": "application/octet-stream" }, body: PDF });
    const file = (await up.json()).file;
    const wrong = await api.call("POST", `/employees/${employee.id}/documents`, { token: person.token, body: { documentType: "Aadhaar card", fileUrl: file.url, onboardingTaskId: custom.id } });
    assert.equal(wrong.json.error?.code, "INVALID_STEP");
    const ok = await api.call("POST", `/employees/${employee.id}/documents`, { token: person.token, body: { documentType: "Aadhaar card", fileUrl: file.url, onboardingTaskId: idStep.id } });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    const after = (await api.call("GET", `/employees/${employee.id}/onboarding-tasks`, { token: person.token })).json.tasks;
    assert.equal(after.find((t) => t.id === idStep.id).status, "completed");
  });

  test("everyone on staff sees who reports to whom; HR changes it without making loops", async () => {
    const boss = await api.createUser("manager");
    const lead = await api.createUser("employee");
    const dev = await api.createUser("employee");
    const leadRec = await createEmployeeRecord(dbh.db, { userId: lead.id, employeeType: "full_time", managerId: boss.id, joiningDate: new Date("2026-10-12T00:00:00Z"), createdBy: hr.id });
    const devRec = await createEmployeeRecord(dbh.db, { userId: dev.id, employeeType: "full_time", joiningDate: new Date("2026-10-12T00:00:00Z"), createdBy: hr.id });

    const chart = await api.call("GET", "/employees/org-chart", { token: dev.token });
    assert.equal(chart.status, 200);
    assert.equal(chart.json.canEdit, false);
    assert.equal(chart.json.people.find((p) => p.userId === lead.id).managerId, boss.id);
    assert.ok(chart.json.people.some((p) => p.userId === boss.id), "managers without an employee record still appear");
    assert.equal((await api.call("GET", "/employees/org-chart", { token: (await api.createUser("candidate")).token })).status, 403);
    assert.equal((await api.call("GET", "/employees/org-chart", { token: hr.token })).json.canEdit, true);

    assert.equal((await api.call("PUT", `/employees/${devRec.id}`, { token: hr.token, body: { managerId: lead.id } })).status, 200);
    const loop = await api.call("PUT", `/employees/${leadRec.id}`, { token: hr.token, body: { managerId: dev.id } });
    assert.equal(loop.json.error?.code, "REPORTING_LOOP");
    assert.equal((await api.call("PUT", `/employees/${devRec.id}`, { token: hr.token, body: { managerId: dev.id } })).json.error?.code, "REPORTING_LOOP");
    const cleared = await api.call("PUT", `/employees/${devRec.id}`, { token: hr.token, body: { managerId: null } });
    assert.equal(cleared.json.employee.managerId, null);
  });

  test("a candidate saves a signature, which only accepts real PNG/JPEG images", async () => {
    const candidate = await api.createUser("candidate");
    assert.equal((await api.call("GET", "/me/signature", { token: candidate.token })).json.signature, null);
    const fake = "data:image/png;base64," + Buffer.from("not an image at all").toString("base64");
    assert.equal((await api.call("PUT", "/me/signature", { token: candidate.token, body: { image: fake } })).json.error?.code, "FILE_CONTENT_MISMATCH");
    const saved = await api.call("PUT", "/me/signature", { token: candidate.token, body: { image: PNG } });
    assert.equal(saved.status, 200);
    assert.equal((await api.call("GET", "/me/signature", { token: candidate.token })).json.signature.image, PNG);
    assert.equal((await api.call("DELETE", "/me/signature", { token: candidate.token })).status, 204);
    assert.equal((await api.call("GET", "/me/signature", { token: candidate.token })).json.signature, null);
  });

  test("a logo of several hundred KB fits in a company settings save", async () => {
    const current = (await api.call("GET", "/settings/company", { token: admin.token })).json.profile;
    // A valid PNG header followed by padding: about 600 KB once base64-encoded.
    const big = Buffer.concat([Buffer.from(PNG.split(",")[1], "base64"), Buffer.alloc(450 * 1024)]);
    const res = await api.call("PUT", "/settings/company", { token: admin.token, body: { ...current, logo: `data:image/png;base64,${big.toString("base64")}` } });
    assert.notEqual(res.status, 413);
    await api.call("PUT", "/settings/company", { token: admin.token, body: current });
  });
});
