import type { PracticeUnit } from "../../types.js";
import { cq, usesArray, usesLoop } from "./shared.js";

const noStrlen = { notMatch: String.raw`\bstrlen\s*\(`, message: "Doesn't use strlen (count the characters yourself)" };
const inc = "#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    char s[100];\n    scanf(\"%99s\", s);\n\n    // Write your code here\n\n    return 0;\n}\n";

export const arrays: PracticeUnit = {
  key: "arrays",
  title: "Arrays and strings",
  summary: "one- and two-dimensional arrays, sorting and searching, matrix addition, multiplication and transpose, and string handling",
  reading: String.raw`## One-dimensional arrays

An array stores many values of the same type under one name. Indexes start at 0, so an array of 5 ints has a[0] to a[4].

` + "```c" + String.raw`
int a[5];
for (int i = 0; i < 5; i++)
    scanf("%d", &a[i]);      /* & is needed for each element */
` + "```" + String.raw`

- The size must be known when you declare it: int a[100]; then use only the first n.
- Reading or writing a[5] in an array of 5 is out of bounds. C doesn't stop you; the program may crash or silently corrupt other variables.
- To find the largest value, start with max = a[0] (not 0, which is wrong when every value is negative) and compare with the rest.

## Sorting (bubble sort)

Bubble sort compares neighbours and swaps them when they are in the wrong order. After each pass the largest remaining value has "bubbled" to the end:

` + "```c" + String.raw`
for (int i = 0; i < n - 1; i++)
    for (int j = 0; j < n - 1 - i; j++)
        if (a[j] > a[j + 1]) {
            int t = a[j];
            a[j] = a[j + 1];
            a[j + 1] = t;
        }
` + "```" + String.raw`

## Two-dimensional arrays (matrices)

int m[3][4]; has 3 rows and 4 columns. Use two loops: the outer for rows, the inner for columns.

- Addition: c[i][j] = a[i][j] + b[i][j].
- Transpose: t[j][i] = m[i][j] (rows become columns).
- Multiplication (n x n): c[i][j] is the sum over k of a[i][k] * b[k][j]. Start each c[i][j] at 0.

## Strings

A string in C is a char array that ends with the null character '\0'. "Asha" takes 5 bytes: 'A' 's' 'h' 'a' '\0'.

` + "```c" + String.raw`
char name[50];
scanf("%49s", name);          /* reads one word, no & */
fgets(line, sizeof line, stdin);  /* reads a whole line with spaces */
` + "```" + String.raw`

- Loop over a string until '\0': for (int i = 0; s[i] != '\0'; i++). That is how you find the length without strlen.
- string.h has strlen (length), strcpy (copy), strcmp (compare: 0 means equal), strcat (join).
- You can't compare strings with ==; use strcmp(a, b) == 0.
- Characters are numbers: 'a' - 32 is 'A', and toupper(ch) from ctype.h does it for you. strupr and strrev are Turbo C only and won't compile with gcc.
- fgets keeps the Enter key ('\n') at the end of the line; remove it with line[strcspn(line, "\n")] = '\0';

## Reversing and palindromes

Swap the first and last characters, then move inwards:

` + "```c" + String.raw`
for (int i = 0, j = len - 1; i < j; i++, j--) {
    char t = s[i]; s[i] = s[j]; s[j] = t;
}
` + "```" + String.raw`

A string is a palindrome when s[i] == s[len - 1 - i] for every i in the first half.

## Input format in these questions

Most questions give n first, then the n values. Read n, then loop n times. When two arrays or matrices are given, they come one after the other.`,
  questions: [
    cq("Read and print 10 numbers", "Accept 10 numbers into an array and print them.", ["Input: 10 integers", "Output: the same 10 numbers, in order", "Store them in an array first"], String.raw`#include <stdio.h>

int main(void) {
    int a[10];
    for (int i = 0; i < 10; i++)
        scanf("%d", &a[i]);
    for (int i = 0; i < 10; i++)
        printf("%d ", a[i]);
    printf("\n");
    return 0;
}
`, [["1 2 3 4 5 6 7 8 9 10", "1 2 3 4 5 6 7 8 9 10"]], [["-5 0 5 10 15 20 25 30 35 40", "-5 0 5 10 15 20 25 30 35 40"]], { rules: [usesArray, usesLoop] }),

    cq("Sum of 10 numbers", "Accept 10 numbers into an array and print their sum.", ["Input: 10 integers", "Output: the sum"], String.raw`#include <stdio.h>

int main(void) {
    int a[10], sum = 0;
    for (int i = 0; i < 10; i++) {
        scanf("%d", &a[i]);
        sum += a[i];
    }
    printf("Sum = %d\n", sum);
    return 0;
}
`, [["1 2 3 4 5 6 7 8 9 10", "55"]], [["-5 0 5 10 15 20 25 30 35 40", "175"], ["0 0 0 0 0 0 0 0 0 0", "0"]], { rules: [usesArray, usesLoop] }),

    cq("Count positive, negative and zero", "Accept n numbers and count how many are positive, negative and zero.", ["Input: n, then n integers", "Output in this order: positive count, negative count, zero count"], String.raw`#include <stdio.h>

int main(void) {
    int n, x, pos = 0, neg = 0, zero = 0;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        scanf("%d", &x);
        if (x > 0) pos++;
        else if (x < 0) neg++;
        else zero++;
    }
    printf("Positive: %d\nNegative: %d\nZero: %d\n", pos, neg, zero);
    return 0;
}
`, [["6\n1 -2 0 5 -7 0", "2 2 2"], ["3\n4 5 6", "3 0 0"]], [["4\n-1 -1 -1 0", "0 3 1"], ["1\n0", "0 0 1"]], { rules: [usesLoop] }),

    cq("Largest in an array", "Accept 5 numbers into an array and print the largest.", ["Input: 5 integers", "Output: the largest", "Start with max = a[0], not 0"], String.raw`#include <stdio.h>

int main(void) {
    int a[5];
    for (int i = 0; i < 5; i++)
        scanf("%d", &a[i]);
    int max = a[0];
    for (int i = 1; i < 5; i++)
        if (a[i] > max) max = a[i];
    printf("Largest = %d\n", max);
    return 0;
}
`, [["4 9 2 8 7", "9"], ["10 3 3 3 3", "10"]], [["-5 -2 -9 -3 -7", "-2"], ["1 2 3 4 5", "5"]], { rules: [usesArray, usesLoop] }),

    cq("Number followed by its square", "Accept n numbers and store them in an array of 2n elements so that each number is followed by its square (5 25 12 144 3 9). Print the array.", ["Input: n, then n integers", "Output: the 2n elements"], String.raw`#include <stdio.h>

int main(void) {
    int n, a[200];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        scanf("%d", &a[2 * i]);
        a[2 * i + 1] = a[2 * i] * a[2 * i];
    }
    for (int i = 0; i < 2 * n; i++)
        printf("%d ", a[i]);
    printf("\n");
    return 0;
}
`, [["3\n5 12 3", "5 25 12 144 3 9"]], [["2\n-4 0", "-4 16 0 0"], ["1\n11", "11 121"]], { level: "intermediate", rules: [usesArray, usesLoop] }),

    cq("Sort in ascending order", "Accept n numbers and sort them in ascending order (write the sort yourself, for example bubble sort).", ["Input: n, then n integers", "Output: the numbers in ascending order", "Don't use qsort"], String.raw`#include <stdio.h>

int main(void) {
    int n, a[100];
    scanf("%d", &n);
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]);
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1]) {
                int t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
    for (int i = 0; i < n; i++)
        printf("%d ", a[i]);
    printf("\n");
    return 0;
}
`, [["5\n5 2 9 1 7", "1 2 5 7 9"]], [["6\n3 -1 3 0 10 -8", "-8 -1 0 3 3 10"], ["1\n42", "42"]], { level: "intermediate", rules: [usesArray, { notMatch: String.raw`\bqsort\s*\(`, message: "Sorts without qsort" }] }),

    cq("Read and print a matrix", "Accept a matrix of r rows and c columns and print it row by row.", ["Input: r and c, then the r * c numbers row by row", "Output: the matrix, one row per line"], String.raw`#include <stdio.h>

int main(void) {
    int r, c, m[10][10];
    scanf("%d %d", &r, &c);
    for (int i = 0; i < r; i++)
        for (int j = 0; j < c; j++)
            scanf("%d", &m[i][j]);
    for (int i = 0; i < r; i++) {
        for (int j = 0; j < c; j++)
            printf("%d ", m[i][j]);
        printf("\n");
    }
    return 0;
}
`, [["2 3\n1 2 3\n4 5 6", "1 2 3\n4 5 6"]], [["3 1\n7\n8\n9", "7\n8\n9"], ["1 4\n0 -1 -2 -3", "0 -1 -2 -3"]], { rules: [{ match: String.raw`\w+\s*\[\s*\w*\s*\]\s*\[\s*\w*\s*\]`, message: "Uses a two-dimensional array" }] }),

    cq("Add two arrays", "Accept two arrays of n numbers and print their element-by-element sum.", ["Input: n, then the n numbers of the first array, then the n numbers of the second", "Output: n sums"], String.raw`#include <stdio.h>

int main(void) {
    int n, a[100], b[100];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    for (int i = 0; i < n; i++) scanf("%d", &b[i]);
    for (int i = 0; i < n; i++) printf("%d ", a[i] + b[i]);
    printf("\n");
    return 0;
}
`, [["3\n1 2 3\n4 5 6", "5 7 9"]], [["4\n-1 0 1 2\n1 0 -1 -2", "0 0 0 0"], ["1\n100\n23", "123"]], { rules: [usesArray] }),

    cq("Add two matrices", "Accept two r x c matrices and print their sum.", ["Input: r and c, then the first matrix, then the second, row by row", "Output: the sum matrix, one row per line"], String.raw`#include <stdio.h>

int main(void) {
    int r, c, a[10][10], b[10][10];
    scanf("%d %d", &r, &c);
    for (int i = 0; i < r; i++) for (int j = 0; j < c; j++) scanf("%d", &a[i][j]);
    for (int i = 0; i < r; i++) for (int j = 0; j < c; j++) scanf("%d", &b[i][j]);
    for (int i = 0; i < r; i++) {
        for (int j = 0; j < c; j++) printf("%d ", a[i][j] + b[i][j]);
        printf("\n");
    }
    return 0;
}
`, [["2 2\n1 2\n3 4\n5 6\n7 8", "6 8\n10 12"]], [["1 3\n1 1 1\n2 2 2", "3 3 3"], ["2 1\n-5\n5\n5\n-5", "0\n0"]], { rules: [{ match: String.raw`\w+\s*\[\s*\w*\s*\]\s*\[\s*\w*\s*\]`, message: "Uses two-dimensional arrays" }] }),

    cq("Multiply two matrices", "Accept two n x n matrices and print their product.", ["Input: n, then the first matrix, then the second, row by row", "Output: the product matrix, one row per line", "c[i][j] = sum of a[i][k] * b[k][j]; start each c[i][j] at 0"], String.raw`#include <stdio.h>

int main(void) {
    int n, a[10][10], b[10][10];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) scanf("%d", &a[i][j]);
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) scanf("%d", &b[i][j]);
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            int sum = 0;
            for (int k = 0; k < n; k++) sum += a[i][k] * b[k][j];
            printf("%d ", sum);
        }
        printf("\n");
    }
    return 0;
}
`, [["2\n1 2\n3 4\n5 6\n7 8", "19 22\n43 50"]], [["1\n3\n4", "12"], ["3\n1 0 0\n0 1 0\n0 0 1\n2 3 4\n5 6 7\n8 9 1", "2 3 4\n5 6 7\n8 9 1"]], { level: "advanced", rules: [usesLoop] }),

    cq("Transpose of a matrix", "Accept an r x c matrix and print its transpose (rows become columns).", ["Input: r and c, then the matrix row by row", "Output: the c x r transpose, one row per line"], String.raw`#include <stdio.h>

int main(void) {
    int r, c, m[10][10];
    scanf("%d %d", &r, &c);
    for (int i = 0; i < r; i++) for (int j = 0; j < c; j++) scanf("%d", &m[i][j]);
    for (int j = 0; j < c; j++) {
        for (int i = 0; i < r; i++) printf("%d ", m[i][j]);
        printf("\n");
    }
    return 0;
}
`, [["2 3\n1 2 3\n4 5 6", "1 4\n2 5\n3 6"]], [["1 2\n7 8", "7\n8"], ["2 2\n1 2\n3 4", "1 3\n2 4"]], { level: "intermediate", rules: [usesLoop] }),

    cq("Print a name vertically", "Accept a name and print it vertically, one letter per line.", ["Input: a name (one word)", "Output: each letter on its own line"], String.raw`#include <stdio.h>

int main(void) {
    char s[100];
    scanf("%99s", s);
    for (int i = 0; s[i] != '\0'; i++)
        printf("%c\n", s[i]);
    return 0;
}
`, [["Asha", "A s h a"]], [["Inveon", "I n v e o n"], ["x", "x"]], { rules: [usesLoop], starter: inc }),

    cq("Convert to uppercase", "Accept a name in lower or mixed case and print it in uppercase. Convert each letter yourself (a lowercase letter minus 32, or toupper from ctype.h).", ["Input: one word", "Output: the word in capitals, and nothing else (it is compared exactly)"], String.raw`#include <stdio.h>

int main(void) {
    char s[100];
    scanf("%99s", s);
    for (int i = 0; s[i] != '\0'; i++)
        if (s[i] >= 'a' && s[i] <= 'z')
            s[i] = s[i] - 32;
    printf("%s\n", s);
    return 0;
}
`, [["asha", "ASHA"], ["InVeOn", "INVEON"]], [["abc123", "ABC123"], ["Z", "Z"]], { match: "exact", rules: [usesLoop, { notMatch: String.raw`\bstrupr\s*\(`, message: "Doesn't use strupr (Turbo C only)" }], starter: inc }),

    cq("Count the vowels", "Accept a word and count its vowels (a, e, i, o, u, upper or lower case).", ["Input: one word", "Output: the number of vowels"], String.raw`#include <stdio.h>

int main(void) {
    char s[100];
    int count = 0;
    scanf("%99s", s);
    for (int i = 0; s[i] != '\0'; i++) {
        char c = s[i];
        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u' || c == 'A' || c == 'E' || c == 'I' || c == 'O' || c == 'U')
            count++;
    }
    printf("Vowels = %d\n", count);
    return 0;
}
`, [["education", "5"], ["rhythm", "0"]], [["Programming", "3"], ["AEIOUaeiou", "10"]], { rules: [usesLoop], starter: inc }),

    cq("Length of a string", "Accept a word and print its length without using strlen.", ["Input: one word", "Output: its length", "Count characters until '\\0'"], String.raw`#include <stdio.h>

int main(void) {
    char s[100];
    int len = 0;
    scanf("%99s", s);
    while (s[len] != '\0')
        len++;
    printf("Length = %d\n", len);
    return 0;
}
`, [["Asha", "4"], ["a", "1"]], [["Inveon", "6"], ["Supercalifragilistic", "20"]], { rules: [usesLoop, noStrlen], starter: inc }),

    cq("Reverse a string", "Accept a word and print it reversed.", ["Input: one word", "Output: the word reversed"], String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
    char s[100];
    scanf("%99s", s);
    int len = strlen(s);
    for (int i = 0, j = len - 1; i < j; i++, j--) {
        char t = s[i];
        s[i] = s[j];
        s[j] = t;
    }
    printf("%s\n", s);
    return 0;
}
`, [["Asha", "ahsA"], ["abc", "cba"]], [["x", "x"], ["Inveon", "noevnI"]], { rules: [usesLoop, { notMatch: String.raw`\bstrrev\s*\(`, message: "Doesn't use strrev (Turbo C only)" }], starter: inc }),

    cq("Palindrome string", "Accept a word and check whether it reads the same backwards (madam). Compare exactly (case matters).", ["Input: one word", "Output: Palindrome or Not a palindrome"], String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
    char s[100];
    scanf("%99s", s);
    int len = strlen(s), ok = 1;
    for (int i = 0; i < len / 2; i++)
        if (s[i] != s[len - 1 - i]) {
            ok = 0;
            break;
        }
    printf(ok ? "Palindrome\n" : "Not a palindrome\n");
    return 0;
}
`, [["madam", "Palindrome", ["not"]], ["hello", "Not a palindrome"]], [["racecar", "Palindrome", ["not"]], ["ab", "Not a palindrome"], ["a", "Palindrome", ["not"]]], { rules: [usesLoop], starter: inc }),

    cq("Second largest", "Accept n numbers and print the second largest distinct value. If there isn't one (all values equal), print No second largest.", ["Input: n, then n integers", "Output: the second largest distinct value"], String.raw`#include <stdio.h>

int main(void) {
    int n, x, first, second, has = 0;
    scanf("%d", &n);
    scanf("%d", &first);
    for (int i = 1; i < n; i++) {
        scanf("%d", &x);
        if (x > first) {
            second = first;
            first = x;
            has = 1;
        } else if (x < first && (!has || x > second)) {
            second = x;
            has = 1;
        }
    }
    if (has) printf("Second largest = %d\n", second);
    else printf("No second largest\n");
    return 0;
}
`, [["5\n4 9 2 9 7", "7"], ["3\n1 2 3", "2"]], [["4\n5 5 5 5", "No second largest"], ["2\n-1 -8", "-8"], ["6\n10 20 20 5 15 20", "15"]], { level: "advanced", rules: [usesLoop] }),

    cq("Linear search", "Accept n numbers and a value to find. Print the position (1-based) of its first occurrence, or Not found.", ["Input: n, then n integers, then the value to find", "Output: Found at position p, or Not found"], String.raw`#include <stdio.h>

int main(void) {
    int n, a[100], key, pos = -1;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    scanf("%d", &key);
    for (int i = 0; i < n; i++)
        if (a[i] == key) {
            pos = i + 1;
            break;
        }
    if (pos > 0) printf("Found at position %d\n", pos);
    else printf("Not found\n");
    return 0;
}
`, [["5\n4 9 2 8 7\n8", "Found 4", ["not"]], ["3\n1 2 3\n5", "Not found"]], [["4\n7 7 7 7\n7", "Found 1", ["not"]], ["1\n0\n1", "Not found"]], { rules: [usesArray, usesLoop] }),

    cq("Count the words in a sentence", "Accept a sentence (a whole line with spaces) and count its words. Words are separated by single spaces.", ["Input: one line", "Output: the number of words", "Read the line with fgets"], String.raw`#include <stdio.h>

int main(void) {
    char line[500];
    fgets(line, sizeof line, stdin);
    int words = 0, inWord = 0;
    for (int i = 0; line[i] != '\0'; i++) {
        if (line[i] == ' ' || line[i] == '\n' || line[i] == '\t') inWord = 0;
        else if (!inWord) {
            inWord = 1;
            words++;
        }
    }
    printf("Words = %d\n", words);
    return 0;
}
`, [["I love C programming", "4"], ["Hello", "1"]], [["Inveon Technologies trains interns", "4"], ["a b c d e f", "6"]], { level: "intermediate", rules: [{ match: String.raw`\bfgets\s*\(`, message: "Reads the whole line with fgets" }] }),
  ],
  quiz: [
    { q: "In int a[5];, what is the index of the last element?", options: ["5", "4", "6", "It depends on the values"], answer: 1, why: "Indexes go from 0 to size - 1." },
    { q: "Which scanf reads the i-th element of int a[10]?", options: ["scanf(\"%d\", a[i]);", "scanf(\"%d\", &a[i]);", "scanf(\"%d\", &a);", "scanf(\"%s\", a);"], answer: 1, why: "Each element needs its address, &a[i]." },
    { q: "How does C know where a string ends?", options: ["It stores the length first", "It ends with the null character '\\0'", "It ends at the first space", "It doesn't; you must always pass the length"], answer: 1, why: "Strings are char arrays terminated by '\\0'." },
    { q: "How many bytes does char s[] = \"Asha\"; take?", options: ["4", "5", "8", "It depends on the compiler"], answer: 1, why: "Four letters plus the '\\0' terminator." },
    { q: "How do you compare two strings for equality in C?", options: ["a == b", "strcmp(a, b) == 0", "a.equals(b)", "strcpy(a, b)"], answer: 1, why: "== compares addresses; strcmp compares the characters and returns 0 when equal." },
    { q: "Why start max at a[0] instead of 0 when finding the largest element?", options: ["It is faster", "If all values are negative, 0 would be wrongly reported as the largest", "a[0] is always the largest", "0 is not allowed in C"], answer: 1, why: "The starting value must be one of the elements." },
    { q: "Which function reads a whole line including spaces?", options: ["scanf(\"%s\", s)", "gets(s)", "fgets(s, sizeof s, stdin)", "getch()"], answer: 2, why: "fgets reads up to the newline safely. gets was removed from C and getch is Turbo C." },
    { q: "In matrix multiplication of two 3 x 3 matrices, how many multiplications are needed for one element c[i][j]?", options: ["1", "3", "9", "27"], answer: 1, why: "c[i][j] is the sum of a[i][k] * b[k][j] for k = 0, 1, 2: three multiplications." },
    { q: "What does this print?\n\nint a[5] = {1, 2, 3};\nprintf(\"%d\", a[3] + a[4]);", options: ["Garbage", "0", "Compile error", "3"], answer: 1, why: "When an array is partly initialised, the remaining elements are set to 0." },
    { q: "What does this print?\n\nchar s[] = \"hello\";\ns[0] = s[0] - 32;\nprintf(\"%s\", s);", options: ["hello", "Hello", "HELLO", "Compile error"], answer: 1, why: "'h' - 32 is 'H' in ASCII; only the first letter changes." },
  ],
};
