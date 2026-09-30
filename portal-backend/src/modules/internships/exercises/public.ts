import type { ExerciseSpec } from "./types.js";

/** What a participant sees of an exercise: never the hidden tests. */
export function publicExercise(spec: ExerciseSpec | null, runsCode: boolean) {
  if (!spec) return null;
  const run = spec.check.run;
  return {
    editor: spec.editor,
    starter: spec.starter,
    runs: !!run,
    // Output is matched on its words and numbers, so input prompts are fine.
    lenient: run?.match === "tokens",
    // Whether this exercise is checked automatically right now.
    autoChecked: !run || runsCode,
    examples: run ? run.tests.filter((t) => !t.hidden).map((t) => ({ stdin: t.stdin, expected: t.expected })) : [],
    hiddenTests: run ? run.tests.filter((t) => t.hidden).length : 0,
    requirements: (spec.check.rules ?? []).map((r) => r.message),
    ...(run?.language === "sql" ? { setup: run.setup ?? "" } : {}),
  };
}
