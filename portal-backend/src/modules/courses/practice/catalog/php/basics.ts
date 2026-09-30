import type { PracticeUnit } from "../../types.js";
import { pq } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "Basics: variables, echo, operators and strings",
  summary: "PHP tags, variables and types, echo, reading input, arithmetic and comparison operators, string functions and interpolation",
  reading: String.raw`## What PHP is

PHP runs on the server. A browser asks for a page, the web server runs the PHP file, and whatever the script prints is sent back as HTML. It powers WordPress, Laravel, and a large share of Indian company websites and admin panels, so it is a very practical first backend language. This course uses PHP 8.3, but the basics have not changed for years.

Every PHP file starts with the opening tag. Code outside the tag is sent as plain text.

` + "```php" + String.raw`
<?php
$name = "Asha";
echo "Hello, $name!\n";
` + "```" + String.raw`

- Every statement ends with a semicolon.
- In a file that contains only PHP, leave out the closing ?> tag. It avoids stray blank lines being sent before headers.
- Comments: // or # for one line, /* ... */ for many lines.

## Variables and types

A variable starts with $ and is created the first time you assign to it. You do not declare a type; PHP works it out from the value.

- int: 42, -7. float: 3.14. string: "text". bool: true / false. null: no value.
- Arrays and objects come later in the course.
- var_dump($x) prints the type and value, which is the best debugging tool you have.
- Variable names are case-sensitive: $total and $Total are different. Function names are not.

## Strings: single vs double quotes

Double-quoted strings replace variables and understand escapes like \n. Single-quoted strings are taken literally.

` + "```php" + String.raw`
$city = "Pune";
echo "I live in $city\n";   // I live in Pune
echo 'I live in $city\n';   // I live in $city\n
echo "Total: {$marks[0]}\n"; // braces for array items and properties
` + "```" + String.raw`

The . operator joins strings: "Hello " . $name. A common mistake from JavaScript is writing + to join strings; in PHP + is only for numbers.

Useful string functions: strlen, strtoupper, strtolower, ucfirst, ucwords, strrev, trim, str_repeat, str_replace, substr, strpos, sprintf and number_format.

## Reading input in these assignments

The assignments run your script from the command line and type the input for you. Read one line with fgets(STDIN), remove the newline with trim, and split words with explode.

` + "```php" + String.raw`
<?php
$line = trim(fgets(STDIN));          // "8 4"
$parts = explode(" ", $line);        // ["8", "4"]
$a = (int) $parts[0];
$b = (int) $parts[1];
echo "Sum: " . ($a + $b) . "\n";
` + "```" + String.raw`

Input always arrives as a string. Cast it with (int) or (float) before doing maths, so "08" and " 8" behave the way you expect.

## Operators

- Arithmetic: + - * / % and ** (power). In PHP, / always gives a float when the answer is not whole: 7 / 2 is 3.5. Use intdiv(7, 2) for 3.
- % gives the remainder and keeps the sign of the left side: -7 % 2 is -1.
- Assignment shortcuts: += -= *= /= .= (append to a string), ++ and --.
- Comparison: == compares values after converting types, === also checks the type. Prefer === . "10" == 10 is true, "10" === 10 is false.
- <=> (spaceship) returns -1, 0 or 1. It is handy in sorting.
- ?? (null coalescing) gives a default: $name = $input ?? "Guest";

## Formatting numbers

number_format(1234.5, 2) gives "1,234.50" (with a thousands comma), and number_format(1234.5, 2, ".", "") gives "1234.50". sprintf("%05.2f", $x) and sprintf("%02d", $h) give full control, like printf in C.

## Common mistakes

- Forgetting the $ in front of a variable: total = 5; is a syntax error.
- Using == where === is safer, especially with strpos, which returns 0 (a valid position) or false.
- Doing maths on untrimmed input: fgets keeps the trailing newline.
- Writing echo "Total: " + $total; which tries to add a number to a string instead of joining.

## How your assignments are checked

Upload one .php file per question that starts with <?php. The reviewer reads it line by line (missing semicolons, variables without $, unbalanced brackets), then runs it with php on the test inputs. You may print prompts or labels; the checker looks for the words and numbers of the answer in order. When a question says "print exactly", print only the answer in the format shown.`,
  questions: [
    pq("Hello with your name", "Read a name and greet the person.", ["Input: a name (it may contain spaces)", "Output: Hello, <name>! Welcome to PHP."], String.raw`<?php
$name = trim(fgets(STDIN));
echo "Hello, $name! Welcome to PHP.\n";
`, [["Asha", "Hello, Asha! Welcome to PHP."], ["Ravi Kumar", "Hello, Ravi Kumar! Welcome to PHP."]], [["Meena", "Hello, Meena! Welcome to PHP."], ["Om", "Hello, Om! Welcome to PHP."]]),

    pq("Sum, difference and product", "Read two integers and print their sum, difference (a - b) and product.", ["Input: two integers a and b on one line, separated by a space", "Output: the sum, the difference and the product, in that order"], String.raw`<?php
$parts = explode(" ", trim(fgets(STDIN)));
$a = (int) $parts[0];
$b = (int) $parts[1];
echo "Sum: " . ($a + $b) . "\n";
echo "Difference: " . ($a - $b) . "\n";
echo "Product: " . ($a * $b) . "\n";
`, [["8 4", "12 4 32"], ["5 9", "14 -4 45"]], [["0 0", "0 0 0"], ["-3 7", "4 -10 -21"]]),

    pq("Division, quotient and remainder", "Read two positive integers and print the exact division with 2 decimals, the whole-number quotient and the remainder.", ["Input: two integers a and b (b is not 0)", "Output line 1: a / b with 2 decimals (number_format)", "Output line 2: the quotient (intdiv)", "Output line 3: the remainder (%)"], String.raw`<?php
$parts = explode(" ", trim(fgets(STDIN)));
$a = (int) $parts[0];
$b = (int) $parts[1];
echo "Division: " . number_format($a / $b, 2) . "\n";
echo "Quotient: " . intdiv($a, $b) . "\n";
echo "Remainder: " . ($a % $b) . "\n";
`, [["7 2", "3.50 3 1"], ["20 5", "4.00 4 0"]], [["1 3", "0.33 0 1"], ["100 7", "14.29 14 2"]], { rules: [{ match: String.raw`\bintdiv\s*\(`, message: "Uses intdiv for the whole-number quotient" }] }),

    pq("Length, uppercase and reverse", "Read one word and print its length, the word in capital letters, and the word reversed.", ["Input: one word", "Print exactly three lines and nothing else: the length, the uppercase word, the reversed word", "Example: Inveon gives 6, INVEON, noevnI"], String.raw`<?php
$word = trim(fgets(STDIN));
echo strlen($word) . "\n";
echo strtoupper($word) . "\n";
echo strrev($word) . "\n";
`, [["Inveon", "6\nINVEON\nnoevnI"], ["php", "3\nPHP\nphp"]], [["Pune", "4\nPUNE\nenuP"], ["Level", "5\nLEVEL\nleveL"]], { match: "exact" }),

    pq("Format a full name", "Read a first name and a surname typed in any mix of capitals, and print them as Surname, First with only the first letter of each capitalised.", ["Input: first name and surname separated by a space", "Print exactly one line: Surname, First", "Example: asha PATIL gives Patil, Asha", "Hint: ucfirst(strtolower($word))"], String.raw`<?php
$parts = explode(" ", trim(fgets(STDIN)));
$first = ucfirst(strtolower($parts[0]));
$last = ucfirst(strtolower($parts[1]));
echo "$last, $first\n";
`, [["asha PATIL", "Patil, Asha"], ["RAVI kumar", "Kumar, Ravi"]], [["meena sharma", "Sharma, Meena"], ["om JOSHI", "Joshi, Om"]], { match: "exact" }),

    pq("Celsius to Fahrenheit", "Read a temperature in Celsius and print it in Fahrenheit (f = c * 9 / 5 + 32).", ["Input: a temperature in Celsius (decimals allowed)", "Output: the temperature in Fahrenheit with 2 decimals"], String.raw`<?php
$c = (float) trim(fgets(STDIN));
$f = $c * 9 / 5 + 32;
echo "Fahrenheit: " . number_format($f, 2) . "\n";
`, [["100", "212.00"], ["37", "98.60"]], [["-40", "-40.00"], ["36.6", "97.88"], ["0", "32.00"]]),

    pq("Age in five years", "Read a name and an age on two lines and print one sentence built with string interpolation (variables inside double quotes).", ["Input line 1: a name", "Input line 2: an age (integer)", "Output: <name> is <age> years old and will be <age + 5> in five years."], String.raw`<?php
$name = trim(fgets(STDIN));
$age = (int) trim(fgets(STDIN));
$later = $age + 5;
echo "$name is $age years old and will be $later in five years.\n";
`, [["Asha\n21", "Asha is 21 years old and will be 26 in five years."], ["Ravi\n0", "Ravi is 0 years old and will be 5 in five years."]], [["Meena\n45", "Meena is 45 years old and will be 50 in five years."], ["Om\n99", "Om is 99 years old and will be 104 in five years."]], {
      rules: [{ match: String.raw`"[^"\n]*\$[a-zA-Z_]\w*[^"\n]*"`, message: "Puts a variable inside a double-quoted string" }],
    }),

    pq("Seconds to hh:mm:ss", "Read a number of seconds (less than one day) and print it as a clock time with two digits for each part.", ["Input: seconds, 0 to 86399", "Print exactly one line in the form hh:mm:ss, e.g. 3725 gives 01:02:05", "Use intdiv and % to split, and sprintf(\"%02d\") to pad"], String.raw`<?php
$total = (int) trim(fgets(STDIN));
$hours = intdiv($total, 3600);
$minutes = intdiv($total % 3600, 60);
$seconds = $total % 60;
echo sprintf("%02d:%02d:%02d", $hours, $minutes, $seconds) . "\n";
`, [["3725", "01:02:05"], ["59", "00:00:59"]], [["86399", "23:59:59"], ["0", "00:00:00"], ["36000", "10:00:00"]], {
      level: "intermediate",
      match: "exact",
      rules: [{ match: String.raw`\b(s?printf)\s*\(`, message: "Pads the numbers with sprintf or printf" }],
    }),

    pq("Bill with GST", "A shop sells an item at a price for a quantity. Print the subtotal, the GST at 18% and the total.", ["Input: price (decimals allowed) and quantity on one line", "Output: subtotal, GST and total, each with 2 decimals", "Example: 250 4 gives 1000.00, 180.00, 1180.00"], String.raw`<?php
$parts = explode(" ", trim(fgets(STDIN)));
$price = (float) $parts[0];
$qty = (int) $parts[1];
$subtotal = $price * $qty;
$gst = $subtotal * 0.18;
echo "Subtotal: " . number_format($subtotal, 2, ".", "") . "\n";
echo "GST: " . number_format($gst, 2, ".", "") . "\n";
echo "Total: " . number_format($subtotal + $gst, 2, ".", "") . "\n";
`, [["250 4", "1000.00 180.00 1180.00"], ["99.5 2", "199.00 35.82 234.82"]], [["0 5", "0.00 0.00 0.00"], ["1200 1", "1200.00 216.00 1416.00"]]),

    pq("Find a word in a sentence", "Read a sentence and a word, and print the position (0-based) where the word first appears, or Not found.", ["Input line 1: a sentence", "Input line 2: the word to find (case-sensitive)", "Output: the position from strpos, or Not found", "Careful: position 0 is a real position, so compare with === false"], String.raw`<?php
$sentence = trim(fgets(STDIN));
$word = trim(fgets(STDIN));
$pos = strpos($sentence, $word);
if ($pos === false) {
    echo "Not found\n";
} else {
    echo "Position: $pos\n";
}
`, [["I love PHP and PHP loves me\nPHP", "7"], ["Hello world\nJava", "Not found"]], [["banana\nnan", "2"], ["abc\na", "0"], ["PHP is fun\nphp", "Not found"]], {
      level: "intermediate",
      rules: [{ match: String.raw`(===|!==)\s*false|false\s*(===|!==)`, message: "Compares the strpos result with === false (or !== false)" }],
    }),

    pq("Compare with the spaceship operator", "Read two integers and print the result of comparing them with the <=> operator.", ["Input: two integers a and b", "Output: -1 if a < b, 0 if they are equal, 1 if a > b", "Use the <=> operator, not if/else"], String.raw`<?php
$parts = explode(" ", trim(fgets(STDIN)));
$a = (int) $parts[0];
$b = (int) $parts[1];
echo "Result: " . ($a <=> $b) . "\n";
`, [["3 7", "-1"], ["7 3", "1"]], [["5 5", "0"], ["-2 -9", "1"]], { level: "intermediate", rules: [{ match: String.raw`<=>`, message: "Uses the spaceship operator <=>" }] }),
  ],
  quiz: [
    { q: "How does every PHP variable name start?", options: ["With @", "With $", "With &", "With a capital letter"], answer: 1, why: "PHP variables always begin with $, for example $total." },
    { q: "What does echo 'Hi $name'; print when $name is \"Asha\"?", options: ["Hi Asha", "Hi $name", "Hi", "An error"], answer: 1, why: "Single-quoted strings are literal, so the variable is not replaced." },
    { q: "Which operator joins two strings in PHP?", options: ["+", "&", ".", "++"], answer: 2, why: "The dot operator concatenates strings; + is only for numbers." },
    { q: "What is the value of 7 / 2 in PHP?", options: ["3", "3.5", "4", "\"3.5\""], answer: 1, why: "PHP's / returns a float when the result is not whole; use intdiv for 3." },
    { q: "Which function removes the newline that fgets(STDIN) keeps at the end of a line?", options: ["strip", "chop_line", "trim", "clean"], answer: 2, why: "trim removes whitespace, including \\n, from both ends of the string." },
    { q: "What does var_dump(\"10\" === 10); print?", options: ["bool(true)", "bool(false)", "int(1)", "NULL"], answer: 1, why: "=== checks the type as well; a string is never identical to an int." },
    { q: "What is -7 % 3 in PHP?", options: ["2", "-1", "1", "-2"], answer: 1, why: "The remainder keeps the sign of the left operand: -7 = -2 * 3 - 1." },
    { q: "What does this print?\n\n$pos = strpos(\"apple\", \"a\");\nif ($pos == false) { echo \"missing\"; } else { echo \"found\"; }", options: ["found", "missing", "0", "An error"], answer: 1, why: "strpos returns 0, and 0 == false is true, so the loose check wrongly says missing; use === false." },
    { q: "What does echo \"5\" + \"5\" . \"5\"; print in PHP 8?", options: ["555", "105", "15", "An error"], answer: 1, why: "In PHP 8, + and - bind tighter than ., so it is (\"5\" + \"5\") . \"5\" = 10 . \"5\" = \"105\"." },
    { q: "What does $x = null; echo $x ?? \"Guest\"; echo $y ?? \"None\"; print, given $y was never defined?", options: ["GuestNone", "Guest followed by a warning", "An error for $y", "NoneGuest"], answer: 0, why: "?? returns the right side when the left is null or undefined, and it does not raise a warning for an undefined variable." },
  ],
};
