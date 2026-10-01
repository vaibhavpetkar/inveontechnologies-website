import type { PracticeUnit } from "../../types.js";
import { cq } from "./shared.js";

const fnRule = (name: string) => ({ match: String.raw`\b\w[\w\s\*]*\b${name}\s*\([^;{]*\)\s*\{`, message: `Defines a function named ${name}` });
const callsRule = (name: string) => ({ match: String.raw`\b${name}\s*\([^)]*\)\s*[;,)+\-*/]`, message: `Calls ${name}()` });
const recursive = (name: string) => ({ match: String.raw`\b${name}\s*\([^;{]*\)\s*\{[^}]*\b${name}\s*\(`, message: `${name} calls itself (recursion)` });

export const functions: PracticeUnit = {
  key: "functions",
  title: "Functions, recursion, structures and pointers",
  summary: "writing and calling functions, passing arrays, recursion, pointers and call by reference, structures and arrays of structures",
  reading: String.raw`## Functions

A function is a named block of code that does one job. It takes parameters and can return a value:

` + "```c" + String.raw`
int square(int x) {       /* return type, name, parameters */
    return x * x;
}

int main(void) {
    printf("%d\n", square(5));   /* 25 */
    return 0;
}
` + "```" + String.raw`

- Define the function above main, or declare its prototype above main (int square(int x);) and define it later.
- A function that returns nothing has return type void.
- Parameters are copies: changing x inside square doesn't change the caller's variable. This is call by value.

The four kinds of functions you'll see in class: no arguments and no return value, arguments but no return value, no arguments but a return value, and arguments with a return value. The last kind is the most useful, because the function neither reads input nor prints, so you can reuse and test it.

## Passing arrays

An array parameter receives the address of the first element, so the function works on the caller's array. Pass the size too:

` + "```c" + String.raw`
int sum(int a[], int n) {
    int s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
` + "```" + String.raw`

## Recursion

A recursive function calls itself on a smaller problem, and has a base case that stops:

` + "```c" + String.raw`
long long factorial(int n) {
    if (n <= 1) return 1;          /* base case */
    return n * factorial(n - 1);   /* smaller problem */
}
` + "```" + String.raw`

Without a base case the calls never end and the program crashes (stack overflow).

## Pointers

A pointer holds the address of another variable. & takes an address and * reads or writes the value at an address:

` + "```c" + String.raw`
int x = 10;
int *p = &x;   /* p points to x */
*p = 20;       /* x is now 20 */
` + "```" + String.raw`

This is how a function can change the caller's variables (call by reference), for example swapping:

` + "```c" + String.raw`
void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}
/* call it with swap(&x, &y); */
` + "```" + String.raw`

It is also why scanf needs &: it receives addresses so it can store what it reads.

## Structures

A struct groups related values of different types into one record:

` + "```c" + String.raw`
struct Student {
    int roll;
    char name[12];
    int eng, hin, mar;
    float average;
};

struct Student s;
scanf("%d %11s", &s.roll, s.name);
` + "```" + String.raw`

- Use the dot operator with a structure variable: s.roll.
- Use the arrow operator with a pointer to a structure: struct Student *p = &s; then p->roll (the same as (*p).roll).
- An array of structures stores many records: struct Student list[50];

## Style that the reviewer likes

- Give functions clear names (square, factorial, isPrime) and keep each one short.
- Return a value instead of printing inside the function whenever you can.
- Don't forget the prototype or definition before the first call; otherwise gcc reports an implicit declaration.`,
  questions: [
    cq("Squares with a function", "Write a function int square(int x) and use it to print the squares of the numbers 1 to n.", ["Input: n", "Output: the squares of 1..n", "Define square() and call it inside a loop in main"], String.raw`#include <stdio.h>

int square(int x) {
    return x * x;
}

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++)
        printf("%d ", square(i));
    printf("\n");
    return 0;
}
`, [["10", "1 4 9 16 25 36 49 64 81 100"], ["3", "1 4 9"]], [["1", "1"], ["12", "1 4 9 16 25 36 49 64 81 100 121 144"]], { rules: [fnRule("square"), callsRule("square")] }),

    cq("Pass an array to a function", "Write a function int sum(int a[], int n) that returns the sum of an array, and use it to print the sum of n numbers.", ["Input: n, then n integers", "Output: the sum", "The function must take the array as a parameter"], String.raw`#include <stdio.h>

int sum(int a[], int n) {
    int s = 0;
    for (int i = 0; i < n; i++)
        s += a[i];
    return s;
}

int main(void) {
    int n, a[100];
    scanf("%d", &n);
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]);
    printf("Sum = %d\n", sum(a, n));
    return 0;
}
`, [["5\n1 2 3 4 5", "15"]], [["3\n-10 20 5", "15"], ["1\n7", "7"]], { rules: [{ match: String.raw`\(\s*int\s+\w+\s*\[\s*\]|\(\s*int\s*\*\s*\w+`, message: "A function takes the array as a parameter (int a[])" }] }),

    cq("Sum of a series", "Write a function double series(int n) that returns 1 + 1/2 + 1/3 + ... + 1/n, and print it for the given n with 4 decimals.", ["Input: n (1 or more)", "Output: the sum with 4 decimals", "Use 1.0 / i, not 1 / i"], String.raw`#include <stdio.h>

double series(int n) {
    double s = 0;
    for (int i = 1; i <= n; i++)
        s += 1.0 / i;
    return s;
}

int main(void) {
    int n;
    scanf("%d", &n);
    printf("Sum = %.4f\n", series(n));
    return 0;
}
`, [["5", "2.2833"], ["1", "1.0000"]], [["10", "2.9290"], ["2", "1.5000"]], { rules: [fnRule("series")] }),

    cq("Area of a circle with a function", "Write a function float area(float r) that returns pi * r * r (pi = 3.14), read the radius in main, call the function and print the result with 2 decimals.", ["Input: the radius", "Output: the area with 2 decimals", "area() must not use printf or scanf"], String.raw`#include <stdio.h>

float area(float r) {
    return 3.14f * r * r;
}

int main(void) {
    float r;
    scanf("%f", &r);
    printf("Area = %.2f\n", area(r));
    return 0;
}
`, [["7", "153.86"], ["1", "3.14"]], [["10", "314.00"], ["0.5", "0.79"]], { rules: [fnRule("area"), { notMatch: String.raw`\barea\s*\([^)]*\)\s*\{[^}]*\b(printf|scanf)\s*\(`, message: "area() only calculates (no printf or scanf inside)" }] }),

    cq("Student structure", "Create a structure with a student's roll number, name, and marks of English, Hindi and Marathi. Read one student and print the roll number, name, total and average (2 decimals).", ["Input: roll number, name (one word), 3 marks", "Output in this order: roll, name, total, average", "Use struct"], String.raw`#include <stdio.h>

struct Student {
    int roll;
    char name[12];
    int eng, hin, mar;
};

int main(void) {
    struct Student s;
    scanf("%d %11s %d %d %d", &s.roll, s.name, &s.eng, &s.hin, &s.mar);
    int total = s.eng + s.hin + s.mar;
    printf("Roll: %d\nName: %s\nTotal: %d\nAverage: %.2f\n", s.roll, s.name, total, total / 3.0);
    return 0;
}
`, [["12 Asha 78 85 90", "12 Asha 253 84.33"]], [["7 Ravi 50 60 70", "7 Ravi 180 60.00"], ["3 Om 0 0 1", "3 Om 1 0.33"]], { rules: [{ match: String.raw`\bstruct\s+\w+\s*\{`, message: "Defines a struct" }, { match: String.raw`\w+\.\w+`, message: "Uses the dot operator to reach the fields" }] }),

    cq("Structure through a pointer", "Read a student (roll number, name, marks in 3 subjects) into a structure, then print the details and the total through a pointer to the structure, using the -> operator.", ["Input: roll number, name, 3 marks", "Output: roll, name, total", "Print using p->field"], String.raw`#include <stdio.h>

struct Student {
    int roll;
    char name[12];
    int marks[3];
};

int main(void) {
    struct Student s;
    struct Student *p = &s;
    scanf("%d %11s %d %d %d", &p->roll, p->name, &p->marks[0], &p->marks[1], &p->marks[2]);
    printf("Roll: %d\nName: %s\nTotal: %d\n", p->roll, p->name, p->marks[0] + p->marks[1] + p->marks[2]);
    return 0;
}
`, [["12 Asha 78 85 90", "12 Asha 253"]], [["1 Kiran 100 100 100", "1 Kiran 300"], ["9 Om 0 5 0", "9 Om 5"]], { level: "intermediate", rules: [{ match: String.raw`struct\s+\w+\s*\*\s*\w+\s*=\s*&`, message: "Points a struct pointer at the variable" }, { match: "->", message: "Uses the -> operator" }] }),

    cq("Factorial with recursion", "Write a recursive function long long factorial(int n) and print n!.", ["Input: n (0 to 20)", "Output: n!", "factorial must call itself; no loop"], String.raw`#include <stdio.h>

long long factorial(int n) {
    if (n <= 1)
        return 1;
    return n * factorial(n - 1);
}

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%lld\n", factorial(n));
    return 0;
}
`, [["5", "120"], ["0", "1"]], [["10", "3628800"], ["20", "2432902008176640000"]], { rules: [recursive("factorial"), { notMatch: String.raw`\b(for|while)\s*\(`, message: "No loops: use recursion" }] }),

    cq("Fibonacci term with recursion", "Write a recursive function int fib(int n) where fib(0) = 0 and fib(1) = 1, and print fib(n).", ["Input: n (0 to 25)", "Output: fib(n)"], String.raw`#include <stdio.h>

int fib(int n) {
    if (n < 2)
        return n;
    return fib(n - 1) + fib(n - 2);
}

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d\n", fib(n));
    return 0;
}
`, [["10", "55"], ["1", "1"]], [["0", "0"], ["20", "6765"], ["25", "75025"]], { level: "intermediate", rules: [recursive("fib")] }),

    cq("Power with recursion", "Write a recursive function long long power(int base, int exp) and print base raised to exp.", ["Input: base and exp (exp >= 0)", "Output: base^exp", "Don't use pow()"], String.raw`#include <stdio.h>

long long power(int base, int exp) {
    if (exp == 0)
        return 1;
    return base * power(base, exp - 1);
}

int main(void) {
    int b, e;
    scanf("%d %d", &b, &e);
    printf("%lld\n", power(b, e));
    return 0;
}
`, [["2 10", "1024"], ["5 0", "1"]], [["3 4", "81"], ["-2 3", "-8"], ["10 9", "1000000000"]], { level: "intermediate", rules: [recursive("power"), { notMatch: String.raw`\bpow\s*\(`, message: "Doesn't use pow()" }] }),

    cq("Swap with pointers", "Write a function void swap(int *a, int *b) that swaps two numbers through pointers. Read two numbers, swap them with the function and print them.", ["Input: two integers", "Output: the two numbers after swapping", "Call it as swap(&x, &y)"], String.raw`#include <stdio.h>

void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}

int main(void) {
    int x, y;
    scanf("%d %d", &x, &y);
    swap(&x, &y);
    printf("%d %d\n", x, y);
    return 0;
}
`, [["5 9", "9 5"]], [["-1 3", "3 -1"], ["0 0", "0 0"]], { rules: [{ match: String.raw`\bvoid\s+swap\s*\(\s*int\s*\*\s*\w+\s*,\s*int\s*\*\s*\w+\s*\)`, message: "Defines void swap(int *a, int *b)" }, { match: String.raw`\bswap\s*\(\s*&\s*\w+\s*,\s*&\s*\w+\s*\)`, message: "Calls swap with addresses (&x, &y)" }] }),

    cq("Highest paid employee", "Read n employees (name and salary) into an array of structures and print the name and salary of the highest paid one (the first one if there is a tie).", ["Input: n, then n lines of name (one word) and salary", "Output: the name and salary of the highest paid"], String.raw`#include <stdio.h>

struct Employee {
    char name[30];
    long salary;
};

int main(void) {
    int n;
    struct Employee e[50];
    scanf("%d", &n);
    for (int i = 0; i < n; i++)
        scanf("%29s %ld", e[i].name, &e[i].salary);
    int best = 0;
    for (int i = 1; i < n; i++)
        if (e[i].salary > e[best].salary)
            best = i;
    printf("%s %ld\n", e[best].name, e[best].salary);
    return 0;
}
`, [["3\nRavi 20000\nAsha 35000\nKiran 30000", "Asha 35000"]], [["1\nOm 5000", "Om 5000"], ["4\nA 100\nB 300\nC 300\nD 200", "B 300"]], { level: "intermediate", rules: [{ match: String.raw`struct\s+\w+\s+\w+\s*\[`, message: "Uses an array of structures" }] }),

    cq("Prime check with a function", "Write a function int isPrime(int n) that returns 1 for a prime and 0 otherwise, and use it to print the primes between a and b.", ["Input: a and b", "Output: the primes from a to b", "isPrime must return a value, not print"], String.raw`#include <stdio.h>

int isPrime(int n) {
    if (n < 2) return 0;
    for (int d = 2; d * d <= n; d++)
        if (n % d == 0) return 0;
    return 1;
}

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    for (int i = a; i <= b; i++)
        if (isPrime(i)) printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["10 30", "11 13 17 19 23 29"], ["1 10", "2 3 5 7"]], [["90 100", "97"], ["2 2", "2"]], { level: "intermediate", rules: [fnRule("isPrime")] }),
  ],
  quiz: [
    { q: "What does a function with return type void return?", options: ["0", "Nothing", "An empty string", "NULL"], answer: 1, why: "void means the function returns no value." },
    { q: "Where must a function be defined or declared?", options: ["Anywhere; C finds it", "Before its first call (or its prototype must be)", "Only after main", "In a separate file"], answer: 1, why: "The compiler must know a function's signature before a call." },
    { q: "When an int is passed to a function, what does the function get?", options: ["The variable itself", "A copy of the value", "Its address", "Nothing"], answer: 1, why: "C passes arguments by value; use pointers to change the caller's variable." },
    { q: "What does the & operator give?", options: ["The value of a variable", "The address of a variable", "A logical AND", "A pointer's value"], answer: 1, why: "&x is the address of x. (&& is logical AND.)" },
    { q: "If p points to a struct, how do you access its roll field?", options: ["p.roll", "p->roll", "*p.roll", "&p.roll"], answer: 1, why: "p->roll is shorthand for (*p).roll. *p.roll parses as *(p.roll)." },
    { q: "What is a base case in recursion?", options: ["The first call", "The case that returns without calling itself again", "The largest input", "A default parameter"], answer: 1, why: "It stops the recursion; without it the calls never end." },
    { q: "Why is it better for isPrime(n) to return 0/1 instead of printing?", options: ["It runs faster", "The caller can reuse the answer (count primes, print a list ...)", "printf isn't allowed in functions", "Return values are required"], answer: 1, why: "A function that returns a result is reusable and testable." },
    { q: "What does this print?\n\nvoid change(int x) { x = 99; }\nint main(void) {\n    int a = 1;\n    change(a);\n    printf(\"%d\", a);\n}", options: ["99", "1", "0", "Compile error"], answer: 1, why: "change gets a copy of a; the original stays 1." },
    { q: "What does this print?\n\nint x = 5;\nint *p = &x;\n*p = *p + 10;\nprintf(\"%d\", x);", options: ["5", "15", "An address", "10"], answer: 1, why: "*p is x itself, so x becomes 15." },
    { q: "What does f(4) return?\n\nint f(int n) {\n    if (n == 0) return 0;\n    return n + f(n - 1);\n}", options: ["4", "10", "24", "It never stops"], answer: 1, why: "4 + 3 + 2 + 1 + 0 = 10." },
  ],
};
