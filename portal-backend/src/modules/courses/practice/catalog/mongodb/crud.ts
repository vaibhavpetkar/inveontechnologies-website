import type { PracticeUnit } from "../../types.js";
import { code, has, hasNot, jq, key, mq } from "./shared.js";

export const crud: PracticeUnit = {
  key: "crud",
  title: "CRUD with mongosh",
  summary: "find with filters and projections, updateOne and updateMany with $set, $inc, $push and friends, upserts and deletes",
  reading: code`## Reading data: find and findOne

find(filter, projection) returns a cursor over every matching document; findOne returns the first match or null.

` + "```javascript" + code`
db.students.find()                                  // everything
db.students.find({ city: "Pune" })                  // equality filter
db.students.find({ city: "Pune", dept: "CSE" })     // both must match (AND)
db.students.findOne({ email: "asha@example.com" })
` + "```" + code`

A filter is itself a document: { field: value } means "field equals value". Several fields in one filter are combined with AND. To match inside an embedded document use dot notation in quotes: { "address.city": "Pune" }.

## Projections: choose the fields

The second argument says which fields come back. 1 means include, 0 means exclude. _id is always included unless you exclude it.

` + "```javascript" + code`
db.students.find({ dept: "CSE" }, { name: 1, marks: 1, _id: 0 })
` + "```" + code`

You can't mix 1 and 0 in one projection (except for _id). Projections save network time: don't pull a 50-field document to show two fields.

## Updating: operators, not whole documents

updateOne(filter, update) changes the first match; updateMany changes all matches. The update must use operators:

- $set: set fields (creates them if missing). { $set: { phone: "98765" } }
- $unset: remove a field. { $unset: { tempNote: "" } }
- $inc: add to a number (negative to subtract). { $inc: { marks: 5 } }
- $push: append to an array. { $push: { skills: "Docker" } }
- $addToSet: append only if not already there.
- $pull: remove matching values from an array.
- $each: push or addToSet several values at once. { $addToSet: { skills: { $each: ["Git", "Linux"] } } }

` + "```javascript" + code`
db.students.updateOne({ rollNo: 42 }, { $set: { phone: "9876543210" } })
db.students.updateMany({ dept: "CSE" }, { $inc: { marks: 5 } })
db.students.updateOne({ rollNo: 42 }, { $push: { skills: "Docker" } })
` + "```" + code`

The result tells you matchedCount and modifiedCount. If matchedCount is 0 your filter is wrong; if matched is 1 but modified is 0, the value was already the same.

Passing a plain document without operators to updateOne is an error in modern MongoDB ("Update document requires atomic operators"). To swap the whole document, use replaceOne(filter, newDoc), which keeps _id and drops every other old field.

## Upserts

An upsert updates a match or inserts a new document if nothing matched:

` + "```javascript" + code`
db.visits.updateOne(
  { page: "/home" },
  { $inc: { count: 1 }, $setOnInsert: { firstSeen: new Date() } },
  { upsert: true }
)
` + "```" + code`

$setOnInsert only applies when the upsert creates the document. findOneAndUpdate does the same kind of update but returns the document; pass { returnDocument: "after" } to get the new version. That is the standard way to build a counter for invoice numbers.

## Deleting

deleteOne(filter) removes the first match; deleteMany(filter) removes all. deleteMany({}) empties the collection (it keeps the indexes; drop() removes everything). Always run the same filter with find first to see what you are about to delete.

## Common mistakes

- updateMany({}, ...) with an empty filter updates every document. Double-check filters.
- Writing { $set: { address: { city: "Delhi" } } } replaces the whole address object. To change one sub-field write { $set: { "address.city": "Delhi" } }.
- $push on a field that is not an array fails.
- Forgetting quotes around dotted names: { address.city: "Pune" } is a syntax error in JavaScript.
- Using the deprecated update() and remove(): use the One/Many versions.

## How your assignments are checked

Upload a .js file with the mongosh commands. The checker looks for the right method (updateOne vs updateMany matters), the filter fields and the operators. Two programs are run: they read documents as JSON from standard input and apply an update in plain JavaScript, so you see exactly what MongoDB does to the data.`,
  questions: [
    mq("Filter and project", "Show the name and marks of every CSE student, without the _id.", ["Call db.students.find", "Filter: dept equals \"CSE\"", "Projection: name and marks included, _id excluded"], code`db.students.find({ dept: "CSE" }, { name: 1, marks: 1, _id: 0 })
`, [has(String.raw`db\.students\.find\s*\(\s*\{\s*` + key("dept") + String.raw`\s*["']CSE["']\s*\}`, "Filters on dept CSE"), has(key("name") + String.raw`\s*(1|true)`, "Includes name"), has(key("marks") + String.raw`\s*(1|true)`, "Includes marks"), has(key("_id") + String.raw`\s*(0|false)`, "Excludes _id")]),

    mq("Find one by email", "Fetch a single student by email, and a customer by the city inside their embedded address.", ["db.students.findOne with email \"asha@example.com\"", "db.customers.find with the embedded field address.city equal to \"Pune\" (dot notation, in quotes)"], code`db.students.findOne({ email: "asha@example.com" })
db.customers.find({ "address.city": "Pune" })
`, [has(String.raw`db\.students\.findOne\s*\(\s*\{\s*` + key("email"), "Uses findOne with the email"), has(String.raw`["']address\.city["']\s*:\s*["']Pune["']`, "Uses quoted dot notation for address.city"), has(String.raw`db\.customers\.find\s*\(`, "Searches customers")]),

    mq("Set a phone number", "Student 42 gave a new phone number. Update only that field.", ["updateOne with filter rollNo: 42", "Use $set to set phone to \"9876543210\""], code`db.students.updateOne({ rollNo: 42 }, { $set: { phone: "9876543210" } })
`, [has(String.raw`updateOne\s*\(\s*\{\s*` + key("rollNo") + String.raw`\s*42\s*\}`, "Updates the student with rollNo 42"), has(key("$set") + String.raw`\s*\{\s*` + key("phone"), "Uses $set on phone"), hasNot(String.raw`updateMany|replaceOne`, "Changes one document only, with updateOne")]),

    mq("Grace marks for a department", "Every student of the ECE department gets 5 grace marks.", ["updateMany with filter dept: \"ECE\"", "Use $inc to add 5 to marks"], code`db.students.updateMany({ dept: "ECE" }, { $inc: { marks: 5 } })
`, [has(String.raw`updateMany\s*\(\s*\{\s*` + key("dept") + String.raw`\s*["']ECE["']`, "Updates every ECE student"), has(key("$inc") + String.raw`\s*\{\s*` + key("marks") + String.raw`\s*5\b`, "Adds 5 to marks with $inc"), hasNot(key("$set") + String.raw`\s*\{\s*` + key("marks"), "Doesn't overwrite marks with $set")]),

    mq("Add skills without duplicates", "Add skills to a student's skills array.", ["Student rollNo 7: $push the skill \"Docker\"", "Student rollNo 8: $addToSet the skills \"Git\" and \"Linux\" in one update with $each"], code`db.students.updateOne({ rollNo: 7 }, { $push: { skills: "Docker" } })
db.students.updateOne({ rollNo: 8 }, { $addToSet: { skills: { $each: ["Git", "Linux"] } } })
`, [has(key("$push") + String.raw`\s*\{\s*` + key("skills") + String.raw`\s*["']Docker["']`, "Pushes Docker"), has(key("$addToSet") + String.raw`\s*\{\s*` + key("skills") + String.raw`\s*\{\s*` + key("$each") + String.raw`\s*\[`, "Uses $addToSet with $each"), has(String.raw`["']Git["']\s*,\s*["']Linux["']`, "Adds Git and Linux"), has(String.raw`(updateOne[\s\S]*){2}`, "Makes two updateOne calls")], "intermediate"),

    mq("Remove a skill and a field", "Clean up a student record.", ["Student rollNo 7: remove \"Flash\" from skills with $pull", "Every student: remove the field tempNote with $unset (updateMany with an empty filter)"], code`db.students.updateOne({ rollNo: 7 }, { $pull: { skills: "Flash" } })
db.students.updateMany({}, { $unset: { tempNote: "" } })
`, [has(key("$pull") + String.raw`\s*\{\s*` + key("skills") + String.raw`\s*["']Flash["']`, "Pulls Flash from skills"), has(String.raw`updateMany\s*\(\s*\{\s*\}`, "Updates all students"), has(key("$unset") + String.raw`\s*\{\s*` + key("tempNote"), "Removes tempNote with $unset")], "intermediate"),

    mq("Change one sub-field", "A customer moved to Delhi. Change the city without losing the rest of the address.", ["updateOne on db.customers with filter email: \"rahul@example.com\"", "Use $set with \"address.city\": \"Delhi\"", "Don't replace the whole address object"], code`db.customers.updateOne({ email: "rahul@example.com" }, { $set: { "address.city": "Delhi" } })
`, [has(String.raw`db\.customers\.updateOne\s*\(`, "Updates one customer"), has(key("$set") + String.raw`\s*\{\s*["']address\.city["']\s*:\s*["']Delhi["']`, "Sets address.city with dot notation"), hasNot(key("address") + String.raw`\s*\{`, "Does not overwrite the whole address")], "intermediate"),

    mq("Count page visits with an upsert", "Keep a visit counter per page: increase it, or create it the first time.", ["db.visits.updateOne with filter page: \"/pricing\"", "$inc count by 1", "$setOnInsert firstSeen: new Date()", "Pass { upsert: true }"], code`db.visits.updateOne(
  { page: "/pricing" },
  { $inc: { count: 1 }, $setOnInsert: { firstSeen: new Date() } },
  { upsert: true }
)
`, [has(String.raw`db\.visits\.updateOne\s*\(`, "Uses updateOne on visits"), has(key("$inc") + String.raw`\s*\{\s*` + key("count") + String.raw`\s*1\b`, "Increments count"), has(key("$setOnInsert"), "Uses $setOnInsert for firstSeen"), has(key("upsert") + String.raw`\s*true`, "Turns on upsert")], "intermediate"),

    mq("Delete carefully", "Remove one cancelled order by its number, and every order that has been archived.", ["deleteOne with orderNo: \"ORD-1001\"", "deleteMany with status: \"archived\"", "Don't use the deprecated remove()"], code`db.orders.deleteOne({ orderNo: "ORD-1001" })
db.orders.deleteMany({ status: "archived" })
`, [has(String.raw`deleteOne\s*\(\s*\{\s*` + key("orderNo"), "Deletes one order by orderNo"), has(String.raw`deleteMany\s*\(\s*\{\s*` + key("status") + String.raw`\s*["']archived["']`, "Deletes all archived orders"), hasNot(String.raw`\.remove\s*\(`, "Doesn't use remove()"), hasNot(String.raw`deleteMany\s*\(\s*\{\s*\}\s*\)`, "Never deletes with an empty filter")]),

    mq("Invoice number counter", "Generate the next invoice number safely with a counters collection.", ["db.counters.findOneAndUpdate with filter _id: \"invoice\"", "$inc seq by 1", "Options: upsert true and returnDocument \"after\" so you get the new number"], code`db.counters.findOneAndUpdate(
  { _id: "invoice" },
  { $inc: { seq: 1 } },
  { upsert: true, returnDocument: "after" }
)
`, [has(String.raw`db\.counters\.findOneAndUpdate\s*\(`, "Uses findOneAndUpdate on counters"), has(key("_id") + String.raw`\s*["']invoice["']`, "Targets the invoice counter"), has(key("$inc") + String.raw`\s*\{\s*` + key("seq") + String.raw`\s*1\b`, "Increments seq"), has(key("returnDocument") + String.raw`\s*["']after["']`, "Returns the updated document"), has(key("upsert") + String.raw`\s*true`, "Creates the counter if missing")], "advanced"),

    jq("Simulate updateMany with $inc", "Apply updateMany({ dept }, { $inc: { salary: amount } }) to a list of employees in plain JavaScript.", ["Input line 1: a JSON array of employees with name, dept and salary", "Line 2: the dept to update", "Line 3: the amount to add", "Output: first the line modified: N, then one line per employee (all of them, in order): name salary"], code`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const employees = JSON.parse(lines[0]);
const dept = lines[1].trim();
const amount = Number(lines[2]);
let modified = 0;
for (const e of employees) {
  if (e.dept === dept) {
    e.salary += amount;
    modified++;
  }
}
console.log("modified: " + modified);
for (const e of employees) console.log(e.name + " " + e.salary);
`, [['[{"name":"Asha","dept":"IT","salary":50000},{"name":"Ravi","dept":"HR","salary":40000}]\nIT\n5000', "modified: 1\nAsha 55000\nRavi 40000"]], [['[{"name":"A","dept":"IT","salary":100},{"name":"B","dept":"IT","salary":200}]\nIT\n-50', "modified: 2\nA 50\nB 150"], ['[{"name":"A","dept":"IT","salary":100}]\nSales\n10', "modified: 0\nA 100"]], { match: "exact", level: "intermediate" }),

    jq("Simulate $addToSet with $each", "Apply { $addToSet: { skills: { $each: [...] } } } to one skills array.", ["Input line 1: a JSON array of current skills", "Line 2: a JSON array of skills to add", "Add each new skill at the end only if it is not already in the array (compare exactly)", "Output: the final skills joined with \", \" (print (none) for an empty array)"], code`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const skills = JSON.parse(lines[0]);
for (const s of JSON.parse(lines[1])) {
  if (!skills.includes(s)) skills.push(s);
}
console.log(skills.length ? skills.join(", ") : "(none)");
`, [['["Java","SQL"]\n["Git","SQL","Linux"]', "Java, SQL, Git, Linux"]], [['[]\n["Go","Go"]', "Go"], ['["git"]\n["Git"]', "git, Git"], ["[]\n[]", "(none)"]], { match: "exact", level: "intermediate" }),
  ],
  quiz: [
    { q: "What does find() return in mongosh?", options: ["An array of all documents", "A cursor over the matching documents", "The first document", "The number of matches"], answer: 1, why: "find returns a cursor; mongosh iterates the first 20 results for you." },
    { q: "What does findOne return when nothing matches?", options: ["An empty array", "undefined", "null", "It throws an error"], answer: 2, why: "findOne returns null when no document matches." },
    { q: "Which projection returns only name and email without _id?", options: ["{ name: 1, email: 1 }", "{ name: 1, email: 1, _id: 0 }", "{ name: 0, email: 0 }", "{ _id: 0 }"], answer: 1, why: "_id is included by default, so exclude it explicitly." },
    { q: "Which operator adds to a number?", options: ["$add", "$inc", "$plus", "$sum"], answer: 1, why: "$inc adds its value (negative subtracts); $add and $sum are aggregation operators." },
    { q: "What is the difference between $push and $addToSet?", options: ["None", "$addToSet adds the value only if it isn't already in the array", "$push only works on strings", "$addToSet sorts the array"], answer: 1, why: "$addToSet treats the array like a set and skips duplicates." },
    { q: "An upsert with $setOnInsert: { createdAt: new Date() } matches an existing document. What happens to createdAt?", options: ["It is updated to now", "Nothing; $setOnInsert only applies when a new document is inserted", "It is removed", "The update fails"], answer: 1, why: "$setOnInsert is ignored when the upsert updates an existing document." },
    { q: "updateOne returns matchedCount: 1, modifiedCount: 0. What does that mean?", options: ["The filter matched nothing", "A document matched but already had those values", "The update failed", "Two documents matched"], answer: 1, why: "MongoDB doesn't rewrite a document when the new values equal the old ones." },
    { q: "A customer is { name: \"R\", address: { city: \"Pune\", pin: \"411001\" } }. After updateOne({...}, { $set: { address: { city: \"Delhi\" } } }), what is address?", options: ["{ city: \"Delhi\", pin: \"411001\" }", "{ city: \"Delhi\" }", "Unchanged", "An error"], answer: 1, why: "$set on address replaces the whole embedded document; use \"address.city\" to change one field." },
    { q: "What does db.students.updateOne({ rollNo: 1 }, { name: \"Asha\" }) do in current MongoDB?", options: ["Sets name to Asha", "Replaces the document", "Throws an error: the update document needs atomic operators like $set", "Inserts a new document"], answer: 2, why: "updateOne requires operators; use replaceOne to replace a whole document." },
    { q: "You need unique, gap-free-ish invoice numbers from many app servers at once. Which approach is safe?", options: ["Read the max number with find, add 1, then insert", "findOneAndUpdate on a counter document with $inc and returnDocument: \"after\"", "Use countDocuments() + 1", "Use Math.random()"], answer: 1, why: "findOneAndUpdate with $inc is atomic on one document, so two servers never get the same number; read-then-write races." },
  ],
};
