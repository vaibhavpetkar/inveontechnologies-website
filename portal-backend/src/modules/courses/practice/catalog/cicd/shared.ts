import { ruleQ, runQ, type Io } from "../../author.js";
import type { EditorLanguage, Rule } from "../../../../internships/exercises/types.js";

/**
 * String.raw that also turns "\${" into "${", so workflow expressions like
 * \${{ secrets.TOKEN }} can be written inside a template literal.
 */
export const t = (s: TemplateStringsArray, ...v: unknown[]) => String.raw(s, ...v).replaceAll("\\${", "${");

/** The code must match this regex (comments are stripped before checking). */
export const has = (match: string, message: string, flags?: string): Rule => (flags ? { match, flags, message } : { match, message });
/** The code must not match this regex. */
export const lacks = (notMatch: string, message: string, flags?: string): Rule => (flags ? { notMatch, flags, message } : { notMatch, message });

type Level = "basic" | "intermediate" | "advanced";

interface Q {
  title: string;
  brief: string;
  steps: string[];
  starter: string;
  solution: string;
  rules: Rule[];
  level?: Level;
}

/** A rule-checked question in the given editor. */
export const fileQ = (editor: EditorLanguage) => (o: Q) => ruleQ({ ...o, editor });
export const yq = fileQ("yaml");
export const txtQ = fileQ("text");

/** A bash script run against test cases. */
export function shQ(o: { title: string; brief: string; steps: string[]; starter?: string; solution: string; examples: Io[]; hidden: Io[]; level?: Level; match?: "exact" | "tokens"; rules?: Rule[] }) {
  return runQ({ ...o, starter: o.starter ?? "#!/bin/bash\n# Read the input with read, then print the answer\n", editor: "shell", language: "bash", match: o.match ?? "exact" });
}

/** Starter for a GitHub Actions workflow file. */
export const WORKFLOW = `name: CI

on:
  # add the trigger(s) here

jobs:
  # add your job(s) here
`;

/** Common rules. */
export const checkout = has(String.raw`uses:\s*actions/checkout@v\d+`, "Checks out the code with actions/checkout");
export const ubuntu = has(String.raw`runs-on:\s*ubuntu-(latest|24\.04|22\.04)`, "Runs on a GitHub-hosted Ubuntu runner");
