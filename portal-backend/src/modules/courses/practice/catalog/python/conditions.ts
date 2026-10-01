import type { PracticeUnit } from "../../types.js";
import { pq, usesIf } from "./shared.js";

export const conditions: PracticeUnit = {
  key: "conditions",
  title: "Conditions: if, elif, else and match",
  summary: "comparisons, and/or/not, if-elif-else chains, nested conditions, truthiness and match-case",
  reading: String.raw`## Making decisions with if

An if statement runs a block only when its condition is True. The line ends with a colon, and the block under it is indented by 4 spaces. Python has no braces: indentation is how it knows what belongs to the if.

` + "```python" + String.raw`
marks = int(input())
if marks >= 35:
    print("Pass")
else:
    print("Fail")
print("Done")   # not indented: always runs
` + "```" + String.raw`

For more than two cases use elif (short for "else if"). Python checks the conditions from top to bottom and runs only the first block whose condition is True:

` + "```python" + String.raw`
if marks >= 90:
    grade = "A"
elif marks >= 75:
    grade = "B"
elif marks >= 50:
    grade = "C"
else:
    grade = "F"
` + "```" + String.raw`

Order matters. If you test marks >= 50 first, a 95 would get a C, because that branch matches first and the rest are skipped.

## Comparison and logical operators

- == equal, != not equal, < > <= >=.
- and: both sides must be True. or: at least one. not: flips True and False.
- Python allows chained comparisons: 18 <= age <= 60 means age >= 18 and age <= 60.
- in checks membership: ch in "aeiou" is True for a vowel.

A single = is assignment, not comparison. Writing if x = 5: is a syntax error in Python (which is good: C would silently accept it).

## Truthiness

Every value can be used as a condition. These count as False: 0, 0.0, "" (empty string), [] and {} (empty collections) and None. Everything else is True. So if name: means "if name is not empty". Compare with None using is: if result is None:.

## Nested conditions

You can put an if inside another if. Keep nesting shallow: two levels are fine, four are hard to read. Often and/or gives a flatter version:

` + "```python" + String.raw`
# nested
if year % 4 == 0:
    if year % 100 != 0 or year % 400 == 0:
        print("Leap year")
# flat
leap = year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)
` + "```" + String.raw`

## The conditional expression

For a simple choice between two values, Python has a one-line form: value_if_true if condition else value_if_false.

` + "```python" + String.raw`
status = "Adult" if age >= 18 else "Minor"
` + "```" + String.raw`

## match-case (Python 3.10+)

match compares one value against several patterns, like switch in C or Java, but there is no fall-through and no break:

` + "```python" + String.raw`
match op:
    case "+":
        result = a + b
    case "-":
        result = a - b
    case "*" | "x":
        result = a * b
    case _:
        result = None   # _ matches anything (the default)
` + "```" + String.raw`

## Common mistakes

- Forgetting the colon at the end of if, elif or else.
- Mixing tabs and spaces for indentation. Use 4 spaces everywhere.
- Comparing text with numbers: input() gives "5", and "5" == 5 is False.
- Writing if x == 1 or 2: which is always True, because 2 on its own is truthy. Write if x == 1 or x == 2: or if x in (1, 2):.
- Comparing floats with ==: 0.1 + 0.2 == 0.3 is False. Use abs(a - b) < 1e-9 or math.isclose.

## How your assignments are checked

Each program is run with several inputs, including edge cases such as 0, negative numbers and boundaries like exactly 35 marks, so test every branch yourself. For yes/no style answers (Even/Odd, Leap year/Not a leap year) the checker also makes sure the wrong answer's words are not in your last line of output, so print one clear answer.`,
  questions: [
    pq("Even or odd", "Read an integer and print whether it is even or odd.", ["Input: one integer", "Output: Even or Odd"], String.raw`n = int(input())
if n % 2 == 0:
    print("Even")
else:
    print("Odd")
`, [["4", "Even", ["odd"]], ["7", "Odd", ["even"]]], [["0", "Even", ["odd"]], ["-3", "Odd", ["even"]]], { rules: [usesIf] }),

    pq("Positive, negative or zero", "Read a number and say whether it is positive, negative or zero.", ["Input: one number (decimals allowed)", "Output: Positive, Negative or Zero"], String.raw`x = float(input())
if x > 0:
    print("Positive")
elif x < 0:
    print("Negative")
else:
    print("Zero")
`, [["5", "Positive"], ["-2.5", "Negative"]], [["0", "Zero", ["positive", "negative"]], ["0.001", "Positive"]], { rules: [usesIf] }),

    pq("Largest of three numbers", "Read three integers and print the largest, using if/elif/else (not max()).", ["Input: three integers on one line", "Output: the largest one"], String.raw`a, b, c = map(int, input().split())
if a >= b and a >= c:
    largest = a
elif b >= c:
    largest = b
else:
    largest = c
print("Largest:", largest)
`, [["3 9 5", "9"], ["10 2 7", "10"]], [["-1 -8 -3", "-1"], ["4 4 4", "4"], ["1 2 3", "3"]], { rules: [usesIf, { notMatch: String.raw`\bmax\s*\(`, message: "Doesn't use max()" }] }),

    pq("Leap year", "Read a year and print whether it is a leap year. A year is a leap year if it is divisible by 400, or divisible by 4 but not by 100.", ["Input: a year", "Output: Leap year or Not a leap year"], String.raw`year = int(input())
if year % 400 == 0 or (year % 4 == 0 and year % 100 != 0):
    print("Leap year")
else:
    print("Not a leap year")
`, [["2024", "Leap year", ["not"]], ["2023", "Not a leap year"]], [["1900", "Not a leap year"], ["2000", "Leap year", ["not"]], ["2100", "Not a leap year"]]),

    pq("Grade from marks", "Read marks out of 100 and print the grade: 90 and above A, 75 to 89 B, 50 to 74 C, 35 to 49 D, below 35 F. Marks outside 0 to 100 are invalid.", ["Input: marks (whole number)", "Output: Grade <letter>, e.g. Grade B", "Output Invalid marks when the marks are below 0 or above 100"], String.raw`marks = int(input())
if marks < 0 or marks > 100:
    print("Invalid marks")
elif marks >= 90:
    print("Grade A")
elif marks >= 75:
    print("Grade B")
elif marks >= 50:
    print("Grade C")
elif marks >= 35:
    print("Grade D")
else:
    print("Grade F")
`, [["95", "Grade A"], ["62", "Grade C"]], [["75", "Grade B"], ["34", "Grade F"], ["35", "Grade D"], ["101", "Invalid marks", ["grade"]], ["-1", "Invalid marks", ["grade"]]], { rules: [{ match: String.raw`\belif\b`, message: "Uses elif" }] }),

    pq("Type of triangle", "Read three side lengths and print the type of triangle. First check it is a valid triangle: every side must be positive and each side must be less than the sum of the other two.", ["Input: three integers on one line", "Output: Equilateral, Isosceles, Scalene or Invalid"], String.raw`a, b, c = map(int, input().split())
if min(a, b, c) <= 0 or a + b <= c or a + c <= b or b + c <= a:
    print("Invalid")
elif a == b == c:
    print("Equilateral")
elif a == b or b == c or a == c:
    print("Isosceles")
else:
    print("Scalene")
`, [["3 3 3", "Equilateral"], ["3 4 5", "Scalene"]], [["5 5 8", "Isosceles"], ["1 2 3", "Invalid"], ["0 4 4", "Invalid"], ["7 4 7", "Isosceles"]], { level: "intermediate" }),

    pq("Vowel, consonant or other", "Read a single character and say whether it is a vowel, a consonant or not a letter. Treat upper and lower case the same.", ["Input: one character", "Output: Vowel, Consonant or Not a letter", "Hint: ch.isalpha() and ch.lower() in \"aeiou\""], String.raw`ch = input().strip()
if not ch.isalpha():
    print("Not a letter")
elif ch.lower() in "aeiou":
    print("Vowel")
else:
    print("Consonant")
`, [["a", "Vowel"], ["K", "Consonant"]], [["E", "Vowel"], ["7", "Not a letter", ["vowel", "consonant"]], ["z", "Consonant"]]),

    pq("Electricity bill", "Read the units consumed and print the bill using slabs: the first 100 units cost 5 rupees each, the next 100 units (101 to 200) cost 7 each, and every unit above 200 costs 10. A fixed charge of 50 is added to every bill.", ["Input: units (whole number, 0 or more)", "Output: Bill: <amount>", "Example: 250 units = 100*5 + 100*7 + 50*10 + 50 = 1750"], String.raw`units = int(input())
if units <= 100:
    bill = units * 5
elif units <= 200:
    bill = 100 * 5 + (units - 100) * 7
else:
    bill = 100 * 5 + 100 * 7 + (units - 200) * 10
bill += 50
print("Bill:", bill)
`, [["250", "1750"], ["80", "450"]], [["0", "50"], ["100", "550"], ["200", "1250"], ["201", "1260"]], { level: "intermediate" }),

    pq("Calculator with match-case", "Read two numbers and an operator (+, -, *, /) and print the result, using match-case to pick the operation.", ["Input line 1: two numbers on one line", "Input line 2: the operator", "Output: the result with 2 decimals", "Print Cannot divide by zero for division by 0, and Unknown operator for anything else"], String.raw`a, b = map(float, input().split())
op = input().strip()
match op:
    case "+":
        print(f"{a + b:.2f}")
    case "-":
        print(f"{a - b:.2f}")
    case "*":
        print(f"{a * b:.2f}")
    case "/":
        if b == 0:
            print("Cannot divide by zero")
        else:
            print(f"{a / b:.2f}")
    case _:
        print("Unknown operator")
`, [["6 4\n+", "10.00"], ["7 2\n/", "3.50"]], [["5 0\n/", "Cannot divide by zero"], ["3 3\n*", "9.00"], ["1 9\n-", "-8.00"], ["2 2\n%", "Unknown operator"]], { level: "intermediate", rules: [{ match: String.raw`^\s*match\s+\w+\s*:`, flags: "m", message: "Uses match-case" }] }),

    pq("Roots of a quadratic equation", "Read a, b and c of ax^2 + bx + c = 0 (a is not 0) and print the roots. Use the discriminant d = b*b - 4ac: if d > 0 there are two real roots, if d == 0 one repeated root, and if d < 0 the roots are complex.", ["Input: three integers a b c on one line", "d > 0: Real and different: <r1> <r2>, the larger root first, 2 decimals", "d == 0: Real and equal: <r>, 2 decimals", "d < 0: Complex roots: <real part> <imaginary part>, the imaginary part positive, 2 decimals"], String.raw`import math

a, b, c = map(int, input().split())
d = b * b - 4 * a * c
if d > 0:
    r1 = (-b + math.sqrt(d)) / (2 * a)
    r2 = (-b - math.sqrt(d)) / (2 * a)
    print(f"Real and different: {max(r1, r2):.2f} {min(r1, r2):.2f}")
elif d == 0:
    print(f"Real and equal: {-b / (2 * a):.2f}")
else:
    real = -b / (2 * a)
    imag = math.sqrt(-d) / (2 * abs(a))
    print(f"Complex roots: {real:.2f} {imag:.2f}")
`, [["1 -3 2", "Real and different: 2.00 1.00"], ["1 2 1", "Real and equal: -1.00"]], [["1 2 5", "Complex roots: -1.00 2.00"], ["2 -7 3", "Real and different: 3.00 0.50"], ["-1 0 4", "Real and different: 2.00 -2.00"]], { level: "advanced" }),
  ],
  quiz: [
    { q: "What must end the line of an if, elif or else?", options: ["A semicolon", "A colon", "A closing brace", "Nothing"], answer: 1, why: "Python block headers end with a colon, and the block below is indented." },
    { q: "Which values are all falsy in Python?", options: ["0, \"\", [], None", "0, \"0\", [], None", "False, \"False\", 0", "None only"], answer: 0, why: "Zero, empty strings and collections, and None are falsy; \"0\" is a non-empty string, so it is truthy." },
    { q: "What does 18 <= age <= 60 mean?", options: ["It is a syntax error", "age >= 18 and age <= 60", "(18 <= age) <= 60, comparing True with 60", "age is 18 or 60"], answer: 1, why: "Python chains comparisons, so the expression checks both conditions." },
    { q: "How many branches of an if/elif/elif/else chain can run?", options: ["All whose conditions are True", "At most one", "Exactly two", "None, unless there is a break"], answer: 1, why: "Only the first branch whose condition is True runs; the rest are skipped." },
    { q: "What does this print?\n\nx = 0\nif x:\n    print(\"yes\")\nelse:\n    print(\"no\")", options: ["yes", "no", "0", "Nothing"], answer: 1, why: "0 is falsy, so the else branch runs." },
    { q: "Which line is the correct conditional expression?", options: ["status = age >= 18 ? \"Adult\" : \"Minor\"", "status = \"Adult\" if age >= 18 else \"Minor\"", "status = if age >= 18 \"Adult\" else \"Minor\"", "status = (age >= 18) and \"Adult\" else \"Minor\""], answer: 1, why: "Python writes it as value if condition else other; there is no ?: operator." },
    { q: "In match-case, what does case _: do?", options: ["Matches only an underscore", "Matches anything that no earlier case matched", "Raises an error", "Falls through to the next case"], answer: 1, why: "_ is the wildcard pattern, the default branch." },
    { q: "A student writes: if x == 1 or 2: print(\"one or two\"). What happens for x = 5?", options: ["Nothing is printed", "It prints one or two", "SyntaxError", "TypeError"], answer: 1, why: "The condition is (x == 1) or 2, and 2 is truthy, so it is always True. Write x in (1, 2)." },
    { q: "What does this print?\n\nprint(0.1 + 0.2 == 0.3, abs(0.1 + 0.2 - 0.3) < 1e-9)", options: ["True True", "False True", "False False", "True False"], answer: 1, why: "Floats are binary approximations, so 0.1 + 0.2 is 0.30000000000000004; compare with a tolerance." },
    { q: "What does this print?\n\nmarks = 95\nif marks >= 50:\n    print(\"C\")\nelif marks >= 90:\n    print(\"A\")\nelse:\n    print(\"F\")", options: ["A", "C", "C then A", "F"], answer: 1, why: "The first True branch wins; marks >= 50 is checked first, so the A branch is never reached. Test the highest boundary first." },
  ],
};
