import type { PracticeUnit } from "../../types.js";
import { jq, js } from "./shared.js";

const usesRegex = { match: String.raw`/[^/\n]+/[gimsuy]*\s*[.,;)]|new\s+RegExp\s*\(`, message: "Uses a regular expression" };

export const strings: PracticeUnit = {
  key: "strings",
  title: "Strings and regular expressions",
  summary: "string methods, immutability, splitting and joining, Unicode basics, regular expressions with test, match, matchAll and replace, and named groups",
  reading: js`## Strings are immutable

A string can't be changed in place. Every method returns a new string, so you must use the result:

\`\`\`javascript
let name = "  asha  ";
name.trim();          // returns "asha" but name is unchanged
name = name.trim();   // now name is "asha"
\`\`\`

## Everyday methods

- length, and s[0] or s.at(-1) for single characters.
- toUpperCase(), toLowerCase(), trim(), trimStart(), trimEnd().
- includes("js"), startsWith("http"), endsWith(".pdf"), indexOf("a") (or -1).
- slice(start, end) takes part of a string; negative numbers count from the end: "report.pdf".slice(-3) is "pdf".
- split(",") turns a string into an array; join(", ") turns an array back into a string.
- replace("a", "b") replaces the first match; replaceAll("a", "b") replaces every one.
- padStart(5, "0") and padEnd for fixed widths; repeat(n) for patterns.
- To reverse: [...s].reverse().join(""). Spread splits by characters (code points), so it also works for most emoji, while split("") can break them.

Comparing strings with < and > uses character codes, so "Zebra" < "apple" is true (capital letters come first). For sorting words the way people expect, use a.localeCompare(b).

## Regular expressions

A regular expression (regex) is a pattern for text. It is written between slashes, with flags after it:

\`\`\`javascript
const pin = /^\d{6}$/;        // exactly 6 digits
pin.test("411001");           // true
"Room 12, Floor 3".match(/\d+/g); // ["12", "3"]
\`\`\`

The building blocks:

- \d a digit, \w a letter, digit or underscore, \s a space, tab or new line. \D, \W and \S are the opposites.
- . any character except a new line. To match a real dot write \.
- [aeiou] one of these characters, [a-z] a range, [^0-9] anything except these.
- Quantifiers: * zero or more, + one or more, ? optional, {3} exactly three, {2,4} two to four.
- ^ start and $ end of the text. Without them, test is true if the pattern appears anywhere.
- ( ) groups; | means or: /^(cat|dog)s?$/.
- (?=...) lookahead: \d(?=\d{4}) is a digit that has four more digits after it.

Flags: g (global, find all), i (ignore case), m (^ and $ match at every line), u (Unicode), s (dot matches new lines too).

## Using a regex

- regex.test(text) returns true or false.
- text.match(/.../g) returns all matches as an array, or null when there are none. Write text.match(re) ?? [] to be safe.
- text.matchAll(/.../g) gives every match with its groups, for use in for...of.
- text.replace(/\s+/g, " ") replaces with a string; the replacement can also be a function.
- text.split(/[,;]\s*/) splits on a pattern.

Named groups make results readable:

\`\`\`javascript
const m = "2026-01-15".match(/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/);
m.groups.year; // "2026"
\`\`\`

## Watch out

- A regex with the g flag remembers where it stopped (lastIndex). Calling test repeatedly with the same global regex can give alternating true and false. Don't use g with test.
- Special characters (. * + ? ( ) [ ] { } ^ $ | \ /) must be escaped with \ when you mean them literally.
- Validating with a regex without ^ and $ accepts extra text around the match: /\d{10}/ accepts "abc98765432101xyz".
- Regexes can become unreadable fast. Split the problem, or add a comment explaining the pattern.

## Real uses

Form validation (PIN codes, mobile numbers, emails), cleaning input (collapsing spaces), making URL slugs from titles, masking card numbers, and pulling fields out of log lines are daily jobs for a web developer, and all of them are in this unit's assignments.

## How your assignments are checked

Your program runs with Node against visible and hidden tests. Several questions check that you used a regular expression or a particular string method. When a step says "print only", output is compared exactly, so don't add labels or extra spaces.`,
  questions: [
    jq("Palindrome sentence", "Read a line of text and print whether it is a palindrome when you ignore capital letters, spaces and punctuation (keep only letters and digits).", ["Input: one line of text", "Output: Palindrome or Not a palindrome"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const clean = input.toLowerCase().replace(/[^a-z0-9]/g, "");
const reversed = [...clean].reverse().join("");
console.log(clean === reversed ? "Palindrome" : "Not a palindrome");
`, [["Madam", "Palindrome", ["not"]], ["A man, a plan, a canal: Panama", "Palindrome", ["not"]]], [["hello", "Not a palindrome"], ["Was it a car or a cat I saw?", "Palindrome", ["not"]], ["12321x", "Not a palindrome"]], { rules: [usesRegex] }),

    jq("Count vowels and consonants", "Read a line and count its vowels and consonants (letters only, ignoring case) using regular expressions with match.", ["Input: one line of text", "Output line 1: Vowels: <count>", "Output line 2: Consonants: <count>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const vowels = (input.match(/[aeiou]/gi) ?? []).length;
const consonants = (input.match(/[b-df-hj-np-tv-z]/gi) ?? []).length;
console.log(\`Vowels: \${vowels}\`);
console.log(\`Consonants: \${consonants}\`);
`, [["Hello World", "Vowels: 3 Consonants: 7"], ["JavaScript 2026!", "Vowels: 3 Consonants: 7"]], [["rhythm", "Vowels: 0 Consonants: 6"], ["AEIOU aeiou", "Vowels: 10 Consonants: 0"], ["123 !?", "Vowels: 0 Consonants: 0"]], { rules: [{ match: String.raw`\.match\s*\(\s*/`, message: "Counts with match and a regex" }] }),

    jq("Title case", "Read a line and print it in title case: the first letter of every word capital, the rest small. Collapse extra spaces between words into one.", ["Input: one line of words", "Output: only the title-cased line"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const title = input
  .split(/\s+/)
  .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
  .join(" ");
console.log(title);
`, [["hello world", "Hello World"], ["jAVAsCRIPT   is FUN", "Javascript Is Fun"]], [["inveon", "Inveon"], ["a b  c", "A B C"]], { match: "exact", rules: [{ match: String.raw`toUpperCase\s*\(`, message: "Uses toUpperCase" }] }),

    jq("Most frequent character", "Read a line and print the letter that appears most often (ignore case, spaces and anything that isn't a letter a to z) and its count. If there is a tie, print the letter that comes first in the alphabet.", ["Input: one line of text with at least one letter", "Output: only <letter> <count>, like l 3"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const counts = new Map();
for (const ch of input.toLowerCase().replace(/[^a-z]/g, "")) {
  counts.set(ch, (counts.get(ch) ?? 0) + 1);
}
const [letter, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
console.log(\`\${letter} \${count}\`);
`, [["Hello World", "l 3"], ["banana", "a 3"]], [["abcabc", "a 2"], ["Zzz Top!", "z 3"], ["Q", "q 1"]], { level: "intermediate", match: "exact" }),

    jq("Validate email addresses", "Each input line is an email address. Print Valid or Invalid for each, using one regular expression: some characters without spaces or @, then @, then a domain without spaces or @, then a dot and at least 2 letters at the end.", ["Input: one email per line", "Output: Valid or Invalid for each line"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
for (const line of input.split("\n")) {
  console.log(emailPattern.test(line.trim()) ? "Valid" : "Invalid");
}
`, [["asha@example.com\nravi.example.com", "Valid\nInvalid"]], [["a@b.co\nx@y\nme@@mail.com\nname.surname@company.co.in", "Valid\nInvalid\nInvalid\nValid"], ["user name@mail.com\nhi@site.c", "Invalid\nInvalid"]], { match: "exact", rules: [{ match: String.raw`\.test\s*\(`, message: "Validates with regex.test" }, { match: String.raw`/\^.*\$/`, message: "Anchors the pattern with ^ and $" }] }),

    jq("Sum the numbers in a sentence", "Read a line of text and find every whole number in it (a minus sign directly before digits makes it negative). Print how many numbers there are and their sum.", ["Input: one line of text", "Output line 1: Count: <n>", "Output line 2: Sum: <sum>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const numbers = (input.match(/-?\d+/g) ?? []).map(Number);
console.log(\`Count: \${numbers.length}\`);
console.log(\`Sum: \${numbers.reduce((s, n) => s + n, 0)}\`);
`, [["I bought 3 pens for 45 rupees and 2 books", "Count: 3 Sum: 50"], ["Temperature went from -5 to 12", "Count: 2 Sum: 7"]], [["no numbers here", "Count: 0 Sum: 0"], ["007 agents and 1000 cats", "Count: 2 Sum: 1007"]], { level: "intermediate", rules: [{ match: String.raw`\\d`, message: "Finds numbers with \\d in a regex" }] }),

    jq("Indian mobile numbers", "Check each line: a valid Indian mobile number is 10 digits starting with 6, 7, 8 or 9, optionally with +91 or 0 in front and optionally one space after +91. Print the number in the form +91 XXXXXXXXXX if valid, or Invalid.", ["Input: one number per line", "Output: +91 followed by a space and the 10 digits, or Invalid"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const mobile = /^(?:\+91 ?|0)?(?<number>[6-9]\d{9})$/;
for (const line of input.split("\n")) {
  const m = line.trim().match(mobile);
  console.log(m ? \`+91 \${m.groups.number}\` : "Invalid");
}
`, [["9876543210\n+91 9123456789\n12345", "+91 9876543210\n+91 9123456789\nInvalid"]], [["08888888888\n5876543210\n+919000000000", "+91 8888888888\nInvalid\n+91 9000000000"], ["98765432101\n+91  9876543210", "Invalid\nInvalid"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`\[6-9\]`, message: "Checks the first digit with [6-9]" }] }),

    jq("URL slug from a title", "Turn a blog title into a URL slug: lower case, every run of characters that are not letters or digits becomes a single hyphen, and no hyphen at the start or end.", ["Input: one line (a title)", "Output: only the slug, like learn-node-js-in-30-days"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const slug = input
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
console.log(slug);
`, [["Learn Node.js in 30 Days!", "learn-node-js-in-30-days"], ["  Hello,   World  ", "hello-world"]], [["C++ & Java: A Guide", "c-java-a-guide"], ["2026", "2026"], ["--Top 10 Tips--", "top-10-tips"]], { match: "exact", rules: [{ match: String.raw`\.replace\s*\(\s*/`, message: "Uses replace with a regex" }] }),

    jq("Mask a card number", "Read a card number that may contain spaces or dashes. Remove them, then replace every digit except the last four with *, using a single replace with a lookahead, and print the result in groups of 4 separated by spaces.", ["Input: a card number of 12 to 19 digits, possibly with spaces or dashes", "Output: only the masked number in groups of 4, like **** **** **** 1234"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const digits = input.replace(/[\s-]/g, "");
const masked = digits.replace(/\d(?=\d{4})/g, "*");
console.log(masked.match(/.{1,4}/g).join(" "));
`, [["4111 1111 1111 1234", "**** **** **** 1234"], ["5500-0000-0000-0004", "**** **** **** 0004"]], [["123456789012", "**** **** 9012"], ["4000123412341234567", "**** **** **** ***4 567"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`\(\?=`, message: "Uses a lookahead (?=...)" }] }),

    jq("Summarise a log file", "Each input line is a log entry like 2026-01-15 10:32:07 ERROR Disk full. Use a regex with named groups (date, time, level, message) and matchAll or match to read each line. Skip lines that don't match. Print how many entries there are of each level (in alphabetical order of level), then the message of the last ERROR entry.", ["Input: log lines", "Output: lines like ERROR 2, then Last error: <message> (or Last error: none)", "Levels are upper-case words (INFO, WARN, ERROR ...)"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const pattern = /^(?<date>\d{4}-\d{2}-\d{2}) (?<time>\d{2}:\d{2}:\d{2}) (?<level>[A-Z]+) (?<message>.+)$/gm;
const counts = {};
let lastError = "none";
for (const m of input.matchAll(pattern)) {
  const { level, message } = m.groups;
  counts[level] = (counts[level] ?? 0) + 1;
  if (level === "ERROR") lastError = message;
}
for (const level of Object.keys(counts).sort()) console.log(\`\${level} \${counts[level]}\`);
console.log(\`Last error: \${lastError}\`);
`, [["2026-01-15 10:32:07 ERROR Disk full\n2026-01-15 10:33:00 INFO Retrying\n2026-01-15 10:35:12 ERROR Backup failed", "ERROR 2\nINFO 1\nLast error: Backup failed"]], [["2026-02-01 09:00:00 INFO Started\ngarbage line\n2026-02-01 09:00:05 WARN Slow response", "INFO 1\nWARN 1\nLast error: none"], ["2026-03-03 23:59:59 ERROR Out of memory", "ERROR 1\nLast error: Out of memory"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`\(\?<\w+>`, message: "Uses named groups (?<name>...)" }] }),
  ],
  quiz: [
    { q: "let s = \"hi\"; s.toUpperCase(); What is s now?", options: ["\"HI\"", "\"hi\"", "undefined", "An error"], answer: 1, why: "Strings are immutable; toUpperCase returns a new string that was thrown away." },
    { q: "What does \"report.pdf\".slice(-3) return?", options: ["\"rep\"", "\"pdf\"", "\".pdf\"", "\"\""], answer: 1, why: "A negative start counts from the end of the string." },
    { q: "What does \"a-b-c\".replace(\"-\", \"+\") return?", options: ["\"a+b+c\"", "\"a+b-c\"", "\"a-b+c\"", "\"abc\""], answer: 1, why: "replace with a string replaces only the first match; use replaceAll or a /g regex for all." },
    { q: "Which regex matches exactly six digits and nothing else?", options: ["/\\d{6}/", "/^\\d{6}$/", "/[0-6]/", "/\\d+6/"], answer: 1, why: "Without ^ and $ the pattern may match six digits inside a longer string." },
    { q: "What does \"a1b22c333\".match(/\\d+/g) return?", options: ["[\"1\", \"22\", \"333\"]", "[\"1\", \"2\", \"2\", \"3\", \"3\", \"3\"]", "\"122333\"", "[1, 22, 333]"], answer: 0, why: "\\d+ matches runs of digits; with g, match returns every match as strings." },
    { q: "What does \"abc\".match(/\\d/g) return?", options: ["[]", "null", "undefined", "\"\""], answer: 1, why: "match returns null when nothing matches, so write (s.match(re) ?? []) before using length." },
    { q: "Which flag makes a regex ignore capital letters?", options: ["g", "m", "i", "u"], answer: 2, why: "i is case-insensitive; g finds all matches, m makes ^ and $ work per line, u enables Unicode mode." },
    { q: "What is \"Zebra\" < \"apple\"?", options: ["true", "false", "NaN", "It throws"], answer: 0, why: "Strings compare by character code, and capital letters have smaller codes than small ones; use localeCompare for natural order." },
    { q: "What does this print?\n\nconst re = /a/g;\nconsole.log(re.test(\"a\"), re.test(\"a\"));", options: ["true true", "true false", "false true", "false false"], answer: 1, why: "A global regex keeps lastIndex; after the first match it starts searching after position 1 and fails, then resets." },
    { q: "What does \"4111222233334444\".replace(/\\d(?=\\d{4})/g, \"*\") return?", options: ["\"************4444\"", "\"4111************\"", "\"****\"", "\"****222233334444\""], answer: 0, why: "Each digit that still has four digits after it is replaced, so only the last four stay." },
  ],
};
