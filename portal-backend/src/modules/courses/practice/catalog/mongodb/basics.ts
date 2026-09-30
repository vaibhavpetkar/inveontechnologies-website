import type { PracticeUnit } from "../../types.js";
import { code, has, hasNot, jq, key, mq } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "Documents, collections and BSON",
  summary: "the document model, databases and collections, mongosh, _id and ObjectId, and BSON data types",
  reading: code`## What MongoDB is

MongoDB is a document database. Instead of rows and columns, it stores documents: JSON-like objects with fields and values. A document can hold nested objects and arrays, so one document often holds what would need two or three joined tables in MySQL.

` + "```javascript" + code`
{
  _id: ObjectId("66a1f0c2e4b0a1b2c3d4e5f6"),
  name: "Priya Sharma",
  rollNo: 42,
  skills: ["Java", "SQL"],
  address: { city: "Pune", pin: "411001" }
}
` + "```" + code`

Three words to learn first:

- Database: a group of collections, like college or shop.
- Collection: a group of documents, like students or orders. It is the MongoDB version of a table, but documents in one collection don't all need the same fields.
- Document: one record, stored as BSON (Binary JSON) on disk.

## The mongosh shell

mongosh is the official shell. Start MongoDB 7 on your laptop with Docker (docker run -d -p 27017:27017 mongo:7) or use a free Atlas cluster, then connect with mongosh. The most used shell helpers:

` + "```javascript" + code`
show dbs                 // list databases
use college              // switch to (or create) a database
show collections         // list collections in the current database
db.students.insertOne({ name: "Arjun", rollNo: 1 })
db.students.find()
` + "```" + code`

A database or collection is created lazily: use college does nothing on disk until you insert the first document. db always points to the current database, and db.students is the students collection inside it.

## _id and ObjectId

Every document has an _id field that is unique in its collection. If you don't give one, the driver adds an ObjectId: a 12-byte value that contains the creation time, so ObjectId().getTimestamp() tells you when it was made. You can use your own _id (a roll number, an email, "EMP001") as long as it is unique and never changes.

## BSON types

BSON has more types than JSON. The ones you'll use every day:

- String: "Pune". Always UTF-8.
- Int32 / Int64 / Double: mongosh stores a whole number like 42 as an Int32 and 9.5 as a Double. Write NumberInt(42), NumberLong("9000000000") or Double(42) when you want to be explicit about the type.
- Decimal128: exact decimals for money: Decimal128("499.99"). Doubles can't hold 0.1 exactly, so never store prices as doubles in a billing system.
- Boolean: true / false.
- Date: new Date("2026-01-15") or ISODate("2026-01-15T10:30:00Z"). Stored in UTC. Don't store dates as strings like "15/01/2026": you can't sort or compare them properly.
- Array and embedded document: ["a", "b"] and { city: "Pune" }.
- ObjectId and null.

## Inserting documents

` + "```javascript" + code`
db.products.insertMany([
  { name: "Pen", price: 10, category: "stationery" },
  { name: "Notebook", price: 45, category: "stationery" },
  { name: "Mouse", price: 399, category: "electronics" }
])
db.products.countDocuments({ category: "stationery" })   // 2
` + "```" + code`

insertOne returns the new _id (insertedId); insertMany returns insertedIds. The old insert(), count() and remove() helpers are deprecated: use insertOne / insertMany, countDocuments and deleteOne / deleteMany.

## Common mistakes

- Typing a field name differently in two documents (rollNo vs rollno). MongoDB won't complain; your queries just stop finding data. Field names are case-sensitive.
- Storing numbers as strings ("42"). A query for { rollNo: 42 } will not match "42".
- Storing dates as strings. Use Date.
- Forgetting the square brackets in insertMany: it takes an array.
- Using a document as a giant list that keeps growing forever. A single document is limited to 16 MB.

## How your assignments are checked

Most questions ask you to upload a .js file of mongosh commands. The checker reads the file (comments are ignored) and looks for the right methods, field names and operators, so write the queries exactly as you would type them in mongosh. Key names may be quoted or unquoted. Some questions are small Node.js programs that read JSON from standard input with require("fs").readFileSync(0, "utf8") and print a result; those are really run against test cases, including hidden ones.`,
  questions: [
    mq("Create a database and insert a student", "Switch to a database called college and insert one student into the students collection.", ["Switch with use college", "Insert one document into db.students with insertOne", "The document has the fields name (a string), rollNo (a number) and marks (a number)"], code`use college
db.students.insertOne({ name: "Priya Sharma", rollNo: 42, marks: 88 })
`, [has(String.raw`\buse\s+college\b`, "Switches to the college database"), has(String.raw`db\.students\.insertOne\s*\(\s*\{`, "Inserts one document into students with insertOne"), has(key("name") + String.raw`\s*["']`, "Gives the student a name string"), has(key("rollNo") + String.raw`\s*\d`, "Stores rollNo as a number, not a string"), has(key("marks") + String.raw`\s*\d`, "Stores marks as a number")]),

    mq("Insert many products", "Add three products to a shop in one call.", ["Use the shop database", "Call db.products.insertMany with an array of three documents", "Each product has name, price (a number) and category"], code`use shop
db.products.insertMany([
  { name: "Pen", price: 10, category: "stationery" },
  { name: "Notebook", price: 45, category: "stationery" },
  { name: "Wireless mouse", price: 399, category: "electronics" }
])
`, [has(String.raw`\buse\s+shop\b`, "Switches to the shop database"), has(String.raw`db\.products\.insertMany\s*\(\s*\[`, "Calls insertMany with an array"), has(String.raw`(` + key("price") + String.raw`\s*\d[\s\S]*){3}`, "Has three products with a numeric price"), has(String.raw`(` + key("category") + String.raw`[\s\S]*){3}`, "Every product has a category"), hasNot(String.raw`\.insert\s*\(`, "Does not use the deprecated insert()")]),

    mq("Nested address and phone list", "Insert a customer whose address is an embedded document and whose phone numbers are an array.", ["Insert into db.customers with insertOne", "Give the customer a name", "address is an embedded document with city and pin", "phones is an array of strings"], code`db.customers.insertOne({
  name: "Rahul Verma",
  address: { street: "12 MG Road", city: "Bengaluru", pin: "560001" },
  phones: ["9876543210", "9123456780"]
})
`, [has(String.raw`db\.customers\.insertOne\s*\(`, "Inserts into customers with insertOne"), has(key("address") + String.raw`\s*\{`, "address is an embedded document"), has(key("city"), "The address has a city"), has(key("pin"), "The address has a pin"), has(key("phones") + String.raw`\s*\[\s*["']`, "phones is an array of strings")]),

    mq("Pick the right BSON types", "Insert an order using proper BSON types for the date, the money amount, a whole-number quantity and a yes/no flag.", ["Insert into db.orders", "orderDate: a real date (new Date(...) or ISODate(...)), not a string", "total: Decimal128(\"...\") for exact money", "qty: NumberInt(...)", "paid: a boolean"], code`db.orders.insertOne({
  orderNo: "ORD-1001",
  orderDate: new Date("2026-01-15T10:30:00Z"),
  total: Decimal128("1499.50"),
  qty: NumberInt(3),
  paid: true
})
`, [has(String.raw`db\.orders\.insertOne\s*\(`, "Inserts one order"), has(key("orderDate") + String.raw`\s*(new\s+Date|ISODate)\s*\(`, "orderDate is a Date"), has(key("total") + String.raw`\s*(Decimal128|NumberDecimal)\s*\(`, "total is a Decimal128"), has(key("qty") + String.raw`\s*NumberInt\s*\(`, "qty is a 32-bit int"), has(key("paid") + String.raw`\s*(true|false)\b`, "paid is a boolean")], "intermediate"),

    mq("Your own _id", "Employees already have unique codes like EMP001. Use the code itself as the _id instead of an ObjectId.", ["Insert two employees into db.employees with insertMany", "Set _id to the employee code string (EMP001, EMP002)", "Each has a name and a dept"], code`db.employees.insertMany([
  { _id: "EMP001", name: "Kavya Nair", dept: "HR" },
  { _id: "EMP002", name: "Imran Khan", dept: "IT" }
])
`, [has(String.raw`db\.employees\.insertMany\s*\(\s*\[`, "Inserts with insertMany"), has(String.raw`(` + key("_id") + String.raw`\s*["']EMP\d+["'][\s\S]*){2}`, "Both employees use their code as _id"), has(key("dept"), "Each employee has a dept"), hasNot(String.raw`ObjectId\s*\(`, "Does not generate ObjectIds")]),

    mq("Count documents", "Count all students, and then only the students from Pune.", ["Use db.students.countDocuments({}) for all", "Use countDocuments with a filter on city for Pune", "Don't use the deprecated count()"], code`db.students.countDocuments({})
db.students.countDocuments({ city: "Pune" })
`, [has(String.raw`countDocuments\s*\(\s*\{\s*\}\s*\)`, "Counts every student with an empty filter"), has(String.raw`countDocuments\s*\(\s*\{\s*` + key("city") + String.raw`\s*["']Pune["']`, "Counts the students from Pune"), hasNot(String.raw`\.count\s*\(`, "Does not use the deprecated count()")]),

    mq("Look around and clean up", "Explore a database, then remove a scratch collection.", ["List the databases", "Switch to the college database", "List its collections", "Drop the collection named temp"], code`show dbs
use college
show collections
db.temp.drop()
`, [has(String.raw`show\s+(dbs|databases)`, "Lists the databases"), has(String.raw`\buse\s+college\b`, "Switches to college"), has(String.raw`show\s+collections|getCollectionNames\s*\(`, "Lists the collections"), has(String.raw`db\.temp\.drop\s*\(\s*\)`, "Drops the temp collection")]),

    mq("When was this document created?", "An ObjectId contains its creation time. Find a student by its ObjectId and read the time out of the id.", ["Find one student with findOne and _id: ObjectId(\"66a1f0c2e4b0a1b2c3d4e5f6\")", "Store a new ObjectId() in a variable called id", "Print id.getTimestamp()"], code`db.students.findOne({ _id: ObjectId("66a1f0c2e4b0a1b2c3d4e5f6") })
const id = ObjectId()
id.getTimestamp()
`, [has(String.raw`findOne\s*\(\s*\{\s*` + key("_id") + String.raw`\s*ObjectId\s*\(\s*["']66a1f0c2e4b0a1b2c3d4e5f6["']`, "Finds the student by its ObjectId"), has(String.raw`\bid\s*=\s*(new\s+)?ObjectId\s*\(\s*\)`, "Creates a new ObjectId in id"), has(String.raw`\bid\.getTimestamp\s*\(\s*\)`, "Reads the creation time")], "intermediate"),

    jq("Describe the field types", "MongoDB stores each value with a type. Read one JSON document and print every top-level field with its BSON-style type.", ["Input: one line, a JSON object", "For each field in order print field: type", "Types: string, int (a whole number), double (a number with decimals), bool, array, object, null", "Print only these lines"], code`const doc = JSON.parse(require("fs").readFileSync(0, "utf8"));
for (const [field, value] of Object.entries(doc)) {
  let type;
  if (value === null) type = "null";
  else if (Array.isArray(value)) type = "array";
  else if (typeof value === "object") type = "object";
  else if (typeof value === "number") type = Number.isInteger(value) ? "int" : "double";
  else if (typeof value === "boolean") type = "bool";
  else type = "string";
  console.log(field + ": " + type);
}
`, [['{"name":"Asha","age":21,"cgpa":8.4}', "name: string\nage: int\ncgpa: double"], ['{"skills":["C","SQL"],"address":{"city":"Pune"},"active":true}', "skills: array\naddress: object\nactive: bool"]], [['{"middleName":null}', "middleName: null"], ['{"a":0,"b":-2.5,"c":"","d":[],"e":false}', "a: int\nb: double\nc: string\nd: array\ne: bool"]], { match: "exact", level: "intermediate" }),

    jq("Count students in a city", "Mimic countDocuments({ city }) in plain JavaScript: read a list of student documents and count the ones from one city.", ["Input line 1: a JSON array of student documents", "Input line 2: a city name", "Output: how many documents have exactly that city (case matters, like in MongoDB)"], code`const [json, city] = require("fs").readFileSync(0, "utf8").trim().split("\n");
const students = JSON.parse(json);
const count = students.filter((s) => s.city === city.trim()).length;
console.log(count);
`, [['[{"name":"A","city":"Pune"},{"name":"B","city":"Delhi"},{"name":"C","city":"Pune"}]\nPune', "2"], ['[{"name":"A","city":"Pune"}]\nDelhi', "0"]], [['[{"name":"A","city":"pune"},{"name":"B","city":"Pune"}]\nPune', "1"], ['[{"name":"A"},{"name":"B","city":"Goa"}]\nGoa', "1"], ["[]\nPune", "0"]]),
  ],
  quiz: [
    { q: "What is the MongoDB equivalent of a table in MySQL?", options: ["A document", "A collection", "A field", "A database"], answer: 1, why: "A collection groups documents the way a table groups rows." },
    { q: "In what format does MongoDB store documents on disk?", options: ["Plain JSON text", "XML", "BSON", "CSV"], answer: 2, why: "BSON is a binary form of JSON with extra types like Date, ObjectId and Decimal128." },
    { q: "When is the database created after you type use shop in mongosh?", options: ["Immediately", "When the first document is inserted into a collection in it", "Only after db.createDatabase()", "Never; you must create it in Atlas"], answer: 1, why: "Databases and collections are created lazily, on the first write." },
    { q: "What happens if you insert a document without an _id?", options: ["The insert fails", "MongoDB leaves _id empty", "An ObjectId is generated and added as _id", "_id becomes the row number"], answer: 2, why: "Every document needs a unique _id, so the driver or server generates an ObjectId." },
    { q: "Which type should a product's price use in a billing system?", options: ["Double", "String", "Decimal128", "Int32"], answer: 2, why: "Decimal128 stores decimals exactly; doubles can't represent values like 0.1 exactly." },
    { q: "Which method replaces the deprecated db.collection.count()?", options: ["db.collection.size()", "db.collection.countDocuments()", "db.collection.length()", "db.collection.total()"], answer: 1, why: "countDocuments (or estimatedDocumentCount for a fast total) replaces count()." },
    { q: "What is the maximum size of a single BSON document?", options: ["1 MB", "4 MB", "16 MB", "No limit"], answer: 2, why: "A document can be at most 16 MB; big files belong in GridFS or object storage." },
    { q: "A collection has { rollNo: \"42\" }. What does db.students.find({ rollNo: 42 }) return?", options: ["That document", "Nothing, because the string \"42\" is not the number 42", "An error", "All documents"], answer: 1, why: "Queries compare type and value; a string never equals a number." },
    { q: "Why can ObjectId().getTimestamp() work without any date field?", options: ["It reads the server clock now", "The first 4 bytes of an ObjectId hold its creation time in seconds", "mongosh stores a hidden createdAt", "It only works on Atlas"], answer: 1, why: "An ObjectId starts with a 4-byte timestamp, followed by random and counter bytes." },
    { q: "Two documents in one collection are { name: \"A\", age: 20 } and { fullName: \"B\" }. What does MongoDB do?", options: ["Rejects the second insert", "Stores both; collections don't force one shape unless you add schema validation", "Renames fullName to name", "Adds age: null to the second one"], answer: 1, why: "Collections are schema-flexible by default; consistency is your job (or a $jsonSchema validator's)." },
  ],
};
