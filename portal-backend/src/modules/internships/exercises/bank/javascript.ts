import type { ExerciseSeed } from "../types.js";

const readInput = `const input = require("fs").readFileSync(0, "utf8").trim();`;

export default [
  {
    title: "Sum of two numbers",
    brief: "Read two integers separated by a space and print their sum.",
    steps: ["Input: one line with two integers a and b", "Output: a + b"],
    level: "basic",
    editor: "javascript",
    starter: `${readInput}\nconst [a, b] = input.split(" ").map(Number);\n\n// Print the sum of a and b\n`,
    solution: `${readInput}\nconst [a, b] = input.split(" ").map(Number);\nconsole.log(a + b);\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "2 3", expected: "5" },
          { stdin: "-4 10", expected: "6" },
          { stdin: "1000000 2000000", expected: "3000000", hidden: true },
          { stdin: "0 0", expected: "0", hidden: true },
        ],
      },
    },
  },
  {
    title: "Even or odd",
    brief: "Read one integer and print whether it is even or odd.",
    steps: ["Input: one integer n (can be negative)", "Output: the word Even or Odd"],
    level: "basic",
    editor: "javascript",
    starter: `${readInput}\nconst n = Number(input);\n\n// Print "Even" or "Odd"\n`,
    solution: `${readInput}\nconst n = Number(input);\nconsole.log(n % 2 === 0 ? "Even" : "Odd");\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "4", expected: "Even" },
          { stdin: "7", expected: "Odd" },
          { stdin: "0", expected: "Even", hidden: true },
          { stdin: "-3", expected: "Odd", hidden: true },
        ],
      },
    },
  },
  {
    title: "Largest of three",
    brief: "Read three integers and print the largest one.",
    steps: ["Input: one line with three integers separated by spaces", "Output: the largest of the three"],
    level: "basic",
    editor: "javascript",
    starter: `${readInput}\nconst [a, b, c] = input.split(/\\s+/).map(Number);\n\n// Print the largest number\n`,
    solution: `${readInput}\nconst [a, b, c] = input.split(/\\s+/).map(Number);\nlet max = a;\nif (b > max) max = b;\nif (c > max) max = c;\nconsole.log(max);\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "3 9 5", expected: "9" },
          { stdin: "10 2 7", expected: "10" },
          { stdin: "-5 -2 -9", expected: "-2", hidden: true },
          { stdin: "4 4 4", expected: "4", hidden: true },
        ],
      },
    },
  },
  {
    title: "Multiplication table",
    brief: "Read a number n and print its multiplication table from 1 to 10 using a loop.",
    steps: ["Input: one integer n", "Output: 10 lines in the form n x i = result, for i from 1 to 10", "Use a for loop"],
    level: "basic",
    editor: "javascript",
    starter: `${readInput}\nconst n = Number(input);\n\n// Print n x 1 = ... up to n x 10 = ...\n`,
    solution: `${readInput}\nconst n = Number(input);\nfor (let i = 1; i <= 10; i++) {\n  console.log(n + " x " + i + " = " + n * i);\n}\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "2", expected: "2 x 1 = 2\n2 x 2 = 4\n2 x 3 = 6\n2 x 4 = 8\n2 x 5 = 10\n2 x 6 = 12\n2 x 7 = 14\n2 x 8 = 16\n2 x 9 = 18\n2 x 10 = 20" },
          { stdin: "5", expected: "5 x 1 = 5\n5 x 2 = 10\n5 x 3 = 15\n5 x 4 = 20\n5 x 5 = 25\n5 x 6 = 30\n5 x 7 = 35\n5 x 8 = 40\n5 x 9 = 45\n5 x 10 = 50" },
          { stdin: "0", expected: "0 x 1 = 0\n0 x 2 = 0\n0 x 3 = 0\n0 x 4 = 0\n0 x 5 = 0\n0 x 6 = 0\n0 x 7 = 0\n0 x 8 = 0\n0 x 9 = 0\n0 x 10 = 0", hidden: true },
          { stdin: "12", expected: "12 x 1 = 12\n12 x 2 = 24\n12 x 3 = 36\n12 x 4 = 48\n12 x 5 = 60\n12 x 6 = 72\n12 x 7 = 84\n12 x 8 = 96\n12 x 9 = 108\n12 x 10 = 120", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\bfor\s*\(`, message: "Uses a for loop" }],
    },
  },
  {
    title: "Reverse a string",
    brief: "Read a line of text and print it reversed.",
    steps: ["Input: one line of text", "Output: the same characters in reverse order"],
    level: "intermediate",
    editor: "javascript",
    starter: `const input = require("fs").readFileSync(0, "utf8").replace(/\\r?\\n$/, "");\n\n// Print the text reversed\n`,
    solution: `const input = require("fs").readFileSync(0, "utf8").replace(/\\r?\\n$/, "");\nconsole.log(input.split("").reverse().join(""));\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "hello", expected: "olleh" },
          { stdin: "Inveon Tech", expected: "hceT noevnI" },
          { stdin: "a", expected: "a", hidden: true },
          { stdin: "racecar 123", expected: "321 racecar", hidden: true },
        ],
      },
    },
  },
  {
    title: "Count vowels",
    brief: "Read a line of text and print how many vowels (a, e, i, o, u, upper or lower case) it contains.",
    steps: ["Input: one line of text", "Output: the number of vowels"],
    level: "intermediate",
    editor: "javascript",
    starter: `${readInput}\nlet count = 0;\n\n// Count the vowels in input\nconsole.log(count);\n`,
    solution: `${readInput}\nlet count = 0;\nfor (const ch of input.toLowerCase()) {\n  if ("aeiou".indexOf(ch) !== -1) count++;\n}\nconsole.log(count);\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "hello world", expected: "3" },
          { stdin: "JavaScript", expected: "3" },
          { stdin: "rhythm", expected: "0", hidden: true },
          { stdin: "AEIOU aeiou", expected: "10", hidden: true },
        ],
      },
    },
  },
  {
    title: "Filter even numbers",
    brief: "Read a list of integers and print only the even ones, using the array filter method.",
    steps: ["Input: one line of integers separated by spaces", "Output: the even numbers separated by spaces, in the same order (print an empty line if there are none)", "Use .filter()"],
    level: "intermediate",
    editor: "javascript",
    starter: `${readInput}\nconst nums = input.split(/\\s+/).map(Number);\n\n// Keep only the even numbers and print them\n`,
    solution: `${readInput}\nconst nums = input.split(/\\s+/).map(Number);\nconst evens = nums.filter((n) => n % 2 === 0);\nconsole.log(evens.join(" "));\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "1 2 3 4 5 6", expected: "2 4 6" },
          { stdin: "10 15 20", expected: "10 20" },
          { stdin: "1 3 5", expected: "", hidden: true },
          { stdin: "-4 0 7 8", expected: "-4 0 8", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\.filter\s*\(`, message: "Uses the array .filter() method" }],
    },
  },
  {
    title: "Word frequency",
    brief: "Read a sentence and print how many times each word appears, in the order each word first appears.",
    steps: ["Input: one line of lowercase words separated by single spaces", "Output: one line per distinct word in the form word: count", "Keep the order in which words first appear"],
    level: "intermediate",
    editor: "javascript",
    starter: `${readInput}\nconst words = input.split(" ");\nconst counts = {};\n\n// Count each word, then print word: count lines\n`,
    solution: `${readInput}\nconst words = input.split(" ");\nconst counts = {};\nconst order = [];\nfor (const w of words) {\n  if (!(w in counts)) {\n    counts[w] = 0;\n    order.push(w);\n  }\n  counts[w]++;\n}\nfor (const w of order) console.log(w + ": " + counts[w]);\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "the cat and the dog", expected: "the: 2\ncat: 1\nand: 1\ndog: 1" },
          { stdin: "a b a b a", expected: "a: 3\nb: 2" },
          { stdin: "hello", expected: "hello: 1", hidden: true },
          { stdin: "x y z z y x x", expected: "x: 3\ny: 2\nz: 2", hidden: true },
        ],
      },
    },
  },
  {
    title: "Palindrome checker",
    brief: "Read a phrase and print Yes if it reads the same backwards (ignoring case, spaces and punctuation), otherwise No.",
    steps: ["Input: one line of text", "Ignore everything that is not a letter or a digit, and ignore case", "Output: Yes or No"],
    level: "advanced",
    editor: "javascript",
    starter: `${readInput}\n\n// Clean the text, then compare it with its reverse\nconsole.log("No");\n`,
    solution: `${readInput}\nconst clean = input.toLowerCase().replace(/[^a-z0-9]/g, "");\nconst reversed = clean.split("").reverse().join("");\nconsole.log(clean === reversed ? "Yes" : "No");\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "Racecar", expected: "Yes" },
          { stdin: "hello", expected: "No" },
          { stdin: "A man, a plan, a canal: Panama!", expected: "Yes", hidden: true },
          { stdin: "12321x", expected: "No", hidden: true },
        ],
      },
    },
  },
  {
    title: "Sort without sort()",
    brief: "Read a list of integers and print them in ascending order without using the built-in sort method (write bubble sort or selection sort).",
    steps: ["Input: one line of integers separated by spaces", "Output: the numbers in ascending order separated by spaces", "Do not use .sort(); use nested loops"],
    level: "advanced",
    editor: "javascript",
    starter: `${readInput}\nconst nums = input.split(/\\s+/).map(Number);\n\n// Sort nums with your own loops\nconsole.log(nums.join(" "));\n`,
    solution: `${readInput}\nconst nums = input.split(/\\s+/).map(Number);\nfor (let i = 0; i < nums.length; i++) {\n  for (let j = 0; j < nums.length - 1 - i; j++) {\n    if (nums[j] > nums[j + 1]) {\n      const t = nums[j];\n      nums[j] = nums[j + 1];\n      nums[j + 1] = t;\n    }\n  }\n}\nconsole.log(nums.join(" "));\n`,
    check: {
      run: {
        language: "javascript",
        tests: [
          { stdin: "5 2 9 1", expected: "1 2 5 9" },
          { stdin: "3 3 1 2", expected: "1 2 3 3" },
          { stdin: "42", expected: "42", hidden: true },
          { stdin: "10 -1 100 0 -50 7", expected: "-50 -1 0 7 10 100", hidden: true },
        ],
      },
      rules: [
        { notMatch: String.raw`\.sort\s*\(`, message: "Does not use the built-in .sort()" },
        { match: String.raw`\b(for|while)\b[\s\S]*\b(for|while)\b`, message: "Uses loops to sort" },
      ],
    },
  },
] satisfies ExerciseSeed[];
