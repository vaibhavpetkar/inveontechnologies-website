import { runQ, ruleQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

export const BASH_STARTER = `#!/bin/bash
# Write your script here
`;

export const SHEET_STARTER = `#!/bin/bash
# Write one command per line
`;

type Level = "basic" | "intermediate" | "advanced";

/** A bash script run against test cases (stdin in, output compared). */
export function bq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: Level; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string } = {}) {
  return runQ({ title, brief, steps, editor: "bash", language: "bash", starter: extra.starter ?? BASH_STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}

/** A command sheet (.sh file of commands) checked by rules only. */
export function sq(title: string, brief: string, steps: string[], solution: string, rules: Rule[], extra: { level?: Level; starter?: string } = {}) {
  return ruleQ({ title, brief, steps, editor: "shell", starter: extra.starter ?? SHEET_STARTER, solution, rules, level: extra.level });
}

/** A multi-line regex rule (^ and $ match at line starts and ends). */
export const m = (match: string, message: string): Rule => ({ match, flags: "m", message });
export const not = (notMatch: string, message: string): Rule => ({ notMatch, flags: "m", message });

export const exactOut = "Output: print only the result lines, nothing else (it is compared line by line)";

/**
 * String.raw that also lets bash's ${...} be written: inside a template
 * literal write $\{name} and it comes out as ${name}.
 */
export const sh = (s: TemplateStringsArray, ...v: unknown[]) => String.raw(s, ...v).replace(/\$\\\{/g, "${");
