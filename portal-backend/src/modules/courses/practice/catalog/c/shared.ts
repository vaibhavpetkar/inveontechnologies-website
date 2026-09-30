import { runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

export const STARTER = `#include <stdio.h>

int main(void) {
    // Write your code here

    return 0;
}
`;

/** A C question run against test cases. Output is matched leniently (prompts are fine) unless match is "exact". */
export function cq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: "basic" | "intermediate" | "advanced"; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string } = {}) {
  return runQ({ title, brief, steps, editor: "c", language: "c", starter: extra.starter ?? STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}

export const usesLoop: Rule = { match: String.raw`\b(for|while)\s*\(`, message: "Uses a loop (for or while)" };
export const usesSwitch: Rule = { match: String.raw`\bswitch\s*\(`, message: "Uses a switch statement" };
export const usesArray: Rule = { match: String.raw`\b\w+\s*\[\s*\w*\s*\]`, message: "Stores the values in an array" };
