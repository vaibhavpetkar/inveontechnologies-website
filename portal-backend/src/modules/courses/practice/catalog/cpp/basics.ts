import type { PracticeUnit } from "../../types.js";
import { cppq, has } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "Basics: cin, cout, types and operators",
  summary: "your first C++ program, cout and cin, data types, getline, operators, casting and formatted output with iomanip",
  reading: String.raw`## Your first C++ program

C++ grew out of C, so a lot will look familiar, but input and output work differently. Instead of printf and scanf you use the stream objects cout (console output) and cin (console input) from the iostream header.

` + "```cpp" + String.raw`
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, Inveon!" << endl;
    return 0;
}
` + "```" + String.raw`

- #include <iostream> gives you cout and cin. Modern headers have no .h: iostream.h is from the old Turbo C++ days and does not compile with g++.
- Everything in the standard library lives in the namespace std. using namespace std; lets you write cout instead of std::cout. In big projects people prefer std::cout, but for practice programs both are fine.
- main must return int. void main() is a compile error in C++.
- << "sends" values into cout, one after another. endl prints a newline and flushes; "\n" prints a newline without flushing and is a little faster.

## Data types

- int: whole numbers up to about 2.1 billion (2^31 - 1).
- long long: whole numbers up to about 9.2 x 10^18. Use it for products, factorials and big sums.
- double: decimal numbers with about 15 significant digits. Prefer it over float.
- char: one character in single quotes, 'A'. Internally it is a small number (its ASCII code).
- bool: true or false. cout prints them as 1 and 0 unless you use boolalpha.
- string: text, from the string header. Unlike C char arrays, a string grows by itself and can be compared with ==.
- auto lets the compiler pick the type from the value: auto total = 0LL; makes a long long.
- const double PI = 3.14159265358979; creates a value that can't change.

## Reading input with cin

` + "```cpp" + String.raw`
int age;
string city;
cin >> age >> city;       // reads "21 Pune"
` + "```" + String.raw`

cin >> skips spaces and newlines and stops at the next space, so it reads one word at a time. No & is needed: cin knows where your variables are. To read a whole line with spaces, use getline:

` + "```cpp" + String.raw`
int age;
string fullName;
cin >> age;
getline(cin >> ws, fullName);   // ws skips the leftover newline
` + "```" + String.raw`

This is the most common C++ input bug: after cin >> age, the Enter key is still waiting in the input, so a plain getline returns an empty string. cin >> ws (or cin.ignore()) throws that newline away first.

## Operators and casting

- + - * / % work like in C. 7 / 2 is 3 because both are ints; 7.0 / 2 is 3.5.
- For negative numbers the result of / is cut towards zero: -7 / 2 is -3 and -7 % 2 is -1.
- static_cast<double>(total) / count converts before dividing, so the decimals are kept. This is the C++ way to cast; (double)total also works but is harder to search for.
- int overflow is silent: 100000 * 100000 does not fit in an int and gives garbage. Store the numbers in long long before multiplying.
- A char in arithmetic becomes its code: 'A' + 1 is 66. Cast back with static_cast<char>(66) to get 'B'.

## Formatting output

The iomanip header controls how numbers are printed:

` + "```cpp" + String.raw`
#include <iomanip>
double avg = 84.3333;
cout << fixed << setprecision(2) << avg << "\n";   // 84.33
cout << setw(2) << setfill('0') << 5 << "\n";       // 05
` + "```" + String.raw`

fixed and setprecision stay in force for every later number. setw applies only to the very next value, so repeat it for each field.

## Common mistakes

- Writing cin << x or cout >> x. The arrows point in the direction the data flows: into cin's variable (>>), out to cout (<<).
- Using int for money, big products or averages.
- Forgetting #include <iomanip> for setprecision, or <cmath> for sqrt and pow.
- Mixing cin >> and getline without ws.

## How your assignments are checked

Upload one .cpp file per question. The reviewer reads it line by line (old headers like iostream.h and conio.h, void main, missing semicolons and missing includes are flagged), then compiles it with g++ in C++17 mode and runs it on the example and hidden inputs. Prompts such as "Enter a number:" are fine: the checker looks for the numbers and words of the answer in order. When a question says "print only", match the output exactly.`,
  questions: [
    cppq("Greet by name", "Read a first name and print a greeting.", ["Input: one word, the name", "Output: Hello, <name>! Welcome to C++"], String.raw`#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    cin >> name;
    cout << "Hello, " << name << "! Welcome to C++" << endl;
    return 0;
}
`, [["Asha", "Hello Asha Welcome to C++"], ["Ravi", "Hello Ravi Welcome to C++"]], [["Meena", "Hello Meena Welcome to C++"], ["X", "Hello X Welcome"]], { rules: [has(String.raw`\bcout\s*<<`, "Prints with cout"), has(String.raw`\bcin\s*>>`, "Reads with cin")] }),

    cppq("All five arithmetic operators", "Read two integers a and b (b is never 0) and print a + b, a - b, a * b, a / b and a % b.", ["Input: two integers a and b", "Output: sum, difference, product, integer quotient and remainder, in this order", "Remember that C++ cuts integer division towards zero: -7 / 2 is -3"], String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << "Sum: " << a + b << "\n";
    cout << "Difference: " << a - b << "\n";
    cout << "Product: " << a * b << "\n";
    cout << "Quotient: " << a / b << "\n";
    cout << "Remainder: " << a % b << "\n";
    return 0;
}
`, [["7 2", "9 5 14 3 1"], ["20 5", "25 15 100 4 0"]], [["-7 2", "-5 -9 -14 -3 -1"], ["3 10", "13 -7 30 0 3"]]),

    cppq("Average of three marks", "Read three marks and print their average with exactly 2 digits after the decimal point.", ["Input: three integers", "Output: the average, e.g. 84.33", "Use fixed and setprecision(2) from <iomanip>"], String.raw`#include <iostream>
#include <iomanip>
using namespace std;

int main() {
    int a, b, c;
    cin >> a >> b >> c;
    double average = (a + b + c) / 3.0;
    cout << fixed << setprecision(2) << "Average: " << average << "\n";
    return 0;
}
`, [["78 85 90", "84.33"], ["50 60 70", "60.00"]], [["100 100 99", "99.67"], ["0 0 1", "0.33"]], { rules: [has(String.raw`setprecision\s*\(\s*2\s*\)`, "Uses setprecision(2)")] }),

    cppq("Seconds to a digital clock", "Read a number of seconds (less than 360000) and print it as HH:MM:SS with two digits in every field.", ["Input: one integer, the total seconds", "Output: only the time as HH:MM:SS, e.g. 01:01:05", "Use setw(2) and setfill('0'); remember setw must be repeated for each field"], String.raw`#include <iostream>
#include <iomanip>
using namespace std;

int main() {
    int total;
    cin >> total;
    int hours = total / 3600;
    int minutes = total % 3600 / 60;
    int seconds = total % 60;
    cout << setfill('0') << setw(2) << hours << ":" << setw(2) << minutes << ":" << setw(2) << seconds << "\n";
    return 0;
}
`, [["3665", "01:01:05"], ["45296", "12:34:56"]], [["0", "00:00:00"], ["86399", "23:59:59"], ["359999", "99:59:59"]], { match: "exact", rules: [has(String.raw`\bsetw\s*\(\s*2\s*\)`, "Pads the fields with setw(2)")] }),

    cppq("Full name with getline", "Read a person's age on the first line and their full name (with spaces) on the second line, then print a sentence about next year.", ["Input line 1: the age", "Input line 2: the full name, which may contain spaces", "Output: <full name> will be <age + 1> next year", "Hint: getline(cin >> ws, name) skips the newline left behind by cin >> age"], String.raw`#include <iostream>
#include <string>
using namespace std;

int main() {
    int age;
    string name;
    cin >> age;
    getline(cin >> ws, name);
    cout << name << " will be " << age + 1 << " next year\n";
    return 0;
}
`, [["21\nRavi Kumar Sharma", "Ravi Kumar Sharma will be 22 next year"], ["30\nAsha", "Asha will be 31 next year"]], [["18\nMeena Joshi", "Meena Joshi will be 19"], ["59\nA B C D", "A B C D will be 60"]], { rules: [has(String.raw`\bgetline\s*\(`, "Reads the full line with getline")] }),

    cppq("Notes for an ATM withdrawal", "An ATM has notes of 500, 200, 100, 50, 20 and 10 rupees. Read an amount and print how many notes of each kind to give, using the biggest notes first, and the amount that can't be given (less than 10).", ["Input: the amount (a whole number)", "Output: one line per note in the order 500, 200, 100, 50, 20, 10, like 500 x 3", "Last line: Left over: <rupees>", "Use / and % only, no loops needed"], String.raw`#include <iostream>
using namespace std;

int main() {
    int amount;
    cin >> amount;
    cout << "500 x " << amount / 500 << "\n";
    amount %= 500;
    cout << "200 x " << amount / 200 << "\n";
    amount %= 200;
    cout << "100 x " << amount / 100 << "\n";
    amount %= 100;
    cout << "50 x " << amount / 50 << "\n";
    amount %= 50;
    cout << "20 x " << amount / 20 << "\n";
    amount %= 20;
    cout << "10 x " << amount / 10 << "\n";
    amount %= 10;
    cout << "Left over: " << amount << "\n";
    return 0;
}
`, [["1880", "500 3 200 1 100 1 50 1 20 1 10 1 Left over 0"], ["745", "500 1 200 1 100 0 50 0 20 2 10 0 Left over 5"]], [["9", "500 0 200 0 100 0 50 0 20 0 10 0 Left over 9"], ["3990", "500 7 200 2 100 0 50 1 20 2 10 0 Left over 0"]], { level: "intermediate" }),

    cppq("Compound interest", "Read the principal P, the yearly rate R (percent) and the number of years T. Print the final amount A = P * (1 + R/100)^T and the interest earned A - P, both with 2 decimals.", ["Input: P, R and T (P and R may have decimals, T is whole)", "Output line 1: the amount", "Output line 2: the compound interest", "Use pow from <cmath>"], String.raw`#include <iostream>
#include <iomanip>
#include <cmath>
using namespace std;

int main() {
    double principal, rate;
    int years;
    cin >> principal >> rate >> years;
    double amount = principal * pow(1 + rate / 100, years);
    cout << fixed << setprecision(2);
    cout << "Amount: " << amount << "\n";
    cout << "Interest: " << amount - principal << "\n";
    return 0;
}
`, [["10000 10 2", "12100.00 2100.00"], ["5000 8 3", "6298.56 1298.56"]], [["1000 0 5", "1000.00 0.00"], ["2500.50 12.5 1", "2813.06 312.56"]], { level: "intermediate", rules: [has(String.raw`\bpow\s*\(`, "Uses pow()")] }),

    cppq("Character codes", "Read one character and print its ASCII code and the character that comes after it.", ["Input: a single character (letter or digit)", "Output: the code, then the next character, e.g. for A: ASCII 65, next B", "Use static_cast<int> and static_cast<char>"], String.raw`#include <iostream>
using namespace std;

int main() {
    char ch;
    cin >> ch;
    int code = static_cast<int>(ch);
    char next = static_cast<char>(code + 1);
    cout << "ASCII code: " << code << "\n";
    cout << "Next character: " << next << "\n";
    return 0;
}
`, [["A", "65 B"], ["a", "97 b"]], [["0", "48 1"], ["y", "121 z"], ["M", "77 N"]], { rules: [has(String.raw`static_cast\s*<\s*int\s*>`, "Converts with static_cast<int>")] }),

    cppq("Square without overflow", "Read an integer n (|n| up to 3 billion) and print n squared. An int overflows here, so pick the right type.", ["Input: one integer n", "Output: n * n", "Hint: long long holds numbers up to about 9.2 x 10^18"], String.raw`#include <iostream>
using namespace std;

int main() {
    long long n;
    cin >> n;
    cout << "Square: " << n * n << "\n";
    return 0;
}
`, [["12", "144"], ["100000", "10000000000"]], [["-3000000000", "9000000000000000000"], ["0", "0"], ["46341", "2147488281"]], { level: "intermediate", rules: [has(String.raw`\blong\s+long\b|\bint64_t\b`, "Uses a 64-bit type (long long)")] }),
    cppq("Seconds to hours, minutes and seconds", "Read a number of seconds and print it as hours, minutes and seconds.", ["Input: one integer, the total seconds (0 or more)", "Output: <h> h <m> min <s> s", "Use / and % with 3600 and 60"], String.raw`#include <iostream>
using namespace std;

int main() {
    int total;
    cin >> total;
    int h = total / 3600;
    int m = (total % 3600) / 60;
    int s = total % 60;
    cout << h << " h " << m << " min " << s << " s\n";
    return 0;
}
`, [["3725", "1 h 2 min 5 s"], ["59", "0 h 0 min 59 s"]], [["0", "0 h 0 min 0 s"], ["86399", "23 h 59 min 59 s"], ["7200", "2 h 0 min 0 s"]], { match: "exact", rules: [has(String.raw`%`, "Uses the % operator")] }),
  ],
  quiz: [
    { q: "Which header gives you cout and cin?", options: ["<stdio.h>", "<iostream>", "<iostream.h>", "<conio.h>"], answer: 1, why: "Standard C++ uses <iostream> without .h; iostream.h is pre-standard Turbo C++." },
    { q: "What does using namespace std; do?", options: ["Includes the standard library", "Lets you write cout instead of std::cout", "Makes the program faster", "It is required for main to run"], answer: 1, why: "It brings the names from namespace std into scope; the #include lines are still needed." },
    { q: "Which line reads two integers x and y?", options: ["cin << x << y;", "cin >> x >> y;", "cin >> &x >> &y;", "cout >> x >> y;"], answer: 1, why: "Data flows from cin into the variables, so the arrows point right (>>), and no & is needed." },
    { q: "What does cout << 7 / 2; print?", options: ["3.5", "3", "4", "3.0"], answer: 1, why: "Both operands are ints, so it is integer division and the decimals are dropped." },
    { q: "Which type should hold the value 5000000000 (5 billion)?", options: ["int", "short", "long long", "char"], answer: 2, why: "int stops at about 2.1 billion; long long goes up to about 9.2 x 10^18." },
    { q: "What does cout << 'A' + 2; print?", options: ["C", "A2", "67", "Compile error"], answer: 2, why: "'A' + 2 is int arithmetic on the code 65, giving 67. Cast to char to print C." },
    { q: "Which statement reads a whole line, spaces included, into the string s?", options: ["cin >> s;", "getline(cin, s);", "scanf(\"%s\", s);", "cin.get(s);"], answer: 1, why: "cin >> stops at the first space; getline reads up to the newline." },
    { q: "What does this print?\n\ncout << -7 / 2 << \" \" << -7 % 2;", options: ["-4 1", "-3 -1", "-3 1", "-4 -1"], answer: 1, why: "C++ division truncates towards zero, so -7 / 2 is -3, and the remainder keeps the sign of the left side: -1." },
    { q: "The input is \"21\" on line 1 and \"Asha Rao\" on line 2. The program runs cin >> age; getline(cin, name);. What is name?", options: ["Asha Rao", "Asha", "An empty string", "21"], answer: 2, why: "cin >> leaves the newline after 21 in the input, and getline stops at it immediately. Use getline(cin >> ws, name)." },
    { q: "What does this print?\n\ncout << setw(3) << setfill('0') << 7 << \":\" << 5;", options: ["007:005", "007:5", "7:5", "007:05"], answer: 1, why: "setfill stays set, but setw applies only to the next value (7), so 5 is printed without padding." },
  ],
};
