import type { PracticeUnit } from "../../types.js";
import { pq } from "./shared.js";

export const arrays: PracticeUnit = {
  key: "arrays",
  title: "Arrays: indexed, associative and array functions",
  summary: "indexed and associative arrays, foreach, sorting, explode and implode, array_sum, array_map, array_filter and nested arrays",
  reading: String.raw`## One type, two styles

A PHP array is an ordered map: every value has a key. When you don't give keys, PHP numbers them from 0, which is an indexed array. When you choose string keys, it is an associative array (like a dictionary in Python or an object in JavaScript).

` + "```php" + String.raw`
<?php
$cities = ["Pune", "Mumbai", "Delhi"];          // indexed
echo $cities[0];                                 // Pune
$cities[] = "Nagpur";                            // add at the end

$marks = ["Asha" => 92, "Ravi" => 78];           // associative
$marks["Meena"] = 85;                            // add or change a key
echo $marks["Asha"];                             // 92
` + "```" + String.raw`

- count($a) gives the number of items.
- isset($marks["Om"]) or array_key_exists checks whether a key is present. Reading a missing key gives a warning and null.
- print_r($a) and var_dump($a) show the whole array while debugging.
- The old array() syntax still works, but the short [] form is standard today.

## Looping

` + "```php" + String.raw`
foreach ($cities as $city) {
    echo "$city\n";
}
foreach ($marks as $name => $mark) {
    echo "$name scored $mark\n";
}
` + "```" + String.raw`

foreach works on a copy of the value. To change items in place, loop with a reference (foreach ($prices as &$p)) and call unset($p) afterwards, or better, build a new array with array_map.

## From input to arrays and back

Input arrives as one string, so explode splits it and implode joins an array back into a string. Combined with array_map they turn "4 9 1" into integers in one line:

` + "```php" + String.raw`
$nums = array_map('intval', explode(" ", trim(fgets(STDIN))));
echo implode(", ", $nums);   // 4, 9, 1
` + "```" + String.raw`

## Useful array functions

- array_sum, array_product, max, min, count.
- in_array($value, $a, true) searches values (pass true for a strict === check); array_search returns the key.
- array_unique removes duplicate values but keeps the original keys; wrap it in array_values to renumber.
- array_count_values counts how many times each value appears.
- array_keys, array_values, array_merge, array_slice, array_reverse, array_key_first.
- array_map(fn, $a) transforms every item, array_filter($a, fn) keeps the items where fn returns true (it also keeps the keys), array_reduce folds the array into one value.

## Sorting

The sort functions change the array in place and return true, so never write $sorted = sort($a).

- sort / rsort: sort values ascending / descending and renumber the keys.
- asort / arsort: sort an associative array by value and keep each key with its value.
- ksort / krsort: sort by key.
- usort($a, fn($x, $y) => $x <=> $y): sort with your own rule.

A frequent bug is using sort on an associative array: the names (keys) are thrown away. Use asort or arsort to keep them.

## Nested arrays

An array can hold arrays: rows of a matrix, or a list of records.

` + "```php" + String.raw`
$students = [
    ["name" => "Asha", "marks" => 92],
    ["name" => "Ravi", "marks" => 78],
];
foreach ($students as $s) {
    echo $s["name"] . ": " . $s["marks"] . "\n";
}
` + "```" + String.raw`

array_column($students, "marks") pulls one field out of every record, which pairs well with array_sum and max.

## Common mistakes

- Off-by-one: the last index is count($a) - 1.
- Assuming array_filter renumbers keys; it doesn't, so $result[0] may not exist.
- Comparing numbers read from input as strings: map them with intval first.
- Modifying an array while looping over it with foreach.

## How your assignments are checked

Each question gives the input format: usually one line of space-separated values, or a count followed by that many lines. Your script is run with the examples and hidden inputs such as a single item, negative numbers and repeated values. Questions marked "print exactly" compare the output line by line, so join values with implode(" ", ...) and don't leave trailing labels.`,
  questions: [
    pq("Sum and average", "Read a list of integers and print their sum and their average.", ["Input: integers on one line, separated by spaces", "Output line 1: the sum", "Output line 2: the average with 2 decimals"], String.raw`<?php
$nums = array_map('intval', explode(" ", trim(fgets(STDIN))));
$sum = array_sum($nums);
echo "Sum: $sum\n";
echo "Average: " . number_format($sum / count($nums), 2) . "\n";
`, [["1 2 3 4 5", "15 3.00"], ["10 20", "30 15.00"]], [["7", "7 7.00"], ["-5 5 3", "3 1.00"]], { rules: [{ match: String.raw`\bcount\s*\(`, message: "Uses count() for the number of items" }] }),

    pq("Largest and smallest", "Read a list of integers and print the largest and the smallest.", ["Input: integers on one line", "Output: the largest, then the smallest"], String.raw`<?php
$nums = array_map('intval', explode(" ", trim(fgets(STDIN))));
echo "Largest: " . max($nums) . "\n";
echo "Smallest: " . min($nums) . "\n";
`, [["4 9 1 7", "9 1"], ["3 3", "3 3"]], [["-3 -8 -1", "-1 -8"], ["5", "5 5"]]),

    pq("Reverse the list", "Read a list of words or numbers and print them in reverse order.", ["Input: items on one line separated by spaces", "Print exactly one line: the items in reverse order, separated by single spaces"], String.raw`<?php
$items = explode(" ", trim(fgets(STDIN)));
echo implode(" ", array_reverse($items)) . "\n";
`, [["1 2 3", "3 2 1"], ["apple banana", "banana apple"]], [["x", "x"], ["10 20 30 40 50", "50 40 30 20 10"]], { match: "exact", rules: [{ match: String.raw`\bimplode\s*\(`, message: "Joins the array with implode" }] }),

    pq("Sort both ways", "Read a list of integers and print them sorted ascending, then descending.", ["Input: integers on one line", "Print exactly two lines: ascending order, then descending order, values separated by single spaces"], String.raw`<?php
$nums = array_map('intval', explode(" ", trim(fgets(STDIN))));
sort($nums);
echo implode(" ", $nums) . "\n";
rsort($nums);
echo implode(" ", $nums) . "\n";
`, [["5 3 9 1", "1 3 5 9\n9 5 3 1"], ["10 2 33 4", "2 4 10 33\n33 10 4 2"]], [["-1 -1 0", "-1 -1 0\n0 -1 -1"], ["7", "7\n7"]], { match: "exact", rules: [{ match: String.raw`\bsort\s*\(`, message: "Uses sort()" }] }),

    pq("Remove duplicates", "Read a list of values and print each value once, in the order it first appears.", ["Input: values on one line", "Print exactly one line: the distinct values separated by single spaces"], String.raw`<?php
$items = explode(" ", trim(fgets(STDIN)));
echo implode(" ", array_unique($items)) . "\n";
`, [["3 1 3 2 1", "3 1 2"], ["a a a", "a"]], [["5 4 3", "5 4 3"], ["pune delhi pune mumbai delhi", "pune delhi mumbai"]], { match: "exact" }),

    pq("Word frequency", "Read a sentence and print how many times each word appears, ignoring capitals, in the order the words first appear.", ["Input: a sentence of words separated by single spaces", "Print exactly one line per distinct word in the form word: count, words in lowercase"], String.raw`<?php
$words = explode(" ", strtolower(trim(fgets(STDIN))));
foreach (array_count_values($words) as $word => $count) {
    echo "$word: $count\n";
}
`, [["the cat and the hat", "the: 2\ncat: 1\nand: 1\nhat: 1"], ["PHP php Php", "php: 3"]], [["one two three", "one: 1\ntwo: 1\nthree: 1"], ["a b a b a", "a: 3\nb: 2"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`\bforeach\s*\(`, message: "Loops over the counts with foreach" }] }),

    pq("Class topper", "Read students and their marks into an associative array and print the topper's name and marks.", ["Input line 1: n, the number of students", "Next n lines: name marks", "Output: the name and marks of the student with the highest marks (no ties)"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
$marks = [];
for ($i = 0; $i < $n; $i++) {
    $parts = explode(" ", trim(fgets(STDIN)));
    $marks[$parts[0]] = (int) $parts[1];
}
arsort($marks);
$topper = array_key_first($marks);
echo "Topper: $topper with {$marks[$topper]}\n";
`, [["3\nAsha 78\nRavi 92\nMeena 85", "Ravi 92"], ["1\nOm 40", "Om 40"]], [["4\nA 10\nB 20\nC 30\nD 40", "D 40"], ["2\nPriya 99\nKaran 12", "Priya 99"]], {
      level: "intermediate",
      rules: [{ match: String.raw`\$\w+\s*\[\s*\$\w+(\s*\[\s*0\s*\])?\s*\]\s*=`, message: "Stores marks in an associative array keyed by name" }],
    }),

    pq("Rank list", "Read students and marks, and print a rank list from the highest marks to the lowest, keeping each name with its marks.", ["Input line 1: n; next n lines: name marks (no two students have the same marks)", "Print exactly n lines in the form rank. name marks, e.g. 1. Ravi 92"], String.raw`<?php
$n = (int) trim(fgets(STDIN));
$marks = [];
for ($i = 0; $i < $n; $i++) {
    $parts = explode(" ", trim(fgets(STDIN)));
    $marks[$parts[0]] = (int) $parts[1];
}
arsort($marks);
$rank = 1;
foreach ($marks as $name => $mark) {
    echo "$rank. $name $mark\n";
    $rank++;
}
`, [["3\nAsha 78\nRavi 92\nMeena 85", "1. Ravi 92\n2. Meena 85\n3. Asha 78"], ["1\nOm 40", "1. Om 40"]], [["4\nA 10\nB 40\nC 30\nD 20", "1. B 40\n2. C 30\n3. D 20\n4. A 10"]], {
      level: "intermediate",
      match: "exact",
      rules: [{ match: String.raw`\barsort\s*\(|\buasort\s*\(`, message: "Sorts by value and keeps the keys (arsort)" }],
    }),

    pq("Squares of even numbers", "Read a list of integers, keep only the even ones with array_filter and square them with array_map.", ["Input: integers on one line", "Print exactly one line: the squares separated by single spaces, or None if there are no even numbers"], String.raw`<?php
$nums = array_map('intval', explode(" ", trim(fgets(STDIN))));
$evens = array_filter($nums, fn($n) => $n % 2 === 0);
$squares = array_map(fn($n) => $n * $n, $evens);
echo $squares ? implode(" ", $squares) . "\n" : "None\n";
`, [["1 2 3 4 5 6", "4 16 36"], ["1 3 5", "None"]], [["-2 0 7", "4 0"], ["10", "100"]], {
      level: "intermediate",
      match: "exact",
      rules: [{ match: String.raw`\barray_filter\s*\(`, message: "Uses array_filter" }, { match: String.raw`\barray_map\s*\(`, message: "Uses array_map" }],
    }),

    pq("Row and column sums", "Read a matrix into a nested array and print the sum of every row, then the sum of every column.", ["Input line 1: r c (rows and columns)", "Next r lines: c integers each", "Output line 1: the r row sums", "Output line 2: the c column sums"], String.raw`<?php
$size = explode(" ", trim(fgets(STDIN)));
$rows = (int) $size[0];
$cols = (int) $size[1];
$matrix = [];
for ($r = 0; $r < $rows; $r++) {
    $matrix[] = array_map('intval', explode(" ", trim(fgets(STDIN))));
}
$rowSums = array_map('array_sum', $matrix);
$colSums = [];
for ($c = 0; $c < $cols; $c++) {
    $colSums[] = array_sum(array_column($matrix, $c));
}
echo "Rows: " . implode(" ", $rowSums) . "\n";
echo "Columns: " . implode(" ", $colSums) . "\n";
`, [["2 3\n1 2 3\n4 5 6", "6 15 5 7 9"], ["1 1\n7", "7 7"]], [["3 2\n1 1\n2 2\n-3 3", "2 4 0 0 6"]], { level: "advanced" }),

    pq("Second largest", "Read a list of integers and print the second largest distinct value, or No second largest if all values are the same.", ["Input: integers on one line", "Output: the second largest distinct value, or No second largest"], String.raw`<?php
$nums = array_values(array_unique(array_map('intval', explode(" ", trim(fgets(STDIN))))));
rsort($nums);
if (count($nums) < 2) {
    echo "No second largest\n";
} else {
    echo "Second largest: {$nums[1]}\n";
}
`, [["4 9 1 9 7", "7"], ["5 5 5", "No second largest"]], [["1 2", "1"], ["-1 -3 -2", "-2"], ["8", "No second largest"]], { level: "advanced" }),
  ],
  quiz: [
    { q: "What is the index of the first item in an indexed PHP array?", options: ["1", "0", "-1", "It depends on the array"], answer: 1, why: "PHP numbers automatic keys from 0." },
    { q: "Which function returns the number of items in an array?", options: ["length()", "size()", "count()", "len()"], answer: 2, why: "count($a) returns the number of elements." },
    { q: "What does $a[] = 5; do?", options: ["Empties the array", "Adds 5 to the end of the array", "Sets every item to 5", "Causes an error"], answer: 1, why: "Empty brackets append a new element with the next integer key." },
    { q: "Which function turns \"a,b,c\" into [\"a\", \"b\", \"c\"]?", options: ["implode(\",\", $s)", "explode(\",\", $s)", "split($s)", "str_split($s)"], answer: 1, why: "explode splits a string by a separator; implode does the opposite." },
    { q: "You have $marks = [\"Asha\" => 92, \"Ravi\" => 78]. Which sort keeps the names while sorting by marks, highest first?", options: ["rsort", "sort", "arsort", "krsort"], answer: 2, why: "arsort sorts by value in descending order and keeps the keys." },
    { q: "What does in_array(\"5\", [5, 6], true) return?", options: ["true", "false", "0", "An error"], answer: 1, why: "With the strict flag, the string \"5\" is not identical to the integer 5." },
    { q: "What does print_r(array_count_values([\"a\", \"b\", \"a\"])); show?", options: ["Array ( [a] => 2 [b] => 1 )", "Array ( [0] => 2 [1] => 1 )", "3", "Array ( [2] => a [1] => b )"], answer: 0, why: "array_count_values maps each value to how many times it appears." },
    { q: "What is wrong with $sorted = sort($nums); echo $sorted[0];", options: ["Nothing", "sort returns true, not the sorted array", "sort needs two arguments", "sort only works on strings"], answer: 1, why: "sort changes $nums in place and returns a bool, so $sorted is true." },
    { q: "What does this print?\n\n$r = array_filter([1, 2, 3, 4], fn($n) => $n % 2 === 0);\necho isset($r[0]) ? \"yes\" : \"no\";", options: ["yes", "no", "2", "An error"], answer: 1, why: "array_filter keeps the original keys, so the result is [1 => 2, 3 => 4] and key 0 doesn't exist." },
    { q: "What does this print?\n\n$a = [1, 2, 3];\nforeach ($a as &$v) { $v *= 2; }\nforeach ($a as $v) { }\necho implode(\",\", $a);", options: ["2,4,6", "2,4,4", "1,2,3", "2,4,6,6"], answer: 1, why: "$v is still a reference to the last element after the first loop, so the second loop overwrites it with each value, ending with 4. Call unset($v) after a by-reference loop." },
  ],
};
