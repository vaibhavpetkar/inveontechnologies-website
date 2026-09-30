import type { PracticeUnit } from "../../types.js";
import { cppq, has, usesLoop, usesVector } from "./shared.js";

export const collections: PracticeUnit = {
  key: "collections",
  title: "Arrays, strings and vectors",
  summary: "built-in arrays, std::vector, 2D data, std::string and its methods, character handling and stringstream",
  reading: String.raw`## Built-in arrays

An array stores a fixed number of values of one type, next to each other in memory:

` + "```cpp" + String.raw`
int marks[5] = {78, 85, 90, 66, 72};
cout << marks[0];            // first element
cout << marks[4];            // last element: index size - 1
` + "```" + String.raw`

- The size must be known when you write the program. int a[n] with n read at runtime is a g++ extension, not standard C++.
- Indexes run from 0 to size - 1. marks[5] reads outside the array: no error message, just garbage or a crash.

## std::vector: the array you should use

vector (from the vector header) is a resizable array that knows its own size:

` + "```cpp" + String.raw`
#include <vector>
int n;
cin >> n;
vector<int> v(n);            // n zeros
for (int i = 0; i < n; i++) cin >> v[i];

vector<int> evens;           // empty
for (int x : v) {            // range-based for
    if (x % 2 == 0) evens.push_back(x);
}
cout << evens.size();
` + "```" + String.raw`

- push_back adds at the end, pop_back removes the last element, size() gives the count, empty() checks for none, clear() removes everything.
- v.front() and v.back() are the first and last elements. v.at(i) is like v[i] but throws an exception when i is out of range, which makes bugs easy to find.
- for (int x : v) gives you a copy of each element. Write for (int& x : v) to change the elements in place, and for (const string& s : names) to read big elements without copying.
- size() returns an unsigned number, so for (int i = 0; i < v.size() - 1; i++) goes wrong when v is empty: 0 - 1 wraps around to a huge number. Check empty() first or compare with i + 1 < v.size().

A table (matrix) is a vector of vectors: vector<vector<int>> grid(rows, vector<int>(cols)); and grid[r][c] reads one cell.

## std::string

string (from the string header) holds text and manages its own memory:

` + "```cpp" + String.raw`
string s = "Inveon";
s += " Technologies";           // join
cout << s.length();             // 19
cout << s[0];                   // 'I'
cout << s.substr(0, 6);         // "Inveon"
if (s.find("Tech") != string::npos) cout << "found";
` + "```" + String.raw`

- Compare strings with == and <; they compare the text, letter by letter (dictionary order, with capitals before small letters).
- substr(start, count) copies part of a string. find returns the index of the first match, or string::npos when there is none.
- Characters are chars: s[i] == 'a' uses single quotes. The cctype header has isdigit, isalpha, isspace, toupper and tolower. Cast to unsigned char before passing a char to them, and back to char when storing: s[i] = static_cast<char>(toupper(static_cast<unsigned char>(s[i])));
- to_string(42) turns a number into text; stoi("42") and stod("3.5") turn text into numbers.
- reverse(s.begin(), s.end()) from algorithm reverses a string or a vector in place.

## Splitting a line into words

stringstream (from sstream) treats a string like cin, so >> reads it word by word:

` + "```cpp" + String.raw`
string line, word;
getline(cin, line);
stringstream ss(line);
while (ss >> word) {
    cout << word << "\n";
}
` + "```" + String.raw`

This handles several spaces between words for free.

## Common mistakes

- Index out of range, especially in loops that look at v[i + 1].
- Reading into v[i] before giving the vector a size: vector<int> v; cin >> v[0]; crashes. Use vector<int> v(n) or push_back.
- Comparing a char with a string: s[i] == "a" does not compile. Use 'a'.
- Forgetting that cin >> word stops at spaces; use getline for sentences.

## How your assignments are checked

Most inputs give the count n first and then the n values, all separated by spaces or newlines, so cin >> reads them the same way. Some questions check that you use a vector or a range-based for. When a question says "print only", the output lines are compared exactly (trailing spaces are ignored).`,
  questions: [
    cppq("Sum, average, minimum and maximum", "Read n numbers into a vector and print their sum, average (2 decimals), smallest and largest value.", ["Input: n (at least 1), then n integers", "Output: sum, average, minimum, maximum on separate lines"], String.raw`#include <iostream>
#include <iomanip>
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<long long> v(n);
    for (auto& x : v) cin >> x;
    long long sum = 0, lo = v[0], hi = v[0];
    for (long long x : v) {
        sum += x;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
    }
    cout << "Sum: " << sum << "\n";
    cout << fixed << setprecision(2) << "Average: " << static_cast<double>(sum) / n << "\n";
    cout << "Min: " << lo << "\nMax: " << hi << "\n";
    return 0;
}
`, [["5\n4 9 2 7 3", "25 5.00 2 9"], ["3\n10 20 25", "55 18.33 10 25"]], [["1\n-5", "-5 -5.00 -5 -5"], ["4\n1000000000 1000000000 1000000000 1000000000", "4000000000 1000000000.00 1000000000 1000000000"]], { rules: [usesVector, usesLoop] }),

    cppq("Reverse a list", "Read n numbers into a vector and print them in reverse order.", ["Input: n, then n integers", "Output: the numbers from last to first, separated by spaces"], String.raw`#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> v(n);
    for (int i = 0; i < n; i++) cin >> v[i];
    for (int i = n - 1; i >= 0; i--) {
        cout << v[i] << (i > 0 ? " " : "\n");
    }
    return 0;
}
`, [["5\n1 2 3 4 5", "5 4 3 2 1"], ["3\n7 -1 0", "0 -1 7"]], [["1\n42", "42"], ["6\n9 9 8 8 7 7", "7 7 8 8 9 9"]], { rules: [usesVector] }),

    cppq("Second largest value", "Read n numbers and print the second largest distinct value. If all the numbers are equal (so there is no second largest), print None.", ["Input: n (at least 1), then n integers", "Output: the second largest distinct value, or None", "Try to do it in one pass without sorting"], String.raw`#include <iostream>
#include <vector>
#include <climits>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<long long> v(n);
    for (auto& x : v) cin >> x;
    long long first = LLONG_MIN, second = LLONG_MIN;
    bool hasSecond = false;
    for (long long x : v) {
        if (x > first) {
            if (first != LLONG_MIN) {
                second = first;
                hasSecond = true;
            }
            first = x;
        } else if (x < first && (!hasSecond || x > second)) {
            second = x;
            hasSecond = true;
        }
    }
    if (hasSecond) cout << "Second largest: " << second << "\n";
    else cout << "None\n";
    return 0;
}
`, [["5\n4 9 2 9 7", "7"], ["3\n5 5 5", "None"]], [["2\n-1 -2", "-2"], ["1\n10", "None"], ["6\n1 2 3 4 5 6", "5"], ["4\n8 8 3 8", "3"]], { level: "intermediate", rules: [usesLoop] }),

    cppq("Count character types", "Read a line of text and count its vowels, consonants, digits and spaces (vowels and consonants are letters, in any case).", ["Input: one line of text", "Output: Vowels, Consonants, Digits and Spaces with their counts, in this order", "Use getline and the functions from <cctype>"], String.raw`#include <iostream>
#include <string>
#include <cctype>
using namespace std;

int main() {
    string line;
    getline(cin, line);
    int vowels = 0, consonants = 0, digits = 0, spaces = 0;
    const string vowelSet = "aeiou";
    for (char c : line) {
        unsigned char u = static_cast<unsigned char>(c);
        if (isalpha(u)) {
            char lower = static_cast<char>(tolower(u));
            if (vowelSet.find(lower) != string::npos) vowels++;
            else consonants++;
        } else if (isdigit(u)) {
            digits++;
        } else if (c == ' ') {
            spaces++;
        }
    }
    cout << "Vowels: " << vowels << "\nConsonants: " << consonants << "\n";
    cout << "Digits: " << digits << "\nSpaces: " << spaces << "\n";
    return 0;
}
`, [["Hello World 2025", "Vowels 3 Consonants 7 Digits 4 Spaces 2"], ["AEIOU xyz", "Vowels 5 Consonants 3 Digits 0 Spaces 1"]], [["123", "Vowels 0 Consonants 0 Digits 3 Spaces 0"], ["C++ is fun!", "Vowels 2 Consonants 4 Digits 0 Spaces 2"]], { level: "intermediate", rules: [has(String.raw`\bgetline\s*\(`, "Reads the line with getline")] }),

    cppq("Palindrome word", "Read one word and print whether it is a palindrome, ignoring upper and lower case (Madam is a palindrome).", ["Input: one word", "Output: Palindrome or Not a palindrome"], String.raw`#include <iostream>
#include <string>
#include <cctype>
using namespace std;

int main() {
    string word;
    cin >> word;
    size_t i = 0, j = word.size() - 1;
    bool palindrome = true;
    while (i < j) {
        if (tolower(static_cast<unsigned char>(word[i])) != tolower(static_cast<unsigned char>(word[j]))) {
            palindrome = false;
            break;
        }
        i++;
        j--;
    }
    cout << (palindrome ? "Palindrome" : "Not a palindrome") << "\n";
    return 0;
}
`, [["Madam", "Palindrome", ["not"]], ["hello", "Not a palindrome"]], [["a", "Palindrome", ["not"]], ["Racecar", "Palindrome", ["not"]], ["ab", "Not a palindrome"], ["noon", "Palindrome", ["not"]]]),

    cppq("Words and the longest word", "Read a sentence and print how many words it has and its longest word (the first one if several have the same length). Words are separated by one or more spaces.", ["Input: one line", "Output line 1: the word count", "Output line 2: the longest word", "Use stringstream from <sstream>"], String.raw`#include <iostream>
#include <sstream>
#include <string>
using namespace std;

int main() {
    string line, word, longest;
    getline(cin, line);
    stringstream ss(line);
    int count = 0;
    while (ss >> word) {
        count++;
        if (word.size() > longest.size()) longest = word;
    }
    cout << "Words: " << count << "\n";
    cout << "Longest: " << longest << "\n";
    return 0;
}
`, [["the quick brown fox", "4 quick"], ["C++   is    powerful", "3 powerful"]], [["one", "1 one"], ["ab cd ef", "3 ab"], ["  learning never exhausts the mind  ", "5 learning"]], { level: "intermediate", rules: [has(String.raw`\bstringstream\b|\bistringstream\b`, "Splits the line with a stringstream")] }),

    cppq("Transpose a matrix", "Read an r x c matrix into a vector of vectors and print its transpose (c rows of r numbers).", ["Input: r and c, then r lines of c integers", "Output: only the transpose, numbers separated by single spaces"], String.raw`#include <iostream>
#include <vector>
using namespace std;

int main() {
    int rows, cols;
    cin >> rows >> cols;
    vector<vector<int>> m(rows, vector<int>(cols));
    for (auto& row : m) {
        for (auto& x : row) cin >> x;
    }
    for (int c = 0; c < cols; c++) {
        for (int r = 0; r < rows; r++) {
            cout << m[r][c] << (r + 1 < rows ? " " : "");
        }
        cout << "\n";
    }
    return 0;
}
`, [["2 3\n1 2 3\n4 5 6", "1 4\n2 5\n3 6"], ["1 1\n7", "7"]], [["3 2\n1 2\n3 4\n5 6", "1 3 5\n2 4 6"], ["1 4\n9 8 7 6", "9\n8\n7\n6"]], { level: "intermediate", match: "exact", rules: [has(String.raw`vector\s*<\s*vector\s*<`, "Stores the matrix in a vector of vectors")] }),

    cppq("Remove duplicates, keep the order", "Read n numbers and print them without duplicates, keeping the first time each value appears.", ["Input: n, then n integers", "Output: the distinct values in their original order"], String.raw`#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> result;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        if (find(result.begin(), result.end(), x) == result.end()) result.push_back(x);
    }
    for (size_t i = 0; i < result.size(); i++) {
        cout << result[i] << (i + 1 < result.size() ? " " : "\n");
    }
    return 0;
}
`, [["7\n3 1 3 2 1 5 2", "3 1 2 5"], ["4\n9 9 9 9", "9"]], [["1\n0", "0"], ["6\n-1 2 -1 3 2 4", "-1 2 3 4"]], { level: "intermediate", rules: [usesVector, has(String.raw`\.push_back\s*\(`, "Builds the result with push_back")] }),

    cppq("Capitalise every word", "Read a sentence and print it with the first letter of every word in capitals and the rest in small letters. Keep single spaces between words.", ["Input: one line of words separated by single spaces", "Output: only the converted line, e.g. hello INVEON tech -> Hello Inveon Tech"], String.raw`#include <iostream>
#include <string>
#include <cctype>
using namespace std;

int main() {
    string line;
    getline(cin, line);
    bool startOfWord = true;
    for (char& c : line) {
        unsigned char u = static_cast<unsigned char>(c);
        if (c == ' ') {
            startOfWord = true;
        } else {
            c = static_cast<char>(startOfWord ? toupper(u) : tolower(u));
            startOfWord = false;
        }
    }
    cout << line << "\n";
    return 0;
}
`, [["hello inveon technologies", "Hello Inveon Technologies"], ["cPP iS FUN", "Cpp Is Fun"]], [["a", "A"], ["123 go", "123 Go"], ["MUMBAI pune NAGPUR", "Mumbai Pune Nagpur"]], { match: "exact", rules: [has(String.raw`\btoupper\s*\(`, "Uses toupper")] }),

    cppq("Rotate left by k", "Read n numbers and a number k, and rotate the list left by k positions (k can be bigger than n).", ["Input: n and k, then n integers", "Output: the rotated list, e.g. 1 2 3 4 5 rotated by 2 is 3 4 5 1 2"], String.raw`#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n;
    long long k;
    cin >> n >> k;
    vector<int> v(n);
    for (auto& x : v) cin >> x;
    int shift = static_cast<int>(k % n);
    for (int i = 0; i < n; i++) {
        cout << v[(i + shift) % n] << (i + 1 < n ? " " : "\n");
    }
    return 0;
}
`, [["5 2\n1 2 3 4 5", "3 4 5 1 2"], ["3 0\n7 8 9", "7 8 9"]], [["4 6\n1 2 3 4", "3 4 1 2"], ["1 100\n5", "5"], ["5 5\n1 2 3 4 5", "1 2 3 4 5"]], { level: "advanced", rules: [usesVector, has(String.raw`%\s*n\b`, "Wraps the index around with % n")] }),
  ],
  quiz: [
    { q: "What is the index of the last element of int a[10]?", options: ["10", "9", "11", "1"], answer: 1, why: "Indexes start at 0, so the last one is size - 1." },
    { q: "Which header do you include for std::vector?", options: ["<array>", "<vector>", "<list>", "<vector.h>"], answer: 1, why: "vector lives in the <vector> header." },
    { q: "Which call adds 5 to the end of vector<int> v?", options: ["v.add(5);", "v.push_back(5);", "v.append(5);", "v[v.size()] = 5;"], answer: 1, why: "push_back grows the vector by one element. Writing v[v.size()] is out of range." },
    { q: "What does s.substr(2, 3) return when s is \"PROGRAM\"?", options: ["\"ROG\"", "\"OGR\"", "\"OG\"", "\"OGRA\""], answer: 1, why: "substr(start, count) starts at index 2 ('O') and takes 3 characters." },
    { q: "What does s.find(\"xyz\") return when \"xyz\" is not in s?", options: ["-1 as an int", "0", "string::npos", "It throws an exception"], answer: 2, why: "find returns string::npos (the largest size_t value) when nothing matches." },
    { q: "Which loop doubles every element of vector<int> v in place?", options: ["for (int x : v) x *= 2;", "for (int& x : v) x *= 2;", "for (const int& x : v) x *= 2;", "for (x in v) x *= 2;"], answer: 1, why: "Only a reference (int&) changes the elements; int x is a copy and const int& can't be changed." },
    { q: "What is the difference between v[i] and v.at(i)?", options: ["None", "at(i) checks the index and throws std::out_of_range when it is invalid", "at(i) is faster", "v[i] checks the index"], answer: 1, why: "operator[] does no checking; at() does and throws." },
    { q: "What does this print?\n\nstring a = \"apple\", b = \"Banana\";\ncout << (a < b);", options: ["1", "0", "apple", "Compile error"], answer: 1, why: "Strings compare by character codes and 'a' (97) is bigger than 'B' (66), so a < b is false and cout prints 0." },
    { q: "v is an empty vector<int>. What happens in for (int i = 0; i < v.size() - 1; i++)?", options: ["The loop runs zero times", "v.size() - 1 wraps around to a huge unsigned number, so the loop runs and reads out of range", "Compile error", "It runs once"], answer: 1, why: "size() is unsigned; 0 - 1 becomes the maximum size_t value." },
    { q: "What does this print?\n\nstringstream ss(\"  10   20 x 30\");\nint a, b, c = 0;\nss >> a >> b >> c;\ncout << a + b + c;", options: ["60", "30", "Compile error", "Garbage"], answer: 1, why: "Reading c fails at \"x\", so c is set to 0 (since C++11) and the sum is 10 + 20 + 0 = 30." },
  ],
};
