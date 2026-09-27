// LMS: authoring, outline, quizzes with auto-grading, completion and certificates.
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

async function buildCourse({ withCertificate = true } = {}) {
  const course = (await api.call("POST", "/courses", { token: hr.token, body: { title: `Git basics ${Date.now()}`, description: "Version control from zero to pull requests." } })).json.course;
  const m1 = (await api.call("POST", `/courses/${course.id}/modules`, { token: hr.token, body: { title: "Start" } })).json.module;
  const m2 = (await api.call("POST", `/courses/${course.id}/modules`, { token: hr.token, body: { title: "Check" } })).json.module;
  const video = (await api.call("POST", `/courses/modules/${m1.id}/lessons`, { token: hr.token, body: { title: "Why git", contentType: "video", contentUrl: "https://www.youtube.com/watch?v=abc", durationMinutes: 8 } })).json.lesson;
  const quiz = (await api.call("POST", `/courses/modules/${m2.id}/lessons`, { token: hr.token, body: { title: "Quiz", contentType: "test", passingScorePercent: 60 } })).json.lesson;
  const saved = await api.call("PUT", `/courses/lessons/${quiz.id}/quiz`, {
    token: hr.token,
    body: {
      questions: [
        { questionText: "Save a snapshot?", options: [{ id: "a", text: "git commit" }, { id: "b", text: "git push" }], correctOptionId: "a", explanation: "commit records it locally" },
        { questionText: "Share it?", options: [{ id: "a", text: "git commit" }, { id: "b", text: "git push" }], correctOptionId: "b", points: 2 },
      ],
    },
  });
  assert.equal(saved.status, 200);
  if (withCertificate) {
    const template = (await api.call("POST", "/certificate-templates", { token: hr.token, body: { title: "Completion", bodyTemplate: "This certifies that {{recipientName}} completed {{courseTitle}} on {{issuedDate}}." } })).json.template;
    assert.equal((await api.call("PUT", `/courses/${course.id}`, { token: hr.token, body: { certificateTemplateId: template.id, category: "Engineering" } })).status, 200);
  }
  await api.call("POST", `/courses/${course.id}/publish`, { token: admin.token });
  return { course, m1, m2, video, quiz, questions: saved.json.questions };
}

describe("lms", () => {
  test("learners never see the answer key; authors do", async () => {
    const { course, quiz } = await buildCourse();
    const learner = await api.createUser("intern");
    assert.equal((await api.call("GET", `/courses/lessons/${quiz.id}/quiz`, { token: learner.token })).status, 403); // not enrolled
    await api.call("POST", `/courses/${course.id}/enroll`, { token: learner.token, body: {} });
    const asLearner = (await api.call("GET", `/courses/lessons/${quiz.id}/quiz`, { token: learner.token })).json;
    assert.equal(asLearner.questions.length, 2);
    assert.equal(asLearner.questions[0].correctOptionId, undefined);
    assert.equal(asLearner.questions[0].explanation, undefined);
    assert.equal((await api.call("GET", `/courses/lessons/${quiz.id}/quiz`, { token: hr.token })).json.questions[0].correctOptionId, "a");
  });

  test("a failed quiz can be retaken; passing completes the course and issues the certificate", async () => {
    const { course, video, quiz, questions } = await buildCourse();
    const learner = await api.createUser("intern");
    await api.call("POST", `/courses/${course.id}/enroll`, { token: learner.token, body: {} });
    assert.equal((await api.call("POST", `/lessons/${quiz.id}/complete`, { token: learner.token })).status, 400); // can't self-report a quiz

    const fail = await api.call("POST", `/courses/lessons/${quiz.id}/quiz/submit`, { token: learner.token, body: { answers: [{ questionId: questions[0].id, selectedOptionId: "a" }, { questionId: questions[1].id, selectedOptionId: "a" }] } });
    assert.equal(fail.status, 201);
    assert.equal(fail.json.attempt.scorePercent, 33);
    assert.equal(fail.json.lessonPassed, false);
    assert.equal(fail.json.review[1].correctOptionId, "b");

    await api.call("POST", `/lessons/${video.id}/complete`, { token: learner.token });
    const pass = await api.call("POST", `/courses/lessons/${quiz.id}/quiz/submit`, { token: learner.token, body: { answers: [{ questionId: questions[0].id, selectedOptionId: "b" }, { questionId: questions[1].id, selectedOptionId: "b" }] } });
    assert.equal(pass.json.attempt.scorePercent, 67);
    assert.equal(pass.json.lessonPassed, true);
    assert.equal(pass.json.courseCompleted, true);

    // A later worse attempt doesn't undo the pass.
    const worse = await api.call("POST", `/courses/lessons/${quiz.id}/quiz/submit`, { token: learner.token, body: { answers: [] } });
    assert.equal(worse.json.lessonPassed, true);
    assert.equal(worse.json.bestScorePercent, 67);

    const certs = (await api.call("GET", "/certificates", { token: learner.token })).json.certificates;
    assert.equal(certs.filter((c) => c.courseId === course.id && c.status === "issued").length, 1);
    const kinds = (await api.call("GET", "/notifications", { token: learner.token })).json.notifications.map((n) => n.kind);
    assert.ok(kinds.includes("course.completed"));
    assert.ok(kinds.includes("certificate.issued"));
  });

  test("catalog shows lesson counts and the caller's progress", async () => {
    const { course, video } = await buildCourse({ withCertificate: false });
    const learner = await api.createUser("employee");
    await api.call("POST", `/courses/${course.id}/enroll`, { token: learner.token, body: {} });
    await api.call("POST", `/lessons/${video.id}/complete`, { token: learner.token });
    const row = (await api.call("GET", "/courses/catalog", { token: learner.token })).json.courses.find((c) => c.id === course.id);
    assert.equal(row.lessonCount, 2);
    assert.equal(row.totalMinutes, 8);
    assert.deepEqual(row.enrollment, { status: "enrolled", done: 1, total: 2 });
    assert.equal(row.hasCertificate, false);
  });

  test("authoring: rename, move a lesson between modules, reorder, delete; learners can't", async () => {
    const { course, m1, m2, video, quiz } = await buildCourse({ withCertificate: false });
    const learner = await api.createUser("employee");
    assert.equal((await api.call("PUT", `/courses/lessons/${video.id}`, { token: learner.token, body: { title: "Hack" } })).status, 403);

    assert.equal((await api.call("PUT", `/courses/lessons/${video.id}`, { token: hr.token, body: { title: "Why use git", durationMinutes: 10 } })).json.lesson.title, "Why use git");
    const outline = await api.call("PUT", `/courses/${course.id}/outline`, { token: hr.token, body: { modules: [{ id: m2.id, lessonIds: [quiz.id, video.id] }, { id: m1.id, lessonIds: [] }] } });
    assert.equal(outline.status, 200);
    const detail = (await api.call("GET", `/courses/${course.id}`, { token: hr.token })).json;
    assert.deepEqual(detail.modules.map((m) => m.id), [m2.id, m1.id]);
    assert.deepEqual(detail.lessons.filter((l) => l.moduleId === m2.id).map((l) => l.id), [quiz.id, video.id]);

    const other = await buildCourse({ withCertificate: false });
    assert.equal((await api.call("PUT", `/courses/${course.id}/outline`, { token: hr.token, body: { modules: [{ id: m1.id, lessonIds: [other.video.id] }] } })).status, 400);

    assert.equal((await api.call("DELETE", `/courses/modules/${m1.id}`, { token: hr.token })).status, 200);
    assert.equal((await api.call("GET", `/courses/${course.id}`, { token: hr.token })).json.modules.length, 1);
  });

  test("quiz validation rejects a correct answer that isn't an option", async () => {
    const { quiz } = await buildCourse({ withCertificate: false });
    const r = await api.call("PUT", `/courses/lessons/${quiz.id}/quiz`, { token: hr.token, body: { questions: [{ questionText: "Pick one", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correctOptionId: "z" }] } });
    assert.equal(r.status, 400);
  });
});
