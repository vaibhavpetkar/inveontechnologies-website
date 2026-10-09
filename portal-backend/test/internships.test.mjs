import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startServer, JWT_SECRET } from "./helpers.mjs";
import { allocateRoadmap, nextMonday } from "../dist/modules/internships/service.js";
import { TRACKS, trackSkills } from "../dist/modules/internships/catalog-tracks.js";
import { SKILLS } from "../dist/modules/internships/catalog-skills.js";
import { EXERCISES } from "../dist/modules/internships/exercises/bank/index.js";

let api, admin, hr, manager;

before(async () => {
  api = await startServer({ PORTAL_CODE_RUNNER: "local" });
  admin = await api.createUser("admin");
  hr = await api.createUser("hr");
  manager = await api.createUser("manager");
});
after(async () => {
  await api?.stop();
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

/** Enrolls a new candidate in the track's course and passes (or fails) its final exam. */
async function takeExam(track, { pass = true, candidate } = {}) {
  candidate ??= await api.createUser("candidate");
  const enrolled = await api.call("POST", `/courses/${track.courseId}/enroll`, { token: candidate.token, body: {} });
  assert.ok([201, 409].includes(enrolled.status), JSON.stringify(enrolled.json));
  const { rows } = await api.pool.query("SELECT q.id, q.correct_option_id FROM lesson_quiz_questions q JOIN internship_tracks t ON t.exam_lesson_id = q.lesson_id WHERE t.slug = $1", [track.slug]);
  const lessonId = (await api.pool.query("SELECT exam_lesson_id FROM internship_tracks WHERE slug = $1", [track.slug])).rows[0].exam_lesson_id;
  const start = await api.call("POST", `/courses/lessons/${lessonId}/quiz/start`, { token: candidate.token });
  assert.equal(start.status, 201, JSON.stringify(start.json));
  // Failing: only every third answer right (about 33%).
  const answers = rows.map((q, i) => ({ questionId: q.id, selectedOptionId: pass || i % 3 === 0 ? q.correct_option_id : "z" }));
  const submit = await api.call("POST", `/courses/lessons/${lessonId}/quiz/submit`, { token: candidate.token, body: { attemptId: start.json.attempt.id, answers } });
  assert.equal(submit.status, 201, JSON.stringify(submit.json));
  return { candidate, submit: submit.json };
}

describe("roadmap allocation", () => {
  test("every assignment of a track appears exactly once, split across repeated months", () => {
    for (const seed of TRACKS) {
      const bySkill = new Map(SKILLS.map((s) => [s.key, s.assignments.map((a, i) => ({ id: `${s.key}-${i}`, maxMarks: 10 }))]));
      const phases = allocateRoadmap(seed.roadmap, bySkill);
      const ids = phases.flatMap((p) => p.skills.flatMap((s) => s.assignments.map((a) => a.id)));
      assert.equal(new Set(ids).size, ids.length, `${seed.slug} has duplicates`);
      assert.equal(ids.length, trackSkills(seed.roadmap).length * 5, `${seed.slug} misses assignments`);
      assert.equal(phases.length, 6);
    }
    assert.equal(nextMonday(new Date("2026-09-30T10:00:00Z")).toISOString().slice(0, 10), "2026-10-05");
    assert.equal(nextMonday(new Date("2026-10-05T10:00:00Z")).toISOString().slice(0, 10), "2026-10-12");
  });
});

describe("internship tracks", () => {
  test("admins install six tracks once, with courses, exams, openings, 85 projects and 170 exercises", async () => {
    assert.equal((await api.call("POST", "/internships/install", { token: hr.token })).status, 403);
    const first = await api.call("POST", "/internships/install", { token: admin.token });
    assert.equal(first.status, 201);
    assert.equal(first.json.created.length, 6);
    const again = await api.call("POST", "/internships/install", { token: admin.token });
    assert.deepEqual(again.json.created, []);

    const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM track_assignments");
    assert.equal(rows[0].n, 255);
    assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM track_assignments WHERE kind = 'exercise'")).rows[0].n, 170);
    const list = await api.call("GET", "/internships", { token: (await api.createUser("candidate")).token });
    assert.equal(list.json.tracks.length, 6);
    const js = list.json.tracks.find((t) => t.slug === "full-stack-javascript");
    assert.equal(js.fee, 3000);
    assert.equal(js.graduateFee, 5000);
    assert.equal(js.assignmentCount, 120);
    assert.equal(js.me.offer, null);
    const opp = (await api.pool.query("SELECT kind, status, program_fee, trial_hours FROM opportunities WHERE id = $1", [js.opportunityId])).rows[0];
    assert.deepEqual({ ...opp, program_fee: Number(opp.program_fee) }, { kind: "program", status: "published", program_fee: 3000, trial_hours: 0 });
  });

  test("failing the exam gives nothing; passing it issues the offer letter by email, and direct applications are turned away", async () => {
    const tracks = (await api.call("GET", "/internships", { token: admin.token })).json.tracks;
    const track = tracks.find((t) => t.slug === "full-stack-javascript");

    const failed = await takeExam(track, { pass: false });
    assert.equal(failed.submit.attempt.passed, false);
    assert.equal(failed.submit.internship, null);

    const { candidate, submit } = await takeExam(track);
    assert.equal(submit.attempt.passed, true);
    assert.equal(submit.internship.trackSlug, "full-stack-javascript");
    assert.ok(submit.internship.offerId);

    const page = await api.call("GET", "/internships/full-stack-javascript", { token: candidate.token });
    assert.equal(page.json.me.enrollment.status, "awaiting_choice");
    assert.match(page.json.me.offer.referenceNo, /^INV\/HR\/INT\/\d{4}\/\d{4}$/);
    assert.equal(page.json.me.unlocked, false);
    assert.equal(page.json.progress.total, 120);
    assert.equal(page.json.phases[0].skills[0].key, "html");

    const emailed = await waitFor(async () => (await api.pool.query("SELECT emailed_at FROM participant_offers WHERE id = $1", [submit.internship.offerId])).rows[0].emailed_at);
    assert.ok(emailed);
    assert.match(api.logs(), /Internship-Offer-Full-Stack-JavaScript\.pdf/);
    const pdf = await fetch(`${api.base}/internships/offers/${submit.internship.offerId}/pdf`, { headers: { Authorization: `Bearer ${candidate.token}` } });
    assert.equal(pdf.status, 200);
    const stranger = await api.createUser("candidate");
    assert.equal((await fetch(`${api.base}/internships/offers/${submit.internship.offerId}/pdf`, { headers: { Authorization: `Bearer ${stranger.token}` } })).status, 403);

    // No graduation year on the profile: the student fee, joining next Monday for six months.
    const issued = (await api.pool.query("SELECT fee, fee_category, work_mode, joining_date, end_date FROM participant_offers WHERE id = $1", [submit.internship.offerId])).rows[0];
    assert.equal(Number(issued.fee), 3000);
    assert.equal(issued.fee_category, "student");
    assert.equal(issued.work_mode, "Remote");
    assert.ok(issued.joining_date && issued.end_date);
    assert.match(api.logs(), /Internship-Program-Policy-v\d+\.pdf/);

    // Staff switch it to the graduate fee; the payment amount follows, and it can be emailed again.
    assert.equal((await api.call("GET", "/internships/offers", { token: candidate.token })).status, 403);
    const listed = await api.call("GET", "/internships/offers", { token: admin.token });
    assert.ok(listed.json.offers.some((o) => o.id === submit.internship.offerId && o.paymentStatus === "awaiting_choice"));
    const edit = { feeCategory: "graduate", fee: 5000, workMode: "Hybrid", joiningDate: "2026-11-02", endDate: "2027-05-01" };
    assert.equal((await api.call("PUT", `/internships/offers/${submit.internship.offerId}`, { token: admin.token, body: { ...edit, endDate: "2026-10-01" } })).json.error.code, "INVALID_DATES");
    const edited = await api.call("PUT", `/internships/offers/${submit.internship.offerId}`, { token: admin.token, body: edit });
    assert.equal(edited.status, 200, JSON.stringify(edited.json));
    assert.equal((await api.pool.query("SELECT amount FROM program_enrollments WHERE id = (SELECT enrollment_id FROM participant_offers WHERE id = $1)", [submit.internship.offerId])).rows[0].amount, "5000.00");
    assert.equal((await api.call("POST", `/internships/offers/${submit.internship.offerId}/resend`, { token: admin.token })).json.emailQueued, true);
    const offerPdf = await fetch(`${api.base}/internships/offers/${submit.internship.offerId}/pdf`, { headers: { Authorization: `Bearer ${admin.token}` } });
    assert.equal(Buffer.from(await offerPdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");

    const direct = await api.call("POST", `/applications/opportunities/${track.opportunityId}/apply`, { token: stranger.token, body: {} });
    assert.equal(direct.json.error.code, "APPLY_VIA_TRACK");

    // Passing again (another attempt) doesn't issue a second offer.
    const again = await takeExam(track, { candidate });
    assert.equal(again.submit.internship.offerId, submit.internship.offerId);
    assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM participant_offers WHERE user_id = $1", [candidate.id])).rows[0].n, 1);
  });

  test("paying unlocks the roadmap and hires them as an intern; mentors approve with marks or ask for changes", async () => {
    const track = (await api.call("GET", "/internships", { token: admin.token })).json.tracks.find((t) => t.slug === "frontend-react");
    const { candidate } = await takeExam(track);
    const page = (await api.call("GET", `/internships/${track.slug}`, { token: candidate.token })).json;
    const assignment = page.phases[0].skills[0].assignments.find((a) => a.kind === "project");

    const locked = await api.call("POST", `/internships/assignments/${assignment.id}/submit`, { token: candidate.token, body: { repoUrl: "https://github.com/me/profile" } });
    assert.equal(locked.json.error.code, "ROADMAP_LOCKED");

    const paid = await api.call("POST", `/program/enrollments/${page.me.enrollment.id}/mark-paid`, { token: hr.token, body: { note: "UPI reference 1234" } });
    assert.equal(paid.status, 200, JSON.stringify(paid.json));
    const employee = (await api.pool.query("SELECT e.employee_type, e.duration_months, u.role FROM employees e JOIN users u ON u.id = e.user_id WHERE e.user_id = $1", [candidate.id])).rows[0];
    assert.deepEqual(employee, { employee_type: "intern", duration_months: 6, role: "intern" });
    const app = (await api.pool.query("SELECT status FROM applications WHERE id = $1", [page.me.enrollment.applicationId])).rows[0];
    assert.equal(app.status, "selected");
    const adminNote = (await api.pool.query("SELECT title FROM notifications WHERE user_id = $1 AND kind = 'internship.hired'", [admin.id])).rows;
    assert.equal(adminNote.length, 1);

    // Their role is now intern; a fresh token carries it.
    const intern = { ...candidate, token: jwt.sign({ sub: candidate.id, role: "intern" }, JWT_SECRET, { expiresIn: "15m" }) };

    assert.equal((await api.call("POST", `/internships/assignments/${assignment.id}/submit`, { token: intern.token, body: { notes: "too short" } })).status, 400);
    const sub = await api.call("POST", `/internships/assignments/${assignment.id}/submit`, { token: intern.token, body: { repoUrl: "https://github.com/me/profile", linkUrl: "https://me.github.io/profile", notes: "Validated with W3C." } });
    assert.equal(sub.status, 201, JSON.stringify(sub.json));

    const queue = await api.call("GET", "/internships/reviews/queue?status=submitted", { token: manager.token });
    const item = queue.json.submissions.find((s) => s.id === sub.json.submission.id);
    assert.ok(item);
    assert.equal(item.trackSlug, "frontend-react");
    assert.equal((await api.call("GET", "/internships/reviews/queue", { token: intern.token })).status, 403);

    const changes = await api.call("POST", `/internships/submissions/${item.id}/review`, { token: manager.token, body: { decision: "changes" } });
    assert.equal(changes.json.error.code, "FEEDBACK_REQUIRED");
    assert.equal((await api.call("POST", `/internships/submissions/${item.id}/review`, { token: manager.token, body: { decision: "changes", feedback: "Add alt text to the photo." } })).status, 200);
    assert.equal((await api.call("POST", `/internships/submissions/${item.id}/review`, { token: manager.token, body: { decision: "approve", marks: 8 } })).status, 409, "not waiting any more");

    const resub = await api.call("POST", `/internships/assignments/${assignment.id}/submit`, { token: intern.token, body: { repoUrl: "https://github.com/me/profile", notes: "Added alt text." } });
    assert.equal(resub.status, 200);
    assert.equal(resub.json.submission.attempt, 2);
    assert.equal((await api.call("POST", `/internships/submissions/${item.id}/review`, { token: manager.token, body: { decision: "approve", marks: 11 } })).json.error.code, "MARKS_TOO_HIGH");
    assert.equal((await api.call("POST", `/internships/submissions/${item.id}/review`, { token: manager.token, body: { decision: "approve", marks: 9, feedback: "Clean markup." } })).status, 200);
    assert.equal((await api.call("POST", `/internships/assignments/${assignment.id}/submit`, { token: intern.token, body: { repoUrl: "https://github.com/me/x" } })).json.error.code, "ALREADY_APPROVED");

    const after = (await api.call("GET", `/internships/${track.slug}`, { token: intern.token })).json;
    assert.equal(after.me.unlocked, true);
    assert.equal(after.progress.approved, 1);
    assert.equal(after.progress.marks, 9);
    const interns = (await api.call("GET", "/internships/reviews/interns", { token: hr.token })).json.interns;
    const row = interns.find((i) => i.userId === candidate.id);
    assert.equal(row.approved, 1);
    assert.equal(row.total, 90);
  });
  test("coding exercises are checked automatically: examples on run, hidden tests on submit, full marks when everything passes", async () => {
    const track = (await api.call("GET", "/internships", { token: admin.token })).json.tracks.find((t) => t.slug === "full-stack-javascript");
    const { candidate } = await takeExam(track);
    const before = (await api.call("GET", `/internships/${track.slug}`, { token: candidate.token })).json;
    const locked = before.phases[0].skills[0].assignments.find((a) => a.kind === "exercise");
    assert.deepEqual(Object.keys(locked.exercise), ["editor"], "nothing but the language before joining");
    assert.equal((await api.call("POST", `/internships/assignments/${locked.id}/run`, { token: candidate.token, body: { code: "x" } })).json.error.code, "ROADMAP_LOCKED");
    await api.call("POST", `/program/enrollments/${before.me.enrollment.id}/mark-paid`, { token: hr.token, body: { note: "cash" } });
    const intern = { ...candidate, token: jwt.sign({ sub: candidate.id, role: "intern" }, JWT_SECRET, { expiresIn: "15m" }) };

    const page = (await api.call("GET", `/internships/${track.slug}`, { token: intern.token })).json;
    const all = page.phases.flatMap((p) => p.skills.flatMap((s) => s.assignments));
    const sum = all.find((a) => a.title === "Sum of two numbers");
    assert.equal(sum.kind, "exercise");
    assert.equal(sum.maxMarks, 5);
    const seed = EXERCISES.javascript.find((e) => e.title === "Sum of two numbers");
    const visible = seed.check.run.tests.filter((t) => !t.hidden);
    assert.deepEqual(sum.exercise.examples, visible.map((t) => ({ stdin: t.stdin, expected: t.expected })));
    assert.equal(sum.exercise.hiddenTests, seed.check.run.tests.length - visible.length);
    assert.ok(!JSON.stringify(page).includes(seed.solution), "the reference solution never leaves the server");

    // Run: examples only, nothing saved. A wrong answer shows expected vs actual.
    const wrong = `const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(" ").map(Number);\nconsole.log(a * b);\n`;
    const run = await api.call("POST", `/internships/assignments/${sum.id}/run`, { token: intern.token, body: { code: wrong } });
    assert.equal(run.status, 200, JSON.stringify(run.json));
    assert.equal(run.json.report.passed, false);
    assert.equal(run.json.report.items.length, visible.length);
    assert.ok(run.json.report.items.every((i) => !i.hidden && i.expected !== undefined));
    assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM assignment_submissions WHERE user_id = $1", [candidate.id])).rows[0].n, 0);

    // Submit wrong: hidden tests run too, no input or output shown for them; it isn't a mentor's job.
    const failed = await api.call("POST", `/internships/assignments/${sum.id}/submit`, { token: intern.token, body: { code: wrong } });
    assert.equal(failed.status, 201, JSON.stringify(failed.json));
    assert.equal(failed.json.submission.status, "changes_requested");
    const hidden = failed.json.report.items.filter((i) => i.hidden);
    assert.equal(hidden.length, seed.check.run.tests.length - visible.length);
    assert.ok(hidden.every((i) => i.stdin === undefined && i.expected === undefined && i.actual === undefined));
    const queue = (await api.call("GET", "/internships/reviews/queue?status=changes_requested", { token: manager.token })).json;
    assert.ok(!queue.submissions.some((s) => s.id === failed.json.submission.id));

    // Submit the right answer: approved with full marks, no mentor needed.
    const passed = await api.call("POST", `/internships/assignments/${sum.id}/submit`, { token: intern.token, body: { code: seed.solution } });
    assert.equal(passed.status, 200);
    assert.equal(passed.json.report.passed, true);
    assert.equal(passed.json.submission.status, "approved");
    assert.equal(passed.json.submission.marks, 5);
    assert.equal(passed.json.submission.attempt, 2);
    assert.equal((await api.call("POST", `/internships/assignments/${sum.id}/submit`, { token: intern.token, body: { code: seed.solution } })).json.error.code, "ALREADY_APPROVED");
    const approvedQueue = (await api.call("GET", "/internships/reviews/queue?status=approved", { token: manager.token })).json;
    const row = approvedQueue.submissions.find((s) => s.id === passed.json.submission.id);
    assert.equal(row.autoChecked, true);
    assert.equal(row.code, seed.solution);

    // Rule-checked exercise (HTML): no code runs, the structure is inspected.
    const html = EXERCISES.html[0];
    const htmlItem = all.find((a) => a.title === html.title);
    assert.deepEqual(htmlItem.exercise.requirements, html.check.rules.map((r) => r.message));
    const starter = await api.call("POST", `/internships/assignments/${htmlItem.id}/run`, { token: intern.token, body: { code: html.starter } });
    assert.equal(starter.json.report.passed, false);
    const good = await api.call("POST", `/internships/assignments/${htmlItem.id}/submit`, { token: intern.token, body: { code: html.solution } });
    assert.equal(good.json.submission.status, "approved");

    const after = (await api.call("GET", `/internships/${track.slug}`, { token: intern.token })).json;
    assert.equal(after.progress.approved, 2);
    assert.equal(after.progress.marks, 10);
    const mine = after.phases.flatMap((p) => p.skills.flatMap((s) => s.assignments)).find((a) => a.id === sum.id);
    assert.equal(mine.submission.code, seed.solution);
    assert.equal(mine.submission.checkReport.passed, true);
    assert.equal((await api.call("POST", `/internships/assignments/${sum.id}/run`, { token: intern.token, body: { code: "" } })).status, 400);
  });
});
