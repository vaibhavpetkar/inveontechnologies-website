// LMS part 2: internship programs with auto-enrollment, timed exams that
// resume after a reload, and PDF certificates.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api, admin, hr;

before(async () => {
  api = await startServer();
  admin = await api.createUser("admin");
  hr = await api.createUser("hr");
});
after(async () => api?.stop());

async function publishedCourse(title, { timed } = {}) {
  const course = (await api.call("POST", "/courses", { token: hr.token, body: { title: `${title} ${Date.now()}`, description: "A course used by the programs tests." } })).json.course;
  const mod = (await api.call("POST", `/courses/${course.id}/modules`, { token: hr.token, body: { title: "Only" } })).json.module;
  const exam = (await api.call("POST", `/courses/modules/${mod.id}/lessons`, { token: hr.token, body: { title: "Final exam", contentType: "test", passingScorePercent: 50, ...(timed ? { timeLimitMinutes: timed, maxAttempts: 2 } : {}) } })).json.lesson;
  const saved = await api.call("PUT", `/courses/lessons/${exam.id}/quiz`, {
    token: hr.token,
    body: { questions: [
      { questionText: "Two plus two?", options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correctOptionId: "a" },
      { questionText: "Capital of India?", options: [{ id: "a", text: "Mumbai" }, { id: "b", text: "New Delhi" }], correctOptionId: "b" },
    ] },
  });
  await api.call("POST", `/courses/${course.id}/publish`, { token: admin.token });
  return { course, exam, questions: saved.json.questions };
}

async function applyAndSelect(opp, candidate) {
  const application = (await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} })).json.application;
  for (const toStatus of ["under_review", "shortlisted", "selected"]) {
    const r = await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  return application;
}

const myCourses = async (user) => (await api.call("GET", "/courses/catalog", { token: user.token })).json.courses.filter((c) => c.enrollment);

describe("internship programs", () => {
  test("a program stores its terms and linked courses, and filters by kind", async () => {
    const { course } = await publishedCourse("Onboarding track");
    const draft = (await api.call("POST", "/courses", { token: hr.token, body: { title: `Draft ${Date.now()}`, description: "Not published yet, hidden from applicants." } })).json.course;
    const res = await api.call("POST", "/opportunities", {
      token: hr.token,
      body: { title: `Summer Internship ${Date.now()}`, description: "Twelve weeks building real features.", kind: "internship", durationMonths: 3, stipendAmount: 15000, startDate: "2026-11-02T00:00:00.000Z", location: "Pune (hybrid)", courseIds: [course.id, draft.id] },
    });
    assert.equal(res.status, 201);
    const opp = res.json.opportunity;
    assert.equal(opp.kind, "internship");
    assert.equal(Number(opp.stipendAmount), 15000);
    await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });

    const candidate = await api.createUser("candidate");
    const detail = (await api.call("GET", `/opportunities/${opp.id}`, { token: candidate.token })).json;
    assert.deepEqual(detail.courses.map((c) => c.id), [course.id]); // draft course hidden
    assert.equal((await api.call("GET", `/opportunities/${opp.id}`, { token: hr.token })).json.courses.length, 2);

    const internships = (await api.call("GET", "/opportunities?kind=internship", { token: candidate.token })).json.opportunities;
    assert.ok(internships.some((o) => o.id === opp.id));
    assert.ok(!(await api.call("GET", "/opportunities?kind=job", { token: candidate.token })).json.opportunities.some((o) => o.id === opp.id));

    assert.equal((await api.call("POST", "/opportunities", { token: hr.token, body: { title: "Bad links", description: "Links a course that doesn't exist.", courseIds: ["00000000-0000-0000-0000-000000000000"] } })).status, 400);
  });

  test("selection into a program enrolls the participant in its courses", async () => {
    const { course } = await publishedCourse("Program course");
    const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Data program ${Date.now()}`, description: "A six-week training program.", kind: "program", courseIds: [course.id] } })).json.opportunity;
    await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
    const candidate = await api.createUser("candidate");
    await applyAndSelect(opp, candidate);

    const enrolled = await myCourses(candidate);
    assert.deepEqual(enrolled.map((c) => c.id), [course.id]);
    const { rows } = await api.pool.query("SELECT payment_status FROM course_enrollments WHERE user_id = $1", [candidate.id]);
    assert.equal(rows[0].payment_status, "not_required");
    const inbox = (await api.call("GET", "/notifications", { token: candidate.token })).json.notifications;
    assert.ok(inbox.some((n) => n.kind === "course.enrolled"));
  });

  test("an internship enrolls on offer acceptance, not on selection", async () => {
    const { course } = await publishedCourse("Intern track");
    const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Intern ${Date.now()}`, description: "Internship with a training track.", kind: "internship", courseIds: [course.id] } })).json.opportunity;
    await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
    const candidate = await api.createUser("candidate");
    const application = await applyAndSelect(opp, candidate);
    assert.equal((await myCourses(candidate)).length, 0);

    const offer = (await api.call("POST", `/applications/${application.id}/offers`, { token: hr.token, body: { content: "We are happy to offer you the internship." } })).json.offer;
    assert.equal((await api.call("POST", `/offers/${offer.id}/send`, { token: admin.token })).status, 200);
    assert.equal((await api.call("POST", `/offers/${offer.id}/accept`, { token: candidate.token })).status, 200);
    assert.deepEqual((await myCourses(candidate)).map((c) => c.id), [course.id]);
  });
});

describe("timed exams", () => {
  test("start, save answers, reload to resume, then submit", async () => {
    const { course, exam, questions } = await publishedCourse("Timed", { timed: 20 });
    const learner = await api.createUser("intern");
    await api.call("POST", `/courses/${course.id}/enroll`, { token: learner.token, body: {} });

    // A timed exam can't be submitted without starting it.
    assert.equal((await api.call("POST", `/courses/lessons/${exam.id}/quiz/submit`, { token: learner.token, body: { answers: [] } })).json.error.code, "NOT_STARTED");

    const start = await api.call("POST", `/courses/lessons/${exam.id}/quiz/start`, { token: learner.token });
    assert.equal(start.status, 201);
    const attempt = start.json.attempt;
    const minutes = (new Date(attempt.deadlineAt) - new Date(attempt.startedAt)) / 60000;
    assert.equal(minutes, 20);

    const draft = [{ questionId: questions[0].id, selectedOptionId: "a" }];
    assert.equal((await api.call("PUT", `/courses/quiz-attempts/${attempt.id}/answers`, { token: learner.token, body: { answers: draft } })).status, 200);
    const stranger = await api.createUser("intern");
    assert.equal((await api.call("PUT", `/courses/quiz-attempts/${attempt.id}/answers`, { token: stranger.token, body: { answers: draft } })).status, 404);

    // "Reload": the quiz comes back with the attempt in progress and its answers.
    const again = (await api.call("GET", `/courses/lessons/${exam.id}/quiz`, { token: learner.token })).json;
    assert.equal(again.inProgress.id, attempt.id);
    assert.deepEqual(again.inProgress.answers, draft);
    assert.equal(again.attemptsLeft, 2);
    const resumed = await api.call("POST", `/courses/lessons/${exam.id}/quiz/start`, { token: learner.token });
    assert.equal(resumed.json.resumed, true);
    assert.equal(resumed.json.attempt.id, attempt.id);

    const done = await api.call("POST", `/courses/lessons/${exam.id}/quiz/submit`, { token: learner.token, body: { attemptId: attempt.id, answers: [...draft, { questionId: questions[1].id, selectedOptionId: "b" }] } });
    assert.equal(done.status, 201);
    assert.equal(done.json.attempt.scorePercent, 100);
    assert.equal(done.json.attemptsLeft, 1);
    assert.equal((await api.call("POST", `/courses/lessons/${exam.id}/quiz/submit`, { token: learner.token, body: { attemptId: attempt.id, answers: [] } })).json.error.code, "ATTEMPT_SUBMITTED");
  });

  test("when time runs out the saved answers are graded, and attempts run out", async () => {
    const { course, exam, questions } = await publishedCourse("Expiry", { timed: 5 });
    const learner = await api.createUser("intern");
    await api.call("POST", `/courses/${course.id}/enroll`, { token: learner.token, body: {} });

    const first = (await api.call("POST", `/courses/lessons/${exam.id}/quiz/start`, { token: learner.token })).json.attempt;
    await api.call("PUT", `/courses/quiz-attempts/${first.id}/answers`, { token: learner.token, body: { answers: [{ questionId: questions[0].id, selectedOptionId: "a" }] } });
    // Wind the clock: the deadline passed a minute ago.
    await api.pool.query("UPDATE lesson_quiz_attempts SET deadline_at = now() - interval '1 minute' WHERE id = $1", [first.id]);

    // Too late to save or to change answers on submit: the saved ones count.
    assert.equal((await api.call("PUT", `/courses/quiz-attempts/${first.id}/answers`, { token: learner.token, body: { answers: [] } })).json.error.code, "TIME_UP");
    const late = await api.call("POST", `/courses/lessons/${exam.id}/quiz/submit`, { token: learner.token, body: { attemptId: first.id, answers: questions.map((q) => ({ questionId: q.id, selectedOptionId: q.correctOptionId ?? "a" })) } });
    assert.equal(late.json.late, true);
    assert.equal(late.json.attempt.scorePercent, 50);

    // Second attempt expires unsubmitted and is graded when the quiz is next opened.
    const second = (await api.call("POST", `/courses/lessons/${exam.id}/quiz/start`, { token: learner.token })).json.attempt;
    await api.pool.query("UPDATE lesson_quiz_attempts SET deadline_at = now() - interval '1 minute' WHERE id = $1", [second.id]);
    const view = (await api.call("GET", `/courses/lessons/${exam.id}/quiz`, { token: learner.token })).json;
    assert.equal(view.inProgress, null);
    assert.equal(view.attemptsLeft, 0);
    assert.equal(view.attempts[0].scorePercent, 0);
    assert.equal((await api.call("POST", `/courses/lessons/${exam.id}/quiz/start`, { token: learner.token })).json.error.code, "NO_ATTEMPTS_LEFT");
  });
});

describe("certificate PDF", () => {
  test("an issued certificate downloads as a PDF; a revoked one doesn't", async () => {
    const { course, exam, questions } = await publishedCourse("Certified");
    const template = (await api.call("POST", "/certificate-templates", { token: hr.token, body: { title: "Completion", bodyTemplate: "This certifies that {{recipientName}} completed {{courseTitle}}." } })).json.template;
    await api.call("PUT", `/courses/${course.id}`, { token: hr.token, body: { certificateTemplateId: template.id } });
    const learner = await api.createUser("intern");
    await api.pool.query("UPDATE users SET full_name = 'Ananya Kapoor' WHERE id = $1", [learner.id]);
    await api.call("POST", `/courses/${course.id}/enroll`, { token: learner.token, body: {} });
    const passed = await api.call("POST", `/courses/lessons/${exam.id}/quiz/submit`, { token: learner.token, body: { answers: [{ questionId: questions[0].id, selectedOptionId: "a" }, { questionId: questions[1].id, selectedOptionId: "b" }] } });
    assert.equal(passed.json.courseCompleted, true);

    const { rows } = await api.pool.query("SELECT id, verification_code FROM certificates WHERE user_id = $1", [learner.id]);
    const code = rows[0].verification_code;
    const verify = (await api.call("GET", `/certificates/verify/${code}`)).json;
    assert.equal(verify.recipientName, "Ananya Kapoor"); // employee names come from the user record

    const pdf = await fetch(`${api.base}/certificates/verify/${code}/pdf?download=1`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.match(pdf.headers.get("content-disposition"), /^attachment; filename=".*-certificate\.pdf"$/);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");

    await api.call("POST", `/certificates/${rows[0].id}/revoke`, { token: admin.token, body: { reason: "Issued in error" } });
    assert.equal((await fetch(`${api.base}/certificates/verify/${code}/pdf`)).status, 410);
  });
});
