import { ruleQ, runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

export const STARTER = `<?php

// Read the input, then write your code here
`;

type Level = "basic" | "intermediate" | "advanced";

/** A PHP program run against test cases. Output is matched leniently (prompts are fine) unless match is "exact". */
export function pq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: Level; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string } = {}) {
  return runQ({ title, brief, steps, editor: "php", language: "php", starter: extra.starter ?? STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}

/** A PHP page checked by reading the code (forms, sessions, cookies, PDO). */
export function pr(title: string, brief: string, steps: string[], solution: string, rules: Rule[], level: Level = "intermediate") {
  return ruleQ({ title, brief, steps, editor: "php", starter: STARTER, solution, rules, level });
}

export const usesLoop: Rule = { match: String.raw`\b(for|foreach|while)\s*\(`, message: "Uses a loop (for, foreach or while)" };
export const usesFunction = (name: string): Rule => ({ match: String.raw`\bfunction\s+${name}\s*\(`, message: `Defines a function named ${name}` });
export const noSqlConcat: Rule = { notMatch: String.raw`(SELECT|INSERT|UPDATE|DELETE)\b[^;]*["']\s*\.\s*\$`, flags: "i", message: "Doesn't join user input into the SQL string" };
export const usesPrepare: Rule = { match: String.raw`->\s*prepare\s*\(`, message: "Uses a prepared statement ($pdo->prepare)" };
export const usesExecute: Rule = { match: String.raw`->\s*execute\s*\(`, message: "Runs the statement with execute()" };
