import type { ExerciseSeed } from "../types.js";

const inc = `#include <stdio.h>\n`;

export default [
  {
    title: "Rectangle area and perimeter",
    brief: "Read the width and height of a rectangle and print its area and perimeter.",
    steps: ["Input: one line with two integers w and h", "Output line 1: Area: <w*h>", "Output line 2: Perimeter: <2*(w+h)>"],
    level: "basic",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int w, h;\n    scanf("%d %d", &w, &h);\n\n    // Print the area and the perimeter\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int w, h;\n    scanf("%d %d", &w, &h);\n    printf("Area: %d\\n", w * h);\n    printf("Perimeter: %d\\n", 2 * (w + h));\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
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
    title: "Even or odd",
    brief: "Read an integer and print whether it is even or odd.",
    steps: ["Input: one integer n (it can be negative)", "Output: Even if n is divisible by 2, otherwise Odd"],
    level: "basic",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int n;\n    scanf("%d", &n);\n\n    // Print Even or Odd\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    if (n % 2 == 0)\n        printf("Even\\n");\n    else\n        printf("Odd\\n");\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
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
    steps: ["Input: one line with three integers a b c", "Output: the largest of the three"],
    level: "basic",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int a, b, c;\n    scanf("%d %d %d", &a, &b, &c);\n\n    // Print the largest number\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int a, b, c;\n    scanf("%d %d %d", &a, &b, &c);\n    int max = a;\n    if (b > max) max = b;\n    if (c > max) max = c;\n    printf("%d\\n", max);\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "3 9 5", expected: "9" },
          { stdin: "12 4 8", expected: "12" },
          { stdin: "-5 -2 -9", expected: "-2", hidden: true },
          { stdin: "7 7 7", expected: "7", hidden: true },
        ],
      },
    },
  },
  {
    title: "Sum from 1 to N",
    brief: "Read a number n and print the sum 1 + 2 + ... + n using a loop.",
    steps: ["Input: one integer n (0 ≤ n ≤ 100000)", "Output: the sum of the numbers from 1 to n (use long long, the sum can be large)", "Use a for or while loop"],
    level: "basic",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    long long sum = 0;\n\n    // Add 1..n to sum with a loop\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    long long sum = 0;\n    for (int i = 1; i <= n; i++) sum += i;\n    printf("%lld\\n", sum);\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "5", expected: "15" },
          { stdin: "10", expected: "55" },
          { stdin: "0", expected: "0", hidden: true },
          { stdin: "100000", expected: "5000050000", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\b(for|while)\s*\(`, message: "Uses a for or while loop" }],
    },
  },
  {
    title: "Reverse an array",
    brief: "Read n integers into an array and print them in reverse order.",
    steps: ["Input line 1: n (1 ≤ n ≤ 100)", "Input line 2: n integers", "Output: the numbers in reverse order on one line, separated by single spaces"],
    level: "intermediate",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int n, a[100];\n    scanf("%d", &n);\n    for (int i = 0; i < n; i++) scanf("%d", &a[i]);\n\n    // Print the array in reverse order\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int n, a[100];\n    scanf("%d", &n);\n    for (int i = 0; i < n; i++) scanf("%d", &a[i]);\n    for (int i = n - 1; i >= 0; i--) {\n        printf("%d", a[i]);\n        if (i > 0) printf(" ");\n    }\n    printf("\\n");\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "5\n1 2 3 4 5", expected: "5 4 3 2 1" },
          { stdin: "3\n10 -20 30", expected: "30 -20 10" },
          { stdin: "1\n42", expected: "42", hidden: true },
          { stdin: "4\n7 7 0 1", expected: "1 0 7 7", hidden: true },
        ],
      },
    },
  },
  {
    title: "Count vowels",
    brief: "Read a line of text and print how many vowels (a, e, i, o, u in any case) it contains.",
    steps: ["Input: one line of text (up to 200 characters, may contain spaces)", "Output: the number of vowels; count both upper and lower case"],
    level: "intermediate",
    editor: "c",
    starter: `${inc}#include <ctype.h>\n\nint main(void) {\n    char s[256] = "";\n    fgets(s, sizeof s, stdin);\n    int count = 0;\n\n    // Count the vowels in s\n\n    return 0;\n}\n`,
    solution: `${inc}#include <ctype.h>\n\nint main(void) {\n    char s[256] = "";\n    fgets(s, sizeof s, stdin);\n    int count = 0;\n    for (int i = 0; s[i]; i++) {\n        char c = tolower((unsigned char)s[i]);\n        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') count++;\n    }\n    printf("%d\\n", count);\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "hello world", expected: "3" },
          { stdin: "Programming In C", expected: "4" },
          { stdin: "AEIOU aeiou", expected: "10", hidden: true },
          { stdin: "rhythm", expected: "0", hidden: true },
        ],
      },
    },
  },
  {
    title: "Prime number check",
    brief: "Read a positive integer and print whether it is a prime number.",
    steps: ["Input: one integer n (1 ≤ n ≤ 1000000)", "Output: Prime or Not prime", "Remember: 1 is not prime, 2 is prime"],
    level: "intermediate",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int n;\n    scanf("%d", &n);\n\n    // Print Prime or Not prime\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    int prime = n >= 2;\n    for (int d = 2; (long long)d * d <= n; d++) {\n        if (n % d == 0) { prime = 0; break; }\n    }\n    printf(prime ? "Prime\\n" : "Not prime\\n");\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "7", expected: "Prime" },
          { stdin: "12", expected: "Not prime" },
          { stdin: "1", expected: "Not prime", hidden: true },
          { stdin: "2", expected: "Prime", hidden: true },
          { stdin: "999983", expected: "Prime", hidden: true },
        ],
      },
    },
  },
  {
    title: "Factorial with a function",
    brief: "Write a function factorial(n) and use it to print n! for the number you read.",
    steps: ["Input: one integer n (0 ≤ n ≤ 20)", "Output: n! (use unsigned long long; 0! is 1)", "Write the calculation in a separate function named factorial"],
    level: "intermediate",
    editor: "c",
    starter: `${inc}\n// Write: unsigned long long factorial(int n)\n\nint main(void) {\n    int n;\n    scanf("%d", &n);\n\n    // Call factorial and print the result\n\n    return 0;\n}\n`,
    solution: `${inc}\nunsigned long long factorial(int n) {\n    unsigned long long f = 1;\n    for (int i = 2; i <= n; i++) f *= i;\n    return f;\n}\n\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    printf("%llu\\n", factorial(n));\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "5", expected: "120" },
          { stdin: "10", expected: "3628800" },
          { stdin: "0", expected: "1", hidden: true },
          { stdin: "20", expected: "2432902008176640000", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\bfactorial\s*\(\s*(int|long|unsigned)[^)]*\)\s*\{`, message: "Defines a function named factorial" }],
    },
  },
  {
    title: "Bubble sort",
    brief: "Read n integers and print them in ascending order, sorting them yourself with bubble sort.",
    steps: ["Input line 1: n (1 ≤ n ≤ 100); line 2: n integers", "Output: the sorted numbers on one line, separated by single spaces", "Do not use the library qsort function; swap neighbours in nested loops"],
    level: "advanced",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int n, a[100];\n    scanf("%d", &n);\n    for (int i = 0; i < n; i++) scanf("%d", &a[i]);\n\n    // Sort a[] with bubble sort, then print it\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int n, a[100];\n    scanf("%d", &n);\n    for (int i = 0; i < n; i++) scanf("%d", &a[i]);\n    for (int i = 0; i < n - 1; i++) {\n        for (int j = 0; j < n - 1 - i; j++) {\n            if (a[j] > a[j + 1]) {\n                int t = a[j];\n                a[j] = a[j + 1];\n                a[j + 1] = t;\n            }\n        }\n    }\n    for (int i = 0; i < n; i++) printf(i ? " %d" : "%d", a[i]);\n    printf("\\n");\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "5\n5 2 9 1 3", expected: "1 2 3 5 9" },
          { stdin: "4\n-1 10 0 -7", expected: "-7 -1 0 10" },
          { stdin: "1\n8", expected: "8", hidden: true },
          { stdin: "6\n3 3 1 2 1 3", expected: "1 1 2 3 3 3", hidden: true },
        ],
      },
      rules: [
        { notMatch: String.raw`\bqsort\s*\(`, message: "Does not use qsort" },
        { match: String.raw`for\s*\([^)]*\)[\s\S]*for\s*\(`, message: "Uses nested loops" },
      ],
    },
  },
  {
    title: "Matrix transpose",
    brief: "Read a matrix with r rows and c columns and print its transpose (rows become columns).",
    steps: ["Input line 1: r and c (1 ≤ r, c ≤ 10); then r lines with c integers each", "Output: c lines with r integers each, separated by single spaces", "Example: row 1 of the output is column 1 of the input"],
    level: "advanced",
    editor: "c",
    starter: `${inc}\nint main(void) {\n    int r, c, m[10][10];\n    scanf("%d %d", &r, &c);\n    for (int i = 0; i < r; i++)\n        for (int j = 0; j < c; j++)\n            scanf("%d", &m[i][j]);\n\n    // Print the transpose\n\n    return 0;\n}\n`,
    solution: `${inc}\nint main(void) {\n    int r, c, m[10][10];\n    scanf("%d %d", &r, &c);\n    for (int i = 0; i < r; i++)\n        for (int j = 0; j < c; j++)\n            scanf("%d", &m[i][j]);\n    for (int j = 0; j < c; j++) {\n        for (int i = 0; i < r; i++) printf(i ? " %d" : "%d", m[i][j]);\n        printf("\\n");\n    }\n    return 0;\n}\n`,
    check: {
      run: {
        language: "c",
        tests: [
          { stdin: "2 3\n1 2 3\n4 5 6", expected: "1 4\n2 5\n3 6" },
          { stdin: "2 2\n1 2\n3 4", expected: "1 3\n2 4" },
          { stdin: "1 4\n9 8 7 6", expected: "9\n8\n7\n6", hidden: true },
          { stdin: "3 1\n5\n-6\n7", expected: "5 -6 7", hidden: true },
        ],
      },
    },
  },
] satisfies ExerciseSeed[];
