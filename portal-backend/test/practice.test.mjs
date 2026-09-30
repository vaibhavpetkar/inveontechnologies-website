// Practice courses: the line-by-line reviewer, lenient output matching,
// installing the catalog, per-question uploads, failure emails and completion.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";
import { reviewCode, parseErrorOutput } from "../dist/modules/internships/exercises/review.js";
import { gradeExercise, matchTokens, forbiddenWord } from "../dist/modules/internships/exercises/grade.js";
import { localRunner } from "../dist/modules/internships/exercises/runner.js";
import { failureEmail } from "../dist/modules/courses/practice/email.js";
import { fileTypeAllowed } from "../dist/modules/courses/practice/files.js";
import { describeCourse } from "../dist/modules/courses/practice/install.js";
import { PRACTICE_COURSES } from "../dist/modules/courses/practice/catalog/index.js";

const lines = (code, editor) => reviewCode(code, editor, { runs: true }).map((f) => [f.line, f.severity, f.message]);
const find = (list, line, text) => list.find(([l, , m]) => l === line && m.includes(text));

describe("line-by-line reviewer", () => {
  test("flags Turbo C habits, missing &, wrong placeholders and = in conditions, on the right lines", () => {
    const r = lines(`#include<stdio.h>
#include<conio.h>
void main()
{
  int a,b,sum;
  float avg;
  clrscr();
  scanf("%d%d",a,&b);
  sum=a+b
  avg = sum / 2;
  printf("Sum=%d avg=%d",sum,avg);
  if(sum=10)
    printf("ten");
  getch();
}`, "c");
    assert.ok(find(r, 2, "conio.h"), "conio.h");
    assert.ok(find(r, 3, "int main"), "void main");
    assert.ok(find(r, 7, "clrscr"), "clrscr");
    assert.ok(find(r, 8, "&a"), "scanf without &");
    assert.ok(find(r, 9, "Missing \";\""), "missing semicolon");
    assert.ok(find(r, 10, "divides two integers"), "integer division into a float");
    assert.ok(find(r, 11, "%f"), "%d for a float");
    assert.ok(find(r, 12, "=="), "assignment in a condition");
    assert.ok(find(r, 14, "getch"), "getch");
  });

  test("a clean program has no findings except tips", () => {
    const r = reviewCode(`#include <stdio.h>

int main(void) {
    int n, sum = 0;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) sum += i;
    printf("%d\\n", sum);
    return 0;
}
`, "c").filter((f) => f.severity !== "tip");
    assert.deepEqual(r, []);
  });

  test("other languages: Python 2 print and input() maths, Java class name, CSS typos, Dockerfile, bash", () => {
    assert.ok(find(lines(`n = input()\nfor i in range(n)\n    print(i)\nprint "x"`, "python"), 1, "int(input())"));
    assert.ok(find(lines(`n = input()\nfor i in range(n)\n    print(i)`, "python"), 2, "colon"));
    assert.ok(find(lines(`public class Student {\n  public static void main(String[] args) {}\n}`, "java"), 1, "Main"));
    assert.equal(reviewCode(`public class Student {}`, "java", { runs: false }).filter((f) => f.severity === "error").length, 0, "rule-checked Java may use any class name");
    assert.ok(find(lines(`.box {\n  colour: red;\n  width: 100\n  height: 2px;\n}`, "css"), 2, "did you mean \"color\""));
    assert.ok(find(lines(`.box {\n  colour: red;\n  width: 100\n  height: 2px;\n}`, "css"), 3, "needs a unit"));
    assert.ok(find(lines(`RUN apt-get install curl\nFROM node:20`, "dockerfile"), 1, "must start with FROM"));
    assert.ok(find(lines(`name = "x"`, "bash"), 1, "no spaces around ="));
    assert.ok(find(lines(`<div><img src="a.png"></body>`, "html"), 1, "alt"));
  });

  test("compiler and runtime output become line-numbered findings with a plain explanation", () => {
    const gcc = parseErrorOutput("main.c: In function 'main':\nmain.c:10:3: error: expected ';' before 'avg'\n", "c", "compiler");
    assert.equal(gcc[0].line, 10);
    assert.match(gcc[0].message, /A ; is missing/);
    const py = parseErrorOutput('Traceback (most recent call last):\n  File "main.py", line 3, in <module>\nZeroDivisionError: division by zero\n', "python", "runtime");
    assert.equal(py[0].line, 3);
    assert.match(py[0].message, /Division by zero/);
    const java = parseErrorOutput('Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 5\n\tat Main.main(Main.java:7)\n', "java", "runtime");
    assert.equal(java[0].line, 7);
  });
});

describe("lenient output matching", () => {
  test("prompts are fine, numbers compare by value, order matters", () => {
    assert.equal(matchTokens("Enter two numbers: Sum = 15.00\n", "15").ok, true);
    assert.equal(matchTokens("Total: 350\nPercentage: 70.000000", "350 70").ok, true);
    assert.equal(matchTokens("70 350", "350 70").ok, false);
    assert.deepEqual(matchTokens("Sum = 14", "Sum 15"), { ok: false, missing: "15", after: "sum" });
  });

  test("forbidden words only count on the answer line, after any prompt", () => {
    assert.equal(forbiddenWord("Enter a year: Not a leap year\n", ["not"]), "not");
    assert.equal(forbiddenWord("Is it a leap year or not? Answer: Leap year\n", ["not"]), null);
    assert.equal(forbiddenWord("1. Positive or negative\n2. Odd or even\nChoice: Even\n", ["odd"]), null);
  });

  test("a wrong answer gets a hint pointing at what's missing", async () => {
    const spec = { editor: "c", starter: "", check: { run: { language: "c", match: "tokens", tests: [{ stdin: "4 5", expected: "9" }, { stdin: "1 1", expected: "2", hidden: true }] } } };
    const fake = { name: "local", run: async () => ({ status: "ok", stdout: "Sum = 20\n", stderr: "" }) };
    const r = await gradeExercise(spec, "int main(void) { return 0; }", fake, { includeHidden: true, review: true });
    assert.equal(r.passed, false);
    assert.match(r.items[0].hint, /missing "9"/);
    assert.equal(r.items[1].hint, undefined, "hidden tests get no hint");
  });
});

describe("catalog", () => {
  test("every course has 50+ questions, unique keys, a generated description and quizzes", () => {
    const keys = new Set();
    for (const c of PRACTICE_COURSES) {
      assert.ok(!keys.has(c.key), `duplicate ${c.key}`);
      keys.add(c.key);
      assert.ok(c.units.reduce((n, u) => n + u.questions.length, 0) >= 50, `${c.key} has fewer than 50 questions`);
      for (const u of c.units) assert.ok(u.quiz.length >= 8, `${c.key}/${u.key} quiz`);
      const d = describeCourse(c);
      assert.match(d, /line by line/);
      for (const u of c.units) assert.ok(d.includes(u.title), `${c.key} description lists ${u.title}`);
    }
  });

  test("C solutions pass with no line flagged, starters fail", async () => {
    const runner = localRunner();
    const c = PRACTICE_COURSES.find((x) => x.key === "c");
    for (const u of c.units.slice(0, 2)) {
      for (const q of u.questions) {
        const good = await gradeExercise(q, q.solution, runner, { includeHidden: true, review: true });
        assert.ok(good.passed, `${u.key}/${q.title}: ${JSON.stringify(good.items.filter((i) => !i.passed))} ${JSON.stringify(good.review)}`);
        const bad = await gradeExercise(q, q.starter, runner, { includeHidden: true, review: true });
        assert.ok(!bad.passed, `${u.key}/${q.title}: the starter passes`);
      }
    }
  });

  test("upload file types follow the question's language", () => {
    assert.ok(fileTypeAllowed("sum.c", "c"));
    assert.ok(!fileTypeAllowed("sum.py", "c"));
    assert.ok(fileTypeAllowed("Dockerfile", "dockerfile"));
    assert.ok(fileTypeAllowed("ci.yml", "yaml"));
  });

  test("the failure email lists lines to fix and failed tests", () => {
    const mail = failureEmail({
      name: "Asha",
      courseTitle: "C Programming",
      lessonTitle: "Assignment 1",
      questionTitle: "Sum of two numbers",
      fileName: "sum.c",
      link: "https://portal.example/learn/x/y",
      report: {
        passed: false,
        summary: "0 of 2 checks passed",
        checkedAt: "",
        items: [{ kind: "test", label: "Example 1", passed: false, stdin: "4 5", expected: "9", actual: "0", hint: 'Your output is missing "9".' }, { kind: "test", label: "Hidden test 1", passed: false, hidden: true }],
        review: [{ line: 8, severity: "error", source: "review", message: "scanf needs the address of a: write &a." }, { line: 2, severity: "tip", source: "review", message: "a tip" }],
      },
    });
    assert.equal(mail.subject, "Fix needed: Sum of two numbers (C Programming)");
    assert.match(mail.text, /Line 8 \(must fix\): scanf needs the address/);
    assert.doesNotMatch(mail.text, /a tip/);
    assert.match(mail.text, /Example 1: input "4 5", expected "9", your program printed "0"/);
    assert.match(mail.text, /hidden input/);
    assert.match(mail.text, /https:\/\/portal\.example\/learn\/x\/y/);
  });
});

describe("assignment uploads", () => {
  let api, admin, hr, courseId, lessonId, questions;
  const cBasics = () => PRACTICE_COURSES.find((x) => x.key === "c").units[0];

  before(async () => {
    api = await startServer({ PORTAL_CODE_RUNNER: "local" });
    admin = await api.createUser("admin");
    hr = await api.createUser("hr");
  });
  after(async () => api?.stop());

  test("admins install the C course once; installing again only tops it up", async () => {
    assert.equal((await api.call("POST", "/courses/practice/install", { token: hr.token, body: { keys: ["c"] } })).status, 403);
    const first = await api.call("POST", "/courses/practice/install", { token: admin.token, body: { keys: ["c"] } });
    assert.ok([200, 201].includes(first.status));
    const again = await api.call("POST", "/courses/practice/install", { token: admin.token, body: { keys: ["c"] } });
    assert.equal(again.status, 200);
    assert.deepEqual(again.json.updated, ["c"]);
    const { rows } = await api.pool.query("SELECT id, description FROM courses WHERE catalog_key = 'c'");
    assert.equal(rows.length, 1);
    assert.match(rows[0].description, /reviewed automatically, line by line/);
    courseId = rows[0].id;
    const lesson = await api.pool.query("SELECT id FROM course_lessons WHERE catalog_key = 'c/basics/assignment'");
    lessonId = lesson.rows[0].id;
    const counts = (await api.pool.query("SELECT (SELECT count(*)::int FROM lesson_code_questions q JOIN course_lessons l ON l.id = q.lesson_id JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = $1) AS q, (SELECT count(*)::int FROM course_lessons WHERE catalog_key = 'c/final') AS final", [courseId])).rows[0];
    assert.ok(counts.q >= 50);
    assert.equal(counts.final, 1);
    const catalog = (await api.call("GET", "/courses/practice/catalog", { token: hr.token })).json;
    assert.equal(catalog.courses.find((c) => c.key === "c").courseId, courseId);
  });

  test("learners must enroll; they never see solutions or hidden tests", async () => {
    const learner = await api.createUser("candidate");
    assert.equal((await api.call("GET", `/courses/lessons/${lessonId}/assignment`, { token: learner.token })).status, 403);
    await api.call("POST", `/courses/${courseId}/enroll`, { token: learner.token, body: {} });
    const sheet = (await api.call("GET", `/courses/lessons/${lessonId}/assignment`, { token: learner.token })).json;
    questions = sheet.questions;
    assert.equal(questions.length, cBasics().questions.length);
    const text = JSON.stringify(sheet);
    assert.ok(!text.includes("solution"));
    assert.ok(!text.includes("123456 654321"), "hidden test input leaked");
    assert.equal(questions[0].hiddenTests, 2);
    assert.ok(questions[0].fileTypes.includes(".c"));
    assert.equal(questions[0].lenient, true);
    const preview = (await api.call("GET", `/courses/lessons/${lessonId}/assignment`, { token: hr.token })).json;
    assert.equal(preview.preview, true);
  });

  test("a failed upload gets a line-by-line review and one email; passing every question completes the assignment", async () => {
    const learner = await api.createUser("candidate");
    await api.call("POST", `/courses/${courseId}/enroll`, { token: learner.token, body: {} });
    const sum = questions[0];
    const url = `/courses/lessons/${lessonId}/assignment/${sum.id}`;

    const wrongType = await api.call("POST", `${url}/submit`, { token: learner.token, body: { code: "print(1)", fileName: "sum.py" } });
    assert.equal(wrongType.status, 400);
    assert.equal(wrongType.json.error.code, "WRONG_FILE_TYPE");

    const turbo = `#include<stdio.h>\n#include<conio.h>\nvoid main()\n{\n  int a,b;\n  clrscr();\n  scanf("%d %d",&a,&b);\n  printf("Sum = %d",a+b);\n  getch();\n}\n`;
    const bad = await api.call("POST", `${url}/submit`, { token: learner.token, body: { code: turbo, fileName: "sum.c" } });
    assert.equal(bad.status, 201);
    assert.equal(bad.json.submission.status, "failed");
    assert.equal(bad.json.emailed, true);
    assert.ok(bad.json.report.review.some((f) => f.line === 2 && /conio/.test(f.message)));
    const mail = (await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1", [learner.email])).rows;
    assert.equal(mail.length, 1);
    assert.match(mail[0].payload.subject, /Fix needed: Sum of two numbers/);
    assert.match(mail[0].payload.text, /Line 2/);

    const again = await api.call("POST", `${url}/submit`, { token: learner.token, body: { code: turbo, fileName: "sum.c" } });
    assert.equal(again.json.emailed, false, "one email per question every 10 minutes");

    const check = await api.call("POST", `${url}/check`, { token: learner.token, body: { code: cBasics().questions[0].solution } });
    assert.equal(check.status, 200);
    assert.equal(check.json.report.items.filter((i) => i.hidden).length, 0, "a check runs the examples only");

    assert.equal((await api.call("POST", `/lessons/${lessonId}/complete`, { token: learner.token })).status, 400);

    const seeds = cBasics().questions;
    let last;
    for (const q of questions) {
      const seed = seeds.find((s) => s.title === q.title);
      last = await api.call("POST", `/courses/lessons/${lessonId}/assignment/${q.id}/submit`, { token: learner.token, body: { code: seed.solution, fileName: "answer.c" } });
      assert.equal(last.json.submission?.status, "passed", `${q.title}: ${last.status} ${JSON.stringify(last.json)}`);
    }
    assert.deepEqual(last.json.assignment, { done: questions.length, total: questions.length, completed: true });
    const progress = (await api.call("GET", `/courses/${courseId}/progress`, { token: learner.token })).json;
    const row = (progress.progress ?? progress.lessons ?? []).find?.((p) => p.lessonId === lessonId);
    if (row) assert.equal(row.status, "completed");

    const history = (await api.call("GET", `${url}/history`, { token: learner.token })).json.submissions;
    assert.equal(history.length, 3);
    assert.equal(history[0].status, "passed");

    const sheet = (await api.call("GET", `/courses/lessons/${lessonId}/assignment`, { token: learner.token })).json;
    assert.equal(sheet.questions[0].submission.attempts, 3);

    const results = (await api.call("GET", `/courses/lessons/${lessonId}/assignment-results`, { token: hr.token })).json;
    const me = results.learners.find((l) => l.userId === learner.id);
    assert.equal(me.results[sum.id].status, "passed");
    assert.equal((await api.call("GET", `/courses/lessons/${lessonId}/assignment-results`, { token: learner.token })).status, 403);
  });
});
