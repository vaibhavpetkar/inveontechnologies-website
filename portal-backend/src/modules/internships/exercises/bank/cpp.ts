import type { ExerciseSeed } from "../types.js";

const head = `#include <bits/stdc++.h>\nusing namespace std;\n`;

export default [
  {
    title: "Celsius to Fahrenheit",
    brief: "Read a temperature in Celsius and print it in Fahrenheit with one decimal place.",
    steps: ["Input: one number c (it may have decimals)", "Formula: f = c * 9 / 5 + 32", "Output: f with exactly one digit after the decimal point (use fixed and setprecision(1))"],
    level: "basic",
    editor: "cpp",
    starter: `${head}\nint main() {\n    double c;\n    cin >> c;\n\n    // Convert to Fahrenheit and print with one decimal\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    double c;\n    cin >> c;\n    double f = c * 9 / 5 + 32;\n    cout << fixed << setprecision(1) << f << endl;\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "100", expected: "212.0" },
          { stdin: "37.5", expected: "99.5" },
          { stdin: "0", expected: "32.0", hidden: true },
          { stdin: "-40", expected: "-40.0", hidden: true },
        ],
      },
    },
  },
  {
    title: "Multiplication table",
    brief: "Read a number n and print its multiplication table from 1 to 10.",
    steps: ["Input: one integer n", "Output: 10 lines in the form n x i = result, for i from 1 to 10", "Example line: 3 x 4 = 12"],
    level: "basic",
    editor: "cpp",
    starter: `${head}\nint main() {\n    int n;\n    cin >> n;\n\n    // Print the table with a loop\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    int n;\n    cin >> n;\n    for (int i = 1; i <= 10; i++) {\n        cout << n << " x " << i << " = " << n * i << "\\n";\n    }\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "3", expected: Array.from({ length: 10 }, (_, i) => `3 x ${i + 1} = ${3 * (i + 1)}`).join("\n") },
          { stdin: "7", expected: Array.from({ length: 10 }, (_, i) => `7 x ${i + 1} = ${7 * (i + 1)}`).join("\n") },
          { stdin: "0", expected: Array.from({ length: 10 }, (_, i) => `0 x ${i + 1} = 0`).join("\n"), hidden: true },
          { stdin: "-2", expected: Array.from({ length: 10 }, (_, i) => `-2 x ${i + 1} = ${-2 * (i + 1)}`).join("\n"), hidden: true },
        ],
      },
    },
  },
  {
    title: "Grade from marks",
    brief: "Read a student's marks out of 100 and print the grade.",
    steps: ["Input: one integer m (0 ≤ m ≤ 100)", "Output: A if m ≥ 90, B if m ≥ 75, C if m ≥ 50, otherwise F"],
    level: "basic",
    editor: "cpp",
    starter: `${head}\nint main() {\n    int m;\n    cin >> m;\n\n    // Print A, B, C or F\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    int m;\n    cin >> m;\n    if (m >= 90) cout << "A\\n";\n    else if (m >= 75) cout << "B\\n";\n    else if (m >= 50) cout << "C\\n";\n    else cout << "F\\n";\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "95", expected: "A" },
          { stdin: "60", expected: "C" },
          { stdin: "75", expected: "B", hidden: true },
          { stdin: "49", expected: "F", hidden: true },
          { stdin: "90", expected: "A", hidden: true },
        ],
      },
    },
  },
  {
    title: "Count digits",
    brief: "Read a non-negative integer and print how many digits it has.",
    steps: ["Input: one integer n (0 ≤ n ≤ 10^18, use long long)", "Output: the number of digits in n (0 has 1 digit)", "Use a loop that divides by 10"],
    level: "basic",
    editor: "cpp",
    starter: `${head}\nint main() {\n    long long n;\n    cin >> n;\n    int digits = 0;\n\n    // Count the digits\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    long long n;\n    cin >> n;\n    int digits = 0;\n    do {\n        digits++;\n        n /= 10;\n    } while (n > 0);\n    cout << digits << endl;\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "12345", expected: "5" },
          { stdin: "7", expected: "1" },
          { stdin: "0", expected: "1", hidden: true },
          { stdin: "1000000000000000000", expected: "19", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\b(for|while)\s*\(`, message: "Uses a loop" }],
    },
  },
  {
    title: "Average with a vector",
    brief: "Read n integers into a vector and print their average with two decimal places.",
    steps: ["Input line 1: n (n ≥ 1); line 2: n integers", "Output: the average with exactly two decimals (fixed, setprecision(2))", "Store the numbers in a std::vector"],
    level: "intermediate",
    editor: "cpp",
    starter: `${head}\nint main() {\n    int n;\n    cin >> n;\n    vector<int> v(n);\n    for (int &x : v) cin >> x;\n\n    // Print the average with two decimals\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    int n;\n    cin >> n;\n    vector<int> v(n);\n    for (int &x : v) cin >> x;\n    long long sum = 0;\n    for (int x : v) sum += x;\n    cout << fixed << setprecision(2) << (double)sum / n << endl;\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "4\n1 2 3 4", expected: "2.50" },
          { stdin: "3\n10 20 30", expected: "20.00" },
          { stdin: "1\n-7", expected: "-7.00", hidden: true },
          { stdin: "3\n1 1 2", expected: "1.33", hidden: true },
        ],
      },
      rules: [{ match: String.raw`vector\s*<`, message: "Uses a std::vector" }],
    },
  },
  {
    title: "Reverse the words",
    brief: "Read a line of words and print the words in reverse order.",
    steps: ["Input: one line of words separated by spaces", "Output: the same words in reverse order, separated by single spaces", "Tip: read the line with getline, then split it with a stringstream"],
    level: "intermediate",
    editor: "cpp",
    starter: `${head}\nint main() {\n    string line;\n    getline(cin, line);\n\n    // Print the words in reverse order\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    string line, w;\n    getline(cin, line);\n    stringstream ss(line);\n    vector<string> words;\n    while (ss >> w) words.push_back(w);\n    for (int i = (int)words.size() - 1; i >= 0; i--) {\n        cout << words[i];\n        if (i > 0) cout << " ";\n    }\n    cout << endl;\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "I love C plus plus", expected: "plus plus C love I" },
          { stdin: "hello world", expected: "world hello" },
          { stdin: "single", expected: "single", hidden: true },
          { stdin: "  extra   spaces  here ", expected: "here spaces extra", hidden: true },
        ],
      },
    },
  },
  {
    title: "Letter frequency with map",
    brief: "Read a lowercase word and print how many times each letter appears, in alphabetical order.",
    steps: ["Input: one word of lowercase letters", "Output: one line per distinct letter, in alphabetical order, in the form letter count (e.g. a 2)", "Use a std::map<char, int>"],
    level: "intermediate",
    editor: "cpp",
    starter: `${head}\nint main() {\n    string s;\n    cin >> s;\n\n    // Count each letter with a map and print the counts\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    string s;\n    cin >> s;\n    map<char, int> freq;\n    for (char c : s) freq[c]++;\n    for (auto &p : freq) cout << p.first << " " << p.second << "\\n";\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "banana", expected: "a 3\nb 1\nn 2" },
          { stdin: "hello", expected: "e 1\nh 1\nl 2\no 1" },
          { stdin: "z", expected: "z 1", hidden: true },
          { stdin: "mississippi", expected: "i 4\nm 1\np 2\ns 4", hidden: true },
        ],
      },
      rules: [{ match: String.raw`map\s*<\s*char\s*,\s*int\s*>`, message: "Uses a map<char, int>" }],
    },
  },
  {
    title: "Remove duplicates",
    brief: "Read n integers and print each value once, in the order it first appeared.",
    steps: ["Input line 1: n; line 2: n integers", "Output: the numbers without repeats, keeping the order of first appearance, separated by single spaces", "Tip: a std::set can remember which numbers you have already printed"],
    level: "intermediate",
    editor: "cpp",
    starter: `${head}\nint main() {\n    int n;\n    cin >> n;\n    vector<int> v(n);\n    for (int &x : v) cin >> x;\n\n    // Print the unique values in order of first appearance\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    int n;\n    cin >> n;\n    vector<int> v(n);\n    for (int &x : v) cin >> x;\n    set<int> seen;\n    vector<int> out;\n    for (int x : v) {\n        if (!seen.count(x)) {\n            seen.insert(x);\n            out.push_back(x);\n        }\n    }\n    for (size_t i = 0; i < out.size(); i++) cout << (i ? " " : "") << out[i];\n    cout << endl;\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "7\n4 2 4 1 2 9 1", expected: "4 2 1 9" },
          { stdin: "3\n5 6 7", expected: "5 6 7" },
          { stdin: "5\n3 3 3 3 3", expected: "3", hidden: true },
          { stdin: "6\n-1 0 -1 2 0 2", expected: "-1 0 2", hidden: true },
        ],
      },
    },
  },
  {
    title: "Rectangle class",
    brief: "Write a Rectangle class with area() and perimeter() methods, then use it for each rectangle you read.",
    steps: ["Input line 1: n; then n lines with width and height (integers)", "Output: for each rectangle one line: area perimeter (e.g. 12 14)", "Last line: Largest: k, where k is the 1-based number of the rectangle with the biggest area (the first one if tied)", "Define class Rectangle with the methods area() and perimeter()"],
    level: "advanced",
    editor: "cpp",
    starter: `${head}\n// Define class Rectangle here\n\nint main() {\n    int n;\n    cin >> n;\n\n    // Read each rectangle, print area and perimeter, then the largest\n\n    return 0;\n}\n`,
    solution: `${head}\nclass Rectangle {\n    int w, h;\npublic:\n    Rectangle(int w, int h) : w(w), h(h) {}\n    int area() const { return w * h; }\n    int perimeter() const { return 2 * (w + h); }\n};\n\nint main() {\n    int n;\n    cin >> n;\n    int best = 0, bestArea = -1;\n    for (int i = 1; i <= n; i++) {\n        int w, h;\n        cin >> w >> h;\n        Rectangle r(w, h);\n        cout << r.area() << " " << r.perimeter() << "\\n";\n        if (r.area() > bestArea) {\n            bestArea = r.area();\n            best = i;\n        }\n    }\n    cout << "Largest: " << best << "\\n";\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "2\n3 4\n5 5", expected: "12 14\n25 20\nLargest: 2" },
          { stdin: "3\n10 2\n1 1\n4 4", expected: "20 24\n1 4\n16 16\nLargest: 1" },
          { stdin: "1\n7 3", expected: "21 20\nLargest: 1", hidden: true },
          { stdin: "3\n2 6\n3 4\n6 2", expected: "12 16\n12 14\n12 16\nLargest: 1", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\bclass\s+Rectangle\b`, message: "Defines class Rectangle" },
        { match: String.raw`\barea\s*\(\s*\)\s*(const\s*)?\{`, message: "Has an area() method" },
        { match: String.raw`\bperimeter\s*\(\s*\)\s*(const\s*)?\{`, message: "Has a perimeter() method" },
      ],
    },
  },
  {
    title: "Balanced brackets",
    brief: "Read a string of brackets and print whether every bracket is closed in the right order, using a stack.",
    steps: ["Input: one line containing only the characters ( ) [ ] { }", "Output: Balanced or Not balanced", "Use std::stack: push opening brackets, pop and compare on closing ones"],
    level: "advanced",
    editor: "cpp",
    starter: `${head}\nint main() {\n    string s;\n    getline(cin, s);\n\n    // Check the brackets with a stack\n\n    return 0;\n}\n`,
    solution: `${head}\nint main() {\n    string s;\n    getline(cin, s);\n    stack<char> st;\n    bool ok = true;\n    for (char c : s) {\n        if (c == '(' || c == '[' || c == '{') st.push(c);\n        else if (c == ')' || c == ']' || c == '}') {\n            char want = c == ')' ? '(' : c == ']' ? '[' : '{';\n            if (st.empty() || st.top() != want) { ok = false; break; }\n            st.pop();\n        }\n    }\n    if (!st.empty()) ok = false;\n    cout << (ok ? "Balanced" : "Not balanced") << endl;\n    return 0;\n}\n`,
    check: {
      run: {
        language: "cpp",
        tests: [
          { stdin: "{[()]}", expected: "Balanced" },
          { stdin: "([)]", expected: "Not balanced" },
          { stdin: "((()", expected: "Not balanced", hidden: true },
          { stdin: "())", expected: "Not balanced", hidden: true },
          { stdin: "()[]{}(())", expected: "Balanced", hidden: true },
        ],
      },
      rules: [{ match: String.raw`stack\s*<\s*char\s*>`, message: "Uses a stack<char>" }],
    },
  },
] satisfies ExerciseSeed[];
