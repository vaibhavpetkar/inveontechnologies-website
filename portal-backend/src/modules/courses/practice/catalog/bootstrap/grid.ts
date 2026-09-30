import type { PracticeUnit } from "../../types.js";
import { bq, el, page } from "./shared.js";

export const grid: PracticeUnit = {
  key: "grid",
  title: "Setup, containers and the grid",
  summary: "loading Bootstrap 5.3 from a CDN, containers, rows, columns, breakpoints, gutters, offsets and alignment",
  reading: String.raw`## What Bootstrap is

Bootstrap is a CSS and JavaScript toolkit. Instead of writing your own CSS for every button and layout, you add ready-made class names to your HTML: class="btn btn-primary" gives you a styled button, class="row" and class="col-md-6" give you a responsive two-column layout. Version 5.3 is current. It needs no jQuery; its JavaScript (for menus, modals and so on) is plain JavaScript bundled with Popper.

## Loading it from a CDN

The fastest setup is the CDN (content delivery network): one stylesheet in the head and one script at the end of the body.

` + "```html" + String.raw`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My page</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
</head>
<body>
  <div class="container">
    <h1>Hello, Bootstrap!</h1>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
` + "```" + String.raw`

- The viewport meta tag is not optional. Without it phones pretend to be 980px wide and your responsive classes never kick in.
- Use bootstrap.bundle.min.js: the bundle includes Popper, which dropdowns, tooltips and popovers need.
- In real projects you can also install it with npm install bootstrap and import it from your build tool.

## Containers

Every layout starts with a container, which centres your content and adds side padding.

- container: a fixed max-width that grows at each breakpoint.
- container-fluid: always 100% wide.
- container-md (or -sm, -lg, -xl, -xxl): 100% wide until that breakpoint, then fixed like container.

## Breakpoints

Bootstrap is mobile first. Classes without a breakpoint apply to every screen; classes with one apply from that width upward.

- sm: 576px and up
- md: 768px and up
- lg: 992px and up
- xl: 1200px and up
- xxl: 1400px and up

So col-md-6 means "half width from 768px up, full width below".

## Rows and columns

The grid has 12 columns. A row holds columns; a column's number says how many of the 12 it takes.

` + "```html" + String.raw`
<div class="container">
  <div class="row">
    <div class="col-12 col-md-8">Main content</div>
    <div class="col-12 col-md-4">Sidebar</div>
  </div>
</div>
` + "```" + String.raw`

- col (no number) shares the space equally with its siblings.
- col-auto sizes to its content.
- row-cols-2, row-cols-md-3 set how many columns per row from the row itself, handy for card grids.
- Columns can be nested: put a new row inside a column.
- If the numbers in a row add up to more than 12, the extra columns wrap to a new line.

## Gutters, offsets and order

- Gutters are the gaps between columns. Change them on the row: g-0 removes them, g-4 makes them bigger, gx-3 is horizontal only and gy-3 vertical only.
- offset-md-2 pushes a column right by 2 columns from md up, a quick way to centre a col-md-8.
- order-first, order-last and order-md-1 change the visual order without changing the HTML.

## Aligning columns

A row is a flex container, so flex utilities work on it: justify-content-center centres columns horizontally, align-items-center centres them vertically (when the row has a height), and align-self-end moves one column.

## Common mistakes

- Putting columns directly in a container without a row: the gutters look wrong.
- Putting content directly inside a row instead of a column.
- Writing col-md6 or col-6-md: the pattern is always col-{breakpoint}-{number}.
- Forgetting that there is no xs infix: col-6 already means "on extra small and up".

## How your assignments are checked

Upload one .html file per question. The checker reads your HTML and looks for the Bootstrap classes the question asks for, in the right places (for example, a .col-md-6 inside a .row inside a .container), plus any text it names. It does not open a browser, so write the classes exactly as Bootstrap spells them. The reviewer also flags unclosed tags and missing alt text, so keep your markup tidy.`,
  questions: [
    bq(
      "Starter page with the CDN",
      "Turn a plain HTML page into a Bootstrap 5.3 page.",
      [
        "Add the viewport meta tag",
        "Load bootstrap.min.css with a <link rel=\"stylesheet\"> in the head",
        "Load bootstrap.bundle.min.js with a <script> at the end of the body",
        "Inside the body, add a div.container with an h1 that says Hello, Bootstrap",
      ],
      page("Hello Bootstrap", `  <div class="container">
    <h1>Hello, Bootstrap</h1>
  </div>
`),
      [
        el('meta[name="viewport"]', "Has the viewport meta tag"),
        el('link[rel="stylesheet"][href*="bootstrap"]', "Loads the Bootstrap stylesheet"),
        el('script[src*="bootstrap.bundle"]', "Loads the Bootstrap JS bundle"),
        el(".container h1", "Has an h1 inside a .container", { text: "Hello,? Bootstrap" }),
      ],
      {
        starter: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hello Bootstrap</title>
</head>
<body>
  <!-- Add Bootstrap and your content -->
</body>
</html>
`,
      },
    ),
    bq(
      "Fixed and fluid containers",
      "Show the difference between the three container types on one page.",
      [
        "Add a div.container with a p saying Fixed width",
        "Add a div.container-fluid with a p saying Full width",
        "Add a div.container-lg with a p saying Full width until large",
      ],
      page("Containers", `  <div class="container">
    <p>Fixed width</p>
  </div>
  <div class="container-fluid">
    <p>Full width</p>
  </div>
  <div class="container-lg">
    <p>Full width until large</p>
  </div>
`),
      [
        el(".container p", "Has a .container with a paragraph", { text: "Fixed width" }),
        el(".container-fluid p", "Has a .container-fluid with a paragraph", { text: "Full width" }),
        el(".container-lg p", "Has a .container-lg with a paragraph", { text: "until large" }),
      ],
    ),
    bq(
      "Two column layout",
      "Build a main area and a sidebar: side by side from md up, stacked on phones.",
      [
        "A .container holding one .row",
        "First column: col-12 col-md-8 with an h2 Articles",
        "Second column: col-12 col-md-4 with an h2 Sidebar",
      ],
      page("Two columns", `  <div class="container">
    <div class="row">
      <main class="col-12 col-md-8">
        <h2>Articles</h2>
      </main>
      <aside class="col-12 col-md-4">
        <h2>Sidebar</h2>
      </aside>
    </div>
  </div>
`),
      [
        el(".container .row", "Has a .row inside a .container"),
        el(".row > .col-md-8", "The main column is .col-md-8 directly inside the row", { text: "Articles" }),
        el(".row > .col-md-4", "The sidebar is .col-md-4 directly inside the row", { text: "Sidebar" }),
        el(".row > .col-12", "Both columns are full width on phones (.col-12)", { min: 2 }),
      ],
    ),
    bq(
      "Three equal columns",
      "Show three services side by side in equal columns that share the width automatically.",
      [
        "A .container with a .row",
        "Three columns with the class col (no number)",
        "Each column has an h3: Web, Mobile, Cloud",
      ],
      page("Services", `  <div class="container">
    <div class="row">
      <div class="col">
        <h3>Web</h3>
      </div>
      <div class="col">
        <h3>Mobile</h3>
      </div>
      <div class="col">
        <h3>Cloud</h3>
      </div>
    </div>
  </div>
`),
      [
        el(".row > .col", "Has exactly three .col columns in the row", { min: 3, max: 3 }),
        el(".col h3", "Has a Web column", { text: "Web" }),
        el(".col h3", "Has a Mobile column", { text: "Mobile" }),
        el(".col h3", "Has a Cloud column", { text: "Cloud" }),
      ],
    ),
    bq(
      "Responsive product grid",
      "Lay out four products: 1 per row on phones, 2 per row from sm, 4 per row from lg.",
      [
        "A .container with a .row",
        "Four columns, each with the classes col-12 col-sm-6 col-lg-3",
        "Each column holds a p with a product name (Pen, Notebook, Bag, Bottle)",
      ],
      page("Products", `  <div class="container">
    <div class="row">
      <div class="col-12 col-sm-6 col-lg-3">
        <p>Pen</p>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <p>Notebook</p>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <p>Bag</p>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <p>Bottle</p>
      </div>
    </div>
  </div>
`),
      [
        el(".row > .col-12.col-sm-6.col-lg-3", "Has four columns with col-12 col-sm-6 col-lg-3", { min: 4 }),
        el(".col-lg-3 p", "Has the Pen product", { text: "Pen" }),
        el(".col-lg-3 p", "Has the Bottle product", { text: "Bottle" }),
        { notMatch: String.raw`col-(xs|md6|6-md)`, message: "Uses only valid column class names (no col-xs, col-md6 or col-6-md)" },
      ],
    ),
    bq(
      "Centred form column with an offset",
      "Centre a login column on medium screens using an offset instead of extra empty columns.",
      [
        "A .container with a .row",
        "One column with col-md-6 offset-md-3",
        "Inside it, an h2 Sign in and a p Use your college email",
      ],
      page("Offset", `  <div class="container">
    <div class="row">
      <div class="col-md-6 offset-md-3">
        <h2>Sign in</h2>
        <p>Use your college email</p>
      </div>
    </div>
  </div>
`),
      [
        el(".row > .col-md-6.offset-md-3", "Has a .col-md-6.offset-md-3 column in a row"),
        el(".offset-md-3 h2", "The column has the Sign in heading", { text: "Sign in" }),
        el(".offset-md-3 p", "The column has the hint paragraph", { text: "college email" }),
        el(".row > [class*=\"col\"]", "Uses only one column (no empty spacer columns)", { max: 1 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Nested grid",
      "Split a main column into two smaller columns by nesting a row inside it.",
      [
        "An outer .row with a .col-md-9 and a .col-md-3",
        "Inside the .col-md-9, a new .row with two .col-6 columns: Latest and Popular",
        "The .col-md-3 holds a p Ads",
      ],
      page("Nested", `  <div class="container">
    <div class="row">
      <div class="col-md-9">
        <div class="row">
          <div class="col-6">
            <h3>Latest</h3>
          </div>
          <div class="col-6">
            <h3>Popular</h3>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <p>Ads</p>
      </div>
    </div>
  </div>
`),
      [
        el(".row > .col-md-9 > .row", "Has a row nested directly in the .col-md-9"),
        el(".col-md-9 .row > .col-6", "The nested row has two .col-6 columns", { min: 2 }),
        el(".col-6", "Has the Latest column", { text: "Latest" }),
        el(".row > .col-md-3", "Has the .col-md-3 sidebar", { text: "Ads" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Card grid with row-cols and gutters",
      "Use row-cols to control how many items fit per row, and gutters for the spacing.",
      [
        "A .row with the classes row-cols-1 row-cols-md-3 g-4",
        "Six .col children, each with a div.p-3.border containing a feature name",
        "Feature names: Fast, Secure, Simple, Cheap, Open, Friendly",
      ],
      page("Features", `  <div class="container">
    <div class="row row-cols-1 row-cols-md-3 g-4">
      <div class="col"><div class="p-3 border">Fast</div></div>
      <div class="col"><div class="p-3 border">Secure</div></div>
      <div class="col"><div class="p-3 border">Simple</div></div>
      <div class="col"><div class="p-3 border">Cheap</div></div>
      <div class="col"><div class="p-3 border">Open</div></div>
      <div class="col"><div class="p-3 border">Friendly</div></div>
    </div>
  </div>
`),
      [
        el(".row.row-cols-1.row-cols-md-3", "The row sets row-cols-1 and row-cols-md-3"),
        el(".row.g-4", "The row uses the g-4 gutter"),
        el(".row-cols-md-3 > .col", "Has six .col children", { min: 6 }),
        el(".col .p-3.border", "Each item is a padded, bordered box", { min: 6 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Reorder columns on large screens",
      "On phones the article comes first; from lg up the menu should appear on the left, without changing the HTML order.",
      [
        "A .row with two columns: first an article (col-lg-9 with h2 Article), then a menu (col-lg-3 with h2 Menu)",
        "Give the menu column order-lg-first so it moves left from lg",
        "Keep the article first in the HTML",
      ],
      page("Order", `  <div class="container">
    <div class="row">
      <article class="col-lg-9">
        <h2>Article</h2>
      </article>
      <nav class="col-lg-3 order-lg-first">
        <h2>Menu</h2>
      </nav>
    </div>
  </div>
`),
      [
        el(".row > .col-lg-9", "Has the col-lg-9 article column", { text: "Article" }),
        el(".row > .col-lg-3.order-lg-first", "The menu column uses order-lg-first", { text: "Menu" }),
        { match: String.raw`col-lg-9[\s\S]*col-lg-3`, message: "The article comes before the menu in the HTML" },
      ],
      { level: "intermediate" },
    ),
    bq(
      "Centred hero with flex alignment",
      "Build a full-height hero whose content is centred both ways using the grid's flex alignment classes.",
      [
        "A .container with a .row that has vh-100, align-items-center and justify-content-center",
        "One column col-auto with an h1 Learn Bootstrap and a p Build layouts in minutes",
        "Add text-center to the column",
      ],
      page("Hero", `  <div class="container">
    <div class="row vh-100 align-items-center justify-content-center">
      <div class="col-auto text-center">
        <h1>Learn Bootstrap</h1>
        <p>Build layouts in minutes</p>
      </div>
    </div>
  </div>
`),
      [
        el(".row.vh-100", "The row is full height (vh-100)"),
        el(".row.align-items-center.justify-content-center", "The row centres its columns both ways"),
        el(".row > .col-auto.text-center", "Has a centred col-auto column"),
        el(".col-auto h1", "Has the hero heading", { text: "Learn Bootstrap" }),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "Why is the viewport meta tag needed on a Bootstrap page?", options: ["It loads Bootstrap's JavaScript", "Without it phones render the page as if it were about 980px wide, so responsive classes don't apply", "It sets the page language", "It is only needed for SEO"], answer: 1, why: "The viewport tag tells mobile browsers to use the real device width, which is what media queries and breakpoints depend on." },
    { q: "Why use bootstrap.bundle.min.js instead of bootstrap.min.js?", options: ["The bundle is smaller", "The bundle includes Popper, needed by dropdowns, tooltips and popovers", "The bundle includes jQuery", "Only the bundle works with the CSS"], answer: 1, why: "bootstrap.bundle includes Popper for positioning; the plain file expects you to load Popper yourself." },
    { q: "How many columns does the Bootstrap grid have per row?", options: ["10", "12", "16", "24"], answer: 1, why: "The grid is based on 12 columns, which divide evenly into halves, thirds, quarters and sixths." },
    { q: "From which width does col-md-6 take half the row?", options: ["576px", "768px", "992px", "1200px"], answer: 1, why: "md starts at 768px; below that the column is full width." },
    { q: "What does a column with just the class col do?", options: ["Takes all 12 columns", "Shares the row equally with the other col columns", "Sizes to its content", "Hides on phones"], answer: 1, why: "col columns are flex items that grow equally; col-auto sizes to content." },
    { q: "Which class removes the gaps between columns in a row?", options: ["gap-0", "g-0", "p-0", "no-gutters"], answer: 1, why: "g-0 on the row sets the gutter to zero; no-gutters was Bootstrap 4." },
    { q: "What is the difference between container and container-fluid?", options: ["container is always 100% wide; container-fluid is fixed", "container has a max-width per breakpoint; container-fluid is always 100% wide", "They are the same", "container-fluid only works with JavaScript"], answer: 1, why: "container snaps to fixed max-widths at each breakpoint, container-fluid stretches edge to edge." },
    { q: "A row contains col-md-8 and col-md-6. What happens from md up?", options: ["They squeeze into one line", "The col-md-6 wraps onto a new line because 8 + 6 > 12", "Bootstrap throws an error", "Both become 50%"], answer: 1, why: "When a row's column numbers pass 12, the extra columns wrap to the next line." },
    { q: "Which markup shows 1 item per row on phones and 3 per row from md up, without setting a width on each item?", options: ["<div class=\"row cols-3\">", "<div class=\"row row-cols-1 row-cols-md-3\"> with .col children", "<div class=\"row\"> with .col-md-3 children", "<div class=\"grid-3\">"], answer: 1, why: "row-cols-* on the row sets the width of each .col child per breakpoint." },
    { q: "You write <div class=\"col-md-8 offset-md-2\"> inside a row. What do you get on a 1000px wide screen?", options: ["An 8-column block pushed 2 columns right, so it is centred", "An 8-column block on the left with 2 columns of padding inside", "A 10-column block", "Nothing changes because offset needs JavaScript"], answer: 0, why: "offset-md-2 adds a left margin of 2 columns from md up; 2 + 8 + 2 = 12, so the block is centred." },
  ],
};
