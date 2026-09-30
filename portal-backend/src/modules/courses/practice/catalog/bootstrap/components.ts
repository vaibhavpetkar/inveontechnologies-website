import type { PracticeUnit } from "../../types.js";
import { bq, el, page } from "./shared.js";

export const components: PracticeUnit = {
  key: "components",
  title: "Components: buttons, cards, alerts, badges and lists",
  summary: "buttons and button groups, cards and card grids, alerts, badges, list groups, spinners and progress bars",
  reading: String.raw`## Components are class recipes

A Bootstrap component is a small set of classes that work together. A card needs .card on the outside and .card-body inside; a list group needs .list-group on the ul and .list-group-item on each li. If you miss one part, the component half works, which is the most common reason "Bootstrap isn't working". Always copy the structure, then change the content.

## Buttons

` + "```html" + String.raw`
<button type="button" class="btn btn-primary">Save</button>
<button type="button" class="btn btn-outline-danger btn-sm">Delete</button>
<a href="/signup" class="btn btn-success btn-lg">Join now</a>
` + "```" + String.raw`

- Every button needs btn plus a variant: btn-primary, btn-secondary, btn-success, btn-danger, btn-warning, btn-info, btn-light, btn-dark or btn-link.
- btn-outline-{colour} gives a bordered button; btn-sm and btn-lg change the size.
- A full-width button: put it in div.d-grid, or give it w-100.
- disabled on a button (or aria-disabled="true" and the class disabled on a link) greys it out.
- Group related buttons with div.btn-group role="group".
- Use a real button for actions and an a for navigation. Always write type="button" on buttons that are not submitting a form.

## Cards

A card is a bordered box with optional image, header, body and footer.

` + "```html" + String.raw`
<div class="card" style="width: 18rem;">
  <img src="course.jpg" class="card-img-top" alt="Course cover">
  <div class="card-body">
    <h5 class="card-title">Python Basics</h5>
    <p class="card-text">Learn Python in 30 days.</p>
    <a href="#" class="btn btn-primary">Enrol</a>
  </div>
</div>
` + "```" + String.raw`

- card-header and card-footer add grey bars above and below the body.
- For a grid of cards, put each card in a column (row row-cols-1 row-cols-md-3 g-4) and add h-100 to every card so they all stretch to the same height.
- text-bg-primary on a card colours it; border-success colours its border.

## Alerts

Alerts show feedback messages: div.alert.alert-success role="alert". Links inside get alert-link for a matching colour. To make one closable, add alert-dismissible fade show and a close button:

` + "```html" + String.raw`
<div class="alert alert-warning alert-dismissible fade show" role="alert">
  Your trial ends in 3 days.
  <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>
` + "```" + String.raw`

The data-bs-dismiss attribute is handled by Bootstrap's JavaScript, so the bundle must be loaded.

## Badges

A badge is a small label: span.badge.text-bg-secondary. rounded-pill makes it a pill. Badges scale with their parent, so a badge inside an h3 is bigger than one inside a p.

## List groups

` + "```html" + String.raw`
<ul class="list-group">
  <li class="list-group-item active" aria-current="true">Dashboard</li>
  <li class="list-group-item d-flex justify-content-between align-items-center">
    Messages <span class="badge text-bg-primary rounded-pill">4</span>
  </li>
  <li class="list-group-item disabled" aria-disabled="true">Billing</li>
</ul>
` + "```" + String.raw`

- list-group-flush removes outer borders (useful inside cards).
- For clickable items use div.list-group with a.list-group-item.list-group-item-action.
- list-group-item-success and friends colour one item.

## Spinners and progress bars

div.spinner-border (or spinner-grow) shows a loading animation; put a span.visually-hidden saying Loading... inside for screen readers. A progress bar is a div.progress with role="progressbar" and aria-valuenow, holding a div.progress-bar whose width you set: style="width: 70%". Add progress-bar-striped and progress-bar-animated for motion.

## Common mistakes

- Writing class="btn-primary" without btn: you get colours but no padding or border radius.
- Forgetting card-body, so text touches the card edge.
- Using alert-dismissible without the btn-close button or without the JS bundle.
- Using colour alone to carry meaning. Add text too ("Error:") for users who cannot see the colour.

## How your assignments are checked

The checker parses your HTML and looks for each part of the component: for example a .card containing a .card-body containing a .card-title with the right text. Accessibility attributes such as role="alert", aria-label on close buttons and alt on images are part of the checks, so include them.`,
  questions: [
    bq(
      "Button variants and sizes",
      "Show the buttons of a checkout page.",
      [
        "A btn btn-primary button saying Place order",
        "A btn btn-outline-secondary button saying Continue shopping",
        "A small btn btn-danger btn-sm button saying Remove",
        "A large link styled as btn btn-success btn-lg saying Pay now (href=\"/pay\")",
        "All buttons have type=\"button\"",
      ],
      page("Buttons", `  <div class="container py-3">
    <button type="button" class="btn btn-primary">Place order</button>
    <button type="button" class="btn btn-outline-secondary">Continue shopping</button>
    <button type="button" class="btn btn-danger btn-sm">Remove</button>
    <a href="/pay" class="btn btn-success btn-lg">Pay now</a>
  </div>
`),
      [
        el("button.btn.btn-primary", "Has a primary button", { text: "Place order" }),
        el("button.btn.btn-outline-secondary", "Has an outline secondary button", { text: "Continue" }),
        el("button.btn.btn-danger.btn-sm", "Has a small danger button", { text: "Remove" }),
        el('a.btn.btn-success.btn-lg[href="/pay"]', "Has a large success link button", { text: "Pay now" }),
        el("button[type=\"button\"]", "Buttons have type=\"button\"", { min: 3 }),
      ],
    ),
    bq(
      "Button group and full-width button",
      "Build a view switcher and a full-width submit button for a mobile screen.",
      [
        "A div.btn-group with role=\"group\" and aria-label=\"View\" holding three btn btn-outline-primary buttons: Day, Week, Month",
        "Mark Week as active",
        "Below it, a div with d-grid holding a btn btn-primary button saying Apply",
      ],
      page("Group", `  <div class="container py-3">
    <div class="btn-group mb-3" role="group" aria-label="View">
      <button type="button" class="btn btn-outline-primary">Day</button>
      <button type="button" class="btn btn-outline-primary active">Week</button>
      <button type="button" class="btn btn-outline-primary">Month</button>
    </div>
    <div class="d-grid">
      <button type="button" class="btn btn-primary">Apply</button>
    </div>
  </div>
`),
      [
        el('.btn-group[role="group"][aria-label]', "Has a labelled button group"),
        el(".btn-group > .btn.btn-outline-primary", "The group has three outline buttons", { min: 3 }),
        el(".btn-group > .btn.active", "The Week button is active", { text: "Week" }),
        el(".d-grid > .btn.btn-primary", "The Apply button is full width inside .d-grid", { text: "Apply" }),
      ],
    ),
    bq(
      "Course card",
      "Build a course card with an image, title, text and a button.",
      [
        "A div.card with style=\"width: 18rem\"",
        "An img.card-img-top with alt text",
        "A div.card-body with an h5.card-title Python Basics, a p.card-text and an a.btn.btn-primary Enrol",
      ],
      page("Card", `  <div class="container py-3">
    <div class="card" style="width: 18rem">
      <img src="python.jpg" class="card-img-top" alt="Python course cover">
      <div class="card-body">
        <h5 class="card-title">Python Basics</h5>
        <p class="card-text">Variables, loops and functions in 30 days.</p>
        <a href="#" class="btn btn-primary">Enrol</a>
      </div>
    </div>
  </div>
`),
      [
        el(".card > img.card-img-top[alt]", "The card starts with a card-img-top that has alt text"),
        el(".card > .card-body", "Has a card-body inside the card"),
        el(".card-body .card-title", "Has the card title", { text: "Python Basics" }),
        el(".card-body .card-text", "Has card text"),
        el(".card-body a.btn.btn-primary", "Has an Enrol button", { text: "Enrol" }),
      ],
    ),
    bq(
      "Card with header and footer",
      "Show a pricing card with a header, a price, a feature list and a footer.",
      [
        "A div.card.text-center",
        "A div.card-header saying Pro plan",
        "A div.card-body with an h2.card-title Rs 499/month and a ul.list-unstyled with three features",
        "A div.card-footer.text-body-secondary saying Cancel anytime",
      ],
      page("Pricing", `  <div class="container py-3">
    <div class="card text-center">
      <div class="card-header">Pro plan</div>
      <div class="card-body">
        <h2 class="card-title">Rs 499/month</h2>
        <ul class="list-unstyled">
          <li>10 projects</li>
          <li>Email support</li>
          <li>Custom domain</li>
        </ul>
      </div>
      <div class="card-footer text-body-secondary">Cancel anytime</div>
    </div>
  </div>
`),
      [
        el(".card.text-center > .card-header", "Has a card header", { text: "Pro plan" }),
        el(".card-body .card-title", "Shows the price", { text: "499" }),
        el(".card-body ul.list-unstyled li", "Lists three features", { min: 3 }),
        el(".card > .card-footer", "Has a card footer", { text: "Cancel anytime" }),
      ],
    ),
    bq(
      "Equal height card grid",
      "Show three blog cards in a responsive grid where every card has the same height.",
      [
        "A div.row with row-cols-1, row-cols-md-3 and g-4",
        "Three div.col, each holding a div.card.h-100",
        "Each card has a card-body with an h5.card-title and a p.card-text",
      ],
      page("Blog", `  <div class="container py-3">
    <div class="row row-cols-1 row-cols-md-3 g-4">
      <div class="col">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">Git in 10 minutes</h5>
            <p class="card-text">Commit, branch and merge with confidence.</p>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">CSS Grid</h5>
            <p class="card-text">Two-dimensional layouts without hacks.</p>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">REST APIs</h5>
            <p class="card-text">Design endpoints that other developers enjoy using.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
`),
      [
        el(".row.row-cols-1.row-cols-md-3.g-4", "The row uses row-cols-1 row-cols-md-3 g-4"),
        el(".row > .col > .card.h-100", "Three cards with h-100, each in a .col", { min: 3 }),
        el(".card .card-body .card-title", "Each card has a title", { min: 3 }),
        el(".card .card-body .card-text", "Each card has text", { min: 3 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Alerts with a dismiss button",
      "Show a success message and a warning that the user can close.",
      [
        "A div.alert.alert-success with role=\"alert\" saying Profile saved, with an a.alert-link View profile",
        "A div.alert.alert-warning.alert-dismissible.fade.show with role=\"alert\" saying Your trial ends in 3 days",
        "In the warning, a button.btn-close with data-bs-dismiss=\"alert\" and aria-label=\"Close\"",
      ],
      page("Alerts", `  <div class="container py-3">
    <div class="alert alert-success" role="alert">
      Profile saved. <a href="/profile" class="alert-link">View profile</a>
    </div>
    <div class="alert alert-warning alert-dismissible fade show" role="alert">
      Your trial ends in 3 days.
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  </div>
`),
      [
        el('.alert.alert-success[role="alert"]', "Has a success alert with role=\"alert\"", { text: "Profile saved" }),
        el(".alert-success a.alert-link", "The success alert has an alert-link"),
        el(".alert.alert-warning.alert-dismissible.fade.show", "Has a dismissible warning alert", { text: "trial" }),
        el('.alert-dismissible button.btn-close[data-bs-dismiss="alert"][aria-label]', "The warning has a labelled close button"),
      ],
    ),
    bq(
      "Badges in headings and buttons",
      "Use badges to label a heading and to show a count inside a button.",
      [
        "An h3 saying Internships with a span.badge.text-bg-success New",
        "A button.btn.btn-primary saying Notifications with a span.badge.text-bg-light 4",
        "A span.badge.rounded-pill.text-bg-danger saying Urgent",
      ],
      page("Badges", `  <div class="container py-3">
    <h3>Internships <span class="badge text-bg-success">New</span></h3>
    <button type="button" class="btn btn-primary">
      Notifications <span class="badge text-bg-light">4</span>
    </button>
    <span class="badge rounded-pill text-bg-danger">Urgent</span>
  </div>
`),
      [
        el("h3 .badge.text-bg-success", "The heading has a New badge", { text: "New" }),
        el("button.btn .badge", "The button has a count badge", { text: "4" }),
        el(".badge.rounded-pill.text-bg-danger", "Has a red pill badge", { text: "Urgent" }),
      ],
    ),
    bq(
      "List group with badges",
      "Build a sidebar menu as a list group with an active item, counts and a disabled item.",
      [
        "A ul.list-group with four li.list-group-item",
        "First item Dashboard is active with aria-current=\"true\"",
        "Items Messages and Tasks use d-flex, justify-content-between and align-items-center and end with a badge.rounded-pill count",
        "Last item Billing is disabled with aria-disabled=\"true\"",
      ],
      page("Menu", `  <div class="container py-3">
    <ul class="list-group">
      <li class="list-group-item active" aria-current="true">Dashboard</li>
      <li class="list-group-item d-flex justify-content-between align-items-center">
        Messages <span class="badge text-bg-primary rounded-pill">4</span>
      </li>
      <li class="list-group-item d-flex justify-content-between align-items-center">
        Tasks <span class="badge text-bg-primary rounded-pill">12</span>
      </li>
      <li class="list-group-item disabled" aria-disabled="true">Billing</li>
    </ul>
  </div>
`),
      [
        el("ul.list-group > li.list-group-item", "The list has four list-group-item entries", { min: 4 }),
        el('li.list-group-item.active[aria-current="true"]', "Dashboard is the active item", { text: "Dashboard" }),
        el("li.list-group-item.d-flex.justify-content-between > .badge.rounded-pill", "Items with counts use flex and a pill badge", { min: 2 }),
        el('li.list-group-item.disabled[aria-disabled="true"]', "Billing is disabled", { text: "Billing" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Actionable list group in a card",
      "Put a list of clickable links inside a card, without double borders.",
      [
        "A div.card with a div.card-header saying Quick links",
        "Inside the card, a div.list-group.list-group-flush",
        "Three a.list-group-item.list-group-item-action links: Timetable, Results, Library",
      ],
      page("Links", `  <div class="container py-3">
    <div class="card" style="width: 20rem">
      <div class="card-header">Quick links</div>
      <div class="list-group list-group-flush">
        <a href="/timetable" class="list-group-item list-group-item-action">Timetable</a>
        <a href="/results" class="list-group-item list-group-item-action">Results</a>
        <a href="/library" class="list-group-item list-group-item-action">Library</a>
      </div>
    </div>
  </div>
`),
      [
        el(".card > .card-header", "The card has a header", { text: "Quick links" }),
        el(".card > .list-group.list-group-flush", "The flush list group sits directly in the card"),
        el(".list-group-flush > a.list-group-item.list-group-item-action[href]", "Has three actionable links", { min: 3 }),
        el("a.list-group-item", "Has the Results link", { text: "Results" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Spinner and progress bar",
      "Show an upload in progress: a spinner and a 70% striped, animated progress bar.",
      [
        "A div.spinner-border.text-primary with role=\"status\" containing a span.visually-hidden Loading...",
        "A div.progress with role=\"progressbar\", aria-valuenow=\"70\", aria-valuemin=\"0\" and aria-valuemax=\"100\"",
        "Inside it a div.progress-bar.progress-bar-striped.progress-bar-animated with style=\"width: 70%\" showing 70%",
      ],
      page("Upload", `  <div class="container py-3">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    <div class="progress mt-3" role="progressbar" aria-label="Upload" aria-valuenow="70" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 70%">70%</div>
    </div>
  </div>
`),
      [
        el('.spinner-border[role="status"] .visually-hidden', "Has a spinner with hidden Loading text", { text: "Loading" }),
        el('.progress[role="progressbar"][aria-valuenow="70"]', "The progress wrapper has role and aria-valuenow=\"70\""),
        el(".progress > .progress-bar.progress-bar-striped.progress-bar-animated", "The bar is striped and animated"),
        el('.progress-bar[style*="70%"]', "The bar's width is 70%"),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "Which markup gives a green outlined button?", options: ["<button class=\"btn-outline-success\">", "<button class=\"btn btn-outline-success\">", "<button class=\"btn outline success\">", "<button class=\"btn btn-success-outline\">"], answer: 1, why: "Buttons need the base btn class plus a variant; the outline variant is btn-outline-{colour}." },
    { q: "Which class goes on the inner padded area of a card?", options: ["card-content", "card-body", "card-inner", "card-text"], answer: 1, why: "card-body adds the padding; card-text is only for paragraphs inside it." },
    { q: "What does the class rounded-pill do on a badge?", options: ["Adds a shadow", "Gives it fully rounded ends", "Makes it circular and animated", "Makes it clickable"], answer: 1, why: "rounded-pill sets a very large border radius so the ends are fully rounded." },
    { q: "Which attribute makes a close button remove its alert?", options: ["onclick=\"close()\"", "data-bs-dismiss=\"alert\"", "data-dismiss=\"alert\"", "aria-close=\"alert\""], answer: 1, why: "Bootstrap 5 uses data-bs-* attributes; data-dismiss was Bootstrap 4." },
    { q: "Which class removes the outer borders of a list group so it fits inside a card?", options: ["list-group-borderless", "list-group-flush", "border-0", "list-group-inline"], answer: 1, why: "list-group-flush removes the outer borders and rounded corners." },
    { q: "Why add a span.visually-hidden inside a spinner?", options: ["To slow the animation", "So screen reader users hear that something is loading", "To hide the spinner on phones", "It is required for the animation to run"], answer: 1, why: "The spinner is purely visual; the hidden text gives it meaning for assistive technology." },
    { q: "How do you make a button stretch to full width on all screens?", options: ["btn-block", "Wrap it in div.d-grid (or give it w-100)", "btn-full", "col-12 on the button"], answer: 1, why: "btn-block was removed in Bootstrap 5; use a d-grid wrapper or w-100." },
    { q: "Your alert has alert-dismissible and a btn-close, but clicking close does nothing. What is the most likely cause?", options: ["The alert needs role=\"alert\"", "Bootstrap's JavaScript bundle is not loaded (or it uses data-dismiss instead of data-bs-dismiss)", "Alerts cannot be closed", "The close button needs btn-danger"], answer: 1, why: "Dismissing is done by Bootstrap's JS reading data-bs-dismiss; without the script or with the old attribute, nothing listens." },
    { q: "Three cards in a row have different amounts of text and uneven heights. What is the Bootstrap fix?", options: ["Give each card a fixed height in px", "Add h-100 to each card inside its .col", "Use card-group-equal", "Add align-items-end to the row"], answer: 1, why: "Columns in a row already stretch to the same height; h-100 makes each card fill its column." },
    { q: "What is wrong with <div class=\"progress-bar\" style=\"width: 50%\"> placed directly in the body?", options: ["Nothing", "It must be inside a div.progress, which draws the track and sets the height", "The width must be in px", "progress-bar needs JavaScript"], answer: 1, why: "The .progress wrapper draws the background track and height; the .progress-bar is the filled part inside it." },
  ],
};
