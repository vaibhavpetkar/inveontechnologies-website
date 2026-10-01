import type { PracticeUnit } from "../../types.js";
import { jq, js } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "Basics: variables, types and operators",
  summary: "let and const, the primitive types, reading input in Node, arithmetic, comparison and logical operators",
  reading: js`## Where JavaScript runs

JavaScript started as the language of web pages, and it still is: every browser runs it. With Node.js the same language runs on servers and on your laptop from the terminal. In this course your programs run with Node 22, so you can practise the language itself without a browser. Save a file as main.js and run it with node main.js.

\`\`\`javascript
console.log("Hello, Inveon!");
console.log("2 + 3 =", 2 + 3);
\`\`\`

console.log prints its arguments separated by spaces and ends the line.

## let and const

- const creates a binding that can't be reassigned. Use it by default: const rate = 18;
- let creates a binding you will change later, like a counter: let total = 0;
- var is the old way. It ignores block scope and is hoisted, which causes confusing bugs. Don't use it in new code.

const does not freeze a value. const marks = [80, 90]; marks.push(70); is allowed, because the array is changed, not the binding. marks = []; is an error.

## The types

JavaScript has seven primitive types and objects:

- number: one type for whole numbers and decimals (64-bit floating point). 7 / 2 is 3.5, not 3.
- bigint: whole numbers of any size, written with n: 2n ** 64n.
- string: text in "double", 'single' or \`back\` quotes.
- boolean: true or false.
- undefined: a variable that has no value yet.
- null: "no value", set on purpose.
- symbol: unique keys, rarely needed at first.
- object: everything else, including arrays and functions.

typeof tells you the type as a string: typeof 42 is "number", typeof "hi" is "string". Two surprises to remember: typeof null is "object" (an old bug kept for compatibility) and typeof [] is "object" too; use Array.isArray to test for arrays.

## Template literals

Back-quoted strings can hold expressions and span lines:

\`\`\`javascript
const name = "Asha";
const marks = 91;
console.log(\`\${name} scored \${marks} marks\`);
\`\`\`

## Reading input in Node

The assignments give your program input on stdin. Read all of it at once, then split it:

\`\`\`javascript
const input = require("fs").readFileSync(0, "utf8").trim();
const [a, b] = input.split(/\s+/).map(Number);
console.log(a + b);
\`\`\`

- readFileSync(0, "utf8") reads file descriptor 0, which is stdin.
- split(/\s+/) splits on any spaces or new lines.
- map(Number) turns every piece into a number. Without it, "4" + "5" is "45": + joins strings.

For line-based input, use input.split("\n").

## Operators

- Arithmetic: + - * / % and ** (power). % keeps the sign of the left side: -7 % 2 is -1.
- Math.floor, Math.ceil, Math.round and Math.trunc turn decimals into whole numbers. Math.trunc(-3.5) is -3, Math.floor(-3.5) is -4.
- Comparison: use === and !==. == converts types first, so "5" == 5 and 0 == "" are both true, which hides bugs.
- Logical: && (and), || (or), ! (not). || returns the first truthy value, so name || "Guest" gives a default. ?? only falls back on null or undefined, so count ?? 10 keeps a real 0.

The falsy values are false, 0, -0, 0n, "", null, undefined and NaN. Everything else, including "0" and [], is truthy.

## Numbers need care

Decimals are stored in binary, so 0.1 + 0.2 is 0.30000000000000004. Round only when you print: (0.1 + 0.2).toFixed(2) gives the string "0.30". Number("abc") is NaN (not a number), and NaN === NaN is false, so test with Number.isNaN(x).

## Common mistakes

- Forgetting map(Number), so + joins text instead of adding.
- Using == and being surprised by type conversion.
- Comparing with NaN using ===.
- Declaring everything with var or not declaring at all (that creates a global by accident, and is an error in strict mode).

## How your assignments are checked

Upload one .js file per question. It runs with Node 22 against visible examples and hidden tests; you may print labels like "Sum:" because the checker looks for the numbers and words of the answer in order. When a step says "print only", the output must match exactly. The reviewer also reads your code and gives tips, for example to use === instead of == and let or const instead of var.`,
  questions: [
    jq("Sum and product", "Read two numbers and print their sum and their product.", ["Input: two numbers a and b on one line", "Output line 1: the sum", "Output line 2: the product"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [a, b] = input.split(/\s+/).map(Number);
console.log(\`Sum: \${a + b}\`);
console.log(\`Product: \${a * b}\`);
`, [["4 5", "9 20"], ["-3 7", "4 -21"]], [["0 99", "99 0"], ["2.5 4", "6.5 10"]]),

    jq("Rectangle area and perimeter", "Read the length and width of a rectangle (decimals allowed) and print its area and perimeter with 2 decimals.", ["Input: length and width on one line", "Output line 1: the area with 2 decimals", "Output line 2: the perimeter with 2 decimals (toFixed(2))"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [length, width] = input.split(/\s+/).map(Number);
console.log(\`Area: \${(length * width).toFixed(2)}\`);
console.log(\`Perimeter: \${(2 * (length + width)).toFixed(2)}\`);
`, [["4 5", "20.00 18.00"], ["2.5 3", "7.50 11.00"]], [["1 1", "1.00 4.00"], ["10.2 0.5", "5.10 21.40"]]),

    jq("Celsius to Fahrenheit", "Read a temperature in Celsius and print it in Fahrenheit (f = c * 9 / 5 + 32) with 1 decimal.", ["Input: a temperature in Celsius", "Output: the Fahrenheit value with 1 decimal"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const celsius = Number(input);
const fahrenheit = celsius * 9 / 5 + 32;
console.log(\`Fahrenheit: \${fahrenheit.toFixed(1)}\`);
`, [["100", "212.0"], ["37", "98.6"]], [["-40", "-40.0"], ["0", "32.0"], ["36.6", "97.9"]]),

    jq("Quotient and remainder", "Read two whole numbers a and b and print the whole-number quotient (the decimals cut off towards zero, like in C) and the remainder of a / b.", ["Input: two integers a and b (b is not 0)", "Output line 1: the quotient, using Math.trunc", "Output line 2: the remainder, using %", "Note: -7 / 2 gives quotient -3 and remainder -1"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [a, b] = input.split(/\s+/).map(Number);
console.log(\`Quotient: \${Math.trunc(a / b)}\`);
console.log(\`Remainder: \${a % b}\`);
`, [["17 5", "3 2"], ["-7 2", "-3 -1"]], [["20 4", "5 0"], ["3 10", "0 3"], ["100 -7", "-14 2"]], { rules: [{ match: String.raw`Math\.trunc\s*\(`, message: "Uses Math.trunc for the quotient" }, { match: "%", message: "Uses % for the remainder" }] }),

    jq("Seconds to hh:mm:ss", "Read a number of seconds and print it as hours, minutes and seconds in the form hh:mm:ss, each part with two digits.", ["Input: a whole number of seconds (0 to 359999)", "Output: only the time, like 01:02:05", "Use padStart(2, \"0\") to add leading zeros"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const total = Number(input);
const hours = Math.floor(total / 3600);
const minutes = Math.floor((total % 3600) / 60);
const seconds = total % 60;
const two = (n) => String(n).padStart(2, "0");
console.log(\`\${two(hours)}:\${two(minutes)}:\${two(seconds)}\`);
`, [["3725", "01:02:05"], ["59", "00:00:59"]], [["0", "00:00:00"], ["86399", "23:59:59"], ["360000", "100:00:00"]], { level: "intermediate", match: "exact" }),

    jq("Swap with destructuring", "Read two values a and b and swap them with array destructuring ([a, b] = [b, a]), without a third variable. Print them after the swap.", ["Input: two words or numbers on one line", "Output: the values after the swap, on one line, separated by a space"], js`const input = require("fs").readFileSync(0, "utf8").trim();
let [a, b] = input.split(/\s+/);
[a, b] = [b, a];
console.log(a, b);
`, [["5 9", "9 5"], ["hello world", "world hello"]], [["0 -1", "-1 0"], ["x y", "y x"]], { rules: [{ match: String.raw`\[\s*\w+\s*,\s*\w+\s*\]\s*=\s*\[\s*\w+\s*,\s*\w+\s*\]`, message: "Swaps with [a, b] = [b, a]" }] }),

    jq("Detect the type of each value", "Read several values separated by spaces. For each one print what it holds: number (Number() gives a real number), boolean (the text true or false) or string (anything else).", ["Input: values separated by spaces", "Output: one line per value, like 42 is a number", "Careful: Number(\"abc\") is NaN; test with Number.isNaN"], js`const input = require("fs").readFileSync(0, "utf8").trim();
for (const value of input.split(/\s+/)) {
  let kind = "string";
  if (value === "true" || value === "false") kind = "boolean";
  else if (!Number.isNaN(Number(value))) kind = "number";
  console.log(\`\${value} is a \${kind}\`);
}
`, [["42 hello true", "42 is a number\nhello is a string\ntrue is a boolean"]], [["3.14 false abc -7", "3.14 number false boolean abc string -7 number"], ["NaN yes 0", "NaN string yes string 0 number"]], { level: "intermediate", rules: [{ match: String.raw`Number\.isNaN|isNaN`, message: "Tests for NaN with Number.isNaN" }] }),

    jq("Greeting with a default name", "Read a name. If the input is empty, greet a guest instead. Use || to give the default.", ["Input: a name, or an empty line", "Output: Hello, <name>! or Hello, Guest!"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const name = input || "Guest";
console.log(\`Hello, \${name}!\`);
`, [["Asha", "Hello, Asha!"], ["", "Hello, Guest!"]], [["Ravi Kumar", "Hello, Ravi Kumar!"], ["   ", "Hello, Guest!"]], { rules: [{ match: String.raw`\|\||\?\?`, message: "Gives the default with || (or ??)" }] }),

    jq("Adding decimals safely", "Read two decimal numbers and print their sum rounded to 2 decimals. 0.1 + 0.2 must print 0.30, not 0.30000000000000004.", ["Input: two decimal numbers", "Output: only the sum with exactly 2 decimals"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [a, b] = input.split(/\s+/).map(Number);
console.log((a + b).toFixed(2));
`, [["0.1 0.2", "0.30"], ["1.005 2", "3.00"]], [["10 5.5", "15.50"], ["-1.25 1.25", "0.00"], ["99.999 0.001", "100.00"]], { match: "exact" }),

    jq("Split the bill", "Read the bill amount, the tip percentage and the number of friends. Print the tip, the total and each friend's share, all with 2 decimals.", ["Input: amount, tip percent and people on one line", "Output line 1: the tip", "Output line 2: the total (amount + tip)", "Output line 3: the share per person"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [amount, tipPercent, people] = input.split(/\s+/).map(Number);
const tip = amount * tipPercent / 100;
const total = amount + tip;
console.log(\`Tip: \${tip.toFixed(2)}\`);
console.log(\`Total: \${total.toFixed(2)}\`);
console.log(\`Each pays: \${(total / people).toFixed(2)}\`);
`, [["1000 10 4", "100.00 1100.00 275.00"], ["850 5 3", "42.50 892.50 297.50"]], [["1234 0 1", "0.00 1234.00 1234.00"], ["999 12.5 7", "124.88 1123.88 160.55"]], { level: "intermediate" }),
  ],
  quiz: [
    { q: "Which declaration should you use for a value that is never reassigned?", options: ["var", "let", "const", "static"], answer: 2, why: "const prevents reassignment and tells readers the binding won't change." },
    { q: "What is typeof null?", options: ["\"null\"", "\"undefined\"", "\"object\"", "\"number\""], answer: 2, why: "A historic bug kept for compatibility: typeof null is \"object\"." },
    { q: "What does \"4\" + 5 evaluate to?", options: ["9", "\"45\"", "NaN", "An error"], answer: 1, why: "If either side of + is a string, + joins strings, so the result is \"45\"." },
    { q: "What does \"10\" - 4 evaluate to?", options: ["\"104\"", "6", "NaN", "\"6\""], answer: 1, why: "- only works on numbers, so \"10\" is converted and the result is the number 6." },
    { q: "Which of these values is truthy?", options: ["0", "\"\"", "\"0\"", "null"], answer: 2, why: "Any non-empty string is truthy, including \"0\"." },
    { q: "What is 7 / 2 in JavaScript?", options: ["3", "3.5", "4", "3.0 as an integer"], answer: 1, why: "There is one number type, so / never drops decimals." },
    { q: "const marks = [1, 2]; marks.push(3); What happens?", options: ["TypeError: assignment to constant", "marks becomes [1, 2, 3]", "marks stays [1, 2]", "SyntaxError"], answer: 1, why: "const stops reassignment of the binding, not changes to the array it points to." },
    { q: "What does this print?\n\nconst count = 0;\nconsole.log(count || 10, count ?? 10);", options: ["10 10", "0 0", "10 0", "0 10"], answer: 2, why: "|| falls back on any falsy value (0), while ?? only falls back on null or undefined." },
    { q: "What does this print?\n\nconst x = Number(\"12px\");\nconsole.log(x === NaN, Number.isNaN(x));", options: ["true true", "false true", "true false", "false false"], answer: 1, why: "Number(\"12px\") is NaN, and NaN is never equal to anything, even itself; Number.isNaN is the right test." },
    { q: "What does this print?\n\nconsole.log([] == false, [] === false, !![]);", options: ["true false true", "false false false", "true false false", "false false true"], answer: 0, why: "== converts [] to \"\" and then 0, which equals false; === compares types (false); and [] is an object, so it is truthy." },
  ],
};
