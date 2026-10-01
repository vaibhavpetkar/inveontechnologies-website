import { ruleQ, runQ, type Io } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

type Level = "basic" | "intermediate" | "advanced";

export const SH_STARTER = `#!/bin/bash
# Write your AWS CLI commands here, one per line (use \\ to continue a long command)
`;

export const JSON_STARTER = `{
}
`;

export const POLICY_STARTER = `{
  "Version": "2012-10-17",
  "Statement": []
}
`;

export const CFN_STARTER = `AWSTemplateFormatVersion: "2010-09-09"
Description: Write your template here
Resources: {}
`;

export const PY_STARTER = `# Read the input with input(), then print the answer

`;

export const JS_STARTER = `const input = require("fs").readFileSync(0, "utf8").trim();
// Write your code here
`;

/** A shell file of AWS CLI commands, checked by reading it. */
export function shq(title: string, brief: string, steps: string[], solution: string, rules: Rule[], extra: { level?: Level; starter?: string } = {}) {
  return ruleQ({ title, brief, steps, editor: "shell", level: extra.level, starter: extra.starter ?? SH_STARTER, solution, rules });
}

/** A JSON document (IAM policy, bucket policy, lifecycle rules ...), checked by reading it. */
export function jq(title: string, brief: string, steps: string[], solution: string, rules: Rule[], extra: { level?: Level; starter?: string } = {}) {
  return ruleQ({ title, brief, steps, editor: "json", level: extra.level, starter: extra.starter ?? JSON_STARTER, solution, rules });
}

/** A YAML file (CloudFormation / SAM template), checked by reading it. */
export function yq(title: string, brief: string, steps: string[], solution: string, rules: Rule[], extra: { level?: Level; starter?: string } = {}) {
  return ruleQ({ title, brief, steps, editor: "yaml", level: extra.level, starter: extra.starter ?? CFN_STARTER, solution, rules });
}

/** A Python program run against test cases. */
export function pyq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: Level; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string } = {}) {
  return runQ({ title, brief, steps, editor: "python", language: "python", level: extra.level, match: extra.match, rules: extra.rules, starter: extra.starter ?? PY_STARTER, solution, examples, hidden });
}

/** A Node.js program run against test cases. */
export function jsq(title: string, brief: string, steps: string[], solution: string, examples: Io[], hidden: Io[], extra: { level?: Level; match?: "exact" | "tokens"; rules?: Rule[]; starter?: string } = {}) {
  return runQ({ title, brief, steps, editor: "javascript", language: "javascript", level: extra.level, match: extra.match, rules: extra.rules, starter: extra.starter ?? JS_STARTER, solution, examples, hidden });
}

/** Rule: a key with a value, e.g. has("Effect", "Deny"). Whitespace and quotes are tolerated. */
export const has = (key: string, value: string, message: string): Rule => ({ match: `"${key}"\\s*:\\s*"${value}"`, message });
