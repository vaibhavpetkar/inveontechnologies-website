import type { PracticeUnit } from "../../types.js";
import { bq, el, page } from "./shared.js";

export const utilities: PracticeUnit = {
  key: "utilities",
  title: "Typography and utility classes",
  summary: "headings, display text, text utilities, spacing, colours, borders, display, flex, sizing, position, images and tables",
  reading: String.raw`## Utilities: small classes that do one thing

Most of Bootstrap's power is in its utility classes. Each one sets one or two CSS properties, so you can style an element without writing any CSS: class="text-center fw-bold mt-4" means centred, bold text with a top margin. Learn the naming patterns once and you can guess almost every class.

## Typography

- Headings h1 to h6 are already styled. To make a p look like a heading, use class="h3".
- display-1 to display-6 are extra large headings for hero sections.
- lead makes a paragraph slightly bigger, for intros.
- Text: text-start, text-center, text-end (and text-md-center for one breakpoint up), text-uppercase, text-lowercase, text-capitalize, text-truncate, text-decoration-none.
- Weight and style: fw-bold, fw-semibold, fw-light, fst-italic. Size: fs-1 (largest) to fs-6.
- small and text-body-secondary for muted helper text.

## Spacing

Spacing classes follow one pattern: {property}{sides}-{size}.

- Property: m (margin) or p (padding).
- Sides: t (top), b (bottom), s (start, left in English), e (end, right), x (left and right), y (top and bottom), or nothing for all four.
- Size: 0 to 5 (0, 0.25rem, 0.5rem, 1rem, 1.5rem, 3rem) or auto.

` + "```html" + String.raw`
<div class="p-4 mb-3">Padding all round, margin below</div>
<div class="px-3 py-2">Button-like padding</div>
<div class="mx-auto" style="width: 300px">Centred block</div>
` + "```" + String.raw`

Bootstrap 5 uses s and e (start and end) instead of Bootstrap 4's l and r, so ml-3 no longer exists: write ms-3. For gaps between flex or grid children, use gap-3 on the parent instead of margins on every child.

## Colours and backgrounds

The theme colours are primary, secondary, success, danger, warning, info, light and dark.

- text-primary, text-danger ... colour the text.
- bg-primary, bg-dark ... colour the background. Pair a dark background with light text: bg-dark text-white.
- text-bg-warning sets a background and a readable text colour together (added in 5.2).
- bg-opacity-50 and text-opacity-75 fade them. bg-body-tertiary is a soft grey that also works in dark mode.

## Borders, corners and shadows

border adds a border, border-bottom one side, border-primary colours it, border-2 thickens it. rounded, rounded-3 and rounded-pill round the corners; rounded-circle makes a circle (on a square element). shadow-sm, shadow and shadow-lg add depth.

## Display and flex

- d-none hides, d-block, d-inline-block and d-flex set display. Add a breakpoint to change it: d-none d-md-block means hidden on phones, visible from md up.
- On a d-flex parent: justify-content-between (or center, end, around), align-items-center, flex-column, flex-wrap, gap-2.
- On a child: flex-grow-1, ms-auto (pushes it to the right), align-self-start.

` + "```html" + String.raw`
<div class="d-flex justify-content-between align-items-center p-3 border">
  <strong>Total</strong>
  <span class="badge text-bg-success">Paid</span>
</div>
` + "```" + String.raw`

## Sizing and position

w-25, w-50, w-75, w-100 and h-100 set percentage sizes; vh-100 makes an element as tall as the screen; mw-100 stops it overflowing. position-relative, position-absolute, top-0, start-100 and translate-middle together place a badge on the corner of a button.

## Images and tables

img-fluid makes an image shrink with its container (max-width: 100%). rounded-circle turns a square photo into an avatar. For tables, class="table" gives clean styling; add table-striped, table-hover, table-bordered or table-dark, and wrap wide tables in div.table-responsive so they scroll sideways on phones.

## Common mistakes

- Mixing Bootstrap 4 names: ml-2, float-right and text-left are ms-2, float-end and text-start in Bootstrap 5.
- Using spacing numbers above 5 (mt-6 does not exist).
- Putting justify-content-center on an element that is not d-flex: flex utilities only work on a flex container.
- Using a coloured background without a text colour, leaving dark text on dark blue.

## How your assignments are checked

The checker looks for elements carrying the utility classes the question names (for example, a .d-flex.justify-content-between that contains a .badge) and the text you were asked to show. Stick to Bootstrap 5 class names; old Bootstrap 4 names are treated as wrong.`,
  questions: [
    bq(
      "Headings and lead text",
      "Write the top of a blog post with Bootstrap typography.",
      [
        "An h1 with the class display-5 saying Learning to Code",
        "A p with the class lead giving a one-line intro",
        "A p with the class h5 saying By Priya Sharma (a paragraph styled like a heading)",
      ],
      page("Typography", `  <div class="container py-4">
    <h1 class="display-5">Learning to Code</h1>
    <p class="lead">Small daily practice beats long weekend sessions.</p>
    <p class="h5">By Priya Sharma</p>
  </div>
`),
      [
        el("h1.display-5", "The title is an h1.display-5", { text: "Learning to Code" }),
        el("p.lead", "Has an intro paragraph with .lead"),
        el("p.h5", "The author line is a p styled with .h5", { text: "Priya Sharma" }),
      ],
    ),
    bq(
      "Text utilities",
      "Style a notice using only text utility classes.",
      [
        "An h2 with text-center and text-uppercase saying Exam notice",
        "A p with fw-bold and text-danger saying Carry your ID card",
        "A p with fst-italic and text-body-secondary saying Reporting time is 9 AM",
        "A p with text-end saying Principal",
      ],
      page("Notice", `  <div class="container py-4">
    <h2 class="text-center text-uppercase">Exam notice</h2>
    <p class="fw-bold text-danger">Carry your ID card</p>
    <p class="fst-italic text-body-secondary">Reporting time is 9 AM</p>
    <p class="text-end">Principal</p>
  </div>
`),
      [
        el("h2.text-center.text-uppercase", "The heading is centred and uppercase"),
        el("p.fw-bold.text-danger", "The warning is bold and red", { text: "ID card" }),
        el("p.fst-italic.text-body-secondary", "The time is italic and muted"),
        el("p.text-end", "The signature is right aligned with text-end", { text: "Principal" }),
      ],
    ),
    bq(
      "Spacing with margin and padding",
      "Space out a profile box using spacing utilities only.",
      [
        "A div with p-4, mt-5 and border containing an h3 Rahul Verma",
        "The h3 has mb-3",
        "Below the box, a div with mx-auto, px-3, py-2 and border saying Centred note (give it style=\"width: 300px\")",
      ],
      page("Spacing", `  <div class="container">
    <div class="p-4 mt-5 border">
      <h3 class="mb-3">Rahul Verma</h3>
      <p>Frontend intern</p>
    </div>
    <div class="mx-auto px-3 py-2 border" style="width: 300px">Centred note</div>
  </div>
`),
      [
        el("div.p-4.mt-5.border", "The box has p-4, mt-5 and a border"),
        el(".p-4 h3.mb-3", "The name heading has mb-3", { text: "Rahul Verma" }),
        el("div.mx-auto.px-3.py-2", "The note is centred with mx-auto and padded with px-3 py-2", { text: "Centred note" }),
        { notMatch: String.raw`\b(ml|mr|pl|pr)-\d`, message: "Uses Bootstrap 5 start/end names (ms, me, ps, pe), not ml/mr/pl/pr" },
      ],
    ),
    bq(
      "Colour and background utilities",
      "Show three status strips with theme colours.",
      [
        "A div with bg-success and text-white saying Server online",
        "A div with text-bg-warning saying Disk 80% full",
        "A div with bg-dark, text-white and bg-opacity-75 saying Maintenance tonight",
        "Give every strip p-2 and mb-2",
      ],
      page("Colours", `  <div class="container py-3">
    <div class="bg-success text-white p-2 mb-2">Server online</div>
    <div class="text-bg-warning p-2 mb-2">Disk 80% full</div>
    <div class="bg-dark text-white bg-opacity-75 p-2 mb-2">Maintenance tonight</div>
  </div>
`),
      [
        el(".bg-success.text-white", "Has a green strip with white text", { text: "online" }),
        el(".text-bg-warning", "Has a warning strip using text-bg-warning", { text: "80%" }),
        el(".bg-dark.bg-opacity-75.text-white", "Has a faded dark strip", { text: "Maintenance" }),
        el(".p-2.mb-2", "All three strips have p-2 and mb-2", { min: 3 }),
      ],
    ),
    bq(
      "Borders, rounded corners and shadows",
      "Make a small profile card look finished with border, radius and shadow utilities.",
      [
        "A div with border, border-primary, rounded-3, shadow and p-3",
        "Inside it an img with the classes rounded-circle and img-fluid (src=\"avatar.png\", alt=\"Anita\", width=\"96\" height=\"96\")",
        "An h4 Anita Rao below the image",
      ],
      page("Profile", `  <div class="container py-4">
    <div class="border border-primary rounded-3 shadow p-3 text-center" style="max-width: 240px">
      <img src="avatar.png" alt="Anita" width="96" height="96" class="rounded-circle img-fluid">
      <h4>Anita Rao</h4>
    </div>
  </div>
`),
      [
        el("div.border.border-primary.rounded-3.shadow", "The card has a primary border, rounded-3 and a shadow"),
        el(".shadow img.rounded-circle.img-fluid[alt]", "The avatar is a round, fluid image with alt text"),
        el(".shadow h4", "Shows the name", { text: "Anita Rao" }),
      ],
    ),
    bq(
      "Show and hide by screen size",
      "Show a short message on phones and a long one from md up, using display utilities.",
      [
        "A p with d-block d-md-none saying Tap to call",
        "A p with d-none d-md-block saying Call us on 1800 123 4567, Monday to Saturday",
        "Both inside a .container",
      ],
      page("Display", `  <div class="container py-3">
    <p class="d-block d-md-none">Tap to call</p>
    <p class="d-none d-md-block">Call us on 1800 123 4567, Monday to Saturday</p>
  </div>
`),
      [
        el("p.d-block.d-md-none", "The phone-only message uses d-block d-md-none", { text: "Tap to call" }),
        el("p.d-none.d-md-block", "The desktop message uses d-none d-md-block", { text: "Monday to Saturday" }),
        el(".container > p", "Both messages are in the container", { min: 2 }),
      ],
    ),
    bq(
      "Flex row with space between",
      "Build an order summary line: the label on the left, the amount on the right, vertically centred.",
      [
        "A div with d-flex, justify-content-between, align-items-center, p-3 and border",
        "Left: a strong saying Total",
        "Right: a span with fs-4 and fw-bold saying Rs 1,499",
      ],
      page("Flex", `  <div class="container py-3">
    <div class="d-flex justify-content-between align-items-center p-3 border">
      <strong>Total</strong>
      <span class="fs-4 fw-bold">Rs 1,499</span>
    </div>
  </div>
`),
      [
        el(".d-flex.justify-content-between.align-items-center", "The row is a flex container with space-between and centred items"),
        el(".d-flex > strong", "Has the Total label", { text: "Total" }),
        el(".d-flex > span.fs-4.fw-bold", "Has the large bold amount", { text: "1,499" }),
      ],
    ),
    bq(
      "Flex column with gap and a pushed item",
      "Make a toolbar where the buttons sit on the left and the logout button is pushed to the far right, then a stacked list below.",
      [
        "A div.d-flex.gap-2 with three buttons (btn btn-outline-secondary): New, Save, Logout",
        "Give the Logout button ms-auto so it moves to the right",
        "Below it, a div with d-flex, flex-column and gap-3 holding three div.p-2.border items: Step 1, Step 2, Step 3",
      ],
      page("Toolbar", `  <div class="container py-3">
    <div class="d-flex gap-2 mb-3">
      <button type="button" class="btn btn-outline-secondary">New</button>
      <button type="button" class="btn btn-outline-secondary">Save</button>
      <button type="button" class="btn btn-outline-secondary ms-auto">Logout</button>
    </div>
    <div class="d-flex flex-column gap-3">
      <div class="p-2 border">Step 1</div>
      <div class="p-2 border">Step 2</div>
      <div class="p-2 border">Step 3</div>
    </div>
  </div>
`),
      [
        el(".d-flex.gap-2 > button.btn", "The toolbar is a flex row with a gap and three buttons", { min: 3 }),
        el(".d-flex > button.ms-auto", "The Logout button is pushed right with ms-auto", { text: "Logout" }),
        el(".d-flex.flex-column.gap-3 > .p-2.border", "The steps are stacked in a flex column with gap-3", { min: 3 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Notification badge with position utilities",
      "Put a small count bubble on the top-right corner of a button.",
      [
        "A button with the classes btn btn-primary position-relative saying Inbox",
        "Inside it, a span with position-absolute, top-0, start-100, translate-middle, badge, rounded-pill and bg-danger showing 9",
        "Add a span.visually-hidden inside the badge saying unread messages",
      ],
      page("Badge", `  <div class="container py-5">
    <button type="button" class="btn btn-primary position-relative">
      Inbox
      <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">9 <span class="visually-hidden">unread messages</span></span>
    </button>
  </div>
`),
      [
        el("button.btn.btn-primary.position-relative", "The button is position-relative"),
        el(".position-relative > .position-absolute.top-0.start-100.translate-middle", "The badge is absolutely placed on the top-right corner"),
        el(".badge.rounded-pill.bg-danger", "The badge is a red pill", { text: "9" }),
        el(".badge .visually-hidden", "Has hidden text for screen readers", { text: "unread" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Striped responsive table",
      "Show a marks table that is striped, highlights rows on hover and scrolls sideways on small screens.",
      [
        "Wrap the table in div.table-responsive",
        "The table has table, table-striped and table-hover",
        "A thead with th cells: Name, Maths, Science; a tbody with at least three student rows",
      ],
      page("Marks", `  <div class="container py-3">
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead>
          <tr><th scope="col">Name</th><th scope="col">Maths</th><th scope="col">Science</th></tr>
        </thead>
        <tbody>
          <tr><td>Aman</td><td>88</td><td>91</td></tr>
          <tr><td>Kavya</td><td>95</td><td>89</td></tr>
          <tr><td>Rohan</td><td>72</td><td>80</td></tr>
        </tbody>
      </table>
    </div>
  </div>
`),
      [
        el(".table-responsive > table.table.table-striped.table-hover", "The striped, hover table is inside .table-responsive"),
        el("table thead th", "The header has Name, Maths and Science", { min: 3 }),
        el("table tbody tr", "The body has at least three rows", { min: 3 }),
        el("thead th", "Has a Science column", { text: "Science" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Media object with flex utilities",
      "Build a comment: avatar on the left, text on the right that takes the remaining width.",
      [
        "A div with d-flex, align-items-start and gap-3",
        "First child: an img with rounded-circle, flex-shrink-0 and alt text (width=\"48\" height=\"48\")",
        "Second child: a div.flex-grow-1 with an h5.mb-1 Neha and a p.mb-0 Great explanation, thank you!",
      ],
      page("Comment", `  <div class="container py-3">
    <div class="d-flex align-items-start gap-3">
      <img src="neha.png" alt="Neha" width="48" height="48" class="rounded-circle flex-shrink-0">
      <div class="flex-grow-1">
        <h5 class="mb-1">Neha</h5>
        <p class="mb-0">Great explanation, thank you!</p>
      </div>
    </div>
  </div>
`),
      [
        el(".d-flex.align-items-start.gap-3", "The comment is a flex row aligned to the top with gap-3"),
        el(".d-flex > img.rounded-circle.flex-shrink-0[alt]", "The avatar is round, doesn't shrink and has alt text"),
        el(".d-flex > .flex-grow-1 h5.mb-1", "The text column grows and has the name", { text: "Neha" }),
        el(".flex-grow-1 p.mb-0", "Has the comment text", { text: "thank you" }),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "What does the class mt-3 do?", options: ["Sets margin-top to 3px", "Sets margin-top to Bootstrap's size 3 (1rem)", "Sets padding-top to 1rem", "Moves the element 3 columns"], answer: 1, why: "m = margin, t = top, 3 = the third step of the spacing scale, which is 1rem." },
    { q: "What do px-3 py-2 set?", options: ["Padding 3 on x-axis sides (left and right), 2 on top and bottom", "Position x = 3, y = 2", "Pixel sizes 3px and 2px", "Margin 3 horizontally, 2 vertically"], answer: 0, why: "p is padding, x means left and right, y means top and bottom, and the numbers are spacing steps." },
    { q: "Which Bootstrap 5 class adds a left margin (in a left-to-right page)?", options: ["ml-2", "ms-2", "mr-2", "margin-left-2"], answer: 1, why: "Bootstrap 5 uses start and end: ms is margin-start. ml was Bootstrap 4." },
    { q: "Which class makes a paragraph look like an h2 without changing the tag?", options: ["heading-2", "h2", "fs-h2", "display-h2"], answer: 1, why: "The .h1 to .h6 classes copy the heading styles onto any element." },
    { q: "How do you hide an element on phones but show it from md up?", options: ["d-md-none", "d-none d-md-block", "hidden-sm", "visible-md"], answer: 1, why: "d-none hides it everywhere, then d-md-block shows it again from 768px up." },
    { q: "Which class gives a warning background together with a readable text colour?", options: ["bg-warning-text", "text-bg-warning", "alert-warning-bg", "bg-warning text-auto"], answer: 1, why: "text-bg-{colour} (Bootstrap 5.2+) sets both the background and a contrasting text colour." },
    { q: "What does img-fluid do?", options: ["Makes an image round", "Sets max-width: 100% and height: auto so it shrinks with its container", "Lazy loads the image", "Adds a border"], answer: 1, why: "img-fluid keeps images inside their parent at any screen size." },
    { q: "Which classes place a badge exactly on the top-right corner of a button?", options: ["float-end top-0", "position-absolute top-0 start-100 translate-middle on the badge, position-relative on the button", "badge-corner", "ms-auto mt-0"], answer: 1, why: "The badge is positioned against the relative button, then translate-middle centres it on the corner." },
    { q: "You add justify-content-center to a div but nothing moves. What is the most likely cause?", options: ["The class is spelled wrong", "The div is not a flex container: add d-flex", "Bootstrap JS is not loaded", "It only works in a row"], answer: 1, why: "justify-content only affects flex (or grid) containers; add d-flex first." },
    { q: "A wide table breaks your phone layout. What is the Bootstrap fix?", options: ["Add table-sm", "Wrap it in a div.table-responsive so it scrolls horizontally", "Add d-none to it", "Use table-fluid"], answer: 1, why: ".table-responsive adds overflow-x: auto around the table so only the table scrolls." },
  ],
};
