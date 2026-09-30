import type { ExerciseSeed } from "../types.js";

const imp = `import java.util.*;\n`;
const impStreams = `import java.util.*;\nimport java.util.stream.*;\n`;

const main = (body: string, imports = imp) => `${imports}\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n${body}    }\n}\n`;

export default [
  {
    title: "Sort names with a List",
    brief: "Read n names into an ArrayList and print them in alphabetical order.",
    steps: ["Input line 1: n; then n names, one per line (single words)", "Output: the names sorted alphabetically (A-Z, case-sensitive natural order), one per line", "Store them in a List<String> and sort with Collections.sort or list.sort"],
    level: "basic",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        List<String> names = new ArrayList<>();\n        for (int i = 0; i < n; i++) names.add(sc.next());\n\n        // Sort the list and print each name\n`),
    solution: main(`        int n = sc.nextInt();\n        List<String> names = new ArrayList<>();\n        for (int i = 0; i < n; i++) names.add(sc.next());\n        Collections.sort(names);\n        for (String name : names) System.out.println(name);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "3\nRavi\nAsha\nMeera", expected: "Asha\nMeera\nRavi" },
          { stdin: "4\nzoe\nadam\nmike\nbob", expected: "adam\nbob\nmike\nzoe" },
          { stdin: "1\nSolo", expected: "Solo", hidden: true },
          { stdin: "4\nAnu\nAnu\nAb\nB", expected: "Ab\nAnu\nAnu\nB", hidden: true },
        ],
      },
      rules: [{ match: String.raw`List\s*<\s*String\s*>`, message: "Uses a List<String>" }],
    },
  },
  {
    title: "Unique words with TreeSet",
    brief: "Read a line of words and print each different word once, in alphabetical order, using a Set.",
    steps: ["Input: one line of lowercase words separated by spaces", "Output line 1: the number of distinct words", "Output line 2: the distinct words in alphabetical order, separated by single spaces", "Use a TreeSet<String>"],
    level: "basic",
    editor: "java",
    starter: main(`        String[] words = sc.nextLine().trim().split("\\\\s+");\n\n        // Put the words in a TreeSet and print the result\n`),
    solution: main(`        String[] words = sc.nextLine().trim().split("\\\\s+");\n        Set<String> unique = new TreeSet<>(Arrays.asList(words));\n        System.out.println(unique.size());\n        System.out.println(String.join(" ", unique));\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "the cat and the hat", expected: "4\nand cat hat the" },
          { stdin: "java java java", expected: "1\njava" },
          { stdin: "b a", expected: "2\na b", hidden: true },
          { stdin: "  x  y   x z  ", expected: "3\nx y z", hidden: true },
        ],
      },
      rules: [{ match: String.raw`new\s+TreeSet\s*<`, message: "Uses a TreeSet" }],
    },
  },
  {
    title: "Word counts with TreeMap",
    brief: "Read a line of words and print how many times each word appears, in alphabetical order, using a Map.",
    steps: ["Input: one line of lowercase words separated by spaces", "Output: one line per distinct word in the form word=count, sorted alphabetically", "Use a TreeMap<String, Integer> (tip: map.merge(word, 1, Integer::sum))"],
    level: "basic",
    editor: "java",
    starter: main(`        String[] words = sc.nextLine().trim().split("\\\\s+");\n\n        // Count the words in a TreeMap and print them\n`),
    solution: main(`        String[] words = sc.nextLine().trim().split("\\\\s+");\n        Map<String, Integer> counts = new TreeMap<>();\n        for (String w : words) counts.merge(w, 1, Integer::sum);\n        for (Map.Entry<String, Integer> e : counts.entrySet()) System.out.println(e.getKey() + "=" + e.getValue());\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "red blue red green blue red", expected: "blue=2\ngreen=1\nred=3" },
          { stdin: "one", expected: "one=1" },
          { stdin: "b a b a c", expected: "a=2\nb=2\nc=1", hidden: true },
          { stdin: "x x x x x", expected: "x=5", hidden: true },
        ],
      },
      rules: [{ match: String.raw`\bTreeMap\s*<`, message: "Uses a TreeMap" }],
    },
  },
  {
    title: "Safe division with try/catch",
    brief: "Read two integers and print a / b, catching the ArithmeticException thrown when b is 0.",
    steps: ["Input: one line with two integers a b", "Output: the integer result of a / b", "If b is 0, catch the ArithmeticException and print Cannot divide by zero", "Use try and catch (ArithmeticException e), not an if check on b"],
    level: "basic",
    editor: "java",
    starter: main(`        int a = sc.nextInt();\n        int b = sc.nextInt();\n\n        // Divide inside try, handle ArithmeticException in catch\n`),
    solution: main(`        int a = sc.nextInt();\n        int b = sc.nextInt();\n        try {\n            System.out.println(a / b);\n        } catch (ArithmeticException e) {\n            System.out.println("Cannot divide by zero");\n        }\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "10 2", expected: "5" },
          { stdin: "7 0", expected: "Cannot divide by zero" },
          { stdin: "-9 2", expected: "-4", hidden: true },
          { stdin: "0 0", expected: "Cannot divide by zero", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\btry\s*\{`, message: "Uses a try block" },
        { match: String.raw`catch\s*\(\s*(final\s+)?ArithmeticException\s+\w+\s*\)`, message: "Catches ArithmeticException" },
      ],
    },
  },
  {
    title: "Filter evens with streams",
    brief: "Read a list of integers and use a stream to print the even numbers multiplied by 10.",
    steps: ["Input line 1: n; line 2: n integers", "Output: each even number times 10, in input order, separated by single spaces; print None if there are no even numbers", "Use a stream with filter and map (no for loop over the numbers for the filtering)"],
    level: "intermediate",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        List<Integer> nums = new ArrayList<>();\n        for (int i = 0; i < n; i++) nums.add(sc.nextInt());\n\n        // Use nums.stream().filter(...).map(...) and print the result\n`, impStreams),
    solution: main(`        int n = sc.nextInt();\n        List<Integer> nums = new ArrayList<>();\n        for (int i = 0; i < n; i++) nums.add(sc.nextInt());\n        String out = nums.stream()\n                .filter(x -> x % 2 == 0)\n                .map(x -> String.valueOf(x * 10))\n                .collect(Collectors.joining(" "));\n        System.out.println(out.isEmpty() ? "None" : out);\n`, impStreams),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "6\n1 2 3 4 5 6", expected: "20 40 60" },
          { stdin: "4\n-2 7 0 9", expected: "-20 0" },
          { stdin: "3\n1 3 5", expected: "None", hidden: true },
          { stdin: "5\n8 8 1 -4 3", expected: "80 80 -40", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\.stream\s*\(\s*\)|Stream\s*\.\s*of\s*\(|Arrays\s*\.\s*stream\s*\(`, message: "Uses a stream" },
        { match: String.raw`\.filter\s*\(\s*\(?\s*\w+\s*\)?\s*->`, message: "Filters with a lambda in filter()" },
        { match: String.raw`\.map(ToObj)?\s*\(`, message: "Transforms with map()" },
      ],
    },
  },
  {
    title: "Generic max method",
    brief: "Write one generic method that returns the largest element of any List of Comparable values, and use it for a list of numbers and a list of words.",
    steps: ["Input line 1: integers separated by spaces; line 2: words separated by spaces", "Output line 1: the largest integer; line 2: the alphabetically last word", "Write static <T extends Comparable<T>> T maxOf(List<T> list) and call it for both lists (do not use Collections.max)"],
    level: "intermediate",
    editor: "java",
    starter: `${imp}\npublic class Main {\n    // Write: static <T extends Comparable<T>> T maxOf(List<T> list)\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> nums = new ArrayList<>();\n        for (String s : sc.nextLine().trim().split("\\\\s+")) nums.add(Integer.parseInt(s));\n        List<String> words = new ArrayList<>(Arrays.asList(sc.nextLine().trim().split("\\\\s+")));\n\n        // Print maxOf(nums) and maxOf(words)\n    }\n}\n`,
    solution: `${imp}\npublic class Main {\n    static <T extends Comparable<T>> T maxOf(List<T> list) {\n        T best = list.get(0);\n        for (T item : list) {\n            if (item.compareTo(best) > 0) best = item;\n        }\n        return best;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> nums = new ArrayList<>();\n        for (String s : sc.nextLine().trim().split("\\\\s+")) nums.add(Integer.parseInt(s));\n        List<String> words = new ArrayList<>(Arrays.asList(sc.nextLine().trim().split("\\\\s+")));\n        System.out.println(maxOf(nums));\n        System.out.println(maxOf(words));\n    }\n}\n`,
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "3 17 5\napple mango banana", expected: "17\nmango" },
          { stdin: "-5 -2 -9\nzebra ant", expected: "-2\nzebra" },
          { stdin: "42\nsolo", expected: "42\nsolo", hidden: true },
          { stdin: "100 9 1000 99\nJava java JAVA", expected: "1000\njava", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`<\s*T\s+extends\s+Comparable\s*<\s*(\?\s+super\s+)?T\s*>\s*>\s*T\s+maxOf\s*\(`, message: "Declares a generic method <T extends Comparable<T>> T maxOf(...)" },
        { notMatch: String.raw`Collections\s*\.\s*max\s*\(`, message: "Does not use Collections.max" },
      ],
    },
  },
  {
    title: "Sort by length with a lambda",
    brief: "Read a list of words and print them sorted by length, shortest first, breaking ties alphabetically, using a Comparator.",
    steps: ["Input line 1: n; line 2: n words separated by spaces", "Output: the words sorted by length, then alphabetically for equal lengths, one per line", "Sort with a Comparator (a lambda or Comparator.comparing(...).thenComparing(...))"],
    level: "intermediate",
    editor: "java",
    starter: main(`        int n = sc.nextInt();\n        List<String> words = new ArrayList<>();\n        for (int i = 0; i < n; i++) words.add(sc.next());\n\n        // Sort with a Comparator and print\n`),
    solution: main(`        int n = sc.nextInt();\n        List<String> words = new ArrayList<>();\n        for (int i = 0; i < n; i++) words.add(sc.next());\n        words.sort(Comparator.comparing(String::length).thenComparing(Comparator.naturalOrder()));\n        for (String w : words) System.out.println(w);\n`),
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "4\nbanana kiwi fig apple", expected: "fig\nkiwi\napple\nbanana" },
          { stdin: "3\ncc bb aa", expected: "aa\nbb\ncc" },
          { stdin: "1\nword", expected: "word", hidden: true },
          { stdin: "5\nccc a bb aaa b", expected: "a\nb\nbb\naaa\nccc", hidden: true },
        ],
      },
      rules: [{ match: String.raw`Comparator|->`, message: "Sorts with a Comparator or a lambda" }],
    },
  },
  {
    title: "Custom exception for age",
    brief: "Create your own checked exception InvalidAgeException and use it to validate a list of ages.",
    steps: ["Input line 1: n; then n integers, one age per line", "A valid age is between 0 and 120; a method validate(age) throws InvalidAgeException otherwise", "Output per age: Valid: <age>, or Invalid age: <age> when the exception is caught", "Define class InvalidAgeException extends Exception"],
    level: "intermediate",
    editor: "java",
    starter: `${imp}\n// Define class InvalidAgeException here\n\npublic class Main {\n    // Write: static void validate(int age) throws InvalidAgeException\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        for (int i = 0; i < n; i++) {\n            int age = sc.nextInt();\n            // Call validate inside try/catch and print the result\n        }\n    }\n}\n`,
    solution: `${imp}\nclass InvalidAgeException extends Exception {\n    InvalidAgeException(String message) {\n        super(message);\n    }\n}\n\npublic class Main {\n    static void validate(int age) throws InvalidAgeException {\n        if (age < 0 || age > 120) throw new InvalidAgeException("Invalid age: " + age);\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        for (int i = 0; i < n; i++) {\n            int age = sc.nextInt();\n            try {\n                validate(age);\n                System.out.println("Valid: " + age);\n            } catch (InvalidAgeException e) {\n                System.out.println(e.getMessage());\n            }\n        }\n    }\n}\n`,
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "3\n25\n150\n-1", expected: "Valid: 25\nInvalid age: 150\nInvalid age: -1" },
          { stdin: "1\n60", expected: "Valid: 60" },
          { stdin: "4\n0\n120\n121\n-5", expected: "Valid: 0\nValid: 120\nInvalid age: 121\nInvalid age: -5", hidden: true },
          { stdin: "2\n1000\n7", expected: "Invalid age: 1000\nValid: 7", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`class\s+InvalidAgeException\s+extends\s+Exception\b`, message: "Defines InvalidAgeException extends Exception" },
        { match: String.raw`throw\s+new\s+InvalidAgeException\s*\(`, message: "Throws InvalidAgeException" },
        { match: String.raw`catch\s*\(\s*(final\s+)?InvalidAgeException\s+\w+\s*\)`, message: "Catches InvalidAgeException" },
      ],
    },
  },
  {
    title: "Shapes with an interface",
    brief: "Define a Shape interface with an area() method, implement it for circles, rectangles and squares, and print the area of each shape you read.",
    steps: ["Input line 1: n; then n lines: circle r, rect w h or square s (numbers may have decimals)", "Output: the area of each shape with exactly two decimals, e.g. String.format(\"%.2f\", area); use Math.PI for circles", "Last line: Total: <sum of all areas with two decimals>", "Define interface Shape and at least three classes that implement Shape"],
    level: "advanced",
    editor: "java",
    starter: `${imp}\n// Define interface Shape { double area(); } and the classes that implement it\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        for (int i = 0; i < n; i++) {\n            String type = sc.next();\n            // Create the right Shape, then print its area\n        }\n    }\n}\n`,
    solution: `${imp}\ninterface Shape {\n    double area();\n}\n\nclass Circle implements Shape {\n    private final double r;\n    Circle(double r) { this.r = r; }\n    public double area() { return Math.PI * r * r; }\n}\n\nclass Rect implements Shape {\n    private final double w, h;\n    Rect(double w, double h) { this.w = w; this.h = h; }\n    public double area() { return w * h; }\n}\n\nclass Square implements Shape {\n    private final double s;\n    Square(double s) { this.s = s; }\n    public double area() { return s * s; }\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        List<Shape> shapes = new ArrayList<>();\n        for (int i = 0; i < n; i++) {\n            String type = sc.next();\n            Shape shape;\n            if (type.equals("circle")) shape = new Circle(sc.nextDouble());\n            else if (type.equals("rect")) shape = new Rect(sc.nextDouble(), sc.nextDouble());\n            else shape = new Square(sc.nextDouble());\n            shapes.add(shape);\n        }\n        double total = 0;\n        for (Shape s : shapes) {\n            System.out.println(String.format("%.2f", s.area()));\n            total += s.area();\n        }\n        System.out.println("Total: " + String.format("%.2f", total));\n    }\n}\n`,
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "3\ncircle 1\nrect 2 3\nsquare 4", expected: "3.14\n6.00\n16.00\nTotal: 25.14" },
          { stdin: "2\nsquare 1.5\ncircle 2", expected: "2.25\n12.57\nTotal: 14.82" },
          { stdin: "1\nrect 0 5", expected: "0.00\nTotal: 0.00", hidden: true },
          { stdin: "3\ncircle 10\ncircle 0.5\nrect 2.5 4", expected: "314.16\n0.79\n10.00\nTotal: 324.94", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\binterface\s+Shape\b`, message: "Defines interface Shape" },
        { match: String.raw`\bdouble\s+area\s*\(\s*\)`, message: "Shape has a double area() method" },
        { match: String.raw`implements\s+Shape[\s\S]*implements\s+Shape[\s\S]*implements\s+Shape`, message: "At least three classes implement Shape" },
      ],
    },
  },
  {
    title: "Department totals with streams",
    brief: "Read employee records and use streams with Collectors.groupingBy to print the number of employees and total salary per department.",
    steps: ["Input line 1: n; then n lines: name department salary (salary is an integer)", "Output: one line per department in alphabetical order: <department> <count> <total salary>", "Group with Collectors.groupingBy (a TreeMap keeps departments sorted)"],
    level: "advanced",
    editor: "java",
    starter: `${impStreams}\nclass Employee {\n    String name;\n    String dept;\n    int salary;\n\n    Employee(String name, String dept, int salary) {\n        this.name = name;\n        this.dept = dept;\n        this.salary = salary;\n    }\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        List<Employee> list = new ArrayList<>();\n        for (int i = 0; i < n; i++) list.add(new Employee(sc.next(), sc.next(), sc.nextInt()));\n\n        // Group by department with a stream and print count and total\n    }\n}\n`,
    solution: `${impStreams}\nclass Employee {\n    String name;\n    String dept;\n    int salary;\n\n    Employee(String name, String dept, int salary) {\n        this.name = name;\n        this.dept = dept;\n        this.salary = salary;\n    }\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        List<Employee> list = new ArrayList<>();\n        for (int i = 0; i < n; i++) list.add(new Employee(sc.next(), sc.next(), sc.nextInt()));\n        Map<String, List<Employee>> byDept = list.stream()\n                .collect(Collectors.groupingBy(e -> e.dept, TreeMap::new, Collectors.toList()));\n        for (Map.Entry<String, List<Employee>> entry : byDept.entrySet()) {\n            long total = entry.getValue().stream().mapToLong(e -> e.salary).sum();\n            System.out.println(entry.getKey() + " " + entry.getValue().size() + " " + total);\n        }\n    }\n}\n`,
    check: {
      run: {
        language: "java",
        tests: [
          { stdin: "4\nAsha IT 50000\nRavi HR 30000\nMeera IT 60000\nJohn HR 35000", expected: "HR 2 65000\nIT 2 110000" },
          { stdin: "3\nA Sales 100\nB Admin 200\nC Sales 300", expected: "Admin 1 200\nSales 2 400" },
          { stdin: "1\nSolo Ops 999", expected: "Ops 1 999", hidden: true },
          { stdin: "3\nX Dev 2000000000\nY Dev 2000000000\nZ Art 1", expected: "Art 1 1\nDev 2 4000000000", hidden: true },
        ],
      },
      rules: [
        { match: String.raw`\.stream\s*\(\s*\)`, message: "Uses a stream" },
        { match: String.raw`Collectors\s*\.\s*groupingBy\s*\(|\bgroupingBy\s*\(`, message: "Groups with Collectors.groupingBy" },
      ],
    },
  },
] satisfies ExerciseSeed[];
