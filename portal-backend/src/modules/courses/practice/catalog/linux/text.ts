import type { PracticeUnit } from "../../types.js";
import { bq, exactOut, sh } from "./shared.js";

const pipeline = { match: String.raw`\|`, message: "Uses a pipeline (|) to join commands" };

export const text: PracticeUnit = {
  key: "text",
  title: "Viewing and processing text",
  summary: "cat, head, tail, grep, sort, uniq, wc, cut, tr, awk and sed, joined with pipes and redirection",
  reading: sh`## Why text tools matter

On a server, almost everything is text: logs, config files, CSV exports, command output. The Unix idea is small tools that each do one job well and are joined with pipes. A DevOps engineer who knows grep, awk and sed can answer "how many 500 errors did we get from which IP?" in one line, without writing a program.

## Looking at files

` + "```bash" + sh`
cat notes.txt            # print the whole file
less /var/log/syslog     # scroll (q to quit, / to search)
head -n 20 app.log       # first 20 lines
tail -n 50 app.log       # last 50 lines
tail -f app.log          # keep printing new lines as they arrive (Ctrl+C to stop)
wc -l access.log         # count lines (-w words, -c bytes)
` + "```" + sh`

tail -f is the everyday way to watch a live log while you test an app.

## Pipes and redirection

A pipe | sends the output of one command into the next. Redirection sends it to a file.

- cmd > out.txt writes output to a file (replacing it).
- cmd >> out.txt appends.
- cmd 2> errors.txt writes only the error output (stream 2).
- cmd > all.txt 2>&1 sends both output and errors to one file.
- cmd < input.txt feeds a file as input.
- cmd | tee out.txt shows the output and saves it at the same time.
- cmd > /dev/null throws output away.

## grep: find lines

` + "```bash" + sh`
grep "ERROR" app.log            # lines that contain ERROR
grep -i "timeout" app.log       # ignore case
grep -v "DEBUG" app.log         # lines that do NOT match
grep -c "ERROR" app.log         # count matching lines
grep -n "listen" nginx.conf     # show line numbers
grep -r "API_URL" src/          # search a whole directory
grep -E "ERROR|FATAL" app.log   # extended regex: either word
` + "```" + sh`

Important for scripts: grep exits with status 1 when nothing matches. In a script that must succeed, write grep "x" file || echo "no matches".

## sort, uniq, cut and tr

- sort sorts lines; sort -n sorts numbers, -r reverses, -k2 sorts by the second field, -t, sets the separator, -u removes duplicates.
- uniq removes repeated neighbouring lines, so always sort first. uniq -c puts a count in front.
- cut -d, -f2 takes the second comma-separated field; cut -c1-5 takes characters 1 to 5.
- tr translates characters: tr 'a-z' 'A-Z' upper-cases, tr -d '\r' deletes Windows line endings, tr -s ' ' squeezes repeated spaces.

The classic "top N" pipeline:

` + "```bash" + sh`
cut -d' ' -f1 access.log | sort | uniq -c | sort -rn | head -n 5
` + "```" + sh`

It takes the IP field, groups equal IPs together, counts each group, sorts by the count (biggest first) and keeps five.

## awk: columns and totals

awk reads a line at a time and splits it into fields $1, $2 ... ($0 is the whole line, NF is the number of fields, NR the line number). A program is pattern { action }.

` + "```bash" + sh`
awk '{print $1, $3}' data.txt                 # columns 1 and 3
awk -F, 'NR > 1 {sum += $2} END {print sum}' sales.csv
awk '$3 >= 500 {print $1}' orders.txt          # filter by a number
awk '{count[$2]++} END {for (k in count) print k, count[k]}' app.log
` + "```" + sh`

-F sets the field separator, END runs after the last line, and arrays like count[$2] group values by a key. The order of for (k in count) is not fixed, so pipe it into sort when order matters. Use printf "%.2f\n", x for two decimals.

## sed: edit a stream

` + "```bash" + sh`
sed 's/http:/https:/' urls.txt        # first match on each line
sed 's/http:/https:/g' urls.txt       # every match (g = global)
sed -n '10,20p' big.log               # print only lines 10 to 20
sed '/^#/d' config.ini                # delete comment lines
sed -i 's/8080/9090/' app.conf        # edit the file in place
sed -E 's/([0-9]{3})-([0-9]{4})/\2-\1/' phones.txt
` + "```" + sh`

With -E, ( ) captures a group and \1 \2 put it back. Be careful with sed -i on real config: run it without -i first and check the output.

## Common mistakes

- uniq without sort misses duplicates that are not next to each other.
- Single quotes around awk programs, so bash does not expand $1 itself.
- sort without -n sorts 10 before 9, because it compares text.
- A script whose last command is a grep with no match exits with status 1 and looks like a failure.

## How these assignments are checked

Your script is run with bash and the input is given on stdin, exactly as if it came through a pipe. Tools like grep, awk, sed and sort read stdin when you give them no file name. Outputs marked "compared line by line" must match exactly, so print only the result.`,
  questions: [
    bq("Count lines and words", "Read some text from stdin and print how many lines and how many words it has.", ["Input: any number of lines of text", "Output: lines: X words: Y", "Tip: save the input once, for example text=$(cat), then count it"], sh`#!/bin/bash
input=$(cat)
lines=$(printf '%s\n' "$input" | wc -l)
words=$(printf '%s\n' "$input" | wc -w)
echo "lines: $lines words: $words"
`, [["the quick brown fox\njumps over\nthe lazy dog\n", "lines: 3 words: 9"]], [["one\n", "lines: 1 words: 1"], ["a b c d e\n\nf g\n", "lines: 3 words: 7"]], { rules: [{ match: String.raw`\bwc\b`, message: "Uses wc" }] }),

    bq("Show only the error lines", "The input is an application log. Print every line that contains ERROR (in capitals), in order. If there are none, print no errors.", ["Input: log lines", "Output: the matching lines, or no errors", "Remember: grep exits with status 1 when nothing matches", exactOut], sh`#!/bin/bash
grep "ERROR" || echo "no errors"
`, [["10:00 INFO started\n10:01 ERROR db timeout\n10:02 INFO retry\n10:03 ERROR db down\n", "10:01 ERROR db timeout\n10:03 ERROR db down"]], [["10:00 INFO ok\n10:05 WARN slow\n", "no errors"], ["ERROR at start\nerror in lowercase is not counted\n", "ERROR at start"]], { match: "exact", rules: [{ match: String.raw`\bgrep\b`, message: "Uses grep" }] }),

    bq("Lines without comments", "Print a config file without its comment lines (lines whose first non-space character is #) and without blank lines.", ["Input: the lines of a config file", "Output: the remaining lines in order", exactOut], sh`#!/bin/bash
grep -Ev '^[[:space:]]*(#|$)' || true
`, [["# server settings\nport=8080\n\n  # log level\nlevel=info\n", "port=8080\nlevel=info"]], [["host=db\n# user=admin\nuser=app\n\n\n", "host=db\nuser=app"], ["name=a#b\n", "name=a#b"]], { match: "exact" }),

    bq("Second column of a CSV", "The input is a CSV file with a header line. Print the values of the second column (without the header).", ["Input: a header line, then rows like id,name,city", "Output: one value per line", exactOut], sh`#!/bin/bash
tail -n +2 | cut -d, -f2
`, [["id,name,city\n1,Asha,Pune\n2,Ravi,Delhi\n", "Asha\nRavi"]], [["id,name\n", ""], ["sku,product,price\nA1,Pen,10\nB2,Notebook,45\nC3,Bag,700\n", "Pen\nNotebook\nBag"]], { match: "exact", rules: [pipeline] }),

    bq("Total sales with awk", "The input is a CSV with a header and rows of product,amount. Print the total of the amount column.", ["Input: header line product,amount then rows", "Output: Total: the sum"], sh`#!/bin/bash
awk -F, 'NR > 1 { sum += $2 } END { printf "Total: %d\n", sum }'
`, [["product,amount\npen,20\nbook,150\nbag,700\n", "Total: 870"]], [["product,amount\n", "Total: 0"], ["product,amount\nlaptop,55000\nmouse,450\n", "Total: 55450"]], { rules: [{ match: String.raw`\bawk\b`, message: "Uses awk" }] }),

    bq("Switch links to https", "Replace every http:// with https:// in the input and print the result.", ["Input: lines of text with links", "Output: the same lines with http:// replaced everywhere (also when a line has two links)", exactOut], sh`#!/bin/bash
sed 's|http://|https://|g'
`, [["see http://example.com\nand http://a.in or http://b.in\n", "see https://example.com\nand https://a.in or https://b.in"]], [["already https://safe.in\n", "already https://safe.in"], ["http://x.com/http://y.com\n", "https://x.com/https://y.com"]], { match: "exact", rules: [{ match: String.raw`\bsed\b`, message: "Uses sed" }] }),

    bq("Unique words in order", "Print every different word in the input once, in lower case, sorted alphabetically.", ["Input: lines of words separated by spaces", "Output: one word per line, sorted, no duplicates", exactOut], sh`#!/bin/bash
tr -s ' ' '\n' | tr 'A-Z' 'a-z' | grep -v '^$' | sort -u
`, [["The cat and the Dog\ndog AND bird\n", "and\nbird\ncat\ndog\nthe"]], [["zebra\n", "zebra"], ["b a  c\nA B\n", "a\nb\nc"]], { match: "exact", rules: [pipeline] }),

    bq("Print a range of lines", "The first input line has two numbers a and b. Print lines a to b of the text that follows (line 1 is the first line after the numbers).", ["Input line 1: a b", "Then: the text", "Output: only lines a to b", exactOut], sh`#!/bin/bash
read -r a b
sed -n "$\{a},$\{b}p"
`, [["2 3\none\ntwo\nthree\nfour\n", "two\nthree"]], [["1 1\nonly\n", "only"], ["3 10\nl1\nl2\nl3\nl4\n", "l3\nl4"]], { level: "intermediate", match: "exact" }),

    bq("Log levels by count", "Each log line looks like: time LEVEL message. Count the lines of each level and print level and count, biggest count first (ties in alphabetical order of level).", ["Input: log lines", "Output: one line per level: LEVEL count", exactOut], sh`#!/bin/bash
awk '{ print $2 }' | sort | uniq -c | sort -k1,1nr -k2,2 | awk '{ print $2, $1 }'
`, [["10:00 INFO a\n10:01 ERROR b\n10:02 INFO c\n10:03 WARN d\n10:04 INFO e\n10:05 ERROR f\n", "INFO 3\nERROR 2\nWARN 1"]], [["09:00 DEBUG x\n", "DEBUG 1"], ["1 WARN a\n2 ERROR b\n3 WARN c\n4 ERROR d\n5 INFO e\n", "ERROR 2\nWARN 2\nINFO 1"]], { level: "intermediate", match: "exact", rules: [pipeline] }),

    bq("Top IP addresses", "The input is a web server access log whose first field is the client IP. Print the 3 IPs with the most requests as count ip, most requests first (ties: smaller IP text first). Print fewer if there are fewer IPs.", ["Input: access log lines", "Output: up to 3 lines: count ip", exactOut], sh`#!/bin/bash
cut -d' ' -f1 | sort | uniq -c | sort -k1,1nr -k2,2 | head -n 3 | awk '{ print $1, $2 }'
`, [["10.0.0.5 GET /\n10.0.0.7 GET /a\n10.0.0.5 GET /b\n10.0.0.9 GET /\n10.0.0.5 POST /login\n10.0.0.7 GET /c\n192.168.1.2 GET /\n", "3 10.0.0.5\n2 10.0.0.7\n1 10.0.0.9"]], [["1.1.1.1 GET /\n", "1 1.1.1.1"], ["9.9.9.9 a\n8.8.8.8 b\n9.9.9.9 c\n8.8.8.8 d\n7.7.7.7 e\n7.7.7.7 f\n6.6.6.6 g\n", "2 7.7.7.7\n2 8.8.8.8\n2 9.9.9.9"]], { level: "intermediate", match: "exact", rules: [pipeline] }),

    bq("Mask phone numbers", "Hide every 10-digit phone number in the text: replace its first 6 digits with X and keep the last 4.", ["Input: lines of text", "Output: the same text with numbers masked, for example 9876543210 becomes XXXXXX3210", "Use sed -E with a capture group", exactOut], sh`#!/bin/bash
sed -E 's/\b[0-9]{6}([0-9]{4})\b/XXXXXX\1/g'
`, [["Call Asha on 9876543210 today\n", "Call Asha on XXXXXX3210 today"]], [["no numbers here\n", "no numbers here"], ["9123456780 or 9000011111, pin 411001\n", "XXXXXX6780 or XXXXXX1111, pin 411001"]], { level: "advanced", match: "exact" }),

    bq("Average marks per student", "Each line has a name and a mark. A student can appear on several lines. Print each student's average with 2 decimals, sorted by name.", ["Input: lines of name mark", "Output: name average (2 decimals), one line per student, sorted by name", exactOut], sh`#!/bin/bash
awk '{ sum[$1] += $2; n[$1]++ } END { for (s in sum) printf "%s %.2f\n", s, sum[s] / n[s] }' | sort
`, [["asha 80\nravi 70\nasha 91\nravi 65\nmeena 88\n", "asha 85.50\nmeena 88.00\nravi 67.50"]], [["om 100\n", "om 100.00"], ["b 1\na 2\nb 2\na 3\nb 3\n", "a 2.50\nb 2.00"]], { level: "advanced", match: "exact" }),
  ],
  quiz: [
    { q: "Which command keeps printing new lines as they are added to app.log?", options: ["cat app.log", "head -f app.log", "tail -f app.log", "less -n app.log"], answer: 2, why: "tail -f follows the file and prints new lines as they are written." },
    { q: "What does cmd >> out.txt do?", options: ["Replaces out.txt", "Appends to out.txt", "Reads input from out.txt", "Sends only errors to out.txt"], answer: 1, why: ">> appends; > truncates the file first." },
    { q: "Which option makes grep print lines that do NOT match?", options: ["-n", "-c", "-v", "-i"], answer: 2, why: "-v inverts the match." },
    { q: "Why do we usually write sort before uniq?", options: ["uniq only removes duplicate lines that are next to each other", "uniq needs numbers", "sort makes uniq faster but is optional", "uniq sorts in reverse"], answer: 0, why: "uniq compares each line with the previous one only, so equal lines must be grouped first." },
    { q: "What does cut -d: -f1 /etc/passwd print?", options: ["The first line", "The first character of every line", "The user names (the first :-separated field)", "The number of users"], answer: 2, why: "-d: sets : as the separator and -f1 picks the first field, which is the user name." },
    { q: "In awk, what is NR?", options: ["The number of fields on the line", "The current line (record) number", "The last field", "The field separator"], answer: 1, why: "NR counts records read so far; NF is the number of fields." },
    { q: "What is the difference between sed 's/a/b/' and sed 's/a/b/g'?", options: ["None", "The first changes only the first a on each line; g changes all of them", "g makes it ignore case", "g edits the file in place"], answer: 1, why: "Without g, s replaces only the first match on each line." },
    { q: "What does this print?\n\nprintf '10\\n9\\n100\\n' | sort", options: ["9 10 100", "10 100 9", "100 10 9", "9 100 10"], answer: 1, why: "Plain sort compares text character by character, so 1... comes before 9; use sort -n for numbers." },
    { q: "A script ends with grep \"FATAL\" app.log and the log has no FATAL lines. What is the script's exit status?", options: ["0", "1", "2", "127"], answer: 1, why: "grep returns 1 when nothing matches, and a script exits with the status of its last command." },
    { q: "Which command sends both normal output and errors of ./deploy.sh to deploy.log?", options: ["./deploy.sh 2>&1 > deploy.log", "./deploy.sh > deploy.log 2>&1", "./deploy.sh | deploy.log", "./deploy.sh 2> deploy.log"], answer: 1, why: "Redirections are applied left to right: first stdout goes to the file, then 2>&1 points stderr at the same place; the other order leaves stderr on the terminal." },
  ],
};
