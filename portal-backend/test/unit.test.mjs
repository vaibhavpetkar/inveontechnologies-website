// Pure-function tests — no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAttempt } from "../dist/modules/assessments/scoring.js";
import { toCsv } from "../dist/modules/reports/csv.js";
import { checkEligibility } from "../dist/modules/applications/eligibility.js";
import { isAdminTransitionAllowed, isCandidateTransitionAllowed, isSystemTransitionAllowed } from "../dist/modules/applications/state-machine.js";
import { isAssigneeTransitionAllowed, isReviewerTransitionAllowed } from "../dist/modules/tasks/state-machine.js";
import { formatBusinessId } from "../dist/modules/shared/business-id.js";
import { slugify } from "../dist/modules/shared/slugify.js";
import { renderEmailHtml } from "../dist/modules/shared/email-html.js";

test("scoreAttempt weights points and treats unanswered as wrong", () => {
  const questions = [
    { id: "q1", correctOptionId: "a", points: 1 },
    { id: "q2", correctOptionId: "b", points: 3 },
  ];
  const r = scoreAttempt(questions, [{ questionId: "q2", selectedOptionId: "b" }], 60);
  assert.equal(r.scorePercent, 75);
  assert.equal(r.passed, true);
  assert.deepEqual(r.answers.map((a) => a.isCorrect), [false, true]);
  assert.equal(scoreAttempt([], [], 60).scorePercent, 0);
});

test("toCsv quotes separators and neutralizes spreadsheet formulas", () => {
  const csv = toCsv([
    { a: "=HYPERLINK(\"x\")", b: "plain, with comma", c: -5, d: "@cmd", e: null },
  ]);
  const [header, row] = csv.split("\n");
  assert.equal(header, "a,b,c,d,e");
  assert.equal(row, `"'=HYPERLINK(""x"")","plain, with comma",-5,'@cmd,`);
  assert.equal(toCsv([]), "");
});

test("checkEligibility only flags criteria the candidate actually misses", () => {
  const criteria = { minCgpa: 7, degrees: ["B.Tech"], maxGraduationYear: 2026 };
  assert.equal(checkEligibility(criteria, { cgpa: "8.1", degree: "B.Tech", graduationYear: 2025 }).eligible, true);
  const r = checkEligibility(criteria, { cgpa: "6.5", degree: "MBA", graduationYear: 2027 });
  assert.equal(r.reasons.length, 3);
  assert.equal(checkEligibility(criteria, { cgpa: null, degree: null, graduationYear: null }).eligible, true);
});

test("application state machine", () => {
  assert.equal(isAdminTransitionAllowed("submitted", "under_review"), true);
  assert.equal(isAdminTransitionAllowed("submitted", "selected"), false);
  assert.equal(isAdminTransitionAllowed("selected", "rejected"), false);
  assert.equal(isCandidateTransitionAllowed("shortlisted", "withdrawn"), true);
  assert.equal(isCandidateTransitionAllowed("selected", "withdrawn"), false);
  assert.equal(isSystemTransitionAllowed("assessment_invited", "assessment_completed"), true);
  assert.equal(isSystemTransitionAllowed("under_review", "assessment_completed"), false);
});

test("task state machine", () => {
  assert.equal(isAssigneeTransitionAllowed("todo", "in_progress"), true);
  assert.equal(isAssigneeTransitionAllowed("in_review", "done"), false);
  assert.equal(isReviewerTransitionAllowed("in_review", "done"), true);
  assert.equal(isReviewerTransitionAllowed("done", "cancelled"), false);
});

test("business ids and slugs", () => {
  const year = new Date().getFullYear();
  assert.equal(formatBusinessId("OPP", 7), `OPP-${year}-00007`);
  assert.equal(formatBusinessId("INV-EMP", 12), "INV-EMP-000012");
  assert.equal(slugify("  Node.js & React!! "), "node-js-react");
});

test("emails get an HTML twin: escaped text, links as buttons, footer note moved down", () => {
  const appUrl = "https://portal.example.in";
  const html = renderEmailHtml({
    appUrl,
    subject: "Offer <for> you",
    text: `Hi <b>Asha</b>, see https://example.com/a?x=1&y=2.\n\nOpen it in the portal:\n${appUrl}/journey/1\n\nYou can turn these emails off from the notifications menu in the portal.`,
  });
  assert.match(html, /Offer &lt;for&gt; you/);
  assert.match(html, /Hi &lt;b&gt;Asha&lt;\/b&gt;/, "text is escaped, never rendered as HTML");
  assert.match(html, /href="https:\/\/example.com\/a\?x=1&amp;y=2"/, "inline links are clickable, without the trailing full stop");
  assert.match(html, />Open in the portal<\/a>/, "a link on its own line becomes a button");
  assert.doesNotMatch(html, /Open it in the portal:/);
  assert.ok(html.indexOf("You can turn these emails off") > html.indexOf("Open in the portal"), "the opt-out note sits in the footer");
  assert.doesNotMatch(html, /Reply to this email/, "no reply line without a reply-to address");
});
