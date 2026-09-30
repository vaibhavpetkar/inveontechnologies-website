import { runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

/**
 * String.raw that also turns \` into ` and \${ into ${, so JavaScript code
 * with template literals can be written inside a template string.
 */
export function js(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw(strings, ...values).replace(/\\`/g, "`").replace(/\\\$\{/g, "${");
}

export const STARTER = `const input = require("fs").readFileSync(0, "utf8").trim();

// Write your code here
`;

type Extra = { level?: "basic" | "intermediate" | "advanced"; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string };

/** A JavaScript question run with Node against test cases. */
export function jq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: Extra = {}) {
  return runQ({ title, brief, steps, editor: "javascript", language: "javascript", starter: extra.starter ?? STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}

export const readsStdin: Rule = { match: String.raw`readFileSync\s*\(\s*0|process\.stdin`, message: "Reads the input from stdin" };
