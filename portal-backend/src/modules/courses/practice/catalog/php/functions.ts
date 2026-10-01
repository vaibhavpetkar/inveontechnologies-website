import type { PracticeUnit } from "../../types.js";
import { pq, usesFunction } from "./shared.js";

export const functions: PracticeUnit = {
  key: "functions",
  title: "Functions",
  summary: "defining functions, parameters and return values, type declarations, default and variadic parameters, references, recursion, closures and arrow functions",
  reading: String.raw`## Why functions

A function is a named block of code you can call many times. It keeps each job in one place, makes code easier to test, and is how every PHP framework is organised.

` + "```php" + String.raw`
<?php
function area(float $length, float $breadth): float
{
    return $length * $breadth;
}

echo area(4, 5);   // 20
` + "```" + String.raw`

- The parameter types (float) and the return type (: float) are optional, but use them. PHP checks them at run time and gives a clear error when a wrong type is passed.
- Add declare(strict_types=1); as the first statement of a file to stop PHP from quietly converting "5" to 5 when a function expects int.
- return ends the function and hands a value back. A function without return gives null. Use : void when nothing is returned.
- Variables inside a function are local. A function cannot see $x from outside unless you pass it in. Avoid the global keyword; pass values as parameters instead.

## Default, named and variadic parameters

` + "```php" + String.raw`
function greet(string $name, string $greeting = "Hello"): string
{
    return "$greeting, $name!";
}
echo greet("Asha");                 // Hello, Asha!
echo greet("Ravi", "Namaste");      // Namaste, Ravi!
echo greet(greeting: "Hi", name: "Om");   // named arguments (PHP 8)

function sumAll(int ...$nums): int
{
    return array_sum($nums);        // $nums is an array
}
echo sumAll(1, 2, 3);               // 6
echo sumAll(...[4, 5]);             // spread an array into arguments
` + "```" + String.raw`

Parameters with defaults must come after the required ones.

## Passing by value and by reference

Arguments are copied by default, so a function can't change the caller's variable. Put & before the parameter to pass a reference and change the original:

` + "```php" + String.raw`
function addBonus(array &$salaries, int $bonus): void
{
    foreach ($salaries as &$s) {
        $s += $bonus;
    }
    unset($s);
}
` + "```" + String.raw`

Use references sparingly: returning a new value is usually clearer. Objects are an exception; they are always passed as handles, so methods called on them affect the same object.

## Recursion

A recursive function calls itself on a smaller problem and needs a base case that stops it.

` + "```php" + String.raw`
function factorial(int $n): int
{
    if ($n <= 1) {
        return 1;          // base case
    }
    return $n * factorial($n - 1);
}
` + "```" + String.raw`

Without a base case the calls never end and PHP stops with a memory or stack error. Euclid's gcd is another classic: gcd(a, b) = gcd(b, a % b), and gcd(a, 0) = a.

## Anonymous functions, closures and arrow functions

Functions are values too. You can store one in a variable or pass it to array_map, array_filter and usort.

` + "```php" + String.raw`
$rate = 10;
$withTax = function (float $p) use ($rate): float {
    return $p * (1 + $rate / 100);
};
$double = fn($x) => $x * 2;          // arrow function, PHP 7.4+
print_r(array_map($double, [1, 2, 3]));
` + "```" + String.raw`

A classic anonymous function must list outside variables with use. An arrow function (fn) captures them automatically, but its body is a single expression.

## Sorting with your own rule

usort takes a comparison function that returns a negative number, zero or a positive number. The spaceship operator does this for you, and it compares arrays item by item, which makes "sort by length, then alphabetically" a one-liner:

` + "```php" + String.raw`
usort($words, fn($a, $b) => [strlen($a), $a] <=> [strlen($b), $b]);
` + "```" + String.raw`

## Built-in functions to know

String: str_pad, str_contains (PHP 8), str_starts_with, ucwords, preg_replace. Maths: abs, round, floor, ceil, max, min, pow, sqrt, intdiv, rand and random_int. Check the manual (php.net) whenever you need something; the documentation has examples for every function.

## Common mistakes

- Calling a function before checking it returns a value: echo on a void function prints nothing.
- Expecting a function to change a variable passed by value.
- Missing base case in recursion.
- Forgetting use ($var) in a closure, so the variable is undefined inside.

## How your assignments are checked

Each question asks for a function with a given name or feature; the reviewer checks that it is there (for example a default parameter, a reference parameter or recursion), then runs your script on the example and hidden inputs. Read the input and print the result outside the function, and let the function do the work.`,
  questions: [
    pq("Calculator function", "Write a function calculate($a, $op, $b) that returns the result of + - * or /, and returns the message Cannot divide by zero for a division by 0.", ["Input: a number, an operator and a number separated by spaces, e.g. 8 * 3", "Output: the result returned by calculate", "Define a function named calculate"], String.raw`<?php
function calculate(float $a, string $op, float $b)
{
    switch ($op) {
        case "+":
            return $a + $b;
        case "-":
            return $a - $b;
        case "*":
            return $a * $b;
        case "/":
            return $b == 0 ? "Cannot divide by zero" : $a / $b;
        default:
            return "Unknown operator";
    }
}

$parts = explode(" ", trim(fgets(STDIN)));
echo calculate((float) $parts[0], $parts[1], (float) $parts[2]) . "\n";
`, [["8 * 3", "24"], ["7 / 2", "3.5"]], [["5 / 0", "Cannot divide by zero"], ["10 - 15", "-5"], ["1.5 + 2", "3.5"]], { rules: [usesFunction("calculate"), { match: String.raw`(echo|=|return)\s*calculate\s*\(`, message: "Calls calculate and uses its result" }] }),

    pq("Recursive factorial", "Write a recursive function factorial(int $n): int and use it to print n!.", ["Input: n (0 to 20)", "Output: n!", "factorial must call itself; 0! and 1! are 1"], String.raw`<?php
function factorial(int $n): int
{
    if ($n <= 1) {
        return 1;
    }
    return $n * factorial($n - 1);
}

$n = (int) trim(fgets(STDIN));
echo "$n! = " . factorial($n) . "\n";
`, [["5", "120"], ["1", "1"]], [["0", "1"], ["15", "1307674368000"]], { rules: [usesFunction("factorial"), { match: String.raw`return[^;]*\bfactorial\s*\(`, message: "factorial calls itself (recursion)" }] }),

    pq("Fibonacci series", "Write a function fibonacci(int $n): array that returns the first n Fibonacci numbers (0, 1, 1, 2, 3 ...), and print them.", ["Input: n (1 to 50)", "Output: the first n terms separated by spaces"], String.raw`<?php
function fibonacci(int $n): array
{
    $terms = [0, 1];
    for ($i = 2; $i < $n; $i++) {
        $terms[] = $terms[$i - 1] + $terms[$i - 2];
    }
    return array_slice($terms, 0, $n);
}

$n = (int) trim(fgets(STDIN));
echo implode(" ", fibonacci($n)) . "\n";
`, [["7", "0 1 1 2 3 5 8"], ["1", "0"]], [["2", "0 1"], ["10", "0 1 1 2 3 5 8 13 21 34"]], { rules: [usesFunction("fibonacci"), { match: String.raw`\breturn\s+`, message: "Returns the terms" }] }),

    pq("Greeting with a default parameter", "Write greet(string $name, string $greeting = \"Hello\"): string. If the input has only a name, call greet with one argument; if it also has a greeting, pass both.", ["Input: a name, optionally followed by a greeting word", "Output: <greeting>, <name>!"], String.raw`<?php
function greet(string $name, string $greeting = "Hello"): string
{
    return "$greeting, $name!";
}

$parts = explode(" ", trim(fgets(STDIN)));
if (count($parts) === 2) {
    echo greet($parts[0], $parts[1]) . "\n";
} else {
    echo greet($parts[0]) . "\n";
}
`, [["Asha", "Hello, Asha!"], ["Ravi Namaste", "Namaste, Ravi!"]], [["Meena Welcome", "Welcome, Meena!"], ["Om", "Hello, Om!"]], { rules: [usesFunction("greet"), { match: String.raw`function\s+greet\s*\([^)]*\$\w+\s*=\s*["']Hello["']`, message: "Gives $greeting the default value \"Hello\"" }] }),

    pq("Variadic sum", "Write sumAll(int ...$nums): int that adds any number of arguments, and call it by spreading the input array with ...", ["Input: integers on one line", "Output: their sum"], String.raw`<?php
function sumAll(int ...$nums): int
{
    $total = 0;
    foreach ($nums as $n) {
        $total += $n;
    }
    return $total;
}

$values = array_map('intval', explode(" ", trim(fgets(STDIN))));
echo "Sum: " . sumAll(...$values) . "\n";
`, [["1 2 3", "6"], ["10", "10"]], [["-5 5 100", "100"], ["1 1 1 1 1 1 1 1 1 1", "10"]], {
      level: "intermediate",
      rules: [usesFunction("sumAll"), { match: String.raw`function\s+sumAll\s*\(\s*(int\s+)?\.\.\.\s*\$`, message: "Declares a variadic parameter (...$nums)" }, { match: String.raw`sumAll\s*\(\s*\.\.\.\s*\$`, message: "Spreads the array into the call" }],
    }),

    pq("Palindrome sentence", "Write isPalindrome(string $text): bool that ignores capitals, spaces and punctuation, and print whether the input is a palindrome.", ["Input: a line of text", "Output: Palindrome or Not a palindrome", "Hint: preg_replace('/[^a-z0-9]/', '', strtolower($text))"], String.raw`<?php
function isPalindrome(string $text): bool
{
    $clean = preg_replace('/[^a-z0-9]/', '', strtolower($text));
    return $clean === strrev($clean);
}

$line = trim(fgets(STDIN));
echo isPalindrome($line) ? "Palindrome\n" : "Not a palindrome\n";
`, [["Never odd or even", "Palindrome", ["not"]], ["Inveon", "Not a palindrome"]], [["PHP", "Palindrome", ["not"]], ["A man, a plan, a canal: Panama", "Palindrome", ["not"]], ["ab", "Not a palindrome"]], { level: "intermediate", rules: [usesFunction("isPalindrome"), { match: String.raw`\)\s*:\s*bool`, message: "Returns a bool" }] }),

    pq("Add a bonus by reference", "Write addBonus(array &$salaries, int $bonus): void that adds the bonus to every salary in the caller's array, then print the array.", ["Input line 1: salaries separated by spaces", "Input line 2: the bonus", "Output: the updated salaries separated by spaces", "The function returns nothing; it changes the array through the reference"], String.raw`<?php
function addBonus(array &$salaries, int $bonus): void
{
    foreach ($salaries as $i => $salary) {
        $salaries[$i] = $salary + $bonus;
    }
}

$salaries = array_map('intval', explode(" ", trim(fgets(STDIN))));
$bonus = (int) trim(fgets(STDIN));
addBonus($salaries, $bonus);
echo implode(" ", $salaries) . "\n";
`, [["10000 20000 15000\n500", "10500 20500 15500"], ["100\n0", "100"]], [["1 2 3\n-1", "0 1 2"], ["30000 45000\n2500", "32500 47500"]], {
      level: "intermediate",
      rules: [usesFunction("addBonus"), { match: String.raw`function\s+addBonus\s*\(\s*array\s*&\s*\$`, message: "Takes the array by reference (array &$salaries)" }, { match: String.raw`\)\s*:\s*void`, message: "Declares a void return type" }],
    }),

    pq("Price increase with an arrow function", "Read prices and a percentage, and use array_map with an arrow function (fn) to increase every price by that percentage.", ["Input line 1: prices separated by spaces", "Input line 2: the percentage increase", "Output: the new prices with 2 decimals, separated by spaces"], String.raw`<?php
$prices = array_map('floatval', explode(" ", trim(fgets(STDIN))));
$percent = (float) trim(fgets(STDIN));
$raised = array_map(fn($p) => number_format($p * (1 + $percent / 100), 2, ".", ""), $prices);
echo implode(" ", $raised) . "\n";
`, [["100 250 80\n10", "110.00 275.00 88.00"], ["99.99\n0", "99.99"]], [["50 20\n5", "52.50 21.00"], ["1000\n12.5", "1125.00"]], {
      level: "intermediate",
      rules: [{ match: String.raw`\bfn\s*\(`, message: "Uses an arrow function (fn)" }, { match: String.raw`\barray_map\s*\(`, message: "Uses array_map" }, { match: String.raw`fn\s*\([^)]*\)\s*=>[^;]*\$percent`, message: "The arrow function uses $percent from outside" }],
    }),

    pq("GCD and LCM", "Write a recursive gcd(int $a, int $b): int using Euclid's rule, and use it to print the GCD and the LCM of two numbers (lcm = a * b / gcd).", ["Input: two positive integers", "Output: the GCD, then the LCM"], String.raw`<?php
function gcd(int $a, int $b): int
{
    return $b === 0 ? $a : gcd($b, $a % $b);
}

$parts = explode(" ", trim(fgets(STDIN)));
$a = (int) $parts[0];
$b = (int) $parts[1];
$g = gcd($a, $b);
echo "GCD: $g\n";
echo "LCM: " . intdiv($a * $b, $g) . "\n";
`, [["12 18", "6 36"], ["7 5", "1 35"]], [["100 75", "25 300"], ["9 9", "9 9"], ["1 1000", "1 1000"]], { level: "advanced", rules: [usesFunction("gcd"), { match: String.raw`return[^;]*\bgcd\s*\(`, message: "gcd calls itself (recursion)" }] }),

    pq("Sort words by length", "Read a sentence and print its words sorted by length, and words of the same length alphabetically, using usort with your own comparison.", ["Input: lowercase words separated by single spaces", "Print exactly one line: the sorted words separated by single spaces"], String.raw`<?php
$words = explode(" ", trim(fgets(STDIN)));
usort($words, fn($a, $b) => [strlen($a), $a] <=> [strlen($b), $b]);
echo implode(" ", $words) . "\n";
`, [["pear fig banana apple kiwi", "fig kiwi pear apple banana"], ["b a c", "a b c"]], [["elephant cat dog ant", "ant cat dog elephant"], ["zz y xxx", "y zz xxx"]], {
      level: "advanced",
      match: "exact",
      rules: [{ match: String.raw`\busort\s*\(`, message: "Sorts with usort" }, { match: String.raw`strlen`, message: "Compares the word lengths" }],
    }),
  ],
  quiz: [
    { q: "Which keyword sends a value back from a function?", options: ["give", "return", "echo", "yield only"], answer: 1, why: "return ends the function and hands the value to the caller." },
    { q: "What does a function without a return statement return?", options: ["0", "false", "null", "An empty string"], answer: 2, why: "PHP functions return null when nothing is returned." },
    { q: "What is the return type of a function that returns nothing?", options: [": null", ": void", ": none", ": empty"], answer: 1, why: ": void declares that the function returns no value." },
    { q: "Which declaration is valid?", options: ["function f($a = 1, $b)", "function f($a, $b = 1)", "function f(= 1 $a)", "function f($a, default $b = 1)"], answer: 1, why: "Parameters with default values must come after the required ones." },
    { q: "What does the & in function add(array &$list) mean?", options: ["The array is copied", "The array is passed by reference, so changes affect the caller's array", "The parameter is optional", "The array must not be empty"], answer: 1, why: "& passes a reference to the original variable." },
    { q: "What is needed so that a classic anonymous function can read $rate from the surrounding code?", options: ["global $rate inside it", "use ($rate) after the parameter list", "Nothing, it sees it automatically", "static $rate"], answer: 1, why: "Closures capture outside variables only when they are listed in use (...). Arrow functions capture automatically." },
    { q: "What does fn($x) => $x * 2 create?", options: ["A generator", "An arrow function that returns $x * 2", "A class method", "A constant"], answer: 1, why: "Arrow functions are short closures whose single expression is returned." },
    { q: "What does this print?\n\nfunction add($x) { $x = $x + 10; }\n$n = 5;\nadd($n);\necho $n;", options: ["15", "5", "10", "Nothing"], answer: 1, why: "$n is passed by value; the function changes its own copy only." },
    { q: "What does this print?\n\n$rate = 5;\n$f = function () { return $rate ?? \"none\"; };\n$rate = 10;\necho $f();", options: ["5", "10", "none", "An error"], answer: 2, why: "Without use ($rate) the closure has its own empty scope, so $rate is undefined inside and ?? gives \"none\"." },
    { q: "What does usort($a, fn($x, $y) => $y <=> $x) do to [3, 1, 2]?", options: ["[1, 2, 3]", "[3, 2, 1]", "[3, 1, 2]", "It throws an error"], answer: 1, why: "Swapping the operands of <=> reverses the order, giving a descending sort." },
  ],
};
