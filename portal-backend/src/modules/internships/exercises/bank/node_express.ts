import type { ExerciseSeed } from "../types.js";

// Regex building blocks (tolerant of quotes and whitespace).
const q = String.raw`["'\x60]`; // ' " or `
const requireExpress = String.raw`(require\s*\(\s*${q}express${q}\s*\)|import\s+express\s+from\s+${q}express${q})`;
const createApp = String.raw`\b(const|let|var)\s+app\s*=\s*express\s*\(\s*\)`;
const listen = String.raw`\bapp\.listen\s*\(\s*(3000|process\.env\.PORT)`;

const header = `const express = require("express");\nconst app = express();\n`;
const footer = `\napp.listen(3000, () => console.log("Server running on port 3000"));\n`;

export default [
  {
    title: "Hello Express server",
    brief: "Create an Express server that answers GET / with the text Hello Express and listens on port 3000.",
    steps: [
      "Require express and create the app with express()",
      "Add app.get(\"/\") that sends the text Hello Express with res.send",
      "Start the server with app.listen(3000)",
    ],
    level: "basic",
    editor: "javascript",
    starter: `// 1. Require express\n// 2. Create the app\n// 3. Add a GET / route\n// 4. Listen on port 3000\n`,
    solution: `${header}\napp.get("/", (req, res) => {\n  res.send("Hello Express");\n});\n${footer}`,
    check: {
      rules: [
        { match: requireExpress, message: "Requires the express package" },
        { match: createApp, message: "Creates the app with express()" },
        { match: String.raw`\bapp\.get\s*\(\s*${q}/${q}\s*,`, message: "Has a GET / route" },
        { match: String.raw`\bres\.send\s*\(\s*${q}Hello Express${q}\s*\)`, message: "Sends the text Hello Express with res.send" },
        { match: listen, message: "Listens on port 3000" },
      ],
    },
  },
  {
    title: "JSON health check",
    brief: "Add a GET /health route that responds with the JSON object { status: \"ok\" }.",
    steps: ["Add app.get(\"/health\")", "Respond with res.json({ status: \"ok\" })", "Keep app.listen(3000) at the end"],
    level: "basic",
    editor: "javascript",
    starter: `${header}\n// Add a GET /health route that returns { status: "ok" } as JSON\n${footer}`,
    solution: `${header}\napp.get("/health", (req, res) => {\n  res.json({ status: "ok" });\n});\n${footer}`,
    check: {
      rules: [
        { match: createApp, message: "Creates the app with express()" },
        { match: String.raw`\bapp\.get\s*\(\s*${q}/health${q}\s*,`, message: "Has a GET /health route" },
        { match: String.raw`\bres(\.status\s*\(\s*200\s*\))?\.json\s*\(`, message: "Responds with res.json()" },
        { match: String.raw`\bstatus${q}?\s*:\s*${q}ok${q}`, message: "The JSON has status: \"ok\"" },
        { match: listen, message: "Listens on port 3000" },
      ],
    },
  },
  {
    title: "Route parameters",
    brief: "Add a GET /users/:id route that returns the id from the URL as JSON, like { id: \"5\" }.",
    steps: ["Add app.get(\"/users/:id\")", "Read the id with req.params.id (or destructure req.params)", "Respond with res.json containing the id"],
    level: "basic",
    editor: "javascript",
    starter: `${header}\n// Add GET /users/:id and return { id } as JSON\n${footer}`,
    solution: `${header}\napp.get("/users/:id", (req, res) => {\n  const id = req.params.id;\n  res.json({ id: id });\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.get\s*\(\s*${q}/users/:id${q}\s*,`, message: "Has a GET /users/:id route" },
        { match: String.raw`req\.params(\.id\b|\s*\[\s*${q}id${q}\s*\])|\{\s*id\s*\}\s*=\s*req\.params`, message: "Reads the id from req.params" },
        { match: String.raw`\bres(\.status\s*\(\s*200\s*\))?\.json\s*\(`, message: "Responds with res.json()" },
        { match: listen, message: "Listens on port 3000" },
      ],
    },
  },
  {
    title: "Search with query string",
    brief: "Add a GET /search route that reads ?q= from the URL and returns { query: <q> } as JSON, or a 400 error when q is missing.",
    steps: [
      "Add app.get(\"/search\") and read req.query.q",
      "If q is missing, respond with res.status(400).json({ error: ... })",
      "Otherwise respond with res.json({ query: q })",
    ],
    level: "basic",
    editor: "javascript",
    starter: `${header}\napp.get("/search", (req, res) => {\n  // Read q from the query string\n  res.send("TODO");\n});\n${footer}`,
    solution: `${header}\napp.get("/search", (req, res) => {\n  const q = req.query.q;\n  if (!q) {\n    return res.status(400).json({ error: "q is required" });\n  }\n  res.json({ query: q });\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.get\s*\(\s*${q}/search${q}\s*,`, message: "Has a GET /search route" },
        { match: String.raw`req\.query(\.q\b|\s*\[\s*${q}q${q}\s*\])|\{\s*q\s*\}\s*=\s*req\.query`, message: "Reads q from req.query" },
        { match: String.raw`\bres\.status\s*\(\s*400\s*\)\s*\.json\s*\(`, message: "Returns res.status(400).json(...) when q is missing" },
        { match: String.raw`\bquery\s*:`, message: "Returns { query: q } as JSON" },
      ],
    },
  },
  {
    title: "POST with a JSON body",
    brief: "Accept POST /products with a JSON body { name, price }, add it to an in-memory array and return it with status 201.",
    steps: [
      "Enable JSON bodies with app.use(express.json())",
      "Add app.post(\"/products\") that reads req.body and pushes the product into a products array",
      "Respond with res.status(201).json(product)",
    ],
    level: "intermediate",
    editor: "javascript",
    starter: `${header}\nconst products = [];\n\n// Enable JSON body parsing\n// Add POST /products\n${footer}`,
    solution: `${header}app.use(express.json());\n\nconst products = [];\n\napp.post("/products", (req, res) => {\n  const product = { id: products.length + 1, name: req.body.name, price: req.body.price };\n  products.push(product);\n  res.status(201).json(product);\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.use\s*\(\s*express\.json\s*\(\s*\)\s*\)`, message: "Uses app.use(express.json())" },
        { match: String.raw`\bapp\.post\s*\(\s*${q}/products${q}\s*,`, message: "Has a POST /products route" },
        { match: String.raw`\breq\.body\b`, message: "Reads data from req.body" },
        { match: String.raw`\.push\s*\(`, message: "Adds the product to the array with push" },
        { match: String.raw`\bres\.status\s*\(\s*201\s*\)\s*\.json\s*\(`, message: "Responds with res.status(201).json(...)" },
      ],
    },
  },
  {
    title: "Validate a signup body",
    brief: "Add POST /signup that checks req.body has an email and a password of at least 6 characters, and returns 400 with an error message if not.",
    steps: [
      "Use app.use(express.json()) and add app.post(\"/signup\")",
      "If email is missing or password.length < 6, return res.status(400).json({ error: ... })",
      "Otherwise respond with res.status(201).json({ message: \"Signed up\" })",
    ],
    level: "intermediate",
    editor: "javascript",
    starter: `${header}app.use(express.json());\n\napp.post("/signup", (req, res) => {\n  const { email, password } = req.body;\n  // Validate email and password\n  res.json({ message: "Signed up" });\n});\n${footer}`,
    solution: `${header}app.use(express.json());\n\napp.post("/signup", (req, res) => {\n  const { email, password } = req.body;\n  if (!email || !password || password.length < 6) {\n    return res.status(400).json({ error: "Email and a 6+ character password are required" });\n  }\n  res.status(201).json({ message: "Signed up" });\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.post\s*\(\s*${q}/signup${q}\s*,`, message: "Has a POST /signup route" },
        { match: String.raw`\blength\s*<\s*6\b|\blength\s*<=\s*5\b|6\s*>\s*[\w.]*length`, message: "Checks the password length is at least 6" },
        { match: String.raw`!\s*email\b|email\s*===?\s*(undefined|null|${q}${q})`, message: "Checks that email is present" },
        { match: String.raw`\breturn\s+res\.status\s*\(\s*400\s*\)\s*\.json\s*\(`, message: "Returns res.status(400).json(...) on invalid input" },
        { match: String.raw`\bres\.status\s*\(\s*201\s*\)\s*\.json\s*\(`, message: "Responds with res.status(201).json(...) on success" },
      ],
    },
  },
  {
    title: "Request logger middleware",
    brief: "Write a middleware that logs the method and URL of every request, then calls next() so the request continues.",
    steps: [
      "Register it with app.use((req, res, next) => { ... }) before your routes",
      "Log req.method and req.url (or req.originalUrl / req.path) with console.log",
      "Call next() at the end, and add one GET / route that uses res.send",
    ],
    level: "intermediate",
    editor: "javascript",
    starter: `${header}\n// Add a logging middleware here\n\napp.get("/", (req, res) => {\n  res.send("Home");\n});\n${footer}`,
    solution: `${header}\napp.use((req, res, next) => {\n  console.log(req.method, req.url);\n  next();\n});\n\napp.get("/", (req, res) => {\n  res.send("Home");\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.use\s*\(\s*(function\s*\w*\s*)?\(\s*req\s*,\s*res\s*,\s*next\s*\)|\bfunction\s+\w+\s*\(\s*req\s*,\s*res\s*,\s*next\s*\)[\s\S]*\bapp\.use\s*\(\s*\w+\s*\)`, message: "Registers a (req, res, next) middleware with app.use" },
        { match: String.raw`console\.log\s*\([^)]*req\.method`, message: "Logs req.method" },
        { match: String.raw`req\.(url|originalUrl|path)\b`, message: "Logs the request URL" },
        { match: String.raw`\bnext\s*\(\s*\)`, message: "Calls next()" },
        { match: String.raw`\bapp\.get\s*\(\s*${q}/${q}\s*,`, message: "Has a GET / route" },
      ],
    },
  },
  {
    title: "Split routes with Router",
    brief: "Create an express.Router() for books with GET / and GET /:id routes, and mount it on the app at /api/books.",
    steps: [
      "Create const router = express.Router()",
      "Add router.get(\"/\") returning a books array with res.json, and router.get(\"/:id\") returning one book",
      "Mount it with app.use(\"/api/books\", router)",
    ],
    level: "intermediate",
    editor: "javascript",
    starter: `${header}\nconst books = [{ id: 1, title: "Clean Code" }, { id: 2, title: "Eloquent JavaScript" }];\n\n// Create a router, add the routes and mount it at /api/books\n${footer}`,
    solution: `${header}\nconst books = [{ id: 1, title: "Clean Code" }, { id: 2, title: "Eloquent JavaScript" }];\n\nconst router = express.Router();\n\nrouter.get("/", (req, res) => {\n  res.json(books);\n});\n\nrouter.get("/:id", (req, res) => {\n  const book = books.find((b) => b.id === Number(req.params.id));\n  if (!book) return res.status(404).json({ error: "Book not found" });\n  res.json(book);\n});\n\napp.use("/api/books", router);\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\b(const|let|var)\s+(\w+)\s*=\s*express\.Router\s*\(\s*\)`, message: "Creates a router with express.Router()" },
        { match: String.raw`\b\w+\.get\s*\(\s*${q}/${q}\s*,[\s\S]*\bres\.json\s*\(`, message: "The router has a GET / route that uses res.json" },
        { match: String.raw`\b\w+\.get\s*\(\s*${q}/:id${q}\s*,`, message: "The router has a GET /:id route" },
        { match: String.raw`\bapp\.use\s*\(\s*${q}/api/books${q}\s*,\s*\w+\s*\)`, message: "Mounts the router with app.use(\"/api/books\", router)" },
      ],
    },
  },
  {
    title: "404 and error handlers",
    brief: "Add a catch-all 404 handler and an error-handling middleware that returns status 500 as JSON.",
    steps: [
      "Keep the GET /boom route that throws an error",
      "After all routes, add app.use((req, res) => res.status(404).json({ error: \"Not found\" }))",
      "Then add app.use((err, req, res, next) => ...) that responds with res.status(500).json({ error: ... })",
    ],
    level: "advanced",
    editor: "javascript",
    starter: `${header}\napp.get("/boom", (req, res) => {\n  throw new Error("Something broke");\n});\n\n// Add a 404 handler and an error handler\n${footer}`,
    solution: `${header}\napp.get("/boom", (req, res) => {\n  throw new Error("Something broke");\n});\n\napp.use((req, res) => {\n  res.status(404).json({ error: "Not found" });\n});\n\napp.use((err, req, res, next) => {\n  console.error(err.message);\n  res.status(500).json({ error: "Internal server error" });\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.get\s*\(\s*${q}/boom${q}`, message: "Keeps the GET /boom route" },
        { match: String.raw`\bres\.status\s*\(\s*404\s*\)\s*\.json\s*\(`, message: "A 404 handler responds with res.status(404).json(...)" },
        { match: String.raw`\(\s*err\w*\s*,\s*req\s*,\s*res\s*,\s*next\s*\)`, message: "An error handler with four parameters (err, req, res, next)" },
        { match: String.raw`\bres\.status\s*\(\s*500\s*\)\s*\.json\s*\(`, message: "The error handler responds with res.status(500).json(...)" },
      ],
    },
  },
  {
    title: "Todo CRUD API",
    brief: "Build an in-memory todo API with routes to list, create, update and delete todos, returning 404 when a todo doesn't exist.",
    steps: [
      "Use app.use(express.json()) and a todos array",
      "Add GET /todos, POST /todos (status 201), PUT /todos/:id and DELETE /todos/:id",
      "PUT and DELETE return res.status(404).json(...) when the id is not found",
      "DELETE responds with res.status(204).end() or res.sendStatus(204) on success",
    ],
    level: "advanced",
    editor: "javascript",
    starter: `${header}app.use(express.json());\n\nlet todos = [];\nlet nextId = 1;\n\napp.get("/todos", (req, res) => {\n  res.json(todos);\n});\n\n// Add POST /todos, PUT /todos/:id and DELETE /todos/:id\n${footer}`,
    solution: `${header}app.use(express.json());\n\nlet todos = [];\nlet nextId = 1;\n\napp.get("/todos", (req, res) => {\n  res.json(todos);\n});\n\napp.post("/todos", (req, res) => {\n  const todo = { id: nextId++, title: req.body.title, done: false };\n  todos.push(todo);\n  res.status(201).json(todo);\n});\n\napp.put("/todos/:id", (req, res) => {\n  const todo = todos.find((t) => t.id === Number(req.params.id));\n  if (!todo) return res.status(404).json({ error: "Todo not found" });\n  if (req.body.title !== undefined) todo.title = req.body.title;\n  if (req.body.done !== undefined) todo.done = req.body.done;\n  res.json(todo);\n});\n\napp.delete("/todos/:id", (req, res) => {\n  const index = todos.findIndex((t) => t.id === Number(req.params.id));\n  if (index === -1) return res.status(404).json({ error: "Todo not found" });\n  todos.splice(index, 1);\n  res.status(204).end();\n});\n${footer}`,
    check: {
      rules: [
        { match: String.raw`\bapp\.use\s*\(\s*express\.json\s*\(\s*\)\s*\)`, message: "Uses app.use(express.json())" },
        { match: String.raw`\bapp\.get\s*\(\s*${q}/todos${q}\s*,`, message: "Has GET /todos" },
        { match: String.raw`\bapp\.post\s*\(\s*${q}/todos${q}\s*,[\s\S]*?\bres\.status\s*\(\s*201\s*\)`, message: "Has POST /todos that responds with status 201" },
        { match: String.raw`\bapp\.put\s*\(\s*${q}/todos/:id${q}\s*,`, message: "Has PUT /todos/:id" },
        { match: String.raw`\bapp\.delete\s*\(\s*${q}/todos/:id${q}\s*,`, message: "Has DELETE /todos/:id" },
        { match: String.raw`\bres\.status\s*\(\s*404\s*\)\s*\.json\s*\([\s\S]*\bres\.status\s*\(\s*404\s*\)\s*\.json\s*\(`, message: "PUT and DELETE return res.status(404).json(...) when not found" },
        { match: String.raw`\bres\.(status\s*\(\s*204\s*\)\s*\.(end|send)\s*\(|sendStatus\s*\(\s*204\s*\))`, message: "DELETE responds with status 204" },
      ],
    },
  },
] satisfies ExerciseSeed[];
