import type { PracticeUnit } from "../../types.js";
import { code, has, hasNot, jq, key, mq } from "./shared.js";

export const indexes: PracticeUnit = {
  key: "indexes",
  title: "Sorting, paging and indexes",
  summary: "sort, limit and skip for top-N lists and pagination, single, compound, unique, text, TTL and partial indexes, and reading explain()",
  reading: code`## sort, limit and skip

Cursor methods shape the result of find:

` + "```javascript" + code`
db.students.find().sort({ marks: -1 }).limit(5)              // top 5 by marks
db.students.find().sort({ dept: 1, marks: -1 })              // dept A-Z, then marks high-low
db.products.find().sort({ _id: 1 }).skip(20).limit(10)       // page 3, 10 per page
` + "```" + code`

1 means ascending, -1 descending. MongoDB always applies sort, then skip, then limit, whatever order you chain them in. For stable pages always sort on something unique (add _id as the last sort key), or documents with equal values can move between pages.

skip(n) still walks over the n skipped documents, so page 5000 is slow. For deep paging use a range on the last seen value instead: find({ _id: { $gt: lastId } }).sort({ _id: 1 }).limit(10).

## Why indexes matter

Without an index, MongoDB reads every document in the collection to answer a query (a collection scan, COLLSCAN). An index is a sorted list of one or more fields with pointers to the documents, like the index at the back of a book, so the query can jump straight to the matching keys (IXSCAN).

` + "```javascript" + code`
db.students.createIndex({ email: 1 }, { unique: true })
db.students.createIndex({ dept: 1, marks: -1 })
db.students.getIndexes()
db.students.dropIndex("dept_1_marks_-1")
` + "```" + code`

Every collection has an index on _id automatically. Index names are generated from the fields and directions, like email_1.

## Compound indexes and the ESR rule

A compound index { dept: 1, marks: -1 } supports queries on dept, on dept + marks, and sorting by marks within a dept. It does not help a query on marks alone, because the index is sorted by dept first (think of a phone book sorted by surname: useless for finding first names). Order the fields by the ESR rule:

- Equality fields first (dept: "CSE")
- Sort fields next (marks: -1)
- Range fields last (age: { $gt: 20 })

## Special indexes

- Unique: { unique: true } rejects a second document with the same value. Build it before duplicates creep in.
- Text: createIndex({ title: "text", description: "text" }) enables { $text: { $search: "wireless mouse" } }. Sort by relevance with { score: { $meta: "textScore" } }. One text index per collection.
- TTL: createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }) deletes documents an hour after createdAt. Perfect for sessions and OTP codes. The field must be a Date.
- Partial: { partialFilterExpression: { email: { $exists: true } } } indexes only some documents, for example to make email unique only where it is present.

## Reading explain()

` + "```javascript" + code`
db.students.find({ dept: "CSE" }).sort({ marks: -1 }).explain("executionStats")
` + "```" + code`

Look at three things: the winning plan's stage (IXSCAN good, COLLSCAN bad on a big collection), totalKeysExamined and totalDocsExamined compared to nReturned. If 100000 documents are examined to return 10, you need a better index. A SORT stage means the sort happened in memory instead of using the index order.

## Costs and mistakes

- Every index slows down inserts and updates a little and uses RAM. Index the queries you really run, not every field.
- Creating the same index twice with different options fails; drop the old one first.
- Low-cardinality fields (like a true/false flag) alone make weak indexes; combine them with other fields.
- sort on a field with no index over a huge result can fail with a memory limit error. Add an index or allowDiskUse.

## How your assignments are checked

Upload a .js file with the cursor chains and createIndex calls. The checker reads it and looks for the right sort directions, skip and limit numbers, index keys, options and explain mode. The paging program is run in Node.js against test cases.`,
  questions: [
    mq("Top five students", "Show the five students with the highest marks.", ["db.students.find()", "Sort by marks descending", "Limit to 5"], code`db.students.find().sort({ marks: -1 }).limit(5)
`, [has(String.raw`\.sort\s*\(\s*\{\s*` + key("marks") + String.raw`\s*-1\s*\}\s*\)`, "Sorts by marks descending"), has(String.raw`\.limit\s*\(\s*5\s*\)`, "Limits to 5"), hasNot(String.raw`\.skip\s*\(`, "Doesn't skip anything")]),

    mq("Page three of the product list", "The product list shows 10 products per page, ordered by _id. Fetch page 3.", ["Sort by _id ascending", "Skip the first two pages", "Limit to 10"], code`db.products.find().sort({ _id: 1 }).skip(20).limit(10)
`, [has(String.raw`\.sort\s*\(\s*\{\s*` + key("_id") + String.raw`\s*1\s*\}`, "Sorts by _id ascending"), has(String.raw`\.skip\s*\(\s*20\s*\)`, "Skips 20 documents"), has(String.raw`\.limit\s*\(\s*10\s*\)`, "Limits to 10")]),

    mq("Sort on two fields", "List CSE and ECE students grouped by department (A to Z), highest marks first inside each department, showing only name, dept and marks.", ["Filter with $in on dept", "Project name, dept, marks and hide _id", "Sort by dept ascending then marks descending"], code`db.students.find(
  { dept: { $in: ["CSE", "ECE"] } },
  { name: 1, dept: 1, marks: 1, _id: 0 }
).sort({ dept: 1, marks: -1 })
`, [has(key("dept") + String.raw`\s*\{\s*` + key("$in"), "Filters with $in on dept"), has(key("_id") + String.raw`\s*0`, "Hides _id"), has(String.raw`\.sort\s*\(\s*\{\s*` + key("dept") + String.raw`\s*1\s*,\s*` + key("marks") + String.raw`\s*-1\s*\}`, "Sorts by dept then marks descending")], "intermediate"),

    mq("Unique email index", "No two users may share an email. Enforce it with an index, then list the indexes.", ["db.users.createIndex on email ascending", "Option unique: true", "Then db.users.getIndexes()"], code`db.users.createIndex({ email: 1 }, { unique: true })
db.users.getIndexes()
`, [has(String.raw`db\.users\.createIndex\s*\(\s*\{\s*` + key("email") + String.raw`\s*1\s*\}`, "Indexes email ascending"), has(key("unique") + String.raw`\s*true`, "Makes it unique"), has(String.raw`db\.users\.getIndexes\s*\(\s*\)`, "Lists the indexes")]),

    mq("Compound index by the ESR rule", "This query runs on every page load: db.students.find({ dept: \"CSE\", age: { $gt: 20 } }).sort({ marks: -1 }). Create the index that best serves it.", ["Follow Equality, Sort, Range", "Keys in order: dept 1, marks -1, age 1", "One createIndex call on db.students"], code`db.students.createIndex({ dept: 1, marks: -1, age: 1 })
`, [has(String.raw`db\.students\.createIndex\s*\(`, "Creates an index on students"), has(String.raw`\{\s*` + key("dept") + String.raw`\s*1\s*,\s*` + key("marks") + String.raw`\s*-1\s*,\s*` + key("age") + String.raw`\s*1\s*\}`, "Orders the keys dept, marks, age"), hasNot(String.raw`\{\s*` + key("age") + String.raw`\s*1\s*,\s*` + key("dept"), "Doesn't put the range field first")], "advanced"),

    mq("Check the plan with explain", "Prove the query uses your index.", ["Run db.students.find({ dept: \"CSE\" }).sort({ marks: -1 })", "Chain .explain(\"executionStats\")", "In a comment, note which stage you expect to see (IXSCAN)"], code`// Expect an IXSCAN stage and totalDocsExamined close to nReturned
db.students.find({ dept: "CSE" }).sort({ marks: -1 }).explain("executionStats")
`, [has(String.raw`find\s*\(\s*\{\s*` + key("dept") + String.raw`\s*["']CSE["']`, "Filters on dept CSE"), has(String.raw`\.sort\s*\(\s*\{\s*` + key("marks") + String.raw`\s*-1`, "Sorts by marks descending"), has(String.raw`\.explain\s*\(\s*["']executionStats["']\s*\)`, "Uses explain(\"executionStats\")")]),

    mq("Search products by words", "Let customers search product titles and descriptions by keywords.", ["Create a text index on title and description in db.products", "Search for \"wireless mouse\" with $text and $search", "Project and sort by { score: { $meta: \"textScore\" } }"], code`db.products.createIndex({ title: "text", description: "text" })
db.products.find(
  { $text: { $search: "wireless mouse" } },
  { title: 1, score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } })
`, [has(String.raw`createIndex\s*\(\s*\{\s*` + key("title") + String.raw`\s*["']text["']\s*,\s*` + key("description") + String.raw`\s*["']text["']`, "Creates a text index on title and description"), has(key("$text") + String.raw`\s*\{\s*` + key("$search") + String.raw`\s*["']wireless mouse["']`, "Searches with $text"), has(String.raw`\.sort\s*\(\s*\{\s*` + key("score") + String.raw`\s*\{\s*` + key("$meta") + String.raw`\s*["']textScore["']`, "Sorts by text score")], "intermediate"),

    mq("Expire OTP codes", "OTP codes must disappear 5 minutes after they are created.", ["db.otps.createIndex on createdAt ascending", "Option expireAfterSeconds: 300", "Insert one OTP with createdAt: new Date()"], code`db.otps.createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 })
db.otps.insertOne({ phone: "9876543210", code: "482913", createdAt: new Date() })
`, [has(String.raw`db\.otps\.createIndex\s*\(\s*\{\s*` + key("createdAt") + String.raw`\s*1\s*\}`, "Indexes createdAt"), has(key("expireAfterSeconds") + String.raw`\s*300\b`, "Expires after 300 seconds"), has(key("createdAt") + String.raw`\s*new\s+Date\s*\(`, "Stores createdAt as a Date")], "intermediate"),

    mq("Drop an unused index", "An old index on the city field is no longer used. Find its name and remove it.", ["List the indexes of db.students", "Drop the index named \"city_1\" with dropIndex"], code`db.students.getIndexes()
db.students.dropIndex("city_1")
`, [has(String.raw`db\.students\.getIndexes\s*\(\s*\)`, "Lists the indexes first"), has(String.raw`db\.students\.dropIndex\s*\(\s*["']city_1["']\s*\)`, "Drops city_1 by name"), hasNot(String.raw`dropIndexes\s*\(\s*\)`, "Doesn't drop every index")]),

    mq("Unique only when present", "Some users sign up with a phone and no email. Make email unique, but only for documents that have an email.", ["db.users.createIndex on email ascending", "unique: true", "partialFilterExpression: { email: { $exists: true } }"], code`db.users.createIndex(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } }
)
`, [has(String.raw`createIndex\s*\(\s*\{\s*` + key("email") + String.raw`\s*1\s*\}`, "Indexes email"), has(key("unique") + String.raw`\s*true`, "Makes it unique"), has(key("partialFilterExpression") + String.raw`\s*\{\s*` + key("email") + String.raw`\s*\{\s*` + key("$exists") + String.raw`\s*true`, "Limits the index to documents with email")], "advanced"),

    jq("Simulate sort, skip and limit", "Mimic find().sort({ score: -1, name: 1 }).skip((page - 1) * size).limit(size).", ["Input line 1: a JSON array of players with name and score", "Line 2: page and size (page starts at 1)", "Sort by score high to low; equal scores by name A to Z", "Output: name score for each player on that page, one per line; print empty if the page has nobody"], code`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const players = JSON.parse(lines[0]);
const [page, size] = lines[1].trim().split(/\s+/).map(Number);
players.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const rows = players.slice((page - 1) * size, page * size);
console.log(rows.length ? rows.map((p) => p.name + " " + p.score).join("\n") : "empty");
`, [['[{"name":"Ravi","score":50},{"name":"Asha","score":80},{"name":"Meena","score":50},{"name":"Om","score":10}]\n1 2', "Asha 80\nMeena 50"], ['[{"name":"Ravi","score":50},{"name":"Asha","score":80},{"name":"Meena","score":50},{"name":"Om","score":10}]\n2 2', "Ravi 50\nOm 10"]], [['[{"name":"A","score":1}]\n2 5', "empty"], ['[{"name":"b","score":5},{"name":"a","score":5},{"name":"c","score":5}]\n1 3', "a 5\nb 5\nc 5"], ["[]\n1 10", "empty"]], { match: "exact", level: "intermediate" }),
  ],
  quiz: [
    { q: "What does sort({ marks: -1 }) do?", options: ["Sorts marks ascending", "Sorts marks descending", "Removes the marks field", "Sorts by the last field"], answer: 1, why: "-1 means descending, 1 ascending." },
    { q: "In which order does MongoDB apply sort, skip and limit on a cursor?", options: ["The order you chain them", "limit, skip, sort", "sort, then skip, then limit", "skip, limit, sort"], answer: 2, why: "Cursor modifiers are applied as sort, skip, limit regardless of chaining order." },
    { q: "Which index exists on every collection automatically?", options: ["None", "_id", "createdAt", "name"], answer: 1, why: "MongoDB creates a unique index on _id for every collection." },
    { q: "What does COLLSCAN in an explain plan mean?", options: ["The index was used", "Every document in the collection was read", "The query was cached", "The collection was dropped"], answer: 1, why: "A collection scan reads every document; on a large collection that usually means a missing index." },
    { q: "Which index removes session documents 30 minutes after lastSeen?", options: ["{ lastSeen: 1 }, { expireAfterSeconds: 1800 }", "{ lastSeen: 1 }, { ttl: 30 }", "{ lastSeen: \"ttl\" }", "{ expire: 1800 }"], answer: 0, why: "A TTL index is a single-field index on a Date with expireAfterSeconds." },
    { q: "How many text indexes can one collection have?", options: ["One", "Two", "One per field", "Unlimited"], answer: 0, why: "A collection can have only one text index, but it can cover several fields." },
    { q: "Why can skip(100000) be slow even with an index?", options: ["It can't be slow", "The server still walks over all the skipped documents or keys", "skip disables indexes", "skip sorts twice"], answer: 1, why: "Skipped entries are still read; range-based paging on the last seen value avoids that." },
    { q: "You have the index { dept: 1, marks: -1 }. Which query can NOT use it efficiently?", options: ["find({ dept: \"CSE\" })", "find({ dept: \"CSE\" }).sort({ marks: -1 })", "find({ marks: { $gt: 80 } })", "find({ dept: \"CSE\", marks: 90 })"], answer: 2, why: "A compound index is sorted by its first field; a query on marks alone can't use the prefix." },
    { q: "explain shows nReturned: 10, totalKeysExamined: 10, totalDocsExamined: 10 and a SORT stage. What does SORT tell you?", options: ["Everything is ideal", "The results were sorted in memory; the index doesn't provide that sort order", "The query failed", "The data is already sorted on disk"], answer: 1, why: "A SORT stage means an in-memory sort; an index whose key order matches the sort avoids it." },
    { q: "Following the ESR rule, what is the best index for find({ status: \"paid\", amount: { $gt: 500 } }).sort({ date: -1 })?", options: ["{ amount: 1, status: 1, date: -1 }", "{ status: 1, date: -1, amount: 1 }", "{ date: -1, amount: 1, status: 1 }", "{ status: 1, amount: 1, date: -1 }"], answer: 1, why: "Equality (status), then Sort (date), then Range (amount) lets the index serve both the filter and the sort." },
  ],
};
