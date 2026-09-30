import type { PracticeUnit } from "../../types.js";
import { cppq, has, usesLoop } from "./shared.js";

export const control: PracticeUnit = {
  key: "control",
  title: "Control flow: decisions and loops",
  summary: "if, else if, switch, the ternary operator, for, while and do-while loops, break and continue, and number patterns",
  reading: String.raw`## Making decisions with if

A condition is any expression that is true or false. Comparison operators are == != < > <= >=, and conditions combine with && (and), || (or) and ! (not).

` + "```cpp" + String.raw`
if (marks >= 90) {
    cout << "A\n";
} else if (marks >= 75) {
    cout << "B\n";
} else {
    cout << "C\n";
}
` + "```" + String.raw`

- The first true branch runs and the rest are skipped, so order the conditions from the strictest to the loosest.
- if (x = 5) assigns 5 and is always true. Compare with ==. g++ with -Wall warns about this; the reviewer does too.
- A ; right after if (...) ends the if: the block below it then always runs.
- && and || short-circuit: in if (b != 0 && a % b == 0) the division never runs when b is 0.

The ternary operator is a small if that produces a value: string kind = (n % 2 == 0) ? "Even" : "Odd";

## switch

switch compares one integer or char value with fixed cases:

` + "```cpp" + String.raw`
switch (op) {
    case '+': cout << a + b; break;
    case '-': cout << a - b; break;
    default:  cout << "Unknown operator";
}
` + "```" + String.raw`

Without break, execution "falls through" into the next case. switch does not work on strings or doubles: use if / else if for those.

## Loops

- for (int i = 1; i <= n; i++) { ... } when you know how many times to repeat.
- while (n > 0) { ... } when you repeat until something changes, like peeling digits off a number.
- do { ... } while (choice != 0); runs the body at least once, handy for menus.

` + "```cpp" + String.raw`
int n = 1234, sum = 0;
while (n > 0) {
    sum += n % 10;   // last digit
    n /= 10;         // drop the last digit
}
` + "```" + String.raw`

break leaves the loop immediately; continue skips to the next round. A loop variable declared in the for header (int i) exists only inside the loop.

## Nested loops and patterns

For patterns, the outer loop picks the row and the inner loop prints the items of that row. Work out how many items row i has (often i, or n - i + 1) before writing any code.

` + "```cpp" + String.raw`
for (int i = 1; i <= n; i++) {
    for (int j = 1; j <= i; j++) {
        cout << j << (j < i ? " " : "");
    }
    cout << "\n";
}
` + "```" + String.raw`

## Classic loop problems

- Prime check: n is prime when n >= 2 and no d from 2 while d * d <= n divides it. Checking up to the square root is enough and much faster than going to n.
- GCD by Euclid: while (b != 0) { int t = a % b; a = b; b = t; } leaves the GCD in a. The LCM is a / gcd * b (divide first to avoid overflow).
- Fibonacci: keep the last two terms in variables and move them forward each round.
- Leap year: divisible by 400, or divisible by 4 but not by 100.

## Common mistakes

- Off-by-one errors: < n versus <= n. Trace the loop by hand for n = 1.
- Forgetting to update the loop variable, so while never ends. The checker stops programs after 5 seconds.
- Starting a sum at garbage instead of 0, or a product at 0 instead of 1.
- Printing inside the loop when the answer should be printed once after it.

## How your assignments are checked

Your program is compiled with g++ and run on the example and hidden inputs, which include edge cases such as 0, 1, negative numbers and the largest values the question allows. For yes/no questions, your last line must contain the right answer only: printing "Prime" when the answer is "Not prime" fails. Pattern questions compare every line exactly, so print only the pattern (trailing spaces are ignored).`,
  questions: [
    cppq("Even or odd", "Read an integer and print whether it is even or odd.", ["Input: one integer (may be negative)", "Output: Even or Odd"], String.raw`#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << (n % 2 == 0 ? "Even" : "Odd") << "\n";
    return 0;
}
`, [["4", "Even", ["odd"]], ["7", "Odd", ["even"]]], [["0", "Even", ["odd"]], ["-3", "Odd", ["even"]], ["-8", "Even", ["odd"]]]),

    cppq("Largest of three numbers", "Read three integers and print the largest.", ["Input: three integers", "Output: the largest one"], String.raw`#include <iostream>
using namespace std;

int main() {
    int a, b, c;
    cin >> a >> b >> c;
    int largest = a;
    if (b > largest) largest = b;
    if (c > largest) largest = c;
    cout << "Largest: " << largest << "\n";
    return 0;
}
`, [["3 9 5", "9"], ["10 2 7", "10"]], [["-5 -2 -9", "-2"], ["4 4 4", "4"], ["1 2 3", "3"]]),

    cppq("Grade from marks", "Read marks out of 100 and print the grade: 90 and above A, 75 to 89 B, 60 to 74 C, 40 to 59 D, below 40 F. Marks below 0 or above 100 are Invalid.", ["Input: one integer", "Output: the grade letter, or Invalid"], String.raw`#include <iostream>
using namespace std;

int main() {
    int marks;
    cin >> marks;
    if (marks < 0 || marks > 100) {
        cout << "Invalid\n";
    } else if (marks >= 90) {
        cout << "Grade: A\n";
    } else if (marks >= 75) {
        cout << "Grade: B\n";
    } else if (marks >= 60) {
        cout << "Grade: C\n";
    } else if (marks >= 40) {
        cout << "Grade: D\n";
    } else {
        cout << "Grade: F\n";
    }
    return 0;
}
`, [["95", "A"], ["62", "C"]], [["75", "B"], ["40", "D"], ["39", "F"], ["101", "Invalid"], ["-1", "Invalid"]]),

    cppq("Calculator with switch", "Read an expression like 8 * 3 (two integers with an operator between them) and print the result. Support + - * / and %. For / and % by zero print Cannot divide by zero; for any other operator print Unknown operator.", ["Input: integer, operator character, integer", "Output: the result (integer division for /), or one of the two messages"], String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    char op;
    cin >> a >> op >> b;
    switch (op) {
        case '+':
            cout << a + b << "\n";
            break;
        case '-':
            cout << a - b << "\n";
            break;
        case '*':
            cout << a * b << "\n";
            break;
        case '/':
        case '%':
            if (b == 0) cout << "Cannot divide by zero\n";
            else cout << (op == '/' ? a / b : a % b) << "\n";
            break;
        default:
            cout << "Unknown operator\n";
    }
    return 0;
}
`, [["8 * 3", "24"], ["17 % 5", "2"]], [["7 / 2", "3"], ["9 / 0", "Cannot divide by zero"], ["5 ^ 2", "Unknown operator"], ["-4 - 6", "-10"]], { level: "intermediate", rules: [has(String.raw`\bswitch\s*\(`, "Uses a switch statement")] }),

    cppq("Leap year", "Read a year and print whether it is a leap year. A year is a leap year when it is divisible by 400, or divisible by 4 but not by 100.", ["Input: a year", "Output: Leap year or Not a leap year"], String.raw`#include <iostream>
using namespace std;

int main() {
    int year;
    cin >> year;
    bool leap = (year % 400 == 0) || (year % 4 == 0 && year % 100 != 0);
    cout << (leap ? "Leap year" : "Not a leap year") << "\n";
    return 0;
}
`, [["2024", "Leap year", ["not"]], ["2023", "Not a leap year"]], [["2000", "Leap year", ["not"]], ["1900", "Not a leap year"], ["2100", "Not a leap year"]]),

    cppq("Sum and reverse of digits", "Read a non-negative integer and print the sum of its digits and the number written backwards. Use a while loop that peels off one digit at a time with % 10 and / 10.", ["Input: one integer n >= 0", "Output line 1: the sum of the digits", "Output line 2: the reversed number (leading zeros disappear, so 120 becomes 21)"], String.raw`#include <iostream>
using namespace std;

int main() {
    long long n;
    cin >> n;
    long long sum = 0, reversed = 0;
    do {
        int digit = n % 10;
        sum += digit;
        reversed = reversed * 10 + digit;
        n /= 10;
    } while (n > 0);
    cout << "Sum of digits: " << sum << "\n";
    cout << "Reversed: " << reversed << "\n";
    return 0;
}
`, [["1234", "10 4321"], ["120", "3 21"]], [["0", "0 0"], ["9", "9 9"], ["987654321", "45 123456789"]], { rules: [usesLoop, has(String.raw`%\s*10`, "Takes the last digit with % 10")] }),

    cppq("Prime or not", "Read an integer and print whether it is prime. Only test divisors up to the square root (d * d <= n).", ["Input: one integer n (can be 0, 1 or large, up to 2 billion)", "Output: Prime or Not prime"], String.raw`#include <iostream>
using namespace std;

int main() {
    long long n;
    cin >> n;
    bool prime = n >= 2;
    for (long long d = 2; d * d <= n; d++) {
        if (n % d == 0) {
            prime = false;
            break;
        }
    }
    cout << (prime ? "Prime" : "Not prime") << "\n";
    return 0;
}
`, [["7", "Prime", ["not"]], ["12", "Not prime"]], [["1", "Not prime"], ["2", "Prime", ["not"]], ["2147483647", "Prime", ["not"]], ["1000000007", "Prime", ["not"]], ["999999999", "Not prime"]], { level: "intermediate", rules: [usesLoop] }),

    cppq("Fibonacci series", "Read n and print the first n terms of the Fibonacci series, starting 0 1 1 2 3 5 ...", ["Input: n (1 to 90)", "Output: the n terms separated by spaces", "Use long long: term 90 is bigger than an int"], String.raw`#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    long long a = 0, b = 1;
    for (int i = 0; i < n; i++) {
        cout << a << (i + 1 < n ? " " : "\n");
        long long next = a + b;
        a = b;
        b = next;
    }
    return 0;
}
`, [["7", "0 1 1 2 3 5 8"], ["1", "0"]], [["2", "0 1"], ["12", "0 1 1 2 3 5 8 13 21 34 55 89"], ["90", "0 1 1 2 3 5 8 13 21 34 55 89 144 233 377 610 987 1597 2584 4181 6765 10946 17711 28657 46368 75025 121393 196418 317811 514229 832040 1346269 2178309 3524578 5702887 9227465 14930352 24157817 39088169 63245986 102334155 165580141 267914296 433494437 701408733 1134903170 1836311903 2971215073 4807526976 7778742049 12586269025 20365011074 32951280099 53316291173 86267571272 139583862445 225851433717 365435296162 591286729879 956722026041 1548008755920 2504730781961 4052739537881 6557470319842 10610209857723 17167680177565 27777890035288 44945570212853 72723460248141 117669030460994 190392490709135 308061521170129 498454011879264 806515533049393 1304969544928657 2111485077978050 3416454622906707 5527939700884757 8944394323791464 14472334024676221 23416728348467685 37889062373143906 61305790721611591 99194853094755497 160500643816367088 259695496911122585 420196140727489673 679891637638612258 1100087778366101931 1779979416004714189"]], { level: "intermediate", rules: [usesLoop] }),

    cppq("GCD and LCM", "Read two positive integers and print their greatest common divisor (Euclid's algorithm with a loop) and their least common multiple.", ["Input: two positive integers a and b", "Output line 1: GCD", "Output line 2: LCM (compute it as a / gcd * b to avoid overflow)"], String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    long long x = a, y = b;
    while (y != 0) {
        long long rest = x % y;
        x = y;
        y = rest;
    }
    cout << "GCD: " << x << "\n";
    cout << "LCM: " << a / x * b << "\n";
    return 0;
}
`, [["12 18", "6 36"], ["7 5", "1 35"]], [["100 25", "25 100"], ["1 1", "1 1"], ["1000000 999999", "1 999999000000"]], { level: "intermediate", rules: [usesLoop] }),

    cppq("Number triangle", "Read n and print a triangle of numbers: row i contains the numbers 1 to i separated by single spaces.", ["Input: n (1 to 20)", "Output: only the n rows, e.g. for n = 3:", "1", "1 2", "1 2 3"], String.raw`#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++) {
            cout << j << (j < i ? " " : "");
        }
        cout << "\n";
    }
    return 0;
}
`, [["3", "1\n1 2\n1 2 3"], ["1", "1"]], [["5", "1\n1 2\n1 2 3\n1 2 3 4\n1 2 3 4 5"], ["2", "1\n1 2"]], { match: "exact", rules: [has(String.raw`\bfor\s*\([^)]*\)[\s\S]*\bfor\s*\(`, "Uses nested loops")] }),
  ],
  quiz: [
    { q: "Which operator checks whether two values are equal?", options: ["=", "==", "===", "equals"], answer: 1, why: "== compares; = assigns. C++ has no ===." },
    { q: "What is printed?\n\nint x = 10;\nif (x > 5 && x < 8) cout << \"A\"; else cout << \"B\";", options: ["A", "B", "AB", "Nothing"], answer: 1, why: "x < 8 is false, so the whole && condition is false and the else branch runs." },
    { q: "Which type can NOT be used as a switch value?", options: ["int", "char", "string", "long long"], answer: 2, why: "switch works on integer-like types (including char and enums); strings need if / else if." },
    { q: "Which loop always runs its body at least once?", options: ["for", "while", "do-while", "range-based for"], answer: 2, why: "do-while checks the condition after the body." },
    { q: "How many times does this print Hi?\n\nfor (int i = 0; i < 5; i += 2) cout << \"Hi\";", options: ["2", "3", "5", "Forever"], answer: 1, why: "i takes the values 0, 2 and 4, so the body runs 3 times." },
    { q: "What does continue do inside a loop?", options: ["Exits the loop", "Skips the rest of this round and starts the next one", "Restarts the loop from the beginning", "Exits the program"], answer: 1, why: "break leaves the loop; continue jumps to the next iteration." },
    { q: "What does the ternary expression (n > 0 ? \"pos\" : \"non-pos\") give when n is 0?", options: ["pos", "non-pos", "0", "Compile error"], answer: 1, why: "0 > 0 is false, so the value after the colon is chosen." },
    { q: "What is printed?\n\nint x = 3;\nswitch (x) {\n  case 3: cout << \"three \";\n  case 4: cout << \"four \";\n  default: cout << \"other\";\n}", options: ["three", "three four", "three four other", "other"], answer: 2, why: "There is no break, so execution falls through from case 3 into every later label." },
    { q: "What does this code print?\n\nint i = 0;\nwhile (i < 3);\n{\n  cout << i;\n  i++;\n}", options: ["012", "0", "Nothing, it loops forever", "123"], answer: 2, why: "The ; after while (i < 3) is an empty loop body; i never changes, so the loop never ends." },
    { q: "To test whether n is prime you loop d from 2 while d * d <= n. Why is that enough?", options: ["Primes are always odd", "If n has a divisor bigger than its square root, it also has one smaller than it", "Because d * d overflows otherwise", "It isn't enough; you must go up to n - 1"], answer: 1, why: "Divisors come in pairs d and n / d, and one of each pair is at most the square root of n." },
  ],
};
