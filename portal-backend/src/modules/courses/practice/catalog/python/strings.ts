import type { PracticeUnit } from "../../types.js";
import { pq, usesLoop } from "./shared.js";

export const strings: PracticeUnit = {
  key: "strings",
  title: "Strings and text processing",
  summary: "indexing and slicing, string methods, immutability, split and join, f-string formatting and character codes",
  reading: String.raw`## Strings are sequences

A string is a sequence of characters. You can index it, slice it, loop over it and measure it with len():

` + "```python" + String.raw`
s = "Inveon"
print(s[0])      # I   (first character)
print(s[-1])     # n   (last character)
print(s[1:4])    # nve (index 1 up to, not including, 4)
print(s[::-1])   # noevnI (a step of -1 reverses)
print(len(s))    # 6
` + "```" + String.raw`

A slice never raises an error for out-of-range positions (s[2:100] is fine), but an index does: s[10] raises IndexError.

## Strings are immutable

You cannot change a character in place: s[0] = "X" raises TypeError. Every string method returns a new string, and the original stays the same. So this line does nothing useful:

` + "```python" + String.raw`
name.upper()          # result thrown away
name = name.upper()   # correct: keep the new string
` + "```" + String.raw`

## Methods you will use every day

- s.lower(), s.upper(), s.title(), s.capitalize(), s.swapcase().
- s.strip() removes spaces and newlines from both ends (lstrip and rstrip for one side). Always strip input when spaces don't matter.
- s.split() splits on any run of whitespace; s.split(",") splits on commas. " ".join(words) is the reverse: it glues a list of strings together.
- s.replace("old", "new"), s.count("a"), s.find("x") (gives -1 when not found; s.index raises an error instead).
- s.startswith("Mr"), s.endswith(".py").
- Checks that return True or False: isalpha(), isdigit(), isalnum(), isspace(), isupper(), islower().
- in tests for a substring: "ve" in "Inveon" is True.

## Building strings efficiently

Joining with + inside a loop creates a new string each time. For a few pieces it doesn't matter; for thousands, collect the pieces in a list and join once:

` + "```python" + String.raw`
parts = []
for word in words:
    parts.append(word.capitalize())
print(" ".join(parts))
` + "```" + String.raw`

## Formatting with f-strings

The part after the colon inside the braces controls the layout:

` + "```python" + String.raw`
item, price = "Tea", 12.5
print(f"{item:<10}|{price:>8.2f}|")   # Tea       |   12.50|
print(f"{7:03d}")                      # 007
print(f"{1234567:,}")                  # 1,234,567
print(f"{0.256:.1%}")                  # 25.6%
` + "```" + String.raw`

< left-aligns, > right-aligns and ^ centres, followed by the width. Use {{ and }} to print literal braces inside an f-string.

## Characters and codes

ord("A") is 65 and chr(97) is "a". Letters are consecutive, so ord(ch) - ord("a") gives a letter's position in the alphabet (0 for a). This is how a Caesar cipher shifts letters: find the position, add the shift, wrap around with % 26, and turn it back into a letter with chr.

## Counting characters

A dictionary (next unit) is the natural way to count, but for strings you can already use s.count(ch) for a single character, or sorted(set(s)) to visit each distinct character once in alphabetical order. collections.Counter counts everything in one call: Counter("banana") gives a: 3, n: 2, b: 1.

## Comparing strings

== compares the characters exactly, so "Asha" == "asha" is False. Normalise first: a.lower() == b.lower() (or casefold() for other languages). < and > compare alphabetically by character code, so every capital letter sorts before every small letter: "Zebra" < "apple" is True.

## Common mistakes

- Calling a method and not saving its result.
- Using s.find() in a condition: 0 (found at the start) is falsy, and -1 (not found) is truthy. Use in instead.
- Forgetting that input() keeps spaces the user typed; call strip().
- Reversing words when the question asks for characters, or the other way round: s[::-1] reverses characters, " ".join(s.split()[::-1]) reverses words.

## How your assignments are checked

Most string questions are compared exactly, because every character matters, so print only what is asked, with no prompt. Hidden tests use single characters, mixed case, extra spaces and punctuation to make sure your code handles real text.`,
  questions: [
    pq("Reverse a string", "Read a line of text and print it reversed.", ["Input: one line of text", "Output: the text reversed, character by character", "Print only the reversed text"], String.raw`text = input()
print(text[::-1])
`, [["Inveon", "noevnI"], ["hello world", "dlrow olleh"]], [["a", "a"], ["Python 3.12", "21.3 nohtyP"]], { match: "exact" }),

    pq("Count vowels and consonants", "Read a line of text and count its vowels and consonants. Upper and lower case count the same; ignore digits, spaces and punctuation.", ["Input: one line of text", "Output line 1: Vowels: <count>", "Output line 2: Consonants: <count>"], String.raw`text = input().lower()
vowels = 0
consonants = 0
for ch in text:
    if ch.isalpha():
        if ch in "aeiou":
            vowels += 1
        else:
            consonants += 1
print("Vowels:", vowels)
print("Consonants:", consonants)
`, [["Education", "Vowels: 5 Consonants: 4"], ["Hello World!", "Vowels: 3 Consonants: 7"]], [["rhythm", "Vowels: 0 Consonants: 6"], ["123 !!", "Vowels: 0 Consonants: 0"], ["AEIOU xyz", "Vowels: 5 Consonants: 3"]], { rules: [usesLoop] }),

    pq("Palindrome sentence", "Read a line and decide whether it is a palindrome when you ignore case and every character that is not a letter or digit (\"A man, a plan, a canal: Panama\" is one).", ["Input: one line of text", "Output: Palindrome or Not a palindrome"], String.raw`text = input()
clean = "".join(ch.lower() for ch in text if ch.isalnum())
if clean == clean[::-1]:
    print("Palindrome")
else:
    print("Not a palindrome")
`, [["Madam", "Palindrome", ["not"]], ["hello", "Not a palindrome"]], [["A man, a plan, a canal: Panama", "Palindrome", ["not"]], ["No lemon, no melon", "Palindrome", ["not"]], ["ab", "Not a palindrome"]], { level: "intermediate" }),

    pq("Word count and longest word", "Read a sentence and print the number of words and the longest word. If several words share the longest length, print the first of them.", ["Input: one line (words separated by one or more spaces)", "Output line 1: Words: <count>", "Output line 2: Longest: <word>"], String.raw`words = input().split()
longest = ""
for word in words:
    if len(word) > len(longest):
        longest = word
print("Words:", len(words))
print("Longest:", longest)
`, [["Python is easy to learn", "Words: 5 Longest: Python"], ["I love   coding", "Words: 3 Longest: coding"]], [["one two six", "Words: 3 Longest: one"], ["Supercalifragilistic", "Words: 1 Longest: Supercalifragilistic"]]),

    pq("Capitalise every word", "Read a line and print it with the first letter of each word in capital and the rest in small letters, with single spaces between words.", ["Input: one line of words (may have extra spaces)", "Output: the words capitalised and joined by single spaces", "Print only the result"], String.raw`words = input().split()
print(" ".join(word.capitalize() for word in words))
`, [["hello world", "Hello World"], ["pYTHON   is FUN", "Python Is Fun"]], [["a", "A"], ["  inveon technologies pune  ", "Inveon Technologies Pune"]], { match: "exact", rules: [{ match: String.raw`\.join\s*\(`, message: "Joins the words with join" }] }),

    pq("Character frequency", "Read a word and print how many times each character appears, one line per character, in alphabetical order.", ["Input: one word (small letters)", "Output: lines of the form <char> <count>, sorted by character", "Print only these lines"], String.raw`word = input().strip()
for ch in sorted(set(word)):
    print(ch, word.count(ch))
`, [["banana", "a 3\nb 1\nn 2"]], [["x", "x 1"], ["mississippi", "i 4\nm 1\np 2\ns 4"], ["abcabc", "a 2\nb 2\nc 2"]], { match: "exact", level: "intermediate" }),

    pq("Anagram check", "Two words are anagrams if they use the same letters the same number of times (listen and silent). Read two words and check, ignoring case.", ["Input: two words on two lines", "Output: Anagrams or Not anagrams"], String.raw`first = input().strip().lower()
second = input().strip().lower()
if sorted(first) == sorted(second):
    print("Anagrams")
else:
    print("Not anagrams")
`, [["listen\nsilent", "Anagrams", ["not"]], ["hello\nworld", "Not anagrams"]], [["Dusty\nstudy", "Anagrams", ["not"]], ["aab\nabb", "Not anagrams"], ["abc\nabcd", "Not anagrams"]], { level: "intermediate" }),

    pq("Remove duplicate characters", "Read a line and print it with only the first occurrence of each character kept, in the original order.", ["Input: one line", "Output: the text with repeated characters removed", "Spaces count as characters too", "Print only the result"], String.raw`text = input()
seen = set()
result = []
for ch in text:
    if ch not in seen:
        seen.add(ch)
        result.append(ch)
print("".join(result))
`, [["programming", "progamin"], ["aabbcc", "abc"]], [["a", "a"], ["hello world", "helo wrd"]], { match: "exact", level: "intermediate", rules: [usesLoop] }),

    pq("Caesar cipher", "Encrypt a message with a Caesar cipher: shift every letter forward by k places in the alphabet, wrapping from z back to a. Keep the case of each letter, and leave spaces, digits and punctuation unchanged.", ["Input line 1: the message", "Input line 2: the shift k (0 to 25)", "Output: the encrypted message only", "Hint: chr((ord(ch) - ord(\"a\") + k) % 26 + ord(\"a\"))"], String.raw`message = input()
k = int(input())
result = []
for ch in message:
    if ch.islower():
        result.append(chr((ord(ch) - ord("a") + k) % 26 + ord("a")))
    elif ch.isupper():
        result.append(chr((ord(ch) - ord("A") + k) % 26 + ord("A")))
    else:
        result.append(ch)
print("".join(result))
`, [["hello\n3", "khoor"], ["Hello, World!\n1", "Ifmmp, Xpsme!"]], [["xyz\n3", "abc"], ["Zebra 2025\n25", "Ydaqz 2025"], ["same\n0", "same"]], { match: "exact", level: "advanced", rules: [{ match: String.raw`\bord\s*\(`, message: "Uses ord()" }, { match: String.raw`\bchr\s*\(`, message: "Uses chr()" }] }),

    pq("Formatted receipt", "Print a shop receipt. Read n and then n lines of item name and price. Print each item with the name left-aligned in 10 characters and the price right-aligned in 8 characters with 2 decimals, then a line of 18 dashes, then the total the same way with the label TOTAL.", ["Input line 1: n", "Next n lines: <name> <price> (the name has no spaces)", "Output: one line per item, then 18 dashes, then TOTAL", "Use f-string alignment, e.g. f\"{name:<10}{price:>8.2f}\"", "Print only the receipt"], String.raw`n = int(input())
total = 0.0
for _ in range(n):
    name, price = input().split()
    price = float(price)
    total += price
    print(f"{name:<10}{price:>8.2f}")
print("-" * 18)
print(f"{'TOTAL':<10}{total:>8.2f}")
`, [["2\nTea 12.5\nSamosa 15", "Tea          12.50\nSamosa       15.00\n------------------\nTOTAL        27.50"]], [["1\nThali 120", "Thali       120.00\n------------------\nTOTAL       120.00"], ["3\nPen 10\nNotebook 45.75\nBag 899", "Pen          10.00\nNotebook     45.75\nBag         899.00\n------------------\nTOTAL       954.75"]], { match: "exact", level: "advanced" }),
  ],
  quiz: [
    { q: "What is \"Inveon\"[1:4]?", options: ["\"Inv\"", "\"nve\"", "\"nveo\"", "\"Inve\""], answer: 1, why: "A slice starts at index 1 and stops before index 4." },
    { q: "What does \"a,b,,c\".split(\",\") return?", options: ["['a', 'b', 'c']", "['a', 'b', '', 'c']", "['a,b,,c']", "['a', 'b', ',', 'c']"], answer: 1, why: "Splitting on a separator keeps empty strings between two separators; split() with no argument would not." },
    { q: "What happens with s = \"cat\"; s[0] = \"b\"?", options: ["s becomes \"bat\"", "TypeError: strings are immutable", "s becomes \"bcat\"", "Nothing happens"], answer: 1, why: "Strings can't be changed in place; build a new one: s = \"b\" + s[1:]." },
    { q: "What does \"Python\".find(\"java\") return?", options: ["False", "-1", "None", "It raises ValueError"], answer: 1, why: "find returns -1 when the substring is missing; index raises ValueError." },
    { q: "Which expression joins [\"a\", \"b\", \"c\"] into \"a-b-c\"?", options: ["[\"a\",\"b\",\"c\"].join(\"-\")", "\"-\".join([\"a\", \"b\", \"c\"])", "join(\"-\", [\"a\",\"b\",\"c\"])", "\"-\".split([\"a\",\"b\",\"c\"])"], answer: 1, why: "join is a method of the separator string and takes the list." },
    { q: "What does print(f\"{7:03d}|{3.14159:>7.2f}|\") print?", options: ["007|   3.14|", "7  |3.14   |", "007|3.14|", "  7|   3.14|"], answer: 0, why: "03d pads with zeros to width 3; >7.2f right-aligns 3.14 in 7 characters." },
    { q: "What does this print?\n\nname = \"asha\"\nname.upper()\nprint(name)", options: ["ASHA", "asha", "Asha", "None"], answer: 1, why: "upper() returns a new string, which was thrown away; name is unchanged." },
    { q: "What is chr(ord(\"a\") + 25)?", options: ["\"y\"", "\"z\"", "\"{\"", "\"A\""], answer: 1, why: "a is position 0, so adding 25 gives the 26th letter, z." },
    { q: "Why is if s.find(\"x\"): a bug when checking whether s contains \"x\"?", options: ["find is not a string method", "It gives 0 (falsy) when x is at the start and -1 (truthy) when x is missing", "find is slower than in", "It is not a bug"], answer: 1, why: "Use \"x\" in s for a membership test." },
    { q: "What does sorted(\"Banana\") return?", options: ["['a', 'a', 'a', 'B', 'n', 'n']", "['B', 'a', 'a', 'a', 'n', 'n']", "\"Baaann\"", "['a', 'a', 'a', 'b', 'n', 'n']"], answer: 1, why: "sorted returns a list of characters, and capital letters have smaller codes than small letters, so B comes first." },
  ],
};
