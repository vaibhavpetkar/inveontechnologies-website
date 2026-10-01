import type { PracticeUnit } from "../../types.js";
import { cq, usesSwitch } from "./shared.js";

export const decisions: PracticeUnit = {
  key: "decisions",
  title: "Decisions: if, else if ladder and switch",
  summary: "if statements, nested if, multiple conditions with && and ||, the else-if ladder and switch-case menus",
  reading: String.raw`## The if statement

if runs a block only when its condition is true. In C, any non-zero value is true and 0 is false.

` + "```c" + String.raw`
if (age >= 18) {
    printf("Eligible to vote\n");
} else {
    printf("Not eligible to vote\n");
}
` + "```" + String.raw`

Comparison operators: == (equal), != (not equal), <, >, <=, >=.

The most common bug: writing = instead of ==. if (x = 5) stores 5 in x and is always true. The reviewer flags this line for you.

Another trap: a semicolon right after the condition. if (x > 0); ends the if there, so the block below always runs.

## Combining conditions

- && (and): both must be true. n % 7 == 0 && n % 5 == 0
- || (or): at least one must be true. ch == 'a' || ch == 'e'
- ! (not): reverses a condition. !(n > 0)

Leap year rule, written as one condition: a year is a leap year if it is divisible by 400, or divisible by 4 but not by 100.

` + "```c" + String.raw`
if (y % 400 == 0 || (y % 4 == 0 && y % 100 != 0))
    printf("Leap year\n");
else
    printf("Not a leap year\n");
` + "```" + String.raw`

## The else-if ladder

When there are several ranges, test them in order. The first true condition wins and the rest are skipped:

` + "```c" + String.raw`
if (marks >= 90)      printf("A\n");
else if (marks >= 75) printf("B\n");
else if (marks >= 60) printf("C\n");
else                  printf("F\n");
` + "```" + String.raw`

Because the checks run top to bottom, marks >= 75 only runs when marks < 90, so you don't need to write marks >= 75 && marks < 90.

## Nested if

An if inside another if. Use braces so it is clear which else belongs to which if; without braces, an else always pairs with the nearest if.

## Characters

A char is a small number (its ASCII code), so you can compare ranges: 'A' to 'Z' are 65 to 90 and 'a' to 'z' are 97 to 122.

` + "```c" + String.raw`
if (ch >= 'A' && ch <= 'Z') printf("Uppercase\n");
` + "```" + String.raw`

Read a single character with scanf(" %c", &ch); the space before %c skips any Enter left in the input.

## switch

switch picks a case by an exact value (int or char). Each case needs break, or execution falls through into the next case:

` + "```c" + String.raw`
switch (choice) {
    case 1:
        printf("Science\n");
        break;
    case 2:
        printf("Commerce\n");
        break;
    default:
        printf("Invalid choice\n");
}
` + "```" + String.raw`

Use switch for menus (1 = add, 2 = subtract ...) and for fixed values like operators ('+', '-'). Use if for ranges (age < 12), which switch can't express.

## Tips for the checker

Print the exact words the question asks for (for example "Even" or "Odd"). You can print a prompt before the answer, and labels like "Result:" are fine.`,
  questions: [
    cq("Greater than 100", "Accept a number and check whether it is greater than 100.", ["Input: one integer", "Output: Greater than 100, or Not greater than 100"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n > 100)
        printf("Greater than 100\n");
    else
        printf("Not greater than 100\n");
    return 0;
}
`, [["150", "Greater than 100", ["not"]], ["50", "Not greater than 100"]], [["100", "Not greater than 100"], ["101", "Greater than 100", ["not"]]]),

    cq("Eligible to vote", "Accept an age and check whether the person can vote (18 or older).", ["Input: an age", "Output: Eligible or Not eligible"], String.raw`#include <stdio.h>

int main(void) {
    int age;
    scanf("%d", &age);
    if (age >= 18)
        printf("Eligible\n");
    else
        printf("Not eligible\n");
    return 0;
}
`, [["20", "Eligible", ["not"]], ["15", "Not eligible"]], [["18", "Eligible", ["not"]], ["17", "Not eligible"]]),

    cq("Positive, negative or zero", "Accept a number and check whether it is positive, negative or zero.", ["Input: one integer", "Output: Positive, Negative or Zero"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n > 0)
        printf("Positive\n");
    else if (n < 0)
        printf("Negative\n");
    else
        printf("Zero\n");
    return 0;
}
`, [["5", "Positive", ["negative", "zero"]], ["-3", "Negative", ["positive", "zero"]]], [["0", "Zero", ["positive", "negative"]], ["1", "Positive", ["negative", "zero"]]]),

    cq("Odd or even", "Accept a number and check whether it is odd or even.", ["Input: one integer (it can be negative)", "Output: Even or Odd"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n % 2 == 0)
        printf("Even\n");
    else
        printf("Odd\n");
    return 0;
}
`, [["4", "Even", ["odd"]], ["7", "Odd", ["even"]]], [["0", "Even", ["odd"]], ["-3", "Odd", ["even"]]]),

    cq("Uppercase or lowercase", "Accept a character and check whether it is an uppercase letter, a lowercase letter or not a letter.", ["Input: one character", "Output: Uppercase, Lowercase or Not a letter", "Compare with 'A'..'Z' and 'a'..'z'"], String.raw`#include <stdio.h>

int main(void) {
    char ch;
    scanf(" %c", &ch);
    if (ch >= 'A' && ch <= 'Z')
        printf("Uppercase\n");
    else if (ch >= 'a' && ch <= 'z')
        printf("Lowercase\n");
    else
        printf("Not a letter\n");
    return 0;
}
`, [["A", "Uppercase", ["lowercase", "not"]], ["g", "Lowercase", ["uppercase", "not"]]], [["Z", "Uppercase", ["lowercase", "not"]], ["a", "Lowercase", ["uppercase", "not"]], ["5", "Not a letter", ["uppercase", "lowercase"]]]),

    cq("Divisible by 7 and 5", "Accept a number and check whether it is divisible by both 7 and 5.", ["Input: one integer", "Output: Divisible or Not divisible"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n % 7 == 0 && n % 5 == 0)
        printf("Divisible\n");
    else
        printf("Not divisible\n");
    return 0;
}
`, [["35", "Divisible", ["not"]], ["14", "Not divisible"]], [["70", "Divisible", ["not"]], ["5", "Not divisible"], ["0", "Divisible", ["not"]]]),

    cq("Vowel or consonant", "Accept a letter and check whether it is a vowel or a consonant. Upper and lower case both count.", ["Input: one letter", "Output: Vowel or Consonant"], String.raw`#include <stdio.h>

int main(void) {
    char ch;
    scanf(" %c", &ch);
    switch (ch) {
        case 'a': case 'e': case 'i': case 'o': case 'u':
        case 'A': case 'E': case 'I': case 'O': case 'U':
            printf("Vowel\n");
            break;
        default:
            printf("Consonant\n");
    }
    return 0;
}
`, [["a", "Vowel", ["consonant"]], ["b", "Consonant", ["vowel"]]], [["E", "Vowel", ["consonant"]], ["z", "Consonant", ["vowel"]], ["U", "Vowel", ["consonant"]]]),

    cq("Leap year", "Accept a year and check whether it is a leap year: divisible by 400, or divisible by 4 but not by 100.", ["Input: a year", "Output: Leap year or Not a leap year"], String.raw`#include <stdio.h>

int main(void) {
    int y;
    scanf("%d", &y);
    if (y % 400 == 0 || (y % 4 == 0 && y % 100 != 0))
        printf("Leap year\n");
    else
        printf("Not a leap year\n");
    return 0;
}
`, [["2024", "Leap year", ["not"]], ["2023", "Not a leap year"]], [["1900", "Not a leap year"], ["2000", "Leap year", ["not"]], ["2100", "Not a leap year"]]),

    cq("One, two or more digits", "Accept a non-negative number and say whether it has one digit, two digits or more than two digits.", ["Input: one integer (0 or more)", "Output: One digit, Two digits or More than two digits"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n <= 9)
        printf("One digit\n");
    else if (n <= 99)
        printf("Two digits\n");
    else
        printf("More than two digits\n");
    return 0;
}
`, [["7", "One digit", ["two", "more"]], ["42", "Two digits", ["one", "more"]]], [["0", "One digit", ["two", "more"]], ["99", "Two digits", ["one", "more"]], ["100", "More than two digits", ["one"]]]),

    cq("Biggest and smallest of three", "Accept 3 numbers and print the biggest and the smallest.", ["Input: three integers", "Output: the biggest first, then the smallest"], String.raw`#include <stdio.h>

int main(void) {
    int a, b, c;
    scanf("%d %d %d", &a, &b, &c);
    int big = a, small = a;
    if (b > big) big = b;
    if (c > big) big = c;
    if (b < small) small = b;
    if (c < small) small = c;
    printf("Biggest: %d\nSmallest: %d\n", big, small);
    return 0;
}
`, [["3 9 5", "9 3"], ["12 4 8", "12 4"]], [["-5 -2 -9", "-2 -9"], ["7 7 7", "7 7"], ["1 2 3", "3 1"]]),

    cq("Message by age", "Accept a person's age and print: below 12 \"Still a child\", below 21 \"Enjoy life, teenager\", below 40 \"You are a responsible adult\", below 70 \"Respected senior citizen\", otherwise \"Enough on earth, better to check out\". A negative age prints \"Invalid age\".", ["Input: an age", "Output: one of the six messages", "Use an else-if ladder"], String.raw`#include <stdio.h>

int main(void) {
    int age;
    scanf("%d", &age);
    if (age < 0)
        printf("Invalid age\n");
    else if (age < 12)
        printf("Still a child\n");
    else if (age < 21)
        printf("Enjoy life, teenager\n");
    else if (age < 40)
        printf("You are a responsible adult\n");
    else if (age < 70)
        printf("Respected senior citizen\n");
    else
        printf("Enough on earth, better to check out\n");
    return 0;
}
`, [["8", "Still a child"], ["16", "Enjoy life teenager"], ["30", "responsible adult"]], [["65", "Respected senior citizen"], ["85", "Enough on earth"], ["-4", "Invalid age"], ["12", "Enjoy life teenager"]], { level: "intermediate" }),

    cq("Type of triangle", "Accept three sides of a triangle and print its type. Check in this order: Not a triangle (a side is 0 or less, or one side is at least the sum of the other two), Equilateral, Isosceles, Right angled, otherwise Scalene.", ["Input: three integers", "Output: Not a triangle, Equilateral, Isosceles, Right angled or Scalene", "Right angled: the square of one side equals the sum of the squares of the other two"], String.raw`#include <stdio.h>

int main(void) {
    int a, b, c;
    scanf("%d %d %d", &a, &b, &c);
    if (a <= 0 || b <= 0 || c <= 0 || a + b <= c || a + c <= b || b + c <= a)
        printf("Not a triangle\n");
    else if (a == b && b == c)
        printf("Equilateral\n");
    else if (a == b || b == c || a == c)
        printf("Isosceles\n");
    else if (a * a + b * b == c * c || a * a + c * c == b * b || b * b + c * c == a * a)
        printf("Right angled\n");
    else
        printf("Scalene\n");
    return 0;
}
`, [["3 3 3", "Equilateral", ["isosceles", "scalene", "not"]], ["5 5 8", "Isosceles", ["equilateral", "scalene", "not"]], ["3 4 5", "Right angled", ["scalene", "not"]]], [["4 5 6", "Scalene", ["right", "not"]], ["5 3 4", "Right angled", ["scalene", "not"]], ["1 2 5", "Not a triangle"]], { level: "intermediate" }),

    cq("Subjects of a stream", "Show a menu 1. Science 2. Commerce 3. Arts, accept a choice and print the subjects of that stream using switch. Science: Physics Chemistry Maths Biology. Commerce: Accounts Economics Business Studies. Arts: History Geography Political Science. Any other choice: Invalid choice.", ["Input: a choice (1, 2 or 3)", "Output: the subjects of the stream", "Use switch"], String.raw`#include <stdio.h>

int main(void) {
    int choice;
    printf("1. Science\n2. Commerce\n3. Arts\nChoice: ");
    scanf("%d", &choice);
    switch (choice) {
        case 1:
            printf("Physics Chemistry Maths Biology\n");
            break;
        case 2:
            printf("Accounts Economics Business Studies\n");
            break;
        case 3:
            printf("History Geography Political Science\n");
            break;
        default:
            printf("Invalid choice\n");
    }
    return 0;
}
`, [["1", "Physics Chemistry Maths Biology"], ["3", "History Geography Political Science"]], [["2", "Accounts Economics Business Studies"], ["5", "Invalid choice"]], { rules: [usesSwitch] }),

    cq("Menu: positive or negative, odd or even", "Write a menu-driven program using switch. Option 1 checks whether a number is positive or negative (0 counts as positive), option 2 checks whether it is odd or even. Any other option prints Invalid choice.", ["Input: the option, then a number", "Output for 1: Positive or Negative", "Output for 2: Even or Odd", "Use switch"], String.raw`#include <stdio.h>

int main(void) {
    int choice, n;
    printf("1. Positive or negative\n2. Odd or even\nChoice and number: ");
    scanf("%d %d", &choice, &n);
    switch (choice) {
        case 1:
            printf(n >= 0 ? "Positive\n" : "Negative\n");
            break;
        case 2:
            printf(n % 2 == 0 ? "Even\n" : "Odd\n");
            break;
        default:
            printf("Invalid choice\n");
    }
    return 0;
}
`, [["1 -5", "Negative", ["positive"]], ["2 8", "Even", ["odd"]]], [["1 3", "Positive", ["negative"]], ["2 7", "Odd", ["even"]], ["9 4", "Invalid choice"]], { rules: [usesSwitch] }),

    cq("Grade from marks", "Accept marks out of 100 and print the grade: 90 and above A, 75 and above B, 60 and above C, 40 and above D, below 40 F. Marks below 0 or above 100 print Invalid marks.", ["Input: marks", "Output: A, B, C, D, F or Invalid marks"], String.raw`#include <stdio.h>

int main(void) {
    int m;
    scanf("%d", &m);
    if (m < 0 || m > 100) printf("Invalid marks\n");
    else if (m >= 90) printf("Grade A\n");
    else if (m >= 75) printf("Grade B\n");
    else if (m >= 60) printf("Grade C\n");
    else if (m >= 40) printf("Grade D\n");
    else printf("Grade F\n");
    return 0;
}
`, [["95", "A", ["invalid"]], ["62", "C", ["invalid"]]], [["75", "B", ["invalid"]], ["39", "F", ["invalid"]], ["40", "D", ["invalid"]], ["101", "Invalid"]]),

    cq("Calculator with switch", "Accept an expression like 8 + 2 (number, operator, number) and print the result with 2 decimals using switch on the operator (+ - * /). Dividing by 0 prints Cannot divide by zero; any other operator prints Invalid operator.", ["Input: a number, an operator and a number, separated by spaces", "Output: the result with 2 decimals", "Read the operator with scanf(\" %c\", &op)"], String.raw`#include <stdio.h>

int main(void) {
    float a, b;
    char op;
    scanf("%f %c %f", &a, &op, &b);
    switch (op) {
        case '+': printf("%.2f\n", a + b); break;
        case '-': printf("%.2f\n", a - b); break;
        case '*': printf("%.2f\n", a * b); break;
        case '/':
            if (b == 0) printf("Cannot divide by zero\n");
            else printf("%.2f\n", a / b);
            break;
        default: printf("Invalid operator\n");
    }
    return 0;
}
`, [["8 + 2", "10.00"], ["7 * 6", "42.00"]], [["9 - 12", "-3.00"], ["9 / 2", "4.50"], ["8 / 0", "Cannot divide by zero"], ["5 ^ 2", "Invalid operator"]], { level: "intermediate", rules: [usesSwitch] }),
  ],
  quiz: [
    { q: "Which operator checks whether two values are equal?", options: ["=", "==", "===", "!="], answer: 1, why: "== compares. = assigns a value." },
    { q: "In C, which values count as true in a condition?", options: ["Only 1", "Any non-zero value", "Only positive values", "Only the keyword true"], answer: 1, why: "0 is false and every other value is true." },
    { q: "Which condition means \"n is divisible by both 7 and 5\"?", options: ["n % 7 == 0 || n % 5 == 0", "n / 7 == 0 && n / 5 == 0", "n % 7 == 0 && n % 5 == 0", "n % 35 == 1"], answer: 2, why: "&& needs both parts true; % 7 == 0 means no remainder." },
    { q: "What happens if you leave out break at the end of a case?", options: ["Compile error", "The program stops", "Execution falls through into the next case", "The switch restarts"], answer: 2, why: "Without break, the statements of the following cases run too." },
    { q: "Which of these can switch NOT do directly?", options: ["Match a menu choice 1, 2, 3", "Match an operator '+', '-'", "Check a range like age < 12", "Have a default case"], answer: 2, why: "case labels are exact constant values; ranges need if/else." },
    { q: "Why write scanf(\" %c\", &ch) with a space before %c?", options: ["It reads two characters", "It skips spaces and the Enter left from earlier input", "It is required by the compiler", "It prints a space"], answer: 1, why: "The space skips whitespace, so %c doesn't read a leftover newline." },
    { q: "Which years are leap years?", options: ["Every year divisible by 4", "Divisible by 400, or by 4 but not by 100", "Divisible by 100", "Divisible by 4 and by 100"], answer: 1, why: "1900 is not a leap year, 2000 is." },
    { q: "What does this print?\n\nint x = 0;\nif (x = 5)\n    printf(\"yes\");\nelse\n    printf(\"no\");", options: ["no", "yes", "Compile error", "Nothing"], answer: 1, why: "x = 5 assigns 5, and 5 is non-zero (true), so it prints yes. It should be x == 5." },
    { q: "What does this print?\n\nint n = 5;\nif (n > 10);\n    printf(\"big\");", options: ["Nothing", "big", "Compile error", "5"], answer: 1, why: "The ; after the condition ends the if, so printf always runs." },
    { q: "What does this print?\n\nint a = 3;\nswitch (a) {\n    case 3: printf(\"three \");\n    case 4: printf(\"four \");\n    default: printf(\"other\");\n}", options: ["three", "three four", "three four other", "other"], answer: 2, why: "There is no break, so it falls through case 4 and default." },
  ],
};
