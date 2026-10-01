/** Small builders so the course catalogs read like assignment sheets. */
import type { EditorLanguage, ExerciseSeed, Rule, RunLanguage } from "../../internships/exercises/types.js";

/** [stdin, expected output, words that must not be in the answer]. */
export type Io = [stdin: string, expected: string, forbid?: string[]];

interface Common {
  title: string;
  brief: string;
  steps: string[];
  level?: "basic" | "intermediate" | "advanced";
  starter: string;
  solution: string;
}

/** A question whose program is run against test cases (and optionally rule-checked). */
export function runQ(
  o: Common & {
    editor: EditorLanguage;
    language: RunLanguage;
    examples: Io[];
    hidden: Io[];
    /** "tokens" (default): prompts are fine, words and numbers must appear in order. "exact": line by line (patterns). */
    match?: "exact" | "tokens";
    rules?: Rule[];
    setup?: string;
    after?: string;
  },
): ExerciseSeed {
  const test = (hidden: boolean) => ([stdin, expected, forbid]: Io) => ({ stdin, expected, ...(hidden ? { hidden: true } : {}), ...(forbid?.length ? { forbid } : {}) });
  return {
    title: o.title,
    brief: o.brief,
    steps: o.steps,
    level: o.level ?? "basic",
    editor: o.editor,
    starter: o.starter,
    solution: o.solution,
    check: {
      run: { language: o.language, tests: [...o.examples.map(test(false)), ...o.hidden.map(test(true))], match: o.match ?? "tokens", ...(o.setup ? { setup: o.setup } : {}), ...(o.after ? { after: o.after } : {}) },
      ...(o.rules?.length ? { rules: o.rules } : {}),
    },
  };
}

/** A question checked by reading the code only (HTML, CSS, Dockerfiles, YAML, git commands ...). */
export function ruleQ(o: Common & { editor: EditorLanguage; rules: Rule[] }): ExerciseSeed {
  return { title: o.title, brief: o.brief, steps: o.steps, level: o.level ?? "basic", editor: o.editor, starter: o.starter, solution: o.solution, check: { rules: o.rules } };
}
