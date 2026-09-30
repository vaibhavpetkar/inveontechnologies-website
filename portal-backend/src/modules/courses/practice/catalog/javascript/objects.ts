import type { PracticeUnit } from "../../types.js";
import { jq, js } from "./shared.js";

const usesClass = { match: String.raw`\bclass\s+\w+`, message: "Defines a class" };
const parsesJson = { match: String.raw`JSON\.parse\s*\(`, message: "Parses the input with JSON.parse" };

export const objects: PracticeUnit = {
  key: "objects",
  title: "Objects, classes and JSON",
  summary: "object literals, destructuring, spread, optional chaining, Object.entries, classes with private fields, inheritance, getters and JSON",
  reading: js`## Object literals

An object groups related values under names (keys).

\`\`\`javascript
const student = { name: "Asha", marks: 91, city: "Pune" };
student.name;          // dot notation
student["city"];       // bracket notation, needed when the key is in a variable
student.email = "asha@example.com"; // add a property
delete student.city;   // remove one
\`\`\`

- Shorthand: const name = "Ravi"; const s = { name }; is { name: "Ravi" }.
- Methods: { greet() { return "Hi " + this.name; } }.
- Reading a missing key gives undefined. Reading a key of undefined throws TypeError: Cannot read properties of undefined.

## Looping over objects

- Object.keys(obj), Object.values(obj) and Object.entries(obj) return arrays, so all the array methods work on them.
- for (const [key, value] of Object.entries(obj)) { ... } is the cleanest loop.
- Object.fromEntries(pairs) turns [[key, value], ...] back into an object.
- "key" in obj or Object.hasOwn(obj, "key") checks whether a key exists.

## Destructuring, spread and optional chaining

\`\`\`javascript
const { name, marks = 0, ...rest } = student;  // default and rest
const updated = { ...student, marks: 95 };      // copy with a change
const city = user.address?.city ?? "Unknown";   // safe access
\`\`\`

Spread makes a shallow copy: nested objects are still shared. For a deep copy use structuredClone(obj).

Objects are compared by reference: {} === {} is false. Two variables are equal only if they point to the same object.

## Classes

A class is a template for objects with the same shape and behaviour.

\`\`\`javascript
class Account {
  #balance = 0;                       // private field
  constructor(owner) {
    this.owner = owner;
  }
  deposit(amount) {
    if (amount <= 0) throw new Error("Amount must be positive");
    this.#balance += amount;
  }
  get balance() {                     // getter: read as account.balance
    return this.#balance;
  }
  static bank() {                     // called on the class: Account.bank()
    return "Inveon Bank";
  }
}
const acc = new Account("Asha");
acc.deposit(500);
console.log(acc.balance); // 500
\`\`\`

- constructor runs when you write new Account(...).
- Fields starting with # are truly private; code outside the class can't read them.
- Inheritance: class Savings extends Account { constructor(owner) { super(owner); ... } }. In a child constructor you must call super(...) before using this.
- A child class can override a method and still call the parent's with super.method().
- instanceof checks the class: acc instanceof Account.

Classes are built on prototypes: methods live once on Class.prototype and are shared by all instances.

## this

Inside a method called as obj.method(), this is obj. If you pass the method around as a plain function (setTimeout(obj.method, 100)), this is lost. Arrow functions don't have their own this, so they're great inside methods for callbacks, and a bad choice for the methods themselves.

## JSON

JSON is the text format APIs use to send data. It looks like JavaScript objects but is stricter: keys and strings must use double quotes, and there are no functions, comments, undefined or trailing commas.

\`\`\`javascript
const text = '{"name":"Asha","skills":["js","sql"]}';
const data = JSON.parse(text);           // text -> object
const back = JSON.stringify(data);       // object -> text
const pretty = JSON.stringify(data, null, 2); // indented with 2 spaces
\`\`\`

JSON.parse throws a SyntaxError on bad input, so wrap it in try/catch when the text comes from outside. JSON.stringify drops undefined values and functions, and turns Date objects into strings.

## Common mistakes

- Using an arrow function as a method and getting undefined from this.
- Forgetting new: Account("Asha") throws TypeError: Class constructor cannot be invoked without 'new'.
- Thinking spread makes a deep copy.
- Writing JSON by hand with single quotes.

## How your assignments are checked

Several questions give you JSON as input: read stdin and pass it to JSON.parse. Class questions check that you used class (and extends, get or # fields when asked) as well as the printed output. Outputs are compared exactly when the step says "print only".`,
  questions: [
    jq("Build an object and list its entries", "Read a name, age and city, build an object { name, age, city } (age as a number) and print every property with Object.entries, one per line as key: value.", ["Input: name, age and city separated by spaces", "Output: only three lines: name: <name>, age: <age>, city: <city>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const [name, ageText, city] = input.split(/\s+/);
const person = { name, age: Number(ageText), city };
for (const [key, value] of Object.entries(person)) {
  console.log(\`\${key}: \${value}\`);
}
`, [["Asha 21 Pune", "name: Asha\nage: 21\ncity: Pune"]], [["Ravi 30 Nagpur", "name: Ravi\nage: 30\ncity: Nagpur"], ["Om 5 Delhi", "name: Om\nage: 5\ncity: Delhi"]], { match: "exact", rules: [{ match: String.raw`Object\.entries\s*\(`, message: "Uses Object.entries" }] }),

    jq("Merge settings with spread", "Start from the default settings { theme: \"light\", fontSize: 14, language: \"en\" }. Each input line is key=value; numbers should become numbers. Merge them over the defaults with the spread operator and print the result with JSON.stringify.", ["Input: lines like theme=dark (there may be no lines)", "Output: only the merged object as JSON on one line"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const defaults = { theme: "light", fontSize: 14, language: "en" };
const overrides = Object.fromEntries(
  input
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const [key, value] = line.trim().split("=");
      return [key, Number.isNaN(Number(value)) ? value : Number(value)];
    }),
);
const settings = { ...defaults, ...overrides };
console.log(JSON.stringify(settings));
`, [["theme=dark", "{\"theme\":\"dark\",\"fontSize\":14,\"language\":\"en\"}"], ["fontSize=18\nlanguage=hi", "{\"theme\":\"light\",\"fontSize\":18,\"language\":\"hi\"}"]], [["", "{\"theme\":\"light\",\"fontSize\":14,\"language\":\"en\"}"], ["autosave=1\ntheme=blue", "{\"theme\":\"blue\",\"fontSize\":14,\"language\":\"en\",\"autosave\":1}"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`\{\s*\.\.\.\w+\s*,\s*\.\.\.\w+`, message: "Merges with { ...defaults, ...overrides }" }] }),

    jq("Stock value from JSON", "The input is a JSON array of products like {\"name\":\"Pen\",\"price\":10,\"qty\":5,\"inStock\":true}. Print the total value (price * qty) of the products that are in stock, and the number of products out of stock.", ["Input: a JSON array (it may span several lines)", "Output line 1: Stock value: <total>", "Output line 2: Out of stock: <count>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const products = JSON.parse(input);
const value = products.filter((p) => p.inStock).reduce((sum, p) => sum + p.price * p.qty, 0);
const outOfStock = products.filter((p) => !p.inStock).length;
console.log(\`Stock value: \${value}\`);
console.log(\`Out of stock: \${outOfStock}\`);
`, [["[{\"name\":\"Pen\",\"price\":10,\"qty\":5,\"inStock\":true},{\"name\":\"Book\",\"price\":150,\"qty\":2,\"inStock\":false}]", "Stock value: 50 Out of stock: 1"]], [["[]", "Stock value: 0 Out of stock: 0"], ["[\n {\"name\":\"Bag\",\"price\":799.5,\"qty\":2,\"inStock\":true},\n {\"name\":\"Cap\",\"price\":199,\"qty\":3,\"inStock\":true}\n]", "Stock value: 2196 Out of stock: 0"]], { rules: [parsesJson] }),

    jq("Pretty-print JSON", "Each input line is key=value. Build an object (values that are numbers become numbers; true and false become booleans) and print it with JSON.stringify(obj, null, 2).", ["Input: lines like name=Asha", "Output: only the pretty JSON, indented with 2 spaces"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const convert = (text) => {
  if (text === "true" || text === "false") return text === "true";
  return Number.isNaN(Number(text)) ? text : Number(text);
};
const obj = {};
for (const line of input.split("\n")) {
  const [key, value] = line.trim().split("=");
  obj[key] = convert(value);
}
console.log(JSON.stringify(obj, null, 2));
`, [["name=Asha\nage=21\nactive=true", "{\n  \"name\": \"Asha\",\n  \"age\": 21,\n  \"active\": true\n}"]], [["x=1", "{\n  \"x\": 1\n}"], ["city=Pune\nverified=false\npin=411001", "{\n  \"city\": \"Pune\",\n  \"verified\": false,\n  \"pin\": 411001\n}"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`JSON\.stringify\s*\([^)]*,\s*null\s*,\s*2\s*\)`, message: "Uses JSON.stringify(obj, null, 2)" }] }),

    jq("Group employees by department", "The input is a JSON array of employees like {\"name\":\"Asha\",\"dept\":\"IT\"}. Group them by department with reduce into an object, then print each department in alphabetical order with its names in input order.", ["Input: a JSON array", "Output: only lines like IT: Asha, Ravi"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const employees = JSON.parse(input);
const groups = employees.reduce((acc, e) => {
  (acc[e.dept] ??= []).push(e.name);
  return acc;
}, {});
for (const dept of Object.keys(groups).sort()) {
  console.log(\`\${dept}: \${groups[dept].join(", ")}\`);
}
`, [["[{\"name\":\"Asha\",\"dept\":\"IT\"},{\"name\":\"Ravi\",\"dept\":\"HR\"},{\"name\":\"Meena\",\"dept\":\"IT\"}]", "HR: Ravi\nIT: Asha, Meena"]], [["[{\"name\":\"Om\",\"dept\":\"Sales\"}]", "Sales: Om"], ["[{\"name\":\"B\",\"dept\":\"Ops\"},{\"name\":\"A\",\"dept\":\"Ops\"},{\"name\":\"C\",\"dept\":\"Admin\"}]", "Admin: C\nOps: B, A"]], { level: "intermediate", match: "exact", rules: [parsesJson, { match: String.raw`\.reduce\s*\(`, message: "Groups with reduce" }] }),

    jq("Bank account class", "Write a class BankAccount with a private #balance field, deposit(amount) and withdraw(amount) methods and a balance getter. withdraw must throw an Error(\"Insufficient funds\") when the amount is more than the balance. Process the commands and print the result of each.", ["Input: lines like deposit 500, withdraw 200 or balance", "Output: for deposit and withdraw print OK or the error message; for balance print Balance: <amount>", "Catch the error with try/catch"], js`const input = require("fs").readFileSync(0, "utf8").trim();
class BankAccount {
  #balance = 0;
  deposit(amount) {
    if (amount <= 0) throw new Error("Invalid amount");
    this.#balance += amount;
  }
  withdraw(amount) {
    if (amount > this.#balance) throw new Error("Insufficient funds");
    this.#balance -= amount;
  }
  get balance() {
    return this.#balance;
  }
}
const account = new BankAccount();
for (const line of input.split("\n")) {
  const [command, amountText] = line.trim().split(/\s+/);
  if (command === "balance") {
    console.log(\`Balance: \${account.balance}\`);
    continue;
  }
  try {
    account[command](Number(amountText));
    console.log("OK");
  } catch (err) {
    console.log(err.message);
  }
}
`, [["deposit 500\nwithdraw 200\nbalance", "OK\nOK\nBalance: 300"], ["withdraw 50\nbalance", "Insufficient funds\nBalance: 0"]], [["deposit 100\ndeposit 0\nwithdraw 100\nbalance", "OK\nInvalid amount\nOK\nBalance: 0"], ["deposit 1000\nwithdraw 1001\nwithdraw 1000\nbalance", "OK\nInsufficient funds\nOK\nBalance: 0"]], { level: "intermediate", match: "exact", rules: [usesClass, { match: String.raw`#balance`, message: "Keeps the balance in a private #balance field" }, { match: String.raw`\bget\s+balance\s*\(`, message: "Has a balance getter" }, { match: String.raw`throw\s+new\s+Error`, message: "Throws an Error" }] }),

    jq("Shapes with inheritance", "Write a base class Shape with a name and a describe() method that returns \"<name> with area <area to 2 decimals>\". Write Circle and Rectangle classes that extend Shape, call super(name) and override area(). Read the shapes and print describe() for each.", ["Input: lines like circle 2 or rectangle 3 4", "Output: one line per shape, like Circle with area 12.57 (use Math.PI)"], js`const input = require("fs").readFileSync(0, "utf8").trim();
class Shape {
  constructor(name) {
    this.name = name;
  }
  area() {
    return 0;
  }
  describe() {
    return \`\${this.name} with area \${this.area().toFixed(2)}\`;
  }
}
class Circle extends Shape {
  constructor(radius) {
    super("Circle");
    this.radius = radius;
  }
  area() {
    return Math.PI * this.radius ** 2;
  }
}
class Rectangle extends Shape {
  constructor(width, height) {
    super("Rectangle");
    this.width = width;
    this.height = height;
  }
  area() {
    return this.width * this.height;
  }
}
for (const line of input.split("\n")) {
  const [kind, ...nums] = line.trim().split(/\s+/);
  const [a, b] = nums.map(Number);
  const shape = kind === "circle" ? new Circle(a) : new Rectangle(a, b);
  console.log(shape.describe());
}
`, [["circle 2\nrectangle 3 4", "Circle with area 12.57\nRectangle with area 12.00"]], [["circle 1", "Circle with area 3.14"], ["rectangle 2.5 2\ncircle 0.5", "Rectangle with area 5.00\nCircle with area 0.79"]], { level: "intermediate", match: "exact", rules: [{ match: String.raw`class\s+Circle\s+extends\s+Shape`, message: "Circle extends Shape" }, { match: String.raw`class\s+Rectangle\s+extends\s+Shape`, message: "Rectangle extends Shape" }, { match: String.raw`super\s*\(`, message: "Calls super(...) in the constructor" }] }),

    jq("Temperature class with getters and a static method", "Write a class Temperature that stores Celsius. Add a getter fahrenheit, a setter fahrenheit that converts back to Celsius, and a static method fromFahrenheit(f) that returns a new Temperature. Read a value with its unit (C or F) and print both scales with 1 decimal.", ["Input: a number and a unit, like 100 C or 98.6 F", "Output: <celsius> C = <fahrenheit> F, both with 1 decimal"], js`const input = require("fs").readFileSync(0, "utf8").trim();
class Temperature {
  constructor(celsius) {
    this.celsius = celsius;
  }
  get fahrenheit() {
    return this.celsius * 9 / 5 + 32;
  }
  set fahrenheit(f) {
    this.celsius = (f - 32) * 5 / 9;
  }
  static fromFahrenheit(f) {
    const t = new Temperature(0);
    t.fahrenheit = f;
    return t;
  }
}
const [valueText, unit] = input.split(/\s+/);
const value = Number(valueText);
const t = unit.toUpperCase() === "F" ? Temperature.fromFahrenheit(value) : new Temperature(value);
console.log(\`\${t.celsius.toFixed(1)} C = \${t.fahrenheit.toFixed(1)} F\`);
`, [["100 C", "100.0 C = 212.0 F"], ["98.6 F", "37.0 C = 98.6 F"]], [["-40 F", "-40.0 C = -40.0 F"], ["0 c", "0.0 C = 32.0 F"]], { level: "advanced", rules: [{ match: String.raw`\bget\s+fahrenheit\s*\(`, message: "Has a fahrenheit getter" }, { match: String.raw`\bset\s+fahrenheit\s*\(`, message: "Has a fahrenheit setter" }, { match: String.raw`\bstatic\s+fromFahrenheit\s*\(`, message: "Has a static fromFahrenheit method" }] }),

    jq("Deep copy versus shallow copy", "The input is a JSON object with a nested address, like {\"name\":\"Asha\",\"address\":{\"city\":\"Pune\"}}. Make a shallow copy with spread and a deep copy with structuredClone. Change address.city to Mumbai in the shallow copy and to Delhi in the deep copy, then print the original's city, the shallow copy's city and the deep copy's city.", ["Input: a JSON object with address.city", "Output: only three lines: Original: <city>, Shallow: <city>, Deep: <city>"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const original = JSON.parse(input);
const shallow = { ...original };
const deep = structuredClone(original);
shallow.address.city = "Mumbai";
deep.address.city = "Delhi";
console.log(\`Original: \${original.address.city}\`);
console.log(\`Shallow: \${shallow.address.city}\`);
console.log(\`Deep: \${deep.address.city}\`);
`, [["{\"name\":\"Asha\",\"address\":{\"city\":\"Pune\"}}", "Original: Mumbai\nShallow: Mumbai\nDeep: Delhi"]], [["{\"address\":{\"city\":\"Goa\",\"pin\":403001}}", "Original: Mumbai\nShallow: Mumbai\nDeep: Delhi"]], { level: "advanced", match: "exact", rules: [{ match: String.raw`structuredClone\s*\(`, message: "Makes the deep copy with structuredClone" }, { match: String.raw`\{\s*\.\.\.\w+\s*\}`, message: "Makes the shallow copy with spread" }] }),

    jq("Safe access with optional chaining", "The input is a JSON array of users. Some have an address with a city, some have an address without a city, some have no address at all. Print each user's name and city, using ?. and ?? to print Unknown when the city is missing.", ["Input: a JSON array of users", "Output: only lines like Asha: Pune or Ravi: Unknown"], js`const input = require("fs").readFileSync(0, "utf8").trim();
const users = JSON.parse(input);
for (const user of users) {
  console.log(\`\${user.name}: \${user.address?.city ?? "Unknown"}\`);
}
`, [["[{\"name\":\"Asha\",\"address\":{\"city\":\"Pune\"}},{\"name\":\"Ravi\"}]", "Asha: Pune\nRavi: Unknown"]], [["[{\"name\":\"Om\",\"address\":{}}]", "Om: Unknown"], ["[{\"name\":\"Zoya\",\"address\":{\"city\":\"Delhi\"}},{\"name\":\"Kiran\",\"address\":null}]", "Zoya: Delhi\nKiran: Unknown"]], { match: "exact", rules: [{ match: String.raw`\?\.`, message: "Uses optional chaining (?.)" }, { match: String.raw`\?\?`, message: "Uses ?? for the default" }] }),
  ],
  quiz: [
    { q: "How do you read a property whose name is stored in the variable key?", options: ["obj.key", "obj[key]", "obj->key", "obj{key}"], answer: 1, why: "Bracket notation evaluates the expression; obj.key looks for a property literally named \"key\"." },
    { q: "What does Object.entries({ a: 1, b: 2 }) return?", options: ["[\"a\", \"b\"]", "[1, 2]", "[[\"a\", 1], [\"b\", 2]]", "{ a: 1, b: 2 }"], answer: 2, why: "entries returns an array of [key, value] pairs." },
    { q: "Which of these is valid JSON?", options: ["{name: \"Asha\"}", "{'name': 'Asha'}", "{\"name\": \"Asha\"}", "{\"name\": \"Asha\",}"], answer: 2, why: "JSON needs double-quoted keys and strings and allows no trailing comma." },
    { q: "In a child class constructor, what must you do before using this?", options: ["Call super(...)", "Call this.init()", "Declare the fields as static", "Nothing special"], answer: 0, why: "The parent constructor creates the object, so this is not available until super() has run." },
    { q: "What is special about a field named #balance in a class?", options: ["It is static", "It is private: code outside the class can't access it", "It is read-only", "It is copied by JSON.stringify"], answer: 1, why: "# fields are private to the class body; outside access is a SyntaxError." },
    { q: "What does user.address?.city give when user.address is undefined?", options: ["TypeError", "null", "undefined", "\"\""], answer: 2, why: "Optional chaining stops and returns undefined instead of throwing." },
    { q: "What does JSON.stringify({ a: undefined, b: 1 }) return?", options: ["'{\"a\":undefined,\"b\":1}'", "'{\"a\":null,\"b\":1}'", "'{\"b\":1}'", "It throws"], answer: 2, why: "Properties whose value is undefined (or a function) are left out." },
    { q: "What does this print?\n\nconst a = { n: { v: 1 } };\nconst b = { ...a };\nb.n.v = 2;\nconsole.log(a.n.v);", options: ["1", "2", "undefined", "TypeError"], answer: 1, why: "Spread is a shallow copy: b.n and a.n are the same nested object." },
    { q: "What does this print?\n\nconst obj = {\n  name: \"Asha\",\n  hi: () => \"Hi \" + this?.name,\n};\nconsole.log(obj.hi());   // run as a CommonJS module in Node", options: ["Hi Asha", "Hi undefined", "TypeError", "Hi obj"], answer: 1, why: "Arrow functions take this from the surrounding scope (module.exports, an empty object here), not from obj, so this.name is undefined." },
    { q: "What does this print?\n\nclass A { who() { return \"A\"; } hello() { return this.who(); } }\nclass B extends A { who() { return \"B\"; } }\nconsole.log(new B().hello());", options: ["A", "B", "undefined", "TypeError"], answer: 1, why: "this is the B instance, so the overridden who() in B runs even though hello is defined in A." },
  ],
};
