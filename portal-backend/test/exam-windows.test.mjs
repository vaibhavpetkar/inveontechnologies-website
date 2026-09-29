import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startServer } from "./helpers.mjs";

let api, hr, admin;

before(async () => {
  api = await startServer();
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
});
after(async () => api?.stop());

const q = (text) => ({ questionText: text, options: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }], correctOptionId: "a" });
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

async function openingWithExam(extra) {
  const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Window role ${randomUUID().slice(0, 6)}`, description: "An opening with a timed exam window" } })).json.opportunity;
  const r = await api.call("POST", "/assessments", { token: hr.token, body: { opportunityId: opp.id, title: "Go basics", language: "Go", durationMinutes: 60, passingScorePercent: 50, maxAttempts: 2, questions: [q("First?"), q("Second?")], ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
  const candidate = await api.createUser("candidate");
  const applied = await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} });
  assert.equal(applied.status, 201);
  return { opp, exam: r.json.assessment, candidate, application: applied.json.application };
}

const choose = (c, app, examId) => api.call("POST", `/assessment-attempts/by-application/${app.id}/choose`, { token: c.token, body: { assessmentId: examId } });

describe("exam windows", () => {
  test("a window must close after it opens", async () => {
    const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Bad window ${randomUUID().slice(0, 6)}`, description: "Checks the window order" } })).json.opportunity;
    const r = await api.call("POST", "/assessments", { token: hr.token, body: { opportunityId: opp.id, title: "Backwards", durationMinutes: 10, questions: [q("One?")], opensAt: hoursFromNow(5), closesAt: hoursFromNow(1) } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, "INVALID_WINDOW");
  });

  test("candidates can only start inside the window, and a late start ends at closing time", async () => {
    const { exam, candidate, application } = await openingWithExam({ opensAt: hoursFromNow(2), closesAt: hoursFromNow(26) });

    const view = await api.call("GET", `/assessment-attempts/by-application/${application.id}`, { token: candidate.token });
    assert.equal(view.json.exams[0].window, "upcoming");
    const early = await choose(candidate, application, exam.id);
    assert.equal(early.status, 409);
    assert.equal(early.json.error.code, "EXAM_NOT_OPEN");

    // It shows on the candidate's calendar (opens and closes) and on HR's.
    const range = `from=${encodeURIComponent(hoursFromNow(-1))}&to=${encodeURIComponent(hoursFromNow(48))}`;
    const mine = (await api.call("GET", `/calendar/events?${range}`, { token: candidate.token })).json.events.filter((e) => e.kind === "exam");
    assert.deepEqual(mine.map((e) => e.edge).sort(), ["closes", "opens"]);
    assert.equal(mine[0].link, `/assessments/${application.id}`);
    const staff = (await api.call("GET", `/calendar/events?${range}`, { token: hr.token })).json.events.filter((e) => e.id.startsWith(`exam:${exam.id}`));
    assert.equal(staff.length, 2);
    const outsider = await api.createUser("candidate");
    assert.equal((await api.call("GET", `/calendar/events?${range}`, { token: outsider.token })).json.events.filter((e) => e.kind === "exam").length, 0);

    // Open the window with 20 minutes left: the attempt is capped at closing time.
    const closesAt = new Date(Date.now() + 20 * 60_000);
    await api.pool.query("UPDATE assessments SET opens_at = now() - interval '1 hour', closes_at = $2 WHERE id = $1", [exam.id, closesAt]);
    const chose = await choose(candidate, application, exam.id);
    assert.equal(chose.status, 201, JSON.stringify(chose.json));
    const started = await api.call("POST", `/assessment-attempts/${chose.json.attempt.id}/start`, { token: candidate.token });
    assert.equal(started.status, 200);
    assert.equal(new Date(started.json.attempt.expiresAt).getTime(), closesAt.getTime());
  });

  test("a closed exam can't be started, and a failed attempt with the window shut completes the stage", async () => {
    const { exam, candidate, application } = await openingWithExam({});
    const chose = await choose(candidate, application, exam.id);
    const started = await api.call("POST", `/assessment-attempts/${chose.json.attempt.id}/start`, { token: candidate.token });
    // Close the window while the candidate is mid-exam, then fail it.
    await api.pool.query("UPDATE assessments SET closes_at = now() + interval '2 seconds' WHERE id = $1", [exam.id]);
    const answers = started.json.questions.map((qq) => ({ questionId: qq.id, selectedOptionId: "b" }));
    await new Promise((r) => setTimeout(r, 2100));
    const submitted = await api.call("POST", `/assessment-attempts/${chose.json.attempt.id}/submit`, { token: candidate.token, body: { answers } });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
    assert.equal(submitted.json.passed, false);
    // One attempt was left, but the window is shut, so the stage is done.
    const status = (await api.pool.query("SELECT status FROM applications WHERE id = $1", [application.id])).rows[0].status;
    assert.equal(status, "assessment_completed");
    const again = await choose(candidate, application, exam.id);
    assert.equal(again.status, 400); // no longer waiting on an exam
  });

  test("clearing the window reopens the exam", async () => {
    const { exam, candidate, application } = await openingWithExam({ closesAt: hoursFromNow(-1), opensAt: hoursFromNow(-3) });
    const closed = await choose(candidate, application, exam.id);
    assert.equal(closed.json.error.code, "EXAM_CLOSED");
    const put = await api.call("PUT", `/assessments/${exam.id}`, { token: hr.token, body: { title: exam.title, durationMinutes: 60, passingScorePercent: 50, maxAttempts: 2, opensAt: null, closesAt: null } });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    assert.equal(put.json.assessment.closesAt, null);
    assert.equal((await choose(candidate, application, exam.id)).status, 201);
  });

  test("invited candidates are told when the window opens and when it's about to close, once each", async () => {
    const { createDb } = await import("../dist/modules/shared/db/client.js");
    const { sendExamWindowReminders } = await import("../dist/modules/assessments/exams.js");
    const { db, pool } = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
    try {
      const { candidate, application } = await openingWithExam({ opensAt: hoursFromNow(-0.2), closesAt: hoursFromNow(10) });
      await sendExamWindowReminders(db);
      await sendExamWindowReminders(db);
      const rows = (await api.pool.query("SELECT kind, link FROM notifications WHERE user_id = $1 AND kind LIKE 'assessment.window%' ORDER BY kind", [candidate.id])).rows;
      assert.deepEqual(rows.map((r) => r.kind), ["assessment.window_closing", "assessment.window_open"]);
      assert.equal(rows[0].link, `/assessments/${application.id}`);
      const mail = (await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1", [candidate.email])).rows;
      assert.ok(mail.some((m) => /is open/.test(m.payload.subject)));
    } finally {
      await pool.end();
    }
  });
});
