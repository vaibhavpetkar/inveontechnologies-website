import type { PracticeUnit } from "../../types.js";
import { jq, js } from "./shared.js";

const method = (name: string) => ({ match: String.raw`\.${name}\s*\(`, message: `Uses ${name}()` });

export const arrays: PracticeUnit = {
  key: "arrays",
  title: "Arrays and array methods",
  summary: "creating and changing arrays, spread and destructuring, map, filter, reduce, find, some, every, sort and Set",
  reading: js`## Arrays

An array is an ordered list. It can grow and shrink, and it can hold any mix of values, though in practice you keep one kind per array.

\`\`\`javascript
const marks = [72, 85, 91];
marks.length;        // 3
marks[0];            // 72 (indexes start at 0)
marks.at(-1);        // 91 (the last item)
marks.push(64);      // add at the end
marks.pop();         // remove from the end
marks.unshift(50);   // add at the start
marks.shift();       // remove from the start
marks.includes(85);  // true
marks.indexOf(91);   // 2 (or -1 when missing)
\`\`\`

Reading past the end gives undefined, not an error, so check lengths when a bug looks mysterious.

## Copying, spreading and destructuring

Assigning an array doesn't copy it: const b = a; makes b another name for the same array. Copy with the spread operator: const b = [...a]; and join arrays with [...a, ...b].

Destructuring takes values out by position: const [first, second, ...rest] = list;

- slice(start, end) returns a copy of part of the array and leaves the original alone.
- splice(start, count) removes items from the original array (it mutates).
- concat, map, filter, slice and the newer toSorted and toReversed return new arrays; push, pop, splice, sort and reverse change the array in place.

## The big three: map, filter, reduce

\`\`\`javascript
const prices = [100, 250, 40];
const withGst = prices.map((p) => p * 1.18);        // same length, each item changed
const costly = prices.filter((p) => p > 50);         // only the items that pass
const total = prices.reduce((sum, p) => sum + p, 0); // one value from all items
\`\`\`

- map always returns an array of the same length. Use it when you transform every item.
- filter keeps the items for which the callback returns a truthy value.
- reduce carries an accumulator from item to item. Always give the starting value (the 0 above); without it, reduce on an empty array throws a TypeError.
- These methods chain: orders.filter(o => o.paid).map(o => o.amount).reduce((s, a) => s + a, 0).

Use forEach only for side effects like printing; it returns undefined, so you can't chain after it.

## Searching

- find(fn) returns the first matching item (or undefined); findIndex(fn) its index (or -1).
- some(fn) is true if at least one item matches; every(fn) is true if all match. every on an empty array is true.
- includes(value) checks for one value, and handles NaN correctly.

## Sorting correctly

sort() without arguments converts items to strings, so [10, 9, 1].sort() gives [1, 10, 9]. For numbers always pass a compare function:

\`\`\`javascript
nums.sort((a, b) => a - b);  // ascending
nums.sort((a, b) => b - a);  // descending
names.sort((a, b) => a.localeCompare(b));
\`\`\`

sort changes the original array. Use toSorted (Node 20+) or copy first ([...nums].sort(...)) if you need to keep it.

## Set and useful helpers

- new Set(array) keeps only unique values; [...new Set(array)] turns it back into an array with duplicates removed and the first-seen order kept.
- Array.from({ length: 5 }, (_, i) => i * i) builds [0, 1, 4, 9, 16].
- flat() flattens nested arrays one level; flatMap maps and flattens in one go.
- join(" ") turns an array into a string, which is how you print a list on one line.

## Two-dimensional arrays

An array of arrays is a grid: grid[row][col]. Build one with map so each row is a new array: Array.from({ length: 3 }, () => Array(3).fill(0)). Writing Array(3).fill([]) puts the same row object in every place, a classic bug.

## Common mistakes

- sort() on numbers without a compare function.
- Forgetting the initial value in reduce.
- Using map when you only want to loop (and ignoring the returned array).
- Changing an array while looping over it with for...of or forEach.
- Comparing arrays with ===: [1] === [1] is false, because they are two different objects.

## How your assignments are checked

Your program runs against visible and hidden tests with Node. Most questions also check that you used the method being practised (map, filter, reduce, sort with a compare function, Set), so solve them the modern way rather than only with index loops. Print lists with join(" ") unless the steps say otherwise.`,
  questions: [
    jq("Sum, maximum and minimum", "Read a list of numbers and print their sum (with reduce), the largest and the smallest (with Math.max and Math.min and the spread operator).", ["Input: numbers separated by spaces", "Output line 1: Sum: <value>", "Output line 2: Max: <value>", "Output line 3: Min: <value>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const nums = input.split(/\s+/).map(Number);
const sum = nums.reduce((total, n) => total + n, 0);
console.log(\`Sum: \${sum}\`);
console.log(\`Max: \${Math.max(...nums)}\`);
console.log(\`Min: \${Math.min(...nums)}\`);
`, [["4 9 2 7", "Sum: 22 Max: 9 Min: 2"], ["-5 -1 -9", "Sum: -15 Max: -1 Min: -9"]], [["42", "Sum: 42 Max: 42 Min: 42"], ["1.5 2.5 0", "Sum: 4 Max: 2.5 Min: 0"]], { rules: [method("reduce"), { match: String.raw`Math\.max\s*\(\s*\.\.\.`, message: "Uses Math.max(...nums)" }] }),

    jq("Squares of even numbers", "Read a list of whole numbers. Keep only the even ones with filter, square them with map and print them on one line. Print None if there are no even numbers.", ["Input: integers separated by spaces", "Output: only the squares separated by spaces, or None"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const squares = input
  .split(/\s+/)
  .map(Number)
  .filter((n) => n % 2 === 0)
  .map((n) => n * n);
console.log(squares.length ? squares.join(" ") : "None");
`, [["1 2 3 4", "4 16"], ["5 7 9", "None"]], [["0 -2 3", "0 4"], ["10 20 30", "100 400 900"]], { match: "exact", rules: [method("filter"), method("map")] }),

    jq("Remove duplicates", "Read a list of words and print them without duplicates, keeping the order in which they first appear. Use a Set.", ["Input: words separated by spaces", "Output: only the unique words separated by spaces"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const unique = [...new Set(input.split(/\s+/))];
console.log(unique.join(" "));
`, [["red green red blue green", "red green blue"], ["a a a", "a"]], [["one two three", "one two three"], ["Pune pune Pune Delhi", "Pune pune Delhi"]], { match: "exact", rules: [{ match: String.raw`new\s+Set\s*\(`, message: "Uses a Set" }] }),

    jq("Sort numbers correctly", "Read a list of numbers and print them sorted ascending on the first line and descending on the second. Remember: sort() without a compare function sorts as text, so 10 comes before 9.", ["Input: numbers separated by spaces", "Output line 1: ascending, separated by spaces", "Output line 2: descending, separated by spaces"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const nums = input.split(/\s+/).map(Number);
const ascending = [...nums].sort((a, b) => a - b);
const descending = [...nums].sort((a, b) => b - a);
console.log(ascending.join(" "));
console.log(descending.join(" "));
`, [["10 9 1 100", "1 9 10 100\n100 10 9 1"]], [["5", "5\n5"], ["-3 20 -30 2 2", "-30 -3 2 2 20\n20 2 2 -3 -30"]], { match: "exact", rules: [{ match: String.raw`sort\s*\(\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>`, message: "Passes a compare function to sort" }] }),

    jq("Second largest distinct value", "Read a list of numbers and print the second largest distinct value. If all values are the same, print None.", ["Input: numbers separated by spaces", "Output: the second largest value, or None", "Duplicates of the largest don't count: in 9 9 4 the answer is 4"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const distinct = [...new Set(input.split(/\s+/).map(Number))].sort((a, b) => b - a);
console.log(distinct.length > 1 ? distinct[1] : "None");
`, [["4 9 2 7", "7"], ["9 9 4", "4"]], [["5 5 5", "None"], ["-1 -2", "-2"], ["3", "None"]], { level: "intermediate" }),

    jq("Rotate an array", "Read a list and a number k. Rotate the list k places to the right (the last item moves to the front each time) using slice and spread. k can be larger than the length.", ["Input line 1: items separated by spaces", "Input line 2: k (0 or more)", "Output: only the rotated items separated by spaces"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [line, kText] = input.split("\n");
const items = line.trim().split(/\s+/);
const k = Number(kText) % items.length;
const rotated = [...items.slice(items.length - k), ...items.slice(0, items.length - k)];
console.log(rotated.join(" "));
`, [["1 2 3 4 5\n2", "4 5 1 2 3"], ["a b c\n0", "a b c"]], [["1 2 3\n3", "1 2 3"], ["1 2 3 4 5\n7", "4 5 1 2 3"], ["x y\n1", "y x"]], { level: "intermediate", match: "exact", rules: [method("slice")] }),

    jq("Word frequency", "Read a sentence and count how often each word appears (ignore capital letters). Print each word with its count, most frequent first; words with the same count in alphabetical order.", ["Input: one line of words separated by spaces", "Output: one line per word like the 3", "Print only these lines"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const counts = input
  .toLowerCase()
  .split(/\s+/)
  .reduce((acc, word) => {
    acc[word] = (acc[word] ?? 0) + 1;
    return acc;
  }, {});
const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
for (const [word, count] of rows) console.log(\`\${word} \${count}\`);
`, [["the cat and the dog and the bird", "the 3\nand 2\nbird 1\ncat 1\ndog 1"]], [["Hello hello HELLO", "hello 3"], ["b a c a b", "a 2\nb 2\nc 1"]], { level: "intermediate", match: "exact", rules: [method("sort")] }),

    jq("Split into chunks", "Read a list of items and a size k. Split the list into groups of k (the last group may be smaller) and print each group on its own line, items joined by commas.", ["Input line 1: items separated by spaces", "Input line 2: k (1 or more)", "Output: only the groups, one per line, like 1,2,3", "Array.from({ length: n }, fn) and slice help"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [line, kText] = input.split("\n");
const items = line.trim().split(/\s+/);
const k = Number(kText);
const chunks = Array.from({ length: Math.ceil(items.length / k) }, (_, i) => items.slice(i * k, i * k + k));
for (const chunk of chunks) console.log(chunk.join(","));
`, [["1 2 3 4 5 6 7\n3", "1,2,3\n4,5,6\n7"]], [["a b\n5", "a,b"], ["1 2 3 4\n2", "1,2\n3,4"], ["x y z\n1", "x\ny\nz"]], { level: "intermediate", match: "exact" }),

    jq("Class marks report", "Each line has a student's name and marks (out of 100). Print the topper (reduce), whether everyone passed (every, pass mark 40), whether anyone scored 90 or more (some) and the first student below 40 (find), or None.", ["Input: lines like Asha 78", "Output line 1: Topper: <name>", "Output line 2: All passed: yes or no", "Output line 3: Any distinction: yes or no", "Output line 4: First fail: <name> or None"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const students = input.split("\n").map((line) => {
  const [name, marks] = line.trim().split(/\s+/);
  return { name, marks: Number(marks) };
});
const topper = students.reduce((best, s) => (s.marks > best.marks ? s : best));
const allPassed = students.every((s) => s.marks >= 40);
const distinction = students.some((s) => s.marks >= 90);
const firstFail = students.find((s) => s.marks < 40);
console.log(\`Topper: \${topper.name}\`);
console.log(\`All passed: \${allPassed ? "yes" : "no"}\`);
console.log(\`Any distinction: \${distinction ? "yes" : "no"}\`);
console.log(\`First fail: \${firstFail ? firstFail.name : "None"}\`);
`, [["Asha 78\nRavi 35\nMeena 92\nOm 20", "Topper: Meena\nAll passed: no\nAny distinction: yes\nFirst fail: Ravi"]], [["Kiran 55\nZoya 60", "Topper: Zoya\nAll passed: yes\nAny distinction: no\nFirst fail: None"], ["Solo 95", "Topper: Solo\nAll passed: yes\nAny distinction: yes\nFirst fail: None"]], { level: "intermediate", match: "exact", rules: [method("every"), method("some"), method("find")] }),

    jq("Transpose a matrix", "Read a matrix (one row per line, numbers separated by spaces) and print its transpose: rows become columns. Use map on the first row's indexes.", ["Input: r lines of c numbers each", "Output: only c lines of r numbers separated by spaces"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const matrix = input.split("\n").map((row) => row.trim().split(/\s+/).map(Number));
const transposed = matrix[0].map((_, col) => matrix.map((row) => row[col]));
for (const row of transposed) console.log(row.join(" "));
`, [["1 2 3\n4 5 6", "1 4\n2 5\n3 6"]], [["7", "7"], ["1 2\n3 4\n5 6", "1 3 5\n2 4 6"], ["1 2 3 4", "1\n2\n3\n4"]], { level: "advanced", match: "exact", rules: [method("map")] }),
  ],
  quiz: [
    { q: "Which method returns a new array and leaves the original unchanged?", options: ["push", "splice", "slice", "sort"], answer: 2, why: "slice copies part of the array; push, splice and sort change the array in place." },
    { q: "What does [1, 2, 3].map((n) => n * 2) return?", options: ["[2, 4, 6]", "12", "undefined", "[1, 2, 3]"], answer: 0, why: "map returns a new array of the same length with each item transformed." },
    { q: "What does [5, 12, 8].find((n) => n > 6) return?", options: ["[12, 8]", "12", "1", "true"], answer: 1, why: "find returns the first matching item itself, not an array." },
    { q: "What is [].every((n) => n > 0)?", options: ["false", "true", "undefined", "TypeError"], answer: 1, why: "every on an empty array is true (there is no item that fails)." },
    { q: "How do you remove duplicates from arr while keeping first-seen order?", options: ["arr.unique()", "[...new Set(arr)]", "arr.filter(Set)", "Object.keys(arr)"], answer: 1, why: "A Set keeps unique values in insertion order; spreading it gives an array back." },
    { q: "const a = [1, 2]; const b = a; b.push(3); What is a?", options: ["[1, 2]", "[1, 2, 3]", "[3]", "TypeError"], answer: 1, why: "b is another reference to the same array; copy with [...a] to get a separate one." },
    { q: "What does [1, 2, 3].forEach((n) => n * 2) return?", options: ["[2, 4, 6]", "undefined", "6", "[1, 2, 3]"], answer: 1, why: "forEach is for side effects and always returns undefined." },
    { q: "What does [10, 9, 1, 100].sort() give?", options: ["[1, 9, 10, 100]", "[1, 10, 100, 9]", "[100, 10, 9, 1]", "[9, 1, 10, 100]"], answer: 1, why: "Without a compare function, items are compared as strings: \"1\" < \"10\" < \"100\" < \"9\"." },
    { q: "What happens with [].reduce((s, n) => s + n)?", options: ["Returns 0", "Returns undefined", "Throws TypeError: Reduce of empty array with no initial value", "Returns []"], answer: 2, why: "Without an initial value, reduce needs at least one item; always pass the start value." },
    { q: "const grid = Array(2).fill([]); grid[0].push(\"x\"); What is grid?", options: ["[[\"x\"], []]", "[[\"x\"], [\"x\"]]", "[\"x\", []]", "TypeError"], answer: 1, why: "fill puts the same array object in every slot, so both rows are one array; use Array.from({ length: 2 }, () => [])." },
  ],
};
