import type { PracticeUnit } from "../../types.js";
import { pq, usesLoop } from "./shared.js";

export const collections: PracticeUnit = {
  key: "collections",
  title: "Lists, tuples, dictionaries and sets",
  summary: "list methods and slicing, list comprehensions, tuples and unpacking, dictionaries for lookups and counting, sets, sorting with keys",
  reading: String.raw`## Lists

A list holds items in order and can grow, shrink and change:

` + "```python" + String.raw`
marks = [72, 85, 90]
marks.append(64)          # add at the end
marks.insert(0, 99)       # add at position 0
marks.remove(85)          # remove the first 85
last = marks.pop()        # remove and return the last item
marks.sort()              # sort in place (returns None!)
print(marks, len(marks), sum(marks), max(marks))
` + "```" + String.raw`

Reading a list of numbers from one line is a one-liner: nums = list(map(int, input().split())).

Slicing works like strings: nums[:3] is the first three, nums[-2:] the last two, nums[::-1] a reversed copy.

## Copying and aliasing

b = a does not copy a list. Both names point to the same list, so changing b changes a. Make a copy with a.copy() or a[:]. For lists of lists, use copy.deepcopy, or build the rows fresh: grid = [[0] * 3 for _ in range(3)]. The tempting [[0] * 3] * 3 creates three references to one row, so changing one cell changes a whole column.

## List comprehensions

A comprehension builds a new list from another sequence in one readable line:

` + "```python" + String.raw`
squares = [n * n for n in range(1, 6)]            # [1, 4, 9, 16, 25]
evens = [n for n in nums if n % 2 == 0]
names = [name.title() for name in raw_names]
` + "```" + String.raw`

## Tuples

A tuple is an ordered, unchangeable list written with round brackets: point = (3, 4). Use tuples for fixed records (a name and marks, a latitude and longitude) and for returning several values from a function. Unpacking takes them apart: x, y = point. A one-item tuple needs a comma: (5,).

## Dictionaries

A dict maps keys to values. Looking up a key is fast no matter how big the dict is.

` + "```python" + String.raw`
phone = {"Asha": "98200", "Ravi": "99870"}
phone["Meena"] = "90040"            # add or update
print(phone.get("Om", "Not found")) # safe lookup with a default
for name, number in phone.items():
    print(name, number)
` + "```" + String.raw`

phone["Om"] raises KeyError when the key is missing; get() returns a default instead. Since Python 3.7, dicts remember the order in which keys were inserted.

Counting is the most common dict pattern:

` + "```python" + String.raw`
counts = {}
for word in words:
    counts[word] = counts.get(word, 0) + 1
` + "```" + String.raw`

collections.Counter(words) does the same, and Counter.most_common(3) gives the top three.

Keys must be immutable (strings, numbers, tuples); a list cannot be a key.

## Sets

A set holds unique items with no order. It removes duplicates and answers "is x in here?" very fast.

- a | b union, a & b intersection, a - b difference, a ^ b items in exactly one.
- set(nums) drops duplicates but loses the order; to keep the order use dict.fromkeys(nums) or a loop with a seen set.
- {} is an empty dict; an empty set is set().

## Sorting with a key

sorted(items) returns a new sorted list; list.sort() sorts in place. Both take key= (a function that gives the value to sort by) and reverse=True.

` + "```python" + String.raw`
students = [("Asha", 91), ("Ravi", 85), ("Om", 91)]
ranked = sorted(students, key=lambda s: (-s[1], s[0]))
# [('Asha', 91), ('Om', 91), ('Ravi', 85)]
` + "```" + String.raw`

Using a tuple as the key sorts by the first value, then breaks ties with the second. Negating a number sorts it in descending order while the name stays ascending.

## Choosing the right collection

- Ordered items that change: list.
- A fixed record: tuple.
- Look something up by a name or id: dict.
- Uniqueness and membership: set.

## Common mistakes

- x = nums.sort() makes x None. Use sorted(nums) for a new list.
- Removing items from a list while looping over it skips items. Build a new list instead.
- Using a list for membership checks inside a big loop; a set is much faster.

## How your assignments are checked

Programs read their data from standard input (usually a count and then the values on one line), and output that has a defined order is compared exactly, so follow the order the question states: insertion order, sorted order or first appearance.`,
  questions: [
    pq("List statistics", "Read a list of integers on one line and print the count, sum, smallest, largest and average.", ["Input: integers separated by spaces (at least one)", "Output: Count, Sum, Min, Max on separate lines, then Average with 2 decimals"], String.raw`nums = list(map(int, input().split()))
print("Count:", len(nums))
print("Sum:", sum(nums))
print("Min:", min(nums))
print("Max:", max(nums))
print(f"Average: {sum(nums) / len(nums):.2f}")
`, [["4 8 15 16 23 42", "Count: 6 Sum: 108 Min: 4 Max: 42 Average: 18.00"]], [["7", "Count: 1 Sum: 7 Min: 7 Max: 7 Average: 7.00"], ["-3 0 3 10", "Count: 4 Sum: 10 Min: -3 Max: 10 Average: 2.50"]]),

    pq("Remove duplicates keeping order", "Read a list of integers and print it without duplicates, keeping the first occurrence of each value in its original position.", ["Input: integers on one line", "Output: the unique values in their original order, separated by spaces", "Print only the values"], String.raw`nums = input().split()
seen = set()
unique = []
for n in nums:
    if n not in seen:
        seen.add(n)
        unique.append(n)
print(" ".join(unique))
`, [["3 1 3 2 1 5", "3 1 2 5"], ["7 7 7", "7"]], [["1 2 3", "1 2 3"], ["5 -1 5 -1 0", "5 -1 0"]], { match: "exact" }),

    pq("Second largest distinct value", "Read a list of integers and print the second largest distinct value. If there isn't one (all values equal), print No second largest.", ["Input: integers on one line", "Output: the second largest distinct value, or No second largest"], String.raw`nums = set(map(int, input().split()))
if len(nums) < 2:
    print("No second largest")
else:
    ordered = sorted(nums, reverse=True)
    print("Second largest:", ordered[1])
`, [["4 9 2 9 7", "7"], ["5 5 5", "No second largest"]], [["-1 -8", "-8"], ["10 20 20 5 15 20", "15"], ["3", "No second largest"]], { level: "intermediate" }),

    pq("Word frequency", "Read a sentence and print how many times each word appears, in the order the words first appear. Compare words case-insensitively and print them in small letters.", ["Input: one line of words", "Output: one line per distinct word: <word> <count>", "Use a dictionary", "Print only these lines"], String.raw`counts = {}
for word in input().lower().split():
    counts[word] = counts.get(word, 0) + 1
for word, count in counts.items():
    print(word, count)
`, [["the cat and the hat", "the 2\ncat 1\nand 1\nhat 1"]], [["Go go GO", "go 3"], ["to be or not to be", "to 2\nbe 2\nor 1\nnot 1"]], { match: "exact", rules: [{ match: String.raw`\{\s*\}|\bdict\s*\(|Counter\s*\(`, message: "Uses a dictionary" }] }),

    pq("Common elements of two lists", "Read two lists of integers and print the values that appear in both, sorted in ascending order, each value once. Use sets.", ["Input line 1: the first list", "Input line 2: the second list", "Output: the common values in ascending order separated by spaces, or None if there are none"], String.raw`first = set(map(int, input().split()))
second = set(map(int, input().split()))
common = sorted(first & second)
if common:
    print(" ".join(map(str, common)))
else:
    print("None")
`, [["1 2 3 4 5\n4 5 6 7", "4 5"], ["1 1 2\n2 2 3", "2"]], [["1 2\n3 4", "None"], ["10 -5 7 3\n3 7 10 99 -5", "-5 3 7 10"]], { match: "exact", rules: [{ match: String.raw`\bset\s*\(|&|\.intersection\s*\(`, message: "Uses sets" }] }),

    pq("Rank students", "Read n students with their marks and print them ranked: higher marks first, and students with equal marks in alphabetical order of name.", ["Input line 1: n", "Next n lines: <name> <marks>", "Output: n lines of <rank>. <name> <marks>, e.g. 1. Asha 91", "Use sorted with a key", "Print only the ranking"], String.raw`n = int(input())
students = []
for _ in range(n):
    name, marks = input().split()
    students.append((name, int(marks)))
ranked = sorted(students, key=lambda s: (-s[1], s[0]))
for position, (name, marks) in enumerate(ranked, start=1):
    print(f"{position}. {name} {marks}")
`, [["3\nRavi 85\nOm 91\nAsha 91", "1. Asha 91\n2. Om 91\n3. Ravi 85"]], [["1\nMeena 40", "1. Meena 40"], ["4\nd 10\nc 20\nb 10\na 20", "1. a 20\n2. c 20\n3. b 10\n4. d 10"]], { match: "exact", level: "intermediate", rules: [{ match: String.raw`key\s*=`, message: "Sorts with key=" }] }),

    pq("Transpose a matrix", "Read a matrix of r rows and c columns and print its transpose (rows become columns).", ["Input line 1: r and c", "Next r lines: c integers each", "Output: c lines of r integers separated by spaces", "Print only the matrix"], String.raw`r, c = map(int, input().split())
matrix = [list(map(int, input().split())) for _ in range(r)]
for j in range(c):
    print(" ".join(str(matrix[i][j]) for i in range(r)))
`, [["2 3\n1 2 3\n4 5 6", "1 4\n2 5\n3 6"]], [["1 2\n7 8", "7\n8"], ["3 3\n1 2 3\n4 5 6\n7 8 9", "1 4 7\n2 5 8\n3 6 9"]], { match: "exact", level: "intermediate" }),

    pq("Squares of even numbers", "Read a list of integers and print the squares of the even ones, in order, using a list comprehension.", ["Input: integers on one line", "Output: the squares separated by spaces, or Empty if there are no even numbers", "Build the list with a comprehension: [n * n for n in nums if ...]"], String.raw`nums = list(map(int, input().split()))
squares = [n * n for n in nums if n % 2 == 0]
print(" ".join(map(str, squares)) if squares else "Empty")
`, [["1 2 3 4 5 6", "4 16 36"], ["1 3 5", "Empty"]], [["0 -2 7", "0 4"], ["10", "100"]], { rules: [{ match: String.raw`\[[^\]]*\bfor\b[^\]]*\bin\b[^\]]*\]`, message: "Uses a list comprehension" }] }),

    pq("Phone book lookup", "Build a phone book from n entries, then answer q lookups. Print the number for each name, or Not found.", ["Input line 1: n", "Next n lines: <name> <number>", "Next line: q", "Next q lines: a name to look up", "Output: one line per lookup: the number or Not found"], String.raw`n = int(input())
book = {}
for _ in range(n):
    name, number = input().split()
    book[name] = number
q = int(input())
for _ in range(q):
    name = input().strip()
    print(book.get(name, "Not found"))
`, [["2\nAsha 9820012345\nRavi 9987001122\n2\nRavi\nOm", "9987001122\nNot found"]], [["1\nMeena 9004000400\n1\nmeena", "Not found"], ["3\nA 1\nB 2\nA 3\n2\nA\nB", "3\n2"]], { match: "exact", rules: [{ match: String.raw`\.get\s*\(|\bin\s+\w+`, message: "Looks names up in a dictionary" }] }),

    pq("Rotate a list", "Read a list and a number k and rotate the list to the right by k places (the last k items move to the front). k can be larger than the list length.", ["Input line 1: integers on one line", "Input line 2: k (0 or more)", "Output: the rotated list separated by spaces", "Hint: slicing with k % len(nums)"], String.raw`nums = input().split()
k = int(input())
k %= len(nums)
rotated = nums[-k:] + nums[:-k] if k else nums
print(" ".join(rotated))
`, [["1 2 3 4 5\n2", "4 5 1 2 3"], ["1 2 3\n0", "1 2 3"]], [["1 2 3\n3", "1 2 3"], ["1 2 3 4\n5", "4 1 2 3"], ["9\n100", "9"]], { match: "exact", level: "intermediate" }),

    pq("Group anagrams", "Read a list of words and group the anagrams together. Print one group per line: the words of a group in the order they appeared, and the groups in the order their first word appeared.", ["Input: words on one line (small letters)", "Output: one line per group, words separated by spaces", "Hint: use a dict whose key is \"\".join(sorted(word))", "Print only the groups"], String.raw`groups = {}
for word in input().split():
    key = "".join(sorted(word))
    groups.setdefault(key, []).append(word)
for words in groups.values():
    print(" ".join(words))
`, [["eat tea tan ate nat bat", "eat tea ate\ntan nat\nbat"]], [["abc", "abc"], ["listen google silent enlist elgoog cat", "listen silent enlist\ngoogle elgoog\ncat"]], { match: "exact", level: "advanced", rules: [usesLoop] }),
  ],
  quiz: [
    { q: "Which of these is immutable?", options: ["list", "dict", "set", "tuple"], answer: 3, why: "Tuples can't be changed after they are created." },
    { q: "What does nums.sort() return?", options: ["The sorted list", "None", "A sorted copy", "True"], answer: 1, why: "sort() sorts in place and returns None; sorted(nums) returns a new list." },
    { q: "What does d.get(\"x\", 0) do when \"x\" is not a key?", options: ["Raises KeyError", "Returns 0", "Adds \"x\" with value 0", "Returns None"], answer: 1, why: "get returns the default when the key is missing and doesn't change the dict." },
    { q: "What is type({})?", options: ["set", "dict", "tuple", "list"], answer: 1, why: "Empty braces make an empty dict; use set() for an empty set." },
    { q: "What does [n * 2 for n in range(4) if n % 2] give?", options: ["[0, 2, 4, 6]", "[2, 6]", "[0, 4]", "[1, 3]"], answer: 1, why: "Only odd n (1 and 3) pass the filter, and they are doubled." },
    { q: "What is {1, 2, 3} & {2, 3, 4}?", options: ["{1, 2, 3, 4}", "{2, 3}", "{1, 4}", "{1}"], answer: 1, why: "& is intersection: the values in both sets." },
    { q: "Which cannot be a dictionary key?", options: ["\"name\"", "42", "(1, 2)", "[1, 2]"], answer: 3, why: "Keys must be hashable; lists are mutable and unhashable." },
    { q: "What does this print?\n\na = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)", options: ["[1, 2, 3]", "[1, 2, 3, 4]", "[4]", "Error"], answer: 1, why: "b = a doesn't copy; both names refer to the same list." },
    { q: "What does this print?\n\ngrid = [[0] * 2] * 2\ngrid[0][0] = 5\nprint(grid)", options: ["[[5, 0], [0, 0]]", "[[5, 0], [5, 0]]", "[[5, 5], [0, 0]]", "Error"], answer: 1, why: "Multiplying the outer list repeats a reference to the same inner list, so both rows change. Use [[0] * 2 for _ in range(2)]." },
    { q: "What does sorted([(\"b\", 2), (\"a\", 2), (\"c\", 1)], key=lambda t: (-t[1], t[0])) return?", options: ["[('c', 1), ('a', 2), ('b', 2)]", "[('a', 2), ('b', 2), ('c', 1)]", "[('b', 2), ('a', 2), ('c', 1)]", "[('a', 2), ('c', 1), ('b', 2)]"], answer: 1, why: "The key sorts by the number descending (via the minus), then by the letter ascending to break ties." },
  ],
};
