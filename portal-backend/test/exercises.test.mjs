import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { checkRules, parseCss, parseHtml, querySelectorAll, stripComments } from "../dist/modules/internships/exercises/rules.js";
import { gradeExercise, normalizeOutput } from "../dist/modules/internships/exercises/grade.js";
import { judge0Runner, localRunner, runnerFromEnv } from "../dist/modules/internships/exercises/runner.js";
import { EXERCISES } from "../dist/modules/internships/exercises/bank/index.js";
import { SKILLS } from "../dist/modules/internships/catalog-skills.js";

describe("static checks", () => {
  test("the HTML parser and selectors handle nesting, attributes, classes and child combinators", () => {
    const dom = parseHtml(`<!DOCTYPE html><body><header><nav class="main nav"><a href="/" aria-current="page">Home</a><a href="/about">About</a></nav></header>
      <main><form method="post"><label for="e">Email</label><input id="e" type="email" required><br><button>Send</button></form></main>
      <!-- <footer>not real</footer> --><script>if (a < b) {}</script></body>`);
    assert.equal(querySelectorAll(dom, "nav.main a").length, 2);
    assert.equal(querySelectorAll(dom, "header > nav > a[aria-current=page]").length, 1);
    assert.equal(querySelectorAll(dom, "body > a").length, 0);
    assert.equal(querySelectorAll(dom, "form[method=post] input[type=email][required]").length, 1);
    assert.equal(querySelectorAll(dom, "form button").length, 1, "void elements don't swallow their siblings");
    assert.equal(querySelectorAll(dom, "footer").length, 0, "comments are ignored");
    assert.equal(querySelectorAll(dom, "a[href^='/a'], #e").length, 2);
  });

  test("the CSS parser keeps media query context and at-rules", () => {
    const sheet = parseCss(`/* c */ .card { display: flex; gap: 1rem } @media (min-width: 768px) { .card, .box > p { flex-direction: row; } } @keyframes fade { from { opacity: 0 } }`);
    assert.equal(sheet.rules.length, 3);
    assert.deepEqual(sheet.rules[1].selectors, [".card", ".box>p"]);
    assert.deepEqual(sheet.rules[1].context, ["@media (min-width: 768px)"]);
    assert.deepEqual(sheet.atRules.map((a) => a.name), ["media", "keyframes"]);
  });

  test("rules can't be satisfied by comments, but strings survive", () => {
    assert.equal(stripComments(`// for (;;)\nconst u = "http://x"; /* while */`, "javascript").trim(), `const u = "http://x";`);
    assert.equal(stripComments(`# import os\nprint("#1")`, "python").trim(), `print("#1")`);
    const items = checkRules(`// uses a for loop\nconsole.log(1)`, "javascript", [{ match: String.raw`\bfor\s*\(`, message: "Uses a for loop" }]);
    assert.equal(items[0].passed, false);
    const css = checkRules(`.menu { flex-direction: column } @media (min-width: 768px) { .menu { flex-direction: row } }`, "css", [
      { css: ".menu", prop: "flex-direction", value: "^row$", inside: "min-width:\\s*768px", message: "row on wide screens" },
      { css: ".menu", prop: "flex-direction", value: "^row$", inside: "max-width", message: "not in another query" },
    ]);
    assert.deepEqual(css.map((i) => i.passed), [true, false]);
  });

  test("output comparison ignores trailing whitespace; SQL numbers compare by value", () => {
    assert.equal(normalizeOutput("a  \r\nb\n\n"), "a\nb");
    assert.equal(normalizeOutput("x|3.0|2.50", true), normalizeOutput("x|3|2.5", true));
  });
});

describe("grading", () => {
  const spec = {
    editor: "javascript",
    starter: "",
    check: { run: { language: "javascript", tests: [{ stdin: "1", expected: "2" }, { stdin: "5", expected: "10", hidden: true }] }, rules: [{ match: "\\*", message: "Multiplies" }] },
  };
  const fake = { name: "judge0", run: async (_l, src, stdin) => ({ status: "ok", stdout: src === "ok" ? String(Number(stdin) * 2) : "0", stderr: "" }) };

  test("run checks examples only; submit adds the hidden tests; rules always apply", async () => {
    const run = await gradeExercise(spec, "ok", fake, { includeHidden: false });
    assert.deepEqual(run.items.map((i) => [i.kind, i.label, i.passed]), [["test", "Example 1", true], ["rule", "Multiplies", false]]);
    const submit = await gradeExercise(spec, "ok", fake, { includeHidden: true });
    assert.equal(submit.items.filter((i) => i.hidden).length, 1);
    assert.equal(submit.items.find((i) => i.hidden).stdin, undefined);
    assert.equal(submit.passed, false);
  });

  test("without a runner the tests are skipped and the report says so", async () => {
    const r = await gradeExercise(spec, "a * b", null, { includeHidden: true });
    assert.equal(r.runnerUnavailable, true);
    assert.equal(r.passed, false);
    assert.deepEqual(r.items.map((i) => i.kind), ["rule"]);
  });

  test("the local runner is refused in production", () => {
    assert.equal(runnerFromEnv({ NODE_ENV: "production", PORTAL_CODE_RUNNER: "local" }), null);
    assert.equal(runnerFromEnv({ NODE_ENV: "development", PORTAL_CODE_RUNNER: "local" }).name, "local");
    assert.equal(runnerFromEnv({ NODE_ENV: "production" }), null);
    assert.equal(runnerFromEnv({ NODE_ENV: "production", PORTAL_JUDGE0_URL: "https://judge0.example.com" }).name, "judge0");
  });

  test("the Judge0 runner sends base64 code with the token and maps compile errors", async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const json = JSON.parse(body);
        seen.push({ url: req.url, token: req.headers["x-auth-token"], json });
        const src = Buffer.from(json.source_code, "base64").toString();
        const out = src.includes("broken") ? { status: { id: 6 }, compile_output: Buffer.from("error: x").toString("base64") } : { status: { id: 3 }, stdout: Buffer.from("hi\n").toString("base64") };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out));
      });
    });
    await new Promise((r) => server.listen(0, r));
    try {
      const runner = judge0Runner({ url: `http://127.0.0.1:${server.address().port}/`, key: "secret", languageIds: "python=92" });
      assert.deepEqual(await runner.run("python", "print('hi')", "in"), { status: "ok", stdout: "hi\n", stderr: "" });
      assert.equal((await runner.run("c", "broken", "")).status, "compile_error");
      assert.equal(seen[0].url, "/submissions?base64_encoded=true&wait=true");
      assert.equal(seen[0].token, "secret");
      assert.equal(seen[0].json.language_id, 92);
      assert.equal(Buffer.from(seen[0].json.stdin, "base64").toString(), "in");
      assert.equal(seen[1].json.language_id, 50);
    } finally {
      server.close();
    }
  });
});

describe("exercise bank", () => {
  test("every skill has 10+ exercises with unique titles that don't clash with its projects", () => {
    for (const skill of SKILLS) {
      const bank = EXERCISES[skill.key];
      assert.ok(bank && bank.length >= 10, `${skill.key} has ${bank?.length ?? 0} exercises`);
      const titles = bank.map((e) => e.title);
      assert.equal(new Set(titles).size, titles.length, `${skill.key} repeats a title`);
      for (const p of skill.assignments) assert.ok(!titles.includes(p.title), `${skill.key}: "${p.title}" is also a project`);
      for (const e of bank) {
        const run = e.check.run;
        if (run && run.language !== "sql") assert.ok(run.tests.some((t) => t.hidden) && run.tests.some((t) => !t.hidden), `${skill.key}/${e.title} needs examples and hidden tests`);
        if (!run) assert.ok(e.check.rules.length >= 3, `${skill.key}/${e.title} needs 3+ rules`);
      }
    }
  });

  test("reference solutions pass and starters don't (rule-checked, JavaScript and Python)", async () => {
    const runner = localRunner();
    for (const [skill, bank] of Object.entries(EXERCISES)) {
      for (const e of bank) {
        const lang = e.check.run?.language;
        if (lang && lang !== "javascript" && lang !== "python") continue; // other compilers: npx tsx src/modules/internships/exercises/verify.ts
        const good = await gradeExercise(e, e.solution, runner, { includeHidden: true });
        assert.ok(good.passed, `${skill}/${e.title}: ${JSON.stringify(good.items.filter((i) => !i.passed))}`);
        const bad = await gradeExercise(e, e.starter, runner, { includeHidden: true });
        assert.ok(!bad.passed, `${skill}/${e.title}: the starter passes`);
      }
    }
  });
});
