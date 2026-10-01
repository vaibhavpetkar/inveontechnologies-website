import { ruleQ } from "../../author.js";
import type { Rule } from "../../../../internships/exercises/types.js";

type Level = "basic" | "intermediate" | "advanced";

/** A full HTML5 page around some body markup (and optional extra head tags). */
export function page(title: string, body: string, head = ""): string {
  const inner = body.replace(/^\n+/, "").replace(/\s+$/, "");
  const extra = head.replace(/^\n+/, "").replace(/\s+$/, "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>${extra ? `\n${extra}` : ""}
</head>
<body>
${inner}
</body>
</html>
`;
}

export const STARTER = page("Practice", "  <!-- Write your page here -->");

/** An element matching the selector must exist (at least min times, at most max, with text matching a regex). max: 0 means it must not exist. */
export function el(selector: string, message: string, opts: { min?: number; max?: number; text?: string } = {}): Rule {
  return { html: selector, message, ...(opts.max === 0 ? { min: 0 } : {}), ...opts };
}

/** An HTML question checked by reading the page's structure. */
export function hq(title: string, brief: string, steps: string[], solution: string, rules: Rule[], extra: { level?: Level; starter?: string } = {}) {
  return ruleQ({ title, brief, steps, editor: "html", level: extra.level ?? "basic", starter: extra.starter ?? STARTER, solution, rules });
}
