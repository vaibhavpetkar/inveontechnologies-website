import type { PracticeUnit } from "../../types.js";
import { code, has, hasNot, jq, key, mq } from "./shared.js";

export const operators: PracticeUnit = {
  key: "operators",
  title: "Query operators",
  summary: "comparison ($gt, $in), logical ($and, $or, $not), $regex, $exists, $type and array operators like $all and $elemMatch",
  reading: code`## Comparison operators

A plain filter { marks: 90 } means "equals". For anything else you put an operator document in place of the value:

- $eq, $ne: equal, not equal
- $gt, $gte, $lt, $lte: greater than, greater or equal, less than, less or equal
- $in, $nin: value is (not) one of a list

` + "```javascript" + code`
db.products.find({ price: { $gte: 100, $lte: 500 } })      // a range
db.students.find({ city: { $in: ["Pune", "Mumbai"] } })
db.orders.find({ status: { $nin: ["cancelled", "refunded"] } })
` + "```" + code`

Two conditions on the same field go in the same operator document, as in the price range above. Writing { price: { $gte: 100 }, price: { $lte: 500 } } is a JavaScript object with a duplicate key: the second one silently wins.

## Logical operators

Fields in one filter are already ANDed. Use $or when any one of several conditions is enough:

` + "```javascript" + code`
db.students.find({ $or: [ { dept: "CSE" }, { marks: { $gt: 90 } } ] })
db.students.find({
  $and: [
    { $or: [ { city: "Pune" }, { city: "Mumbai" } ] },
    { $or: [ { marks: { $gte: 60 } }, { sports: true } ] }
  ]
})
` + "```" + code`

You need an explicit $and when you combine two $or clauses, because one object can't hold two $or keys. $or with conditions on the same field is usually clearer as $in. $not negates an operator expression: { marks: { $not: { $gte: 40 } } } (this also matches documents without marks). $nor matches when none of the clauses is true.

## Existence, type and patterns

- { phone: { $exists: true } }: the field is present (even if it's null).
- { phone: null }: the field is null or missing.
- { price: { $type: "string" } }: find badly imported data. Types have names like "string", "double", "int", "date", "array".
- $regex: text patterns. { name: { $regex: "^ra", $options: "i" } } or the shorter { name: /^ra/i } finds names that start with ra, ignoring case.

A regex anchored with ^ (starts with, case-sensitive) can use an index. An unanchored or case-insensitive regex scans every value, so it's slow on big collections; a text or Atlas Search index is the better tool there.

## Querying arrays

MongoDB looks inside arrays automatically:

` + "```javascript" + code`
db.students.find({ skills: "Java" })                      // the array contains "Java"
db.students.find({ skills: { $all: ["Java", "SQL"] } })   // contains both, any order
db.students.find({ skills: { $size: 3 } })                // exactly 3 elements
db.students.find({ skills: ["Java", "SQL"] })             // exactly this array, in this order
` + "```" + code`

## $elemMatch: conditions on the same element

For arrays of embedded documents, this filter is a classic trap:

` + "```javascript" + code`
// results: [ { subject: "Maths", score: 45 }, { subject: "Physics", score: 95 } ]
db.students.find({ "results.subject": "Maths", "results.score": { $gte: 90 } })
` + "```" + code`

It matches the student above, because one element has subject Maths and a different element has a score of 95. To require both conditions in the same element, use $elemMatch:

` + "```javascript" + code`
db.students.find({ results: { $elemMatch: { subject: "Maths", score: { $gte: 90 } } } })
` + "```" + code`

## Common mistakes

- Writing $gt without quotes or braces in the wrong place: { marks: $gt: 50 } is a syntax error; it's { marks: { $gt: 50 } }.
- Comparing across types: { price: { $gt: 100 } } does not match "150" stored as a string.
- Forgetting that $ne and $nin also match documents where the field is missing.
- Using several $or keys in one object. Wrap them in $and.

## How your assignments are checked

Upload a .js file of find() calls. The checker reads it and looks for the operators and fields each question needs (quoted or unquoted keys and /regex/ literals are all fine). Two questions are Node.js programs that filter JSON documents from standard input the way MongoDB would, and they are run against test cases.`,
  questions: [
    mq("Products in a price range", "List products that cost from 100 up to 500 (both included).", ["db.products.find", "One operator document on price with $gte: 100 and $lte: 500"], code`db.products.find({ price: { $gte: 100, $lte: 500 } })
`, [has(String.raw`db\.products\.find\s*\(`, "Searches products"), has(key("price") + String.raw`\s*\{[^}]*` + key("$gte") + String.raw`\s*100`, "Uses $gte: 100 on price"), has(key("price") + String.raw`\s*\{[^}]*` + key("$lte") + String.raw`\s*500`, "Uses $lte: 500 in the same price document"), hasNot(String.raw`(` + key("price") + String.raw`[\s\S]*){2}`, "Doesn't repeat the price key")]),

    mq("Cities and statuses", "Two lists, two operators.", ["Students whose city is Pune, Mumbai or Nagpur: $in", "Orders whose status is neither cancelled nor refunded: $nin"], code`db.students.find({ city: { $in: ["Pune", "Mumbai", "Nagpur"] } })
db.orders.find({ status: { $nin: ["cancelled", "refunded"] } })
`, [has(key("city") + String.raw`\s*\{\s*` + key("$in") + String.raw`\s*\[[^\]]*Pune[^\]]*Mumbai[^\]]*Nagpur`, "Uses $in with the three cities"), has(key("status") + String.raw`\s*\{\s*` + key("$nin") + String.raw`\s*\[[^\]]*cancelled[^\]]*refunded`, "Uses $nin for cancelled and refunded"), hasNot(key("$or"), "Uses $in instead of $or")]),

    mq("Either condition with $or", "Find students who are in CSE or have more than 90 marks.", ["db.students.find with $or", "Clause 1: dept \"CSE\"", "Clause 2: marks $gt 90"], code`db.students.find({ $or: [{ dept: "CSE" }, { marks: { $gt: 90 } }] })
`, [has(key("$or") + String.raw`\s*\[`, "Uses $or with an array of clauses"), has(String.raw`\{\s*` + key("dept") + String.raw`\s*["']CSE["']\s*\}`, "One clause checks dept CSE"), has(key("marks") + String.raw`\s*\{\s*` + key("$gt") + String.raw`\s*90`, "One clause checks marks > 90")]),

    mq("Two $or groups", "Find students who live in Pune or Mumbai AND either have at least 60 marks or play a sport.", ["Wrap two $or clauses in an explicit $and", "First $or: city Pune / city Mumbai", "Second $or: marks $gte 60 / sports: true"], code`db.students.find({
  $and: [
    { $or: [{ city: "Pune" }, { city: "Mumbai" }] },
    { $or: [{ marks: { $gte: 60 } }, { sports: true }] }
  ]
})
`, [has(key("$and") + String.raw`\s*\[`, "Uses an explicit $and"), has(String.raw`(` + key("$or") + String.raw`\s*\[[\s\S]*){2}`, "Has two $or clauses"), has(key("marks") + String.raw`\s*\{\s*` + key("$gte") + String.raw`\s*60`, "Checks marks >= 60"), has(key("sports") + String.raw`\s*true`, "Checks sports: true")], "intermediate"),

    mq("Names that start with Ra", "Search students whose name starts with \"ra\", ignoring upper/lower case.", ["db.students.find on name", "Use $regex with $options \"i\", or a /^ra/i regex literal", "Anchor the pattern with ^"], code`db.students.find({ name: { $regex: "^ra", $options: "i" } })
`, [has(String.raw`db\.students\.find\s*\(`, "Searches students"), has(key("name") + String.raw`\s*(\{\s*` + key("$regex") + String.raw`\s*["']\^ra["']|/\^ra/i)`, "Matches names that start with ra"), has(String.raw`` + key("$options") + String.raw`\s*["']i["']|/\^ra/i`, "Ignores case")]),

    mq("Present and not empty", "Find customers who have a phone field that is not an empty string, and customers with no email field at all.", ["Query 1: phone $exists true and $ne \"\" in one operator document", "Query 2: email $exists false"], code`db.customers.find({ phone: { $exists: true, $ne: "" } })
db.customers.find({ email: { $exists: false } })
`, [has(key("phone") + String.raw`\s*\{[^}]*` + key("$exists") + String.raw`\s*true`, "Checks that phone exists"), has(key("phone") + String.raw`\s*\{[^}]*` + key("$ne") + String.raw`\s*["']["']`, "Checks that phone isn't empty"), has(key("email") + String.raw`\s*\{\s*` + key("$exists") + String.raw`\s*false`, "Finds documents without email")]),

    mq("Skill searches on arrays", "Search the skills array three ways.", ["Students who have \"Python\" among their skills", "Students who have both \"Java\" and \"SQL\" (any order): $all", "Students with exactly 3 skills: $size"], code`db.students.find({ skills: "Python" })
db.students.find({ skills: { $all: ["Java", "SQL"] } })
db.students.find({ skills: { $size: 3 } })
`, [has(key("skills") + String.raw`\s*["']Python["']`, "Finds students with Python"), has(key("skills") + String.raw`\s*\{\s*` + key("$all") + String.raw`\s*\[\s*["']Java["']\s*,\s*["']SQL["']`, "Uses $all for Java and SQL"), has(key("skills") + String.raw`\s*\{\s*` + key("$size") + String.raw`\s*3`, "Uses $size: 3")], "intermediate"),

    mq("Maths toppers with $elemMatch", "results is an array like [{ subject: \"Maths\", score: 95 }]. Find students who scored at least 90 in Maths, in the same array element.", ["db.students.find with results: { $elemMatch: { ... } }", "Inside: subject \"Maths\" and score $gte 90", "Don't use the two separate dotted conditions"], code`db.students.find({ results: { $elemMatch: { subject: "Maths", score: { $gte: 90 } } } })
`, [has(key("results") + String.raw`\s*\{\s*` + key("$elemMatch"), "Uses $elemMatch on results"), has(key("$elemMatch") + String.raw`\s*\{[^}]*` + key("subject") + String.raw`\s*["']Maths["']`, "Matches subject Maths inside $elemMatch"), has(key("score") + String.raw`\s*\{\s*` + key("$gte") + String.raw`\s*90`, "Matches score >= 90"), hasNot(String.raw`["']results\.score["']`, "Doesn't use the separate results.score condition")], "advanced"),

    mq("Find badly typed prices", "An import stored some prices as strings. Find them, and find products whose price is not over 1000.", ["Query 1: price $type \"string\"", "Query 2: price $not { $gt: 1000 }"], code`db.products.find({ price: { $type: "string" } })
db.products.find({ price: { $not: { $gt: 1000 } } })
`, [has(key("price") + String.raw`\s*\{\s*` + key("$type") + String.raw`\s*["']string["']`, "Finds string prices with $type"), has(key("$not") + String.raw`\s*\{\s*` + key("$gt") + String.raw`\s*1000`, "Negates $gt: 1000 with $not"), has(String.raw`(db\.products\.find\s*\([\s\S]*){2}`, "Runs two queries on products")], "advanced"),

    jq("Simulate a range filter", "Mimic find({ marks: { $gte: low, $lt: high } }) on a list of students.", ["Input line 1: a JSON array of students with name and marks (some may have no marks)", "Line 2: two numbers low and high", "Output: the names that match, one per line, in input order; print none if nobody matches", "A student with no marks field never matches"], code`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const students = JSON.parse(lines[0]);
const [low, high] = lines[1].trim().split(/\s+/).map(Number);
const names = students.filter((s) => typeof s.marks === "number" && s.marks >= low && s.marks < high).map((s) => s.name);
console.log(names.length ? names.join("\n") : "none");
`, [['[{"name":"Asha","marks":72},{"name":"Ravi","marks":90},{"name":"Meena","marks":60}]\n60 90', "Asha\nMeena"]], [['[{"name":"A"},{"name":"B","marks":10}]\n0 100', "B"], ['[{"name":"A","marks":90}]\n60 90', "none"], ['[{"name":"A","marks":-5},{"name":"B","marks":0}]\n-10 0', "A"]], { match: "exact", level: "intermediate" }),

    jq("Simulate $elemMatch", "Mimic find({ results: { $elemMatch: { subject, score: { $gte: min } } } }).", ["Input line 1: a JSON array of students with name and results (an array of { subject, score })", "Line 2: a subject and a minimum score, separated by a space", "Output: the names of students with at least one result that has that subject AND score >= min, one per line; print none if nobody"], code`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const students = JSON.parse(lines[0]);
const [subject, min] = lines[1].trim().split(/\s+/);
const names = students
  .filter((s) => (s.results || []).some((r) => r.subject === subject && r.score >= Number(min)))
  .map((s) => s.name);
console.log(names.length ? names.join("\n") : "none");
`, [['[{"name":"Asha","results":[{"subject":"Maths","score":95}]},{"name":"Ravi","results":[{"subject":"Maths","score":45},{"subject":"Physics","score":95}]}]\nMaths 90', "Asha"]], [['[{"name":"A","results":[]},{"name":"B"}]\nMaths 0', "none"], ['[{"name":"A","results":[{"subject":"Maths","score":90},{"subject":"Maths","score":10}]}]\nMaths 90', "A"]], { match: "exact", level: "advanced" }),
  ],
  quiz: [
    { q: "Which filter finds marks greater than or equal to 40?", options: ["{ marks: { $gt: 40 } }", "{ marks: { $gte: 40 } }", "{ marks: >= 40 }", "{ $gte: { marks: 40 } }"], answer: 1, why: "$gte means greater than or equal; the operator goes inside the field's value." },
    { q: "How are two fields in one filter object combined?", options: ["OR", "AND", "XOR", "Only the first is used"], answer: 1, why: "Every field in a filter must match, so they are ANDed." },
    { q: "Which is the cleanest way to match city Pune, Mumbai or Delhi?", options: ["Three separate find calls", "{ city: { $in: [\"Pune\", \"Mumbai\", \"Delhi\"] } }", "{ city: \"Pune|Mumbai|Delhi\" }", "{ city: { $all: [\"Pune\", \"Mumbai\", \"Delhi\"] } }"], answer: 1, why: "$in matches any value in the list; $all would require all of them in an array." },
    { q: "What does { skills: \"Java\" } match when skills is an array?", options: ["Only documents where skills is exactly \"Java\"", "Documents whose skills array contains \"Java\"", "Nothing, arrays need $in", "An error"], answer: 1, why: "An equality filter on an array field matches if any element equals the value." },
    { q: "Which filter finds documents where the email field is missing?", options: ["{ email: \"\" }", "{ email: { $exists: false } }", "{ email: { $ne: null } }", "{ $missing: \"email\" }"], answer: 1, why: "$exists: false matches documents without the field." },
    { q: "What does /^ra/i match in a $regex filter on name?", options: ["Names containing ra anywhere", "Names starting with ra, Ra, RA or rA", "Names ending with ra", "Only the exact name ra"], answer: 1, why: "^ anchors at the start and the i flag ignores case." },
    { q: "Which regex query can use an index on name efficiently?", options: ["{ name: /kumar/ }", "{ name: /^Kum/ }", "{ name: /kumar$/i }", "{ name: /.*kumar.*/ }"], answer: 1, why: "A case-sensitive prefix regex (anchored with ^) can walk the index range; the others scan every key." },
    { q: "What does { price: { $gt: 100 }, price: { $lt: 500 } } do in mongosh?", options: ["Finds prices between 100 and 500", "Only applies $lt: 500, because the duplicate key overwrites the first", "Throws a duplicate key error", "Applies $gt: 100 only"], answer: 1, why: "It's a JavaScript object with the same key twice; the last one wins. Put both operators in one document." },
    { q: "results = [{ subject: \"Maths\", score: 45 }, { subject: \"Physics\", score: 95 }]. Does { \"results.subject\": \"Maths\", \"results.score\": { $gte: 90 } } match?", options: ["No, because Maths is 45", "Yes, because each condition can be satisfied by a different element", "Only with an index", "It's a syntax error"], answer: 1, why: "Dotted conditions are checked independently across elements; use $elemMatch to require the same element." },
    { q: "Which documents does { marks: { $ne: 50 } } return?", options: ["Only documents whose marks exist and aren't 50", "Documents whose marks aren't 50, including those with no marks field", "Only documents with marks: null", "Documents with marks less than 50"], answer: 1, why: "$ne (like $nin and $not) also matches documents where the field is missing." },
  ],
};
