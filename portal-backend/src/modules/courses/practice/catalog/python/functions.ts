import type { PracticeUnit } from "../../types.js";
import { pq } from "./shared.js";

const FN_STARTER = (header: string) => `${header}
    # Write the function body here
    pass


# Read the input, call the function and print the result
`;

export const functions: PracticeUnit = {
  key: "functions",
  title: "Functions, recursion and lambdas",
  summary: "def and return, parameters and default values, *args and **kwargs, scope, recursion, lambdas with sorted, map and filter",
  reading: String.raw`## Defining a function

A function is a named block of code that you can call many times. def introduces it, the parameters go in brackets, and return sends a value back to the caller:

` + "```python" + String.raw`
def area(length, breadth):
    return length * breadth

print(area(4, 5))    # 20
` + "```" + String.raw`

A function without a return statement returns None. A very common mistake is printing inside the function and then printing its result as well, which shows the answer followed by None. Let the function return the value and do the printing outside.

Define functions before the code that calls them, usually at the top of the file. Give them verb names in snake_case (is_prime, total_marks) and keep each one focused on one job.

## Parameters and arguments

- Positional arguments are matched by position: area(4, 5).
- Keyword arguments are matched by name and can be in any order: area(breadth=5, length=4).
- Default values make a parameter optional: def power(base, exp=2):. Parameters with defaults must come after those without.
- Never use a mutable default such as def add(item, bucket=[]). The list is created once, when the function is defined, and shared by every call. Use bucket=None and create the list inside.

## *args and **kwargs

*args collects any number of extra positional arguments into a tuple; **kwargs collects extra keyword arguments into a dict:

` + "```python" + String.raw`
def total(*numbers):
    return sum(numbers)

def profile(name, **details):
    for key, value in details.items():
        print(name, key, value)

total(1, 2, 3)                   # 6
profile("Asha", city="Pune", age=21)
` + "```" + String.raw`

The same stars unpack when calling: total(*[1, 2, 3]).

## Returning several values

return a, b returns a tuple, which the caller can unpack: low, high = min_max(nums).

## Scope

Variables created inside a function are local and disappear when it returns. A function can read a global variable, but assigning to that name inside the function creates a new local variable instead. Prefer passing values in as parameters and returning results; avoid the global keyword.

## Recursion

A recursive function calls itself on a smaller version of the problem. Every recursive function needs a base case that stops the calls:

` + "```python" + String.raw`
def factorial(n):
    if n <= 1:          # base case
        return 1
    return n * factorial(n - 1)
` + "```" + String.raw`

Without a base case (or if the problem doesn't get smaller), Python stops with RecursionError after about 1000 nested calls. Naive recursive Fibonacci repeats the same work exponentially many times; functools.lru_cache remembers earlier results and makes it instant:

` + "```python" + String.raw`
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
` + "```" + String.raw`

## Lambdas, map and filter

A lambda is a small unnamed function made of one expression: lambda x: x * x. Its best use is as a key for sorted, min and max:

` + "```python" + String.raw`
words.sort(key=lambda w: (len(w), w))    # by length, then alphabetically
evens = list(filter(lambda n: n % 2 == 0, nums))
squares = list(map(lambda n: n * n, nums))
` + "```" + String.raw`

A list comprehension is often clearer than map and filter; use whichever reads better. Don't assign a lambda to a name (square = lambda x: x * x); write a def instead.

## Docstrings and type hints

A string on the first line of a function documents it, and type hints say what it expects and returns. Python doesn't enforce hints, but editors and tools like mypy use them:

` + "```python" + String.raw`
def is_even(n: int) -> bool:
    """Return True if n is even."""
    return n % 2 == 0
` + "```" + String.raw`

## How your assignments are checked

These questions require the function named in the steps (a rule looks for its def) and then run your whole program with test inputs, so your file must also read the input, call the function and print the result. Recursion questions also check that the function calls itself.`,
  questions: [
    pq("Area function", "Write a function area(length, breadth) that returns the area of a rectangle, and a function perimeter(length, breadth). Read the sides and print both results.", ["Define area and perimeter with def and return (no printing inside them)", "Input: length and breadth on one line (integers)", "Output line 1: Area: <value>", "Output line 2: Perimeter: <value>"], String.raw`def area(length, breadth):
    return length * breadth


def perimeter(length, breadth):
    return 2 * (length + breadth)


l, b = map(int, input().split())
print("Area:", area(l, b))
print("Perimeter:", perimeter(l, b))
`, [["4 5", "Area: 20 Perimeter: 18"]], [["1 1", "Area: 1 Perimeter: 4"], ["12 7", "Area: 84 Perimeter: 38"]], { starter: FN_STARTER("def area(length, breadth):"), rules: [{ match: String.raw`def\s+area\s*\(`, message: "Defines area()" }, { match: String.raw`def\s+perimeter\s*\(`, message: "Defines perimeter()" }, { match: String.raw`\breturn\b`, message: "Returns the result" }] }),

    pq("Power with a default exponent", "Write power(base, exp=2) that returns base raised to exp, with exp defaulting to 2. Read a line with one or two numbers: if there is only a base, call power(base); otherwise call power(base, exp).", ["Define def power(base, exp=2):", "Input: one line with base, or base and exponent", "Output: the result"], String.raw`def power(base, exp=2):
    return base ** exp


values = list(map(int, input().split()))
if len(values) == 1:
    print(power(values[0]))
else:
    print(power(values[0], values[1]))
`, [["5", "25"], ["2 10", "1024"]], [["-3", "9"], ["7 0", "1"], ["3 3", "27"]], { starter: FN_STARTER("def power(base, exp=2):"), rules: [{ match: String.raw`def\s+power\s*\(\s*\w+\s*,\s*\w+\s*=\s*2\s*\)`, message: "power has a default exponent of 2" }] }),

    pq("Prime function", "Write is_prime(n) returning True or False, then use it to print all primes up to n.", ["Define is_prime(n) that returns a bool", "Input: n", "Output: the primes from 2 to n separated by spaces (print None when there are none)"], String.raw`def is_prime(n):
    if n < 2:
        return False
    for d in range(2, int(n ** 0.5) + 1):
        if n % d == 0:
            return False
    return True


n = int(input())
primes = [str(k) for k in range(2, n + 1) if is_prime(k)]
print(" ".join(primes) if primes else "None")
`, [["20", "2 3 5 7 11 13 17 19"], ["1", "None"]], [["2", "2"], ["50", "2 3 5 7 11 13 17 19 23 29 31 37 41 43 47"]], { starter: FN_STARTER("def is_prime(n):"), rules: [{ match: String.raw`def\s+is_prime\s*\(`, message: "Defines is_prime()" }, { match: String.raw`return\s+(True|False)`, message: "Returns True or False" }] }),

    pq("Recursive factorial", "Write factorial(n) recursively: it must call itself, with a base case for 0 and 1.", ["Define factorial(n) that calls factorial(n - 1)", "Input: n (0 to 50)", "Output: n!"], String.raw`def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


n = int(input())
print(factorial(n))
`, [["5", "120"], ["0", "1"]], [["1", "1"], ["30", "265252859812191058636308480000000"]], { starter: FN_STARTER("def factorial(n):"), rules: [{ match: String.raw`def\s+factorial\s*\([\s\S]*\breturn\b[^\n]*\bfactorial\s*\(`, message: "factorial calls itself" }, { notMatch: String.raw`^\s*(for|while)\b`, flags: "m", message: "Uses recursion, not a loop" }] }),

    pq("Recursive sum of digits", "Write digit_sum(n) that returns the sum of the digits of a non-negative integer using recursion (n % 10 plus the digit sum of n // 10).", ["Define digit_sum(n) that calls itself", "Input: a non-negative integer", "Output: the sum of its digits"], String.raw`def digit_sum(n):
    if n < 10:
        return n
    return n % 10 + digit_sum(n // 10)


print(digit_sum(int(input())))
`, [["1234", "10"], ["7", "7"]], [["0", "0"], ["99999", "45"], ["1000000001", "2"]], { starter: FN_STARTER("def digit_sum(n):"), rules: [{ match: String.raw`def\s+digit_sum\s*\([\s\S]*\bdigit_sum\s*\([^)]*//`, message: "digit_sum calls itself with n // 10" }, { notMatch: String.raw`^\s*(for|while)\b`, flags: "m", message: "Uses recursion, not a loop" }] }),

    pq("Average of any number of values", "Write average(*numbers) that accepts any number of arguments and returns their average (0 when called with no arguments). Read the numbers on one line and call it with average(*values).", ["Define def average(*numbers):", "Input: one or more numbers on one line", "Output: the average with 2 decimals"], String.raw`def average(*numbers):
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)


values = list(map(float, input().split()))
print(f"Average: {average(*values):.2f}")
`, [["10 20 30", "20.00"], ["5", "5.00"]], [["0", "0.00"], ["1.5 2.5", "2.00"], ["-4 4 9", "3.00"]], { level: "intermediate", starter: FN_STARTER("def average(*numbers):"), rules: [{ match: String.raw`def\s+average\s*\(\s*\*\w+`, message: "average takes *args" }, { match: String.raw`average\s*\(\s*\*\w+\s*\)`, message: "Calls average(*values)" }] }),

    pq("Profile with keyword arguments", "Write describe(name, **details) that returns a line with the name and every detail as key=value, with the keys in alphabetical order and separated by commas. Read n key/value pairs and call describe(name, **pairs).", ["Define def describe(name, **details):", "Input line 1: the name", "Input line 2: n", "Next n lines: <key> <value>", "Output: <name>: key1=value1, key2=value2 (keys sorted); just <name>: when n is 0"], String.raw`def describe(name, **details):
    parts = [f"{key}={details[key]}" for key in sorted(details)]
    return f"{name}: " + ", ".join(parts)


name = input().strip()
n = int(input())
pairs = {}
for _ in range(n):
    key, value = input().split()
    pairs[key] = value
print(describe(name, **pairs))
`, [["Asha\n2\ncity Pune\nage 21", "Asha: age=21, city=Pune"]], [["Om\n0", "Om:"], ["Ravi\n3\nrole intern\nbatch 2026\nskill python", "Ravi: batch=2026, role=intern, skill=python"]], { level: "intermediate", match: "exact", starter: FN_STARTER("def describe(name, **details):"), rules: [{ match: String.raw`def\s+describe\s*\([^)]*\*\*\w+`, message: "describe takes **kwargs" }, { match: String.raw`describe\s*\([^)]*\*\*\w+\s*\)`, message: "Calls describe with **pairs" }] }),

    pq("Sort words with a lambda", "Read a list of words and print them sorted by length, and words of the same length alphabetically. Use sorted with a lambda key.", ["Input: words on one line", "Output: the sorted words separated by spaces", "Use key=lambda w: (len(w), w)", "Print only the words"], String.raw`words = input().split()
print(" ".join(sorted(words, key=lambda w: (len(w), w))))
`, [["banana kiwi apple fig", "fig kiwi apple banana"], ["bb a ccc aa", "a aa bb ccc"]], [["one", "one"], ["dog cat ant emu", "ant cat dog emu"]], { match: "exact", rules: [{ match: String.raw`key\s*=\s*lambda`, message: "Uses a lambda as the sort key" }] }),

    pq("Map and filter", "Read a list of integers, keep only the odd ones with filter, square them with map, and print the result and its sum.", ["Input: integers on one line", "Output line 1: the squares of the odd numbers, separated by spaces (Empty if none)", "Output line 2: Sum: <total>", "Use both map() and filter()"], String.raw`nums = list(map(int, input().split()))
odd_squares = list(map(lambda n: n * n, filter(lambda n: n % 2 != 0, nums)))
print(" ".join(map(str, odd_squares)) if odd_squares else "Empty")
print("Sum:", sum(odd_squares))
`, [["1 2 3 4 5", "1 9 25 Sum: 35"], ["2 4", "Empty Sum: 0"]], [["-3 0 7", "9 49 Sum: 58"], ["11", "121 Sum: 121"]], { level: "intermediate", rules: [{ match: String.raw`\bfilter\s*\(`, message: "Uses filter()" }, { match: String.raw`\bmap\s*\(\s*lambda`, message: "Uses map() with a lambda" }] }),

    pq("Tower of Hanoi", "Move n discs from peg A to peg C using peg B, never placing a larger disc on a smaller one. Write a recursive function hanoi(n, source, target, spare) that prints every move, then print the total number of moves.", ["Define a recursive hanoi function", "Input: n (1 to 10)", "Output: one line per move: Move disc <d> from <X> to <Y>", "Last line: Total moves: <count>", "Print only these lines"], String.raw`def hanoi(n, source, target, spare):
    if n == 0:
        return 0
    moves = hanoi(n - 1, source, spare, target)
    print(f"Move disc {n} from {source} to {target}")
    moves += 1
    moves += hanoi(n - 1, spare, target, source)
    return moves


n = int(input())
total = hanoi(n, "A", "C", "B")
print(f"Total moves: {total}")
`, [["2", "Move disc 1 from A to B\nMove disc 2 from A to C\nMove disc 1 from B to C\nTotal moves: 3"]], [["1", "Move disc 1 from A to C\nTotal moves: 1"], ["3", "Move disc 1 from A to C\nMove disc 2 from A to B\nMove disc 1 from C to B\nMove disc 3 from A to C\nMove disc 1 from B to A\nMove disc 2 from B to C\nMove disc 1 from A to C\nTotal moves: 7"]], { level: "advanced", match: "exact", starter: FN_STARTER("def hanoi(n, source, target, spare):"), rules: [{ match: String.raw`def\s+hanoi\s*\([\s\S]*\bhanoi\s*\(\s*n\s*-\s*1`, message: "hanoi calls itself with n - 1" }] }),

    pq("Fast Fibonacci with memoisation", "Write fib(n) recursively and make it fast with functools.lru_cache, so that fib(90) returns instantly. fib(0) is 0 and fib(1) is 1.", ["Decorate fib with @lru_cache(maxsize=None) (or @cache)", "Input: n (0 to 90)", "Output: fib(n)"], String.raw`from functools import lru_cache


@lru_cache(maxsize=None)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


print(fib(int(input())))
`, [["10", "55"], ["0", "0"]], [["1", "1"], ["50", "12586269025"], ["90", "2880067194370816120"]], { level: "advanced", starter: FN_STARTER("def fib(n):"), rules: [{ match: String.raw`@(functools\.)?(lru_cache|cache)\b`, message: "Uses lru_cache (or cache)" }, { match: String.raw`fib\s*\(\s*n\s*-\s*1\s*\)\s*\+\s*fib\s*\(\s*n\s*-\s*2\s*\)`, message: "fib is recursive" }] }),
  ],
  quiz: [
    { q: "What does a function return if it has no return statement?", options: ["0", "An empty string", "None", "It is a syntax error"], answer: 2, why: "Every function returns something; without return it is None." },
    { q: "Which definition is valid?", options: ["def f(a=1, b):", "def f(a, b=1):", "def f(a=1, b=):", "def f(=1, b):"], answer: 1, why: "Parameters with defaults must come after those without." },
    { q: "Inside def f(*args):, what is args when you call f(1, 2, 3)?", options: ["A list [1, 2, 3]", "A tuple (1, 2, 3)", "The number 1", "A dict"], answer: 1, why: "*args collects extra positional arguments into a tuple." },
    { q: "What does this print?\n\ndef show(x):\n    print(x)\n\nprint(show(5))", options: ["5", "5 then None", "None", "Error"], answer: 1, why: "show prints 5, then returns None, which the outer print shows." },
    { q: "What is essential in every recursive function?", options: ["A loop", "A global variable", "A base case that stops the recursion", "A lambda"], answer: 2, why: "Without a base case the calls never end and Python raises RecursionError." },
    { q: "What does sorted([\"bb\", \"a\", \"ccc\"], key=len, reverse=True) return?", options: ["['a', 'bb', 'ccc']", "['ccc', 'bb', 'a']", "['bb', 'a', 'ccc']", "['ccc', 'a', 'bb']"], answer: 1, why: "Sorted by length, longest first." },
    { q: "What does this print?\n\ncount = 0\ndef bump():\n    count = count + 1\nbump()", options: ["1", "0", "UnboundLocalError", "None"], answer: 2, why: "Assigning to count makes it local to bump, so reading it first fails. Pass and return values instead of using globals." },
    { q: "What does this print?\n\ndef add(item, bucket=[]):\n    bucket.append(item)\n    return bucket\n\nadd(1)\nprint(add(2))", options: ["[2]", "[1, 2]", "[1]", "Error"], answer: 1, why: "The default list is created once and shared between calls. Use bucket=None and create the list inside." },
    { q: "Why is naive recursive fib(40) slow, and what fixes it?", options: ["Recursion is always slow; use a lambda", "It recomputes the same values exponentially often; caching results with lru_cache fixes it", "Python can't add big numbers; use float", "It isn't slow"], answer: 1, why: "fib(n - 1) and fib(n - 2) repeat the same sub-calls; memoisation makes each value computed once." },
    { q: "What does this print?\n\ndef f(a, b=2, *args, **kw):\n    return a, b, args, kw\n\nprint(f(1, 3, 5, x=7))", options: ["(1, 2, (3, 5), {'x': 7})", "(1, 3, (5,), {'x': 7})", "(1, 3, [5], {'x': 7})", "TypeError"], answer: 1, why: "1 and 3 fill a and b, the extra 5 goes to args as a tuple, and x=7 goes to kw." },
  ],
};
