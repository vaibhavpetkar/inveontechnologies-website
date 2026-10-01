import { runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

export const STARTER = `# Write your code here
`;

/** A Python question run against test cases. Output is matched leniently (prompts are fine) unless match is "exact". */
export function pq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: "basic" | "intermediate" | "advanced"; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string } = {}) {
  return runQ({ title, brief, steps, editor: "python", language: "python", starter: extra.starter ?? STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}

export const usesLoop: Rule = { match: String.raw`^\s*(for|while)\b`, flags: "m", message: "Uses a loop (for or while)" };
export const usesDef: Rule = { match: String.raw`^\s*def\s+\w+\s*\(`, flags: "m", message: "Defines a function with def" };
export const usesIf: Rule = { match: String.raw`^\s*if\b`, flags: "m", message: "Uses an if statement" };
export const usesWith: Rule = { match: String.raw`\bwith\s+open\s*\(`, message: "Opens the file with a with block" };
export const usesClass: Rule = { match: String.raw`^\s*class\s+\w+`, flags: "m", message: "Defines a class" };
