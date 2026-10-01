/**
 * Checks the exercise bank: every reference solution passes all of its
 * checks (hidden tests included) and every starter does not. Runs code on
 * this machine, so it's a development tool:
 *
 *   npx tsx src/modules/internships/exercises/verify.ts [skill ...]
 */
import { SKILLS } from "../catalog-skills.js";
import { gradeExercise } from "./grade.js";
import { localRunner } from "./runner.js";
import type { ExerciseSeed } from "./types.js";

const MIN_PER_SKILL = 10;

async function main() {
  const wanted = process.argv.slice(2);
  const skills = SKILLS.map((s) => s.key).filter((k) => !wanted.length || wanted.includes(k));
  const runner = localRunner();
  let failures = 0;
  let unverified = 0;
  for (const skill of skills) {
    let bank: ExerciseSeed[];
    try {
      bank = (await import(`./bank/${skill}.js`)).default as ExerciseSeed[];
    } catch (err) {
      console.log(`✗ ${skill}: no bank file (${(err as Error).message.split("\n")[0]})`);
      failures++;
      continue;
    }
    const problems: string[] = [];
    if (bank.length < MIN_PER_SKILL) problems.push(`only ${bank.length} exercises (need ${MIN_PER_SKILL}+)`);
    const titles = new Set<string>();
    for (const ex of bank) {
      const where = `${skill} / ${ex.title}`;
      if (titles.has(ex.title)) problems.push(`${where}: duplicate title`);
      titles.add(ex.title);
      const run = ex.check.run;
      if (!run && !ex.check.rules?.length) problems.push(`${where}: no checks`);
      if (run && run.language !== "sql" && (!run.tests.some((t) => !t.hidden) || !run.tests.some((t) => t.hidden))) problems.push(`${where}: needs at least one example and one hidden test`);
      if (!run && (ex.check.rules?.length ?? 0) < 3) problems.push(`${where}: rule-checked exercises need at least 3 rules`);
      try {
        const good = await gradeExercise(ex, ex.solution, runner, { includeHidden: true });
        if (good.runnerUnavailable) {
          unverified++;
          console.log(`? ${where}: can't run ${run?.language} here, solution not verified`);
        } else if (!good.passed) {
          const failed = good.items.filter((i) => !i.passed).map((i) => `${i.label}${i.error ? ` [${i.error.split("\n").slice(0, 3).join(" ")}]` : i.actual !== undefined ? ` [got ${JSON.stringify(i.actual)} want ${JSON.stringify(i.expected)}]` : ""}`);
          problems.push(`${where}: solution fails: ${failed.join("; ")}`);
        }
        const bad = await gradeExercise(ex, ex.starter, runner, { includeHidden: true });
        if (bad.passed) problems.push(`${where}: the starter code already passes`);
      } catch (err) {
        problems.push(`${where}: ${(err as Error).message}`);
      }
    }
    if (problems.length) {
      failures += problems.length;
      console.log(`✗ ${skill} (${bank.length} exercises)`);
      for (const p of problems) console.log(`   - ${p}`);
    } else {
      console.log(`✓ ${skill}: ${bank.length} exercises verified`);
    }
  }
  console.log(failures ? `\n${failures} problem(s)` : `\nAll good${unverified ? ` (${unverified} not runnable on this machine)` : ""}`);
  process.exit(failures ? 1 : 0);
}

main();
