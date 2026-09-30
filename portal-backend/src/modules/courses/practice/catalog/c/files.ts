import type { PracticeUnit } from "../../types.js";
import { cq } from "./shared.js";

const opens = (mode: string, what: string) => ({ match: String.raw`\bfopen\s*\([^,]+,\s*"${mode}\+?b?"\s*\)`, message: `Opens a file for ${what} (fopen with "${mode}")` });
const closes = { match: String.raw`\bfclose\s*\(`, message: "Closes the file with fclose" };
const checksNull = { match: String.raw`==\s*NULL|!\s*\w+\s*\)|NULL\s*==`, message: "Checks whether fopen returned NULL" };

export const files: PracticeUnit = {
  key: "files",
  title: "File handling",
  summary: "opening, writing, reading, copying and appending files with fopen, fprintf, fscanf, fgets, fgetc and fputc",
  reading: String.raw`## Why files

Variables disappear when the program ends. Files keep data: marks, bills, logs. C works with files through a FILE pointer from stdio.h.

## Opening and closing

` + "```c" + String.raw`
FILE *fp = fopen("marks.txt", "w");
if (fp == NULL) {
    printf("Could not open the file\n");
    return 1;
}
fprintf(fp, "Asha %d\n", 90);
fclose(fp);
` + "```" + String.raw`

Modes:

- "r": read. Fails (returns NULL) if the file doesn't exist, which is also how you check whether a file exists.
- "w": write. Creates the file, or empties it if it already exists.
- "a": append. Writes at the end, keeping what is there.
- "r+", "w+", "a+": read and write. Add b ("rb", "wb") for binary files.

Always check for NULL before using the pointer, and always fclose: it writes any buffered data to disk. Reading a file you just wrote only works after closing it (or calling fflush).

## Writing

- fprintf(fp, "%d %s\n", roll, name); works like printf.
- fputs("text\n", fp); writes a string.
- fputc(ch, fp); writes one character.

## Reading

- fscanf(fp, "%d %s", &roll, name) works like scanf and returns how many values it read. Loop while it returns the expected count.
- fgets(line, sizeof line, fp) reads one line, and returns NULL at the end of the file.
- fgetc(fp) reads one character and returns EOF at the end. Store it in an int, not a char, so EOF can be told apart from a real character.

` + "```c" + String.raw`
int ch;
while ((ch = fgetc(fp)) != EOF) {
    putchar(ch);
}
` + "```" + String.raw`

## Copying a file

Open the source with "r" and the destination with "w", then copy character by character (fgetc/fputc) or line by line (fgets/fputs) until the end, and close both.

## Counting

To count characters, spaces, vowels and lines, read character by character and test each one: ch == ' ' for spaces, ch == '\n' for lines, and a vowel check like in the arrays unit.

## Reading everything from the keyboard

Some questions give you text to store. getchar() or fgets(line, sizeof line, stdin) read it; stdin is the keyboard as a FILE pointer, so the same functions work on it.

## In these assignments

Your program runs in an empty folder. Create the files it needs, write to them, close them and read them back. The checker looks at what your program prints, so print what you read back from the file, not the input you typed.`,
  questions: [
    cq("Check whether a file exists", "Read a line of text and save it to data.txt. Then read a file name and print whether that file exists (try opening it for reading).", ["Input line 1: some text", "Input line 2: a file name", "Output: <name> exists, or <name> does not exist"], String.raw`#include <stdio.h>

int main(void) {
    char text[200], name[100];
    fgets(text, sizeof text, stdin);
    scanf("%99s", name);
    FILE *out = fopen("data.txt", "w");
    if (out == NULL) return 1;
    fputs(text, out);
    fclose(out);
    FILE *fp = fopen(name, "r");
    if (fp == NULL) {
        printf("%s does not exist\n", name);
    } else {
        printf("%s exists\n", name);
        fclose(fp);
    }
    return 0;
}
`, [["hello\ndata.txt", "data txt exists", ["not"]], ["hello\nmissing.txt", "missing txt does not exist"]], [["abc\nnotes.txt", "notes txt does not exist"], ["x y z\ndata.txt", "data txt exists", ["not"]]], { rules: [opens("r", "reading"), checksNull] }),

    cq("Write and read back lines", "Read n lines of text and write them to notes.txt. Close the file, open it again for reading and print its contents.", ["Input: n, then n lines", "Output: the lines read back from notes.txt"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    char line[200];
    scanf("%d\n", &n);
    FILE *fp = fopen("notes.txt", "w");
    if (fp == NULL) return 1;
    for (int i = 0; i < n; i++) {
        fgets(line, sizeof line, stdin);
        fputs(line, fp);
    }
    fclose(fp);
    fp = fopen("notes.txt", "r");
    if (fp == NULL) return 1;
    while (fgets(line, sizeof line, fp) != NULL)
        printf("%s", line);
    fclose(fp);
    return 0;
}
`, [["3\nline one\nline two\nline three\n", "line one line two line three"]], [["1\nInveon\n", "Inveon"], ["2\nC is fun\nfiles too\n", "C is fun files too"]], { rules: [opens("w", "writing"), opens("r", "reading"), closes] }),

    cq("Copy a file", "Read a line of text into source.txt. Copy source.txt to copy.txt character by character (fgetc and fputc), then print the contents of copy.txt.", ["Input: one line of text", "Output: the contents of copy.txt"], String.raw`#include <stdio.h>

int main(void) {
    char text[300];
    fgets(text, sizeof text, stdin);
    FILE *src = fopen("source.txt", "w");
    if (src == NULL) return 1;
    fputs(text, src);
    fclose(src);

    src = fopen("source.txt", "r");
    FILE *dst = fopen("copy.txt", "w");
    if (src == NULL || dst == NULL) return 1;
    int ch;
    while ((ch = fgetc(src)) != EOF)
        fputc(ch, dst);
    fclose(src);
    fclose(dst);

    dst = fopen("copy.txt", "r");
    if (dst == NULL) return 1;
    while ((ch = fgetc(dst)) != EOF)
        putchar(ch);
    fclose(dst);
    return 0;
}
`, [["Files are fun\n", "Files are fun"]], [["Inveon Technologies 2026\n", "Inveon Technologies 2026"], ["x\n", "x"]], { level: "intermediate", rules: [{ match: String.raw`\bfgetc\s*\(`, message: "Reads with fgetc" }, { match: String.raw`\bfputc\s*\(`, message: "Writes with fputc" }, closes] }),

    cq("Count characters, spaces, vowels and lines", "Save all the input text to data.txt. Then read data.txt character by character and print how many characters (all of them, including spaces and newlines), spaces, vowels and lines (newline characters) it has.", ["Input: some lines of text", "Output in this order: characters, spaces, vowels, lines"], String.raw`#include <stdio.h>

int main(void) {
    FILE *fp = fopen("data.txt", "w");
    if (fp == NULL) return 1;
    int ch;
    while ((ch = getchar()) != EOF)
        fputc(ch, fp);
    fclose(fp);

    fp = fopen("data.txt", "r");
    if (fp == NULL) return 1;
    int chars = 0, spaces = 0, vowels = 0, lines = 0;
    while ((ch = fgetc(fp)) != EOF) {
        chars++;
        if (ch == ' ') spaces++;
        if (ch == '\n') lines++;
        switch (ch) {
            case 'a': case 'e': case 'i': case 'o': case 'u':
            case 'A': case 'E': case 'I': case 'O': case 'U':
                vowels++;
        }
    }
    fclose(fp);
    printf("Characters: %d\nSpaces: %d\nVowels: %d\nLines: %d\n", chars, spaces, vowels, lines);
    return 0;
}
`, [["Hello World\nC is fun\n", "21 3 5 2"]], [["a e i\n", "6 2 3 1"], ["xyz\n\n", "5 0 0 2"]], { level: "intermediate", rules: [opens("r", "reading"), { match: String.raw`\bEOF\b`, message: "Reads until EOF" }] }),

    cq("Even and odd numbers in two files", "Read 10 numbers. Write the even ones to even.txt and the odd ones to odd.txt. Then read both files and print Even: followed by the even numbers, and Odd: followed by the odd numbers.", ["Input: 10 integers", "Output line 1: Even: then the even numbers", "Output line 2: Odd: then the odd numbers"], String.raw`#include <stdio.h>

int main(void) {
    FILE *ev = fopen("even.txt", "w");
    FILE *od = fopen("odd.txt", "w");
    if (ev == NULL || od == NULL) return 1;
    for (int i = 0; i < 10; i++) {
        int x;
        scanf("%d", &x);
        fprintf(x % 2 == 0 ? ev : od, "%d ", x);
    }
    fclose(ev);
    fclose(od);

    int x;
    printf("Even:");
    ev = fopen("even.txt", "r");
    if (ev == NULL) return 1;
    while (fscanf(ev, "%d", &x) == 1) printf(" %d", x);
    fclose(ev);
    printf("\nOdd:");
    od = fopen("odd.txt", "r");
    if (od == NULL) return 1;
    while (fscanf(od, "%d", &x) == 1) printf(" %d", x);
    fclose(od);
    printf("\n");
    return 0;
}
`, [["1 2 3 4 5 6 7 8 9 10", "even 2 4 6 8 10 odd 1 3 5 7 9"]], [["2 4 6 8 10 12 14 16 18 20", "even 2 4 6 8 10 12 14 16 18 20 odd"], ["-1 0 11 22 33 44 55 66 77 88", "even 0 22 44 66 88 odd -1 11 33 55 77"]], { level: "intermediate", rules: [{ match: String.raw`\bfprintf\s*\(`, message: "Writes with fprintf" }, { match: String.raw`\bfscanf\s*\(`, message: "Reads back with fscanf" }, closes] }),

    cq("Bill stored in a file", "Read n items (name, quantity, price). Write each item with its amount (quantity * price) to bill.txt. Then read bill.txt and print every line, followed by the grand total.", ["Input: n, then n lines of name (one word), quantity, price", "Output: for each item: name, quantity, price, amount; then Total and the grand total"], String.raw`#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    FILE *fp = fopen("bill.txt", "w");
    if (fp == NULL) return 1;
    for (int i = 0; i < n; i++) {
        char name[50];
        int qty, price;
        scanf("%49s %d %d", name, &qty, &price);
        fprintf(fp, "%s %d %d %d\n", name, qty, price, qty * price);
    }
    fclose(fp);

    fp = fopen("bill.txt", "r");
    if (fp == NULL) return 1;
    char name[50];
    int qty, price, amount, total = 0;
    while (fscanf(fp, "%49s %d %d %d", name, &qty, &price, &amount) == 4) {
        printf("%s %d x %d = %d\n", name, qty, price, amount);
        total += amount;
    }
    fclose(fp);
    printf("Total = %d\n", total);
    return 0;
}
`, [["2\nPen 3 10\nBook 2 55", "Pen 3 10 30 Book 2 55 110 Total 140"]], [["1\nBag 1 999", "Bag 1 999 999 Total 999"], ["3\nA 1 1\nB 2 2\nC 3 3", "A 1 1 1 B 2 2 4 C 3 3 9 Total 14"]], { level: "advanced", rules: [opens("w", "writing"), opens("r", "reading"), closes] }),

    cq("Append to a file", "Write the first input line to log.txt with mode \"w\". Close it, then open log.txt in append mode and add the second line. Finally print the whole file.", ["Input: two lines", "Output: both lines, read back from log.txt"], String.raw`#include <stdio.h>

int main(void) {
    char first[200], second[200];
    fgets(first, sizeof first, stdin);
    fgets(second, sizeof second, stdin);
    FILE *fp = fopen("log.txt", "w");
    if (fp == NULL) return 1;
    fputs(first, fp);
    fclose(fp);
    fp = fopen("log.txt", "a");
    if (fp == NULL) return 1;
    fputs(second, fp);
    fclose(fp);
    fp = fopen("log.txt", "r");
    if (fp == NULL) return 1;
    char line[200];
    while (fgets(line, sizeof line, fp) != NULL)
        printf("%s", line);
    fclose(fp);
    return 0;
}
`, [["first entry\nsecond entry\n", "first entry second entry"]], [["login ok\nlogout ok\n", "login ok logout ok"]], { rules: [opens("a", "appending"), closes] }),

    cq("Count lines and words in a file", "Save the input text to story.txt, then read story.txt and print how many lines and how many words it has (words are separated by spaces or newlines).", ["Input: some lines of text", "Output: the number of lines, then the number of words"], String.raw`#include <stdio.h>

int main(void) {
    FILE *fp = fopen("story.txt", "w");
    if (fp == NULL) return 1;
    int ch;
    while ((ch = getchar()) != EOF)
        fputc(ch, fp);
    fclose(fp);

    fp = fopen("story.txt", "r");
    if (fp == NULL) return 1;
    int lines = 0, words = 0, inWord = 0;
    while ((ch = fgetc(fp)) != EOF) {
        if (ch == '\n') lines++;
        if (ch == ' ' || ch == '\n' || ch == '\t') inWord = 0;
        else if (!inWord) {
            inWord = 1;
            words++;
        }
    }
    fclose(fp);
    printf("Lines: %d\nWords: %d\n", lines, words);
    return 0;
}
`, [["Once upon a time\nthere was a coder\n", "2 8"]], [["one\n", "1 1"], ["a b\nc\nd e f\n", "3 6"]], { level: "intermediate", rules: [opens("r", "reading"), closes] }),
  ],
  quiz: [
    { q: "Which header declares FILE, fopen and fclose?", options: ["<file.h>", "<stdio.h>", "<stdlib.h>", "<fstream.h>"], answer: 1, why: "File functions are part of stdio.h." },
    { q: "What does fopen return when the file can't be opened?", options: ["0 bytes", "NULL", "EOF", "-1"], answer: 1, why: "Always compare the result with NULL before using it." },
    { q: "Which mode keeps the existing contents and writes at the end?", options: ["\"w\"", "\"r\"", "\"a\"", "\"r+\""], answer: 2, why: "\"a\" appends. \"w\" empties the file first." },
    { q: "What happens when you open an existing file with \"w\"?", options: ["The new data is added at the end", "The file is emptied first", "fopen fails", "The file is opened read-only"], answer: 1, why: "\"w\" truncates the file to zero length." },
    { q: "Which function writes formatted text to a file?", options: ["printf", "fprintf", "fputc", "fscanf"], answer: 1, why: "fprintf(fp, format, ...) works like printf but writes to fp." },
    { q: "What does fgets return at the end of the file?", options: ["EOF", "NULL", "0", "An empty string"], answer: 1, why: "fgets returns NULL when nothing more can be read." },
    { q: "How can you check whether a file exists in standard C?", options: ["exists(\"f.txt\")", "Try fopen(\"f.txt\", \"r\") and check for NULL", "fopen(\"f.txt\", \"w\")", "sizeof(\"f.txt\")"], answer: 1, why: "Opening for reading fails when the file doesn't exist. Opening with \"w\" would create it." },
    { q: "Why should the result of fgetc be stored in an int, not a char?", options: ["int is faster", "So EOF (usually -1) can be told apart from every real character", "char can't hold letters", "fgetc returns a pointer"], answer: 1, why: "EOF must be a value no character can have; a char might not be able to represent it distinctly." },
    { q: "A program writes to a file with fprintf and immediately opens the same file with \"r\" to read it, without fclose. What can go wrong?", options: ["Nothing", "The data may still be in the buffer, so the read sees an empty or partial file", "The file is deleted", "fopen returns EOF"], answer: 1, why: "Output is buffered; fclose (or fflush) writes it to disk." },
    { q: "What does this loop do?\n\nwhile ((ch = fgetc(src)) != EOF)\n    fputc(ch, dst);", options: ["Copies src to dst character by character", "Copies only the first line", "Loops forever", "Compares two files"], answer: 0, why: "It reads each character until EOF and writes it to dst." },
  ],
};
