import type { PracticeUnit } from "../../types.js";
import { cppq, has, hasNot } from "./shared.js";

const defines = (name: string) => has(String.raw`\b\w[\w\s<>:&]*\b${name}\s*\([^;{]*\)\s*\{`, `Defines a function named ${name}`);

export const functions: PracticeUnit = {
  key: "functions",
  title: "Functions, references and recursion",
  summary: "writing functions, pass by value versus pass by reference, const references, default arguments, overloading and recursion",
  reading: String.raw`## Why functions

A function packs one job behind a name. Programs made of small functions are easier to read, test and reuse than one giant main.

` + "```cpp" + String.raw`
double average(int a, int b, int c) {     // return type, name, parameters
    return (a + b + c) / 3.0;
}

int main() {
    cout << average(70, 80, 95) << "\n";  // 81.6667
    return 0;
}
` + "```" + String.raw`

- A function must be declared before it is called. Either define it above main, or put a prototype (double average(int a, int b, int c);) above main and the body below.
- void means the function returns nothing.
- A good function either computes and returns a value or prints; mixing the two makes it harder to reuse.

## Pass by value and pass by reference

By default the parameter is a copy: changing it inside the function does not touch the caller's variable. Add & to the type to pass a reference, which is another name for the caller's variable:

` + "```cpp" + String.raw`
void swapValues(int& a, int& b) {
    int temp = a;
    a = b;
    b = temp;
}

int x = 3, y = 8;
swapValues(x, y);   // now x is 8 and y is 3
` + "```" + String.raw`

References replace most of the pointer tricks from C. Use them when:

- the function must change the caller's variable (swap, reading several results out of one call);
- the argument is big (a string or a vector) and copying it would be slow. Then write const string& s: no copy is made and the function promises not to change it.

A reference must be bound to a variable, so swapValues(3, 8) does not compile.

## Default arguments and overloading

Parameters can have default values, filled in when the caller leaves them out. Defaults go at the end of the list:

` + "```cpp" + String.raw`
long long power(long long base, int exp = 2) { ... }
power(5);      // 25
power(2, 10);  // 1024
` + "```" + String.raw`

Overloading means several functions share a name but differ in their parameter types or count. The compiler picks the best match from the arguments:

` + "```cpp" + String.raw`
double area(double radius);        // circle
int area(int side);                // square
int area(int length, int width);   // rectangle
` + "```" + String.raw`

The return type alone can't tell overloads apart, and a call like area(5) with both area(double) and area(long) defined would be ambiguous.

## Recursion

A recursive function solves a problem by calling itself on a smaller version of it. It needs a base case that stops the calls:

` + "```cpp" + String.raw`
long long factorial(int n) {
    if (n <= 1) return 1;          // base case
    return n * factorial(n - 1);   // smaller problem
}
` + "```" + String.raw`

Each call gets its own copy of the local variables on the call stack. Without a base case (or with one that is never reached, like calling factorial(-1) with the check n == 0), the stack overflows and the program crashes.

Recursion shines when the problem is naturally recursive: GCD (gcd(a, b) = gcd(b, a % b)), converting to binary, the Tower of Hanoi, and later trees and backtracking. For simple counting a loop is usually clearer and faster. Watch out for recursion that repeats work: the naive fib(n) = fib(n - 1) + fib(n - 2) makes millions of calls for n = 40.

## Scope and inline

- Variables declared inside a function (locals) exist only during that call. Globals are visible everywhere; avoid them for anything that changes.
- A static local keeps its value between calls.
- Short functions defined in a header are often marked inline; modern compilers decide inlining on their own, so you rarely need the keyword for speed.

## How your assignments are checked

Each question names the function you must write (for example bool isPrime(int n)). The checker looks for that function in your code, then compiles and runs your whole program on example and hidden inputs. Keep the input reading and printing in main and let the function do the calculation.`,
  questions: [
    cppq("Swap with references", "Write void swapValues(int& a, int& b) that swaps its two arguments. In main, read two integers, call swapValues and print them.", ["Input: two integers x and y", "Output: x and y after the swap", "The swap must happen inside swapValues through references"], String.raw`#include <iostream>
using namespace std;

void swapValues(int& a, int& b) {
    int temp = a;
    a = b;
    b = temp;
}

int main() {
    int x, y;
    cin >> x >> y;
    swapValues(x, y);
    cout << "x = " << x << ", y = " << y << "\n";
    return 0;
}
`, [["3 8", "8 3"], ["-1 5", "5 -1"]], [["0 0", "0 0"], ["100 -200", "-200 100"]], { rules: [has(String.raw`\bswapValues\s*\(\s*int\s*&\s*\w+\s*,\s*int\s*&\s*\w+\s*\)`, "swapValues takes two int& parameters"), has(String.raw`\bswapValues\s*\(\s*\w+\s*,\s*\w+\s*\)\s*;`, "Calls swapValues from main")] }),

    cppq("Recursive factorial", "Write a recursive function long long factorial(int n) and use it to print n! for the number read.", ["Input: n (0 to 20)", "Output: n!", "0! is 1; factorial must call itself"], String.raw`#include <iostream>
using namespace std;

long long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int n;
    cin >> n;
    cout << n << "! = " << factorial(n) << "\n";
    return 0;
}
`, [["5", "120"], ["0", "1"]], [["1", "1"], ["10", "3628800"], ["20", "2432902008176640000"]], { rules: [defines("factorial"), has(String.raw`return[^;]*\bfactorial\s*\(\s*n\s*-\s*1\s*\)`, "factorial calls itself with n - 1")] }),

    cppq("Overloaded area functions", "Write three overloads named area: area(int side) for a square, area(int length, int width) for a rectangle and area(double radius) for a circle (use pi = 3.14159265358979). Read the inputs and print the three areas.", ["Input line 1: the side of a square (integer)", "Input line 2: length and width of a rectangle (integers)", "Input line 3: the radius of a circle (decimal)", "Output: the square area, the rectangle area, then the circle area with 2 decimals"], String.raw`#include <iostream>
#include <iomanip>
using namespace std;

const double PI = 3.14159265358979;

int area(int side) {
    return side * side;
}

int area(int length, int width) {
    return length * width;
}

double area(double radius) {
    return PI * radius * radius;
}

int main() {
    int side, length, width;
    double radius;
    cin >> side >> length >> width >> radius;
    cout << "Square: " << area(side) << "\n";
    cout << "Rectangle: " << area(length, width) << "\n";
    cout << fixed << setprecision(2) << "Circle: " << area(radius) << "\n";
    return 0;
}
`, [["5\n4 6\n1.5", "25 24 7.07"], ["1\n2 3\n1", "1 6 3.14"]], [["10\n10 1\n10", "100 10 314.16"], ["0\n0 5\n0.5", "0 0 0.79"]], { level: "intermediate", rules: [has(String.raw`\barea\s*\([^)]*\)\s*\{[\s\S]*\barea\s*\([^)]*\)\s*\{[\s\S]*\barea\s*\([^)]*\)\s*\{`, "Defines three functions named area"), has(String.raw`\barea\s*\(\s*double\s+\w+\s*\)`, "One overload takes a double")] }),

    cppq("Power with a default exponent", "Write long long power(long long base, int exp = 2) using a loop. Read a number and print its square with power(n); then read a base and an exponent and print power(base, exp).", ["Input line 1: n", "Input line 2: base and exponent (exponent >= 0)", "Output line 1: power(n)", "Output line 2: power(base, exp)"], String.raw`#include <iostream>
using namespace std;

long long power(long long base, int exp = 2) {
    long long result = 1;
    for (int i = 0; i < exp; i++) {
        result *= base;
    }
    return result;
}

int main() {
    long long n, base;
    int exp;
    cin >> n >> base >> exp;
    cout << power(n) << "\n";
    cout << power(base, exp) << "\n";
    return 0;
}
`, [["5\n2 10", "25 1024"], ["-3\n3 4", "9 81"]], [["0\n7 0", "0 1"], ["12\n-2 5", "144 -32"], ["1000\n10 18", "1000000 1000000000000000000"]], { rules: [has(String.raw`\bint\s+\w+\s*=\s*2\s*\)`, "The exponent parameter has the default value 2"), has(String.raw`\bpower\s*\(\s*\w+\s*\)`, "Calls power with one argument")] }),

    cppq("Recursive GCD", "Write a recursive function long long gcd(long long a, long long b) using Euclid's rule gcd(a, b) = gcd(b, a % b), with gcd(a, 0) = a. Read two numbers and print their GCD and LCM.", ["Input: two positive integers", "Output line 1: GCD", "Output line 2: LCM"], String.raw`#include <iostream>
using namespace std;

long long gcd(long long a, long long b) {
    if (b == 0) return a;
    return gcd(b, a % b);
}

int main() {
    long long a, b;
    cin >> a >> b;
    long long g = gcd(a, b);
    cout << "GCD: " << g << "\n";
    cout << "LCM: " << a / g * b << "\n";
    return 0;
}
`, [["12 18", "6 36"], ["17 5", "1 85"]], [["48 180", "12 720"], ["9 9", "9 9"], ["1000000000 999999999", "1 999999999000000000"]], { rules: [defines("gcd"), has(String.raw`return\s+gcd\s*\(\s*\w+\s*,\s*\w+\s*%\s*\w+\s*\)`, "gcd calls itself with (b, a % b)")] }),

    cppq("Primes in a range", "Write bool isPrime(int n) and use it to print every prime between a and b (both included). If there are none, print None.", ["Input: two integers a <= b", "Output: the primes separated by spaces, or None"], String.raw`#include <iostream>
using namespace std;

bool isPrime(int n) {
    if (n < 2) return false;
    for (int d = 2; d * d <= n; d++) {
        if (n % d == 0) return false;
    }
    return true;
}

int main() {
    int a, b;
    cin >> a >> b;
    bool found = false;
    for (int n = a; n <= b; n++) {
        if (isPrime(n)) {
            cout << n << " ";
            found = true;
        }
    }
    cout << (found ? "" : "None") << "\n";
    return 0;
}
`, [["10 30", "11 13 17 19 23 29"], ["1 10", "2 3 5 7"]], [["24 28", "None"], ["-5 2", "2"], ["97 101", "97 101"]], { level: "intermediate", rules: [has(String.raw`\bbool\s+isPrime\s*\(\s*int\s+\w+\s*\)`, "Defines bool isPrime(int n)"), has(String.raw`\bisPrime\s*\(\s*\w+\s*\)\s*\)`, "Calls isPrime in a condition")] }),

    cppq("Min, max and average through references", "Write void stats(int a, int b, int c, int& smallest, int& largest, double& average) that fills in the three results. main reads three numbers, calls stats once and prints the results.", ["Input: three integers", "Output: smallest, largest and average (2 decimals)"], String.raw`#include <iostream>
#include <iomanip>
#include <algorithm>
using namespace std;

void stats(int a, int b, int c, int& smallest, int& largest, double& average) {
    smallest = min({a, b, c});
    largest = max({a, b, c});
    average = (a + b + c) / 3.0;
}

int main() {
    int a, b, c;
    cin >> a >> b >> c;
    int smallest = 0, largest = 0;
    double average = 0;
    stats(a, b, c, smallest, largest, average);
    cout << "Smallest: " << smallest << "\n";
    cout << "Largest: " << largest << "\n";
    cout << fixed << setprecision(2) << "Average: " << average << "\n";
    return 0;
}
`, [["3 9 6", "3 9 6.00"], ["10 20 25", "10 25 18.33"]], [["-4 -4 -4", "-4 -4 -4.00"], ["0 100 1", "0 100 33.67"]], { level: "intermediate", rules: [has(String.raw`\bstats\s*\([^)]*int\s*&[^)]*int\s*&[^)]*double\s*&[^)]*\)`, "stats returns its results through int& and double& parameters")] }),

    cppq("Binary with recursion", "Write a recursive function void printBinary(long long n) that prints n in binary: print the binary of n / 2 first (when n > 1), then the last bit n % 2. Read a number and print its binary form.", ["Input: one integer n >= 0", "Output: n in binary, e.g. 10 gives 1010"], String.raw`#include <iostream>
using namespace std;

void printBinary(long long n) {
    if (n > 1) printBinary(n / 2);
    cout << n % 2;
}

int main() {
    long long n;
    cin >> n;
    printBinary(n);
    cout << "\n";
    return 0;
}
`, [["10", "1010"], ["0", "0"]], [["1", "1"], ["255", "11111111"], ["1024", "10000000000"], ["37", "100101"]], { level: "intermediate", rules: [defines("printBinary"), has(String.raw`\bprintBinary\s*\(\s*n\s*(/\s*2|>>\s*1)\s*\)`, "printBinary calls itself with n / 2")] }),

    cppq("Tower of Hanoi", "Write a recursive function void hanoi(int n, char from, char to, char via, int& moves) that prints every move and counts them. Move n disks from rod A to rod C using B.", ["Input: the number of disks n (1 to 10)", "Output: one line per move, Move disk <d> from <X> to <Y>", "Last line: Total moves: <count>"], String.raw`#include <iostream>
using namespace std;

void hanoi(int n, char from, char to, char via, int& moves) {
    if (n == 0) return;
    hanoi(n - 1, from, via, to, moves);
    cout << "Move disk " << n << " from " << from << " to " << to << "\n";
    moves++;
    hanoi(n - 1, via, to, from, moves);
}

int main() {
    int n;
    cin >> n;
    int moves = 0;
    hanoi(n, 'A', 'C', 'B', moves);
    cout << "Total moves: " << moves << "\n";
    return 0;
}
`, [["2", "Move disk 1 from A to B\nMove disk 2 from A to C\nMove disk 1 from B to C\nTotal moves: 3"], ["1", "Move disk 1 from A to C\nTotal moves: 1"]], [["3", "Move disk 1 from A to C\nMove disk 2 from A to B\nMove disk 1 from C to B\nMove disk 3 from A to C\nMove disk 1 from B to A\nMove disk 2 from B to C\nMove disk 1 from A to C\nTotal moves: 7"], ["10", "Total moves: 1023"]], { level: "advanced", rules: [defines("hanoi"), has(String.raw`\bhanoi\s*\(\s*n\s*-\s*1`, "hanoi calls itself with n - 1")] }),
    cppq("Pass by reference swap", "Write void swapValues(int& a, int& b) that swaps two integers through references, then read two numbers, swap them and print them.", ["Input: two integers x and y", "Output: x=<new x> y=<new y>", "The function must take references (int&), not copies"], String.raw`#include <iostream>
using namespace std;

void swapValues(int& a, int& b) {
    int t = a;
    a = b;
    b = t;
}

int main() {
    int x, y;
    cin >> x >> y;
    swapValues(x, y);
    cout << "x=" << x << " y=" << y << "\n";
    return 0;
}
`, [["3 9", "x=9 y=3"], ["-1 1", "x=1 y=-1"]], [["0 0", "x=0 y=0"], ["100 -250", "x=-250 y=100"]], { match: "exact", rules: [has(String.raw`void\s+swapValues\s*\(\s*int\s*&\s*\w+\s*,\s*int\s*&\s*\w+\s*\)`, "swapValues takes two int& parameters"), hasNot(String.raw`\bstd::swap\b|[^\w]swap\s*\(`, "Does the swap itself instead of calling std::swap")] }),
  ],
  quiz: [
    { q: "What is the return type of a function that returns nothing?", options: ["null", "void", "int", "empty"], answer: 1, why: "void means no value is returned." },
    { q: "Where must a function be declared so that main can call it?", options: ["Anywhere in the file", "Before the call, as a definition or a prototype", "Only in a header file", "After main"], answer: 1, why: "C++ compiles top to bottom, so the name must be known before it is used." },
    { q: "What does the & in void f(int& x) mean?", options: ["x is the address of an int", "x is a reference: another name for the caller's variable", "x is a bitwise AND", "x is passed as a copy"], answer: 1, why: "In a declaration, & after the type makes a reference parameter." },
    { q: "Why write void print(const string& s) instead of void print(string s)?", options: ["It is required for strings", "It avoids copying the string and promises not to change it", "It makes s a pointer", "It allows print to change the caller's string"], answer: 1, why: "A const reference passes the original cheaply and read-only." },
    { q: "Which declaration of default arguments is valid?", options: ["int f(int a = 1, int b);", "int f(int a, int b = 1);", "int f(int = a, int b);", "int f(default int a);"], answer: 1, why: "Parameters with defaults must come after the ones without." },
    { q: "Two functions have the same name and the same parameters but different return types. What happens?", options: ["It compiles; the return type decides", "Compile error: the overloads can't be told apart", "The first one wins", "The last one wins"], answer: 1, why: "Overloads must differ in their parameter lists; return type alone is not enough." },
    { q: "What is missing from this function?\n\nint sumTo(int n) {\n  return n + sumTo(n - 1);\n}", options: ["A loop", "A base case, so the recursion never stops", "A reference parameter", "Nothing"], answer: 1, why: "Without if (n == 0) return 0; the calls go on until the stack overflows." },
    { q: "What does this print?\n\nvoid f(int x) { x = 10; }\nint main() { int a = 5; f(a); cout << a; }", options: ["10", "5", "0", "Compile error"], answer: 1, why: "x is a copy (pass by value); changing it does not affect a." },
    { q: "What does this print?\n\nint counter() { static int c = 0; return ++c; }\nint main() { counter(); counter(); cout << counter(); }", options: ["1", "3", "0", "Compile error"], answer: 1, why: "A static local keeps its value between calls, so the third call returns 3." },
    { q: "Why is the recursive fib(n) = fib(n - 1) + fib(n - 2) very slow for n = 45?", options: ["Recursion is always slow in C++", "It recomputes the same values over and over, so the number of calls grows exponentially", "long long is slow", "The base case is wrong"], answer: 1, why: "fib(43) is computed twice, fib(42) three times and so on; a loop or memoisation makes it linear." },
  ],
};
