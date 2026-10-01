import { ruleQ } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

export const BS_CSS = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
export const BS_JS = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js";

/** A complete Bootstrap 5.3 page around the given body markup (and optional extra head markup, e.g. a <style> block). */
export function page(title: string, body: string, head = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="${BS_CSS}">
${head ? head.replace(/\n$/, "") + "\n" : ""}</head>
<body>
${body.replace(/\n$/, "")}
  <script src="${BS_JS}"></script>
</body>
</html>
`;
}

/** The page every Bootstrap question starts from: Bootstrap is loaded, the body is empty. */
export const STARTER = page("Practice", "  <!-- Write your markup here -->\n");

/** A Bootstrap question checked by reading the HTML (selectors, text and patterns). */
export function bq(
  title: string,
  brief: string,
  steps: string[],
  solution: string,
  rules: Rule[],
  extra: { level?: "basic" | "intermediate" | "advanced"; starter?: string } = {},
) {
  return ruleQ({ title, brief, steps, editor: "html", starter: extra.starter ?? STARTER, solution, rules, level: extra.level });
}

/** Shorthand for an html selector rule. */
export const el = (html: string, message: string, more: { min?: number; max?: number; text?: string } = {}): Rule => ({ html, message, ...more });
