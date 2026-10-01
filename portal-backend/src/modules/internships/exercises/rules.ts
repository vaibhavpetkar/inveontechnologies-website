/**
 * Static checks on submitted code: a small tolerant HTML parser with a
 * CSS-selector matcher, a CSS rule parser, and regex rules. Nothing here
 * runs the student's code.
 */
import type { CheckItem, EditorLanguage, Rule } from "./types.js";

// ---------- HTML ----------

export interface HtmlNode {
  tag: string; // "#root" for the document
  attrs: Map<string, string>;
  children: HtmlNode[];
  parent: HtmlNode | null;
  text: string; // direct text content
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseHtml(source: string): HtmlNode {
  const root: HtmlNode = { tag: "#root", attrs: new Map(), children: [], parent: null, text: "" };
  const stack: HtmlNode[] = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      top().text += source.slice(i);
      break;
    }
    top().text += source.slice(i, lt);
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source[lt + 1] === "!" || source[lt + 1] === "?") {
      const end = source.indexOf(">", lt);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    const close = /^<\/\s*([a-zA-Z][\w-]*)\s*>/.exec(source.slice(lt));
    if (close) {
      const tag = close[1].toLowerCase();
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i = lt + close[0].length;
      continue;
    }
    const open = /^<([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)\s*(\/?)>/s.exec(source.slice(lt));
    if (!open) {
      top().text += "<";
      i = lt + 1;
      continue;
    }
    const tag = open[1].toLowerCase();
    const attrs = new Map<string, string>();
    for (const m of open[2].matchAll(ATTR)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
    const node: HtmlNode = { tag, attrs, children: [], parent: top(), text: "" };
    top().children.push(node);
    i = lt + open[0].length;
    if (RAW.has(tag) && !open[3]) {
      const end = source.toLowerCase().indexOf(`</${tag}`, i);
      node.text = source.slice(i, end === -1 ? source.length : end);
      const gt = end === -1 ? -1 : source.indexOf(">", end);
      i = gt === -1 ? source.length : gt + 1;
      continue;
    }
    if (!VOID.has(tag) && !open[3]) stack.push(node);
  }
  return root;
}

export function textContent(node: HtmlNode): string {
  return node.text + node.children.map(textContent).join("");
}

function* walk(node: HtmlNode): Generator<HtmlNode> {
  for (const child of node.children) {
    yield child;
    yield* walk(child);
  }
}

interface Compound {
  tag: string | null;
  id: string | null;
  classes: string[];
  attrs: { name: string; op: string | null; value: string }[];
}

function parseCompound(text: string): Compound {
  const c: Compound = { tag: null, id: null, classes: [], attrs: [] };
  const re = /(^[a-zA-Z*][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w-:]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]/g;
  let consumed = 0;
  for (const m of text.matchAll(re)) {
    consumed += m[0].length;
    if (m[1]) c.tag = m[1] === "*" ? null : m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push({ name: m[4].toLowerCase(), op: m[5] ?? null, value: m[6] ?? m[7] ?? m[8] ?? "" });
  }
  if (consumed !== text.length) throw new Error(`Unsupported selector part: ${text}`);
  return c;
}

function matchesCompound(node: HtmlNode, c: Compound): boolean {
  if (c.tag && node.tag !== c.tag) return false;
  if (c.id && node.attrs.get("id") !== c.id) return false;
  const classList = (node.attrs.get("class") ?? node.attrs.get("classname") ?? "").split(/\s+/);
  if (c.classes.some((cls) => !classList.includes(cls))) return false;
  for (const a of c.attrs) {
    const v = node.attrs.get(a.name);
    if (v === undefined) return false;
    const want = a.value;
    if (a.op === "=" && v !== want) return false;
    if (a.op === "~=" && !v.split(/\s+/).includes(want)) return false;
    if (a.op === "^=" && !v.startsWith(want)) return false;
    if (a.op === "$=" && !v.endsWith(want)) return false;
    if (a.op === "*=" && !v.includes(want)) return false;
  }
  return true;
}

/**
 * Splits a selector into tokens outside [attribute] brackets and quotes:
 * on `sep` only (keeping nothing), or on whitespace and ">" (keeping ">").
 */
function tokenize(text: string, sep: "," | "combinators"): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (sep === "," ? ch === "," : /\s/.test(ch) || ch === ">")) {
      if (sep === "," || cur) out.push(cur);
      cur = "";
      if (ch === ">") out.push(">");
      continue;
    }
    cur += ch;
  }
  if (sep === "," || cur) out.push(cur);
  return out;
}

/** Elements matching a selector: tags, #id, .class, [attr], [attr=v], descendant and > child combinators, comma lists. */
export function querySelectorAll(root: HtmlNode, selector: string): HtmlNode[] {
  const found = new Set<HtmlNode>();
  for (const alternative of tokenize(selector, ",")) {
    const parts = tokenize(alternative.trim(), "combinators");
    const chain: { compound: Compound; combinator: " " | ">" }[] = [];
    let combinator: " " | ">" = " ";
    for (const p of parts) {
      if (p === ">") {
        combinator = ">";
        continue;
      }
      chain.push({ compound: parseCompound(p), combinator });
      combinator = " ";
    }
    const matchFrom = (node: HtmlNode, index: number): boolean => {
      if (!matchesCompound(node, chain[index].compound)) return false;
      if (index === 0) return true;
      if (chain[index].combinator === ">") return !!node.parent && node.parent.tag !== "#root" && matchFrom(node.parent, index - 1);
      for (let up = node.parent; up && up.tag !== "#root"; up = up.parent) if (matchFrom(up, index - 1)) return true;
      return false;
    };
    for (const node of walk(root)) if (matchFrom(node, chain.length - 1)) found.add(node);
  }
  return [...found];
}

// ---------- CSS ----------

export interface CssRule {
  selectors: string[];
  decls: Map<string, string>;
  context: string[]; // enclosing at-rules, e.g. ["@media (min-width: 600px)"]
}

export interface CssSheet {
  rules: CssRule[];
  atRules: { name: string; prelude: string }[];
}

const normSelector = (s: string) => s.trim().replace(/\s*([>+~,])\s*/g, "$1").replace(/\s+/g, " ").toLowerCase();

export function parseCss(source: string): CssSheet {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const sheet: CssSheet = { rules: [], atRules: [] };
  let i = 0;
  const parseBlock = (context: string[], depth: number) => {
    while (i < text.length) {
      const brace = text.indexOf("{", i);
      const semi = text.indexOf(";", i);
      const closing = text.indexOf("}", i);
      if (closing !== -1 && (brace === -1 || closing < brace) && (semi === -1 || closing < semi)) {
        i = closing + 1;
        if (depth > 0) return;
        continue;
      }
      if (brace === -1) return;
      if (semi !== -1 && semi < brace) {
        // A statement at-rule like @import url(...);
        const stmt = text.slice(i, semi).trim();
        const at = /^@([\w-]+)\s*(.*)$/s.exec(stmt);
        if (at) sheet.atRules.push({ name: at[1].toLowerCase(), prelude: at[2].trim() });
        i = semi + 1;
        continue;
      }
      const prelude = text.slice(i, brace).trim();
      i = brace + 1;
      const at = /^@([\w-]+)\s*(.*)$/s.exec(prelude);
      if (at) {
        sheet.atRules.push({ name: at[1].toLowerCase(), prelude: at[2].trim() });
        parseBlock([...context, prelude], depth + 1);
        continue;
      }
      const end = text.indexOf("}", i);
      const body = text.slice(i, end === -1 ? text.length : end);
      i = end === -1 ? text.length : end + 1;
      const decls = new Map<string, string>();
      for (const d of body.split(";")) {
        const colon = d.indexOf(":");
        if (colon === -1) continue;
        decls.set(d.slice(0, colon).trim().toLowerCase(), d.slice(colon + 1).trim());
      }
      sheet.rules.push({ selectors: prelude.split(",").map(normSelector), decls, context });
    }
  };
  parseBlock([], 0);
  return sheet;
}

/** CSS written inside <style> tags when the code is an HTML page, else the code itself. */
export function cssOf(code: string, editor: EditorLanguage): string {
  if (editor !== "html") return code;
  return [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
}

// ---------- Comments ----------

/** Removes comments so a rule can't be satisfied by writing the answer in a comment. String literals are kept. */
export function stripComments(code: string, editor: EditorLanguage): string {
  if (editor === "html") return code.replace(/<!--[\s\S]*?-->/g, "");
  if (editor === "css") return code.replace(/\/\*[\s\S]*?\*\//g, "");
  const hash = ["python", "yaml", "shell", "dockerfile", "hcl", "php"].includes(editor);
  const slash = ["javascript", "jsx", "c", "cpp", "csharp", "java", "hcl", "json", "php"].includes(editor);
  // In shell a # only starts a comment at a word start ($#, ${#x} are not comments), and a #! first line is kept.
  const shellLike = editor === "shell" || editor === "dockerfile";
  const dash = editor === "sql";
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += code[++i] ?? "";
        continue;
      }
      if (ch === quote || (ch === "\n" && quote !== "`" && quote !== '"""')) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || (ch === "`" && slash)) {
      quote = ch;
      out += ch;
      continue;
    }
    const hashComment = hash && ch === "#" && !(shellLike && ((i === 0 && code[1] === "!") || (i > 0 && !/[\s;]/.test(code[i - 1]))));
    const lineComment = hashComment || (slash && ch === "/" && code[i + 1] === "/") || (dash && ch === "-" && code[i + 1] === "-");
    if (lineComment) {
      while (i < code.length && code[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if ((slash || dash) && ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 1;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

// ---------- Rules ----------

export function checkRules(code: string, editor: EditorLanguage, rules: Rule[]): CheckItem[] {
  const clean = stripComments(code, editor);
  let dom: HtmlNode | null = null;
  let sheet: CssSheet | null = null;
  return rules.map((rule) => {
    let passed = false;
    if ("html" in rule) {
      dom ??= parseHtml(clean);
      let nodes = querySelectorAll(dom, rule.html);
      if (rule.text) {
        const re = new RegExp(rule.text, "i");
        nodes = nodes.filter((n) => re.test(textContent(n)));
      }
      passed = nodes.length >= (rule.min ?? 1) && (rule.max === undefined || nodes.length <= rule.max);
    } else if ("css" in rule) {
      sheet ??= parseCss(cssOf(clean, editor));
      const want = normSelector(rule.css);
      const valueRe = rule.value ? new RegExp(rule.value, "i") : null;
      const insideRe = rule.inside ? new RegExp(rule.inside, "i") : null;
      passed = sheet.rules.some((r) => r.selectors.includes(want) && r.decls.has(rule.prop) && (!valueRe || valueRe.test(r.decls.get(rule.prop)!)) && (!insideRe || r.context.some((c) => insideRe.test(c))));
    } else if ("cssAt" in rule) {
      sheet ??= parseCss(cssOf(clean, editor));
      const preludeRe = rule.prelude ? new RegExp(rule.prelude, "i") : null;
      passed = sheet.atRules.some((a) => a.name === rule.cssAt && (!preludeRe || preludeRe.test(a.prelude)));
    } else if ("match" in rule) {
      passed = new RegExp(rule.match, rule.flags ?? "").test(clean);
    } else {
      passed = !new RegExp(rule.notMatch, rule.flags ?? "").test(clean);
    }
    return { kind: "rule", label: rule.message, passed };
  });
}
