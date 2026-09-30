import { ruleQ, runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

type Level = "basic" | "intermediate" | "advanced";

/**
 * String.raw that turns "¤{" into "${", so JavaScript template literals can be
 * written inside these template strings without being interpolated.
 */
export const code = (s: TemplateStringsArray, ...v: unknown[]) => String.raw(s, ...v).replaceAll("¤{", "${");

export const MONGO_STARTER = "// Write your mongosh queries here\n";
export const NODE_STARTER = `const input = require("fs").readFileSync(0, "utf8");
// Write your code here
`;

/** A regex that matches an object key, quoted or not, followed by a colon: key("$set") matches $set:, "$set": and '$set':. */
export const key = (name: string) => String.raw`["']?` + name.replace(/\$/g, String.raw`\$`) + String.raw`["']?\s*:`;

/** A rule: the code matches the regex. */
export const has = (match: string, message: string, flags?: string): Rule => (flags ? { match, message, flags } : { match, message });
/** A rule: the code must not match the regex. */
export const hasNot = (notMatch: string, message: string): Rule => ({ notMatch, message });

/** A mongosh query sheet, checked by reading the code. */
export function mq(title: string, brief: string, steps: string[], solution: string, rules: Rule[], level: Level = "basic", starter = MONGO_STARTER) {
  return ruleQ({ title, brief, steps, editor: "javascript", starter, solution, rules, level });
}

/** A plain Node.js program run against test cases (JSON documents on stdin). */
export function jq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: Level; match?: "exact" | "tokens"; rules?: Rule[] } = {}) {
  return runQ({ title, brief, steps, editor: "javascript", language: "javascript", starter: NODE_STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}
