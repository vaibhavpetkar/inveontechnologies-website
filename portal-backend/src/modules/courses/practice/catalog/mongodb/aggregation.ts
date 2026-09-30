import type { PracticeUnit } from "../../types.js";
import { code, has, hasNot, jq, key, mq } from "./shared.js";

const agg = (coll: string) => String.raw`db\.` + coll + String.raw`\.aggregate\s*\(\s*\[`;

export const aggregation: PracticeUnit = {
  key: "aggregation",
  title: "The aggregation pipeline",
  summary: "$match, $group, $sort, $limit, $project, $addFields, $unwind, $lookup and $facet for reports and analytics",
  reading: code`## Pipelines: data flowing through stages

find can filter and shape documents, but reports need more: totals per category, averages per department, joins with another collection. For that MongoDB has the aggregation pipeline, an array of stages. Documents flow through the stages in order and each stage's output is the next stage's input.

` + "```javascript" + code`
db.orders.aggregate([
  { $match: { status: "paid" } },
  { $group: { _id: "$category", revenue: { $sum: "$amount" }, orders: { $sum: 1 } } },
  { $sort: { revenue: -1 } },
  { $limit: 3 }
])
` + "```" + code`

This reads: take paid orders, group them by category adding up the amounts and counting them, sort the groups by revenue and keep the top 3. The same idea in SQL is SELECT category, SUM(amount) ... WHERE status = 'paid' GROUP BY category ORDER BY 2 DESC LIMIT 3.

## Field paths: the $ sign

Inside expressions, "$amount" (a string starting with $) means "the value of the amount field in the current document". "amount" without the $ is just the text amount. Forgetting the $ in $sum: "amount" is the most common aggregation bug: the sum comes out as 0.

## The main stages

- $match: filters like find. Put it first so later stages see fewer documents and it can use indexes.
- $group: _id is the group key ("$city", or an object for several keys, or null for one grand total). Accumulators: $sum, $avg, $min, $max, $first, $last, $push (collect values into an array), $addToSet.
- $sort, $limit, $skip: as on cursors.
- $project: choose, rename and compute fields. { total: { $multiply: ["$price", "$qty"] } }
- $addFields (also called $set): add computed fields and keep all the others.
- $unwind: turns one document with an array into one document per element. { $unwind: "$tags" }
- $lookup: a left outer join with another collection.
- $count: replaces the documents with one { field: n } count.
- $facet: runs several sub-pipelines on the same input and returns all their results in one document.

## Expressions you'll use often

` + "```javascript" + code`
{ $multiply: ["$price", "$qty"] }
{ $concat: ["$firstName", " ", "$lastName"] }
{ $round: ["$avgMarks", 1] }
{ $cond: { if: { $gte: ["$marks", 40] }, then: "pass", else: "fail" } }
{ $month: "$orderDate" }
{ $dateToString: { format: "%Y-%m", date: "$orderDate" } }
` + "```" + code`

Note the array form of comparison inside expressions: { $gte: ["$marks", 40] }, not { marks: { $gte: 40 } } as in a filter.

## Joining with $lookup

` + "```javascript" + code`
db.orders.aggregate([
  { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $unwind: "$customer" },
  { $project: { orderNo: 1, amount: 1, "customer.name": 1 } }
])
` + "```" + code`

as always holds an array (empty if nothing matched), so it's common to $unwind it right after. Make sure foreignField is indexed (here it is _id), or each order scans the whole customers collection.

## $unwind for arrays

To count how often each tag is used, unwind the tags array and group by it:

` + "```javascript" + code`
db.posts.aggregate([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", uses: { $sum: 1 } } },
  { $sort: { uses: -1, _id: 1 } }
])
` + "```" + code`

Documents with an empty or missing array disappear after $unwind unless you pass { path: "$tags", preserveNullAndEmptyArrays: true }.

## Common mistakes

- Missing $ in field paths ("amount" instead of "$amount").
- Putting $match after $group when it could go first: slower, and fields may no longer exist under the same names after grouping.
- Expecting the group key to be called category: after $group it is _id. Rename it with $project.
- Pipelines use 100 MB of memory per stage; pass { allowDiskUse: true } for huge sorts and groups.

## How your assignments are checked

Upload a .js file with db.collection.aggregate([...]) calls. The checker reads the pipeline and looks for the stages, group keys, accumulators and field paths (with the $). Two programs are run in Node.js: they group and unwind JSON documents from standard input exactly as the pipeline would.`,
  questions: [
    mq("Active students per city", "Count active students in each city.", ["db.students.aggregate with two stages", "$match status \"active\"", "$group by \"$city\" with count: { $sum: 1 }"], code`db.students.aggregate([
  { $match: { status: "active" } },
  { $group: { _id: "$city", count: { $sum: 1 } } }
])
`, [has(agg("students"), "Runs a pipeline on students"), has(key("$match") + String.raw`\s*\{\s*` + key("status") + String.raw`\s*["']active["']`, "Filters active students first"), has(key("$group") + String.raw`\s*\{\s*` + key("_id") + String.raw`\s*["']\$city["']`, "Groups by $city"), has(key("$sum") + String.raw`\s*1\b`, "Counts with $sum: 1")]),

    mq("Revenue per category", "Report total revenue per category for paid orders, biggest first.", ["$match status \"paid\"", "$group by \"$category\" with revenue: { $sum: \"$amount\" }", "$sort revenue descending"], code`db.orders.aggregate([
  { $match: { status: "paid" } },
  { $group: { _id: "$category", revenue: { $sum: "$amount" } } },
  { $sort: { revenue: -1 } }
])
`, [has(agg("orders"), "Runs a pipeline on orders"), has(key("_id") + String.raw`\s*["']\$category["']`, "Groups by $category"), has(key("revenue") + String.raw`\s*\{\s*` + key("$sum") + String.raw`\s*["']\$amount["']`, "Sums $amount (with the $)"), has(key("$sort") + String.raw`\s*\{\s*` + key("revenue") + String.raw`\s*-1`, "Sorts by revenue descending"), has(key("$match") + String.raw`[\s\S]*` + key("$group"), "Matches before grouping")]),

    mq("Average marks per department", "Show each department's average marks rounded to 1 decimal, with a field called dept instead of _id.", ["$group by \"$dept\" with avgMarks: { $avg: \"$marks\" }", "$project: dept: \"$_id\", avgMarks rounded with $round to 1 place, _id: 0", "$sort by dept ascending"], code`db.students.aggregate([
  { $group: { _id: "$dept", avgMarks: { $avg: "$marks" } } },
  { $project: { _id: 0, dept: "$_id", avgMarks: { $round: ["$avgMarks", 1] } } },
  { $sort: { dept: 1 } }
])
`, [has(key("$avg") + String.raw`\s*["']\$marks["']`, "Averages $marks"), has(key("dept") + String.raw`\s*["']\$_id["']`, "Renames _id to dept"), has(key("$round") + String.raw`\s*\[\s*["']\$avgMarks["']\s*,\s*1\s*\]`, "Rounds to 1 decimal"), has(key("$sort") + String.raw`\s*\{\s*` + key("dept") + String.raw`\s*1`, "Sorts by dept")], "intermediate"),

    mq("Top three customers", "Find the three customers who spent the most.", ["$group orders by \"$customerId\" with spent: { $sum: \"$amount\" }", "$sort spent descending", "$limit 3"], code`db.orders.aggregate([
  { $group: { _id: "$customerId", spent: { $sum: "$amount" } } },
  { $sort: { spent: -1 } },
  { $limit: 3 }
])
`, [has(key("_id") + String.raw`\s*["']\$customerId["']`, "Groups by customer"), has(key("spent") + String.raw`\s*\{\s*` + key("$sum") + String.raw`\s*["']\$amount["']`, "Adds up the amounts"), has(key("$sort") + String.raw`\s*\{\s*` + key("spent") + String.raw`\s*-1[\s\S]*` + key("$limit") + String.raw`\s*3`, "Sorts, then limits to 3")]),

    mq("Computed line totals", "For each order line, show the product and a computed total, plus the customer's full name.", ["db.orderLines.aggregate with one $project stage", "product: 1", "total: $multiply of \"$price\" and \"$qty\"", "customer: $concat of \"$firstName\", \" \", \"$lastName\""], code`db.orderLines.aggregate([
  {
    $project: {
      product: 1,
      total: { $multiply: ["$price", "$qty"] },
      customer: { $concat: ["$firstName", " ", "$lastName"] }
    }
  }
])
`, [has(agg("orderLines"), "Runs a pipeline on orderLines"), has(key("total") + String.raw`\s*\{\s*` + key("$multiply") + String.raw`\s*\[\s*["']\$price["']\s*,\s*["']\$qty["']`, "Multiplies $price by $qty"), has(key("$concat") + String.raw`\s*\[\s*["']\$firstName["']\s*,\s*["'] ["']\s*,\s*["']\$lastName["']`, "Joins the names with a space"), has(key("product") + String.raw`\s*1`, "Keeps product")]),

    mq("Most used tags", "Count how many posts use each tag, most used first, ties by tag name.", ["$unwind \"$tags\"", "$group by \"$tags\" with uses: { $sum: 1 }", "$sort uses descending, then _id ascending"], code`db.posts.aggregate([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", uses: { $sum: 1 } } },
  { $sort: { uses: -1, _id: 1 } }
])
`, [has(key("$unwind") + String.raw`\s*["']\$tags["']`, "Unwinds $tags"), has(key("_id") + String.raw`\s*["']\$tags["']`, "Groups by tag"), has(key("$sort") + String.raw`\s*\{\s*` + key("uses") + String.raw`\s*-1\s*,\s*` + key("_id") + String.raw`\s*1`, "Sorts by uses then tag"), has(key("$unwind") + String.raw`[\s\S]*` + key("$group"), "Unwinds before grouping")], "intermediate"),

    mq("Join orders with customers", "Show each order with its customer's name using $lookup.", ["$lookup from \"customers\", localField \"customerId\", foreignField \"_id\", as \"customer\"", "$unwind \"$customer\"", "$project orderNo, amount and \"customer.name\""], code`db.orders.aggregate([
  { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $unwind: "$customer" },
  { $project: { orderNo: 1, amount: 1, "customer.name": 1 } }
])
`, [has(key("$lookup") + String.raw`\s*\{`, "Uses $lookup"), has(key("from") + String.raw`\s*["']customers["']`, "Joins the customers collection"), has(key("localField") + String.raw`\s*["']customerId["'][\s\S]*` + key("foreignField") + String.raw`\s*["']_id["']`, "Matches customerId to _id"), has(key("as") + String.raw`\s*["']customer["']`, "Stores the match in customer"), has(key("$unwind") + String.raw`\s*["']\$customer["']`, "Unwinds the joined array")], "intermediate"),

    mq("Pass or fail label", "Add a result field to every student: \"pass\" when marks are at least 40, otherwise \"fail\", and keep all other fields.", ["$addFields (or $set) with result", "Use $cond with if: { $gte: [\"$marks\", 40] }, then \"pass\", else \"fail\""], code`db.students.aggregate([
  {
    $addFields: {
      result: { $cond: { if: { $gte: ["$marks", 40] }, then: "pass", else: "fail" } }
    }
  }
])
`, [has(String.raw`(` + key("$addFields") + String.raw`|` + key("$set") + String.raw`)\s*\{\s*` + key("result"), "Adds a result field"), has(key("$cond"), "Uses $cond"), has(key("$gte") + String.raw`\s*\[\s*["']\$marks["']\s*,\s*40\s*\]`, "Compares $marks with 40 in expression form"), has(String.raw`["']pass["'][\s\S]*["']fail["']`, "Labels pass and fail")], "intermediate"),

    mq("Monthly sales report", "Total paid sales per month of 2026, in month order.", ["$match status \"paid\" and orderDate $gte new Date(\"2026-01-01\") and $lt new Date(\"2027-01-01\")", "$group by { $dateToString: { format: \"%Y-%m\", date: \"$orderDate\" } } summing \"$amount\" as total", "$sort _id ascending"], code`db.orders.aggregate([
  { $match: { status: "paid", orderDate: { $gte: new Date("2026-01-01"), $lt: new Date("2027-01-01") } } },
  { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$orderDate" } }, total: { $sum: "$amount" } } },
  { $sort: { _id: 1 } }
])
`, [has(key("orderDate") + String.raw`\s*\{\s*` + key("$gte") + String.raw`\s*new\s+Date\s*\(\s*["']2026-01-01["']`, "Starts at 1 Jan 2026"), has(key("$lt") + String.raw`\s*new\s+Date\s*\(\s*["']2027-01-01["']`, "Stops before 2027"), has(key("$dateToString") + String.raw`\s*\{\s*` + key("format") + String.raw`\s*["']%Y-%m["']`, "Groups by year-month"), has(key("total") + String.raw`\s*\{\s*` + key("$sum") + String.raw`\s*["']\$amount["']`, "Adds up $amount"), has(key("$sort") + String.raw`\s*\{\s*` + key("_id") + String.raw`\s*1`, "Sorts by month")], "advanced"),

    mq("Dashboard in one query", "A dashboard needs orders per status and the grand total count, in one round trip.", ["db.orders.aggregate with one $facet stage", "byStatus: a sub-pipeline grouping by \"$status\" with count $sum 1", "total: a sub-pipeline with { $count: \"orders\" }"], code`db.orders.aggregate([
  {
    $facet: {
      byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
      total: [{ $count: "orders" }]
    }
  }
])
`, [has(key("$facet") + String.raw`\s*\{`, "Uses $facet"), has(key("byStatus") + String.raw`\s*\[\s*\{\s*` + key("$group") + String.raw`\s*\{\s*` + key("_id") + String.raw`\s*["']\$status["']`, "byStatus groups by $status"), has(key("total") + String.raw`\s*\[\s*\{\s*` + key("$count") + String.raw`\s*["']orders["']`, "total counts the orders"), hasNot(String.raw`\.find\s*\(`, "Does it all in the pipeline")], "advanced"),

    jq("Simulate $group with $sum", "Mimic [{ $group: { _id: \"$category\", total: { $sum: \"$amount\" } } }, { $sort: { total: -1, _id: 1 } }].", ["Input: one line, a JSON array of orders with category and amount", "Output: one line per category: category total, sorted by total descending, ties by category A to Z"], code`const orders = JSON.parse(require("fs").readFileSync(0, "utf8"));
const totals = new Map();
for (const o of orders) totals.set(o.category, (totals.get(o.category) || 0) + o.amount);
const rows = [...totals].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
for (const [category, total] of rows) console.log(category + " " + total);
`, [['[{"category":"books","amount":300},{"category":"toys","amount":150},{"category":"books","amount":200}]', "books 500\ntoys 150"]], [['[{"category":"b","amount":10},{"category":"a","amount":10}]', "a 10\nb 10"], ['[{"category":"x","amount":5}]', "x 5"], ['[{"category":"z","amount":1},{"category":"y","amount":2},{"category":"z","amount":2}]', "z 3\ny 2"]], { match: "exact", level: "intermediate" }),

    jq("Simulate $unwind and count", "Mimic [{ $unwind: \"$tags\" }, { $group: { _id: \"$tags\", uses: { $sum: 1 } } }, { $sort: { uses: -1, _id: 1 } }].", ["Input: one line, a JSON array of posts; each may have a tags array (or no tags field)", "Output: tag uses per line, sorted by uses descending, ties by tag A to Z", "Print no tags when there are none (like $unwind dropping empty arrays)"], code`const posts = JSON.parse(require("fs").readFileSync(0, "utf8"));
const uses = new Map();
for (const post of posts) {
  for (const tag of post.tags || []) uses.set(tag, (uses.get(tag) || 0) + 1);
}
const rows = [...uses].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
console.log(rows.length ? rows.map(([tag, n]) => tag + " " + n).join("\n") : "no tags");
`, [['[{"tags":["mongodb","node"]},{"tags":["node"]},{"title":"x"}]', "node 2\nmongodb 1"]], [['[{"tags":[]},{}]', "no tags"], ['[{"tags":["b","a"]},{"tags":["a","b","c"]}]', "a 2\nb 2\nc 1"]], { match: "exact", level: "advanced" }),
  ],
  quiz: [
    { q: "What does { $group: { _id: null, total: { $sum: \"$amount\" } } } return?", options: ["One document per amount", "One document with the grand total of all amounts", "An error, _id can't be null", "The documents unchanged"], answer: 1, why: "_id: null puts every document in one group." },
    { q: "Why put $match as the first stage?", options: ["It's required by syntax", "It reduces the documents later stages process and can use indexes", "It sorts the data", "$match only works first"], answer: 1, why: "Filtering early is cheaper and lets MongoDB use an index for the $match." },
    { q: "Which accumulator collects all values of a field into an array per group?", options: ["$sum", "$push", "$concat", "$unwind"], answer: 1, why: "$push appends each value to an array ($addToSet does the same without duplicates)." },
    { q: "A post has tags: [\"a\", \"b\", \"c\"]. How many documents come out of { $unwind: \"$tags\" }?", options: ["1", "3", "0", "It depends on an index"], answer: 1, why: "$unwind outputs one document per array element." },
    { q: "What is the difference between $project and $addFields?", options: ["None", "$addFields keeps all existing fields; $project keeps only the ones you list (plus _id)", "$project can't compute values", "$addFields removes _id"], answer: 1, why: "$addFields (alias $set) adds fields to the full document; $project reshapes it." },
    { q: "What does the as field of $lookup contain when no document matches?", options: ["null", "An empty array", "The lookup fails", "The field is missing"], answer: 1, why: "$lookup is a left outer join; as is always an array, possibly empty." },
    { q: "Which expression correctly checks marks >= 40 inside $cond?", options: ["{ marks: { $gte: 40 } }", "{ $gte: [\"$marks\", 40] }", "{ $gte: [\"marks\", 40] }", "\"$marks >= 40\""], answer: 1, why: "Aggregation expressions take an array of arguments, and fields need the $ prefix." },
    { q: "A pipeline has { $group: { _id: \"$category\", total: { $sum: \"amount\" } } }. Every total is 0. Why?", options: ["The collection is empty", "\"amount\" without $ is a string literal, not the field, and $sum ignores non-numbers", "$sum needs $add", "_id must be \"category\""], answer: 1, why: "Field paths need the $ prefix; $sum of a string contributes 0." },
    { q: "After { $group: { _id: \"$dept\", avg: { $avg: \"$marks\" } } }, you add { $match: { dept: \"CSE\" } }. What comes out?", options: ["The CSE group", "Nothing, because the group key is now called _id, not dept", "An error", "All groups"], answer: 1, why: "After $group the documents only have _id and the accumulators; match on _id or filter before grouping." },
    { q: "Orders need the customer's name from customers (100k documents). Which setup keeps the $lookup fast?", options: ["An index on the foreignField in customers (for example its _id)", "An index on orders.amount", "Calling $unwind before $lookup", "Using $facet"], answer: 0, why: "Each input document looks up foreignField in the other collection, so that field must be indexed." },
  ],
};
