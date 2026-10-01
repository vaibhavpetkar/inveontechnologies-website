import type { PracticeUnit } from "../../types.js";
import { cq } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "Basics: input, output and operators",
  summary: "variables, data types, printf and scanf, arithmetic operators and formulas",
  reading: String.raw`## Your first C program

Every C program starts running at main. The #include line brings in the standard input/output library, which gives you printf (print to the screen) and scanf (read from the keyboard).

` + "```c" + String.raw`
#include <stdio.h>

int main(void) {
    printf("Hello, Inveon!\n");
    return 0;
}
` + "```" + String.raw`

- main returns int. Write int main(void) and end it with return 0; to say "finished without errors". void main() is not standard C.
- Every statement ends with a semicolon.
- \n inside a string moves to a new line.
- C is case-sensitive: printf works, Printf does not.

## Variables and data types

A variable is a named box in memory. You must declare its type before using it.

- int: whole numbers (-5, 0, 42). Printed and read with %d.
- float: decimal numbers with about 7 digits of precision. Printed with %f, read with %f.
- double: more precise decimals (about 15 digits). Printed with %f or %lf, read with %lf.
- char: a single character in single quotes, like 'A'. Printed and read with %c.
- long long: very large whole numbers. Printed and read with %lld.

A variable declared without a value holds garbage, so give totals and counters a starting value: int sum = 0;

## Reading input with scanf

scanf needs the address of the variable, written with &, so it can store the value there:

` + "```c" + String.raw`
int a, b;
scanf("%d %d", &a, &b);   /* reads two whole numbers */
float r;
scanf("%f", &r);          /* reads a decimal */
` + "```" + String.raw`

Forgetting the & is the most common beginner bug: the program compiles but crashes or reads garbage. The one exception is a string (char array), which is already an address: scanf("%s", name);

scanf does not print anything. To show a prompt, call printf first.

## Printing with printf

printf takes a format string with placeholders, then one value per placeholder, in order:

` + "```c" + String.raw`
int total = 253;
float percent = 84.33f;
printf("Total: %d\n", total);
printf("Percentage: %.2f\n", percent);   /* 2 digits after the point */
` + "```" + String.raw`

The placeholder must match the type. Printing a float with %d (or an int with %f) prints a wrong number without any error.

## Operators

- Arithmetic: + - * / % (remainder). 7 / 2 is 3 because both are ints; 7.0 / 2 is 3.5. % works on whole numbers only.
- Assignment shortcuts: x += 5 means x = x + 5. x++ adds one.
- Precedence: * / % happen before + and -. Use brackets to make the order clear: (a + b) / 2.
- Casting: (float)total / 5 converts total to float before dividing, so the decimals are kept.

A classic trap: 1/2 * b * h is always 0, because 1/2 is integer division. Write 0.5 * b * h.

## Swapping two values

With a third variable:

` + "```c" + String.raw`
temp = a;
a = b;
b = temp;
` + "```" + String.raw`

Without a third variable, using arithmetic: a = a + b; b = a - b; a = a - b;

## How your assignments are checked

Upload one .c file per question. The reviewer reads your code line by line (it knows the common mistakes: missing &, wrong placeholder, missing semicolon, Turbo C headers like conio.h), then compiles it with gcc and runs it with the test inputs. You may print prompts like "Enter a number:"; the checker looks for the numbers and words of the answer in order. Do not use conio.h, clrscr() or getch(): they only exist in Turbo C and will not compile.`,
  questions: [
    cq("Sum of two numbers", "Accept two numbers and print their sum.", ["Input: two integers a and b", "Output: their sum"], String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    printf("Enter two numbers: ");
    scanf("%d %d", &a, &b);
    printf("Sum = %d\n", a + b);
    return 0;
}
`, [["4 5", "9"], ["10 -3", "7"]], [["0 0", "0"], ["123456 654321", "777777"]]),

    cq("Square of a number", "Accept a number and print its square.", ["Input: one integer n", "Output: n * n"], String.raw`#include <stdio.h>

int main(void) {
    long long n;
    scanf("%lld", &n);
    printf("Square = %lld\n", n * n);
    return 0;
}
`, [["5", "25"], ["-4", "16"]], [["0", "0"], ["1000", "1000000"]]),

    cq("Cube of a number", "Accept a number and print its cube.", ["Input: one integer n", "Output: n * n * n"], String.raw`#include <stdio.h>

int main(void) {
    long long n;
    scanf("%lld", &n);
    printf("Cube = %lld\n", n * n * n);
    return 0;
}
`, [["3", "27"], ["-2", "-8"]], [["10", "1000"], ["0", "0"]]),

    cq("Area of a rectangle", "Accept the length and breadth of a rectangle and print its area (area = l * b).", ["Input: two integers, length and breadth", "Output: the area"], String.raw`#include <stdio.h>

int main(void) {
    int l, b;
    printf("Enter length and breadth: ");
    scanf("%d %d", &l, &b);
    printf("Area = %d\n", l * b);
    return 0;
}
`, [["4 5", "20"], ["7 3", "21"]], [["1 1", "1"], ["12 10", "120"]]),

    cq("Area of a triangle", "Accept the base and height of a triangle and print its area (area = 0.5 * b * h).", ["Input: two numbers, base and height", "Output: the area with 2 decimals, e.g. 10.50", "Careful: 1/2 is 0 in integer maths; use 0.5"], String.raw`#include <stdio.h>

int main(void) {
    float b, h;
    scanf("%f %f", &b, &h);
    printf("Area = %.2f\n", 0.5f * b * h);
    return 0;
}
`, [["4 5", "10.00"], ["3 7", "10.50"]], [["1 1", "0.50"], ["10 3", "15.00"]]),

    cq("Area and circumference of a circle", "Accept the radius of a circle and print its area (pi * r * r) and circumference (2 * pi * r). Use pi = 3.14.", ["Input: the radius (can have decimals)", "Output line 1: the area with 2 decimals", "Output line 2: the circumference with 2 decimals"], String.raw`#include <stdio.h>

int main(void) {
    float r, pi = 3.14f;
    scanf("%f", &r);
    printf("Area = %.2f\n", pi * r * r);
    printf("Circumference = %.2f\n", 2 * pi * r);
    return 0;
}
`, [["7", "153.86 43.96"], ["1", "3.14 6.28"]], [["10", "314.00 62.80"], ["2.5", "19.63 15.70"]]),

    cq("Swap using a third variable", "Accept two numbers and interchange them using a third variable named temp. Print the numbers after swapping.", ["Input: two integers a and b", "Output: a and b after the swap (the old b first, then the old a)", "Use a variable named temp"], String.raw`#include <stdio.h>

int main(void) {
    int a, b, temp;
    scanf("%d %d", &a, &b);
    temp = a;
    a = b;
    b = temp;
    printf("After swap: a = %d, b = %d\n", a, b);
    return 0;
}
`, [["5 9", "9 5"], ["-1 3", "3 -1"]], [["0 7", "7 0"], ["100 100", "100 100"]], { rules: [{ match: String.raw`\btemp\s*=\s*\w+\s*;`, message: "Stores one value in temp first" }] }),

    cq("Swap without a third variable", "Accept two numbers and interchange them without using a third variable (use + and -, or XOR).", ["Input: two integers a and b", "Output: a and b after the swap", "Declare only two variables"], String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    a = a + b;
    b = a - b;
    a = a - b;
    printf("After swap: a = %d, b = %d\n", a, b);
    return 0;
}
`, [["5 9", "9 5"], ["-1 3", "3 -1"]], [["0 7", "7 0"], ["250 -40", "-40 250"]], {
      rules: [
        { match: String.raw`\b([A-Za-z_]\w*)\s*=\s*\1\s*[-+^]|\b([A-Za-z_]\w*)\s*[-+^]=`, message: "Swaps with arithmetic (a = a + b) or XOR" },
        { notMatch: String.raw`\b(temp|tmp|t|c)\s*=`, message: "Doesn't use a third variable" },
      ],
    }),

    cq("Total and percentage of 5 subjects", "Accept the marks of 5 subjects (each out of 100), then calculate and print the total and the percentage.", ["Input: 5 integers", "Output line 1: the total", "Output line 2: the percentage with 2 decimals (total / 500 * 100)"], String.raw`#include <stdio.h>

int main(void) {
    int m1, m2, m3, m4, m5;
    scanf("%d %d %d %d %d", &m1, &m2, &m3, &m4, &m5);
    int total = m1 + m2 + m3 + m4 + m5;
    float percentage = total / 500.0f * 100;
    printf("Total = %d\n", total);
    printf("Percentage = %.2f\n", percentage);
    return 0;
}
`, [["80 70 90 60 50", "350 70.00"], ["100 100 100 100 100", "500 100.00"]], [["45 67 89 90 12", "303 60.60"], ["0 0 0 0 0", "0 0.00"]]),

    cq("Student report", "Accept a roll number, a name and the marks of English, Hindi and Marathi. Print all the details with the total marks and the percentage.", ["Input: roll number, name (one word), then 3 marks", "Output in this order: roll number, name, total, percentage with 2 decimals (out of 300)"], String.raw`#include <stdio.h>

int main(void) {
    int roll, eng, hin, mar;
    char name[50];
    scanf("%d %49s %d %d %d", &roll, name, &eng, &hin, &mar);
    int total = eng + hin + mar;
    printf("Roll no: %d\n", roll);
    printf("Name: %s\n", name);
    printf("Total: %d\n", total);
    printf("Percentage: %.2f\n", total / 3.0f);
    return 0;
}
`, [["12 Asha 78 85 90", "12 Asha 253 84.33"], ["7 Ravi 50 60 70", "7 Ravi 180 60.00"]], [["1 Kiran 100 100 100", "1 Kiran 300 100.00"], ["45 Meena 33 40 35", "45 Meena 108 36.00"]], { level: "intermediate" }),

    cq("Employee salary slip", "Accept an employee's id, name and basic salary. Calculate DA = 5%, HRA = 12%, TA = 8% of basic, gross salary = basic + DA + HRA + TA, income tax = 10% of basic and net salary = gross - tax.", ["Input: id, name (one word), basic salary", "Output in this order: id, name, DA, HRA, TA, gross salary, income tax, net salary (money with 2 decimals)"], String.raw`#include <stdio.h>

int main(void) {
    int id;
    char name[50];
    float basic;
    scanf("%d %49s %f", &id, name, &basic);
    float da = basic * 0.05f, hra = basic * 0.12f, ta = basic * 0.08f;
    float gross = basic + da + hra + ta;
    float tax = basic * 0.10f;
    printf("Id: %d\nName: %s\n", id, name);
    printf("DA: %.2f\nHRA: %.2f\nTA: %.2f\n", da, hra, ta);
    printf("Gross salary: %.2f\nIncome tax: %.2f\nNet salary: %.2f\n", gross, tax, gross - tax);
    return 0;
}
`, [["101 Ravi 20000", "101 Ravi 1000 2400 1600 25000 2000 23000"], ["7 Meena 35500", "7 Meena 1775 4260 2840 44375 3550 40825"]], [["1 Asha 10000", "1 Asha 500 1200 800 12500 1000 11500"], ["9 Om 0", "9 Om 0 0 0 0 0 0"]], { level: "intermediate" }),

    cq("Simple interest", "Accept the principal, the rate of interest (per year) and the time in years, and print the simple interest (p * r * t / 100).", ["Input: principal, rate, time (decimals allowed)", "Output: the simple interest with 2 decimals"], String.raw`#include <stdio.h>

int main(void) {
    float p, r, t;
    scanf("%f %f %f", &p, &r, &t);
    printf("Simple interest = %.2f\n", p * r * t / 100);
    return 0;
}
`, [["1000 5 2", "100.00"], ["5000 7.5 3", "1125.00"]], [["0 5 5", "0.00"], ["2500 10 1", "250.00"]]),

    cq("Celsius to Fahrenheit", "Accept a temperature in Celsius and print it in Fahrenheit (f = c * 9 / 5 + 32).", ["Input: a temperature in Celsius (decimals allowed)", "Output: the temperature in Fahrenheit with 2 decimals", "Watch out: 9 / 5 is 1 in integer maths"], String.raw`#include <stdio.h>

int main(void) {
    float c;
    scanf("%f", &c);
    printf("Fahrenheit = %.2f\n", c * 9 / 5 + 32);
    return 0;
}
`, [["100", "212.00"], ["37", "98.60"]], [["-40", "-40.00"], ["0", "32.00"]]),
  ],
  quiz: [
    { q: "Which header gives you printf and scanf?", options: ["<conio.h>", "<stdlib.h>", "<stdio.h>", "<string.h>"], answer: 2, why: "stdio.h is the standard input/output header. conio.h is Turbo C only." },
    { q: "What does main return in a standard C program?", options: ["void", "int", "char", "Nothing, it has no return type"], answer: 1, why: "main returns int; return 0 tells the system the program finished successfully." },
    { q: "Which placeholder reads a double with scanf?", options: ["%f", "%d", "%lf", "%ld"], answer: 2, why: "scanf needs %lf for double (and %f for float). printf accepts %f for both." },
    { q: "Why does scanf(\"%d\", &n) need the & ?", options: ["It makes the number positive", "scanf needs the address of n to store the value there", "It is only a style choice", "It converts text to a number"], answer: 1, why: "& gives the variable's address; scanf writes the value into that memory." },
    { q: "What is the value of 7 / 2 in C when both are ints?", options: ["3.5", "3", "4", "3.0"], answer: 1, why: "Integer division drops the decimals: 7 / 2 is 3." },
    { q: "What is 17 % 5?", options: ["3", "2", "3.4", "12"], answer: 1, why: "% gives the remainder: 17 = 3 * 5 + 2." },
    { q: "Which line declares a variable that can hold 3.75?", options: ["int x = 3.75;", "char x = 3.75;", "float x = 3.75;", "long x = 3.75;"], answer: 2, why: "Only floating-point types (float, double) keep decimals." },
    { q: "What does this print?\n\nint a = 5, b = 2;\nfloat c = a / b;\nprintf(\"%.1f\", c);", options: ["2.5", "2.0", "3.0", "Compile error"], answer: 1, why: "a / b is integer division (2) before it is stored in c, so c is 2.0. Write (float)a / b to get 2.5." },
    { q: "What does this print?\n\nprintf(\"%d\", 3 + 4 * 2);", options: ["14", "11", "10", "It depends on the compiler"], answer: 1, why: "Only the printf matters: * binds tighter than +, so 3 + 4 * 2 = 3 + 8 = 11." },
    { q: "The area of a triangle is written as area = 1/2 * b * h; with b = 4 and h = 6. What is area?", options: ["12", "0", "24", "12.0 only if area is float"], answer: 1, why: "1/2 is integer division and gives 0, so the whole product is 0. Use 0.5 * b * h." },
  ],
};
