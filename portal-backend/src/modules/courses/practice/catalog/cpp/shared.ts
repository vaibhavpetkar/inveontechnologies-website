import { runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

export const STARTER = `#include <iostream>
using namespace std;

int main() {
    // Write your code here

    return 0;
}
`;

type Extra = { level?: "basic" | "intermediate" | "advanced"; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string };

/** A C++ question run against test cases. Output is matched leniently (prompts are fine) unless match is "exact". */
export function cppq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: Extra = {}) {
  return runQ({ title, brief, steps, editor: "cpp", language: "cpp", starter: extra.starter ?? STARTER, solution, examples, hidden, level: extra.level, match: extra.match, rules: extra.rules });
}

/** A rule that the code matches a regex. */
export const has = (match: string, message: string): Rule => ({ match, message });
/** A rule that the code does not match a regex. */
export const hasNot = (notMatch: string, message: string): Rule => ({ notMatch, message });

export const usesLoop: Rule = has(String.raw`\b(for|while)\s*\(`, "Uses a loop (for or while)");
export const usesVector: Rule = has(String.raw`\bvector\s*<`, "Stores the values in a vector");
export const usesString: Rule = has(String.raw`\bstring\b`, "Uses std::string");
