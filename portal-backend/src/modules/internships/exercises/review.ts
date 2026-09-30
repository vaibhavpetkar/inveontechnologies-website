/**
 * The line-by-line code reviewer behind assignment uploads.
 *
 * reviewCode() reads the code without running it and points at lines with
 * definite mistakes (errors: things that won't compile or are always wrong,
 * like Turbo C's conio.h or `if (x = 5)` style slips that the compiler also
 * rejects), likely bugs (warnings: scanf without &, %d for a float, integer
 * division, a `;` right after an if) and good-practice tips. Only errors
 * block a submission; warnings and tips are advice.
 *
 * parseErrorOutput() turns compiler, interpreter and runtime error output
 * into the same line-numbered findings, with a plain-language explanation
 * in front of the original message.
 */
import type { EditorLanguage, ReviewFinding, RunLanguage } from "./types.js";

type Severity = ReviewFinding["severity"];

interface Source {
  raw: string[];
  /** Same lines with comments removed and string/char literal contents blanked, so patterns don't match inside them. */
  code: string[];
}

const C_LIKE = new Set<EditorLanguage>(["c", "cpp", "java", "csharp", "javascript", "jsx", "php"]);

/** Blanks comments and the inside of string literals, keeping every line and column in place. */
export function maskSource(text: string, editor: EditorLanguage): Source {
  const raw = text.replace(/\r\n?/g, "\n");
  const slash = C_LIKE.has(editor) || editor === "css" || editor === "sql";
  const hash = ["python", "shell", "bash", "yaml", "dockerfile", "php"].includes(editor);
  const dash = editor === "sql";
  const quotes = editor === "css" || editor === "sql" ? `"'` : editor === "javascript" || editor === "jsx" ? `"'\`` : `"'`;
  let out = "";
  let i = 0;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  while (i < raw.length) {
    const ch = raw[i];
    const two = raw.slice(i, i + 2);
    if (slash && two === "/*") {
      const end = raw.indexOf("*/", i + 2);
      const stop = end === -1 ? raw.length : end + 2;
      out += blank(raw.slice(i, stop));
      i = stop;
      continue;
    }
    if ((slash && editor !== "css" && editor !== "sql" && two === "//") || (hash && ch === "#" && !(editor === "php" && raw[i + 1] === "[")) || (dash && two === "--")) {
      // "#include" in C isn't a comment; only languages in `hash` get here.
      const end = raw.indexOf("\n", i);
      const stop = end === -1 ? raw.length : end;
      out += blank(raw.slice(i, stop));
      i = stop;
      continue;
    }
    if (editor === "python" && (raw.startsWith('"""', i) || raw.startsWith("'''", i))) {
      const q = raw.slice(i, i + 3);
      const end = raw.indexOf(q, i + 3);
      const stop = end === -1 ? raw.length : end + 3;
      out += q + blank(raw.slice(i + 3, stop - 3)) + (end === -1 ? "" : q);
      i = stop;
      continue;
    }
    if (quotes.includes(ch) && !(editor === "shell" || editor === "bash" || editor === "yaml" || editor === "dockerfile")) {
      let j = i + 1;
      while (j < raw.length && raw[j] !== ch && !(raw[j] === "\n" && ch !== "`")) {
        if (raw[j] === "\\") j++;
        j++;
      }
      out += ch + blank(raw.slice(i + 1, Math.min(j, raw.length))) + (raw[j] === ch ? ch : "");
      i = raw[j] === ch ? j + 1 : j;
      continue;
    }
    out += ch;
    i++;
  }
  return { raw: raw.split("\n"), code: out.split("\n") };
}

class Findings {
  list: ReviewFinding[] = [];
  add(line: number | null, severity: Severity, message: string, column?: number) {
    this.list.push({ line, severity, message, source: "review", ...(column ? { column } : {}) });
  }
}

// ---------- Shared checks ----------

const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** Unclosed or extra brackets, pointing at the line where the problem starts. */
function checkBrackets(src: Source, f: Findings) {
  const stack: { ch: string; line: number; col: number }[] = [];
  src.code.forEach((line, li) => {
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === "(" || ch === "[" || ch === "{") stack.push({ ch, line: li + 1, col: ci + 1 });
      else if (ch in PAIRS) {
        const top = stack[stack.length - 1];
        if (top && top.ch === PAIRS[ch]) stack.pop();
        else if (top) {
          f.add(li + 1, "error", `This "${ch}" doesn't match the "${top.ch}" opened on line ${top.line}. Check that every bracket is closed in the right order.`, ci + 1);
          stack.length = 0;
          return;
        } else {
          f.add(li + 1, "error", `This "${ch}" has no opening "${PAIRS[ch]}" before it. Remove it or add the missing "${PAIRS[ch]}".`, ci + 1);
          return;
        }
      }
    }
  });
  for (const open of stack.slice(0, 3)) {
    const close = Object.keys(PAIRS).find((k) => PAIRS[k] === open.ch);
    f.add(open.line, "error", `The "${open.ch}" opened here is never closed. Add the matching "${close}".`, open.col);
  }
}

const nextCodeLine = (src: Source, from: number) => {
  for (let i = from; i < src.code.length; i++) if (src.code[i].trim()) return { index: i, text: src.code[i].trim() };
  return null;
};
const prevCodeLine = (src: Source, from: number) => {
  for (let i = from; i >= 0; i--) if (src.code[i].trim()) return { index: i, text: src.code[i].trim() };
  return null;
};

/** A statement line in a C-like language that doesn't end with ; and isn't continued on the next line. */
function checkSemicolons(src: Source, f: Findings, lang: "c" | "cpp" | "java" | "php" | "csharp") {
  const typeWords = lang === "java" ? "int|long|double|float|char|boolean|String|var" : lang === "php" ? "" : "int|long|double|float|char|short|unsigned|bool|string|auto";
  const statement = new RegExp(
    String.raw`^(return\b|break\b|continue\b|printf\s*\(|scanf\s*\(|puts\s*\(|cout\b|cin\b|echo\b|print\b|System\.out\.|` +
      (typeWords ? String.raw`(?:const\s+)?(?:${typeWords})\b[\w\s\*\[\]]*(=|;|$)|` : "") +
      String.raw`\$?[A-Za-z_][\w\.\[\]>-]*\s*(=[^=]|\+\+|--|\+=|-=|\*=|\/=|%=))`,
  );
  let inSwitchOrEnum = 0;
  src.code.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    if (/\benum\b/.test(t)) inSwitchOrEnum = 1;
    if (inSwitchOrEnum && t.includes("}")) inSwitchOrEnum = 0;
    if (/[;{},:(\[\\]$|&&$|\|\|$|[+\-*/%=<>?.]$/.test(t)) return;
    if (/^(if|else|for|while|do|switch|case|default|try|catch|finally|public|private|protected|class|struct|static|namespace|template|function|foreach)\b/.test(t)) return;
    if (!statement.test(t)) return;
    const next = nextCodeLine(src, i + 1);
    if (next && /^[{.+\-*/%?:,)\]&|<>=]/.test(next.text)) return;
    // A function header like `int add(int a, int b)` followed by `{`.
    if (/\)\s*$/.test(t) && next?.text.startsWith("{")) return;
    if (inSwitchOrEnum) return;
    f.add(i + 1, "error", `Missing ";" at the end of this line.`);
  });
}

/** For `if (...) ;` style slips: the keyword whose (...) header is followed only by ";" on this line. */
function emptyBodyKeyword(line: string): string | null {
  const m = /\b(if|for|while)\s*\(/.exec(line);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")" && --depth === 0) return line.slice(i + 1).trim() === ";" ? m[1] : null;
  }
  return null;
}

/** The text inside the parentheses of an if/while on this line. */
function conditionOf(line: string): { keyword: string; text: string } | null {
  const m = /\b(if|while)\s*\(/.exec(line);
  if (!m) return null;
  let depth = 0;
  const start = m.index + m[0].length;
  for (let i = start - 1; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")" && --depth === 0) return { keyword: m[1], text: line.slice(start, i) };
  }
  return null;
}

/** A single = at the top level of a condition (not ==, <=, >=, !=, and not inside a nested call). */
function assignsInCondition(line: string) {
  const cond = conditionOf(line);
  if (!cond) return null;
  let depth = 0;
  const t = cond.text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "=" && depth === 0 && t[i + 1] !== "=" && !"=!<>+-*/%&|^".includes(t[i - 1] ?? "") && t[i + 1] !== ">") return cond.keyword;
  }
  return null;
}

// ---------- C and C++ ----------

type VarTypes = Map<string, string>;

/** Variable names and their declared types (int, float, char, char[] ...), good enough for format checks. */
function declaredTypes(src: Source): VarTypes {
  const types: VarTypes = new Map();
  const decl = /\b(?:unsigned\s+|signed\s+|const\s+|static\s+)*(long\s+long|long\s+double|long|int|short|float|double|char|bool|string)\s+([^;(){}]+);/g;
  for (const line of src.code) {
    for (const m of line.matchAll(decl)) {
      const type = m[1].replace(/\s+/g, " ");
      for (let part of m[2].split(",")) {
        part = part.split("=")[0].trim();
        const pointer = part.startsWith("*");
        const name = /([A-Za-z_]\w*)\s*(\[.*\])?$/.exec(part.replace(/^\*+/, "").trim());
        if (!name) continue;
        types.set(name[1], pointer ? `${type}*` : name[2] ? `${type}[]` : type);
      }
    }
  }
  return types;
}

/** Splits call arguments on top-level commas. */
function splitArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === "\\") cur += text[++i] ?? "";
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/** The conversions in a printf/scanf format: "d", "f", "lf", "s", "c" ... (not %% and not %*d). */
function conversions(format: string): string[] {
  const out: string[] = [];
  for (const m of format.matchAll(/%([-+ #0]*)(\*?)(\d+|\*)?(?:\.(\d+|\*))?(hh|h|ll|l|L|z|j|t)?([diouxXeEfgGcspn%]|\[[^\]]*\])/g)) {
    if (m[6] === "%" || m[2] === "*") continue;
    out.push(`${m[5] ?? ""}${m[6]}`);
  }
  return out;
}

/** Finds `name(...)` calls on a raw line and returns the argument text, ignoring anything in a comment. */
function callsOn(raw: string, masked: string, name: string): string[] {
  const found: string[] = [];
  const re = new RegExp(String.raw`\b${name}\s*\(`, "g");
  for (const m of masked.matchAll(re)) {
    let depth = 0;
    let quote: string | null = null;
    const start = m.index! + m[0].length;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") {
        if (depth === 0) {
          found.push(raw.slice(start, i));
          break;
        }
        depth--;
      }
    }
  }
  return found;
}

const isFloat = (t?: string) => !!t && /^(float|double|long double)$/.test(t);
const isInt = (t?: string) => !!t && /^(int|long|long long|short|unsigned|char|bool)$/.test(t) && t !== "char";

function checkFormats(src: Source, f: Findings, types: VarTypes) {
  src.raw.forEach((raw, i) => {
    const masked = src.code[i];
    for (const fn of ["printf", "scanf"]) {
      for (const argText of callsOn(raw, masked, fn)) {
        const args = splitArgs(argText);
        const fmt = /^"((?:[^"\\]|\\.)*)"$/.exec(args[0] ?? "");
        if (!fmt) continue;
        const specs = conversions(fmt[1]);
        const values = args.slice(1);
        if (specs.length !== values.length) {
          f.add(i + 1, "warning", `${fn} has ${specs.length} placeholder${specs.length === 1 ? "" : "s"} (like %d) but ${values.length} value${values.length === 1 ? "" : "s"} after the text. They must match one to one.`);
          continue;
        }
        if (fn === "scanf" && /[A-Za-z]{3,}/.test(fmt[1].replace(/%\w+/g, ""))) {
          f.add(i + 1, "warning", `scanf doesn't print its text; it expects the user to type it. Print the prompt with printf, then call scanf("${specs.map((s) => `%${s}`).join(" ")}", ...).`);
        }
        specs.forEach((spec, k) => {
          const value = values[k];
          const bare = /^[A-Za-z_]\w*$/.test(value) ? value : null;
          const addr = /^&\s*([A-Za-z_]\w*)$/.exec(value)?.[1] ?? null;
          const t = types.get(bare ?? addr ?? "");
          if (fn === "scanf") {
            if (bare && !/^(s|\[)/.test(spec) && t && !t.endsWith("*") && !t.endsWith("[]")) {
              f.add(i + 1, "error", `scanf needs the address of ${bare}: write &${bare}. Without &, the program crashes or reads into the wrong place.`);
            } else if (addr && /^(s|\[)/.test(spec) && t?.endsWith("[]")) {
              f.add(i + 1, "tip", `${addr} is an array, so scanf("%s", ${addr}) works without &.`);
            }
            if (t === "double" && spec === "f") f.add(i + 1, "error", `${bare ?? addr} is a double: scanf needs %lf for a double (%f is for float).`);
            else if (isFloat(t) && /^[dic]$/.test(spec)) f.add(i + 1, "error", `${bare ?? addr} is a ${t} but %${spec} reads an integer. Use %${t === "double" ? "lf" : "f"}.`);
            else if (isInt(t) && /^l?f$/.test(spec)) f.add(i + 1, "error", `${bare ?? addr} is an int but %${spec} reads a decimal number. Use %d.`);
          } else if (bare && t) {
            if (isFloat(t) && /^[dic]$/.test(spec)) f.add(i + 1, "error", `${bare} is a ${t}; print it with %f (or %.2f), not %${spec}. %${spec} prints a wrong number.`);
            else if (isInt(t) && /^l?[fFeEgG]$/.test(spec)) f.add(i + 1, "error", `${bare} is an int; print it with %d, not %${spec}. %${spec} prints garbage for an int.`);
            else if (t.startsWith("char") && t.endsWith("[]") && spec === "c") f.add(i + 1, "warning", `${bare} is a string (char array); print it with %s, not %c.`);
          }
        });
      }
    }
  });
}

function checkC(src: Source, f: Findings, cpp: boolean) {
  const all = src.code.join("\n");
  const includes = src.raw.filter((l) => /^\s*#\s*include/.test(l)).join("\n");
  const has = (header: string) => new RegExp(String.raw`#\s*include\s*[<"]${header.replace(/[.+*?^$()[\]{}|\\]/g, "\\$&")}[>"]`).test(includes);
  const firstLine = (re: RegExp) => {
    const i = src.code.findIndex((l) => re.test(l));
    return i === -1 ? null : i + 1;
  };
  const types = declaredTypes(src);

  src.raw.forEach((raw, i) => {
    const line = src.code[i];
    const n = i + 1;
    if (/#\s*include\s*<conio\.h>/.test(raw)) f.add(n, "error", "conio.h is an old Turbo C header; gcc and modern compilers don't have it. Delete this line (and getch()/clrscr()).");
    {
      const g1 = /#\s*include\s*<(iostream|fstream|iomanip)\.h>/.exec(raw)?.[1];
      if (g1) f.add(n, "error", `Old Turbo C++ header: write #include <${g1}> (without .h) and add using namespace std;`);
    }
    {
      const g1 = /#\s*include\s*<(dos|graphics|alloc)\.h>/.exec(raw)?.[1];
      if (g1) f.add(n, "error", `${g1}.h only exists in Turbo C. Remove it; it won't compile with gcc.`);
    }
    {
      const g1 = /\b(clrscr|getch|getche)\s*\(/.exec(line)?.[1];
      if (g1) f.add(n, "error", `${g1}() comes from Turbo C's conio.h and doesn't exist in standard C. Remove it (use getchar() if you really need to wait for a key).`);
    }
    if (/\bvoid\s+main\s*\(/.test(line)) f.add(n, cpp ? "error" : "warning", `main must return int: write "int main()" and end it with "return 0;".${cpp ? " void main doesn't compile in C++." : ""}`);
    if (/\bgets\s*\(/.test(line)) f.add(n, "error", "gets() was removed from C because it can overflow the array. Use fgets(name, sizeof name, stdin) or scanf(\"%s\", name).");
    {
      const g1 = /\b(strrev|strupr|strlwr|itoa)\s*\(/.exec(line)?.[1];
      if (g1) f.add(n, "error", `${g1}() isn't standard C (Turbo C only) and won't compile with gcc. Write the loop yourself.`);
    }
    const capital = /\b(Printf|Scanf|PRINTF|SCANF|Return|Else|If|For|While|Switch|Case|Break|Main)\b\s*[(\s{;:]/.exec(line) ?? /\b(Int|Float|Char|Void|Double)\s+[a-z_]\w*\s*[=;,()\[]/.exec(line);
    if (capital && !types.has(capital[1])) f.add(n, "error", `${cpp ? "C++" : "C"} is case-sensitive: write "${capital[1].toLowerCase()}", not "${capital[1]}".`);
    if (/\belseif\b/.test(line)) f.add(n, "error", `Write "else if" as two words.`);

    // if (x = 5): assignment where a comparison was meant.
    const assigned = assignsInCondition(line);
    if (assigned) f.add(n, "warning", `"=" stores a value; to compare, use "==". As written, the ${assigned} condition changes the variable and is almost always true.`);
    // A ; straight after if/for/while (...) makes the body empty.
    const empty = emptyBodyKeyword(line);
    if (empty) {
      const prev = prevCodeLine(src, i - 1);
      const isDoWhile = /^\s*}\s*while\b/.test(line) || (/^\s*while\b/.test(line) && prev?.text.endsWith("}"));
      if (!isDoWhile) f.add(n, "warning", `The ";" right after ${empty}(...) ends it here, so the block below it isn't controlled by it. Remove this ";".`);
    }
    if (/\b\w+\s*==\s*"/.test(raw) && !cpp) f.add(n, "error", `In C, "==" can't compare strings. Use strcmp(a, "text") == 0 (from string.h).`);
    const charCmp = /\b([A-Za-z_]\w*)\s*==\s*"(.)"/.exec(raw);
    if (charCmp && types.get(charCmp[1]) === "char") f.add(n, "error", `${charCmp[1]} is a single char: compare it with single quotes, '${charCmp[2]}', not "${charCmp[2]}".`);
    if (/\b1\s*\/\s*2\b/.test(line)) f.add(n, "warning", "1/2 is 0 in integer maths (both are ints). Write 0.5 or 1.0/2.");
    const div = /\b(?:float|double)\s+[A-Za-z_]\w*\s*=\s*\(?\s*([A-Za-z_]\w*)\s*\/\s*([A-Za-z_]\w*|\d+)\s*\)?\s*;/.exec(line) ?? /^\s*([A-Za-z_]\w*)\s*=\s*\(?\s*([A-Za-z_]\w*)\s*\/\s*([A-Za-z_]\w*|\d+)\s*\)?\s*;/.exec(line);
    if (div) {
      const [target, a, b] = div.length === 4 ? [div[1], div[2], div[3]] : [null, div[1], div[2]];
      const tt = target ? types.get(target) : "float";
      if (isFloat(tt) && isInt(types.get(a)) && (/^\d+$/.test(b) || isInt(types.get(b)))) {
        f.add(n, "warning", `${a} / ${b} divides two integers, so the decimals are lost before the result is stored. Write (float)${a} / ${b}.`);
      }
    }
    const mod = /\b([A-Za-z_]\w*)\s*%\s*([A-Za-z_]\w*|\d+)/.exec(line);
    if (mod && !/"/.test(raw.slice(0, raw.indexOf(mod[0]))) && (isFloat(types.get(mod[1])) || isFloat(types.get(mod[2])))) {
      f.add(n, "error", `% only works with whole numbers, but ${isFloat(types.get(mod[1])) ? mod[1] : mod[2]} is a decimal type. Use int, or fmod() from math.h.`);
    }
  });

  if (!cpp) {
    const printfLine = firstLine(/\b(printf|scanf|puts|getchar|putchar|fgets|fopen|fprintf|fscanf)\s*\(/);
    if (printfLine && !has("stdio.h")) f.add(printfLine, "error", "printf/scanf need #include <stdio.h> at the top of the file.");
  } else {
    const coutLine = firstLine(/\b(cout|cin|endl)\b/);
    if (coutLine && !has("iostream") && !has("bits/stdc++.h")) f.add(coutLine, "error", "cout and cin need #include <iostream> at the top of the file.");
    if (coutLine && !/using\s+namespace\s+std\s*;/.test(all) && !/std::(cout|cin)/.test(all)) f.add(coutLine, "error", `Add "using namespace std;" after the includes, or write std::cout and std::cin.`);
    const strLine = firstLine(/(^|[^:\w])string\s+\w/);
    if (strLine && !has("string") && !has("iostream") && !has("bits/stdc++.h")) f.add(strLine, "warning", "string needs #include <string>.");
  }
  const mathLine = firstLine(/\b(sqrt|pow|ceil|floor|sin|cos|tan|log10|fabs|fmod)\s*\(/);
  if (mathLine && !has(cpp ? "cmath" : "math.h") && !has("math.h") && !has("cmath") && !has("bits/stdc++.h")) f.add(mathLine, "error", `${/\b(sqrt|pow|ceil|floor|sin|cos|tan|log10|fabs|fmod)\b/.exec(src.code[mathLine - 1])![1]}() needs #include <${cpp ? "cmath" : "math.h"}>.`);
  const strFnLine = firstLine(/\b(strlen|strcpy|strcmp|strcat|strncpy|strncmp|strstr|strchr)\s*\(/);
  if (strFnLine && !has("string.h") && !has("cstring") && !has("bits/stdc++.h")) f.add(strFnLine, "error", `${/\b(strlen|strcpy|strcmp|strcat|strncpy|strncmp|strstr|strchr)\b/.exec(src.code[strFnLine - 1])![1]}() needs #include <${cpp ? "cstring" : "string.h"}>.`);
  const ctypeLine = firstLine(/\b(toupper|tolower|isupper|islower|isdigit|isalpha|isspace|isalnum)\s*\(/);
  if (ctypeLine && !cpp && !has("ctype.h")) f.add(ctypeLine, "error", "toupper/isdigit and friends need #include <ctype.h>.");
  const allocLine = firstLine(/\b(malloc|calloc|realloc|free|exit|atoi|rand|srand|abs)\s*\(/);
  if (allocLine && !cpp && !has("stdlib.h") && !/\babs\s*\(/.test(src.code[allocLine - 1])) f.add(allocLine, "error", "malloc/free/exit/atoi/rand need #include <stdlib.h>.");

  if (/\bint\s+main\s*\(/.test(all) && !/\breturn\s+0\s*;/.test(all) && !/\breturn\s+EXIT_SUCCESS/.test(all)) {
    f.add(firstLine(/\bint\s+main\s*\(/), "tip", `End main with "return 0;" so the program reports success.`);
  }

  checkFormats(src, f, types);
  checkUninitialised(src, f, types);
  checkSwitchBreaks(src, f);
  checkSemicolons(src, f, cpp ? "cpp" : "c");
}

/** `int sum;` then `sum += x` with nothing stored in sum first. */
function checkUninitialised(src: Source, f: Findings, types: VarTypes) {
  const declaredAt = new Map<string, number>();
  const declNoInit = /\b(?:int|long|float|double|short)\s+([^;(){}=]+);/;
  src.code.forEach((line, i) => {
    const m = declNoInit.exec(line);
    if (!m || /\(/.test(line)) return;
    for (const part of m[1].split(",")) {
      const name = part.trim();
      if (/^[A-Za-z_]\w*$/.test(name)) declaredAt.set(name, i);
    }
  });
  for (const [name, at] of declaredAt) {
    if (!types.has(name)) continue;
    for (let i = at + 1; i < src.code.length; i++) {
      const line = src.code[i];
      const assigned = new RegExp(String.raw`(^|[^\w.])${name}\s*=(?!=)\s*(?!.*\b${name}\b)`).test(line) || new RegExp(String.raw`&\s*${name}\b`).test(line) || new RegExp(String.raw`\bfor\s*\(\s*${name}\s*=`).test(line) || new RegExp(String.raw`\bcin\b.*>>\s*${name}\b`).test(line);
      if (assigned) break;
      const used = new RegExp(String.raw`(^|[^\w.])${name}\s*(\+=|-=|\*=|/=|\+\+|--)|(^|[^\w.])${name}\s*=\s*${name}\b`).test(line);
      if (used) {
        f.add(i + 1, "warning", `${name} is used here before it's given a value (it holds garbage). Start it at 0 (or 1 for a product) where you declare it.`);
        break;
      }
    }
  }
}

/** A case with statements that falls into the next case without break. */
function checkSwitchBreaks(src: Source, f: Findings) {
  let switchDepth: number | null = null;
  let depth = 0;
  let open: { line: number; statements: number } | null = null;
  const close = () => {
    if (open && open.statements > 0) f.add(open.line, "warning", "This case has no break, so the program carries on into the next case too. Add break; at the end of it (unless that's what you want).");
    open = null;
  };
  src.code.forEach((line, i) => {
    const t = line.trim();
    if (switchDepth === null && /\bswitch\s*\(/.test(t)) switchDepth = depth;
    if (switchDepth !== null && depth === switchDepth + 1 && /^(case\b[^:]*|default\s*):/.test(t)) {
      close();
      const rest = t.replace(/(case\s+('[^']*'|[^:'])+|default\s*):\s*/g, "").trim();
      open = { line: i + 1, statements: rest && rest !== "{" ? 1 : 0 };
      if (/\b(break|return|continue|exit)\b/.test(rest)) open = null;
    } else if (open && switchDepth !== null) {
      if (/\b(break|return|continue|exit)\b/.test(t)) open = null;
      else if (t && t !== "{" && t !== "}") open.statements++;
    }
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (switchDepth !== null && depth === switchDepth) {
          // The last case may end without break.
          open = null;
          switchDepth = null;
        }
      }
    }
  });
}

// ---------- Java ----------

function checkJava(src: Source, f: Findings, runs: boolean) {
  const all = src.code.join("\n");
  const pub = /\bpublic\s+class\s+([A-Za-z_]\w*)/.exec(all);
  if (runs && pub && pub[1] !== "Main") {
    const line = src.code.findIndex((l) => /\bpublic\s+class\b/.test(l)) + 1;
    f.add(line, "error", `Name the public class Main (public class Main). The file is compiled as Main.java, so "${pub[1]}" won't compile.`);
  }
  if (/\bScanner\b/.test(all) && !/import\s+java\.util\.(Scanner|\*)\s*;/.test(all)) f.add(src.code.findIndex((l) => /\bScanner\b/.test(l)) + 1, "error", "Scanner needs import java.util.Scanner; at the top of the file.");
  for (const [cls, pkg] of [["ArrayList", "java.util"], ["HashMap", "java.util"], ["List", "java.util"], ["Arrays", "java.util"], ["BufferedReader", "java.io"], ["InputStreamReader", "java.io"]] as const) {
    const re = new RegExp(String.raw`\b${cls}\b`);
    if (re.test(all) && !new RegExp(String.raw`import\s+${pkg.replace(".", "\\.")}\.(${cls}|\*)\s*;`).test(all)) f.add(src.code.findIndex((l) => re.test(l)) + 1, "error", `${cls} needs import ${pkg}.${cls}; (or import ${pkg}.*;) at the top.`);
  }
  src.raw.forEach((raw, i) => {
    const line = src.code[i];
    const n = i + 1;
    if (/\bsystem\.out\b|\bSystem\.Out\b|\.(Println|PrintLn|Print)\s*\(/.test(line)) f.add(n, "error", "Java is case-sensitive: write System.out.println (capital S, the rest lower case).");
    if (/\bstatic\s+void\s+main\s*\(\s*String\s+\w+\s*\)/.test(line)) f.add(n, "error", "main takes an array: public static void main(String[] args).");
    if (/\bpublic\s+static\s+void\s+Main\s*\(/.test(line)) f.add(n, "error", "The entry point is main with a lower-case m.");
    if (/\b(string|integer|boolean\s+[A-Z])\s+[a-z]\w*\s*[=;]/.test(line) && /\bstring\s/.test(line)) f.add(n, "error", "String starts with a capital S in Java.");
    if (/"\s*==\s*[A-Za-z_]|\b[A-Za-z_]\w*\s*==\s*"/.test(raw)) f.add(n, "warning", `Compare Strings with .equals(): a.equals("text"). "==" checks whether they are the same object, not the same text.`);
    if (assignsInCondition(line)) f.add(n, "warning", `"=" assigns; use "==" to compare in a condition.`);
    const empty = emptyBodyKeyword(line);
    if (empty && !/^\s*}\s*while\b/.test(line)) f.add(n, "warning", `The ";" right after ${empty}(...) ends it here, so the block below isn't controlled by it.`);
    if (/\bnextInt\(\)|nextDouble\(\)/.test(line) && src.code.slice(i + 1).some((l) => /\.nextLine\(\)/.test(l))) f.add(n, "tip", "nextInt() leaves the Enter key in the input, so the next nextLine() returns an empty line. Call sc.nextLine() once after nextInt() before reading text.");
  });
  const types: VarTypes = new Map();
  checkSemicolons(src, f, "java");
  checkUninitialised(src, f, declaredTypesJava(src, types));
  checkSwitchBreaks(src, f);
}

function declaredTypesJava(src: Source, types: VarTypes): VarTypes {
  for (const line of src.code) for (const m of line.matchAll(/\b(int|long|double|float|short)\s+([A-Za-z_]\w*)\s*;/g)) types.set(m[2], m[1]);
  return types;
}

// ---------- Python ----------

function checkPython(src: Source, f: Findings) {
  let indentStyle: "tab" | "space" | null = null;
  const numericUse = new Map<string, number>();
  src.raw.forEach((raw, i) => {
    const line = src.code[i];
    const n = i + 1;
    const lead = /^[ \t]*/.exec(raw)![0];
    if (line.trim()) {
      if (lead.includes("\t") && lead.includes(" ")) f.add(n, "error", "This line's indentation mixes tabs and spaces. Use 4 spaces everywhere.");
      else if (lead) {
        const style = lead.includes("\t") ? "tab" : "space";
        if (indentStyle && style !== indentStyle) f.add(n, "error", "This line is indented with tabs but others use spaces (or the other way round). Use 4 spaces everywhere.");
        indentStyle ??= style;
      }
    }
    const t = line.trim();
    if (/^print\s+[^\s(=]/.test(t) || /^print\s*$/.test(t)) f.add(n, "error", "In Python 3, print is a function: print(\"text\", value).");
    if (/\braw_input\s*\(/.test(line)) f.add(n, "error", "raw_input() is Python 2. In Python 3 use input().");
    if (/^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(t) && !/:\s*(#.*)?$/.test(t) && !/[(\[{,\\]$/.test(t)) {
      f.add(n, "error", `A line starting with "${t.split(/\W/)[0]}" must end with a colon ":".`);
    }
    if (/:\s*$/.test(t) && /^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(t)) {
      const next = nextCodeLine(src, i + 1);
      if (next) {
        const nextLead = /^[ \t]*/.exec(src.raw[next.index])![0].length;
        if (nextLead <= lead.length) f.add(next.index + 1, "error", `The line after "${t.split(/\W/)[0]} ...:" (line ${n}) must be indented further, or Python can't tell what belongs to the block.`);
      }
    }
    const assign = /^([A-Za-z_]\w*)\s*=\s*input\s*\(/.exec(t);
    if (assign) numericUse.set(assign[1], n);
    if (/[=!]=\s*None\b/.test(line)) f.add(n, "tip", "Compare with None using \"is None\" / \"is not None\".");
    if (/;\s*$/.test(line)) f.add(n, "tip", "Python doesn't need a ; at the end of a line.");
    if (/^except\s*:/.test(t)) f.add(n, "tip", "A bare except: catches every error, even typos. Catch the error you expect, e.g. except ValueError:.");
    {
      const g1 = /\b(len|range)\s*\(\s*\)/.exec(line)?.[1];
      if (g1) f.add(n, "error", `${g1}() needs an argument.`);
    }
  });
  for (const [name, at] of numericUse) {
    const used = src.code.some((l, i) => i + 1 > at && new RegExp(String.raw`(\b${name}\s*[-*/%<>]|[-*/%]\s*${name}\b|range\(\s*${name}\b|\b${name}\s*\+\s*\d|\d\s*\+\s*${name}\b)`).test(l) && !new RegExp(String.raw`(int|float)\(\s*${name}\s*\)`).test(l));
    const converted = src.code.some((l) => new RegExp(String.raw`\b${name}\s*=\s*(int|float)\(\s*${name}\s*\)`).test(l));
    if (used && !converted) f.add(at, "error", `input() gives text, not a number. Write ${name} = int(input()) (or float(...)) before doing maths with ${name}.`);
  }
  checkBrackets(src, f);
}

// ---------- JavaScript / Node ----------

function checkJavaScript(src: Source, f: Findings) {
  src.code.forEach((line, i) => {
    const n = i + 1;
    if (/(^|[^\w$])var\s+/.test(line)) f.add(n, "tip", "Use let (or const, if the value never changes) instead of var.");
    if (/[^=!<>]==[^=]|!=[^=]/.test(line)) f.add(n, "tip", "Use === and !== : == converts types first, so \"5\" == 5 is true.");
    if (assignsInCondition(line)) f.add(n, "warning", `"=" assigns; use "===" to compare in a condition.`);
    {
      const g1 = /\bdb\.\w+\.(insert|remove|update)\s*\(/.exec(line)?.[1];
      if (g1) f.add(n, "tip", `${g1}() is deprecated in MongoDB; use ${g1 === "insert" ? "insertOne/insertMany" : g1 === "remove" ? "deleteOne/deleteMany" : "updateOne/updateMany"}.`);
    }
    if (/\bapp\.listen\s*\(\s*\d+\s*\)/.test(line)) f.add(n, "tip", "Read the port from process.env.PORT with a default: app.listen(process.env.PORT || 3000).");
    if (/\bconsole\.log\s*\(\s*\)/.test(line)) f.add(n, "tip", "This console.log() prints an empty line.");
    if (/\b(Console|console)\.(Log|log)\b/.test(line) && /Console\.|\.Log\b/.test(line)) f.add(n, "error", "JavaScript is case-sensitive: console.log.");
    if (/\bdocument\.write\s*\(/.test(line)) f.add(n, "tip", "Avoid document.write; change the page with textContent or appendChild.");
  });
  checkBrackets(src, f);
}

// ---------- PHP ----------

function checkPhp(src: Source, f: Findings) {
  const first = src.raw.findIndex((l) => l.trim());
  if (first !== -1 && !src.raw.join("\n").includes("<?php") && !src.raw[first].includes("<?=")) f.add(first + 1, "error", "A PHP file must start with <?php, or nothing runs as PHP.");
  src.raw.forEach((raw, i) => {
    const line = src.code[i];
    const n = i + 1;
    if (/\bmysql_\w+\s*\(/.test(line)) f.add(n, "error", "mysql_* functions were removed in PHP 7. Use mysqli or PDO with prepared statements.");
    if (/\becho\s+\$_(GET|POST|REQUEST)\[/.test(raw)) f.add(n, "warning", "Printing user input directly lets people inject HTML/JavaScript (XSS). Wrap it: echo htmlspecialchars($_GET['name']);");
    if (/(SELECT|INSERT|UPDATE|DELETE)\b.*\$_(GET|POST|REQUEST)/i.test(raw) || (/(SELECT|INSERT|UPDATE|DELETE)\b/i.test(raw) && /["']\s*\.\s*\$\w+/.test(raw))) f.add(n, "warning", "Building SQL by joining strings with user input allows SQL injection. Use a prepared statement with ? placeholders.");
    if (/^\s*(?!\$|function|class|if|else|for|while|foreach|return|echo|print|use|namespace|public|private|protected|static|const|new|require|include)[a-z_]\w*\s*=[^=>]/i.test(line) && !/<\?php/.test(raw)) f.add(n, "error", "PHP variables start with $: write $" + /([a-z_]\w*)/i.exec(line.trim())![1] + ".");
    if (assignsInCondition(line)) f.add(n, "warning", `"=" assigns; use "==" (or "===") to compare.`);
  });
  checkSemicolons({ raw: src.raw, code: src.code.map((l, i) => (/<\?php|\?>/.test(src.raw[i]) ? "" : l)) }, f, "php");
  checkBrackets(src, f);
}

// ---------- SQL ----------

function checkSql(src: Source, f: Findings) {
  const statements = src.code.join("\n");
  src.code.forEach((line, i) => {
    const n = i + 1;
    if (/\bselect\s+\*/i.test(line)) f.add(n, "tip", "Name the columns you need instead of SELECT *.");
    if (/(=|<>|!=)\s*null\b/i.test(line)) f.add(n, "error", "Nothing is ever equal to NULL. Use IS NULL / IS NOT NULL.");
    if (/\b(update|delete\s+from)\b/i.test(line)) {
      const rest = statements.split("\n").slice(i).join("\n").split(";")[0];
      if (!/\bwhere\b/i.test(rest)) f.add(n, "warning", `This ${/update/i.test(line) ? "UPDATE" : "DELETE"} has no WHERE, so it changes every row in the table.`);
    }
    if (/\bgroup\s+by\b/i.test(line) === false && /\bhaving\b/i.test(line) && !/\bgroup\s+by\b/i.test(statements)) f.add(n, "warning", "HAVING filters groups; use it with GROUP BY (or use WHERE for rows).");
  });
  checkBrackets(src, f);
}

// ---------- HTML / CSS ----------

const CONTAINER_TAGS = ["div", "section", "article", "nav", "header", "footer", "main", "aside", "ul", "ol", "table", "form", "span", "button", "a", "h1", "h2", "h3", "h4", "h5", "h6", "select", "label"];

function checkHtml(src: Source, f: Findings) {
  const text = src.raw.join("\n").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const lines = text.split("\n");
  if (/<html[\s>]/i.test(text) && !/<!doctype\s+html>/i.test(text)) f.add(1, "warning", "Start the page with <!DOCTYPE html> so browsers use standards mode.");
  if (/<html[\s>]/i.test(text) && !/<html[^>]*\blang=/i.test(text)) f.add(lines.findIndex((l) => /<html/i.test(l)) + 1, "tip", 'Add a language to the page: <html lang="en">.');
  if (/<head[\s>]/i.test(text) && !/<meta[^>]+name=["']?viewport/i.test(text)) f.add(lines.findIndex((l) => /<head/i.test(l)) + 1, "tip", 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so the page works on phones.');
  lines.forEach((line, i) => {
    const n = i + 1;
    for (const m of line.matchAll(/<img\b[^>]*>/gi)) if (!/\balt\s*=/i.test(m[0])) f.add(n, "warning", 'This <img> has no alt text. Add alt="what the image shows" for screen readers (alt="" if it is decoration).');
    const old = /<(font|center|marquee|blink|big|strike|tt)\b/i.exec(line);
    if (old) f.add(n, "warning", `<${old[1].toLowerCase()}> is obsolete HTML. Use CSS for how things look.`);
    if (/<input\b(?![^>]*\btype=)[^>]*>/i.test(line)) f.add(n, "tip", 'Give this <input> a type (text, email, number, password...).');
    if (/<a\b[^>]*target=["']?_blank/i.test(line) && !/rel=["'][^"']*noopener/i.test(line)) f.add(n, "tip", 'Links with target="_blank" should also have rel="noopener".');
    if (/\bstyle\s*=\s*["'][^"']{60,}/i.test(line)) f.add(n, "tip", "Long inline styles are hard to maintain; move them to a CSS class.");
    if (/<\/?[A-Z][A-Za-z]*[\s>]/.test(line) && !/<[A-Z]\w*\s*\/>/.test(line)) f.add(n, "tip", "Write HTML tag names in lower case.");
  });
  for (const tag of CONTAINER_TAGS) {
    const opens: number[] = [];
    let closes = 0;
    lines.forEach((line, i) => {
      for (const _ of line.matchAll(new RegExp(String.raw`<${tag}(\s[^>]*)?>`, "gi"))) opens.push(i + 1);
      closes += (line.match(new RegExp(String.raw`</${tag}\s*>`, "gi")) ?? []).length;
    });
    if (opens.length > closes) f.add(opens[opens.length - 1 - (closes > 0 ? 0 : 0)] ?? null, "error", `<${tag}> is opened ${opens.length} time${opens.length === 1 ? "" : "s"} but closed only ${closes} time${closes === 1 ? "" : "s"}. Add the missing </${tag}>.`);
    else if (closes > opens.length) f.add(lines.findIndex((l) => new RegExp(`</${tag}\\s*>`, "i").test(l)) + 1, "error", `There's a </${tag}> with no matching <${tag}>.`);
  }
  // CSS written in <style> blocks is reviewed too, on its real line numbers.
  const styleStart = lines.findIndex((l) => /<style[^>]*>/i.test(l));
  if (styleStart !== -1) {
    const masked = lines.map((l, i) => {
      if (i < styleStart) return "";
      const before = i === styleStart ? l.replace(/^[\s\S]*<style[^>]*>/i, (m) => m.replace(/[^\n]/g, " ")) : l;
      return before;
    });
    const end = masked.findIndex((l) => /<\/style>/i.test(l));
    const css = masked.map((l, i) => (end !== -1 && i > end ? "" : i === end ? l.replace(/<\/style>[\s\S]*$/i, "") : l));
    checkCss(maskSource(css.join("\n"), "css"), f);
  }
}

const CSS_PROPS = new Set(
  `align-content align-items align-self all animation animation-delay animation-direction animation-duration animation-fill-mode animation-iteration-count animation-name animation-play-state animation-timing-function aspect-ratio backdrop-filter backface-visibility background background-attachment background-blend-mode background-clip background-color background-image background-origin background-position background-repeat background-size block-size border border-block border-bottom border-bottom-color border-bottom-left-radius border-bottom-right-radius border-bottom-style border-bottom-width border-collapse border-color border-image border-inline border-left border-left-color border-left-style border-left-width border-radius border-right border-right-color border-right-style border-right-width border-spacing border-style border-top border-top-color border-top-left-radius border-top-right-radius border-top-style border-top-width border-width bottom box-shadow box-sizing break-inside caption-side caret-color clear clip clip-path color column-count column-gap columns content counter-increment counter-reset cursor direction display empty-cells filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font font-family font-feature-settings font-size font-style font-variant font-weight gap grid grid-area grid-auto-columns grid-auto-flow grid-auto-rows grid-column grid-column-end grid-column-start grid-row grid-row-end grid-row-start grid-template grid-template-areas grid-template-columns grid-template-rows height hyphens inline-size inset isolation justify-content justify-items justify-self left letter-spacing line-height list-style list-style-image list-style-position list-style-type margin margin-block margin-bottom margin-inline margin-left margin-right margin-top max-block-size max-height max-inline-size max-width min-height min-width mix-blend-mode object-fit object-position opacity order outline outline-color outline-offset outline-style outline-width overflow overflow-wrap overflow-x overflow-y padding padding-block padding-bottom padding-inline padding-left padding-right padding-top page-break-after perspective place-content place-items place-self pointer-events position quotes resize right rotate row-gap scale scroll-behavior scroll-margin scroll-padding scroll-snap-align scroll-snap-type src tab-size table-layout text-align text-decoration text-decoration-color text-decoration-line text-decoration-style text-indent text-overflow text-shadow text-transform top transform transform-origin transition transition-delay transition-duration transition-property transition-timing-function translate unicode-range user-select vertical-align visibility white-space width will-change word-break word-spacing word-wrap writing-mode z-index accent-color appearance container container-type content-visibility font-display inset-inline line-clamp`.split(
    /\s+/,
  ),
);

function checkCss(src: Source, f: Findings) {
  let depth = 0;
  src.code.forEach((line, i) => {
    const n = i + 1;
    const before = depth;
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth = Math.max(0, depth - 1);
    }
    if (before === 0 && !line.includes("{")) return;
    for (const m of line.matchAll(/(?:^|[;{\s])([a-zA-Z-]+)\s*:\s*([^;{}]*)/g)) {
      const prop = m[1].toLowerCase();
      if (prop.startsWith("--") || prop.startsWith("-") || /^(hover|focus|active|before|after|root|not|nth|first|last|visited|checked|disabled)/.test(prop)) continue;
      if (line.trim().endsWith("{")) continue; // a selector like a:hover {
      if (!CSS_PROPS.has(prop)) f.add(n, "warning", `"${prop}" isn't a CSS property${suggestProp(prop)}. The browser ignores this line.`);
      const value = m[2].trim();
      if (/^#/.test(value) && !/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(value)) f.add(n, "error", `"${value.split(/\s/)[0]}" isn't a valid colour. Hex colours use 0-9 and a-f, with 3 or 6 digits.`);
      if (/^\d+(\.\d+)?$/.test(value) && value !== "0" && /^(width|height|margin|padding|top|left|right|bottom|font-size|border-radius|gap|max-width|min-width|max-height|min-height)/.test(prop)) f.add(n, "error", `${prop}: ${value} needs a unit, like ${value}px or ${value}rem.`);
    }
    // Two declarations on following lines without ; between them.
    const t = line.trim();
    const next = nextCodeLine(src, i + 1);
    if (depth > 0 && /^[a-zA-Z-]+\s*:\s*[^;{}]+$/.test(t) && next && /^[a-zA-Z-]+\s*:/.test(next.text) && !next.text.endsWith("{")) {
      f.add(n, "error", `Missing ";" at the end of this line: without it, the browser ignores this line and the next one.`);
    }
  });
  checkBrackets(src, f);
}

const COMMON_TYPOS: Record<string, string> = { colour: "color", "background-colour": "background-color", "font-colour": "color", "text-colour": "color", "text-color": "color", "font-color": "color", widht: "width", heigth: "height", hieght: "height", "margin-botom": "margin-bottom", "padding-botom": "padding-bottom", "boder": "border", "backround": "background", "align": "text-align", "font-wieght": "font-weight", "font-size-adjust": "font-size" };
function suggestProp(prop: string) {
  const fix = COMMON_TYPOS[prop];
  return fix ? ` (did you mean "${fix}"?)` : "";
}

// ---------- Shell, Dockerfile, YAML ----------

function checkShell(src: Source, f: Findings) {
  if (src.raw[0] && !src.raw[0].startsWith("#!")) f.add(1, "tip", "Start a script with a shebang line: #!/bin/bash");
  src.raw.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/(^|\s)#.*$/, "");
    if (/^\s*[A-Za-z_]\w*\s+=\s*\S|^\s*[A-Za-z_]\w*=\s+\S/.test(line) && !/^\s*(if|while|until|\[|test|let|echo)\b/.test(line)) f.add(n, "error", "In bash there are no spaces around =: write name=value.");
    if (/\bif\s+\[[^\s\[]|[^\s\]]\]\s*(;|$|\s*then)/.test(line) && /\[/.test(line)) f.add(n, "error", "Put spaces inside the brackets: if [ \"$a\" -gt 5 ]; then");
    if (/\bif\s+\[.*\]\s*$/.test(line) && !/then/.test(line) && !/^\s*then\b/.test(src.raw[i + 1] ?? "")) f.add(n, "error", 'An if needs "then": if [ ... ]; then');
    if (/\[\s[^\]]*\s(>|<)\s[^\]]*\]/.test(line) && !/\[\[/.test(line)) f.add(n, "warning", "Inside [ ], > and < redirect to a file. Compare numbers with -gt, -lt, -ge, -le, -eq.");
    if (/\brm\s+-rf?\s+\$\w+/.test(line) && !/"\$\w+"/.test(line)) f.add(n, "warning", 'Quote variables in rm: rm -rf "$dir". An empty or spaced value could delete the wrong files.');
    if (/\bgit\s+push\b.*(--force|-f\b)/.test(line) && /\b(main|master)\b/.test(line)) f.add(n, "warning", "Force-pushing main rewrites history for everyone. Use --force-with-lease on your own branch instead.");
    if (/\bgit\s+commit\b(?!.*-m)/.test(line) && !/--amend|--no-edit|-F\b/.test(line)) f.add(n, "tip", 'git commit without -m opens an editor. Add a message: git commit -m "Add login page"');
    if (/\bgit\s+add\s+\.\s*$/.test(line)) f.add(n, "tip", "git add . stages everything; check git status first so you don't commit secrets or build files.");
    if (/\bchmod\s+777\b/.test(line)) f.add(n, "warning", "chmod 777 lets anyone change the file. Use 755 for scripts or 644 for files.");
  });
}

function checkDockerfile(src: Source, f: Findings) {
  const lines = src.raw.map((l) => l.trim());
  const first = lines.findIndex((l) => l && !l.startsWith("#") && !/^ARG\b/i.test(l));
  if (first !== -1 && !/^FROM\b/i.test(lines[first])) f.add(first + 1, "error", "A Dockerfile must start with FROM (only ARG may come before it).");
  if (!lines.some((l) => /^(CMD|ENTRYPOINT)\b/i.test(l))) f.add(null, "warning", "There's no CMD or ENTRYPOINT, so the container doesn't know what to run.");
  lines.forEach((l, i) => {
    const n = i + 1;
    if (/^FROM\s+[\w./-]+(\s|$)/i.test(l) && !/:/.test(l.split(/\s+/)[1] ?? "") && !/@sha256/.test(l)) f.add(n, "tip", "Pin the base image to a version (for example node:20-alpine) so builds don't change under you.");
    if (/^FROM\s+\S+:latest\b/i.test(l)) f.add(n, "tip", "Avoid :latest; pin a version tag.");
    if (/apt-get\s+install\b/.test(l) && !/\s-y\b|--yes|--assume-yes/.test(l)) f.add(n, "error", "apt-get install asks for confirmation and the build can't answer. Add -y.");
    if (/^RUN\s+apt-get\s+update\s*$/i.test(l)) f.add(n, "warning", "Run apt-get update in the same RUN as apt-get install (joined with &&), or later builds use a stale package list.");
    if (/^ADD\s+(?!https?:)/i.test(l) && !/\.tar/.test(l)) f.add(n, "tip", "Use COPY for local files; ADD is only needed for URLs and archives.");
    if (/^RUN\s+cd\s/i.test(l)) f.add(n, "tip", "Use WORKDIR instead of RUN cd: each RUN starts a new shell.");
    if (/^(from|run|copy|cmd|workdir|expose|env|entrypoint|add)\s/.test(l)) f.add(n, "tip", "Write Dockerfile instructions in capitals (FROM, RUN, COPY...).");
    if (/^(ENV|ARG)\s+\w*(PASSWORD|SECRET|TOKEN|KEY)\w*\s*=?\s*\S/i.test(l)) f.add(n, "warning", "Don't bake secrets into an image; pass them at run time with environment variables or secrets.");
    if (/^COPY\s+\.\s+\.\s*$/i.test(l) && !lines.slice(0, i).some((x) => /^COPY\s+.*package.*json/i.test(x)) && lines.some((x) => /npm (ci|install)/.test(x))) f.add(n, "tip", "Copy package*.json and run npm ci before COPY . . so Docker can cache the installed packages.");
  });
}

function checkYaml(src: Source, f: Findings) {
  src.raw.forEach((raw, i) => {
    const n = i + 1;
    if (/^\t+/.test(raw) || /^ *\t/.test(raw)) f.add(n, "error", "YAML doesn't allow tabs for indentation. Use spaces (2 per level).");
    if (/^\s*[\w.-]+:[^\s/:'"]/.test(raw) && !/^\s*[\w.-]+:\/\//.test(raw) && !/^\s*-/.test(raw)) f.add(n, "error", 'Put a space after the colon: "key: value".');
    const lead = /^ */.exec(raw)![0].length;
    if (raw.trim() && !raw.trim().startsWith("#") && lead % 2 === 1) f.add(n, "warning", "Odd indentation (not a multiple of 2 spaces). Line up this key with the others at its level.");
  });
}

// ---------- Entry points ----------

/** Reviews code line by line without running it. */
export function reviewCode(code: string, editor: EditorLanguage, opts: { runs?: boolean } = {}): ReviewFinding[] {
  const f = new Findings();
  if (!code.trim()) {
    f.add(null, "error", "The file is empty.");
    return f.list;
  }
  const src = maskSource(code, editor);
  switch (editor) {
    case "c":
      checkBrackets(src, f);
      checkC(src, f, false);
      break;
    case "cpp":
      checkBrackets(src, f);
      checkC(src, f, true);
      break;
    case "java":
      checkBrackets(src, f);
      checkJava(src, f, opts.runs ?? false);
      break;
    case "python":
      checkPython(src, f);
      break;
    case "javascript":
    case "jsx":
      checkJavaScript(src, f);
      break;
    case "php":
      checkPhp(src, f);
      break;
    case "sql":
      checkSql(src, f);
      break;
    case "html":
      checkHtml(src, f);
      break;
    case "css":
      checkCss(src, f);
      break;
    case "shell":
    case "bash":
      checkShell(src, f);
      break;
    case "dockerfile":
      checkDockerfile(src, f);
      break;
    case "yaml":
      checkYaml(src, f);
      break;
    case "json":
      try {
        JSON.parse(code);
      } catch (err) {
        const pos = /position (\d+)/.exec((err as Error).message);
        const line = pos ? code.slice(0, Number(pos[1])).split("\n").length : null;
        f.add(line, "error", `Invalid JSON: ${(err as Error).message}. Check for a missing comma, a trailing comma or unquoted keys.`);
      }
      break;
    default:
      break;
  }
  return f.list;
}

/** Plain-language explanations for common compiler messages. */
const EXPLAIN: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/expected ['‘]?;['’]? before/, () => "A ; is missing at the end of the statement just before this point (often the line above)."],
  [/['‘](\w+)['’] undeclared|['‘](\w+)['’] was not declared in this scope|cannot find symbol|name '(\w+)' is not defined|(\w+) is not defined/, (m) => `${m[1] ?? m[2] ?? m[3] ?? m[4] ?? "A name"} is used but was never declared. Check the spelling (capitals matter) and declare it before using it.`],
  [/implicit declaration of function ['‘](\w+)['’]/, (m) => `${m[1]}() isn't known here: include its header (stdio.h, math.h, string.h...) or declare the function above main.`],
  [/expected declaration or statement at end of input|reached end of file while parsing|unexpected EOF|expected ['‘]}['’] at end of input/, () => "The file ends before a { is closed. Add the missing }."],
  [/conio\.h: No such file/, () => "conio.h is Turbo C only; remove it and getch()/clrscr()."],
  [/No such file or directory/, () => "This header doesn't exist on a standard compiler."],
  [/['‘]return['’] with no value, in function returning non-void|missing return statement/, () => "This function promises to return a value but doesn't."],
  [/incompatible types|cannot be converted to|invalid conversion/, () => "The value's type doesn't match the variable's type."],
  [/';' expected/, () => "A ; is missing at the end of this statement."],
  [/class (\w+) is public, should be declared in a file named/, () => "Name the public class Main."],
  [/IndentationError|unexpected indent|expected an indented block|unindent does not match/, () => "The indentation is wrong here. Use 4 spaces for each level and keep blocks lined up."],
  [/invalid syntax|SyntaxError/, () => "Python can't read this line: check for a missing colon, bracket or quote."],
  [/TypeError: can only concatenate str|unsupported operand type\(s\)/, () => "You're mixing text and numbers. Convert input with int() or float(), or use str() when joining text."],
  [/ZeroDivisionError|SIGFPE|Floating point exception/, () => "Division by zero. Check the divisor before dividing."],
  [/IndexError|ArrayIndexOutOfBounds|index out of range/, () => "An index goes past the end of the list/array. Valid indexes are 0 to size-1."],
  [/ValueError: invalid literal for int/, () => "int() got text that isn't a whole number. Read the input the way the question gives it."],
  [/EOFError|NoSuchElementException|InputMismatchException/, () => "The program tried to read more input (or a different kind of input) than the question provides."],
  [/NullPointerException/, () => "Something is null here; create the object before using it."],
  [/Parse error|syntax error, unexpected/, () => "PHP can't read this line: usually a missing ; , bracket or quote on this or the previous line."],
  [/Undefined variable/, () => "This variable is used before it's given a value (and PHP variables start with $)."],
];

function explain(message: string) {
  for (const [re, fn] of EXPLAIN) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return null;
}

/**
 * Turns compiler / interpreter / runtime output into line-numbered findings.
 * Handles gcc and g++ (main.c:5:12: error: ...), javac (Main.java:5: error:),
 * Python tracebacks, Node stack traces, PHP "on line N" and bash "line N:".
 */
export function parseErrorOutput(output: string, language: RunLanguage, source: "compiler" | "runtime"): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const text = output ?? "";
  const add = (line: number | null, severity: ReviewFinding["severity"], message: string, column?: number) => {
    const plain = explain(message);
    out.push({ line, severity, source, message: plain ? `${plain} (${language === "python" ? "Python" : source === "compiler" ? "compiler" : "error"}: ${message.trim()})` : message.trim(), ...(column ? { column } : {}) });
  };
  for (const m of text.matchAll(/^[^\n:]*\.(?:c|cc|cpp|h|hpp|cs):(\d+):(?:(\d+):)?\s*(fatal error|error|warning):\s*(.+)$/gm)) {
    add(Number(m[1]), m[3] === "warning" ? "warning" : "error", m[4], m[2] ? Number(m[2]) : undefined);
  }
  for (const m of text.matchAll(/^[^\n:]*\.java:(\d+):\s*(error|warning):\s*(.+)$/gm)) {
    const after = text.slice(m.index! + m[0].length).split("\n").slice(1, 4).join(" ");
    const symbol = /symbol:\s*(?:variable|method|class)\s+(\w+)/.exec(after);
    add(Number(m[1]), m[2] === "warning" ? "warning" : "error", symbol ? `${m[3]}: ${symbol[1]}` : m[3]);
  }
  if (language === "python" && /Traceback|File ".*", line \d+|Error:/.test(text)) {
    const lines = [...text.matchAll(/File "[^"]*", line (\d+)/g)];
    const last = lines[lines.length - 1];
    const error = /^(\w+(?:Error|Exception)\b.*)$/m.exec(text.split("\n").reverse().join("\n"));
    if (error) add(last ? Number(last[1]) : null, "error", error[1]);
  }
  if (language === "javascript") {
    const where = /(?:main|script|index)\.js:(\d+)/.exec(text);
    const error = /^(\w*Error\b.*)$/m.exec(text);
    if (error) add(where ? Number(where[1]) : null, "error", error[1]);
  }
  if (language === "php") for (const m of text.matchAll(/(?:PHP )?(Parse error|Fatal error|Warning|Notice|Deprecated):\s*(.*?) in \S+ on line (\d+)/g)) add(Number(m[3]), /error/i.test(m[1]) ? "error" : "warning", `${m[1]}: ${m[2]}`);
  if (language === "bash") for (const m of text.matchAll(/\.sh: line (\d+): (.+)$/gm)) add(Number(m[1]), "error", m[2]);
  if (language === "java" && /Exception in thread/.test(text)) {
    const at = /at Main\.\w+\(Main\.java:(\d+)\)/.exec(text);
    const ex = /Exception in thread "\w+" ([\w.$]+)(?::\s*(.*))?/.exec(text);
    if (ex) add(at ? Number(at[1]) : null, "error", `${ex[1].split(".").pop()}${ex[2] ? `: ${ex[2]}` : ""}`);
  }
  if (!out.length && /Segmentation fault|SIGSEGV|status 139/.test(text)) {
    out.push({ line: null, severity: "error", source, message: "Your program crashed (segmentation fault). The usual causes: scanf without & before a variable, an array index past the end, or using a pointer that doesn't point anywhere." });
  }
  if (!out.length && /SIGFPE|Floating point exception/.test(text)) out.push({ line: null, severity: "error", source, message: "Your program divided by zero (or took % of zero). Check the divisor first." });
  if (!out.length && text.trim()) out.push({ line: null, severity: "error", source, message: text.trim().split("\n").slice(0, 6).join("\n").slice(0, 500) });
  return out.filter((f, i) => out.findIndex((g) => g.line === f.line && g.message === f.message) === i).slice(0, 20);
}
