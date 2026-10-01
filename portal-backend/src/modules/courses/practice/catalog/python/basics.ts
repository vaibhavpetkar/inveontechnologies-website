import type { PracticeUnit } from "../../types.js";
import { pq } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "Basics: input, output and operators",
  summary: "variables, types, print and input, type conversion, arithmetic operators and f-strings",
  reading: String.raw`## Your first Python program

Python runs your file from top to bottom, one line at a time. There is no main function, no semicolons and no braces. A complete program can be a single line:

` + "```python" + String.raw`
print("Hello, Inveon!")
` + "```" + String.raw`

- print() is a function, so the brackets are required. print "hi" is Python 2 and is a syntax error in Python 3.
- Python is case-sensitive: print works, Print does not.
- A # starts a comment that runs to the end of the line.
- Indentation (4 spaces) has meaning in Python. At the top level, lines must start at column 0.

## Variables and types

A variable is a name that points to a value. You don't declare a type; Python works it out from the value, and a name can later point to a value of another type.

- int: whole numbers of any size (5, -12, 10**30 all work, no overflow).
- float: decimals (3.14, 2.0, 1e-3).
- str: text in single or double quotes ("Asha", 'Pune').
- bool: True or False (capital T and F).
- None: "no value yet".

Use type(x) to see a value's type. Names use snake_case: total_marks, not TotalMarks.

## Reading input

input() always returns a string, even when the user types a number. Convert it before doing maths:

` + "```python" + String.raw`
name = input()                 # "Ravi"
age = int(input())             # "21" -> 21
price = float(input())         # "99.5" -> 99.5
a, b = map(int, input().split())   # "4 5" on one line -> 4 and 5
` + "```" + String.raw`

The most common beginner bug is forgetting int(): "4" + "5" is "45", not 9. Another is reading two numbers typed on one line with two input() calls; the first call takes the whole line. Use input().split() for values on the same line.

## Printing output

print() accepts any number of values and puts a space between them. The end and sep arguments change what goes between and after:

` + "```python" + String.raw`
total = 253
percent = 84.3333
print("Total:", total)                 # Total: 253
print(f"Percentage: {percent:.2f}")    # Percentage: 84.33
print(1, 2, 3, sep="-")                # 1-2-3
print("no newline", end="")
` + "```" + String.raw`

f-strings (an f before the quote) are the modern way to format: put any expression in braces, and add a format after a colon. :.2f gives 2 decimals, :>8 right-aligns in 8 characters, :, adds thousands separators.

## Operators

- + - * as usual. / always gives a float: 7 / 2 is 3.5 and 6 / 2 is 3.0.
- // is floor division: 7 // 2 is 3. With negatives it rounds down: -7 // 2 is -4.
- % is the remainder: 17 % 5 is 2. n % 10 gives the last digit of n.
- ** is power: 2 ** 10 is 1024. There is no ^ for power; ^ is bitwise XOR.
- divmod(a, b) returns (a // b, a % b) in one step.
- Comparison operators (== != < > <= >=) give a bool. Logical operators are the words and, or, not.
- x += 5 is short for x = x + 5. Python has no ++ operator.

Precedence: ** first, then * / // %, then + and -. Use brackets when in doubt.

## Rounding

round(2.675, 2) can give 2.67 because floats are stored in binary and 2.675 is really 2.67499999... For printing, prefer an f-string format like {value:.2f}. For money in real applications, use the decimal module.

## Swapping values

Python can assign several names at once, so a swap needs no temporary variable:

` + "```python" + String.raw`
a, b = b, a
` + "```" + String.raw`

## How your assignments are checked

Upload one .py file per question. The reviewer reads your code first (it catches Python 2 print, raw_input, missing colons, mixed tabs and spaces, and doing maths on input() without int()). Then your program is run with python3 and the test inputs are typed into input(). You may print prompts like "Enter a number:"; the checker looks for the words and numbers of the answer in order, and 10.5 matches 10.50. Read each value exactly as the question describes the input: values on one line need input().split().`,
  questions: [
    pq("Greet the user", "Read a name and greet the person.", ["Input: one line with a name", "Output: Hello, <name>! Welcome to Inveon."], String.raw`name = input().strip()
print(f"Hello, {name}! Welcome to Inveon.")
`, [["Asha", "Hello, Asha! Welcome to Inveon."], ["Ravi Kumar", "Hello, Ravi Kumar! Welcome to Inveon."]], [["Z", "Hello, Z! Welcome to Inveon."], ["Meena", "Hello, Meena! Welcome to Inveon."]]),

    pq("Sum and average of three numbers", "Read three whole numbers on one line and print their sum and their average.", ["Input: three integers separated by spaces", "Output line 1: the sum", "Output line 2: the average with 2 decimals"], String.raw`a, b, c = map(int, input().split())
total = a + b + c
print("Sum:", total)
print(f"Average: {total / 3:.2f}")
`, [["10 20 30", "60 20.00"], ["1 2 2", "5 1.67"]], [["0 0 0", "0 0.00"], ["-5 10 1", "6 2.00"]]),

    pq("Simple interest", "Read the principal, the yearly rate of interest and the time in years, and print the simple interest (p * r * t / 100) and the total amount.", ["Input: three numbers on one line (decimals allowed)", "Output line 1: the simple interest with 2 decimals", "Output line 2: the total amount (principal + interest) with 2 decimals"], String.raw`p, r, t = map(float, input().split())
interest = p * r * t / 100
print(f"Interest: {interest:.2f}")
print(f"Amount: {p + interest:.2f}")
`, [["1000 5 2", "100.00 1100.00"], ["5000 7.5 3", "1125.00 6125.00"]], [["0 5 5", "0.00 0.00"], ["2500 10 1", "250.00 2750.00"]]),

    pq("Celsius to Fahrenheit", "Read a temperature in Celsius and print it in Fahrenheit (f = c * 9 / 5 + 32).", ["Input: a temperature in Celsius (decimals allowed)", "Output: the temperature in Fahrenheit with 2 decimals"], String.raw`c = float(input())
f = c * 9 / 5 + 32
print(f"Fahrenheit: {f:.2f}")
`, [["100", "212.00"], ["37", "98.60"]], [["-40", "-40.00"], ["0", "32.00"]]),

    pq("Swap two numbers", "Read two numbers and swap them using Python's multiple assignment (no third variable).", ["Input: two integers a and b on one line", "Output: a and b after the swap, e.g. 7 3 for input 3 7", "Use a, b = b, a"], String.raw`a, b = map(int, input().split())
a, b = b, a
print(a, b)
`, [["3 7", "7 3"], ["10 -2", "-2 10"]], [["5 5", "5 5"], ["0 100", "100 0"]], { rules: [{ match: String.raw`\b(\w+)\s*,\s*(\w+)\s*=\s*\2\s*,\s*\1\b`, message: "Swaps with a, b = b, a" }] }),

    pq("Minutes to hours and minutes", "Read a number of minutes and print it as hours and minutes.", ["Input: a whole number of minutes", "Output: <h> hours <m> minutes, e.g. 2 hours 5 minutes for 125", "Use // and % (or divmod)"], String.raw`total = int(input())
hours, minutes = divmod(total, 60)
print(f"{hours} hours {minutes} minutes")
`, [["125", "2 hours 5 minutes"], ["60", "1 hours 0 minutes"]], [["59", "0 hours 59 minutes"], ["1440", "24 hours 0 minutes"]]),

    pq("Sum of digits of a three-digit number", "Read a three-digit number and print the sum of its digits, using // and % only (no strings).", ["Input: an integer from 100 to 999", "Output: the sum of its three digits", "Hint: n % 10 is the last digit, n // 10 drops it"], String.raw`n = int(input())
ones = n % 10
tens = n // 10 % 10
hundreds = n // 100
print("Sum of digits:", ones + tens + hundreds)
`, [["123", "6"], ["907", "16"]], [["100", "1"], ["999", "27"]], { rules: [{ match: "%", message: "Uses the % operator" }, { notMatch: String.raw`\bstr\s*\(`, message: "Doesn't convert the number to a string" }] }),

    pq("Compound interest", "Read the principal, the yearly rate and the number of years, and print the amount with yearly compounding: amount = p * (1 + r / 100) ** n.", ["Input: principal and rate (decimals allowed) and years (whole number), on one line", "Output line 1: the amount with 2 decimals", "Output line 2: the compound interest (amount - principal) with 2 decimals", "Use ** for power"], String.raw`p, r, n = input().split()
p = float(p)
r = float(r)
n = int(n)
amount = p * (1 + r / 100) ** n
print(f"Amount: {amount:.2f}")
print(f"Interest: {amount - p:.2f}")
`, [["1000 10 2", "1210.00 210.00"], ["5000 8 3", "6298.56 1298.56"]], [["1000 0 5", "1000.00 0.00"], ["20000 12.5 1", "22500.00 2500.00"]], { level: "intermediate", rules: [{ match: String.raw`\*\*`, message: "Uses the ** power operator" }] }),

    pq("Division operators", "Read two integers a and b and show how Python's division operators behave.", ["Input: two integers a and b on one line (b is not 0)", "Output line 1: a / b with 2 decimals", "Output line 2: a // b", "Output line 3: a % b", "Output line 4: a ** 2", "Note: // rounds down, so -7 // 2 is -4, and -7 % 2 is 1", "Print only these four values, one per line, with no labels"], String.raw`a, b = map(int, input().split())
print(f"{a / b:.2f}")
print(a // b)
print(a % b)
print(a ** 2)
`, [["7 2", "3.50\n3\n1\n49"], ["10 5", "2.00\n2\n0\n100"]], [["-7 2", "-3.50\n-4\n1\n49"], ["7 -2", "-3.50\n-4\n-1\n49"]], { level: "intermediate", match: "exact" }),

    pq("Split the bill with GST", "A group of friends shares a restaurant bill. Read the bill amount, the GST rate in percent and the number of people, and print the total with GST and each person's share.", ["Input: amount (decimal), GST percent (decimal) and people (whole number) on one line", "Output line 1: the total with GST, 2 decimals", "Output line 2: the share per person, 2 decimals"], String.raw`amount, gst, people = input().split()
amount = float(amount)
gst = float(gst)
people = int(people)
total = amount * (1 + gst / 100)
print(f"Total: {total:.2f}")
print(f"Each pays: {total / people:.2f}")
`, [["1000 5 4", "1050.00 262.50"], ["2360 18 3", "2784.80 928.27"]], [["99.99 0 1", "99.99 99.99"], ["500 12 5", "560.00 112.00"]], { level: "intermediate" }),
  ],
  quiz: [
    { q: "What type does input() return when the user types 42?", options: ["int", "float", "str", "It depends on what is typed"], answer: 2, why: "input() always returns a string; convert it with int() or float()." },
    { q: "What does print(7 / 2) show in Python 3?", options: ["3", "3.5", "4", "3.0"], answer: 1, why: "/ is true division and always gives a float." },
    { q: "What is 2 ** 3 ** 2?", options: ["64", "512", "36", "Syntax error"], answer: 1, why: "** is right-associative: 3 ** 2 is 9, then 2 ** 9 is 512." },
    { q: "Which line reads two integers typed on one line like 4 5?", options: ["a, b = int(input()), int(input())", "a, b = map(int, input().split())", "a, b = input(int)", "a = b = int(input())"], answer: 1, why: "split() breaks the line at spaces and map(int, ...) converts each part." },
    { q: "What does print(\"4\" + \"5\") print?", options: ["9", "45", "\"4\"\"5\"", "TypeError"], answer: 1, why: "+ on two strings joins them." },
    { q: "What does print(1, 2, 3, sep=\"-\", end=\"!\") print?", options: ["1 2 3!", "1-2-3!", "1-2-3-!", "123!"], answer: 1, why: "sep goes between the values and end replaces the newline at the end." },
    { q: "What is the value of x after x = 5 then x += 2 * 3?", options: ["21", "11", "13", "Error: Python has no +="], answer: 1, why: "x += 2 * 3 means x = x + 6, so 11." },
    { q: "What does print(-7 // 2, -7 % 2) print?", options: ["-3 -1", "-4 1", "-3 1", "-4 -1"], answer: 1, why: "// rounds down (towards minus infinity) to -4, and the remainder takes the sign of the divisor: -7 = -4 * 2 + 1." },
    { q: "What does this print?\n\nx = input()   # the user types 5\nprint(x * 3)", options: ["15", "555", "TypeError", "5 5 5"], answer: 1, why: "x is the string \"5\"; multiplying a string by 3 repeats it." },
    { q: "Which prints 3.14 for pi = 3.14159?", options: ["print(f\"{pi:2f}\")", "print(f\"{pi:.2f}\")", "print(\"{pi:.2f}\")", "print(f\"{pi}.2f\")"], answer: 1, why: "The format spec goes after a colon, .2f means 2 decimals, and the string needs the f prefix." },
  ],
};
