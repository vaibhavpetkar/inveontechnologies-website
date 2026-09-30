import type { PracticeUnit } from "../../types.js";
import { bq, sh } from "./shared.js";

const usesIf = { match: String.raw`\bif\b[\s\S]*\bfi\b`, message: "Uses if ... fi" };

export const scripting: PracticeUnit = {
  key: "scripting",
  title: "Bash scripting: variables, input and decisions",
  summary: "shebang and running scripts, variables and quoting, read, arithmetic, test conditions, if/elif/else, case and default values",
  reading: sh`## Your first script

A bash script is a text file of commands. The first line, the shebang, says which program runs it:

` + "```bash" + sh`
#!/bin/bash
echo "Deploying to $HOSTNAME"
` + "```" + sh`

Save it as deploy.sh, run chmod +x deploy.sh once, then run it with ./deploy.sh (or bash deploy.sh). Lines starting with # are comments.

## Variables and quoting

` + "```bash" + sh`
name="Asha"            # no spaces around =
count=3
echo "Hello, $name"    # double quotes expand variables
echo 'Hello, $name'    # single quotes print it literally
echo "$\{name}_backup"  # braces when text follows the name
today=$(date +%F)      # command substitution: the output of a command
` + "```" + sh`

The most common beginner error is name = "Asha" with spaces: bash then tries to run a command called name. The second is forgetting quotes. If file="my notes.txt", then rm $file tries to delete two files, my and notes.txt. Always write "$file".

## Reading input

read takes a line from the keyboard (or from stdin in a pipeline) and splits it on spaces into the variables you name. The last variable gets the rest of the line.

` + "```bash" + sh`
read -r name                 # -r keeps backslashes as they are
read -r a b                  # two words from one line
read -rp "Your age: " age    # with a prompt (interactive only)
` + "```" + sh`

## Arithmetic

Bash variables are text, but $(( )) does whole-number maths:

` + "```bash" + sh`
a=17; b=5
echo $((a + b))    # 22
echo $((a / b))    # 3  (whole numbers only)
echo $((a % b))    # 2  (remainder)
((count++))
` + "```" + sh`

For decimals, hand the work to awk (awk "BEGIN { printf \"%.2f\", 17 / 5 }") or bc.

## Conditions: test, [ ] and [[ ]]

if runs a command and checks its exit status: 0 means true. [ ] (the test command) and bash's [[ ]] build conditions:

- Numbers: -eq, -ne, -lt, -le, -gt, -ge. Inside [ ], > is a redirect, not "greater than".
- Strings: = (or ==), !=, -z "$s" (empty), -n "$s" (not empty).
- Files: -e exists, -f regular file, -d directory, -r readable, -x executable.
- [[ ]] adds && and || inside, pattern matching ([[ $f == *.log ]]) and regex ([[ $s =~ ^[0-9]+$ ]]).

` + "```bash" + sh`
if [ "$marks" -ge 90 ]; then
    echo "A"
elif [ "$marks" -ge 75 ]; then
    echo "B"
else
    echo "C"
fi
` + "```" + sh`

Spaces matter: [ "$a" -gt 5 ] needs a space after [ and before ]. Quote variables inside [ ] so an empty value does not break the test. For arithmetic comparisons, (( a > b )) is often clearer.

## case: many choices

` + "```bash" + sh`
case "$env" in
    dev|development) url="http://localhost:3000" ;;
    prod)            url="https://api.example.com" ;;
    *)               echo "unknown env"; exit 1 ;;
esac
` + "```" + sh`

Each branch ends with ;; and patterns can use * and |. case is the tidy way to handle menus, commands like start/stop/status, and file extensions.

## Default values

Parameter expansion gives defaults without an if:

- $\{PORT:-8080}: PORT, or 8080 when it is unset or empty.
- $\{NAME:?NAME is required}: stop with an error when it is missing.
- $\{#s}: the length of s. $\{s^^}: upper case. $\{s,,}: lower case.

## Exit status

Every command returns a status: 0 for success, 1 to 255 for failure. $? holds the last one, and a script can end with exit 0 or exit 1. Tools like CI pipelines and systemd use this number to decide whether your script worked.

## How these assignments are checked

Each script is run with bash. The input arrives on stdin, so read it with read, one line per read. Prompts are allowed for most questions (only the words and numbers of the answer are compared), but for yes/no style answers make sure the last line printed is exactly the answer.`,
  questions: [
    bq("Greet a user", "Read a name and print a greeting.", ["Input: a name (one word)", "Output: Hello, NAME! Welcome to Linux."], sh`#!/bin/bash
read -r name
echo "Hello, $name! Welcome to Linux."
`, [["Asha", "Hello, Asha! Welcome to Linux."]], [["Ravi", "Hello, Ravi! Welcome to Linux."], ["Om", "Hello, Om! Welcome to Linux."]]),

    bq("Rectangle area and perimeter", "Read the length and breadth of a rectangle (whole numbers) and print its area and perimeter.", ["Input: length breadth on one line", "Output: Area: X Perimeter: Y", "Use $(( )) for the arithmetic"], sh`#!/bin/bash
read -r l b
echo "Area: $((l * b))"
echo "Perimeter: $((2 * (l + b)))"
`, [["5 3", "Area: 15 Perimeter: 16"]], [["10 10", "Area: 100 Perimeter: 40"], ["1 0", "Area: 0 Perimeter: 2"]], { rules: [{ match: String.raw`\$\(\(`, message: "Uses $(( )) arithmetic" }] }),

    bq("Even or odd", "Read a whole number and print even or odd.", ["Input: a whole number (may be negative)", "Output: even or odd"], sh`#!/bin/bash
read -r n
if (( n % 2 == 0 )); then
    echo "even"
else
    echo "odd"
fi
`, [["4", "even"], ["7", "odd"]], [["0", "even"], ["-3", "odd"], ["1000001", "odd"]], { rules: [usesIf] }),

    bq("Grade from marks", "Read marks out of 100 and print the grade: 90 and above A, 75 to 89 B, 60 to 74 C, 40 to 59 D, below 40 F.", ["Input: marks (0 to 100)", "Output: Grade: X"], sh`#!/bin/bash
read -r marks
if [ "$marks" -ge 90 ]; then
    grade="A"
elif [ "$marks" -ge 75 ]; then
    grade="B"
elif [ "$marks" -ge 60 ]; then
    grade="C"
elif [ "$marks" -ge 40 ]; then
    grade="D"
else
    grade="F"
fi
echo "Grade: $grade"
`, [["95", "Grade: A"], ["62", "Grade: C"]], [["75", "Grade: B"], ["40", "Grade: D"], ["39", "Grade: F"], ["100", "Grade: A"]], { rules: [{ match: String.raw`\belif\b`, message: "Uses elif" }] }),

    bq("Largest of three", "Read three whole numbers and print the largest.", ["Input: a b c on one line", "Output: Largest: X"], sh`#!/bin/bash
read -r a b c
max=$a
if (( b > max )); then
    max=$b
fi
if (( c > max )); then
    max=$c
fi
echo "Largest: $max"
`, [["3 9 4", "Largest: 9"]], [["-5 -2 -9", "Largest: -2"], ["7 7 7", "Largest: 7"], ["1 2 30", "Largest: 30"]], { rules: [usesIf] }),

    bq("Leap year", "Read a year and print Leap year or Not a leap year. A year is a leap year if it is divisible by 4 and not by 100, or divisible by 400.", ["Input: a year", "Output: Leap year or Not a leap year"], sh`#!/bin/bash
read -r y
if (( (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 )); then
    echo "Leap year"
else
    echo "Not a leap year"
fi
`, [["2024", "Leap year", ["not"]], ["2023", "Not a leap year"]], [["1900", "Not a leap year"], ["2000", "Leap year", ["not"]], ["2100", "Not a leap year"]], { level: "intermediate" }),

    bq("Disk usage alert", "Read a disk usage value as df prints it (like 87%) and a threshold. Print ALERT: disk at X% if usage is at or above the threshold, otherwise OK: disk at X%.", ["Input line 1: usage with a % sign", "Input line 2: threshold (a whole number)", "Output: ALERT: disk at X% or OK: disk at X%", "Remove the % with parameter expansion before comparing"], sh`#!/bin/bash
read -r usage
read -r limit
pct="$\{usage%\%}"
if [ "$pct" -ge "$limit" ]; then
    echo "ALERT: disk at $pct%"
else
    echo "OK: disk at $pct%"
fi
`, [["87%\n80", "ALERT: disk at 87%"], ["45%\n80", "OK: disk at 45%"]], [["80%\n80", "ALERT: disk at 80%"], ["9%\n90", "OK: disk at 9%"], ["100%\n95", "ALERT: disk at 100%"]], { level: "intermediate" }),

    bq("Port with a default", "Read a line that may be empty. If it has a value, that is the port; if it is empty use 8080. Print Using port P.", ["Input: one line, a port number or an empty line", "Output: Using port P", "Use $\{var:-default}"], sh`#!/bin/bash
read -r port
echo "Using port $\{port:-8080}"
`, [["3000", "Using port 3000"], ["", "Using port 8080"]], [["443", "Using port 443"], ["\n", "Using port 8080"]], { rules: [{ match: String.raw`:-`, message: "Uses the :- default" }] }),

    bq("Two-number calculator", "Read an expression like 12 + 5 and print the result. Support + - * / and % (whole numbers). Dividing by zero prints error: division by zero, and any other operator prints error: unknown operator.", ["Input: a op b on one line, separated by spaces", "Output: the result, or the error message", "Use case on the operator (quote \"*\" in the pattern)"], sh`#!/bin/bash
read -r a op b
case "$op" in
    +) echo $((a + b)) ;;
    -) echo $((a - b)) ;;
    "*") echo $((a * b)) ;;
    /|%)
        if [ "$b" -eq 0 ]; then
            echo "error: division by zero"
        elif [ "$op" = "/" ]; then
            echo $((a / b))
        else
            echo $((a % b))
        fi
        ;;
    *) echo "error: unknown operator" ;;
esac
`, [["12 + 5", "17"], ["9 / 0", "error: division by zero"]], [["20 * 3", "60"], ["17 % 5", "2"], ["7 ^ 2", "error: unknown operator"], ["3 - 10", "-7"]], { level: "intermediate", rules: [{ match: String.raw`\bcase\b[\s\S]*\besac\b`, message: "Uses case ... esac" }] }),

    bq("Valid Linux username", "Read a proposed username and print valid if it starts with a lowercase letter, then has 2 to 15 more characters that are lowercase letters, digits, _ or -. Otherwise print invalid.", ["Input: one word", "Output: valid or invalid", "Use [[ ... =~ regex ]]"], sh`#!/bin/bash
read -r user
if [[ "$user" =~ ^[a-z][a-z0-9_-]{2,15}$ ]]; then
    echo "valid"
else
    echo "invalid"
fi
`, [["asha_01", "valid"], ["1asha", "invalid"]], [["ab", "invalid"], ["deploy-bot", "valid"], ["Ravi", "invalid"], ["abcdefghijklmnop", "valid"], ["abcdefghijklmnopq", "invalid"]], { level: "intermediate", rules: [{ match: String.raw`=~`, message: "Uses =~" }] }),

    bq("Compare two versions", "Read two version numbers of the form major.minor.patch and say whether the first is newer, older or the same as the second. Compare the parts as numbers, so 1.10.0 is newer than 1.9.5.", ["Input: two versions on one line", "Output: newer, older or same"], sh`#!/bin/bash
read -r v1 v2
IFS='.' read -r a1 b1 c1 <<< "$v1"
IFS='.' read -r a2 b2 c2 <<< "$v2"
x=$(( a1 * 1000000 + b1 * 1000 + c1 ))
y=$(( a2 * 1000000 + b2 * 1000 + c2 ))
if (( x > y )); then
    echo "newer"
elif (( x < y )); then
    echo "older"
else
    echo "same"
fi
`, [["1.10.0 1.9.5", "newer"], ["2.0.1 2.0.1", "same"]], [["0.9.9 1.0.0", "older"], ["3.2.10 3.2.9", "newer"], ["1.2.3 1.3.0", "older"]], { level: "advanced" }),
  ],
  quiz: [
    { q: "What is the first line #!/bin/bash called?", options: ["A comment only", "The shebang: it says which program runs the script", "An import", "The script's name"], answer: 1, why: "When you run ./script.sh, the kernel reads the shebang to pick the interpreter." },
    { q: "Which assignment is correct in bash?", options: ["name = \"Asha\"", "name= \"Asha\"", "name=\"Asha\"", "$name=\"Asha\""], answer: 2, why: "No spaces around =, and no $ when assigning." },
    { q: "With name=Asha, what does echo 'Hi $name' print?", options: ["Hi Asha", "Hi $name", "Hi", "An error"], answer: 1, why: "Single quotes stop all expansion; use double quotes to expand variables." },
    { q: "What does echo $((17 / 5)) print?", options: ["3.4", "3", "4", "17/5"], answer: 1, why: "Bash arithmetic uses whole numbers and drops the fraction." },
    { q: "Which test checks that a variable holds an empty string?", options: ["[ -n \"$s\" ]", "[ -z \"$s\" ]", "[ -e \"$s\" ]", "[ $s == 0 ]"], answer: 1, why: "-z is true for a zero-length string; -n is true for a non-empty one." },
    { q: "Which operator compares numbers inside [ ]?", options: [">", "-gt", "=>", "gt"], answer: 1, why: "Inside [ ], > redirects to a file; use -gt, -lt, -ge, -le, -eq, -ne." },
    { q: "What does echo \"${PORT:-8080}\" print when PORT is set to an empty string?", options: ["Nothing", "8080", ":-8080", "PORT"], answer: 1, why: ":- uses the default when the variable is unset or empty (- alone only when unset)." },
    { q: "What does this print?\n\nx=5\nif [ $x -gt 3 ] && [ $x -lt 5 ]; then echo in; else echo out; fi", options: ["in", "out", "Nothing", "A syntax error"], answer: 1, why: "5 -lt 5 is false, so the && chain fails and the else branch runs." },
    { q: "file=\"my notes.txt\"; rm $file tries to delete what?", options: ["my notes.txt", "Two files: my and notes.txt", "Nothing, it is an error", "All .txt files"], answer: 1, why: "Unquoted, the value is split on spaces into two arguments; write rm \"$file\"." },
    { q: "In a case statement, which pattern catches everything not matched before it?", options: ["default)", "else)", "*)", "?)"], answer: 2, why: "* matches any string, so *) at the end is the default branch." },
  ],
};
