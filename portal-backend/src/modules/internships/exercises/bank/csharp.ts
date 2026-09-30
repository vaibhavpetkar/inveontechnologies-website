import type { ExerciseSeed } from "../types.js";

const using = `using System;\n`;

export default [
  {
    title: "Greet the user",
    brief: "Read a name and print a greeting for it.",
    steps: ["Input: one line with a name", "Output: Hello, <name>! (for example Hello, Asha!)"],
    level: "basic",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        string name = Console.ReadLine();\n\n        // Print the greeting\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        string name = Console.ReadLine();\n        Console.WriteLine("Hello, " + name + "!");\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "Asha", expected: "Hello, Asha!" },
          { stdin: "World", expected: "Hello, World!" },
          { stdin: "Rahul Sharma", expected: "Hello, Rahul Sharma!", hidden: true },
          { stdin: "X", expected: "Hello, X!", hidden: true },
        ],
      },
    },
  },
  {
    title: "Sum of digits",
    brief: "Read a non-negative integer and print the sum of its digits.",
    steps: ["Input: one integer n (0 ≤ n ≤ 2000000000)", "Output: the sum of the digits of n (e.g. 1234 gives 10)", "Use n % 10 and n / 10 in a loop"],
    level: "basic",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        int sum = 0;\n\n        // Add up the digits\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        int sum = 0;\n        while (n > 0)\n        {\n            sum += n % 10;\n            n /= 10;\n        }\n        Console.WriteLine(sum);\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "1234", expected: "10" },
          { stdin: "905", expected: "14" },
          { stdin: "0", expected: "0", hidden: true },
          { stdin: "1999999999", expected: "82", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\b(for|while)\s*\(`, message: "Uses a loop" }],
    },
  },
  {
    title: "Leap year check",
    brief: "Read a year and print whether it is a leap year.",
    steps: ["Input: one integer year", "A leap year is divisible by 4, except years divisible by 100 that are not divisible by 400", "Output: Leap year or Not a leap year"],
    level: "basic",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int year = int.Parse(Console.ReadLine());\n\n        // Print Leap year or Not a leap year\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int year = int.Parse(Console.ReadLine());\n        bool leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;\n        Console.WriteLine(leap ? "Leap year" : "Not a leap year");\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "2024", expected: "Leap year" },
          { stdin: "2023", expected: "Not a leap year" },
          { stdin: "1900", expected: "Not a leap year", hidden: true },
          { stdin: "2000", expected: "Leap year", hidden: true },
        ],
      },
    },
  },
  {
    title: "FizzBuzz to N",
    brief: "Print the numbers from 1 to n, replacing multiples of 3 with Fizz, multiples of 5 with Buzz and multiples of both with FizzBuzz.",
    steps: ["Input: one integer n (1 ≤ n ≤ 100)", "Output: n lines, one for each number from 1 to n", "Multiple of 3 and 5: FizzBuzz; of 3: Fizz; of 5: Buzz; otherwise the number"],
    level: "basic",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n\n        // Print FizzBuzz from 1 to n\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        for (int i = 1; i <= n; i++)\n        {\n            if (i % 15 == 0) Console.WriteLine("FizzBuzz");\n            else if (i % 3 == 0) Console.WriteLine("Fizz");\n            else if (i % 5 == 0) Console.WriteLine("Buzz");\n            else Console.WriteLine(i);\n        }\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "5", expected: "1\n2\nFizz\n4\nBuzz" },
          { stdin: "15", expected: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz" },
          { stdin: "1", expected: "1", hidden: true },
          { stdin: "3", expected: "1\n2\nFizz", hidden: true },
        ],
      },
    },
  },
  {
    title: "Min and max of a list",
    brief: "Read a list of integers and print the smallest and the largest.",
    steps: ["Input line 1: n (n ≥ 1); line 2: n integers separated by spaces", "Output line 1: Min: <smallest>", "Output line 2: Max: <largest>", "Find them with a loop (do not sort)"],
    level: "intermediate",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        string[] parts = Console.ReadLine().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);\n\n        // Find and print the min and max\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        string[] parts = Console.ReadLine().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);\n        int min = int.Parse(parts[0]);\n        int max = min;\n        for (int i = 1; i < n; i++)\n        {\n            int x = int.Parse(parts[i]);\n            if (x < min) min = x;\n            if (x > max) max = x;\n        }\n        Console.WriteLine("Min: " + min);\n        Console.WriteLine("Max: " + max);\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "5\n3 9 -2 7 4", expected: "Min: -2\nMax: 9" },
          { stdin: "3\n10 20 30", expected: "Min: 10\nMax: 30" },
          { stdin: "1\n42", expected: "Min: 42\nMax: 42", hidden: true },
          { stdin: "4\n-5 -1 -9 -3", expected: "Min: -9\nMax: -1", hidden: true },
        ],
      },
      rules: [{ notMatch: String.raw`\b(Array\.Sort|OrderBy|\.Sort)\s*\(`, message: "Does not sort the list" }],
    },
  },
  {
    title: "Count the words",
    brief: "Read a line of text and print how many words it contains.",
    steps: ["Input: one line of text; words are separated by one or more spaces", "Output: the number of words (an empty line has 0 words)", "Tip: Split with StringSplitOptions.RemoveEmptyEntries"],
    level: "intermediate",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        string line = Console.ReadLine() ?? "";\n\n        // Count and print the words\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        string line = Console.ReadLine() ?? "";\n        string[] words = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);\n        Console.WriteLine(words.Length);\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "C sharp is fun", expected: "4" },
          { stdin: "hello", expected: "1" },
          { stdin: "   lots   of    spaces   ", expected: "3", hidden: true },
          { stdin: "", expected: "0", hidden: true },
        ],
      },
    },
  },
  {
    title: "Title case",
    brief: "Read a line of words and print it with the first letter of every word in upper case and the rest in lower case.",
    steps: ["Input: one line of words separated by single spaces", "Output: each word with its first letter upper case and the other letters lower case, separated by single spaces", "Example: hELLO wORLD becomes Hello World"],
    level: "intermediate",
    editor: "csharp",
    starter: `${using}\nclass Program\n{\n    static void Main()\n    {\n        string[] words = Console.ReadLine().Split(' ');\n\n        // Change each word and print the line\n    }\n}\n`,
    solution: `${using}\nclass Program\n{\n    static void Main()\n    {\n        string[] words = Console.ReadLine().Split(' ');\n        for (int i = 0; i < words.Length; i++)\n        {\n            string w = words[i];\n            if (w.Length > 0)\n                words[i] = w.Substring(0, 1).ToUpperInvariant() + w.Substring(1).ToLowerInvariant();\n        }\n        Console.WriteLine(string.Join(" ", words));\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "hello world", expected: "Hello World" },
          { stdin: "hELLO wORLD from c#", expected: "Hello World From C#" },
          { stdin: "a", expected: "A", hidden: true },
          { stdin: "INVEON TECHNOLOGIES pvt ltd", expected: "Inveon Technologies Pvt Ltd", hidden: true },
        ],
      },
    },
  },
  {
    title: "Word count with Dictionary",
    brief: "Read a line of lowercase words and print how many times each word appears, in the order the words first appear.",
    steps: ["Input: one line of lowercase words separated by spaces", "Output: one line per distinct word in the form word count, in order of first appearance", "Use a Dictionary<string, int> for the counts"],
    level: "intermediate",
    editor: "csharp",
    starter: `${using}using System.Collections.Generic;\n\nclass Program\n{\n    static void Main()\n    {\n        string[] words = Console.ReadLine().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);\n\n        // Count the words with a Dictionary and print them\n    }\n}\n`,
    solution: `${using}using System.Collections.Generic;\n\nclass Program\n{\n    static void Main()\n    {\n        string[] words = Console.ReadLine().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);\n        var counts = new Dictionary<string, int>();\n        var order = new List<string>();\n        foreach (string w in words)\n        {\n            if (counts.ContainsKey(w)) counts[w]++;\n            else\n            {\n                counts[w] = 1;\n                order.Add(w);\n            }\n        }\n        foreach (string w in order) Console.WriteLine(w + " " + counts[w]);\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "the cat and the dog and the bird", expected: "the 3\ncat 1\nand 2\ndog 1\nbird 1" },
          { stdin: "a b a", expected: "a 2\nb 1" },
          { stdin: "solo", expected: "solo 1", hidden: true },
          { stdin: "x x x x", expected: "x 4", hidden: true },
        ],
      },
      rules: [{ match: String.raw`Dictionary\s*<\s*string\s*,\s*int\s*>`, message: "Uses a Dictionary<string, int>" }],
    },
  },
  {
    title: "Even squares with LINQ",
    brief: "Read a list of integers and, using LINQ, print the squares of the even numbers in ascending order.",
    steps: ["Input line 1: n; line 2: n integers", "Output: the squares of the even numbers, sorted ascending, separated by single spaces; print None if there are no even numbers", "Use LINQ (using System.Linq) with Where, Select and OrderBy"],
    level: "advanced",
    editor: "csharp",
    starter: `${using}using System.Linq;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.ReadLine();\n        int[] nums = Console.ReadLine().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(s => int.Parse(s)).ToArray();\n\n        // Use Where, Select and OrderBy, then print\n    }\n}\n`,
    solution: `${using}using System.Linq;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.ReadLine();\n        int[] nums = Console.ReadLine().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(s => int.Parse(s)).ToArray();\n        int[] squares = nums.Where(x => x % 2 == 0).Select(x => x * x).OrderBy(x => x).ToArray();\n        Console.WriteLine(squares.Length == 0 ? "None" : string.Join(" ", squares));\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "6\n5 4 3 2 1 6", expected: "4 16 36" },
          { stdin: "4\n-4 7 0 2", expected: "0 4 16" },
          { stdin: "3\n1 3 5", expected: "None", hidden: true },
          { stdin: "5\n10 -10 8 8 1", expected: "64 64 100 100", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\.Where\s*\(`, message: "Filters with Where" },
        { match: String.raw`\.Select\s*\(\s*\w+\s*=>`, message: "Squares the numbers with Select" },
        { match: String.raw`\.OrderBy\s*\(`, message: "Sorts with OrderBy" },
      ],
    },
  },
  {
    title: "Bank account class",
    brief: "Write a BankAccount class with Deposit and Withdraw methods and run a list of transactions on it.",
    steps: ["Input line 1: n; then n lines, each deposit X or withdraw X (X is a positive integer); the balance starts at 0", "When a withdrawal is bigger than the balance, print Insufficient funds and skip it", "After all transactions print Balance: <balance>", "Define class BankAccount with the methods Deposit and Withdraw"],
    level: "advanced",
    editor: "csharp",
    starter: `${using}\n// Define class BankAccount here\n\nclass Program\n{\n    static void Main()\n    {\n        int n = int.Parse(Console.ReadLine());\n        for (int i = 0; i < n; i++)\n        {\n            string[] parts = Console.ReadLine().Split(' ');\n            // parts[0] is deposit or withdraw, parts[1] is the amount\n        }\n    }\n}\n`,
    solution: `${using}\nclass BankAccount\n{\n    public int Balance { get; private set; }\n\n    public void Deposit(int amount)\n    {\n        Balance += amount;\n    }\n\n    public bool Withdraw(int amount)\n    {\n        if (amount > Balance) return false;\n        Balance -= amount;\n        return true;\n    }\n}\n\nclass Program\n{\n    static void Main()\n    {\n        var account = new BankAccount();\n        int n = int.Parse(Console.ReadLine());\n        for (int i = 0; i < n; i++)\n        {\n            string[] parts = Console.ReadLine().Split(' ');\n            int amount = int.Parse(parts[1]);\n            if (parts[0] == "deposit") account.Deposit(amount);\n            else if (!account.Withdraw(amount)) Console.WriteLine("Insufficient funds");\n        }\n        Console.WriteLine("Balance: " + account.Balance);\n    }\n}\n`,
    check: {
      run: {
        language: "csharp",
        tests: [
          { stdin: "3\ndeposit 100\nwithdraw 30\ndeposit 5", expected: "Balance: 75" },
          { stdin: "2\ndeposit 50\nwithdraw 80", expected: "Insufficient funds\nBalance: 50" },
          { stdin: "1\nwithdraw 1", expected: "Insufficient funds\nBalance: 0", hidden: true },
          { stdin: "4\ndeposit 10\nwithdraw 10\nwithdraw 1\ndeposit 7", expected: "Insufficient funds\nBalance: 7", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\bclass\s+BankAccount\b`, message: "Defines class BankAccount" },
        { match: String.raw`\bDeposit\s*\(\s*(int|decimal|double|long)\s+\w+\s*\)`, message: "Has a Deposit method" },
        { match: String.raw`\bWithdraw\s*\(\s*(int|decimal|double|long)\s+\w+\s*\)`, message: "Has a Withdraw method" },
      ],
    },
  },
] satisfies ExerciseSeed[];
