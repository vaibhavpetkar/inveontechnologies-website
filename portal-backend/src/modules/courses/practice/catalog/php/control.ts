import type { PracticeUnit } from "../../types.js";
import { pq, usesLoop } from "./shared.js";

const table = (n: number) => Array.from({ length: 10 }, (_, i) => `${n} x ${i + 1} = ${n * (i + 1)}`).join("\n");
const triangle = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: i + 1 }, (_, j) => j + 1).join(" ")).join("\n");
const fizz = (n: number) => Array.from({ length: n }, (_, i) => i + 1).map((i) => (i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : String(i))).join("\n");
const usesIf = { match: String.raw`\bif\s*\(`, message: "Uses an if statement" };

export const control: PracticeUnit = {
  key: "control",
  title: "Conditions and loops",
  summary: "if, elseif and else, switch and match, logical operators, for, while, do-while and foreach, break and continue",
  reading: String.raw`## Making decisions with if

A condition is any expression that is true or false. PHP runs the first block whose condition is true.

` + "```php" + String.raw`
<?php
$marks = (int) trim(fgets(STDIN));
if ($marks >= 75) {
    echo "Distinction\n";
} elseif ($marks >= 40) {
    echo "Pass\n";
} else {
    echo "Fail\n";
}
` + "```" + String.raw`

- PHP writes elseif as one word (else if also works).
- Put the strictest condition first. If you check $marks >= 40 before $marks >= 75, a 90 would only get "Pass".
- Always use braces, even for one line. It avoids bugs when you add a second line later.

## Logical and comparison operators

- && (and), || (or), ! (not). A leap year: ($y % 4 == 0 && $y % 100 != 0) || $y % 400 == 0.
- Compare with === and !== when types matter. == converts types first, and PHP 8 made this safer ("abc" == 0 is now false), but === says exactly what you mean.
- The ternary operator is a short if/else: $result = $n % 2 === 0 ? "Even" : "Odd";

## switch and match

switch compares one value against many cases. Every case needs a break, or execution "falls through" into the next case.

` + "```php" + String.raw`
switch ($day) {
    case 1:
        echo "Monday";
        break;
    case 7:
        echo "Sunday";
        break;
    default:
        echo "Invalid day";
}
` + "```" + String.raw`

PHP 8 added match, an expression that returns a value, compares with ===, needs no break, and throws an error if nothing matches and there is no default:

` + "```php" + String.raw`
$name = match ($day) {
    1 => "Monday",
    6, 7 => "Weekend",
    default => "Weekday",
};
` + "```" + String.raw`

## Loops

- for: when you know how many times. for ($i = 1; $i <= 10; $i++) { ... }
- while: when you repeat until something changes, like taking digits off a number: while ($n > 0) { $sum += $n % 10; $n = intdiv($n, 10); }
- do-while: runs the body at least once, then checks.
- foreach: walks through every item of an array: foreach ($marks as $m) { ... } or foreach ($prices as $item => $price) { ... }

break leaves the loop immediately; continue skips to the next round. Both are useful in searches, such as a prime check that stops at the first divisor.

## Nested loops and patterns

A loop inside a loop runs the inner loop fully for every round of the outer one. Patterns are the classic practice: the outer loop picks the row, the inner loop prints that row's items.

` + "```php" + String.raw`
for ($row = 1; $row <= 3; $row++) {
    $line = [];
    for ($col = 1; $col <= $row; $col++) {
        $line[] = $col;
    }
    echo implode(" ", $line) . "\n";
}
` + "```" + String.raw`

Building each row in an array and joining it with implode avoids a trailing space at the end of the line, which matters when output is compared exactly.

## Efficient checks

To test whether n is prime you only need to try divisors up to the square root of n: if n had a factor bigger than that, it would also have one smaller. Stop as soon as you find a divisor with break. Remember that 0 and 1 are not prime.

## Common mistakes

- Writing if ($x = 5), which assigns 5 and is always true. Use == or ===.
- Forgetting break in switch.
- A while loop whose variable never changes, so it runs forever (the checker stops it after 5 seconds).
- Off-by-one errors: < 10 runs 0 to 9, <= 10 runs 0 to 10.

## How your assignments are checked

Your .php file is reviewed line by line (for example "=" inside a condition is flagged) and then run with several inputs, including hidden edge cases like 0, negative numbers and the boundary values of each condition. For yes/no answers, the checker also makes sure a wrong word such as "Not" is not in your final line, so print only the matching message.`,
  questions: [
    pq("Even or odd", "Read an integer and say whether it is Even or Odd.", ["Input: one integer (it may be negative or zero)", "Output: Even or Odd"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
if ($n % 2 === 0) {
    echo "Even\n";
} else {
    echo "Odd\n";
}
`, [["4", "Even"], ["7", "Odd"]], [["0", "Even"], ["-7", "Odd"], ["-10", "Even"]], { rules: [usesIf] }),

    pq("Largest of three", "Read three integers and print the largest, using if/elseif (without max()).", ["Input: three integers on one line", "Output: the largest", "Don't use the max() function"], String.raw`<?php
$parts = explode(" ", trim(fgets(STDIN)));
$a = (int) $parts[0];
$b = (int) $parts[1];
$c = (int) $parts[2];
if ($a >= $b && $a >= $c) {
    $largest = $a;
} elseif ($b >= $c) {
    $largest = $b;
} else {
    $largest = $c;
}
echo "Largest: $largest\n";
`, [["3 9 5", "9"], ["10 2 7", "10"]], [["-1 -5 -3", "-1"], ["4 4 2", "4"], ["1 2 8", "8"]], {
      rules: [usesIf, { notMatch: String.raw`\bmax\s*\(`, message: "Doesn't use max()" }],
    }),

    pq("Grade from marks", "Read marks out of 100 and print the grade: A for 90 and above, B for 75 to 89, C for 60 to 74, D for 40 to 59, F below 40.", ["Input: marks (0 to 100)", "Print exactly one letter and nothing else"], String.raw`<?php
$marks = (int) trim(fgets(STDIN));
if ($marks >= 90) {
    echo "A\n";
} elseif ($marks >= 75) {
    echo "B\n";
} elseif ($marks >= 60) {
    echo "C\n";
} elseif ($marks >= 40) {
    echo "D\n";
} else {
    echo "F\n";
}
`, [["95", "A"], ["75", "B"]], [["60", "C"], ["40", "D"], ["39", "F"], ["100", "A"]], { match: "exact", rules: [{ match: String.raw`\belse\s*if\b|\belseif\b`, message: "Uses elseif for the grade ranges" }] }),

    pq("Leap year", "Read a year and say whether it is a leap year: divisible by 4 but not by 100, or divisible by 400.", ["Input: a year", "Output: Leap year or Not a leap year"], String.raw`<?php
$year = (int) trim(fgets(STDIN));
if (($year % 4 === 0 && $year % 100 !== 0) || $year % 400 === 0) {
    echo "Leap year\n";
} else {
    echo "Not a leap year\n";
}
`, [["2024", "Leap year", ["not"]], ["2023", "Not a leap year"]], [["1900", "Not a leap year"], ["2000", "Leap year", ["not"]], ["2100", "Not a leap year"]], { rules: [{ match: String.raw`&&|\|\||\band\b|\bor\b`, message: "Combines conditions with && or ||" }] }),

    pq("Day name with switch", "Read a day number (1 = Monday ... 7 = Sunday) and print the day's name using switch. Any other number prints Invalid day.", ["Input: an integer", "Output: the day name, or Invalid day"], String.raw`<?php
$day = (int) trim(fgets(STDIN));
switch ($day) {
    case 1:
        echo "Monday\n";
        break;
    case 2:
        echo "Tuesday\n";
        break;
    case 3:
        echo "Wednesday\n";
        break;
    case 4:
        echo "Thursday\n";
        break;
    case 5:
        echo "Friday\n";
        break;
    case 6:
        echo "Saturday\n";
        break;
    case 7:
        echo "Sunday\n";
        break;
    default:
        echo "Invalid day\n";
}
`, [["1", "Monday"], ["7", "Sunday"]], [["4", "Thursday"], ["9", "Invalid day"], ["0", "Invalid day"]], { rules: [{ match: String.raw`\bswitch\s*\(`, message: "Uses a switch statement" }, { match: String.raw`\bbreak\s*;`, message: "Ends the cases with break" }] }),

    pq("Multiplication table", "Read a number and print its multiplication table from 1 to 10.", ["Input: an integer n", "Output: 10 lines in the form n x i = product"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
for ($i = 1; $i <= 10; $i++) {
    echo "$n x $i = " . ($n * $i) . "\n";
}
`, [["5", table(5)], ["12", table(12)]], [["1", table(1)], ["-3", table(-3)]], { rules: [usesLoop] }),

    pq("Sum of digits", "Read a whole number and print the sum of its digits using a while loop.", ["Input: a non-negative integer", "Output: the sum of its digits", "Use % 10 to take the last digit and intdiv($n, 10) to drop it"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
$sum = 0;
while ($n > 0) {
    $sum += $n % 10;
    $n = intdiv($n, 10);
}
echo "Sum of digits: $sum\n";
`, [["1234", "10"], ["9", "9"]], [["0", "0"], ["99999", "45"], ["1000001", "2"]], { rules: [{ match: String.raw`\bwhile\s*\(`, message: "Uses a while loop" }] }),

    pq("Factorial", "Read n and print n! (the product 1 x 2 x ... x n). 0! is 1.", ["Input: an integer from 0 to 20", "Output: n!"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
$fact = 1;
for ($i = 2; $i <= $n; $i++) {
    $fact *= $i;
}
echo "Factorial: $fact\n";
`, [["5", "120"], ["0", "1"]], [["10", "3628800"], ["20", "2432902008176640000"], ["1", "1"]], { rules: [usesLoop] }),

    pq("Prime check", "Read a number and say whether it is prime. Try divisors only up to its square root and stop at the first one.", ["Input: an integer n (n >= 0)", "Output: Prime or Not prime", "0 and 1 are not prime"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
$prime = $n >= 2;
for ($d = 2; $d * $d <= $n; $d++) {
    if ($n % $d === 0) {
        $prime = false;
        break;
    }
}
echo $prime ? "Prime\n" : "Not prime\n";
`, [["7", "Prime", ["not"]], ["12", "Not prime"]], [["1", "Not prime"], ["97", "Prime", ["not"]], ["2", "Prime", ["not"]], ["49", "Not prime"]], { level: "intermediate", rules: [usesLoop, { match: String.raw`\bbreak\s*;`, message: "Stops at the first divisor with break" }] }),

    pq("Number triangle", "Read n and print a triangle of numbers with nested loops: row r holds the numbers 1 to r separated by single spaces.", ["Input: an integer n (1 to 9)", "Print exactly n lines and nothing else", "Example for 3: 1 / 1 2 / 1 2 3 on separate lines"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
for ($row = 1; $row <= $n; $row++) {
    $items = [];
    for ($col = 1; $col <= $row; $col++) {
        $items[] = $col;
    }
    echo implode(" ", $items) . "\n";
}
`, [["3", triangle(3)], ["1", triangle(1)]], [["5", triangle(5)], ["9", triangle(9)]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`for\s*\([\s\S]*for\s*\(`, message: "Uses nested for loops" }] }),

    pq("FizzBuzz", "Print the numbers from 1 to n, but print Fizz for multiples of 3, Buzz for multiples of 5 and FizzBuzz for multiples of both.", ["Input: an integer n", "Print exactly n lines and nothing else", "Check the multiple of 15 first"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
for ($i = 1; $i <= $n; $i++) {
    if ($i % 15 === 0) {
        echo "FizzBuzz\n";
    } elseif ($i % 3 === 0) {
        echo "Fizz\n";
    } elseif ($i % 5 === 0) {
        echo "Buzz\n";
    } else {
        echo "$i\n";
    }
}
`, [["5", fizz(5)], ["15", fizz(15)]], [["1", fizz(1)], ["31", fizz(31)]], { level: "intermediate", match: "exact", rules: [usesLoop] }),

    pq("Palindrome number", "Read a number, reverse it with a loop (no string functions) and say whether it reads the same both ways.", ["Input: a non-negative integer", "Output line 1: the reversed number", "Output line 2: Palindrome or Not a palindrome", "Don't use strrev"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
$original = $n;
$reversed = 0;
while ($n > 0) {
    $reversed = $reversed * 10 + $n % 10;
    $n = intdiv($n, 10);
}
echo "Reversed: $reversed\n";
echo $reversed === $original ? "Palindrome\n" : "Not a palindrome\n";
`, [["121", "121 Palindrome", ["not"]], ["123", "321 Not a palindrome"]], [["7", "7 Palindrome", ["not"]], ["1221", "1221 Palindrome", ["not"]], ["120", "21 Not a palindrome"]], {
      level: "advanced",
      rules: [{ match: String.raw`\bwhile\s*\(`, message: "Reverses the number with a while loop" }, { notMatch: String.raw`\bstrrev\s*\(`, message: "Doesn't use strrev" }],
    }),
  ],
  quiz: [
    { q: "How is \"else if\" usually written in PHP?", options: ["elif", "elseif", "elsif", "else-if"], answer: 1, why: "PHP has the keyword elseif (else if also works)." },
    { q: "Which loop is designed to walk through every item of an array?", options: ["for", "while", "foreach", "do-while"], answer: 2, why: "foreach ($items as $item) visits each element without an index counter." },
    { q: "What does continue do inside a loop?", options: ["Ends the loop", "Skips the rest of this round and starts the next", "Restarts the loop from the beginning", "Pauses the program"], answer: 1, why: "continue jumps to the next iteration; break leaves the loop." },
    { q: "How many times does a do-while loop run its body at least?", options: ["0", "1", "2", "It depends on the condition"], answer: 1, why: "The condition is checked after the body, so it always runs once." },
    { q: "What does this print?\n\nfor ($i = 0; $i < 3; $i++) { echo $i; }", options: ["123", "012", "0123", "0 1 2"], answer: 1, why: "$i takes 0, 1 and 2; the loop stops when $i becomes 3." },
    { q: "Which condition correctly checks for a leap year?", options: ["$y % 4 == 0", "$y % 4 == 0 && $y % 100 != 0 || $y % 400 == 0", "$y % 100 == 0", "$y % 400 == 0 && $y % 4 != 0"], answer: 1, why: "Divisible by 4 and not by 100, or divisible by 400." },
    { q: "What is the value of $x after: $x = 10 > 5 ? \"big\" : \"small\";", options: ["true", "\"big\"", "\"small\"", "10"], answer: 1, why: "The ternary returns the first value when the condition is true." },
    { q: "In a switch without break statements, $d = 1; switch ($d) { case 1: echo \"A\"; case 2: echo \"B\"; default: echo \"C\"; } prints:", options: ["A", "ABC", "AB", "C"], answer: 1, why: "Without break, execution falls through into every case below the match." },
    { q: "What happens with: echo match (5) { 1 => \"one\", 2 => \"two\" };", options: ["Prints nothing", "Prints \"\"", "Throws an UnhandledMatchError", "Prints 5"], answer: 2, why: "match must find a matching arm; with no default it throws UnhandledMatchError." },
    { q: "What does this print?\n\n$i = 5;\nwhile ($i = 0) { echo \"x\"; }\necho $i;", options: ["xxxxx0", "5", "0", "It loops forever"], answer: 2, why: "$i = 0 assigns 0, which is falsy, so the loop body never runs and $i is now 0." },
  ],
};
