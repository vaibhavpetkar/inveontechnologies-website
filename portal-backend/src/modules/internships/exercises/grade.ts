import { checkRules } from "./rules.js";
import { RunnerUnavailableError, type CodeRunner } from "./runner.js";
import { parseErrorOutput, reviewCode } from "./review.js";
import type { CheckItem, CheckReport, ExerciseSpec, ReviewFinding } from "./types.js";

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

// ---------- Lenient ("tokens") comparison ----------

const TOKEN = /-?\d+(?:\.\d+)?|[\p{L}_]+/gu;

/** The words and numbers in some output, lower-cased; punctuation and layout are ignored. */
export function outputTokens(text: string): string[] {
  return (text.match(TOKEN) ?? []).map((t) => t.toLowerCase());
}

const isNumber = (t: string) => /^-?\d+(\.\d+)?$/.test(t);
function sameToken(got: string, want: string) {
  if (isNumber(got) && isNumber(want)) return Math.abs(Number(got) - Number(want)) <= Math.max(0.011, Math.abs(Number(want)) * 1e-6);
  return got === want;
}

/**
 * True when every expected word and number appears in the output in the
 * same order (other text in between, like input prompts, is fine). Returns
 * the first expected token that couldn't be found otherwise.
 */
export function matchTokens(actual: string, expected: string): { ok: true } | { ok: false; missing: string; after: string | null } {
  const got = outputTokens(actual);
  const want = outputTokens(expected);
  let at = 0;
  for (const [i, w] of want.entries()) {
    while (at < got.length && !sameToken(got[at], w)) at++;
    if (at >= got.length) return { ok: false, missing: w, after: i > 0 ? want[i - 1] : null };
    at++;
  }
  return { ok: true };
}

/**
 * The first forbidden word in the answer: the last line printed, after its
 * last ":" (so menus and prompts like "Enter a number:" don't count).
 */
export function forbiddenWord(actual: string, forbid: string[] | undefined): string | null {
  if (!forbid?.length) return null;
  const last = actual.replace(/\r/g, "").split("\n").filter((l) => l.trim()).pop() ?? "";
  const answer = outputTokens(last.slice(last.lastIndexOf(":") + 1));
  return forbid.map((w) => w.toLowerCase()).find((w) => answer.includes(w)) ?? null;
}

/** One sentence saying where the output first differs, for the student. */
export function explainMismatch(actual: string, expected: string, mode: "exact" | "tokens", sql = false): string | undefined {
  if (!actual.trim()) return "Your program didn't print anything. Check that you print the result (printf, cout, print, System.out.println, echo...).";
  if (mode === "tokens") {
    const m = matchTokens(actual, expected);
    if (m.ok) return undefined;
    return `Your output is missing "${m.missing}"${m.after ? ` (it should come after "${m.after}")` : ""}. Check the calculation and what you print.`;
  }
  const a = normalizeOutput(actual, sql).split("\n");
  const e = normalizeOutput(expected, sql).split("\n");
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] === e[i]) continue;
    if (a[i] === undefined) return `Your output stops after line ${a.length}; line ${i + 1} should be "${e[i]}".`;
    if (e[i] === undefined) return `Your output has extra lines from line ${i + 1} ("${a[i]}"). Print only what's asked.`;
    if (a[i].trim() === e[i].trim()) return `Line ${i + 1} has different spacing at the start: expected "${e[i]}", got "${a[i]}".`;
    if (a[i].toLowerCase() === e[i].toLowerCase()) return `Line ${i + 1} differs only in capital letters: expected "${e[i]}", got "${a[i]}".`;
    return `Line ${i + 1} is different: expected "${e[i]}", your program printed "${a[i]}".`;
  }
  return undefined;
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
export async function gradeExercise(spec: ExerciseSpec, code: string, runner: CodeRunner | null, opts: { includeHidden: boolean; review?: boolean }): Promise<CheckReport> {
  const items: CheckItem[] = [];
  const findings: ReviewFinding[] = [];
  let runnerUnavailable = false;
  const run = spec.check.run;
  if (run) {
    const tests = run.tests.filter((t) => opts.includeHidden || !t.hidden);
    const sql = run.language === "sql";
    const mode = run.match ?? "exact";
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
          const forbidden = mode === "tokens" && r ? forbiddenWord(actual, t.forbid) : null;
          const passed = !!r && r.status === "ok" && !forbidden && (mode === "tokens" ? matchTokens(actual, t.expected).ok : normalizeOutput(actual, sql) === normalizeOutput(t.expected, sql));
          if (opts.review && r && r.status !== "ok" && findings.every((f) => f.source === "review")) findings.push(...parseErrorOutput(r.stderr, run.language, r.status === "compile_error" ? "compiler" : "runtime"));
          if (opts.review && r?.status === "timeout" && !findings.some((f) => f.source === "runtime")) findings.push({ line: null, severity: "error", source: "runtime", message: "Your program ran for more than 5 seconds. Look for a loop that never ends, or a scanf/input waiting for more input than the question gives." });
          const hint = !passed && !t.hidden && r?.status === "ok" && !compileError ? (forbidden ? `Your answer says "${forbidden}", but for this input the answer is "${t.expected}".` : explainMismatch(actual, t.expected, mode, sql)) : undefined;
          const error = compileError ? `Compile error:\n${compileError}` : r && r.status !== "ok" ? `${r.status === "timeout" ? "Time limit exceeded (5 seconds)" : "Runtime error"}${r.stderr ? `:\n${r.stderr}` : ""}` : undefined;
          items.push({
            kind: "test",
            label: labels[i],
            passed: passed && !compileError,
            hidden: t.hidden || undefined,
            ...(t.hidden ? {} : { stdin: t.stdin, expected: t.expected, actual: clip(actual) }),
            ...(error ? { error: clip(error.trim()) } : {}),
            ...(hint ? { hint } : {}),
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
  if (opts.review) findings.unshift(...reviewCode(code, spec.editor, { runs: !!run }));
  const review = opts.review ? dedupeFindings(findings) : undefined;
  const blocking = review?.filter((f) => f.severity === "error").length ?? 0;
  const passedCount = items.filter((i) => i.passed).length;
  const passed = !runnerUnavailable && items.length > 0 && passedCount === items.length && blocking === 0;
  return {
    passed,
    runnerUnavailable: runnerUnavailable || undefined,
    items,
    summary: runnerUnavailable
      ? "Your code couldn't be run automatically right now"
      : passed
        ? `All ${items.length} check${items.length === 1 ? "" : "s"} passed`
        : passedCount === items.length && blocking
          ? `All checks passed, but ${blocking} line${blocking === 1 ? " needs" : "s need"} fixing`
          : `${passedCount} of ${items.length} checks passed`,
    checkedAt: new Date().toISOString(),
    ...(review ? { review } : {}),
  };
}

/** Same line and message once; ordered by line, file-level notes first. */
function dedupeFindings(list: ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  const out = list.filter((f) => {
    const key = `${f.line}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rank = { error: 0, warning: 1, tip: 2 };
  return out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || rank[a.severity] - rank[b.severity]).slice(0, 60);
}
