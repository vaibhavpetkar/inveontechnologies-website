/**
 * The skill catalog behind the internship tracks: for every technology, a
 * short study lesson, three exam questions and five simple assignments.
 * Installed into the database by installCatalog() (idempotent), after which
 * staff can edit courses and assignments like any other content.
 */

export interface SkillAssignment {
  title: string;
  brief: string;
  steps: string[];
  deliverable?: "repo" | "link" | "text";
  level?: "basic" | "intermediate" | "advanced";
}

export interface SkillQuestion {
  q: string;
  options: string[]; // first option is not necessarily correct; see answer
  answer: number; // index into options
  why: string;
}

export interface Skill {
  key: string;
  label: string;
  lesson: string; // paragraphs separated by blank lines
  docs: string; // official documentation to learn from
  questions: SkillQuestion[];
  assignments: SkillAssignment[];
}

export const SKILLS: Skill[] = [
  {
    key: "html",
    label: "HTML5",
    docs: "https://developer.mozilla.org/en-US/docs/Learn/HTML",
    lesson: `HTML gives a web page its structure. Every page starts with a doctype, then html, head and body elements. The head holds the title, meta tags and links to stylesheets; the body holds what people see.

Learn the semantic elements (header, nav, main, section, article, aside, footer) and use them instead of plain divs: they help screen readers and search engines understand the page.

Practise text elements (headings h1 to h6 in order, paragraphs, lists), links and images (always with alt text), tables for tabular data only, and forms: label every input, pick the right input type (email, tel, date, number) and use required and pattern for simple validation.

Before you move on, run your pages through the W3C validator and fix every error.`,
    questions: [
      { q: "Which element should wrap the main content of a page, once per page?", options: ["<section>", "<main>", "<div id=\"main\">", "<body>"], answer: 1, why: "<main> marks the page's primary content and should appear once." },
      { q: "Why should every <img> have an alt attribute?", options: ["It makes images load faster", "It is required for CSS to work", "Screen readers read it, and it shows if the image fails to load", "It sets the image size"], answer: 2, why: "alt text is the accessible description of the image." },
      { q: "Which input type gives mobile users an email keyboard and basic validation?", options: ["type=\"text\"", "type=\"mail\"", "type=\"email\"", "type=\"address\""], answer: 2, why: "type=\"email\" validates the format and changes the mobile keyboard." },
    ],
    assignments: [
      { title: "Personal profile page", brief: "Build a single-page profile about yourself using only semantic HTML.", steps: ["Use header, main, section and footer elements", "Add a photo with meaningful alt text", "List your skills and education with ul and ol", "Validate the page with the W3C validator and fix all errors"] },
      { title: "Recipe page", brief: "Mark up a recipe with ingredients, steps and a nutrition table.", steps: ["Use an unordered list for ingredients and an ordered list for steps", "Add a table with a caption and th header cells", "Link to one external source that opens in a new tab safely (rel=\"noopener\")"] },
      { title: "Registration form", brief: "Create an internship registration form with proper labels and validation.", steps: ["Include name, email, phone, date of birth, course (select) and a message (textarea)", "Connect every label to its input with for/id", "Use required, type and pattern attributes for validation", "Group related fields with fieldset and legend"] },
      { title: "Multi-page site skeleton", brief: "Build a three-page site (Home, About, Contact) linked by a shared navigation bar.", steps: ["Create index.html, about.html and contact.html", "Put the same nav in each page and mark the current page with aria-current", "Embed a map or a video with an iframe on the contact page"], level: "intermediate" },
      { title: "Accessible blog article", brief: "Write a blog article page that scores 90+ for accessibility in Lighthouse.", steps: ["Use article, time, figure and figcaption", "Keep headings in order with no skipped levels", "Run Lighthouse and attach a screenshot of the accessibility score to your repo README"], level: "intermediate" },
    ],
  },
  {
    key: "css",
    label: "CSS3",
    docs: "https://developer.mozilla.org/en-US/docs/Learn/CSS",
    lesson: `CSS controls how HTML looks. Understand the cascade (which rule wins), specificity (id beats class beats element) and inheritance before anything else.

Master the box model: content, padding, border and margin. Set box-sizing: border-box on everything so widths behave predictably.

Layout today means Flexbox for one direction (a row of buttons, a nav bar) and Grid for two directions (a page layout, a card gallery). Learn justify-content, align-items, gap, grid-template-columns and the fr unit.

Make every page responsive: design for mobile first, then add media queries for wider screens. Use relative units (rem, %, vw) and CSS variables for colours and spacing so a theme can change in one place.`,
    questions: [
      { q: "With box-sizing: border-box, what does width include?", options: ["Only the content", "Content and padding", "Content, padding and border", "Content, padding, border and margin"], answer: 2, why: "border-box includes padding and border in the declared width, but not margin." },
      { q: "Which layout tool is best for a two-dimensional page layout with rows and columns?", options: ["Flexbox", "CSS Grid", "float", "position: absolute"], answer: 1, why: "Grid handles rows and columns together; Flexbox is one-dimensional." },
      { q: "Which selector has the highest specificity?", options: [".card .title", "#header", "div p", "a:hover"], answer: 1, why: "An id selector outweighs any number of classes and elements." },
    ],
    assignments: [
      { title: "Style your profile page", brief: "Style the HTML profile page from the HTML module with an external stylesheet.", steps: ["Use CSS variables for colours and font sizes", "Use a Google Font", "Add hover and focus styles for links and buttons"] },
      { title: "Responsive card grid", brief: "Build a grid of 6 product cards that shows 1, 2 or 3 columns depending on screen width.", steps: ["Use CSS Grid with gap", "Add media queries at 600px and 900px (mobile first)", "Make images cover their box with object-fit"] },
      { title: "Flexbox navigation bar", brief: "Create a navigation bar with a logo on the left and links on the right that collapses into a column on small screens.", steps: ["Use display: flex, justify-content and align-items", "Stack the links vertically below 600px", "Highlight the active link"] },
      { title: "Landing page clone", brief: "Recreate the hero section and features section of a real product's landing page.", steps: ["Match layout, spacing and typography as closely as you can", "Deploy it on GitHub Pages or Netlify", "Put the original's link and yours side by side in the README"], deliverable: "repo", level: "intermediate" },
      { title: "CSS animations", brief: "Add tasteful motion to a page: a loading spinner, a card hover lift and a fade-in on load.", steps: ["Use @keyframes for the spinner", "Use transition and transform for the hover effect", "Respect prefers-reduced-motion"], level: "intermediate" },
    ],
  },
  {
    key: "javascript",
    label: "JavaScript",
    docs: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript",
    lesson: `JavaScript makes pages interactive. Start with the language: let and const (avoid var), primitive types and objects, arrays and their methods (map, filter, reduce, find), functions and arrow functions, and template literals.

Understand scope and closures, and how this behaves. Use strict equality (===) always.

Work with the DOM: select elements with querySelector, react to events with addEventListener, and change the page by updating text, classes and attributes. Use event delegation for lists.

Asynchronous code is everywhere: learn promises, async/await and fetch for calling APIs, and always handle errors with try/catch. Finally, split code into ES modules with import and export.`,
    questions: [
      { q: "What does [1, 2, 3].map(n => n * 2) return?", options: ["6", "[2, 4, 6]", "[1, 2, 3]", "undefined"], answer: 1, why: "map returns a new array with each element transformed." },
      { q: "What is the result of 0 === \"0\"?", options: ["true", "false", "TypeError", "undefined"], answer: 1, why: "Strict equality compares types too; a number is never equal to a string." },
      { q: "Which keyword pauses an async function until a promise settles?", options: ["yield", "then", "await", "defer"], answer: 2, why: "await waits for the promise inside an async function." },
    ],
    assignments: [
      { title: "Tip calculator", brief: "Build a tip calculator that splits a bill between people.", steps: ["Inputs for bill amount, tip percentage and number of people", "Show tip per person and total per person as the user types", "Validate inputs and show friendly error messages"] },
      { title: "To-do list with local storage", brief: "Build a to-do app where tasks survive a page reload.", steps: ["Add, complete and delete tasks", "Filter by All, Active and Completed", "Save tasks in localStorage and load them on start"] },
      { title: "Weather app with fetch", brief: "Show the current weather for a city using a free weather API.", steps: ["Search by city name", "Show a loading state and handle errors (unknown city, no network)", "Use async/await and keep your API key out of the repo"], level: "intermediate" },
      { title: "Quiz game", brief: "Build a timed multiple-choice quiz with a score screen.", steps: ["Load questions from a JSON file", "Add a 15-second timer per question", "Show the score and the correct answers at the end"], level: "intermediate" },
      { title: "Array methods kata", brief: "Solve 10 small data problems using map, filter, reduce, sort and find only (no for loops).", steps: ["Write each solution as a function in its own module", "Add a short comment explaining each approach", "Include sample data and print the results with console.table"] },
    ],
  },
  {
    key: "bootstrap",
    label: "Bootstrap 5",
    docs: "https://getbootstrap.com/docs/5.3/getting-started/introduction/",
    lesson: `Bootstrap is a CSS framework with a responsive grid and ready-made components. Add it from the CDN or npm, and include the bundle script for interactive components.

The grid has a container, rows and columns with 12 units per row. Breakpoint classes (col-sm, col-md, col-lg) decide how columns stack on each screen size.

Learn the most used components: navbar, cards, buttons, forms, modal, alerts, badges and carousel. Use utility classes for spacing (m-3, p-2), flex (d-flex, justify-content-between) and text (text-center, fw-bold) instead of writing custom CSS.

Customise the look through CSS variables or Sass variables rather than overriding many classes.`,
    questions: [
      { q: "How many column units does a Bootstrap row have?", options: ["10", "12", "16", "24"], answer: 1, why: "The Bootstrap grid is 12 columns wide." },
      { q: "Which class makes a column take half the width from medium screens up?", options: ["col-6-md", "col-md-6", "md-col-6", "col-half-md"], answer: 1, why: "Breakpoint classes follow col-{breakpoint}-{size}." },
      { q: "Which utility class adds margin on all sides?", options: ["p-3", "m-3", "mx-3", "gap-3"], answer: 1, why: "m- is margin (p- is padding, mx- is left and right)." },
    ],
    assignments: [
      { title: "Responsive portfolio", brief: "Build a portfolio page with Bootstrap: navbar, hero, projects grid and contact form.", steps: ["Use the grid so projects show 1, 2 or 3 per row", "Make the navbar collapse into a menu on mobile", "Use only Bootstrap utilities; custom CSS under 30 lines"] },
      { title: "Admin dashboard layout", brief: "Create a dashboard with a sidebar, stat cards and a data table.", steps: ["Sidebar that becomes an offcanvas on mobile", "Four stat cards in a row on desktop", "A striped, responsive table with badges for status"], level: "intermediate" },
      { title: "Product listing with modal", brief: "Show products as cards; clicking one opens a modal with details.", steps: ["Use card and modal components", "Add a filter by category with button groups", "Keep it accessible: focus returns to the card when the modal closes"] },
      { title: "Sign-up form with validation", brief: "Build a sign-up form using Bootstrap's validation styles.", steps: ["Show valid and invalid feedback under each field", "Check that the passwords match with a little JavaScript", "Show a success alert on submit"] },
      { title: "Theme customisation", brief: "Give Bootstrap your own brand colours and fonts.", steps: ["Override Bootstrap CSS variables or compile Sass with your palette", "Add a light and dark mode toggle", "Document the theme choices in the README"], level: "intermediate" },
    ],
  },
  {
    key: "react",
    label: "React",
    docs: "https://react.dev/learn",
    lesson: `React builds interfaces out of components: functions that take props and return JSX. Keep components small and focused, and compose them.

State lives in useState; when it changes, React re-renders. Lift state up to the closest common parent when two components need it. Never mutate state directly: create new arrays and objects.

Use useEffect only to sync with things outside React (fetching data, timers, subscriptions), and always clean up. Render lists with a stable key.

Learn controlled forms, conditional rendering, custom hooks for reusable logic, routing with React Router, and fetching data with loading and error states. Start new projects with Vite.`,
    questions: [
      { q: "What must you give each element rendered from an array?", options: ["An id attribute", "A stable key prop", "A ref", "A className"], answer: 1, why: "Keys let React match list items between renders." },
      { q: "How should you add an item to an array held in state?", options: ["items.push(x)", "setItems([...items, x])", "items[items.length] = x", "setItems(items.push(x))"], answer: 1, why: "State must be replaced with a new array, not mutated." },
      { q: "When does a useEffect with an empty dependency array run?", options: ["On every render", "Once, after the first render", "Before the first render", "Never"], answer: 1, why: "With [] the effect runs after mount (and cleans up on unmount)." },
    ],
    assignments: [
      { title: "Counter and theme toggle", brief: "Warm up with state: a counter with step size and a light/dark theme toggle.", steps: ["Use useState for count, step and theme", "Disable decrement below zero", "Persist the theme in localStorage"] },
      { title: "React to-do app", brief: "Rebuild the to-do app in React with components.", steps: ["Split into TodoForm, TodoList and TodoItem components", "Support edit, complete, delete and filter", "Write one custom hook, useLocalStorage"] },
      { title: "Movie search", brief: "Search a public movie API and show results with details pages.", steps: ["Debounce the search input", "Use React Router for /movie/:id", "Show loading skeletons and handle errors"], level: "intermediate" },
      { title: "Shopping cart", brief: "Build a small store with a cart shared across pages.", steps: ["Use Context or useReducer for cart state", "Show item count in the header", "Calculate subtotal, tax and total"], level: "intermediate" },
      { title: "Dashboard with charts", brief: "Build a dashboard that fetches JSON data and shows it as charts and a sortable table.", steps: ["Use any chart library (Recharts or Chart.js)", "Make the table sortable by each column", "Deploy on Vercel or Netlify and link it"], deliverable: "repo", level: "advanced" },
    ],
  },
  {
    key: "python",
    label: "Python",
    docs: "https://docs.python.org/3/tutorial/",
    lesson: `Python is readable and versatile. Learn the basics first: variables, numbers and strings, f-strings, lists, tuples, dictionaries and sets, and when to use each.

Control flow with if, for and while, and list and dict comprehensions. Write functions with default and keyword arguments, and document them with docstrings.

Learn to read and write files with with open(...), handle errors with try/except, and organise code into modules and packages. Use virtual environments (python -m venv) and pip for dependencies.

Then learn object-oriented Python: classes, __init__, methods, inheritance and dataclasses. Follow PEP 8 for style.`,
    questions: [
      { q: "Which data type stores unique, unordered values?", options: ["list", "tuple", "set", "dict"], answer: 2, why: "A set keeps only unique items and has no order." },
      { q: "What does [x * x for x in range(3)] produce?", options: ["[1, 4, 9]", "[0, 1, 4]", "[0, 1, 2]", "9"], answer: 1, why: "range(3) is 0, 1, 2; squared they are 0, 1, 4." },
      { q: "Why open files with a with statement?", options: ["It is faster", "The file is closed automatically, even on errors", "It makes the file read-only", "It is required in Python 3"], answer: 1, why: "The context manager closes the file for you." },
    ],
    assignments: [
      { title: "Number guessing game", brief: "Write a command-line guessing game with difficulty levels.", steps: ["Pick a random number with the random module", "Give higher/lower hints and count attempts", "Handle non-numeric input without crashing"] },
      { title: "Student marks report", brief: "Read student marks from a CSV file and print a report.", steps: ["Use the csv module", "Calculate average, highest and grade per student", "Write the report to a new CSV file"] },
      { title: "Bank account classes", brief: "Model bank accounts with classes.", steps: ["Create Account, SavingsAccount (interest) and CurrentAccount (overdraft) classes", "Raise a custom exception for insufficient funds", "Write tests with unittest or pytest"], level: "intermediate" },
      { title: "Expense tracker CLI", brief: "Build a command-line expense tracker that stores data in JSON.", steps: ["Commands to add, list, delete and summarise by category", "Use argparse for commands", "Save and load expenses from a JSON file"], level: "intermediate" },
      { title: "API data fetcher", brief: "Fetch data from a public API and analyse it.", steps: ["Use the requests library in a virtual environment", "Save results to a file and print three insights", "Include requirements.txt and a README with how to run it"] },
    ],
  },
  {
    key: "django",
    label: "Django",
    docs: "https://docs.djangoproject.com/en/stable/intro/tutorial01/",
    lesson: `Django is a batteries-included Python web framework. A project holds settings and URLs; apps hold features. Create them with django-admin startproject and python manage.py startapp.

Models describe your data; makemigrations and migrate turn them into database tables. The ORM lets you query with Model.objects.filter(...) instead of SQL.

Views take a request and return a response; URLs map paths to views; templates render HTML with the Django template language. Prefer class-based generic views (ListView, DetailView, CreateView) for common pages.

Use Django forms and ModelForms for validation, the built-in auth for login and logout, and the admin site for managing data. For APIs, learn Django REST Framework serializers and viewsets.`,
    questions: [
      { q: "Which command creates migration files from model changes?", options: ["python manage.py migrate", "python manage.py makemigrations", "python manage.py syncdb", "python manage.py createmodels"], answer: 1, why: "makemigrations writes the migration; migrate applies it." },
      { q: "Where do you map a URL path to a view?", options: ["models.py", "urls.py", "settings.py", "admin.py"], answer: 1, why: "urlpatterns in urls.py map paths to views." },
      { q: "Which ORM call returns all posts by one author?", options: ["Post.objects.get(author=a)", "Post.objects.filter(author=a)", "Post.filter(author=a)", "Post.objects.all(author=a)"], answer: 1, why: "filter returns a queryset of every match; get returns exactly one." },
    ],
    assignments: [
      { title: "Blog with the admin", brief: "Build a blog app with posts and categories managed from the Django admin.", steps: ["Create Post and Category models with a slug field", "Register them in admin with list filters and search", "Show a post list and detail page with templates"] },
      { title: "User accounts", brief: "Add sign-up, login, logout and a profile page to the blog.", steps: ["Use django.contrib.auth views", "Only logged-in users can create posts (LoginRequiredMixin)", "Users can edit only their own posts"], level: "intermediate" },
      { title: "Contact form with email", brief: "Create a contact form that validates input and sends an email.", steps: ["Use a Django Form with custom validation", "Send the email with the console email backend in development", "Show a success message with the messages framework"] },
      { title: "REST API with DRF", brief: "Expose the blog posts as a REST API with Django REST Framework.", steps: ["Create serializers and a ModelViewSet", "Add pagination and filtering by category", "Protect write actions with token authentication"], level: "advanced" },
      { title: "Deploy the blog", brief: "Deploy your Django project to a free host.", steps: ["Move secrets to environment variables", "Set DEBUG=False and configure static files", "Share the live link in the README"], deliverable: "link", level: "intermediate" },
    ],
  },
  {
    key: "mysql",
    label: "MySQL",
    docs: "https://dev.mysql.com/doc/refman/8.0/en/tutorial.html",
    lesson: `Relational databases store data in tables with rows and columns. Design tables so each fact is stored once (normalisation), give each table a primary key, and link tables with foreign keys.

Learn SQL in this order: SELECT with WHERE, ORDER BY and LIMIT; INSERT, UPDATE and DELETE (always with a WHERE); aggregate functions (COUNT, SUM, AVG) with GROUP BY and HAVING; and JOINs (INNER, LEFT) to combine tables.

Add indexes to columns you search or join on, and check queries with EXPLAIN. Use transactions (START TRANSACTION, COMMIT, ROLLBACK) when several changes must succeed together.

From application code, always use parameterised queries to prevent SQL injection.`,
    questions: [
      { q: "Which JOIN returns every row from the left table even without a match?", options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"], answer: 1, why: "LEFT JOIN keeps all left rows and fills missing right columns with NULL." },
      { q: "Which clause filters groups after aggregation?", options: ["WHERE", "HAVING", "ORDER BY", "LIMIT"], answer: 1, why: "HAVING filters grouped results; WHERE filters rows before grouping." },
      { q: "What is the best defence against SQL injection?", options: ["Escaping quotes by hand", "Parameterised queries", "Using stored procedures only", "Hiding error messages"], answer: 1, why: "Parameters keep data separate from the SQL text." },
    ],
    assignments: [
      { title: "Library database design", brief: "Design and create a database for a small library.", steps: ["Tables for books, authors, members and loans with keys", "Draw an ER diagram and add it to the repo", "Insert at least 10 rows of sample data per table"] },
      { title: "Twenty queries", brief: "Write 20 queries on the library database, from simple to advanced.", steps: ["Include filters, sorting, GROUP BY and HAVING", "Include INNER and LEFT JOINs and one subquery", "Save them in a .sql file with a comment above each"] },
      { title: "Views and indexes", brief: "Speed up and simplify common queries.", steps: ["Create two views for common reports", "Add indexes and compare EXPLAIN output before and after", "Write down what changed in the README"], level: "intermediate" },
      { title: "Transactions", brief: "Model a money transfer between two accounts safely.", steps: ["Use a transaction so both updates succeed or neither does", "Show a failing case being rolled back", "Explain isolation in a few sentences"], level: "intermediate" },
      { title: "Connect from an app", brief: "Connect to MySQL from Node.js, Python or Java and build a small CRUD script.", steps: ["Use parameterised queries only", "Read the connection details from environment variables", "Handle connection errors cleanly"], level: "intermediate" },
    ],
  },
  {
    key: "c",
    label: "C Programming",
    docs: "https://en.cppreference.com/w/c",
    lesson: `C teaches you how programs work close to the machine. Start with data types, operators, input and output with printf and scanf, and control flow.

Write functions and understand how arguments are passed by value. Work with arrays and strings (character arrays ending in \\0) carefully, always within bounds.

Pointers are the heart of C: a pointer holds an address; & takes an address and * dereferences it. Use pointers to change variables inside functions and to walk through arrays.

Allocate memory with malloc and always free it. Group data with struct, and read and write files with fopen, fprintf, fscanf and fclose. Compile with gcc -Wall -Wextra and fix every warning.`,
    questions: [
      { q: "What does the & operator give you in C?", options: ["The value at an address", "The address of a variable", "A logical AND", "A reference type"], answer: 1, why: "&x is the address of x (as a unary operator)." },
      { q: "What must you do with memory from malloc when you're done?", options: ["Nothing", "Call free()", "Call delete", "Set it to 0"], answer: 1, why: "Heap memory stays allocated until you free it." },
      { q: "How does a C string end?", options: ["With a newline", "With a null character \\0", "With its length stored first", "With EOF"], answer: 1, why: "C strings are terminated by the null character." },
    ],
    assignments: [
      { title: "Calculator menu", brief: "Write a menu-driven calculator program.", steps: ["Support +, -, *, / and % with a switch", "Handle division by zero", "Loop until the user chooses Exit"] },
      { title: "Array utilities", brief: "Write functions for common array tasks.", steps: ["Find min, max and average", "Reverse an array in place using pointers", "Implement bubble sort and binary search"] },
      { title: "String functions", brief: "Re-implement common string functions without string.h.", steps: ["my_strlen, my_strcpy, my_strcmp and my_strrev", "Count vowels and words in a sentence", "Test each function in main"] },
      { title: "Student records with structs", brief: "Manage student records using structs and dynamic memory.", steps: ["Store records in a malloc'd array that grows as needed", "Add, list, search and delete students", "Save and load records from a file"], level: "intermediate" },
      { title: "Linked list", brief: "Implement a singly linked list.", steps: ["Insert at head, tail and position", "Delete by value and reverse the list", "Free every node and check with valgrind"], level: "advanced" },
    ],
  },
  {
    key: "cpp",
    label: "C++",
    docs: "https://en.cppreference.com/w/cpp",
    lesson: `C++ adds classes, templates and a rich standard library to C. Use modern C++ (C++17 or later).

Object-oriented C++: classes with constructors and destructors, access specifiers, inheritance, virtual functions for polymorphism, and operator overloading where it reads naturally.

Prefer the standard library over hand-written structures: std::string, std::vector, std::map and std::unordered_map, and algorithms such as std::sort and std::find_if with lambdas.

Manage resources with RAII: objects clean up in their destructors. Use std::unique_ptr and std::shared_ptr instead of raw new and delete. Pass large objects by const reference.`,
    questions: [
      { q: "Which smart pointer has a single owner?", options: ["std::shared_ptr", "std::unique_ptr", "std::weak_ptr", "std::auto_ptr"], answer: 1, why: "unique_ptr owns its object exclusively and cannot be copied." },
      { q: "What makes a member function dispatch on the object's real type?", options: ["static", "virtual", "inline", "const"], answer: 1, why: "virtual functions enable runtime polymorphism." },
      { q: "Which container gives average O(1) lookup by key?", options: ["std::vector", "std::map", "std::unordered_map", "std::list"], answer: 2, why: "unordered_map is a hash table; std::map is a balanced tree (O(log n))." },
    ],
    assignments: [
      { title: "Shapes with polymorphism", brief: "Model shapes with an abstract base class.", steps: ["Shape with virtual area() and perimeter()", "Circle, Rectangle and Triangle subclasses", "Store them in a vector<unique_ptr<Shape>> and print each"] },
      { title: "Library management", brief: "Build a console library system with classes.", steps: ["Book and Member classes, and a Library that manages them", "Issue and return books with due dates", "Use std::map for lookups"], level: "intermediate" },
      { title: "STL word counter", brief: "Count word frequencies in a text file.", steps: ["Read the file with ifstream", "Use unordered_map and sort the top 10 with std::sort", "Ignore case and punctuation"] },
      { title: "Matrix class", brief: "Write a Matrix class with operator overloading.", steps: ["Overload +, -, * and <<", "Throw an exception when sizes don't match", "Follow the rule of zero with std::vector storage"], level: "intermediate" },
      { title: "Bank system with files", brief: "Persist accounts between runs.", steps: ["Save and load accounts from a file", "Validate every transaction", "Write a small test in main or with a test framework"], level: "intermediate" },
    ],
  },
  {
    key: "csharp",
    label: "C#",
    docs: "https://learn.microsoft.com/en-us/dotnet/csharp/",
    lesson: `C# is a modern, strongly typed language for .NET. Install the .NET SDK and create projects with dotnet new console and dotnet run.

Learn types (value and reference), strings and interpolation, collections (List<T>, Dictionary<TKey, TValue>) and control flow. Understand properties, classes, interfaces, inheritance and records.

LINQ lets you query collections: Where, Select, OrderBy, GroupBy and First. Handle errors with exceptions, and use async and await with Task for I/O.

For web work, learn ASP.NET Core minimal APIs or controllers and Entity Framework Core for databases.`,
    questions: [
      { q: "Which LINQ method filters a sequence?", options: ["Select", "Where", "OrderBy", "Aggregate"], answer: 1, why: "Where keeps the elements that match a condition." },
      { q: "Which type is best for key-value lookups?", options: ["List<T>", "Dictionary<TKey, TValue>", "Array", "Queue<T>"], answer: 1, why: "Dictionary gives fast lookup by key." },
      { q: "Which command runs a .NET project from the terminal?", options: ["dotnet start", "dotnet run", "csc run", "net run"], answer: 1, why: "dotnet run builds and runs the project." },
    ],
    assignments: [
      { title: "Console grade book", brief: "Build a grade book console app.", steps: ["Store students and marks in a List of a record type", "Show average, highest and grade with LINQ", "Validate user input with int.TryParse"] },
      { title: "Inventory with interfaces", brief: "Model a shop inventory with interfaces and inheritance.", steps: ["An IProduct interface with two product classes", "Add, remove and search products", "Save the inventory to a JSON file with System.Text.Json"], level: "intermediate" },
      { title: "LINQ exercises", brief: "Answer 10 questions about a sample employee list with LINQ.", steps: ["Use Where, Select, GroupBy, OrderBy and Sum", "Print results in a table", "Write each query in both method and query syntax for two of them"] },
      { title: "Async file downloader", brief: "Download several files at once with async/await.", steps: ["Use HttpClient and Task.WhenAll", "Show progress for each file", "Handle timeouts and failed downloads"], level: "intermediate" },
      { title: "Minimal Web API", brief: "Build a to-do REST API with ASP.NET Core.", steps: ["GET, POST, PUT and DELETE endpoints", "Use Entity Framework Core with SQLite", "Document the API with Swagger"], level: "advanced" },
    ],
  },
  {
    key: "java_core",
    label: "Core Java",
    docs: "https://dev.java/learn/",
    lesson: `Java is object-oriented and runs on the JVM. Install a current JDK (17 or 21) and learn to compile and run from the terminal before using an IDE.

Cover the basics: primitive types and wrappers, String and StringBuilder, arrays, control flow and methods. Then the four OOP pillars: encapsulation (private fields, getters), inheritance, polymorphism (overriding) and abstraction (abstract classes and interfaces).

Learn exceptions (checked versus unchecked, try-with-resources) and the Collections Framework: List (ArrayList), Set (HashSet), Map (HashMap) and when to use each. Implement equals and hashCode together.

Finish with generics, enums and file I/O using java.nio.file.`,
    questions: [
      { q: "Which collection keeps no duplicates?", options: ["ArrayList", "HashSet", "LinkedList", "Vector"], answer: 1, why: "A Set never holds duplicate elements." },
      { q: "If you override equals(), what else must you override?", options: ["toString()", "hashCode()", "compareTo()", "clone()"], answer: 1, why: "Equal objects must have equal hash codes for HashMap and HashSet to work." },
      { q: "What does try-with-resources do?", options: ["Retries on failure", "Closes resources automatically", "Catches all exceptions", "Runs code in a new thread"], answer: 1, why: "Resources declared in try(...) are closed automatically." },
    ],
    assignments: [
      { title: "Employee payroll", brief: "Model employees and compute their pay with OOP.", steps: ["Abstract Employee class with FullTime and PartTime subclasses", "Override calculatePay() in each", "Keep fields private with getters"] },
      { title: "Collections practice", brief: "Solve problems with the right collection.", steps: ["Remove duplicates from a list with a Set", "Count word frequency with a HashMap", "Sort objects with Comparator"] },
      { title: "Library system", brief: "Build a console library system.", steps: ["Books, members and loans as classes", "Custom exceptions for unavailable books", "Save data to a file with java.nio.file"], level: "intermediate" },
      { title: "Bank ATM simulation", brief: "Simulate an ATM with PIN check, deposit, withdraw and statement.", steps: ["Use encapsulation for the balance", "Validate every input", "Print a mini statement of the last 5 transactions"] },
      { title: "Generic repository", brief: "Write a generic in-memory repository class.", steps: ["Repository<T, ID> with save, findById, findAll and delete", "Use it for two different entity types", "Write JUnit tests"], level: "intermediate" },
    ],
  },
  {
    key: "java_advanced",
    label: "Advanced Java",
    docs: "https://dev.java/learn/",
    lesson: `Advanced Java covers the features every backend developer uses daily.

Functional Java: lambdas, method references and the Stream API (filter, map, collect, groupingBy). Use Optional instead of returning null.

Concurrency: threads, the ExecutorService, CompletableFuture for asynchronous work, and thread safety with synchronized, locks and concurrent collections.

Databases with JDBC: connections, PreparedStatement (never string concatenation), transactions and connection pools.

Build tools and testing: Maven or Gradle for dependencies and builds, JUnit 5 for unit tests, and Mockito for mocks. Learn the web basics too: Servlets, HTTP methods and JSON with Jackson.`,
    questions: [
      { q: "Which Stream operation groups elements into a Map?", options: ["Collectors.toList()", "Collectors.groupingBy()", "Stream.reduce()", "Stream.flatMap()"], answer: 1, why: "groupingBy collects elements into a Map by a classifier." },
      { q: "Which JDBC type protects against SQL injection?", options: ["Statement", "PreparedStatement", "ResultSet", "Connection"], answer: 1, why: "PreparedStatement binds parameters separately from SQL." },
      { q: "What should replace creating raw Threads for many small tasks?", options: ["An ExecutorService thread pool", "More threads", "Thread.sleep", "System.exit"], answer: 0, why: "A thread pool reuses threads and manages the workload." },
    ],
    assignments: [
      { title: "Streams report", brief: "Produce a sales report from a list of orders using only streams.", steps: ["Total and average per customer with groupingBy", "Top 5 products by revenue", "Use Optional where a value may be missing"] },
      { title: "JDBC CRUD app", brief: "Build a student CRUD console app on MySQL with JDBC.", steps: ["Use PreparedStatement for every query", "Use a transaction for bulk inserts", "Read the database URL from a properties file"], level: "intermediate" },
      { title: "Concurrent file processor", brief: "Process many text files in parallel.", steps: ["Use an ExecutorService with a fixed pool", "Merge word counts safely with ConcurrentHashMap", "Compare time with the single-threaded version"], level: "advanced" },
      { title: "Maven project with tests", brief: "Turn one of your earlier projects into a Maven project with tests.", steps: ["Standard Maven layout and a pom.xml", "At least 8 JUnit 5 tests, one with Mockito", "A README showing mvn test output"], level: "intermediate" },
      { title: "REST client", brief: "Call a public REST API with java.net.http.HttpClient and parse JSON.", steps: ["Use Jackson to map JSON to classes", "Make the calls asynchronously with CompletableFuture", "Handle HTTP errors"], level: "intermediate" },
    ],
  },
  {
    key: "spring_boot",
    label: "Spring Boot",
    docs: "https://spring.io/guides",
    lesson: `Spring Boot makes Java web services quick to build. Generate a project at start.spring.io with Spring Web, Spring Data JPA, Validation and your database driver.

Understand dependency injection: classes annotated @Service, @Repository and @RestController are created by Spring and injected through constructors.

Build REST APIs with @GetMapping, @PostMapping and friends, request bodies with @RequestBody and @Valid, and consistent errors with @ControllerAdvice. Structure code in layers: controller, service, repository.

Persist data with JPA entities and Spring Data repositories, configure environments with application.properties and profiles, and secure endpoints with Spring Security and JWT. Test with @SpringBootTest and MockMvc.`,
    questions: [
      { q: "Which annotation marks a class that handles REST requests?", options: ["@Service", "@RestController", "@Repository", "@Entity"], answer: 1, why: "@RestController combines @Controller and @ResponseBody." },
      { q: "What does extending JpaRepository give you?", options: ["A web server", "Ready-made CRUD methods", "Security", "Caching"], answer: 1, why: "Spring Data generates save, findById, findAll, delete and more." },
      { q: "Where do you handle exceptions for all controllers in one place?", options: ["@ControllerAdvice", "@Configuration", "@Bean", "@Component"], answer: 0, why: "@ControllerAdvice with @ExceptionHandler applies across controllers." },
    ],
    assignments: [
      { title: "Hello REST API", brief: "Create your first Spring Boot API with a few endpoints.", steps: ["GET /api/hello and GET /api/hello/{name}", "A POST endpoint that validates its body", "Run it and test with Postman or curl"] },
      { title: "Student management API", brief: "Build a CRUD API for students with MySQL.", steps: ["Entity, repository, service and controller layers", "Validation and a global exception handler", "Pagination and sorting on the list endpoint"], level: "intermediate" },
      { title: "Relationships", brief: "Add courses to the student API with a many-to-many relationship.", steps: ["Enroll and unenroll students", "Avoid infinite JSON recursion with DTOs", "List a student's courses"], level: "intermediate" },
      { title: "JWT security", brief: "Secure the API with Spring Security and JWT.", steps: ["Register and login endpoints that issue a token", "Protect write endpoints; allow reads for everyone", "Store passwords with BCrypt"], level: "advanced" },
      { title: "Tests and Docker", brief: "Test the API and run it in Docker.", steps: ["Controller tests with MockMvc and service tests with Mockito", "A Dockerfile and docker-compose.yml with MySQL", "Document endpoints with springdoc OpenAPI"], level: "advanced" },
    ],
  },
  {
    key: "node_express",
    label: "Node.js and Express",
    docs: "https://expressjs.com/en/starter/installing.html",
    lesson: `Node.js runs JavaScript on the server. Learn modules (ES modules with import), npm and package.json scripts, the fs and path modules, and the event loop: why long synchronous work blocks every request.

Express builds web servers: app.get and friends define routes, middleware runs in order (express.json(), logging, authentication), and routers split an app into modules. Always send a response or call next(err).

Build REST APIs with proper status codes, validate input (for example with zod or express-validator), and handle errors in one error-handling middleware.

Connect to a database (MySQL with mysql2 or an ORM such as Prisma), keep secrets in environment variables, hash passwords with bcrypt and authenticate with JWT.`,
    questions: [
      { q: "What does express.json() do?", options: ["Sends JSON responses", "Parses JSON request bodies into req.body", "Validates JSON", "Converts routes to JSON"], answer: 1, why: "It is body-parsing middleware for JSON requests." },
      { q: "Which status code fits a successful POST that created a resource?", options: ["200", "201", "204", "302"], answer: 1, why: "201 Created is the standard response for a created resource." },
      { q: "Why avoid long synchronous work in a Node request handler?", options: ["It uses more memory", "It blocks the event loop for every other request", "Express forbids it", "It disables middleware"], answer: 1, why: "Node runs JavaScript on one thread; blocking it stalls the server." },
    ],
    assignments: [
      { title: "File-based notes API", brief: "Build a notes REST API that stores notes in a JSON file.", steps: ["GET, POST, PUT and DELETE /notes", "Validate the body and return proper status codes", "Use an error-handling middleware"] },
      { title: "Express with MySQL", brief: "Move the notes API to MySQL.", steps: ["Use mysql2 or Prisma with parameterised queries", "Split into routes, controllers and a data layer", "Keep the connection string in .env (not committed)"], level: "intermediate" },
      { title: "Authentication", brief: "Add sign-up and login with JWT to the API.", steps: ["Hash passwords with bcrypt", "An auth middleware that checks the token", "Users only see their own notes"], level: "intermediate" },
      { title: "File uploads", brief: "Let users attach an image to a note.", steps: ["Use multer with size and type limits", "Serve uploaded images safely", "Delete the file when the note is deleted"], level: "intermediate" },
      { title: "Full-stack app", brief: "Connect your React front end to your Express API.", steps: ["Handle CORS correctly", "Show loading and error states in the UI", "Deploy both parts and share the links"], deliverable: "repo", level: "advanced" },
    ],
  },
  {
    key: "devops",
    label: "DevOps",
    docs: "https://docs.docker.com/get-started/",
    lesson: `DevOps is how code gets from a laptop to production reliably. Start with Linux and the shell: files and permissions, processes, ssh, and small bash scripts.

Git beyond basics: branches, pull requests, rebasing and resolving conflicts, and a clean commit history.

Containers: write a Dockerfile, build and run images, use multi-stage builds for small images, and run several services with Docker Compose.

CI/CD: automate tests and builds with GitHub Actions on every push and pull request, then deploy automatically. Learn Nginx as a reverse proxy, HTTPS with Let's Encrypt, environment-based configuration, and basic monitoring and logs.`,
    questions: [
      { q: "What does a multi-stage Docker build help with?", options: ["Running multiple containers", "Smaller final images without build tools", "Faster networking", "Automatic scaling"], answer: 1, why: "Build in one stage, copy only the output into a slim final stage." },
      { q: "Where do GitHub Actions workflows live?", options: [".github/workflows/", ".git/hooks/", "actions/", ".ci/"], answer: 0, why: "Workflow YAML files go in .github/workflows." },
      { q: "What is Nginx commonly used for in front of an app server?", options: ["As a database", "As a reverse proxy and TLS terminator", "As a build tool", "As a package manager"], answer: 1, why: "Nginx proxies requests to the app and handles HTTPS." },
    ],
    assignments: [
      { title: "Linux and bash basics", brief: "Write three useful bash scripts.", steps: ["A backup script that zips a folder with a date in the name", "A script that reports disk and memory usage", "A script that checks if a website is up"] },
      { title: "Dockerise an app", brief: "Containerise one of your earlier projects.", steps: ["Write a Dockerfile (multi-stage if it has a build step)", "Add a .dockerignore", "Document docker build and docker run in the README"] },
      { title: "Docker Compose stack", brief: "Run an app with its database using Docker Compose.", steps: ["App and MySQL services with a named volume", "Configuration through environment variables", "A healthcheck for the database"], level: "intermediate" },
      { title: "CI pipeline", brief: "Add GitHub Actions to a project.", steps: ["Run lint and tests on every push and pull request", "Build the Docker image in CI", "Show the passing badge in the README"], level: "intermediate" },
      { title: "Deploy behind Nginx", brief: "Deploy an app on a Linux VM behind Nginx with HTTPS.", steps: ["Nginx reverse proxy to your container", "HTTPS with Let's Encrypt (or a self-signed cert, documented)", "A short runbook for redeploying"], deliverable: "text", level: "advanced" },
    ],
  },
  {
    key: "cloud",
    label: "Cloud (AWS)",
    docs: "https://aws.amazon.com/getting-started/",
    lesson: `Cloud platforms rent you computing on demand. This module uses AWS; the ideas carry over to Azure and Google Cloud. Use the free tier and set a billing alarm on day one.

Identity first: IAM users, roles and policies with least privilege. Never use the root account for daily work, and never commit access keys.

Core services: EC2 virtual machines, S3 object storage, RDS managed databases, and VPC networking with security groups. Learn when a managed service beats running it yourself.

Serverless and scale: Lambda functions, API Gateway, load balancers and auto scaling groups. Finish with infrastructure as code (CloudFormation or Terraform) so environments can be recreated from files.`,
    questions: [
      { q: "What is the principle of least privilege?", options: ["Give everyone admin to avoid delays", "Grant only the permissions a task needs", "Use one shared account", "Disable IAM"], answer: 1, why: "Limit permissions to what is needed, to reduce damage from mistakes or leaks." },
      { q: "Which AWS service stores files as objects in buckets?", options: ["EC2", "S3", "RDS", "Lambda"], answer: 1, why: "S3 is object storage." },
      { q: "What controls which traffic can reach an EC2 instance?", options: ["IAM policy", "Security group", "S3 bucket policy", "Route 53"], answer: 1, why: "Security groups are the instance-level firewall." },
    ],
    assignments: [
      { title: "Account setup and IAM", brief: "Set up a safe AWS account for learning.", steps: ["Enable MFA on the root account and create an admin IAM user", "Create a billing alarm", "Write up the steps with screenshots (no keys!)"], deliverable: "text" },
      { title: "Static site on S3", brief: "Host a static website on S3 (optionally with CloudFront).", steps: ["Upload your portfolio to a bucket", "Configure static website hosting", "Share the public URL"], deliverable: "link" },
      { title: "App on EC2", brief: "Deploy an app on an EC2 instance.", steps: ["Launch an instance and restrict SSH to your IP", "Install your app or its Docker image", "Open only the ports you need in the security group"], level: "intermediate", deliverable: "text" },
      { title: "Serverless API", brief: "Build a small API with Lambda and API Gateway.", steps: ["One Lambda function for GET and POST", "Store data in DynamoDB", "Test with curl and document the endpoint"], level: "intermediate" },
      { title: "Infrastructure as code", brief: "Describe a small environment in Terraform or CloudFormation.", steps: ["An S3 bucket and an EC2 instance with a security group", "Variables for names and sizes", "Commands to create and destroy it in the README"], level: "advanced" },
    ],
  },
];

export const SKILL_LABELS: Record<string, string> = Object.fromEntries(SKILLS.map((s) => [s.key, s.label]));
