import type { ExerciseSeed } from "../types.js";

const imp = `import java.util.*;\n`;

const main = (body: string) => `${imp}\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n${body}    }\n}\n`;

export default [
  {
    title: "Greeting with age",
    brief: "Read a name and an age and print a greeting that says how old the person will be next year.",
    steps: ["Input line 1: a name (one word); line 2: an integer age", "Output: Hello <name>, next year you will be <age + 1>."],
    level: "basic",
    editor: "java",
    starter: main(`        String name = sc.next();\n        int age = sc.nextInt();\n\n        // Print the greeting\n`),
    solution: main(`        String name = sc.next();\n        int age = sc.nextInt();\n        System.out.println("Hello " + name + ", next year you will be " + (age + 1) + ".");\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "Asha\n20", expected: "Hello Asha, next year you will be 21." },
          { stdin: "Ravi\n9", expected: "Hello Ravi, next year you will be 10." },
          { stdin: "Baby\n0", expected: "Hello Baby, next year you will be 1.", hidden: true },
          { stdin: "Meera\n99", expected: "Hello Meera, next year you will be 100.", hidden: true },
        ],
      },
    },
  },
  {
    title: "Positive, negative or zero",
    brief: "Read an integer and print whether it is positive, negative or zero.",
    steps: ["Input: one integer n", "Output: Positive, Negative or Zero"],
    level: "basic",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n\n        // Print Positive, Negative or Zero\n`),
    solution: main(`        int n = sc.nextInt();\n        if (n > 0) System.out.println("Positive");\n        else if (n < 0) System.out.println("Negative");\n        else System.out.println("Zero");\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "15", expected: "Positive" },
          { stdin: "-8", expected: "Negative" },
          { stdin: "0", expected: "Zero", hidden: true },
          { stdin: "-2147483648", expected: "Negative", hidden: true },
        ],
      },
    },
  },
  {
    title: "Sum of even numbers",
    brief: "Read n and print the sum of all even numbers from 1 to n, using a loop.",
    steps: ["Input: one integer n (0 ≤ n ≤ 100000)", "Output: 2 + 4 + ... up to n (use long, the sum can be large)", "Use a for or while loop"],
    level: "basic",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        long sum = 0;\n\n        // Add the even numbers from 1 to n\n`),
    solution: main(`        int n = sc.nextInt();\n        long sum = 0;\n        for (int i = 2; i <= n; i += 2) sum += i;\n        System.out.println(sum);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "10", expected: "30" },
          { stdin: "7", expected: "12" },
          { stdin: "1", expected: "0", hidden: true },
          { stdin: "100000", expected: "2500050000", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\b(for|while)\s*\(`, message: "Uses a for or while loop" }],
    },
  },
  {
    title: "Reverse a number",
    brief: "Read a positive integer and print its digits in reverse order as a number.",
    steps: ["Input: one integer n (1 ≤ n ≤ 1000000000)", "Output: the reversed number; leading zeros disappear (1200 becomes 21)", "Use % 10 and / 10 in a loop"],
    level: "basic",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        long rev = 0;\n\n        // Build the reversed number\n`),
    solution: main(`        int n = sc.nextInt();\n        long rev = 0;\n        while (n > 0) {\n            rev = rev * 10 + n % 10;\n            n /= 10;\n        }\n        System.out.println(rev);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "12345", expected: "54321" },
          { stdin: "1200", expected: "21" },
          { stdin: "7", expected: "7", hidden: true },
          { stdin: "1000000009", expected: "9000000001", hidden: true },
        ],
      },
      rules: [{ notMatch: String.raw`\.reverse\s*\(`, message: "Does not use StringBuilder.reverse()" }],
    },
  },
  {
    title: "Largest element and index",
    brief: "Read n integers into an array and print the largest value and the index where it first appears.",
    steps: ["Input line 1: n (n ≥ 1); line 2: n integers", "Output: Max <value> at index <i> (indexes start at 0; if the max repeats, use the first one)"],
    level: "intermediate",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        int[] a = new int[n];\n        for (int i = 0; i < n; i++) a[i] = sc.nextInt();\n\n        // Find the max and its index\n`),
    solution: main(`        int n = sc.nextInt();\n        int[] a = new int[n];\n        for (int i = 0; i < n; i++) a[i] = sc.nextInt();\n        int best = 0;\n        for (int i = 1; i < n; i++) if (a[i] > a[best]) best = i;\n        System.out.println("Max " + a[best] + " at index " + best);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "5\n3 8 1 8 2", expected: "Max 8 at index 1" },
          { stdin: "3\n10 20 5", expected: "Max 20 at index 1" },
          { stdin: "1\n-4", expected: "Max -4 at index 0", hidden: true },
          { stdin: "4\n-9 -3 -7 -3", expected: "Max -3 at index 1", hidden: true },
        ],
      },
    },
  },
  {
    title: "Count letters, digits, spaces",
    brief: "Read a line of text and count its letters, digits and spaces.",
    steps: ["Input: one line of text", "Output line 1: Letters: <count>", "Output line 2: Digits: <count>", "Output line 3: Spaces: <count> (tip: Character.isLetter and Character.isDigit)"],
    level: "intermediate",
    editor: "java",
    starter: main(`        String line = sc.hasNextLine() ? sc.nextLine() : "";\n        int letters = 0, digits = 0, spaces = 0;\n\n        // Count each kind of character\n`),
    solution: main(`        String line = sc.hasNextLine() ? sc.nextLine() : "";\n        int letters = 0, digits = 0, spaces = 0;\n        for (char c : line.toCharArray()) {\n            if (Character.isLetter(c)) letters++;\n            else if (Character.isDigit(c)) digits++;\n            else if (c == ' ') spaces++;\n        }\n        System.out.println("Letters: " + letters);\n        System.out.println("Digits: " + digits);\n        System.out.println("Spaces: " + spaces);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "Java 13 is here", expected: "Letters: 10\nDigits: 2\nSpaces: 3" },
          { stdin: "abc123", expected: "Letters: 3\nDigits: 3\nSpaces: 0" },
          { stdin: "!!! ???", expected: "Letters: 0\nDigits: 0\nSpaces: 1", hidden: true },
          { stdin: "Room 404, Floor 2", expected: "Letters: 9\nDigits: 4\nSpaces: 3", hidden: true },
        ],
      },
    },
  },
  {
    title: "Fibonacci series",
    brief: "Read n and print the first n numbers of the Fibonacci series.",
    steps: ["Input: one integer n (1 ≤ n ≤ 90)", "The series starts 0 1 and each next number is the sum of the two before it", "Output: the first n numbers on one line, separated by single spaces (use long)"],
    level: "intermediate",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n\n        // Print the first n Fibonacci numbers\n`),
    solution: main(`        int n = sc.nextInt();\n        long a = 0, b = 1;\n        StringBuilder sb = new StringBuilder();\n        for (int i = 0; i < n; i++) {\n            if (i > 0) sb.append(' ');\n            sb.append(a);\n            long next = a + b;\n            a = b;\n            b = next;\n        }\n        System.out.println(sb);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "5", expected: "0 1 1 2 3" },
          { stdin: "10", expected: "0 1 1 2 3 5 8 13 21 34" },
          { stdin: "1", expected: "0", hidden: true },
          { stdin: "2", expected: "0 1", hidden: true },
          { stdin: "90", expected: fib(90), hidden: true },
        ],
      },
    },
  },
  {
    title: "Palindrome string",
    brief: "Read a word and print whether it reads the same forwards and backwards, ignoring upper and lower case.",
    steps: ["Input: one word", "Output: Palindrome or Not palindrome", "Compare case-insensitively (Madam is a palindrome)"],
    level: "intermediate",
    editor: "java",
    starter: main(`        String s = sc.next();\n\n        // Check the word from both ends\n`),
    solution: main(`        String s = sc.next().toLowerCase();\n        boolean ok = true;\n        for (int i = 0, j = s.length() - 1; i < j; i++, j--) {\n            if (s.charAt(i) != s.charAt(j)) { ok = false; break; }\n        }\n        System.out.println(ok ? "Palindrome" : "Not palindrome");\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "Madam", expected: "Palindrome" },
          { stdin: "java", expected: "Not palindrome" },
          { stdin: "a", expected: "Palindrome", hidden: true },
          { stdin: "abBA", expected: "Palindrome", hidden: true },
          { stdin: "abca", expected: "Not palindrome", hidden: true },
        ],
      },
    },
  },
  {
    title: "Student result class",
    brief: "Write a Student class that stores a name and three marks, and use it to print each student's total and result.",
    steps: ["Input line 1: n; then n lines: name mark1 mark2 mark3", "Output per student: <name> <total> PASS if total is at least 120, otherwise <name> <total> FAIL", "Define class Student with a constructor and a method total()"],
    level: "advanced",
    editor: "java",
    starter: `${imp}\n// Define class Student here\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n\n        // Read each student and print the result\n    }\n}\n`,
    solution: `${imp}\nclass Student {\n    private final String name;\n    private final int[] marks;\n\n    Student(String name, int m1, int m2, int m3) {\n        this.name = name;\n        this.marks = new int[] { m1, m2, m3 };\n    }\n\n    int total() {\n        int t = 0;\n        for (int m : marks) t += m;\n        return t;\n    }\n\n    String result() {\n        return name + " " + total() + (total() >= 120 ? " PASS" : " FAIL");\n    }\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        for (int i = 0; i < n; i++) {\n            Student s = new Student(sc.next(), sc.nextInt(), sc.nextInt(), sc.nextInt());\n            System.out.println(s.result());\n        }\n    }\n}\n`,
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "2\nAsha 50 60 70\nRavi 30 40 20", expected: "Asha 180 PASS\nRavi 90 FAIL" },
          { stdin: "1\nKiran 100 100 100", expected: "Kiran 300 PASS" },
          { stdin: "2\nEdge 40 40 40\nJust 40 40 39", expected: "Edge 120 PASS\nJust 119 FAIL", hidden: true },
          { stdin: "1\nZero 0 0 0", expected: "Zero 0 FAIL", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\bclass\s+Student\b`, message: "Defines class Student" },
        { match: String.raw`\bStudent\s*\([^)]*String\s+\w+`, message: "Student has a constructor that takes the name" },
        { match: String.raw`\btotal\s*\(\s*\)\s*\{`, message: "Student has a total() method" },
      ],
    },
  },
  {
    title: "Matrix multiplication",
    brief: "Read two square matrices of size n and print their product.",
    steps: ["Input line 1: n (1 ≤ n ≤ 10); then n lines of matrix A; then n lines of matrix B", "Output: n lines of A × B, numbers separated by single spaces", "C[i][j] is the sum of A[i][k] * B[k][j] over k"],
    level: "advanced",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        int[][] a = new int[n][n], b = new int[n][n];\n        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) a[i][j] = sc.nextInt();\n        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) b[i][j] = sc.nextInt();\n\n        // Multiply and print the result\n`),
    solution: main(`        int n = sc.nextInt();\n        int[][] a = new int[n][n], b = new int[n][n];\n        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) a[i][j] = sc.nextInt();\n        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) b[i][j] = sc.nextInt();\n        for (int i = 0; i < n; i++) {\n            StringBuilder row = new StringBuilder();\n            for (int j = 0; j < n; j++) {\n                long c = 0;\n                for (int k = 0; k < n; k++) c += (long) a[i][k] * b[k][j];\n                if (j > 0) row.append(' ');\n                row.append(c);\n            }\n            System.out.println(row);\n        }\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "2\n1 2\n3 4\n5 6\n7 8", expected: "19 22\n43 50" },
          { stdin: "2\n1 0\n0 1\n9 8\n7 6", expected: "9 8\n7 6" },
          { stdin: "1\n-3\n4", expected: "-12", hidden: true },
          { stdin: "3\n1 2 3\n4 5 6\n7 8 9\n1 0 0\n0 0 1\n0 1 0", expected: "1 3 2\n4 6 5\n7 9 8", hidden: true },
        ],
      },
    },
  },
] satisfies ExerciseSeed[];

function fib(n: number): string {
  const out: bigint[] = [];
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < n; i++) {
    out.push(a);
    [a, b] = [b, a + b];
  }
  return out.join(" ");
}
