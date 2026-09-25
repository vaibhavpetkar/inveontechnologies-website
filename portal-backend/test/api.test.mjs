// End-to-end API tests against a real Postgres (see helpers.mjs).
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer, createOpportunityWithApplication } from "./helpers.mjs";

let api, admin, superAdmin, hr;

before(async () => {
  api = await startServer();
  admin = await api.createUser("admin");
  superAdmin = await api.createUser("super_admin");
  hr = await api.createUser("hr");
});
after(async () => api?.stop());

describe("errors and input handling", () => {
  test("malformed ids and unknown references are 4xx, not 500", async () => {
    assert.equal((await api.call("GET", "/opportunities/not-a-uuid")).status, 400);
    const c = await api.createUser("candidate");
    const r = await api.call("POST", "/conversations", { token: c.token, body: { participantIds: ["00000000-0000-0000-0000-000000000000"] } });
    assert.equal(r.status, 400);
  });

  test("case-variant skill names are de-duplicated", async () => {
    const r = await api.call("POST", "/opportunities", { token: hr.token, body: { title: "Dup skills", description: "Opening with dup skills", skillNames: ["React", "react", " REACT "] } });
    assert.equal(r.status, 201);
    const detail = await api.call("GET", `/opportunities/${r.json.opportunity.id}`, { token: hr.token });
    assert.equal(detail.json.skills.length, 1);
  });
});

describe("auth", () => {
  test("email is case-insensitive for register and login", async () => {
    const email = `Mixed.${Date.now()}@Example.COM`;
    assert.equal((await api.call("POST", "/auth/register", { body: { email, password: "password1234" } })).status, 201);
    const again = await api.call("POST", "/auth/register", { body: { email: email.toLowerCase(), password: "password1234" } });
    assert.equal(again.status, 201); // same generic response…
    const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM users WHERE lower(email) = lower($1)", [email]);
    assert.equal(rows[0].n, 1); // …but no second account
    assert.equal((await api.call("POST", "/auth/login", { body: { email: email.toUpperCase(), password: "password1234" } })).status, 200);
  });

  test("resend-verification only for unverified users", async () => {
    const unverified = await api.createUser("candidate", { emailVerified: false });
    assert.equal((await api.call("POST", "/auth/resend-verification", { token: unverified.token })).json.message, "Verification email sent.");
    const verified = await api.createUser("candidate");
    assert.match((await api.call("POST", "/auth/resend-verification", { token: verified.token })).json.message, /already verified/);
  });
});

describe("assessments", () => {
  async function invitedAttempt(durationMinutes = 5) {
    const { opp, candidate, application } = await createOpportunityWithApplication(api, { hr, admin });
    await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus: "under_review" } });
    const asmt = (await api.call("POST", "/assessments", { token: hr.token, body: {
      opportunityId: opp.id, title: "Basics", durationMinutes, passingScorePercent: 50,
      questions: [{ questionText: "2+2?", options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correctOptionId: "a" }],
    } })).json.assessment;
    const attempt = (await api.call("POST", `/assessments/applications/${application.id}/invite`, { token: hr.token, body: { assessmentId: asmt.id } })).json.attempt;
    const started = await api.call("POST", `/assessment-attempts/${attempt.id}/start`, { token: candidate.token });
    return { candidate, application, attempt, questionId: started.json.questions[0].id };
  }

  test("a submit landing just after the deadline (auto-submit) keeps the answers", async () => {
    const { candidate, attempt, questionId } = await invitedAttempt();
    await api.pool.query("UPDATE assessment_attempts SET expires_at = now() - interval '2 seconds' WHERE id = $1", [attempt.id]);
    const r = await api.call("POST", `/assessment-attempts/${attempt.id}/submit`, { token: candidate.token, body: { answers: [{ questionId, selectedOptionId: "a" }] } });
    assert.equal(r.status, 200);
    assert.equal(r.json.scorePercent, 100);
  });

  test("a submit long after the deadline is rejected and the attempt expires", async () => {
    const { candidate, attempt, questionId, application } = await invitedAttempt();
    await api.pool.query("UPDATE assessment_attempts SET expires_at = now() - interval '5 minutes' WHERE id = $1", [attempt.id]);
    const r = await api.call("POST", `/assessment-attempts/${attempt.id}/submit`, { token: candidate.token, body: { answers: [{ questionId, selectedOptionId: "a" }] } });
    assert.equal(r.status, 400);
    const { rows } = await api.pool.query("SELECT status FROM applications WHERE id = $1", [application.id]);
    assert.equal(rows[0].status, "assessment_completed");
  });

  test("concurrent double submit: one succeeds, one 400, answers stored once", async () => {
    const { candidate, attempt, questionId } = await invitedAttempt();
    const body = { answers: [{ questionId, selectedOptionId: "a" }] };
    const results = await Promise.all([1, 2].map(() => api.call("POST", `/assessment-attempts/${attempt.id}/submit`, { token: candidate.token, body })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM assessment_attempt_answers WHERE attempt_id = $1", [attempt.id]);
    assert.equal(rows[0].n, 1);
  });
});

describe("pipeline pagination", () => {
  test("cursor walks every application without overlap", async () => {
    const { opp } = await createOpportunityWithApplication(api, { hr, admin });
    for (let i = 0; i < 2; i++) {
      const c = await api.createUser("candidate");
      await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: c.token, body: {} });
    }
    const p1 = await api.call("GET", `/applications?opportunityId=${opp.id}&limit=2`, { token: hr.token });
    const p2 = await api.call("GET", `/applications?opportunityId=${opp.id}&limit=2&cursor=${p1.json.nextCursor}`, { token: hr.token });
    const ids = new Set([...p1.json.applications, ...p2.json.applications].map((a) => a.id));
    assert.equal(p1.json.applications.length, 2);
    assert.equal(p2.json.applications.length, 1);
    assert.equal(ids.size, 3);
  });
});

describe("manager scoping (own team only)", () => {
  test("a manager sees and manages only opportunities they are hiring manager for", async () => {
    const mine = await api.createUser("manager");
    const other = await api.createUser("manager");
    const { opp, application } = await createOpportunityWithApplication(api, { hr, admin, hiringManagerId: mine.id });

    assert.equal((await api.call("GET", `/applications?opportunityId=${opp.id}`, { token: mine.token })).status, 200);
    assert.equal((await api.call("GET", `/applications?opportunityId=${opp.id}`, { token: other.token })).status, 403);
    assert.equal((await api.call("GET", `/applications/${application.id}`, { token: other.token })).status, 403);
    assert.equal((await api.call("POST", `/applications/${application.id}/transition`, { token: other.token, body: { toStatus: "under_review" } })).status, 403);
    assert.equal((await api.call("POST", `/applications/${application.id}/transition`, { token: mine.token, body: { toStatus: "under_review" } })).status, 200);
  });

  test("an assigned interviewer can view the application and give feedback, but not move it", async () => {
    const hiring = await api.createUser("manager");
    const interviewer = await api.createUser("manager");
    const { application } = await createOpportunityWithApplication(api, { hr, admin, hiringManagerId: hiring.id });
    const interview = (await api.call("POST", `/applications/${application.id}/interviews`, { token: hr.token, body: { interviewerId: interviewer.id, scheduledAt: new Date(Date.now() + 86400000).toISOString() } })).json.interview;

    assert.equal((await api.call("GET", `/applications/${application.id}`, { token: interviewer.token })).status, 200);
    assert.equal((await api.call("POST", `/interviews/${interview.id}/feedback`, { token: interviewer.token, body: { feedback: "Strong", decision: "pass" } })).status, 200);
    assert.equal((await api.call("POST", `/applications/${application.id}/transition`, { token: interviewer.token, body: { toStatus: "under_review" } })).status, 403);
  });

  test("hiringManagerId must be a manager", async () => {
    const r = await api.call("POST", "/opportunities", { token: hr.token, body: { title: "Bad HM", description: "Opening description", hiringManagerId: hr.id } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, "INVALID_HIRING_MANAGER");
  });

  test("manager growth view is limited to direct reports", async () => {
    const manager = await api.createUser("manager");
    const report = await api.createUser("employee", { profile: false });
    const stranger = await api.createUser("employee", { profile: false });
    await api.pool.query("INSERT INTO employees (user_id, employee_type, joining_date, manager_id, created_by) VALUES ($1, 'full_time', now(), $2, $3)", [report.id, manager.id, admin.id]);
    assert.equal((await api.call("GET", `/tasks/growth/${report.id}`, { token: manager.token })).status, 200);
    assert.equal((await api.call("GET", `/tasks/growth/${stranger.id}`, { token: manager.token })).status, 403);
  });
});

describe("task permissions", () => {
  test("candidates cannot create tasks", async () => {
    const c = await api.createUser("candidate");
    assert.equal((await api.call("POST", "/tasks", { token: c.token, body: { title: "Spam" } })).status, 403);
  });

  test("employees can't assign personal tasks to others; managers can", async () => {
    const emp = await api.createUser("employee", { profile: false });
    const other = await api.createUser("employee", { profile: false });
    const manager = await api.createUser("manager");
    assert.equal((await api.call("POST", "/tasks", { token: emp.token, body: { title: "Mine", assigneeId: emp.id } })).status, 201);
    assert.equal((await api.call("POST", "/tasks", { token: emp.token, body: { title: "Yours", assigneeId: other.id } })).status, 403);
    assert.equal((await api.call("POST", "/tasks", { token: manager.token, body: { title: "Yours", assigneeId: other.id } })).status, 201);
  });

  test("project members can't reassign tasks; the assignee can edit details", async () => {
    const lead = await api.createUser("manager");
    const member = await api.createUser("employee", { profile: false });
    const outsider = await api.createUser("employee", { profile: false });
    const project = (await api.call("POST", "/projects", { token: lead.token, body: { title: "Proj", ownerId: lead.id } })).json.project;
    await api.call("POST", `/projects/${project.id}/members`, { token: lead.token, body: { userId: member.id } });

    assert.equal((await api.call("POST", "/tasks", { token: lead.token, body: { title: "Outside", projectId: project.id, assigneeId: outsider.id } })).status, 400);
    const task = (await api.call("POST", "/tasks", { token: lead.token, body: { title: "Build it", projectId: project.id, assigneeId: member.id } })).json.task;
    assert.equal((await api.call("PUT", `/tasks/${task.id}`, { token: member.token, body: { description: "Notes" } })).status, 200);
    assert.equal((await api.call("PUT", `/tasks/${task.id}`, { token: member.token, body: { assigneeId: lead.id } })).status, 403);
  });
});

describe("chat", () => {
  test("opening a conversation returns the newest messages, oldest first; beforeSeq pages back", async () => {
    const a = await api.createUser("employee", { profile: false });
    const b = await api.createUser("employee", { profile: false });
    const conv = (await api.call("POST", "/conversations", { token: a.token, body: { participantIds: [b.id] } })).json.conversation;
    for (let i = 1; i <= 5; i++) await api.call("POST", "/messages", { token: a.token, body: { conversationId: conv.id, body: `m${i}` } });

    const latest = await api.call("GET", `/messages?conversationId=${conv.id}&limit=2`, { token: b.token });
    assert.deepEqual(latest.json.messages.map((m) => m.body), ["m4", "m5"]);
    const older = await api.call("GET", `/messages?conversationId=${conv.id}&limit=2&beforeSeq=${latest.json.messages[0].seqNumber}`, { token: b.token });
    assert.deepEqual(older.json.messages.map((m) => m.body), ["m2", "m3"]);
    const newer = await api.call("GET", `/messages?conversationId=${conv.id}&afterSeq=${older.json.messages[1].seqNumber}`, { token: b.token });
    assert.deepEqual(newer.json.messages.map((m) => m.body), ["m4", "m5"]);
  });
});

describe("account management (super admin)", () => {
  test("super admin creates staff accounts and changes roles; others can't", async () => {
    const email = `new.hr.${Date.now()}@test.local`;
    assert.equal((await api.call("POST", "/users", { token: admin.token, body: { email, password: "password1234", role: "hr" } })).status, 403);
    const created = await api.call("POST", "/users", { token: superAdmin.token, body: { email, password: "password1234", role: "hr" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.user.role, "hr");
    assert.equal((await api.call("POST", "/users", { token: superAdmin.token, body: { email: email.toUpperCase(), password: "password1234", role: "hr" } })).status, 409);

    const promoted = await api.call("PUT", `/users/${created.json.user.id}/role`, { token: superAdmin.token, body: { role: "admin" } });
    assert.equal(promoted.json.user.role, "admin");
    assert.equal((await api.call("PUT", `/users/${superAdmin.id}/role`, { token: superAdmin.token, body: { role: "hr" } })).status, 400);

    const list = await api.call("GET", "/users?role=admin", { token: hr.token });
    assert.ok(list.json.users.some((u) => u.id === created.json.user.id));
    assert.ok(list.json.users.every((u) => !("passwordHash" in u)));
  });
});

describe("certificates and reports", () => {
  async function completedCourse(candidate) {
    const course = (await api.call("POST", "/courses", { token: hr.token, body: { title: "Course", description: "A short free course" } })).json.course;
    const mod = (await api.call("POST", `/courses/${course.id}/modules`, { token: hr.token, body: { title: "M1" } })).json.module;
    const lesson = (await api.call("POST", `/courses/modules/${mod.id}/lessons`, { token: hr.token, body: { title: "Intro", contentType: "video" } })).json.lesson;
    await api.call("POST", `/courses/${course.id}/publish`, { token: admin.token });
    await api.call("POST", `/courses/${course.id}/enroll`, { token: candidate.token, body: {} });
    await api.call("POST", `/lessons/${lesson.id}/complete`, { token: candidate.token });
    const tpl = (await api.call("POST", "/certificate-templates", { token: hr.token, body: { title: "Std", bodyTemplate: "Certifies {{recipientName}} completed {{courseTitle}}" } })).json.template;
    return { course, tpl };
  }

  test("public verification shows the name, never the email; failed reissue keeps the original", async () => {
    const candidate = await api.createUser("candidate");
    const { course, tpl } = await completedCourse(candidate);
    const cert = (await api.call("POST", `/courses/${course.id}/certificates/issue`, { token: hr.token, body: { userId: candidate.id, templateId: tpl.id } })).json.certificate;

    const v = await api.call("GET", `/certificates/verify/${cert.verificationCode}`);
    assert.equal(v.json.recipientName, "Test candidate");
    assert.ok(!JSON.stringify(v.json).includes("@"));

    const bad = await api.call("POST", `/certificates/${cert.id}/reissue`, { token: admin.token, body: { templateId: "00000000-0000-0000-0000-000000000000", reason: "typo" } });
    assert.equal(bad.status, 404);
    const { rows } = await api.pool.query("SELECT status FROM certificates WHERE id = $1", [cert.id]);
    assert.equal(rows[0].status, "issued");

    const good = await api.call("POST", `/certificates/${cert.id}/reissue`, { token: admin.token, body: { reason: "name fix" } });
    assert.equal(good.status, 201);
    assert.equal((await api.pool.query("SELECT status FROM certificates WHERE id = $1", [cert.id])).rows[0].status, "revoked");
  });

  test("candidates report lists candidates only", async () => {
    const r = await api.call("GET", "/reports/candidates?limit=500", { token: hr.token });
    assert.equal(r.status, 200);
    assert.ok(r.json.rows.every((row) => row.role === "candidate"));
  });
});

describe("email verification gate", () => {
  test("with PORTAL_REQUIRE_EMAIL_VERIFICATION, unverified candidates can't apply", async () => {
    const gated = await (await import("./helpers.mjs")).startServer({ PORTAL_REQUIRE_EMAIL_VERIFICATION: "true" });
    try {
      const opp = (await gated.call("POST", "/opportunities", { token: hr.token, body: { title: "Gated", description: "Gated opening description" } })).json.opportunity;
      await gated.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
      const unverified = await gated.createUser("candidate", { emailVerified: false });
      const r = await gated.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: unverified.token, body: {} });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, "EMAIL_NOT_VERIFIED");
      const verified = await gated.createUser("candidate");
      assert.equal((await gated.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: verified.token, body: {} })).status, 201);
    } finally {
      await gated.stop();
    }
  });
});
