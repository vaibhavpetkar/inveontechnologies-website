import type { PracticeUnit } from "../../types.js";
import { cq, usesLoop } from "./shared.js";

const noIf = { notMatch: String.raw`\bif\s*\(|\?`, message: "Doesn't use if (or ?:)" };
const exactPattern = ["Input: n (the number of rows)", "Output: only the pattern, no prompt (it is compared line by line)"];

export const loops: PracticeUnit = {
  key: "loops",
  title: "Loops: while, do-while, for, break and continue",
  summary: "counting loops, loops that depend on input, digit tricks (reverse, sum of digits), prime numbers, series and patterns",
  reading: String.raw`## Why loops

A loop repeats a block. Instead of writing printf ten times, you write it once inside a loop that runs ten times.

## The for loop

Use for when you know how many times to repeat. It has three parts: start; condition; step.

` + "```c" + String.raw`
for (int i = 1; i <= 10; i++) {
    printf("%d ", i);
}
` + "```" + String.raw`

- The start runs once (int i = 1).
- The condition is checked before every round (i <= 10). When it is false, the loop ends.
- The step runs after every round (i++).

Counting down: for (int i = n; i >= 1; i--). Counting in twos: i += 2, which prints even numbers without any if.

## The while loop

Use while when you repeat until something happens, and don't know the count in advance, for example taking a number apart digit by digit:

` + "```c" + String.raw`
int n = 1234, sum = 0;
while (n > 0) {
    sum += n % 10;   /* last digit */
    n /= 10;         /* drop the last digit */
}
/* sum is 10 */
` + "```" + String.raw`

n % 10 gives the last digit and n / 10 removes it. The same idea reverses a number: rev = rev * 10 + n % 10.

## The do-while loop

do-while checks its condition after the block, so the block always runs at least once. It is handy for menus that repeat until the user chooses Exit. Note the semicolon after while (...) at the end.

` + "```c" + String.raw`
do {
    printf("1. Play 2. Exit\n");
    scanf("%d", &choice);
} while (choice != 2);
` + "```" + String.raw`

## break and continue

- break leaves the loop immediately. Useful when you have found what you were looking for, like a divisor that proves a number is not prime.
- continue skips the rest of this round and goes to the next.

## Common loop bugs

- A semicolon after the header: for (i = 0; i < n; i++); runs an empty loop and the block below runs once.
- Forgetting to start the total at 0 (int sum; holds garbage).
- Off by one: i < n runs n times starting from 0; i <= n starts from 1.
- An infinite loop: the condition never becomes false (for example, forgetting n /= 10). The checker stops a program after 5 seconds.

## Prime numbers

A number n greater than 1 is prime when no number from 2 to the square root of n divides it. Stop as soon as you find a divisor:

` + "```c" + String.raw`
int prime = n > 1;
for (int d = 2; d * d <= n; d++) {
    if (n % d == 0) { prime = 0; break; }
}
` + "```" + String.raw`

## Patterns with nested loops

A pattern is a loop inside a loop: the outer loop picks the row, the inner loop prints that row.

` + "```c" + String.raw`
for (int i = 1; i <= n; i++) {        /* rows */
    for (int j = 1; j <= i; j++)      /* i stars on row i */
        printf("*");
    printf("\n");
}
` + "```" + String.raw`

For pattern questions the checker compares your output line by line, so don't print a prompt, and don't leave extra spaces at the start of lines unless the pattern has them.

For letters, remember that 'a' + 1 is 'b': printf("%c", 'a' + j) prints the j-th letter.`,
  questions: [
    cq("Numbers from 1 to 10", "Print all numbers from 1 to 10 using a loop.", ["No input", "Output: 1 2 3 4 5 6 7 8 9 10"], String.raw`#include <stdio.h>

int main(void) {
    for (int i = 1; i <= 10; i++)
        printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["", "1 2 3 4 5 6 7 8 9 10"]], [["", "1 2 3 4 5 6 7 8 9 10"]], { rules: [usesLoop] }),

    cq("Countdown from n", "Accept n and print the numbers from n down to 1.", ["Input: n", "Output: n, n-1, ... 1"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = n; i >= 1; i--)
        printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["10", "10 9 8 7 6 5 4 3 2 1"], ["3", "3 2 1"]], [["1", "1"], ["6", "6 5 4 3 2 1"]], { rules: [usesLoop] }),

    cq("Even numbers without if", "Accept n and print all even numbers from 1 to n without using an if statement.", ["Input: n", "Output: the even numbers up to n", "Hint: start at 2 and add 2 each time"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 2; i <= n; i += 2)
        printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["20", "2 4 6 8 10 12 14 16 18 20"], ["7", "2 4 6"]], [["10", "2 4 6 8 10"], ["2", "2"]], { rules: [usesLoop, noIf] }),

    cq("Odd numbers without if", "Accept n and print all odd numbers from 1 to n without using an if statement.", ["Input: n", "Output: the odd numbers up to n"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i += 2)
        printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["20", "1 3 5 7 9 11 13 15 17 19"], ["6", "1 3 5"]], [["1", "1"], ["9", "1 3 5 7 9"]], { rules: [usesLoop, noIf] }),

    cq("Divisible by 3 and 5", "Accept n and print all numbers from 1 to n that are divisible by both 3 and 5.", ["Input: n", "Output: the numbers, in increasing order"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++)
        if (i % 3 == 0 && i % 5 == 0)
            printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["50", "15 30 45"], ["20", "15"]], [["100", "15 30 45 60 75 90"], ["45", "15 30 45"]], { rules: [usesLoop] }),

    cq("Multiplication table", "Accept a number and print its multiplication table from 1 to 10, one line per row, like 5 x 1 = 5.", ["Input: a number", "Output: 10 lines, n x i = n*i"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= 10; i++)
        printf("%d x %d = %d\n", n, i, n * i);
    return 0;
}
`, [["5", "5 1 5 5 2 10 5 3 15 5 4 20 5 5 25 5 6 30 5 7 35 5 8 40 5 9 45 5 10 50"], ["12", "12 1 12 12 2 24 12 3 36 12 4 48 12 5 60 12 6 72 12 7 84 12 8 96 12 9 108 12 10 120"]], [["1", "1 1 1 1 2 2 1 3 3 1 4 4 1 5 5 1 6 6 1 7 7 1 8 8 1 9 9 1 10 10"], ["-3", "-3 1 -3 -3 2 -6 -3 3 -9 -3 4 -12 -3 5 -15 -3 6 -18 -3 7 -21 -3 8 -24 -3 9 -27 -3 10 -30"]], { rules: [usesLoop] }),

    cq("Even numbers in a range", "Accept two numbers a and b (a <= b) and print all even numbers from a to b.", ["Input: a and b", "Output: the even numbers from a to b, in order"], String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    for (int i = a; i <= b; i++)
        if (i % 2 == 0)
            printf("%d ", i);
    printf("\n");
    return 0;
}
`, [["3 12", "4 6 8 10 12"], ["10 15", "10 12 14"]], [["7 8", "8"], ["-4 4", "-4 -2 0 2 4"]], { rules: [usesLoop] }),

    cq("Reverse a number", "Accept a number and print it reversed (1234 becomes 4321).", ["Input: a non-negative integer", "Output: the reversed number", "Use % 10 and / 10 in a loop"], String.raw`#include <stdio.h>

int main(void) {
    int n, rev = 0;
    scanf("%d", &n);
    while (n > 0) {
        rev = rev * 10 + n % 10;
        n /= 10;
    }
    printf("Reverse = %d\n", rev);
    return 0;
}
`, [["1234", "4321"], ["908", "809"]], [["5", "5"], ["1200", "21"], ["100001", "100001"]], { rules: [usesLoop] }),

    cq("Sum of digits", "Accept a number and print the sum of its digits.", ["Input: a non-negative integer", "Output: the sum of its digits"], String.raw`#include <stdio.h>

int main(void) {
    int n, sum = 0;
    scanf("%d", &n);
    while (n > 0) {
        sum += n % 10;
        n /= 10;
    }
    printf("Sum of digits = %d\n", sum);
    return 0;
}
`, [["1234", "10"], ["9999", "36"]], [["0", "0"], ["100", "1"], ["505", "10"]], { rules: [usesLoop] }),

    cq("Print a name n times", "Accept a name and a number n, and print the name n times, one per line.", ["Input: a name (one word) and n", "Output: the name n times"], String.raw`#include <stdio.h>

int main(void) {
    char name[50];
    int n;
    scanf("%49s %d", name, &n);
    for (int i = 0; i < n; i++)
        printf("%s\n", name);
    return 0;
}
`, [["Asha 3", "Asha Asha Asha"], ["Ravi 1", "Ravi"]], [["Kiran 5", "Kiran Kiran Kiran Kiran Kiran"], ["Om 2", "Om Om"]], { rules: [usesLoop] }),

    cq("Prime or not", "Accept a number and check whether it is prime.", ["Input: an integer n (n >= 0)", "Output: Prime or Not prime", "0 and 1 are not prime"], String.raw`#include <stdio.h>

int main(void) {
    int n, prime;
    scanf("%d", &n);
    prime = n > 1;
    for (int d = 2; d * d <= n; d++) {
        if (n % d == 0) {
            prime = 0;
            break;
        }
    }
    printf(prime ? "Prime\n" : "Not prime\n");
    return 0;
}
`, [["7", "Prime", ["not"]], ["12", "Not prime"]], [["1", "Not prime"], ["2", "Prime", ["not"]], ["97", "Prime", ["not"]], ["91", "Not prime"]], { rules: [usesLoop] }),

    cq("Prime numbers up to n", "Accept n and print all prime numbers from 1 to n.", ["Input: n", "Output: the primes up to n, in order"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 2; i <= n; i++) {
        int prime = 1;
        for (int d = 2; d * d <= i; d++) {
            if (i % d == 0) {
                prime = 0;
                break;
            }
        }
        if (prime) printf("%d ", i);
    }
    printf("\n");
    return 0;
}
`, [["50", "2 3 5 7 11 13 17 19 23 29 31 37 41 43 47"], ["10", "2 3 5 7"]], [["2", "2"], ["30", "2 3 5 7 11 13 17 19 23 29"]], { level: "intermediate", rules: [usesLoop] }),

    cq("Fibonacci series", "Accept n and print the first n terms of the Fibonacci series, starting 0 1 1 2 3 ...", ["Input: n (1 or more)", "Output: n terms"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    long long a = 0, b = 1;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        printf("%lld ", a);
        long long next = a + b;
        a = b;
        b = next;
    }
    printf("\n");
    return 0;
}
`, [["7", "0 1 1 2 3 5 8"], ["1", "0"]], [["10", "0 1 1 2 3 5 8 13 21 34"], ["2", "0 1"]], { rules: [usesLoop] }),

    cq("Factorial", "Accept n and print n! (n factorial = 1 * 2 * ... * n). 0! is 1.", ["Input: n (0 to 20)", "Output: n!", "Use long long: 20! is very large"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    long long fact = 1;
    scanf("%d", &n);
    for (int i = 2; i <= n; i++)
        fact *= i;
    printf("Factorial = %lld\n", fact);
    return 0;
}
`, [["5", "120"], ["0", "1"]], [["10", "3628800"], ["1", "1"], ["20", "2432902008176640000"]], { rules: [usesLoop] }),

    cq("Armstrong number", "Accept a number and check whether it is an Armstrong number: the sum of its digits, each raised to the number of digits, equals the number (153 = 1^3 + 5^3 + 3^3).", ["Input: a positive integer", "Output: Armstrong number or Not an Armstrong number"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    int digits = 0, t = n;
    while (t > 0) {
        digits++;
        t /= 10;
    }
    int sum = 0;
    t = n;
    while (t > 0) {
        int d = t % 10, p = 1;
        for (int i = 0; i < digits; i++) p *= d;
        sum += p;
        t /= 10;
    }
    printf(sum == n ? "Armstrong number\n" : "Not an Armstrong number\n");
    return 0;
}
`, [["153", "Armstrong number", ["not"]], ["123", "Not an Armstrong number"]], [["370", "Armstrong number", ["not"]], ["9474", "Armstrong number", ["not"]], ["10", "Not an Armstrong number"]], { level: "intermediate", rules: [usesLoop] }),

    cq("Palindrome number", "Accept a number and check whether it reads the same backwards (121, 1221).", ["Input: a non-negative integer", "Output: Palindrome or Not a palindrome"], String.raw`#include <stdio.h>

int main(void) {
    int n, rev = 0;
    scanf("%d", &n);
    int t = n;
    while (t > 0) {
        rev = rev * 10 + t % 10;
        t /= 10;
    }
    printf(rev == n ? "Palindrome\n" : "Not a palindrome\n");
    return 0;
}
`, [["121", "Palindrome", ["not"]], ["123", "Not a palindrome"]], [["7", "Palindrome", ["not"]], ["1221", "Palindrome", ["not"]], ["10", "Not a palindrome"]], { rules: [usesLoop] }),

    cq("GCD and LCM", "Accept two positive numbers and print their GCD (greatest common divisor) and LCM (least common multiple).", ["Input: two positive integers", "Output: the GCD, then the LCM", "Hint: Euclid's algorithm, and LCM = a * b / GCD"], String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    int x = a, y = b;
    while (y != 0) {
        int r = x % y;
        x = y;
        y = r;
    }
    printf("GCD = %d\nLCM = %d\n", x, a / x * b);
    return 0;
}
`, [["12 18", "6 36"], ["7 5", "1 35"]], [["20 100", "20 100"], ["9 9", "9 9"], ["21 6", "3 42"]], { level: "intermediate", rules: [usesLoop] }),

    cq("Pattern: 1, 12, 123", "Accept n and print this pattern (for n = 4):\n1\n12\n123\n1234", exactPattern, String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++)
            printf("%d", j);
        printf("\n");
    }
    return 0;
}
`, [["4", "1\n12\n123\n1234"]], [["1", "1"], ["6", "1\n12\n123\n1234\n12345\n123456"]], { match: "exact", rules: [usesLoop] }),

    cq("Pattern: 1, 22, 333", "Accept n and print this pattern (for n = 4):\n1\n22\n333\n4444", exactPattern, String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++)
            printf("%d", i);
        printf("\n");
    }
    return 0;
}
`, [["4", "1\n22\n333\n4444"]], [["2", "1\n22"], ["5", "1\n22\n333\n4444\n55555"]], { match: "exact", rules: [usesLoop] }),

    cq("Pattern: star triangle", "Accept n and print a right triangle of stars (for n = 4):\n*\n**\n***\n****", exactPattern, String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++)
            printf("*");
        printf("\n");
    }
    return 0;
}
`, [["4", "*\n**\n***\n****"]], [["1", "*"], ["6", "*\n**\n***\n****\n*****\n******"]], { match: "exact", rules: [usesLoop] }),

    cq("Pattern: star pyramid", "Accept n and print a pyramid of stars with a space between stars (for n = 4):\n   *\n  * *\n * * *\n* * * *", ["Input: n (the number of rows)", "Row i starts with n - i spaces", "Output: only the pattern, compared line by line (spaces at the end of a line are ignored)"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        for (int s = 0; s < n - i; s++)
            printf(" ");
        for (int j = 1; j <= i; j++)
            printf(j < i ? "* " : "*");
        printf("\n");
    }
    return 0;
}
`, [["4", "   *\n  * *\n * * *\n* * * *"]], [["1", "*"], ["3", "  *\n * *\n* * *"]], { level: "intermediate", match: "exact", rules: [usesLoop] }),

    cq("Pattern: a, bb, ccc", "Accept n and print this pattern (for n = 4):\na\nbb\nccc\ndddd", exactPattern, String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        for (int j = 0; j <= i; j++)
            printf("%c", 'a' + i);
        printf("\n");
    }
    return 0;
}
`, [["4", "a\nbb\nccc\ndddd"]], [["1", "a"], ["5", "a\nbb\nccc\ndddd\neeeee"]], { match: "exact", rules: [usesLoop] }),

    cq("Pattern: a, ab, abc", "Accept n and print this pattern (for n = 4):\na\nab\nabc\nabcd", exactPattern, String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        for (int j = 0; j <= i; j++)
            printf("%c", 'a' + j);
        printf("\n");
    }
    return 0;
}
`, [["4", "a\nab\nabc\nabcd"]], [["2", "a\nab"], ["6", "a\nab\nabc\nabcd\nabcde\nabcdef"]], { match: "exact", rules: [usesLoop] }),

    cq("Pattern: a, bc, def", "Accept n and print this pattern, continuing the alphabet (for n = 4):\na\nbc\ndef\nghij", exactPattern, String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    char ch = 'a';
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++)
            printf("%c", ch++);
        printf("\n");
    }
    return 0;
}
`, [["4", "a\nbc\ndef\nghij"]], [["1", "a"], ["5", "a\nbc\ndef\nghij\nklmno"]], { level: "intermediate", match: "exact", rules: [usesLoop] }),

    cq("Menu until exit (do-while)", "Keep reading numbers until the user enters 0, then print how many numbers were entered (not counting the 0) and their sum. Use a do-while loop.", ["Input: numbers, ending with 0", "Output: the count, then the sum", "Use do { ... } while (...);"], String.raw`#include <stdio.h>

int main(void) {
    int n, count = 0, sum = 0;
    do {
        scanf("%d", &n);
        if (n != 0) {
            count++;
            sum += n;
        }
    } while (n != 0);
    printf("Count = %d\nSum = %d\n", count, sum);
    return 0;
}
`, [["5 10 15 0", "3 30"], ["0", "0 0"]], [["-4 4 7 0", "3 7"], ["100 0", "1 100"]], { level: "intermediate", rules: [{ match: String.raw`\bdo\s*\{[\s\S]*\}\s*while\s*\(`, message: "Uses a do-while loop" }] }),
  ],
  quiz: [
    { q: "How many times does this loop run?\n\nfor (int i = 0; i < 5; i++)", options: ["4", "5", "6", "Forever"], answer: 1, why: "i takes 0, 1, 2, 3, 4: five rounds." },
    { q: "Which loop always runs its body at least once?", options: ["for", "while", "do-while", "None of them"], answer: 2, why: "do-while checks the condition after the body." },
    { q: "What does break do inside a loop?", options: ["Skips to the next round", "Leaves the loop immediately", "Stops the program", "Restarts the loop"], answer: 1, why: "break exits the nearest loop (or switch)." },
    { q: "What does continue do?", options: ["Leaves the loop", "Skips the rest of this round and starts the next one", "Pauses the program", "Repeats the same round"], answer: 1, why: "continue jumps to the next round (for a for loop, the step runs first)." },
    { q: "For n = 5271, what is n % 10 and n / 10?", options: ["1 and 527", "5 and 271", "527 and 1", "1 and 527.1"], answer: 0, why: "% 10 is the last digit; integer / 10 drops it." },
    { q: "Which loop prints the even numbers from 2 to 20 without an if?", options: ["for (i = 1; i <= 20; i++)", "for (i = 2; i <= 20; i += 2)", "for (i = 0; i < 20; i *= 2)", "while (i % 2)"], answer: 1, why: "Starting at 2 and adding 2 visits only even numbers." },
    { q: "Why test divisors only while d * d <= n when checking for a prime?", options: ["It is required by C", "If n has a divisor bigger than its square root, it also has one smaller", "It makes the answer approximate", "Squares are never prime"], answer: 1, why: "Divisors come in pairs d and n/d; one of them is at most sqrt(n). This makes the check much faster." },
    { q: "What does this print?\n\nint i;\nfor (i = 0; i < 3; i++);\nprintf(\"%d\", i);", options: ["012", "3", "0", "Nothing"], answer: 1, why: "The ; ends the for loop, which just counts i up to 3. printf then runs once and prints 3." },
    { q: "What does this print?\n\nint i = 10;\nwhile (i < 5) {\n    printf(\"%d \", i);\n    i++;\n}\nprintf(\"done\");", options: ["10 done", "done", "10 11 12 13 14 done", "An infinite loop"], answer: 1, why: "10 < 5 is false at the start, so the body never runs." },
    { q: "How many stars does this print?\n\nfor (int i = 1; i <= 4; i++)\n    for (int j = 1; j <= i; j++)\n        printf(\"*\");", options: ["4", "8", "10", "16"], answer: 2, why: "Row i prints i stars: 1 + 2 + 3 + 4 = 10." },
  ],
};
