import type { PracticeUnit } from "../../types.js";
import { code, has, hasNot, jq, key, mq } from "./shared.js";

const MONGOOSE_STARTER = `const mongoose = require("mongoose");

// Write your code here
`;

export const modeling: PracticeUnit = {
  key: "modeling",
  title: "Schema design and Mongoose",
  summary: "embedding vs referencing, $jsonSchema validation, and Mongoose schemas, validation, models, queries and populate in Node.js",
  reading: code`## Design for how the data is read

In SQL you normalise first and join later. In MongoDB you design around the questions the app asks most often: data that is read together should usually be stored together. The two tools are embedding and referencing.

## Embedding

Put related data inside the parent document:

` + "```javascript" + code`
{
  title: "Learning MongoDB",
  author: "Asha",
  comments: [
    { user: "Ravi", text: "Nice post", at: ISODate("2026-02-01T10:00:00Z") },
    { user: "Meena", text: "Thanks!", at: ISODate("2026-02-01T11:00:00Z") }
  ]
}
` + "```" + code`

One read returns the post and its comments, and updating both is atomic (a single-document write). Embed when the child belongs to one parent, is usually shown with it, and the list stays small ("one-to-few"): addresses of a user, line items of an order.

## Referencing

Store the other document's _id and fetch it separately (or with $lookup):

` + "```javascript" + code`
db.authors.insertOne({ _id: ObjectId("66b000000000000000000001"), name: "R. K. Narayan" })
db.books.insertOne({ title: "Malgudi Days", authorId: ObjectId("66b000000000000000000001") })
` + "```" + code`

Reference when the child list is large or unbounded (a user's orders, a post's page views), when the child is shared by many parents (an author of many books, a product in many orders), or when the child is updated on its own a lot. Remember the 16 MB document limit: an array that grows forever is a design bug.

A common middle way is to embed a small copy of the fields you always show (the author's name) and keep a reference for the rest. This duplication is fine as long as you know when to update the copies.

## Validating in the database

Collections are flexible, but you can ask MongoDB to reject bad documents with a $jsonSchema validator:

` + "```javascript" + code`
db.createCollection("students", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "email"],
      properties: {
        name: { bsonType: "string" },
        marks: { bsonType: "int", minimum: 0, maximum: 100 }
      }
    }
  }
})
` + "```" + code`

## Mongoose: schemas and models in Node.js

Mongoose (version 8) is the most used MongoDB library for Express apps. You describe each collection with a Schema, then compile it into a Model that has the query methods.

` + "```javascript" + code`
const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    marks: { type: Number, min: 0, max: 100 },
    dept: { type: String, enum: ["CSE", "ECE", "ME"] }
  },
  { timestamps: true }
);

const Student = mongoose.model("Student", studentSchema);   // collection: students

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Student.create({ name: "Asha", email: "ASHA@example.com", marks: 91, dept: "CSE" });
  const toppers = await Student.find({ dept: "CSE" }).sort({ marks: -1 }).limit(5).lean();
  console.log(toppers);
}
main();
` + "```" + code`

- Validators (required, min, max, enum, match, custom validate functions) run on create and save. For updates pass { runValidators: true }.
- unique: true is not a validator: it creates a unique index, and a duplicate fails with error code 11000.
- timestamps: true adds createdAt and updatedAt automatically.
- lean() returns plain objects instead of full Mongoose documents: faster for read-only API responses.
- Keep the connection string in an environment variable, never in the code or on GitHub.

## References and populate

` + "```javascript" + code`
const bookSchema = new mongoose.Schema({
  title: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "Author" }
});
const books = await Book.find().populate("author", "name");
` + "```" + code`

populate runs a second query and replaces each id with the author document. It's convenient, but it is still two queries: don't populate deep chains in a loop.

## Common mistakes

- Forgetting await: you log a Promise (or a Query) instead of data.
- Calling mongoose.model twice with the same name while hot-reloading.
- Embedding an unbounded array (all orders of a customer) in one document.
- Relying on Mongoose validation only while other scripts write to the same collection: add a $jsonSchema validator too.

## How your assignments are checked

Schema and Mongoose questions are uploaded as .js files and read by the checker, which looks for the schema options, validators, model and query calls. Two Node.js programs are run against test cases: one validates documents like a schema, the other joins two collections like populate.`,
  questions: [
    mq("Embed comments in a post", "Comments are few and always shown with their post. Store them embedded.", ["db.posts.insertOne with title and author", "comments: an array of at least two embedded documents, each with user, text and at: new Date()"], code`db.posts.insertOne({
  title: "Learning MongoDB",
  author: "Asha",
  comments: [
    { user: "Ravi", text: "Nice post", at: new Date() },
    { user: "Meena", text: "Very useful", at: new Date() }
  ]
})
`, [has(String.raw`db\.posts\.insertOne\s*\(`, "Inserts a post"), has(key("comments") + String.raw`\s*\[\s*\{`, "comments is an array of documents"), has(String.raw`(` + key("user") + String.raw`[\s\S]*){2}`, "Has at least two comments with a user"), has(key("at") + String.raw`\s*(new\s+Date|ISODate)\s*\(`, "Each comment has a date")]),

    mq("Reference authors from books", "An author writes many books and books are listed on their own. Store them in two collections linked by id.", ["Insert an author into db.authors with _id: ObjectId(\"66b000000000000000000001\") and a name", "insertMany two books into db.books, each with title and authorId set to the same ObjectId"], code`db.authors.insertOne({ _id: ObjectId("66b000000000000000000001"), name: "R. K. Narayan" })
db.books.insertMany([
  { title: "Malgudi Days", authorId: ObjectId("66b000000000000000000001") },
  { title: "Swami and Friends", authorId: ObjectId("66b000000000000000000001") }
])
`, [has(String.raw`db\.authors\.insertOne\s*\(\s*\{\s*` + key("_id") + String.raw`\s*ObjectId\s*\(\s*["']66b000000000000000000001["']`, "Inserts the author with a fixed ObjectId"), has(String.raw`db\.books\.insertMany\s*\(\s*\[`, "Inserts the books with insertMany"), has(String.raw`(` + key("authorId") + String.raw`\s*ObjectId\s*\(\s*["']66b000000000000000000001["'][\s\S]*){2}`, "Both books reference the author"), hasNot(key("books") + String.raw`\s*\[`, "Doesn't embed a books array in the author")], "intermediate"),

    mq("Validate with $jsonSchema", "Make MongoDB itself reject students without a name or email, or with marks outside 0 to 100.", ["db.createCollection(\"students\", { validator: { $jsonSchema: { ... } } })", "bsonType \"object\" and required [\"name\", \"email\"]", "properties: name and email with bsonType \"string\", marks with minimum 0 and maximum 100"], code`db.createCollection("students", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "email"],
      properties: {
        name: { bsonType: "string" },
        email: { bsonType: "string" },
        marks: { bsonType: "int", minimum: 0, maximum: 100 }
      }
    }
  }
})
`, [has(String.raw`db\.createCollection\s*\(\s*["']students["']`, "Creates the students collection"), has(key("validator") + String.raw`\s*\{\s*` + key("$jsonSchema"), "Adds a $jsonSchema validator"), has(key("required") + String.raw`\s*\[\s*["']name["']\s*,\s*["']email["']\s*\]`, "Requires name and email"), has(key("minimum") + String.raw`\s*0[\s\S]*` + key("maximum") + String.raw`\s*100`, "Limits marks to 0-100")], "intermediate"),

    mq("Connect with Mongoose", "Write the connection code for an Express app.", ["require mongoose", "An async function connectDB that awaits mongoose.connect(process.env.MONGODB_URI)", "Log \"MongoDB connected\" on success; in a catch, log the error and call process.exit(1)", "Don't hard-code the connection string"], code`const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed", err);
    process.exit(1);
  }
}

module.exports = connectDB;
`, [has(String.raw`require\s*\(\s*["']mongoose["']\s*\)`, "Requires mongoose"), has(String.raw`await\s+mongoose\.connect\s*\(\s*process\.env\.\w+`, "Awaits connect with an environment variable"), has(String.raw`catch\s*\(\s*\w+\s*\)[\s\S]*process\.exit\s*\(\s*1\s*\)`, "Exits with code 1 on failure"), hasNot(String.raw`mongodb(\+srv)?://`, "Doesn't hard-code the connection string")], "basic", MONGOOSE_STARTER),

    mq("Student schema with validation", "Define a Mongoose model for students with sensible validation.", ["name: String, required, trim", "email: String, required, unique, lowercase", "marks: Number with min 0 and max 100", "dept: String with enum [\"CSE\", \"ECE\", \"ME\"]", "Schema option timestamps: true; export mongoose.model(\"Student\", studentSchema)"], code`const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    marks: { type: Number, min: 0, max: 100 },
    dept: { type: String, enum: ["CSE", "ECE", "ME"] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);
`, [has(String.raw`new\s+(mongoose\.)?Schema\s*\(`, "Creates a Schema"), has(key("name") + String.raw`\s*\{[^}]*` + key("required") + String.raw`\s*true`, "name is required"), has(key("email") + String.raw`\s*\{[^}]*` + key("unique") + String.raw`\s*true`, "email is unique"), has(key("marks") + String.raw`\s*\{[^}]*` + key("min") + String.raw`\s*0[^}]*` + key("max") + String.raw`\s*100`, "marks has min 0 and max 100"), has(key("enum") + String.raw`\s*\[\s*["']CSE["']`, "dept has an enum"), has(key("timestamps") + String.raw`\s*true`, "Adds timestamps"), has(String.raw`mongoose\.model\s*\(\s*["']Student["']`, "Compiles the Student model")], "intermediate", MONGOOSE_STARTER),

    mq("Create and query with a model", "Use the Student model inside an async function.", ["Student = require(\"./models/Student\")", "await Student.create(...) with name, email, marks and dept", "await Student.find({ dept: \"CSE\" }).sort({ marks: -1 }).limit(5).lean()", "console.log the result"], code`const Student = require("./models/Student");

async function run() {
  await Student.create({ name: "Asha", email: "asha@example.com", marks: 91, dept: "CSE" });
  const toppers = await Student.find({ dept: "CSE" }).sort({ marks: -1 }).limit(5).lean();
  console.log(toppers);
}

run();
`, [has(String.raw`require\s*\(\s*["']\./models/Student["']\s*\)`, "Imports the model"), has(String.raw`await\s+Student\.create\s*\(\s*\{`, "Awaits Student.create"), has(String.raw`await\s+Student\.find\s*\(\s*\{\s*` + key("dept") + String.raw`\s*["']CSE["']\s*\}\s*\)\s*\.sort\s*\(\s*\{\s*` + key("marks") + String.raw`\s*-1\s*\}\s*\)\s*\.limit\s*\(\s*5\s*\)`, "Finds the top 5 CSE students"), has(String.raw`\.lean\s*\(\s*\)`, "Uses lean() for plain objects"), has(String.raw`async\s+function|async\s*\(`, "Runs inside an async function")], "intermediate", MONGOOSE_STARTER),

    mq("Books with populate", "Link books to authors with a Mongoose ref and load the author's name.", ["bookSchema with title: String and author: { type: mongoose.Schema.Types.ObjectId, ref: \"Author\" }", "Book = mongoose.model(\"Book\", bookSchema)", "In an async function: await Book.find().populate(\"author\", \"name\")"], code`const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "Author" }
});
const Book = mongoose.model("Book", bookSchema);

async function listBooks() {
  const books = await Book.find().populate("author", "name");
  return books;
}

module.exports = { Book, listBooks };
`, [has(String.raw`(mongoose\.)?Schema\.Types\.ObjectId`, "author is an ObjectId"), has(key("ref") + String.raw`\s*["']Author["']`, "References the Author model"), has(String.raw`mongoose\.model\s*\(\s*["']Book["']`, "Compiles the Book model"), has(String.raw`await\s+Book\.find\s*\([^)]*\)\s*\.populate\s*\(\s*["']author["']`, "Populates author")], "intermediate", MONGOOSE_STARTER),

    mq("Update with validators", "Update a student's marks through Mongoose so the schema's min and max are still checked.", ["In an async function updateMarks(id, marks)", "await Student.findByIdAndUpdate(id, { $set: { marks } }, { new: true, runValidators: true })", "return the updated student"], code`const Student = require("./models/Student");

async function updateMarks(id, marks) {
  const student = await Student.findByIdAndUpdate(id, { $set: { marks } }, { new: true, runValidators: true });
  return student;
}

module.exports = updateMarks;
`, [has(String.raw`await\s+Student\.findByIdAndUpdate\s*\(\s*id`, "Awaits findByIdAndUpdate with the id"), has(key("$set") + String.raw`\s*\{\s*marks`, "Sets marks"), has(key("runValidators") + String.raw`\s*true`, "Runs the validators on update"), has(key("new") + String.raw`\s*true|` + key("returnDocument") + String.raw`\s*["']after["']`, "Returns the updated document")], "advanced", MONGOOSE_STARTER),

    mq("Custom phone validator", "Indian mobile numbers have 10 digits. Add a custom validator with a clear message.", ["A Schema with phone: { type: String, required: true, validate: { validator, message } }", "validator: a function that returns true only for exactly 10 digits (use a regex test)", "message: \"Phone must have 10 digits\"", "Export mongoose.model(\"Contact\", contactSchema)"], code`const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: {
    type: String,
    required: true,
    validate: {
      validator: (value) => /^\d{10}$/.test(value),
      message: "Phone must have 10 digits"
    }
  }
});

module.exports = mongoose.model("Contact", contactSchema);
`, [has(key("validate") + String.raw`\s*\{`, "Adds a validate option"), has(key("validator") + String.raw`\s*(\(|function|\w+\s*=>)`, "Gives a validator function"), has(String.raw`\\d\{10\}|\[0-9\]\{10\}`, "Checks for exactly 10 digits"), has(String.raw`\.test\s*\(`, "Uses a regex test"), has(key("message") + String.raw`\s*["']Phone must have 10 digits["']`, "Sets the error message")], "advanced", MONGOOSE_STARTER),

    jq("Validate documents like a schema", "Check each student document against these rules: name and email are required strings, and marks, if present, is a number from 0 to 100.", ["Input: one line, a JSON array of documents", "For each document print ok, or the first problem found in this order: missing name, missing email, bad marks", "A field counts as missing if it is absent or not a non-empty string"], code`const docs = JSON.parse(require("fs").readFileSync(0, "utf8"));
const filled = (v) => typeof v === "string" && v.length > 0;
for (const d of docs) {
  if (!filled(d.name)) console.log("missing name");
  else if (!filled(d.email)) console.log("missing email");
  else if ("marks" in d && !(typeof d.marks === "number" && d.marks >= 0 && d.marks <= 100)) console.log("bad marks");
  else console.log("ok");
}
`, [['[{"name":"Asha","email":"a@x.com","marks":90},{"email":"b@x.com"},{"name":"Ravi","email":"r@x.com","marks":120}]', "ok\nmissing name\nbad marks"]], [['[{"name":"A","email":""}]', "missing email"], ['[{"name":"A","email":"a@x"},{"name":"B","email":"b@x","marks":"50"},{"name":"C","email":"c@x","marks":0}]', "ok\nbad marks\nok"], ['[{"name":7,"email":"a"}]', "missing name"]], { match: "exact", level: "intermediate" }),

    jq("Simulate populate", "Join books to authors by id, the way populate(\"author\") does.", ["Input line 1: a JSON array of authors with _id and name", "Line 2: a JSON array of books with title and author (an author _id)", "Output: one line per book: title by name; if the author id doesn't exist print title by unknown"], code`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const authors = new Map(JSON.parse(lines[0]).map((a) => [a._id, a.name]));
for (const book of JSON.parse(lines[1])) {
  console.log(book.title + " by " + (authors.get(book.author) || "unknown"));
}
`, [['[{"_id":"a1","name":"Narayan"},{"_id":"a2","name":"Tagore"}]\n[{"title":"Malgudi Days","author":"a1"},{"title":"Gitanjali","author":"a2"}]', "Malgudi Days by Narayan\nGitanjali by Tagore"]], [['[]\n[{"title":"X","author":"a9"}]', "X by unknown"], ['[{"_id":"a1","name":"N"}]\n[{"title":"A","author":"a1"},{"title":"B","author":"a1"}]', "A by N\nB by N"]], { match: "exact", level: "intermediate" }),
  ],
  quiz: [
    { q: "When is embedding usually the right choice?", options: ["When the child list grows without limit", "When the child belongs to one parent, is read with it and stays small", "When many parents share the child", "Never; always reference"], answer: 1, why: "One-to-few data read together is ideal for embedding." },
    { q: "Why is embedding every order inside the customer document a bad idea?", options: ["Orders can't be embedded", "The array grows forever and can hit the 16 MB document limit", "It breaks _id", "Embedded arrays can't be queried"], answer: 1, why: "Unbounded arrays make documents huge and slow; reference orders instead." },
    { q: "What does { timestamps: true } do in a Mongoose schema?", options: ["Adds createdAt and updatedAt and maintains them", "Adds a TTL index", "Stores dates in local time", "Validates date fields"], answer: 0, why: "Mongoose sets createdAt on insert and updates updatedAt on every save/update." },
    { q: "Which collection does mongoose.model(\"Student\", schema) use by default?", options: ["Student", "student", "students", "StudentCollection"], answer: 2, why: "Mongoose lower-cases and pluralises the model name." },
    { q: "What does .lean() do on a Mongoose query?", options: ["Deletes unused fields", "Returns plain JavaScript objects instead of Mongoose documents", "Adds an index", "Limits results to 10"], answer: 1, why: "Lean results skip hydration, so they're faster and smaller for read-only use." },
    { q: "What does populate(\"author\") do?", options: ["Runs $lookup inside one query", "Runs a separate query and replaces author ids with the author documents", "Copies the author into the book collection", "Creates the author if missing"], answer: 1, why: "populate issues a second query for the referenced ids and swaps them in." },
    { q: "Where should the MongoDB connection string with the password live?", options: ["In the source code", "In an environment variable (for example from a .env file that isn't committed)", "In the README", "In a public config.json"], answer: 1, why: "Secrets in code end up in Git history; environment variables keep them out." },
    { q: "A schema has email: { unique: true }. Is this a validator that runs before saving?", options: ["Yes, like required", "No, it builds a unique index; duplicates fail at the database with error 11000", "Yes, but only on update", "It does nothing"], answer: 1, why: "unique is an index option, not a validator; the database rejects the duplicate." },
    { q: "Student.findByIdAndUpdate(id, { marks: 150 }) runs without errors although marks has max: 100. Why?", options: ["max only applies to strings", "Update validators are off by default; pass { runValidators: true }", "findByIdAndUpdate ignores the schema completely", "150 is converted to 100"], answer: 1, why: "Mongoose runs validators on save/create, but on updates only when runValidators is set." },
    { q: "A product page shows the product with its 5 latest reviews, and a product can get 20,000 reviews. Which design fits best?", options: ["Embed all reviews in the product", "Reviews in their own collection with productId (indexed), optionally embedding the 5 latest in the product", "One document holding every product and review", "Store reviews as a comma-separated string"], answer: 1, why: "The unbounded list is referenced; a small embedded subset (the subset pattern) keeps the page to one read." },
  ],
};
