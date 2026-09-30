import type { PracticeUnit } from "../../types.js";
import { pq, usesLoop } from "./shared.js";

const usesWhile = { match: String.raw`^\s*while\b`, flags: "m", message: "Uses a while loop" };

export const loops: PracticeUnit = {
  key: "loops",
  title: "Loops: for, while and range",
  summary: "for loops over range and sequences, while loops, break, continue, loop else, nested loops and patterns",
  reading: String.raw`## Repeating with for and range

A for loop runs its block once for each item in a sequence. range() produces a sequence of numbers:

- range(5) gives 0, 1, 2, 3, 4 (the end is not included).
- range(1, 6) gives 1 to 5.
- range(10, 0, -2) gives 10, 8, 6, 4, 2 (a negative step counts down).

` + "```python" + String.raw`
n = int(input())
total = 0
for i in range(1, n + 1):
    total += i
print("Sum:", total)
` + "```" + String.raw`

The classic off-by-one bug is range(1, n) when you meant 1 to n: the stop value is never reached, so write range(1, n + 1).

for also walks over strings, lists and other collections directly, with no index needed: for ch in "hello": gives one character at a time. When you need both the position and the item, use enumerate: for i, name in enumerate(names, start=1):.

## while loops

A while loop repeats as long as its condition is True. Use it when you don't know in advance how many times to repeat, for example while processing the digits of a number:

` + "```python" + String.raw`
n = int(input())
reverse = 0
while n > 0:
    reverse = reverse * 10 + n % 10
    n //= 10
print(reverse)
` + "```" + String.raw`

Make sure something inside the loop moves the condition towards False. If you forget n //= 10 above, the loop never ends and the checker stops your program after 5 seconds.

## break, continue and loop else

- break leaves the loop immediately.
- continue skips the rest of this round and moves to the next item.
- A loop can have an else block. It runs only if the loop finished without a break. This is perfect for searches:

` + "```python" + String.raw`
for d in range(2, int(n ** 0.5) + 1):
    if n % d == 0:
        print("Not prime")
        break
else:
    print("Prime")
` + "```" + String.raw`

(Remember that 0 and 1 are not prime; handle them before the loop.)

## Nested loops and patterns

A loop inside a loop runs the inner loop completely for every round of the outer loop. Rows and columns are the usual picture: the outer loop picks the row and the inner loop prints the columns. Python can often replace the inner loop with string repetition:

` + "```python" + String.raw`
rows = 3
for i in range(1, rows + 1):
    print(" " * (rows - i) + "*" * (2 * i - 1))
` + "```" + String.raw`

prints a pyramid of 1, 3 and 5 stars. print(..., end=" ") keeps the output on the same line when you do need an inner loop.

## Useful built-ins

sum(range(1, n + 1)), max(), min() and len() replace many hand-written loops in real code. In the assignments, some questions ask you to write the loop yourself so you learn how it works; the rules shown with the question say when.

## Performance notes

- Checking divisors up to the square root of n is enough to test for a prime, which turns a million steps into a thousand.
- Euclid's algorithm finds a GCD in a handful of steps: while b: a, b = b, a % b.
- Building a long string with += in a loop is slow; collect pieces in a list and use " ".join(parts).

## Common mistakes

- Off-by-one ranges (range(n) starts at 0, and stops before n).
- Changing the loop variable inside a for loop does not change the next value; for takes the next item anyway.
- An infinite while loop because the variable is never updated.
- Printing inside the loop when only the final result should be printed.

## How your assignments are checked

Your program is run with several inputs including small edge cases (n = 0 or 1, a single digit, a prime like 2). Pattern questions are compared exactly, line by line, so print only the pattern, with no prompt and no trailing spaces. Rules may require a for or while loop, so solve those questions with a loop rather than a formula.`,
  questions: [
    pq("Multiplication table", "Read a number n and print its multiplication table from 1 to 10.", ["Input: one integer n", "Output: 10 lines in the form n x i = product, e.g. 5 x 3 = 15", "Print only the table"], String.raw`n = int(input())
for i in range(1, 11):
    print(f"{n} x {i} = {n * i}")
`, [["5", "5 x 1 = 5\n5 x 2 = 10\n5 x 3 = 15\n5 x 4 = 20\n5 x 5 = 25\n5 x 6 = 30\n5 x 7 = 35\n5 x 8 = 40\n5 x 9 = 45\n5 x 10 = 50"]], [["12", "12 x 1 = 12\n12 x 2 = 24\n12 x 3 = 36\n12 x 4 = 48\n12 x 5 = 60\n12 x 6 = 72\n12 x 7 = 84\n12 x 8 = 96\n12 x 9 = 108\n12 x 10 = 120"], ["-2", "-2 x 1 = -2\n-2 x 2 = -4\n-2 x 3 = -6\n-2 x 4 = -8\n-2 x 5 = -10\n-2 x 6 = -12\n-2 x 7 = -14\n-2 x 8 = -16\n-2 x 9 = -18\n-2 x 10 = -20"]], { match: "exact", rules: [usesLoop] }),

    pq("Sum of even and odd numbers", "Read n and print the sum of the even numbers and the sum of the odd numbers from 1 to n, using one loop.", ["Input: one integer n (0 or more)", "Output line 1: Even sum: <value>", "Output line 2: Odd sum: <value>"], String.raw`n = int(input())
even = 0
odd = 0
for i in range(1, n + 1):
    if i % 2 == 0:
        even += i
    else:
        odd += i
print("Even sum:", even)
print("Odd sum:", odd)
`, [["10", "Even sum: 30 Odd sum: 25"], ["5", "Even sum: 6 Odd sum: 9"]], [["0", "Even sum: 0 Odd sum: 0"], ["1", "Even sum: 0 Odd sum: 1"]], { rules: [usesLoop] }),

    pq("Factorial", "Read n and print n! (n factorial) using a loop. 0! is 1. Python integers never overflow, so 25! works.", ["Input: one integer n (0 or more)", "Output: n!"], String.raw`n = int(input())
fact = 1
for i in range(2, n + 1):
    fact *= i
print(f"{n}! = {fact}")
`, [["5", "120"], ["0", "1"]], [["1", "1"], ["20", "2432902008176640000"], ["25", "15511210043330985984000000"]], { rules: [usesLoop, { notMatch: String.raw`math\.factorial|from\s+math\s+import`, message: "Doesn't use math.factorial" }] }),

    pq("Fibonacci series", "Read n and print the first n terms of the Fibonacci series (0 1 1 2 3 5 ...) on one line, separated by spaces.", ["Input: one integer n (1 or more)", "Output: the first n terms on one line"], String.raw`n = int(input())
a, b = 0, 1
terms = []
for _ in range(n):
    terms.append(str(a))
    a, b = b, a + b
print(" ".join(terms))
`, [["7", "0 1 1 2 3 5 8"], ["1", "0"]], [["2", "0 1"], ["12", "0 1 1 2 3 5 8 13 21 34 55 89"]], { rules: [usesLoop] }),

    pq("Prime number check", "Read n and print whether it is prime. Check divisors only up to the square root of n, and use a loop with break (a for-else is welcome).", ["Input: one integer n", "Output: Prime or Not prime", "0 and 1 (and negatives) are not prime"], String.raw`n = int(input())
if n < 2:
    print("Not prime")
else:
    for d in range(2, int(n ** 0.5) + 1):
        if n % d == 0:
            print("Not prime")
            break
    else:
        print("Prime")
`, [["7", "Prime", ["not"]], ["12", "Not prime"]], [["2", "Prime", ["not"]], ["1", "Not prime"], ["97", "Prime", ["not"]], ["49", "Not prime"], ["1000003", "Prime", ["not"]]], { level: "intermediate", rules: [usesLoop, { match: String.raw`\bbreak\b`, message: "Stops early with break" }] }),

    pq("Reverse a number", "Read a positive integer and print its digits reversed, using a while loop with // and % (no strings).", ["Input: one positive integer", "Output: the reversed number (1200 becomes 21)"], String.raw`n = int(input())
rev = 0
while n > 0:
    rev = rev * 10 + n % 10
    n //= 10
print("Reversed:", rev)
`, [["1234", "4321"], ["1200", "21"]], [["7", "7"], ["90817", "71809"]], { rules: [usesWhile, { notMatch: String.raw`\bstr\s*\(|\[::-1\]`, message: "Doesn't use strings to reverse" }] }),

    pq("Armstrong number", "An Armstrong number equals the sum of its digits each raised to the power of the number of digits (153 = 1^3 + 5^3 + 3^3). Read n and say whether it is an Armstrong number.", ["Input: one non-negative integer", "Output: Armstrong number or Not an Armstrong number"], String.raw`n = int(input())
digits = len(str(n))
total = 0
temp = n
while temp > 0:
    total += (temp % 10) ** digits
    temp //= 10
if total == n:
    print("Armstrong number")
else:
    print("Not an Armstrong number")
`, [["153", "Armstrong number", ["not"]], ["123", "Not an Armstrong number"]], [["9474", "Armstrong number", ["not"]], ["10", "Not an Armstrong number"], ["9", "Armstrong number", ["not"]]], { level: "intermediate", rules: [usesLoop] }),

    pq("Star pyramid", "Read the number of rows and print a centred pyramid of stars. Row i has (rows - i) spaces and then 2*i - 1 stars, with no spaces after the stars.", ["Input: rows (1 or more)", "Output: the pyramid only, e.g. for 3 rows: two spaces and 1 star, one space and 3 stars, then 5 stars", "No trailing spaces"], String.raw`rows = int(input())
for i in range(1, rows + 1):
    print(" " * (rows - i) + "*" * (2 * i - 1))
`, [["3", "  *\n ***\n*****"]], [["1", "*"], ["5", "    *\n   ***\n  *****\n *******\n*********"]], { match: "exact", rules: [usesLoop] }),

    pq("Number triangle", "Read n and print a triangle where row i contains the numbers 1 to i separated by spaces.", ["Input: n (1 or more)", "Output: n lines; line i is 1 2 ... i", "Print only the triangle, no trailing spaces"], String.raw`n = int(input())
for i in range(1, n + 1):
    print(" ".join(str(j) for j in range(1, i + 1)))
`, [["4", "1\n1 2\n1 2 3\n1 2 3 4"]], [["1", "1"], ["6", "1\n1 2\n1 2 3\n1 2 3 4\n1 2 3 4 5\n1 2 3 4 5 6"]], { match: "exact", rules: [usesLoop] }),

    pq("GCD and LCM", "Read two positive integers and print their GCD using Euclid's algorithm in a while loop, then their LCM (a * b // gcd).", ["Input: two positive integers on one line", "Output line 1: GCD: <value>", "Output line 2: LCM: <value>", "Don't use math.gcd"], String.raw`a, b = map(int, input().split())
x, y = a, b
while y:
    x, y = y, x % y
print("GCD:", x)
print("LCM:", a * b // x)
`, [["12 18", "GCD: 6 LCM: 36"], ["7 5", "GCD: 1 LCM: 35"]], [["100 25", "GCD: 25 LCM: 100"], ["1 1", "GCD: 1 LCM: 1"], ["1071 462", "GCD: 21 LCM: 23562"]], { level: "intermediate", rules: [usesWhile, { notMatch: String.raw`\bgcd\s*\(`, message: "Doesn't use math.gcd" }] }),

    pq("Primes in a range", "Read two numbers low and high and print every prime between them (both included) on one line, then how many there are. Use nested loops.", ["Input: low and high on one line (low <= high)", "Output line 1: the primes separated by spaces (print None if there are none)", "Output line 2: Count: <number>"], String.raw`low, high = map(int, input().split())
primes = []
for n in range(max(low, 2), high + 1):
    for d in range(2, int(n ** 0.5) + 1):
        if n % d == 0:
            break
    else:
        primes.append(n)
print(" ".join(map(str, primes)) if primes else "None")
print("Count:", len(primes))
`, [["10 30", "11 13 17 19 23 29\nCount: 6"], ["1 10", "2 3 5 7\nCount: 4"]], [["24 28", "None\nCount: 0"], ["2 2", "2\nCount: 1"], ["90 110", "97 101 103 107 109\nCount: 5"]], { level: "advanced", rules: [usesLoop] }),
  ],
  quiz: [
    { q: "Which numbers does range(2, 10, 3) produce?", options: ["2, 5, 8", "2, 5, 8, 11", "3, 6, 9", "2, 4, 6, 8"], answer: 0, why: "Start at 2, step 3, stop before 10." },
    { q: "How many times does the body of for i in range(5): run?", options: ["4", "5", "6", "It depends on i"], answer: 1, why: "range(5) is 0, 1, 2, 3, 4: five values." },
    { q: "What does continue do inside a loop?", options: ["Ends the loop", "Skips the rest of the current round and goes to the next", "Restarts the loop from the beginning", "Nothing; it is a comment"], answer: 1, why: "continue jumps to the next iteration; break leaves the loop." },
    { q: "Which loop never stops?", options: ["for i in range(10):", "while n > 0:\n    n //= 10", "while n > 0:\n    print(n)", "for ch in \"abc\":"], answer: 2, why: "n never changes inside the loop, so the condition stays True." },
    { q: "What does this print?\n\nfor i in range(3):\n    pass\nprint(i)", options: ["3", "2", "NameError", "0"], answer: 1, why: "The loop variable keeps its last value, 2, after the loop ends." },
    { q: "What does enumerate([\"a\", \"b\"], start=1) give?", options: ["(1, 'a'), (2, 'b')", "(0, 'a'), (1, 'b')", "'a', 'b'", "1, 2"], answer: 0, why: "enumerate pairs each item with a counter, here starting at 1." },
    { q: "What does this print?\n\nfor i in range(3):\n    i += 10\n    print(i, end=\" \")", options: ["10 21 32", "10 11 12", "10", "0 1 2"], answer: 1, why: "Changing i doesn't affect the loop; each round takes the next value from range." },
    { q: "When does the else block of a for loop run?", options: ["When the loop body raises an error", "Only when the loop ends without break", "Always, after the loop", "Only if the loop never ran"], answer: 1, why: "Loop else runs when the loop finishes normally; a break skips it (it also runs for an empty loop)." },
    { q: "What does this print?\n\ncount = 0\nfor i in range(1, 4):\n    for j in range(i):\n        count += 1\nprint(count)", options: ["3", "6", "9", "4"], answer: 1, why: "The inner loop runs 1, 2 and 3 times: 1 + 2 + 3 = 6." },
    { q: "Why is checking divisors only up to int(n ** 0.5) enough for a prime test?", options: ["Because primes are always small", "If n = a * b with a <= b, then a <= sqrt(n), so a divisor would be found by then", "Because ** is faster than *", "It isn't; it misses some composite numbers"], answer: 1, why: "Every factor pair has one member at most the square root, so no smaller divisor means no divisor at all." },
  ],
};
