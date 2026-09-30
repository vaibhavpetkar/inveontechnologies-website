/**
 * Checks the practice-course catalog: every reference solution passes all
 * of its checks (hidden tests included) with no line flagged as an error by
 * the reviewer, every starter fails, and each course and unit has enough
 * content. Runs code on this machine, so it's a development tool:
 *
 *   npx tsx src/modules/courses/practice/verify.ts [course ...]
 */
import { slugify } from "../../shared/slugify.js";
import { gradeExercise } from "../../internships/exercises/grade.js";
import { localRunner } from "../../internships/exercises/runner.js";
import { PRACTICE_COURSES } from "./catalog/index.js";

const MIN_QUESTIONS = 50;
const MIN_QUIZ_PER_UNIT = 8;

async function main() {
  const wanted = process.argv.slice(2);
  const runner = localRunner();
  let problems = 0;
  let unverified = 0;
  const keys = new Set<string>();
  for (const course of PRACTICE_COURSES.filter((c) => !wanted.length || wanted.includes(c.key))) {
    const issues: string[] = [];
    if (keys.has(course.key)) issues.push("duplicate course key");
    keys.add(course.key);
    const total = course.units.reduce((n, u) => n + u.questions.length, 0);
    if (total < MIN_QUESTIONS) issues.push(`only ${total} assignment questions (need ${MIN_QUESTIONS}+)`);
    const unitKeys = new Set<string>();
    for (const unit of course.units) {
      if (unitKeys.has(unit.key)) issues.push(`${unit.key}: duplicate unit key`);
      unitKeys.add(unit.key);
      if (unit.quiz.length < MIN_QUIZ_PER_UNIT) issues.push(`${unit.key}: only ${unit.quiz.length} quiz questions (need ${MIN_QUIZ_PER_UNIT}+)`);
      if (unit.reading.split(/\s+/).length < 250) issues.push(`${unit.key}: the reading is short (${unit.reading.split(/\s+/).length} words)`);
      for (const q of unit.quiz) {
        if (q.answer < 0 || q.answer >= q.options.length) issues.push(`${unit.key} quiz "${q.q.slice(0, 40)}": answer index out of range`);
        if (new Set(q.options).size !== q.options.length) issues.push(`${unit.key} quiz "${q.q.slice(0, 40)}": duplicate options`);
      }
      const qKeys = new Set<string>();
      for (const ex of unit.questions) {
        const where = `${unit.key} / ${ex.title}`;
        const key = slugify(ex.title);
        if (qKeys.has(key)) issues.push(`${where}: duplicate title`);
        qKeys.add(key);
        const run = ex.check.run;
        if (!run && (ex.check.rules?.length ?? 0) < 3) issues.push(`${where}: rule-checked questions need at least 3 rules`);
        if (run && run.language !== "sql" && (!run.tests.some((t) => !t.hidden) || !run.tests.some((t) => t.hidden))) issues.push(`${where}: needs at least one example and one hidden test`);
        try {
          const good = await gradeExercise(ex, ex.solution, runner, { includeHidden: true, review: true });
          if (good.runnerUnavailable) {
            unverified++;
            console.log(`? ${course.key} / ${where}: can't run ${run?.language} here, solution not verified`);
          } else if (!good.passed) {
            const failed = good.items.filter((i) => !i.passed).map((i) => `${i.label}${i.error ? ` [${i.error.split("\n").slice(0, 3).join(" ")}]` : i.actual !== undefined ? ` [got ${JSON.stringify(i.actual)} want ${JSON.stringify(i.expected)}]` : ""}`);
            const lines = (good.review ?? []).filter((f) => f.severity === "error").map((f) => `line ${f.line}: ${f.message}`);
            issues.push(`${where}: solution fails: ${[...failed, ...lines].join("; ")}`);
          }
          const warnings = (good.review ?? []).filter((f) => f.severity === "warning");
          if (warnings.length) issues.push(`${where}: the reviewer warns about the solution: ${warnings.map((f) => `line ${f.line}: ${f.message}`).join("; ")}`);
          const bad = await gradeExercise(ex, ex.starter, runner, { includeHidden: true, review: true });
          if (bad.passed) issues.push(`${where}: the starter already passes`);
        } catch (err) {
          issues.push(`${where}: ${(err as Error).message}`);
        }
      }
    }
    problems += issues.length;
    const quiz = course.units.reduce((n, u) => n + u.quiz.length, 0);
    console.log(`${issues.length ? "✗" : "✓"} ${course.key}: ${course.units.length} units, ${total} questions, ${quiz} quiz questions`);
    for (const i of issues) console.log(`   - ${i}`);
  }
  console.log(problems ? `\n${problems} problem(s)` : `\nAll good${unverified ? ` (${unverified} not runnable on this machine)` : ""}`);
  process.exit(problems ? 1 : 0);
}

main();
