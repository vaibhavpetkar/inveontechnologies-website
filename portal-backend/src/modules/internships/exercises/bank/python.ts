import type { ExerciseSeed } from "../types.js";

export default [
  {
    title: "Hello, name",
    brief: "Read a name and print a greeting.",
    steps: ["Input: one line with a name", "Output: Hello, <name>!"],
    level: "basic",
    editor: "python",
    starter: `name = input().strip()\n\n# Print the greeting\n`,
    solution: `name = input().strip()\nprint("Hello, " + name + "!")\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "Asha", expected: "Hello, Asha!" },
          { stdin: "Rahul", expected: "Hello, Rahul!" },
          { stdin: "Mary Jane", expected: "Hello, Mary Jane!", hidden: true },
          { stdin: "X", expected: "Hello, X!", hidden: true },
        ],
      },
    },
  },
  {
    title: "Rectangle area",
    brief: "Read the length and width of a rectangle and print its area and perimeter.",
    steps: ["Input: one line with two integers: length and width", "Output line 1: Area: <length*width>", "Output line 2: Perimeter: <2*(length+width)>"],
    level: "basic",
    editor: "python",
    starter: `length, width = map(int, input().split())\n\n# Print the area and perimeter\n`,
    solution: `length, width = map(int, input().split())\nprint("Area:", length * width)\nprint("Perimeter:", 2 * (length + width))\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "4 5", expected: "Area: 20\nPerimeter: 18" },
          { stdin: "10 3", expected: "Area: 30\nPerimeter: 26" },
          { stdin: "1 1", expected: "Area: 1\nPerimeter: 4", hidden: true },
          { stdin: "0 7", expected: "Area: 0\nPerimeter: 14", hidden: true },
        ],
      },
    },
  },
  {
    title: "Grade from marks",
    brief: "Read a mark out of 100 and print the grade.",
    steps: ["Input: one integer from 0 to 100", "Output: A for 90 and above, B for 75 to 89, C for 50 to 74, F below 50", "Use if / elif / else"],
    level: "basic",
    editor: "python",
    starter: `marks = int(input())\n\n# Print the grade letter\n`,
    solution: `marks = int(input())\nif marks >= 90:\n    print("A")\nelif marks >= 75:\n    print("B")\nelif marks >= 50:\n    print("C")\nelse:\n    print("F")\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "95", expected: "A" },
          { stdin: "60", expected: "C" },
          { stdin: "75", expected: "B", hidden: true },
          { stdin: "49", expected: "F", hidden: true },
          { stdin: "90", expected: "A", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\belif\b`, message: "Uses if / elif / else" }],
    },
  },
  {
    title: "Sum from 1 to n",
    brief: "Read a number n and print the sum of all numbers from 1 to n using a loop.",
    steps: ["Input: one integer n (0 or more)", "Output: 1 + 2 + ... + n (print 0 when n is 0)", "Use a for loop with range()"],
    level: "basic",
    editor: "python",
    starter: `n = int(input())\ntotal = 0\n\n# Add the numbers from 1 to n\nprint(total)\n`,
    solution: `n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "5", expected: "15" },
          { stdin: "10", expected: "55" },
          { stdin: "1", expected: "1", hidden: true },
          { stdin: "1000", expected: "500500", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\bfor\s+\w+\s+in\s+range\s*\(`, message: "Uses a for loop with range()" }],
    },
  },
  {
    title: "List statistics",
    brief: "Read a list of integers and print the minimum, maximum and average.",
    steps: ["Input: one line of integers separated by spaces", "Output line 1: Min: <smallest>", "Output line 2: Max: <largest>", "Output line 3: Average: <average rounded to 2 decimals, always shown with 2 decimals>"],
    level: "intermediate",
    editor: "python",
    starter: `nums = list(map(int, input().split()))\n\n# Print Min, Max and Average\n`,
    solution: `nums = list(map(int, input().split()))\nprint("Min:", min(nums))\nprint("Max:", max(nums))\nprint("Average: {:.2f}".format(sum(nums) / len(nums)))\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "4 8 15 16 23 42", expected: "Min: 4\nMax: 42\nAverage: 18.00" },
          { stdin: "1 2", expected: "Min: 1\nMax: 2\nAverage: 1.50" },
          { stdin: "7", expected: "Min: 7\nMax: 7\nAverage: 7.00", hidden: true },
          { stdin: "-3 0 10", expected: "Min: -3\nMax: 10\nAverage: 2.33", hidden: true },
        ],
      },
    },
  },
  {
    title: "Character counter",
    brief: "Read a word and print how many times each character appears, in alphabetical order, using a dictionary.",
    steps: ["Input: one lowercase word", "Output: one line per distinct character in the form char count, sorted alphabetically", "Store the counts in a dict"],
    level: "intermediate",
    editor: "python",
    starter: `word = input().strip()\ncounts = {}\n\n# Count each character, then print them in alphabetical order\n`,
    solution: `word = input().strip()\ncounts = {}\nfor ch in word:\n    counts[ch] = counts.get(ch, 0) + 1\nfor ch in sorted(counts):\n    print(ch, counts[ch])\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "banana", expected: "a 3\nb 1\nn 2" },
          { stdin: "hello", expected: "e 1\nh 1\nl 2\no 1" },
          { stdin: "z", expected: "z 1", hidden: true },
          { stdin: "mississippi", expected: "i 4\nm 1\np 2\ns 4", hidden: true },
        ],
      },
    },
  },
  {
    title: "Squares with comprehension",
    brief: "Read a list of integers and print the squares of the odd numbers, using a list comprehension.",
    steps: ["Input: one line of integers separated by spaces", "Output: squares of the odd numbers, separated by spaces, in the same order (empty line if none)", "Use a list comprehension: [... for ... in ... if ...]"],
    level: "intermediate",
    editor: "python",
    starter: `nums = list(map(int, input().split()))\n\n# Build a list of squares of the odd numbers and print it\n`,
    solution: `nums = list(map(int, input().split()))\nsquares = [n * n for n in nums if n % 2 != 0]\nprint(" ".join(str(s) for s in squares))\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "1 2 3 4 5", expected: "1 9 25" },
          { stdin: "7 8", expected: "49" },
          { stdin: "2 4 6", expected: "", hidden: true },
          { stdin: "-3 10 11", expected: "9 121", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\[[^\]]*\bfor\b[^\]]*\bin\b[^\]]*\]`, message: "Uses a list comprehension" }],
    },
  },
  {
    title: "Prime number function",
    brief: "Write a function is_prime(n) and use it to print Prime or Not prime for the number read from input.",
    steps: ["Define a function is_prime(n) that returns True or False", "Input: one integer n", "Output: Prime or Not prime (0 and 1 are not prime)"],
    level: "intermediate",
    editor: "python",
    starter: `def is_prime(n):\n    # Return True if n is prime\n    return False\n\n\nn = int(input())\nprint("Prime" if is_prime(n) else "Not prime")\n`,
    solution: `def is_prime(n):\n    if n < 2:\n        return False\n    i = 2\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 1\n    return True\n\n\nn = int(input())\nprint("Prime" if is_prime(n) else "Not prime")\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "7", expected: "Prime" },
          { stdin: "10", expected: "Not prime" },
          { stdin: "1", expected: "Not prime", hidden: true },
          { stdin: "2", expected: "Prime", hidden: true },
          { stdin: "97", expected: "Prime", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\bdef\s+is_prime\s*\(`, message: "Defines a function is_prime(n)" }],
    },
  },
  {
    title: "Student class",
    brief: "Write a Student class with a name and a list of marks, and a method average(); read students and print each name with their average.",
    steps: [
      "Define class Student with __init__(self, name, marks) and a method average()",
      "Input: first line n, then n lines of: name followed by marks separated by spaces",
      "Output: one line per student: <name>: <average with 2 decimals>",
    ],
    level: "advanced",
    editor: "python",
    starter: `class Student:\n    def __init__(self, name, marks):\n        pass\n\n    def average(self):\n        return 0\n\n\nn = int(input())\nfor _ in range(n):\n    parts = input().split()\n    # Create a Student and print its average\n`,
    solution: `class Student:\n    def __init__(self, name, marks):\n        self.name = name\n        self.marks = marks\n\n    def average(self):\n        return sum(self.marks) / len(self.marks)\n\n\nn = int(input())\nfor _ in range(n):\n    parts = input().split()\n    s = Student(parts[0], [int(x) for x in parts[1:]])\n    print("{}: {:.2f}".format(s.name, s.average()))\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "2\nAsha 80 90 100\nRavi 70 75", expected: "Asha: 90.00\nRavi: 72.50" },
          { stdin: "1\nMeena 50", expected: "Meena: 50.00" },
          { stdin: "3\nA 1 2\nB 0 0 1\nC 100 99 98 97", expected: "A: 1.50\nB: 0.33\nC: 98.50", hidden: true },
          { stdin: "1\nZed 0", expected: "Zed: 0.00", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\bclass\s+Student\b`, message: "Defines a Student class" },
        { match: String.raw`\bdef\s+average\s*\(\s*self`, message: "Has an average(self) method" },
      ],
    },
  },
  {
    title: "Safe division",
    brief: "Read pairs of values and print their integer division, handling bad input with try / except instead of crashing.",
    steps: [
      "Input: first line n, then n lines each with two values a and b",
      "Output per line: a // b, or Cannot divide by zero when b is 0, or Invalid input when a or b is not an integer",
      "Use try / except with ZeroDivisionError and ValueError",
    ],
    level: "advanced",
    editor: "python",
    starter: `n = int(input())\nfor _ in range(n):\n    a, b = input().split()\n    # Convert, divide, and handle errors\n    print(int(a) // int(b))\n`,
    solution: `n = int(input())\nfor _ in range(n):\n    a, b = input().split()\n    try:\n        print(int(a) // int(b))\n    except ZeroDivisionError:\n        print("Cannot divide by zero")\n    except ValueError:\n        print("Invalid input")\n`,
    check: {
      run: {
        language: "python",
        tests: [
          { stdin: "2\n10 3\n8 0", expected: "3\nCannot divide by zero" },
          { stdin: "1\nabc 2", expected: "Invalid input" },
          { stdin: "4\n100 10\n5 x\n0 5\n7 0", expected: "10\nInvalid input\n0\nCannot divide by zero", hidden: true },
          { stdin: "1\n-9 2", expected: "-5", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\bexcept\s+ZeroDivisionError\b`, message: "Handles ZeroDivisionError" },
        { match: String.raw`\bexcept\s+ValueError\b`, message: "Handles ValueError" },
      ],
    },
  },
] satisfies ExerciseSeed[];
