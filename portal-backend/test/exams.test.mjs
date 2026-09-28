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

const q = (text, correct = "a") => ({ questionText: text, options: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }], correctOptionId: correct });

async function openingWithExams(exams) {
  const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Exam role ${randomUUID().slice(0, 6)}`, description: "An opening with a language exam" } })).json.opportunity;
  const created = [];
  for (const e of exams) {
    const r = await api.call("POST", "/assessments", { token: hr.token, body: { opportunityId: opp.id, title: `${e.language} basics`, durationMinutes: 10, passingScorePercent: 50, questions: [q("First?"), q("Second?")], ...e } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    created.push(r.json.assessment);
  }
  await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
  return { opp, exams: created };
}

async function apply(opp) {
  const candidate = await api.createUser("candidate");
  const r = await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} });
  assert.equal(r.status, 201);
  return { candidate, application: r.json.application, examRequired: r.json.examRequired };
}

async function sit(candidate, application, examId, answer) {
  const chose = await api.call("POST", `/assessment-attempts/by-application/${application.id}/choose`, { token: candidate.token, body: { assessmentId: examId } });
  if (chose.status >= 300) return chose;
  const started = await api.call("POST", `/assessment-attempts/${chose.json.attempt.id}/start`, { token: candidate.token });
  const answers = started.json.questions.map((qq) => ({ questionId: qq.id, selectedOptionId: answer }));
  return api.call("POST", `/assessment-attempts/${chose.json.attempt.id}/submit`, { token: candidate.token, body: { answers } });
}

const status = async (id) => (await api.pool.query("SELECT status FROM applications WHERE id = $1", [id])).rows[0].status;

describe("language exams", () => {
  test("applying to an opening with exams goes straight to the exam", async () => {
    const { opp } = await openingWithExams([{ language: "JavaScript" }, { language: "Python" }]);
    const { candidate, application, examRequired } = await apply(opp);
    assert.equal(examRequired, true);
    assert.equal(application.status, "assessment_invited");

    const view = await api.call("GET", `/assessment-attempts/by-application/${application.id}`, { token: candidate.token });
    assert.equal(view.status, 200);
    assert.deepEqual(view.json.exams.map((e) => e.language).sort(), ["JavaScript", "Python"]);
    assert.equal(view.json.exams[0].questionCount, 2);
    assert.equal(view.json.attempts.length, 0);

    const detail = await api.call("GET", `/opportunities/${opp.id}`, { token: candidate.token });
    assert.equal(detail.json.exams.length, 2);
    assert.equal(detail.json.exams[0].correctOptionId, undefined);
  });

  test("openings without an exam keep the normal review path", async () => {
    const { opp } = await openingWithExams([]);
    const { application, examRequired } = await apply(opp);
    assert.equal(examRequired, false);
    assert.equal(application.status, "submitted");
  });

  test("a fail with attempts left keeps the candidate invited; a pass completes the stage", async () => {
    const { opp, exams } = await openingWithExams([{ language: "Java", maxAttempts: 2 }]);
    const { candidate, application } = await apply(opp);

    const first = await sit(candidate, application, exams[0].id, "b");
    assert.equal(first.status, 200);
    assert.equal(first.json.passed, false);
    assert.equal(await status(application.id), "assessment_invited");

    const second = await sit(candidate, application, exams[0].id, "a");
    assert.equal(second.json.passed, true);
    assert.equal(await status(application.id), "assessment_completed");

    const { rows } = await api.pool.query("SELECT attempt_number FROM assessment_attempts WHERE application_id = $1 ORDER BY attempt_number", [application.id]);
    assert.deepEqual(rows.map((r) => r.attempt_number), [1, 2]);
    const hrNote = await api.pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'assessment.passed'", [hr.id]);
    assert.equal(hrNote.rows[0].n, 1);
  });

  test("attempt limit is enforced per exam, and running out everywhere completes the stage", async () => {
    const { opp, exams } = await openingWithExams([{ language: "Go", maxAttempts: 1 }, { language: "Rust", maxAttempts: 1 }]);
    const { candidate, application } = await apply(opp);

    assert.equal((await sit(candidate, application, exams[0].id, "b")).json.passed, false);
    const again = await sit(candidate, application, exams[0].id, "a");
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, "NO_ATTEMPTS_LEFT");
    assert.equal(await status(application.id), "assessment_invited");

    assert.equal((await sit(candidate, application, exams[1].id, "b")).json.passed, false);
    assert.equal(await status(application.id), "assessment_completed");
  });

  test("switching language before starting doesn't use up an attempt", async () => {
    const { opp, exams } = await openingWithExams([{ language: "C#" }, { language: "PHP" }]);
    const { candidate, application } = await apply(opp);
    await api.call("POST", `/assessment-attempts/by-application/${application.id}/choose`, { token: candidate.token, body: { assessmentId: exams[0].id } });
    const switched = await api.call("POST", `/assessment-attempts/by-application/${application.id}/choose`, { token: candidate.token, body: { assessmentId: exams[1].id } });
    assert.equal(switched.status, 201);
    const view = await api.call("GET", `/assessment-attempts/by-application/${application.id}`, { token: candidate.token });
    assert.equal(view.json.attempts.length, 1);
    assert.equal(view.json.exams.find((e) => e.id === exams[0].id).attemptsLeft, 1);
  });

  test("questions are locked once someone has sat the exam; delete falls back to switching off", async () => {
    const { opp, exams } = await openingWithExams([{ language: "Kotlin" }]);
    const body = { title: "Kotlin v2", durationMinutes: 15, passingScorePercent: 60, maxAttempts: 3, language: "Kotlin", questions: [q("Changed?")] };
    assert.equal((await api.call("PUT", `/assessments/${exams[0].id}`, { token: hr.token, body })).status, 200);

    const { candidate, application } = await apply(opp);
    await sit(candidate, application, exams[0].id, "a");
    const locked = await api.call("PUT", `/assessments/${exams[0].id}`, { token: hr.token, body });
    assert.equal(locked.status, 409);
    const { questions, ...meta } = body;
    assert.equal((await api.call("PUT", `/assessments/${exams[0].id}`, { token: hr.token, body: { ...meta, maxAttempts: 2 } })).status, 200);

    const del = await api.call("DELETE", `/assessments/${exams[0].id}`, { token: hr.token });
    assert.deepEqual(del.json, { deleted: false, deactivated: true });
    const list = await api.call("GET", `/assessments?opportunityId=${opp.id}`, { token: hr.token });
    assert.equal(list.json.assessments[0].isActive, false);
    assert.equal(list.json.assessments[0].attemptCount, 1);
  });

  test("candidates can't manage exams", async () => {
    const { exams } = await openingWithExams([{ language: "Swift" }]);
    const candidate = await api.createUser("candidate");
    assert.equal((await api.call("DELETE", `/assessments/${exams[0].id}`, { token: candidate.token })).status, 403);
  });
});

describe("public openings feed", () => {
  test("lists published openings with exam languages, open to any origin", async () => {
    const { opp } = await openingWithExams([{ language: "TypeScript" }]);
    const res = await fetch(`${api.base}/public/openings`, { headers: { Origin: "https://inveontechnologies.in" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("access-control-allow-credentials"), null);
    const json = await res.json();
    const row = json.openings.find((o) => o.id === opp.id);
    assert.ok(row);
    assert.deepEqual(row.examLanguages, ["TypeScript"]);
    assert.match(row.applyUrl, new RegExp(`/opportunities/${opp.id}$`));

    const draft = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: "Hidden draft", description: "Not published yet" } })).json.opportunity;
    assert.equal(json.openings.some((o) => o.id === draft.id), false);
  });
});
