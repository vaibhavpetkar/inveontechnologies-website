import type { PracticeUnit } from "../../types.js";
import { jq, js } from "./shared.js";

const usesLoop = { match: String.raw`\b(for|while)\s*\(`, message: "Uses a loop (for or while)" };

export const control: PracticeUnit = {
  key: "control",
  title: "Conditions and loops",
  summary: "if / else, the ternary operator, switch, for, while, do...while, for...of, break and continue",
  reading: js`## Making decisions with if

\`\`\`javascript
const marks = 72;
if (marks >= 75) {
  console.log("Distinction");
} else if (marks >= 40) {
  console.log("Pass");
} else {
  console.log("Fail");
}
\`\`\`

Conditions are checked from the top, and only the first true branch runs, so put the strictest test first. The condition doesn't have to be a boolean: JavaScript uses truthiness, so if (name) is false for an empty string.

Always write braces, even for one line. A missing brace is how the famous "second line always runs" bug happens.

## The ternary operator

For a choice between two values, the conditional operator is shorter:

\`\`\`javascript
const label = age >= 18 ? "adult" : "minor";
\`\`\`

Use it for values, not for running statements, and don't nest more than one level; an if/else is easier to read.

## switch

switch compares one value against many cases using ===.

\`\`\`javascript
switch (day) {
  case 6:
  case 7:
    console.log("Weekend");
    break;
  default:
    console.log("Weekday");
}
\`\`\`

Forgetting break makes execution "fall through" into the next case. Grouping cases like 6 and 7 above is the one place falling through is useful. Because switch uses ===, the string "6" will not match case 6: convert input with Number first.

## Loops

- for (let i = 1; i <= n; i++) { ... } when you know how many times to repeat.
- while (condition) { ... } when you repeat until something changes, like reading digits of a number.
- do { ... } while (condition); runs the body at least once.
- for (const item of list) { ... } goes through the values of an array or the characters of a string.
- for (const key in object) { ... } goes through the keys of an object. Don't use for...in on arrays; it gives string indexes and can include extra properties.

\`\`\`javascript
let n = 1234;
let sum = 0;
while (n > 0) {
  sum += n % 10;          // last digit
  n = Math.floor(n / 10); // drop the last digit
}
console.log(sum); // 10
\`\`\`

Note Math.floor: in JavaScript 1234 / 10 is 123.4, not 123 as in C or Java.

## break and continue

- break leaves the loop at once. Useful when you have found what you were searching for.
- continue skips to the next round of the loop.

A prime check is the classic use of break: test divisors from 2 up to the square root of n, and stop at the first one that divides n.

## Building patterns

String.prototype.repeat makes pattern programs short: "*".repeat(3) is "***". For a row with spaces in front, join two repeats: " ".repeat(n - i) + "*".repeat(2 * i - 1).

## Block scope

let and const declared inside { } only exist inside those braces. A loop counter declared with let in a for header is a fresh variable in each round, which matters later when you create functions inside loops.

## Common mistakes

- Using = instead of === in a condition: if (x = 5) assigns 5 and is always true.
- Off-by-one errors: i < n runs n times starting from 0; i <= n runs n + 1 times.
- Infinite loops: forgetting to change the loop variable in a while loop.
- Comparing input strings with numbers: "10" > "9" is false, because strings compare letter by letter. Convert first.

## How your assignments are checked

Your program runs with Node against the examples and hidden tests. Some questions also check that you used the construct being practised (a switch, a loop). For yes/no style answers, print only the words asked for, because the checker makes sure the wrong answer's words (like "not") are absent. Pattern questions compare the output exactly, including leading spaces.`,
  questions: [
    jq("Even or odd", "Read a whole number and print whether it is even or odd.", ["Input: one integer (can be negative)", "Output: Even or Odd"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const n = Number(input);
console.log(n % 2 === 0 ? "Even" : "Odd");
`, [["4", "Even"], ["7", "Odd"]], [["0", "Even"], ["-3", "Odd"], ["-10", "Even"]]),

    jq("Grade from marks", "Read marks out of 100 and print the grade: 90 and above A, 75 to 89 B, 60 to 74 C, 40 to 59 D, below 40 F. Print Invalid marks for anything outside 0 to 100.", ["Input: one integer", "Output: Grade: <letter> or Invalid marks"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const marks = Number(input);
if (marks < 0 || marks > 100) {
  console.log("Invalid marks");
} else if (marks >= 90) {
  console.log("Grade: A");
} else if (marks >= 75) {
  console.log("Grade: B");
} else if (marks >= 60) {
  console.log("Grade: C");
} else if (marks >= 40) {
  console.log("Grade: D");
} else {
  console.log("Grade: F");
}
`, [["95", "Grade: A"], ["62", "Grade: C"]], [["75", "Grade: B"], ["39", "Grade: F"], ["40", "Grade: D"], ["101", "Invalid marks"]]),

    jq("Day name with switch", "Read a day number from 1 to 7 and print the day's name (1 is Monday). Use a switch. Print Invalid day for any other number.", ["Input: one integer", "Output: the day name, or Invalid day"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const day = Number(input);
let name;
switch (day) {
  case 1: name = "Monday"; break;
  case 2: name = "Tuesday"; break;
  case 3: name = "Wednesday"; break;
  case 4: name = "Thursday"; break;
  case 5: name = "Friday"; break;
  case 6: name = "Saturday"; break;
  case 7: name = "Sunday"; break;
  default: name = "Invalid day";
}
console.log(name);
`, [["1", "Monday"], ["6", "Saturday"]], [["7", "Sunday"], ["0", "Invalid day"], ["3", "Wednesday"]], { rules: [{ match: String.raw`\bswitch\s*\(`, message: "Uses a switch statement" }, { match: String.raw`\bbreak\b`, message: "Ends each case with break" }] }),

    jq("Leap year", "Read a year and print whether it is a leap year. A year is a leap year if it is divisible by 4 but not by 100, or divisible by 400.", ["Input: a year", "Output: Leap year or Not a leap year"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const year = Number(input);
const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
console.log(leap ? "Leap year" : "Not a leap year");
`, [["2024", "Leap year", ["not"]], ["1900", "Not a leap year"]], [["2000", "Leap year", ["not"]], ["2023", "Not a leap year"], ["2100", "Not a leap year"]]),

    jq("Multiplication table", "Read a number n and print its multiplication table from 1 to 10 using a for loop.", ["Input: one integer n", "Output: 10 lines like 7 x 3 = 21"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const n = Number(input);
for (let i = 1; i <= 10; i++) {
  console.log(\`\${n} x \${i} = \${n * i}\`);
}
`, [["7", "7 x 1 = 7\n7 x 2 = 14\n7 x 3 = 21\n7 x 4 = 28\n7 x 5 = 35\n7 x 6 = 42\n7 x 7 = 49\n7 x 8 = 56\n7 x 9 = 63\n7 x 10 = 70"]], [["1", "1 x 1 = 1 1 x 2 = 2 1 x 3 = 3 1 x 4 = 4 1 x 5 = 5 1 x 6 = 6 1 x 7 = 7 1 x 8 = 8 1 x 9 = 9 1 x 10 = 10"], ["-2", "-2 x 1 = -2 -2 x 2 = -4 -2 x 3 = -6 -2 x 4 = -8 -2 x 5 = -10 -2 x 6 = -12 -2 x 7 = -14 -2 x 8 = -16 -2 x 9 = -18 -2 x 10 = -20"]], { rules: [usesLoop] }),

    jq("Sum and count of digits", "Read a non-negative whole number and print how many digits it has and the sum of its digits. Work with the number (% and Math.floor in a while loop), not with the string.", ["Input: one non-negative integer", "Output line 1: Digits: <count>", "Output line 2: Sum: <sum>", "0 has 1 digit"], js`const input = require("fs").readFileSync(0, "utf8").trim();
let n = Number(input);
let count = 0;
let sum = 0;
do {
  sum += n % 10;
  n = Math.floor(n / 10);
  count++;
} while (n > 0);
console.log(\`Digits: \${count}\`);
console.log(\`Sum: \${sum}\`);
`, [["1234", "Digits: 4 Sum: 10"], ["905", "Digits: 3 Sum: 14"]], [["0", "Digits: 1 Sum: 0"], ["99999", "Digits: 5 Sum: 45"], ["1000000", "Digits: 7 Sum: 1"]], { level: "intermediate", rules: [{ match: String.raw`\bwhile\s*\(`, message: "Uses a while (or do...while) loop" }, { match: String.raw`%\s*10`, message: "Takes the last digit with % 10" }] }),

    jq("FizzBuzz", "Read n and print the numbers from 1 to n, one per line, but print Fizz for multiples of 3, Buzz for multiples of 5 and FizzBuzz for multiples of both.", ["Input: one integer n (1 or more)", "Output: exactly n lines, nothing else"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const n = Number(input);
for (let i = 1; i <= n; i++) {
  if (i % 15 === 0) console.log("FizzBuzz");
  else if (i % 3 === 0) console.log("Fizz");
  else if (i % 5 === 0) console.log("Buzz");
  else console.log(i);
}
`, [["5", "1\n2\nFizz\n4\nBuzz"]], [["15", "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz"], ["1", "1"]], { match: "exact", rules: [usesLoop] }),

    jq("Prime check", "Read a whole number and print whether it is prime. Test divisors from 2 while i * i <= n and stop with break at the first divisor.", ["Input: one integer", "Output: Prime or Not prime (0, 1 and negative numbers are not prime)"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const n = Number(input);
let prime = n >= 2;
for (let i = 2; i * i <= n; i++) {
  if (n % i === 0) {
    prime = false;
    break;
  }
}
console.log(prime ? "Prime" : "Not prime");
`, [["7", "Prime", ["not"]], ["12", "Not prime"]], [["2", "Prime", ["not"]], ["1", "Not prime"], ["97", "Prime", ["not"]], ["961", "Not prime"]], { level: "intermediate", rules: [usesLoop, { match: String.raw`\bbreak\b`, message: "Stops early with break" }] }),

    jq("Star pyramid", "Read n and print a centred pyramid of stars with n rows. Row i has 2i - 1 stars and n - i spaces in front.", ["Input: one integer n (1 to 20)", "Output: only the pyramid, no spaces after the stars", "Tip: \" \".repeat(k) makes k spaces"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const n = Number(input);
for (let i = 1; i <= n; i++) {
  console.log(" ".repeat(n - i) + "*".repeat(2 * i - 1));
}
`, [["3", "  *\n ***\n*****"]], [["1", "*"], ["5", "    *\n   ***\n  *****\n *******\n*********"]], { level: "intermediate", match: "exact", rules: [usesLoop] }),

    jq("Number guessing referee", "The first line is the secret number; the next line has the player's guesses. Go through the guesses in order and print Too low or Too high for each wrong guess. When a guess is right, print Correct in <k> tries and stop checking. If no guess is right, print Out of guesses at the end.", ["Input line 1: the secret number", "Input line 2: guesses separated by spaces", "Output: one line per guess checked, then Out of guesses if needed", "Use break once the guess is correct"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [first, second = ""] = input.split("\n");
const secret = Number(first);
const guesses = second.trim().split(/\s+/).map(Number);
let found = false;
for (const [i, guess] of guesses.entries()) {
  if (guess === secret) {
    console.log(\`Correct in \${i + 1} tries\`);
    found = true;
    break;
  }
  console.log(guess < secret ? "Too low" : "Too high");
}
if (!found) console.log("Out of guesses");
`, [["42\n50 25 42 10", "Too high\nToo low\nCorrect in 3 tries"], ["7\n1 2 3", "Too low\nToo low\nToo low\nOut of guesses"]], [["5\n5", "Correct in 1 tries"], ["100\n200 150 99 100 100", "Too high\nToo high\nToo low\nCorrect in 4 tries"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`\bbreak\b`, message: "Stops with break when the guess is correct" }] }),
  ],
  quiz: [
    { q: "What does switch use to compare the value with each case?", options: ["==", "===", "Object.is only for numbers", "A regular expression"], answer: 1, why: "switch uses strict equality, so the string \"1\" never matches case 1." },
    { q: "Which loop always runs its body at least once?", options: ["for", "while", "do...while", "for...of"], answer: 2, why: "do...while checks the condition after the body." },
    { q: "Which loop gives you the values of an array directly?", options: ["for...in", "for...of", "for...each", "while...in"], answer: 1, why: "for...of iterates values; for...in iterates keys (as strings)." },
    { q: "What does continue do inside a loop?", options: ["Exits the loop", "Skips the rest of this round and starts the next one", "Restarts the loop from the first round", "Pauses the program"], answer: 1, why: "continue jumps to the next iteration; break exits the loop." },
    { q: "How many times does for (let i = 0; i <= 5; i++) run?", options: ["5", "6", "4", "Forever"], answer: 1, why: "i takes the values 0, 1, 2, 3, 4 and 5: six rounds." },
    { q: "What is \"10\" > \"9\"?", options: ["true", "false", "NaN", "An error"], answer: 1, why: "Two strings compare character by character, and \"1\" comes before \"9\"." },
    { q: "What is 1234 / 10 in JavaScript?", options: ["123", "123.4", "124", "123.0"], answer: 1, why: "There is no integer division; use Math.floor or Math.trunc to drop the decimals." },
    { q: "What does this print?\n\nconst x = 2;\nswitch (x) {\n  case 1: console.log(\"one\");\n  case 2: console.log(\"two\");\n  case 3: console.log(\"three\");\n}", options: ["two", "two three", "one two three", "Nothing"], answer: 1, why: "Without break, execution falls through from case 2 into case 3." },
    { q: "What does this print?\n\nlet i = 0;\nfor (; i < 3; i++) {}\nconsole.log(i);", options: ["2", "3", "undefined", "ReferenceError"], answer: 1, why: "The loop stops when i < 3 is false, which is when i has reached 3; i was declared outside so it is still visible." },
    { q: "What does this print?\n\nlet out = \"\";\nfor (const k in [\"a\", \"b\"]) out += typeof k;\nconsole.log(out);", options: ["stringstring", "numbernumber", "objectobject", "stringnumber"], answer: 0, why: "for...in gives property keys, and array indexes are keys of type string (\"0\", \"1\")." },
  ],
};
