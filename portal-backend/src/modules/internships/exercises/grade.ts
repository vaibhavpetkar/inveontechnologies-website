import { checkRules } from "./rules.js";
import { RunnerUnavailableError, type CodeRunner } from "./runner.js";
import type { CheckItem, CheckReport, ExerciseSpec } from "./types.js";

export const MAX_CODE_LENGTH = 20_000;

/** Output comparison ignores trailing spaces, \r and blank lines at the end. */
export function normalizeOutput(text: string, sql = false): string {
  let lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, ""));
  // sqlite prints 3.0 where node prints 3: compare numbers by value.
  if (sql) lines = lines.map((l) => l.split("|").map((f) => (/^-?\d+(\.\d+)?$/.test(f.trim()) ? String(Number(f)) : f)).join("|"));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  while (lines.length && lines[0] === "") lines.shift();
  return lines.join("\n");
}

const clip = (s: string, n = 1500) => (s.length > n ? `${s.slice(0, n)}\n…` : s);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Checks code against an exercise. "Run" (examples only) skips hidden tests;
 * a submission includes them. When the exercise needs the runner and none is
 * available, the report says so and the rules are still checked.
 */
export async function gradeExercise(spec: ExerciseSpec, code: string, runner: CodeRunner | null, opts: { includeHidden: boolean }): Promise<CheckReport> {
  const items: CheckItem[] = [];
  let runnerUnavailable = false;
  const run = spec.check.run;
  if (run) {
    const tests = run.tests.filter((t) => opts.includeHidden || !t.hidden);
    const sql = run.language === "sql";
    const source = sql ? [run.setup ?? "", code, run.after ?? ""].filter((s) => s.trim()).map((s) => s.trim().replace(/;?$/, ";")).join("\n") : code;
    if (!runner) {
      runnerUnavailable = true;
    } else {
      try {
        let compileError: string | null = null;
        let visible = 0;
        let hidden = 0;
        const labels = tests.map((t) => (t.hidden ? `Hidden test ${++hidden}` : `Example ${++visible}`));
        const results = await mapLimit(tests, 3, async (t) => (compileError ? null : runner.run(run.language, source, t.stdin)));
        results.forEach((r, i) => {
          const t = tests[i];
          if (r?.status === "compile_error") compileError ??= r.stderr;
          const actual = r?.stdout ?? "";
          const passed = !!r && r.status === "ok" && normalizeOutput(actual, sql) === normalizeOutput(t.expected, sql);
          const error = compileError ? `Compile error:\n${compileError}` : r && r.status !== "ok" ? `${r.status === "timeout" ? "Time limit exceeded (5 seconds)" : "Runtime error"}${r.stderr ? `:\n${r.stderr}` : ""}` : undefined;
          items.push({
            kind: "test",
            label: labels[i],
            passed: passed && !compileError,
            hidden: t.hidden || undefined,
            ...(t.hidden ? {} : { stdin: t.stdin, expected: t.expected, actual: clip(actual) }),
            ...(error ? { error: clip(error.trim()) } : {}),
          });
        });
      } catch (err) {
        if (!(err instanceof RunnerUnavailableError)) throw err;
        runnerUnavailable = true;
        items.length = 0;
      }
    }
  }
  if (spec.check.rules?.length) items.push(...checkRules(code, spec.editor, spec.check.rules));
  const passedCount = items.filter((i) => i.passed).length;
  const passed = !runnerUnavailable && items.length > 0 && passedCount === items.length;
  return {
    passed,
    runnerUnavailable: runnerUnavailable || undefined,
    items,
    summary: runnerUnavailable
      ? "Your code couldn't be run automatically right now"
      : passed
        ? `All ${items.length} check${items.length === 1 ? "" : "s"} passed`
        : `${passedCount} of ${items.length} checks passed`,
    checkedAt: new Date().toISOString(),
  };
}
