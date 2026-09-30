import type { PracticeUnit } from "../../types.js";
import { jq, js } from "./shared.js";

const arrow = { match: "=>", message: "Uses an arrow function" };

export const functions: PracticeUnit = {
  key: "functions",
  title: "Functions, arrow functions and closures",
  summary: "function declarations and arrow functions, default and rest parameters, callbacks, higher-order functions, closures and recursion",
  reading: js`## Three ways to write a function

\`\`\`javascript
function add(a, b) {        // declaration: hoisted, usable before this line
  return a + b;
}
const sub = function (a, b) { // function expression
  return a - b;
};
const mul = (a, b) => a * b;  // arrow function, the value is returned automatically
\`\`\`

- An arrow function with one expression returns it without writing return. With braces you must write return: (a, b) => { return a * b; }.
- To return an object from a short arrow, wrap it in brackets: () => ({ ok: true }). Without them the braces are read as a block.
- Arrow functions don't have their own this. That makes them perfect for callbacks, but wrong as object methods that use this.

A function without a return statement returns undefined. Forgetting return inside braces is the most common bug in this unit.

## Parameters

- Default values: function greet(name, greeting = "Hello") { ... }. The default is used when the argument is missing or undefined.
- Rest parameters collect the remaining arguments into a real array: function sum(...nums) { return nums.reduce((s, n) => s + n, 0); }
- Spread does the opposite at the call: Math.max(...marks).
- Destructuring in the parameter list: function show({ name, age }) { ... } picks properties out of the object passed in.

JavaScript doesn't check how many arguments you pass. Missing ones are undefined, extra ones are ignored.

## Functions are values

A function can be stored in a variable, put in an array, passed to another function and returned from one. A function passed in is called a callback; a function that takes or returns functions is a higher-order function.

\`\`\`javascript
function repeat(times, action) {
  for (let i = 1; i <= times; i++) action(i);
}
repeat(3, (i) => console.log("Round", i));
\`\`\`

Array methods like map, filter and forEach, setTimeout and event listeners all take callbacks. Pass the function itself, not the result of calling it: repeat(3, show), not repeat(3, show()).

## Scope and closures

Variables are visible in the block where they are declared and in blocks nested inside it. A closure is a function that remembers the variables of the place where it was created, even after that outer function has returned.

\`\`\`javascript
function makeCounter() {
  let count = 0;             // private: nothing outside can touch it
  return () => ++count;
}
const next = makeCounter();
next(); // 1
next(); // 2
\`\`\`

Each call to makeCounter creates a new count, so two counters don't share state. Closures give you private data, factories, memoisation (remembering results) and functions like once or debounce.

A classic trap: with var in a loop, all callbacks share one variable; with let, each round gets its own copy. That is one more reason to avoid var.

## Recursion

A recursive function calls itself on a smaller problem and has a base case that stops. Factorial: n! = n * (n - 1)!, and 0! = 1. Without a base case you get "RangeError: Maximum call stack size exceeded". Deep recursion (tens of thousands of calls) also overflows the stack, so use a loop for long, simple repetitions.

## Pure functions

A pure function returns a value that depends only on its arguments and changes nothing outside itself. Pure functions are easy to test and reuse. Try to write your logic as pure functions and keep reading input and printing at the edges of the program.

## Big numbers

Numbers are exact only up to Number.MAX_SAFE_INTEGER (9007199254740991). For bigger whole numbers like 25! use BigInt: write 1n instead of 1, and don't mix BigInt and Number in one expression (convert with BigInt(n)).

## How your assignments are checked

Each question is run with Node against visible and hidden tests. Many also check the code for the idea being practised, for example an arrow function (=>), a rest parameter (...) or a recursive call, so write the function the question describes and call it from your main code.`,
  questions: [
    jq("Largest and smallest with arrow functions", "Read three numbers. Write two arrow functions, largest(a, b, c) and smallest(a, b, c), and print what they return.", ["Input: three numbers on one line", "Output line 1: Largest: <value>", "Output line 2: Smallest: <value>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [a, b, c] = input.split(/\s+/).map(Number);
const largest = (x, y, z) => Math.max(x, y, z);
const smallest = (x, y, z) => Math.min(x, y, z);
console.log(\`Largest: \${largest(a, b, c)}\`);
console.log(\`Smallest: \${smallest(a, b, c)}\`);
`, [["4 9 2", "Largest: 9 Smallest: 2"], ["-1 -5 -3", "Largest: -1 Smallest: -5"]], [["7 7 7", "Largest: 7 Smallest: 7"], ["0.5 10 -2.5", "Largest: 10 Smallest: -2.5"]], { rules: [arrow, { match: String.raw`\blargest\s*\(`, message: "Calls largest()" }] }),

    jq("Greeting with a default parameter", "Write greet(name, greeting = \"Hello\") that returns \"<greeting>, <name>!\". The input line has a name and, optionally, a greeting after it. Call greet with or without the greeting.", ["Input: a name, then optionally a greeting word, separated by a space", "Output: the greeting, like Namaste, Asha! or Hello, Ravi!"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function greet(name, greeting = "Hello") {
  return \`\${greeting}, \${name}!\`;
}
const [name, greeting] = input.split(/\s+/);
console.log(greet(name, greeting));
`, [["Asha Namaste", "Namaste, Asha!"], ["Ravi", "Hello, Ravi!"]], [["Meena Welcome", "Welcome, Meena!"], ["Om", "Hello, Om!"]], { rules: [{ match: String.raw`greeting\s*=\s*["'\x60]Hello`, message: "Gives greeting a default value of \"Hello\"" }] }),

    jq("Average with rest parameters", "Write average(...nums) that returns the average of any number of arguments (0 when there are none). Read the numbers and call it with the spread operator: average(...values).", ["Input: numbers separated by spaces (the line may be empty)", "Output: the average with 2 decimals"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function average(...nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}
const values = input ? input.split(/\s+/).map(Number) : [];
console.log(\`Average: \${average(...values).toFixed(2)}\`);
`, [["10 20 30", "20.00"], ["5", "5.00"]], [["", "0.00"], ["1 2 3 4", "2.50"], ["-10 10 7", "2.33"]], { level: "intermediate", rules: [{ match: String.raw`\(\s*\.\.\.\w+\s*\)`, message: "Uses a rest parameter (...nums)" }, { match: String.raw`average\s*\(\s*\.\.\.`, message: "Calls average with the spread operator" }] }),

    jq("Your own map with a callback", "Write myMap(array, callback) that builds and returns a new array by calling callback(item, index) for every item, without using the built-in map. Use it to print the numbers doubled and then squared.", ["Input: numbers separated by spaces", "Output line 1: the doubled numbers separated by spaces", "Output line 2: the squared numbers separated by spaces", "Don't use .map( anywhere"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function myMap(array, callback) {
  const result = [];
  for (let i = 0; i < array.length; i++) {
    result.push(callback(array[i], i));
  }
  return result;
}
const nums = myMap(input.split(/\s+/), (text) => Number(text));
console.log(myMap(nums, (n) => n * 2).join(" "));
console.log(myMap(nums, (n) => n * n).join(" "));
`, [["1 2 3", "2 4 6\n1 4 9"], ["-4 10", "-8 20\n16 100"]], [["0", "0\n0"], ["5 6 7 8", "10 12 14 16\n25 36 49 64"]], { level: "intermediate", match: "exact", rules: [{ notMatch: String.raw`\.map\s*\(`, message: "Doesn't use the built-in map" }, { match: String.raw`callback\s*\(`, message: "Calls the callback for every item" }] }),

    jq("Counter with a closure", "Write makeCounter(start) that keeps a private count and returns an object with three functions: inc() adds 1, dec() subtracts 1 and value() returns the count. The first line is the start value; the second line has commands inc, dec and show. Print the value for every show.", ["Input line 1: the start value", "Input line 2: commands separated by spaces", "Output: one number per show command"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function makeCounter(start) {
  let count = start;
  return {
    inc: () => { count++; },
    dec: () => { count--; },
    value: () => count,
  };
}
const [first, second = ""] = input.split("\n");
const counter = makeCounter(Number(first));
for (const command of second.trim().split(/\s+/)) {
  if (command === "inc") counter.inc();
  else if (command === "dec") counter.dec();
  else if (command === "show") console.log(counter.value());
}
`, [["0\ninc inc show dec show", "2\n1"], ["10\nshow dec dec dec show", "10\n7"]], [["-1\ninc show inc inc show", "0\n2"], ["5\nshow", "5"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`function\s+makeCounter|makeCounter\s*=`, message: "Defines makeCounter" }, { match: String.raw`return\s*\{`, message: "Returns an object of functions that close over the count" }] }),

    jq("Memoised Fibonacci", "Write a memo(fn) helper that caches results in a Map inside a closure, and use it to make a fast recursive Fibonacci with BigInt (fib(0) = 0, fib(1) = 1). Print fib(n).", ["Input: n (0 to 150)", "Output: fib(n) as a whole number", "Without memoisation fib(90) would never finish; with it, it's instant", "Use BigInt (0n, 1n) so large values stay exact"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function memo(fn) {
  const cache = new Map();
  return (n) => {
    if (!cache.has(n)) cache.set(n, fn(n));
    return cache.get(n);
  };
}
const fib = memo((n) => (n < 2 ? BigInt(n) : fib(n - 1) + fib(n - 2)));
console.log(fib(Number(input)).toString());
`, [["10", "55"], ["1", "1"]], [["0", "0"], ["90", "2880067194370816120"], ["150", "9969216677189303386214405760200"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`new\s+Map\s*\(`, message: "Caches results in a Map" }, { match: String.raw`\d+n\b|BigInt\s*\(`, message: "Uses BigInt" }] }),

    jq("Pipeline of functions", "Store small functions in an object: double, inc (add 1), square, half and neg. The first line is a starting number, the second line lists operation names. Build one function with pipe(...fns) using reduce, run the number through it and print the result.", ["Input line 1: a number", "Input line 2: operation names separated by spaces", "Output: the final value", "pipe(f, g)(x) means g(f(x))"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const ops = {
  double: (x) => x * 2,
  inc: (x) => x + 1,
  square: (x) => x * x,
  half: (x) => x / 2,
  neg: (x) => -x,
};
const pipe = (...fns) => (x) => fns.reduce((value, fn) => fn(value), x);
const [first, second = ""] = input.split("\n");
const names = second.trim().split(/\s+/).filter(Boolean);
const run = pipe(...names.map((name) => ops[name]));
console.log(run(Number(first)));
`, [["3\ndouble inc", "7"], ["3\ninc double", "8"]], [["5\nsquare half neg", "-12.5"], ["2\ndouble double double square", "256"], ["9\n", "9"]], { level: "advanced", rules: [{ match: String.raw`\.reduce\s*\(`, message: "Composes the functions with reduce" }, arrow] }),

    jq("Factorial with recursion", "Write a recursive function factorial(n) that returns n! as a BigInt, with 0! = 1 as the base case. Print the result.", ["Input: n (0 to 30)", "Output: n! as an exact whole number"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function factorial(n) {
  if (n <= 1n) return 1n;
  return n * factorial(n - 1n);
}
console.log(factorial(BigInt(input)).toString());
`, [["5", "120"], ["0", "1"]], [["1", "1"], ["20", "2432902008176640000"], ["25", "15511210043330985984000000"]], { match: "exact", rules: [{ match: String.raw`return[^;]*factorial\s*\(`, message: "factorial calls itself" }] }),

    jq("GCD and LCM", "Write a recursive gcd(a, b) using Euclid's rule (gcd(a, 0) = a, else gcd(b, a % b)) and an arrow function lcm(a, b) = a * b / gcd(a, b). Print both.", ["Input: two positive integers", "Output line 1: GCD: <value>", "Output line 2: LCM: <value>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
const lcm = (a, b) => (a * b) / gcd(a, b);
const [a, b] = input.split(/\s+/).map(Number);
console.log(\`GCD: \${gcd(a, b)}\`);
console.log(\`LCM: \${lcm(a, b)}\`);
`, [["12 18", "GCD: 6 LCM: 36"], ["7 5", "GCD: 1 LCM: 35"]], [["100 10", "GCD: 10 LCM: 100"], ["1 1", "GCD: 1 LCM: 1"], ["84 36", "GCD: 12 LCM: 252"]], { rules: [{ match: String.raw`gcd\s*\(\s*b\s*,`, message: "gcd calls itself with (b, a % b)" }, arrow] }),

    jq("Tower of Hanoi", "Print the moves that solve the Tower of Hanoi for n disks, moving them from rod A to rod C using rod B. Write a recursive hanoi(n, from, to, via). Then print the total number of moves.", ["Input: n (1 to 6)", "Output: one line per move like Move disk 1 from A to C, then Moves: <count>", "Print only these lines"], js`const input = require("fs").readFileSync(0, "utf8").trim();
let moves = 0;
function hanoi(n, from, to, via) {
  if (n === 0) return;
  hanoi(n - 1, from, via, to);
  console.log(\`Move disk \${n} from \${from} to \${to}\`);
  moves++;
  hanoi(n - 1, via, to, from);
}
hanoi(Number(input), "A", "C", "B");
console.log(\`Moves: \${moves}\`);
`, [["2", "Move disk 1 from A to B\nMove disk 2 from A to C\nMove disk 1 from B to C\nMoves: 3"]], [["1", "Move disk 1 from A to C\nMoves: 1"], ["3", "Move disk 1 from A to C\nMove disk 2 from A to B\nMove disk 1 from C to B\nMove disk 3 from A to C\nMove disk 1 from B to A\nMove disk 2 from B to C\nMove disk 1 from A to C\nMoves: 7"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`hanoi\s*\(\s*n\s*-\s*1`, message: "hanoi calls itself with n - 1" }] }),
  ],
  quiz: [
    { q: "What does const f = (a, b) => { a + b; }; return for f(1, 2)?", options: ["3", "undefined", "NaN", "An error"], answer: 1, why: "With braces the body is a block, and there is no return statement." },
    { q: "Which function form is hoisted, so it can be called before the line that defines it?", options: ["const f = () => {}", "const f = function () {}", "function f() {}", "let f = function () {}"], answer: 2, why: "Function declarations are hoisted with their body; function expressions in const/let are not usable before their line." },
    { q: "How do you return an object literal from a short arrow function?", options: ["() => { ok: true }", "() => ({ ok: true })", "() => return { ok: true }", "() => [ok: true]"], answer: 1, why: "Wrapping the object in brackets stops the braces from being read as a function body." },
    { q: "function f(a, b = 5) { return a + b; } What is f(1, undefined)?", options: ["NaN", "1", "6", "undefined"], answer: 2, why: "A default is used when the argument is missing or explicitly undefined." },
    { q: "What is a callback?", options: ["A function that calls itself", "A function passed to another function to be called later", "A function that returns a promise", "A method on the window object"], answer: 1, why: "Callbacks are functions handed to other code (map, setTimeout, listeners) to be called." },
    { q: "What is inside nums in function f(...nums) when called as f(1, 2, 3)?", options: ["The first argument only", "An array-like arguments object", "A real array [1, 2, 3]", "The number 3"], answer: 2, why: "Rest parameters collect the remaining arguments into a true array." },
    { q: "Which is true of a closure?", options: ["It copies the outer variables when created", "It keeps a live link to the variables of the scope where it was created", "It can only read global variables", "It is created only with the closure keyword"], answer: 1, why: "Closures keep references to their outer variables, so they see later changes and can update them." },
    { q: "What does this print?\n\nconst fns = [];\nfor (var i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns.map((f) => f()).join(\",\"));", options: ["0,1,2", "3,3,3", "2,2,2", "undefined,undefined,undefined"], answer: 1, why: "var creates one shared i, which is 3 when the functions finally run; with let each round gets its own i and you'd get 0,1,2." },
    { q: "What does this print?\n\nfunction make() {\n  let n = 0;\n  return () => ++n;\n}\nconst a = make(), b = make();\na(); a();\nconsole.log(a(), b());", options: ["3 1", "3 4", "1 1", "2 1"], answer: 0, why: "Each call to make creates a separate n; a has been called three times, b once." },
    { q: "What happens when a recursive function has no base case?", options: ["It returns undefined", "It loops forever without error", "It throws RangeError: Maximum call stack size exceeded", "Node optimises it into a loop"], answer: 2, why: "Every call adds a stack frame until the call stack runs out; JavaScript engines don't generally do tail-call optimisation." },
  ],
};
