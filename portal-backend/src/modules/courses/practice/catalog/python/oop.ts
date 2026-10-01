import type { PracticeUnit } from "../../types.js";
import { pq, usesClass, usesWith } from "./shared.js";

export const oop: PracticeUnit = {
  key: "oop",
  title: "Files, exceptions, classes and modules",
  summary: "reading and writing files with with, csv and json, try/except/finally and custom exceptions, classes, inheritance, dunder methods and the standard library",
  reading: String.raw`## Reading and writing files

open() gives you a file object. Always open files in a with block: the file is closed automatically when the block ends, even if an error happens inside it.

` + "```python" + String.raw`
with open("notes.txt", "w", encoding="utf-8") as f:   # "w" replaces, "a" appends
    f.write("first line\n")
    f.write("second line\n")

with open("notes.txt", encoding="utf-8") as f:        # "r" (read) is the default
    for line in f:
        print(line.rstrip("\n"))
` + "```" + String.raw`

- write() doesn't add a newline; include \n yourself.
- f.read() returns the whole file as one string; f.readlines() returns a list of lines; looping over f reads one line at a time and works for huge files.
- Each line you read still ends with \n; strip it before comparing or printing.
- Pass encoding="utf-8" so the program behaves the same on Windows and Linux.

For structured data use the standard library. csv.writer and csv.reader handle commas and quotes inside values correctly (open the file with newline=""), and json.dumps and json.loads convert between Python dicts and lists and JSON text.

## Exceptions

When something goes wrong, Python raises an exception. try/except lets you handle it instead of crashing:

` + "```python" + String.raw`
try:
    a, b = map(int, input().split())
    print(a / b)
except ZeroDivisionError:
    print("Cannot divide by zero")
except ValueError:
    print("Please enter whole numbers")
else:
    print("Division done")      # only when no exception happened
finally:
    print("Bye")                # always runs
` + "```" + String.raw`

Catch the specific errors you expect. A bare except: also swallows typos (NameError) and Ctrl+C, which hides bugs. Common built-in exceptions: ValueError (bad value, int("abc")), TypeError (wrong type, "1" + 1), KeyError, IndexError, FileNotFoundError, ZeroDivisionError.

You can raise your own: raise ValueError("Amount must be positive"). For errors that belong to your program, define an exception class that inherits from Exception.

## Classes and objects

A class is a blueprint; each object made from it has its own data (attributes) and shares the behaviour (methods). __init__ sets up a new object, and self is the object the method is working on:

` + "```python" + String.raw`
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("Amount must be positive")
        self.balance += amount

acc = Account("Asha")
acc.deposit(500)
print(acc.balance)   # 500
` + "```" + String.raw`

Forgetting self as the first parameter is the most common error: TypeError: deposit() takes 1 positional argument but 2 were given.

## Inheritance

A subclass reuses and extends a parent class. super() calls the parent's version of a method:

` + "```python" + String.raw`
class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def pay(self):
        return self.salary

class Manager(Employee):
    def __init__(self, name, salary, bonus):
        super().__init__(name, salary)
        self.bonus = bonus

    def pay(self):                       # overrides Employee.pay
        return super().pay() + self.bonus
` + "```" + String.raw`

isinstance(m, Employee) is True for a Manager too.

## Dunder (magic) methods

Methods with double underscores let your objects work with Python's operators and built-ins:

- __str__ is what print() shows; __repr__ is the developer view shown in lists and the shell.
- __eq__ defines ==, __lt__ defines < (which makes sorted() work), __add__ defines +.
- __len__ makes len(obj) work, and __contains__ makes in work.

The dataclasses module writes __init__, __repr__ and __eq__ for you: decorate a class with @dataclass and list the fields with type hints.

## Modules

A module is a .py file; import brings it in. The standard library is large: math, random, statistics, datetime, json, csv, os, pathlib, collections and itertools cover most daily needs. Install other packages with pip install inside a virtual environment (python -m venv .venv).

` + "```python" + String.raw`
import statistics
from datetime import date
print(statistics.median([3, 1, 2]), date.today().year)
` + "```" + String.raw`

Code under if __name__ == "__main__": runs only when the file is executed directly, not when another file imports it. Put your program's entry point there in real projects.

## How your assignments are checked

Programs run in an empty folder where they may create files, so the file questions write a file and then read it back. Rules check for with open(...), the modules named in the question, and class definitions. Exception questions feed deliberately bad input, so make sure your program prints a message instead of crashing with a traceback.`,
  questions: [
    pq("Safe division", "Read two values and print a / b with 2 decimals. Handle the errors instead of crashing: print Cannot divide by zero when b is 0, and Invalid input when a value is not a number.", ["Input: two values on one line", "Output: Result: <a / b> with 2 decimals, or one of the two error messages", "Use try/except with ZeroDivisionError and ValueError"], String.raw`try:
    a, b = map(float, input().split())
    print(f"Result: {a / b:.2f}")
except ZeroDivisionError:
    print("Cannot divide by zero")
except ValueError:
    print("Invalid input")
`, [["10 4", "Result: 2.50"], ["5 0", "Cannot divide by zero"]], [["abc 2", "Invalid input", ["result"]], ["-9 3", "Result: -3.00"], ["7 x", "Invalid input", ["result"]]], { rules: [{ match: String.raw`except\s+ZeroDivisionError`, message: "Catches ZeroDivisionError" }, { match: String.raw`except\s+ValueError`, message: "Catches ValueError" }, { notMatch: String.raw`except\s*:`, message: "No bare except" }] }),

    pq("Write and read a notes file", "Read n lines of text, write them to a file called notes.txt, then open the file again, read it back and print each line with its line number, followed by the total number of words in the file.", ["Input line 1: n", "Next n lines: the text lines", "Write the lines to notes.txt with with open(..., \"w\")", "Then read notes.txt and print <number>: <line> for each line", "Last line: Words: <total>"], String.raw`n = int(input())
lines = [input() for _ in range(n)]
with open("notes.txt", "w", encoding="utf-8") as f:
    for line in lines:
        f.write(line + "\n")

words = 0
with open("notes.txt", encoding="utf-8") as f:
    for number, line in enumerate(f, start=1):
        line = line.rstrip("\n")
        print(f"{number}: {line}")
        words += len(line.split())
print("Words:", words)
`, [["2\nPython is fun\nFiles are easy", "1: Python is fun\n2: Files are easy\nWords: 6"]], [["1\nhello", "1: hello\nWords: 1"], ["3\na b c\n\nd e", "1: a b c\n2:\n3: d e\nWords: 5"]], { match: "exact", rules: [usesWith, { match: String.raw`open\s*\(\s*["']notes\.txt["']\s*,\s*["']w["']`, message: "Writes notes.txt in \"w\" mode" }, { match: String.raw`\.write\s*\(`, message: "Writes with write()" }] }),

    pq("Marks in a CSV file", "Read n student records, save them to marks.csv with the csv module (a header row name,marks and then one row per student), then read the file back with csv.DictReader and print the topper and the class average.", ["Input line 1: n (1 or more)", "Next n lines: <name> <marks>", "Write marks.csv with csv.writer, then read it with csv.DictReader", "Output line 1: Topper: <name> (the first one if tied)", "Output line 2: Average: <value with 2 decimals>"], String.raw`import csv

n = int(input())
with open("marks.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["name", "marks"])
    for _ in range(n):
        name, marks = input().split()
        writer.writerow([name, marks])

with open("marks.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

topper = max(rows, key=lambda row: int(row["marks"]))
average = sum(int(row["marks"]) for row in rows) / len(rows)
print("Topper:", topper["name"])
print(f"Average: {average:.2f}")
`, [["3\nAsha 91\nRavi 78\nOm 85", "Topper: Asha Average: 84.67"]], [["1\nMeena 40", "Topper: Meena Average: 40.00"], ["4\nA 50\nB 90\nC 90\nD 70", "Topper: B Average: 75.00"]], { level: "intermediate", rules: [{ match: String.raw`^\s*import\s+csv\b`, flags: "m", message: "Imports the csv module" }, { match: String.raw`csv\.writer\s*\(`, message: "Writes with csv.writer" }, { match: String.raw`csv\.DictReader\s*\(`, message: "Reads with csv.DictReader" }, usesWith] }),

    pq("Read JSON data", "Read one line of JSON describing an order and print a summary. The JSON has customer (text) and items (a list of objects with name, qty and price).", ["Input: one line of JSON, e.g. {\"customer\": \"Asha\", \"items\": [{\"name\": \"Pen\", \"qty\": 2, \"price\": 10}]}", "Use json.loads", "Output line 1: Customer: <name>", "Output line 2: Items: <total quantity>", "Output line 3: Total: <sum of qty * price, 2 decimals>"], String.raw`import json

order = json.loads(input())
quantity = sum(item["qty"] for item in order["items"])
total = sum(item["qty"] * item["price"] for item in order["items"])
print("Customer:", order["customer"])
print("Items:", quantity)
print(f"Total: {total:.2f}")
`, [["{\"customer\": \"Asha\", \"items\": [{\"name\": \"Pen\", \"qty\": 2, \"price\": 10}, {\"name\": \"Book\", \"qty\": 1, \"price\": 250.5}]}", "Customer: Asha Items: 3 Total: 270.50"]], [["{\"customer\": \"Ravi\", \"items\": []}", "Customer: Ravi Items: 0 Total: 0.00"], ["{\"items\": [{\"name\": \"Tea\", \"qty\": 4, \"price\": 12.5}], \"customer\": \"Om\"}", "Customer: Om Items: 4 Total: 50.00"]], { level: "intermediate", rules: [{ match: String.raw`json\.loads\s*\(`, message: "Parses the text with json.loads" }] }),

    pq("Rectangle class", "Write a class Rectangle with length and breadth set in __init__, methods area() and perimeter(), an is_square() method, and a __str__ that returns Rectangle(<l> x <b>). Read the sides, create the object and print it and its details.", ["Define class Rectangle with __init__, area, perimeter, is_square and __str__", "Input: length and breadth on one line", "Output line 1: print(rect), e.g. Rectangle(4 x 5)", "Output line 2: Area: <value>", "Output line 3: Perimeter: <value>", "Output line 4: Square: True or False"], String.raw`class Rectangle:
    def __init__(self, length, breadth):
        self.length = length
        self.breadth = breadth

    def area(self):
        return self.length * self.breadth

    def perimeter(self):
        return 2 * (self.length + self.breadth)

    def is_square(self):
        return self.length == self.breadth

    def __str__(self):
        return f"Rectangle({self.length} x {self.breadth})"


l, b = map(int, input().split())
rect = Rectangle(l, b)
print(rect)
print("Area:", rect.area())
print("Perimeter:", rect.perimeter())
print("Square:", rect.is_square())
`, [["4 5", "Rectangle(4 x 5) Area: 20 Perimeter: 18 Square: False", ["true"]], ["3 3", "Rectangle(3 x 3) Area: 9 Perimeter: 12 Square: True", ["false"]]], [["1 10", "Rectangle(1 x 10) Area: 10 Perimeter: 22 Square: False", ["true"]], ["7 7", "Rectangle(7 x 7) Area: 49 Perimeter: 28 Square: True", ["false"]]], { rules: [usesClass, { match: String.raw`def\s+__init__\s*\(\s*self`, message: "Has __init__(self, ...)" }, { match: String.raw`def\s+__str__\s*\(\s*self\s*\)`, message: "Has __str__" }] }),

    pq("Bank account with a custom exception", "Write a class BankAccount with deposit and withdraw methods and a custom exception InsufficientFundsError (a subclass of Exception) that withdraw raises when the balance is too low. Deposits and withdrawals of 0 or less raise ValueError. Process a list of operations and print the result of each.", ["Input line 1: the opening balance", "Next line: n, then n lines of D <amount> or W <amount>", "For each operation print Balance: <new balance>, or Insufficient funds, or Invalid amount (the balance stays the same after an error)", "Last line: Final balance: <balance>"], String.raw`class InsufficientFundsError(Exception):
    pass


class BankAccount:
    def __init__(self, balance):
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("Invalid amount")
        self.balance += amount

    def withdraw(self, amount):
        if amount <= 0:
            raise ValueError("Invalid amount")
        if amount > self.balance:
            raise InsufficientFundsError("Insufficient funds")
        self.balance -= amount


account = BankAccount(int(input()))
n = int(input())
for _ in range(n):
    kind, amount = input().split()
    try:
        if kind == "D":
            account.deposit(int(amount))
        else:
            account.withdraw(int(amount))
        print("Balance:", account.balance)
    except InsufficientFundsError:
        print("Insufficient funds")
    except ValueError:
        print("Invalid amount")
print("Final balance:", account.balance)
`, [["1000\n3\nD 500\nW 2000\nW 300", "Balance: 1500\nInsufficient funds\nBalance: 1200\nFinal balance: 1200"]], [["0\n2\nD 0\nW 1", "Invalid amount\nInsufficient funds\nFinal balance: 0"], ["100\n1\nW 100", "Balance: 0\nFinal balance: 0"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`class\s+InsufficientFundsError\s*\(\s*Exception\s*\)`, message: "Defines InsufficientFundsError(Exception)" }, { match: String.raw`raise\s+InsufficientFundsError`, message: "Raises InsufficientFundsError" }, { match: String.raw`class\s+BankAccount\b`, message: "Defines class BankAccount" }] }),

    pq("Employees and managers", "Write a class Employee(name, salary) with a pay() method returning the salary, and a subclass Manager(name, salary, bonus) whose pay() adds the bonus by calling super().pay(). Read the staff list and print everyone's pay and the total payroll.", ["Input line 1: n", "Next n lines: E <name> <salary> or M <name> <salary> <bonus>", "Output: one line per person: <name> (<Employee or Manager>): <pay>", "Last line: Total: <sum of pay>", "Use type(person).__name__ for the class name"], String.raw`class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def pay(self):
        return self.salary


class Manager(Employee):
    def __init__(self, name, salary, bonus):
        super().__init__(name, salary)
        self.bonus = bonus

    def pay(self):
        return super().pay() + self.bonus


staff = []
for _ in range(int(input())):
    parts = input().split()
    if parts[0] == "M":
        staff.append(Manager(parts[1], int(parts[2]), int(parts[3])))
    else:
        staff.append(Employee(parts[1], int(parts[2])))
for person in staff:
    print(f"{person.name} ({type(person).__name__}): {person.pay()}")
print("Total:", sum(person.pay() for person in staff))
`, [["2\nE Asha 30000\nM Ravi 50000 10000", "Asha (Employee): 30000\nRavi (Manager): 60000\nTotal: 90000"]], [["1\nM Om 1 1", "Om (Manager): 2\nTotal: 2"], ["3\nE A 10\nE B 20\nM C 30 5", "A (Employee): 10\nB (Employee): 20\nC (Manager): 35\nTotal: 65"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`class\s+Manager\s*\(\s*Employee\s*\)`, message: "Manager inherits from Employee" }, { match: String.raw`super\(\)\.__init__\s*\(`, message: "Calls super().__init__" }, { match: String.raw`super\(\)\.pay\s*\(`, message: "Calls super().pay()" }] }),

    pq("Vector with dunder methods", "Write a class Vector for 2D vectors with __add__ (v1 + v2), __mul__ (v * number), __eq__ (==), __abs__ (length) and __repr__ returning Vector(x, y). Read two vectors and a number and print the results.", ["Input line 1: x1 y1", "Input line 2: x2 y2", "Input line 3: k", "Output line 1: v1 + v2, e.g. Vector(4, 6)", "Output line 2: v1 * k", "Output line 3: v1 == v2 (True or False)", "Output line 4: abs(v1 + v2) with 2 decimals", "Print only these lines"], String.raw`import math


class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __mul__(self, k):
        return Vector(self.x * k, self.y * k)

    def __eq__(self, other):
        return isinstance(other, Vector) and self.x == other.x and self.y == other.y

    def __abs__(self):
        return math.hypot(self.x, self.y)

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"


x1, y1 = map(int, input().split())
x2, y2 = map(int, input().split())
k = int(input())
v1 = Vector(x1, y1)
v2 = Vector(x2, y2)
print(v1 + v2)
print(v1 * k)
print(v1 == v2)
print(f"{abs(v1 + v2):.2f}")
`, [["1 2\n3 4\n3", "Vector(4, 6)\nVector(3, 6)\nFalse\n7.21"]], [["0 0\n0 0\n5", "Vector(0, 0)\nVector(0, 0)\nTrue\n0.00"], ["-3 1\n6 3\n-2", "Vector(3, 4)\nVector(6, -2)\nFalse\n5.00"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`def\s+__add__\s*\(`, message: "Defines __add__" }, { match: String.raw`def\s+__eq__\s*\(`, message: "Defines __eq__" }, { match: String.raw`def\s+__repr__\s*\(`, message: "Defines __repr__" }, { match: String.raw`def\s+__mul__\s*\(`, message: "Defines __mul__" }] }),

    pq("Stack class", "Write a class Stack backed by a list with push, pop, peek, is_empty and __len__. Process commands and print what each one returns.", ["Input line 1: n, then n commands: PUSH <x>, POP, PEEK or SIZE", "PUSH prints nothing; POP and PEEK print the value, or Stack is empty", "SIZE prints len(stack)", "Print only the outputs, one per line"], String.raw`class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()

    def peek(self):
        return self.items[-1]

    def is_empty(self):
        return not self.items

    def __len__(self):
        return len(self.items)


stack = Stack()
for _ in range(int(input())):
    command = input().split()
    if command[0] == "PUSH":
        stack.push(command[1])
    elif command[0] == "SIZE":
        print(len(stack))
    elif stack.is_empty():
        print("Stack is empty")
    elif command[0] == "POP":
        print(stack.pop())
    else:
        print(stack.peek())
`, [["5\nPUSH 10\nPUSH 20\nPEEK\nPOP\nSIZE", "20\n20\n1"]], [["3\nPOP\nPUSH a\nPOP", "Stack is empty\na"], ["4\nPUSH 1\nPUSH 2\nSIZE\nPEEK", "2\n2"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`class\s+Stack\b`, message: "Defines class Stack" }, { match: String.raw`def\s+__len__\s*\(`, message: "Defines __len__" }, { match: String.raw`def\s+push\s*\(\s*self`, message: "Has a push method" }] }),

    pq("Statistics module", "Read a list of integers and use the statistics module to print the mean, median and mode, and the standard deviation (statistics.pstdev, the population version).", ["Input: integers on one line (at least one)", "import statistics", "Output: Mean, Median, Mode and Std dev, each on its own line, with 2 decimals (Mode as a whole number; with a tie, statistics.mode returns the first one seen)"], String.raw`import statistics

nums = list(map(int, input().split()))
print(f"Mean: {statistics.mean(nums):.2f}")
print(f"Median: {statistics.median(nums):.2f}")
print(f"Mode: {statistics.mode(nums)}")
print(f"Std dev: {statistics.pstdev(nums):.2f}")
`, [["2 4 4 4 5 5 7 9", "Mean: 5.00 Median: 4.50 Mode: 4 Std dev: 2.00"]], [["10", "Mean: 10.00 Median: 10.00 Mode: 10 Std dev: 0.00"], ["1 2 3 3", "Mean: 2.25 Median: 2.50 Mode: 3 Std dev: 0.83"]], { rules: [{ match: String.raw`^\s*(import\s+statistics|from\s+statistics\s+import)`, flags: "m", message: "Uses the statistics module" }, { match: String.raw`pstdev\s*\(`, message: "Uses pstdev" }] }),
  ],
  quiz: [
    { q: "Why open files with with open(...) as f:?", options: ["It is faster", "The file is closed automatically, even if an error occurs", "It is the only way to read a file", "It creates the file if missing in every mode"], answer: 1, why: "with guarantees the file is closed when the block ends." },
    { q: "Which mode adds to the end of an existing file without erasing it?", options: ["\"w\"", "\"r\"", "\"a\"", "\"x\""], answer: 2, why: "\"a\" appends; \"w\" truncates the file first." },
    { q: "When does a finally block run?", options: ["Only when an exception happened", "Only when no exception happened", "Always, whether or not an exception happened", "Never, it is for cleanup code in C"], answer: 2, why: "finally always runs, which makes it the place for cleanup." },
    { q: "Which exception does int(\"abc\") raise?", options: ["TypeError", "ValueError", "SyntaxError", "KeyError"], answer: 1, why: "The type (str) is fine but the value can't be converted: ValueError." },
    { q: "What is self in a method?", options: ["A keyword that means the class", "The object the method was called on", "A global variable", "The parent class"], answer: 1, why: "Python passes the instance as the first argument, named self by convention." },
    { q: "Which method does print(obj) use to get the text to show?", options: ["__init__", "__str__ (falling back to __repr__)", "__len__", "__print__"], answer: 1, why: "print calls str(obj), which uses __str__, or __repr__ when __str__ is missing." },
    { q: "What does super().__init__(name) do inside a subclass's __init__?", options: ["Creates a second object", "Runs the parent class's __init__ on this object", "Deletes the parent's attributes", "Nothing unless the parent is abstract"], answer: 1, why: "It lets the parent set up its part of the object." },
    { q: "Why is a bare except: considered bad practice?", options: ["It is a syntax error in Python 3", "It also catches unexpected errors like NameError and KeyboardInterrupt, hiding bugs", "It is slower than except Exception", "It only catches ValueError"], answer: 1, why: "Catch the specific exceptions you expect so real bugs still show up." },
    { q: "What does this print?\n\nclass A:\n    def hello(self):\n        return \"A\"\n\nclass B(A):\n    def hello(self):\n        return \"B\" + super().hello()\n\nprint(B().hello())", options: ["B", "A", "BA", "AB"], answer: 2, why: "B.hello overrides A.hello and appends the parent's result from super()." },
    { q: "What does this print?\n\ntry:\n    x = 1 / 0\nexcept ZeroDivisionError:\n    print(\"a\", end=\"\")\nelse:\n    print(\"b\", end=\"\")\nfinally:\n    print(\"c\", end=\"\")", options: ["abc", "ac", "bc", "a"], answer: 1, why: "The except block runs, else is skipped because an exception happened, and finally always runs." },
  ],
};
