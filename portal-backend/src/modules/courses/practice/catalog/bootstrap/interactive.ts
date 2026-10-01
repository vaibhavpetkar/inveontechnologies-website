import type { PracticeUnit } from "../../types.js";
import { bq, el, page } from "./shared.js";

export const interactive: PracticeUnit = {
  key: "interactive",
  title: "Interactive components: modals, carousels, accordions and more",
  summary: "modals, carousels, accordions and collapse, dropdowns, toasts, tooltips and popovers, with data attributes and the JavaScript API",
  reading: String.raw`## Components that need JavaScript

Some Bootstrap components change the page when you click: a modal opens, an accordion panel expands, a toast appears. These are powered by bootstrap.bundle.min.js. You rarely write JavaScript for them yourself: you add data-bs-* attributes and Bootstrap wires up the behaviour.

- data-bs-toggle says which plugin to use: modal, collapse, dropdown, tab, offcanvas, tooltip, popover.
- data-bs-target points at the element to control, by id (#loginModal).
- data-bs-dismiss on a close button closes its parent modal, alert, toast or offcanvas.

When you need control from code, every plugin has a JavaScript API:

` + "```html" + String.raw`
<script>
  const modal = new bootstrap.Modal(document.getElementById("loginModal"));
  modal.show();
  // or: bootstrap.Modal.getOrCreateInstance("#loginModal").hide();
</script>
` + "```" + String.raw`

## Modal

A modal is a dialog on top of the page. Its structure is fixed: modal > modal-dialog > modal-content > modal-header, modal-body, modal-footer.

` + "```html" + String.raw`
<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#loginModal">Log in</button>

<div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h1 class="modal-title fs-5" id="loginTitle">Log in</h1>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">...</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      </div>
    </div>
  </div>
</div>
` + "```" + String.raw`

- fade adds the animation. tabindex="-1" lets the modal take keyboard focus; aria-labelledby names it for screen readers.
- modal-dialog-centered centres it vertically; modal-dialog-scrollable scrolls long bodies; modal-sm, modal-lg, modal-xl and modal-fullscreen change the size.
- data-bs-backdrop="static" stops a click outside from closing it (for "unsaved changes" dialogs).
- Put modals near the end of the body, not inside a fixed navbar or a transformed parent.

## Collapse and accordion

Collapse shows and hides a block: a button with data-bs-toggle="collapse" data-bs-target="#more" and a div.collapse#more. Add show to start open.

An accordion is a group of collapses where opening one closes the others. Each accordion-item has an accordion-header with an accordion-button, and an accordion-collapse with an accordion-body. The data-bs-parent="#faq" on each collapse is what makes only one stay open; leave it out to allow several open at once. The closed buttons get the class collapsed and aria-expanded="false".

## Carousel

A slideshow: div.carousel.slide#banner with a carousel-inner holding carousel-item slides. Exactly one slide must be active. Previous and next buttons use carousel-control-prev and carousel-control-next with data-bs-target="#banner" and data-bs-slide="prev" or "next". Indicators are buttons with data-bs-slide-to="0", "1" and so on. data-bs-ride="carousel" autoplays it. Add d-block w-100 to slide images so they fill the width.

## Dropdown

A div.dropdown holding a button.dropdown-toggle with data-bs-toggle="dropdown" and aria-expanded="false", and a ul.dropdown-menu of li > a.dropdown-item. hr.dropdown-divider separates groups; dropdown-menu-end aligns the menu to the right edge. Dropdowns need Popper, which is why we load the bundle.

## Toasts

Toasts are small notifications. div.toast with role="alert" aria-live="assertive" aria-atomic="true", containing toast-header and toast-body. Place them in a toast-container with position classes (position-fixed bottom-0 end-0 p-3). Toasts do not show on their own: you call bootstrap.Toast.getOrCreateInstance(element).show() from JavaScript, often after a button click or a save.

## Tooltips and popovers

For performance they are opt-in: add data-bs-toggle="tooltip" and data-bs-title="Copy link" to an element, then initialise them once:

` + "```html" + String.raw`
<script>
  document.querySelectorAll('[data-bs-toggle="tooltip"]')
    .forEach(function (el) { new bootstrap.Tooltip(el); });
</script>
` + "```" + String.raw`

Popovers are the same with bootstrap.Popover, data-bs-title and data-bs-content.

## Common mistakes

- Two modals or collapses with the same id, or a target that points to an id that does not exist.
- No slide marked active in a carousel, so it shows nothing.
- Tooltips that never appear because they were never initialised.
- Loading bootstrap.min.js (without Popper) and wondering why dropdowns fail.

## How your assignments are checked

The checker follows the wiring: the trigger's data-bs-toggle and data-bs-target, a matching id on the target, the required inner structure (modal-dialog, modal-content, accordion-collapse with data-bs-parent and so on), accessibility attributes, and, where the question asks for JavaScript, the bootstrap.* calls in your script.`,
  questions: [
    bq(
      "Login modal",
      "Add a button that opens a login dialog.",
      [
        "A button.btn.btn-primary with data-bs-toggle=\"modal\" and data-bs-target=\"#loginModal\" saying Log in",
        "A div.modal.fade#loginModal with tabindex=\"-1\" and aria-labelledby=\"loginTitle\"",
        "Inside: modal-dialog > modal-content with modal-header (h1.modal-title#loginTitle and a btn-close with data-bs-dismiss=\"modal\"), modal-body (an email input) and modal-footer (a Cancel button that dismisses and a Log in submit)",
      ],
      page("Modal", `  <div class="container py-3">
    <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#loginModal">Log in</button>
  </div>
  <div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginTitle" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5" id="loginTitle">Log in</h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <label for="modalEmail" class="form-label">Email</label>
          <input type="email" class="form-control" id="modalEmail">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary">Log in</button>
        </div>
      </div>
    </div>
  </div>
`),
      [
        el('button[data-bs-toggle="modal"][data-bs-target="#loginModal"]', "The button opens #loginModal"),
        el('div.modal.fade#loginModal[tabindex="-1"][aria-labelledby="loginTitle"]', "The modal has the id, tabindex and label"),
        el(".modal > .modal-dialog > .modal-content", "Has the modal-dialog > modal-content structure"),
        el('.modal-header > .modal-title#loginTitle', "The header has the title with id loginTitle"),
        el('.modal-footer button[data-bs-dismiss="modal"]', "The footer has a button that closes the modal", { text: "Cancel" }),
        el(".modal-body input.form-control", "The body has the email field"),
      ],
    ),
    bq(
      "Centred static modal",
      "Build a confirmation dialog that is vertically centred and cannot be closed by clicking outside it.",
      [
        "A trigger button targeting #confirmDelete saying Delete account",
        "A div.modal.fade#confirmDelete with data-bs-backdrop=\"static\" and data-bs-keyboard=\"false\"",
        "Its modal-dialog has modal-dialog-centered",
        "The footer has a Keep account button (dismisses) and a btn-danger Delete button",
      ],
      page("Confirm", `  <div class="container py-3">
    <button type="button" class="btn btn-outline-danger" data-bs-toggle="modal" data-bs-target="#confirmDelete">Delete account</button>
  </div>
  <div class="modal fade" id="confirmDelete" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="confirmTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5" id="confirmTitle">Delete your account?</h1>
        </div>
        <div class="modal-body">This removes your courses and certificates permanently.</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Keep account</button>
          <button type="button" class="btn btn-danger">Delete</button>
        </div>
      </div>
    </div>
  </div>
`),
      [
        el('[data-bs-toggle="modal"][data-bs-target="#confirmDelete"]', "The trigger opens #confirmDelete"),
        el('.modal#confirmDelete[data-bs-backdrop="static"][data-bs-keyboard="false"]', "The modal has a static backdrop and ignores Escape"),
        el("#confirmDelete .modal-dialog.modal-dialog-centered", "The dialog is vertically centred"),
        el(".modal-footer .btn-danger", "The footer has the Delete button", { text: "Delete" }),
        el('.modal-footer [data-bs-dismiss="modal"]', "The footer has a button that keeps the account", { text: "Keep" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Show more with collapse",
      "Hide the long part of a course description behind a Read more button.",
      [
        "A button.btn.btn-link with data-bs-toggle=\"collapse\", data-bs-target=\"#more\", aria-expanded=\"false\" and aria-controls=\"more\" saying Read more",
        "A div.collapse#more with a p of extra text",
      ],
      page("Collapse", `  <div class="container py-3">
    <p>This course teaches responsive design with Bootstrap.</p>
    <button class="btn btn-link" type="button" data-bs-toggle="collapse" data-bs-target="#more" aria-expanded="false" aria-controls="more">Read more</button>
    <div class="collapse" id="more">
      <p>You will build five real pages, including a portfolio and an admin dashboard.</p>
    </div>
  </div>
`),
      [
        el('button[data-bs-toggle="collapse"][data-bs-target="#more"]', "The button toggles #more", { text: "Read more" }),
        el('button[aria-expanded="false"][aria-controls="more"]', "The button has aria-expanded and aria-controls"),
        el("div.collapse#more p", "The hidden block has the extra text"),
      ],
    ),
    bq(
      "FAQ accordion",
      "Build a three-question FAQ where opening one answer closes the others.",
      [
        "A div.accordion#faq with three div.accordion-item",
        "Each item: h2.accordion-header > button.accordion-button (data-bs-toggle=\"collapse\", data-bs-target to its panel), then div.accordion-collapse.collapse with data-bs-parent=\"#faq\" and a div.accordion-body",
        "The first panel is open (show, and its button has aria-expanded=\"true\"); the other buttons have the class collapsed",
      ],
      page("FAQ", `  <div class="container py-3">
    <div class="accordion" id="faq">
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#faqOne" aria-expanded="true" aria-controls="faqOne">Is the course free?</button>
        </h2>
        <div id="faqOne" class="accordion-collapse collapse show" data-bs-parent="#faq">
          <div class="accordion-body">Yes, the first unit is free for everyone.</div>
        </div>
      </div>
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faqTwo" aria-expanded="false" aria-controls="faqTwo">Do I get a certificate?</button>
        </h2>
        <div id="faqTwo" class="accordion-collapse collapse" data-bs-parent="#faq">
          <div class="accordion-body">Yes, after you pass the final exam.</div>
        </div>
      </div>
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faqThree" aria-expanded="false" aria-controls="faqThree">Can I study on my phone?</button>
        </h2>
        <div id="faqThree" class="accordion-collapse collapse" data-bs-parent="#faq">
          <div class="accordion-body">Yes, every page works on mobile.</div>
        </div>
      </div>
    </div>
  </div>
`),
      [
        el(".accordion#faq > .accordion-item", "The accordion #faq has three items", { min: 3 }),
        el('.accordion-header > button.accordion-button[data-bs-toggle="collapse"][data-bs-target]', "Each header has a collapse button", { min: 3 }),
        el('.accordion-collapse.collapse[data-bs-parent="#faq"] > .accordion-body', "Each panel has data-bs-parent=\"#faq\" and a body", { min: 3 }),
        el(".accordion-collapse.collapse.show", "The first panel starts open", { max: 1 }),
        el("button.accordion-button.collapsed", "The closed panels' buttons have the collapsed class", { min: 2 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Image carousel",
      "Build a three-slide banner with indicators and previous/next controls.",
      [
        "A div.carousel.slide#banner",
        "A div.carousel-indicators with three buttons using data-bs-target=\"#banner\" and data-bs-slide-to 0, 1, 2 (the first active)",
        "A div.carousel-inner with three div.carousel-item (the first active), each with an img.d-block.w-100 with alt text",
        "button.carousel-control-prev and button.carousel-control-next with data-bs-target=\"#banner\" and data-bs-slide prev / next",
      ],
      page("Carousel", `  <div id="banner" class="carousel slide">
    <div class="carousel-indicators">
      <button type="button" data-bs-target="#banner" data-bs-slide-to="0" class="active" aria-current="true" aria-label="Slide 1"></button>
      <button type="button" data-bs-target="#banner" data-bs-slide-to="1" aria-label="Slide 2"></button>
      <button type="button" data-bs-target="#banner" data-bs-slide-to="2" aria-label="Slide 3"></button>
    </div>
    <div class="carousel-inner">
      <div class="carousel-item active">
        <img src="campus.jpg" class="d-block w-100" alt="Campus building">
      </div>
      <div class="carousel-item">
        <img src="lab.jpg" class="d-block w-100" alt="Computer lab">
      </div>
      <div class="carousel-item">
        <img src="fest.jpg" class="d-block w-100" alt="Annual tech fest">
      </div>
    </div>
    <button class="carousel-control-prev" type="button" data-bs-target="#banner" data-bs-slide="prev">
      <span class="carousel-control-prev-icon" aria-hidden="true"></span>
      <span class="visually-hidden">Previous</span>
    </button>
    <button class="carousel-control-next" type="button" data-bs-target="#banner" data-bs-slide="next">
      <span class="carousel-control-next-icon" aria-hidden="true"></span>
      <span class="visually-hidden">Next</span>
    </button>
  </div>
`),
      [
        el(".carousel.slide#banner", "Has a carousel with id banner"),
        el('.carousel-indicators > button[data-bs-target="#banner"][data-bs-slide-to]', "Has three indicator buttons", { min: 3 }),
        el(".carousel-inner > .carousel-item > img.d-block.w-100[alt]", "Has three full-width slides with alt text", { min: 3 }),
        el(".carousel-inner > .carousel-item.active", "Exactly one slide is active", { max: 1 }),
        el('button.carousel-control-prev[data-bs-slide="prev"], button.carousel-control-next[data-bs-slide="next"]', "Has previous and next controls", { min: 2 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "User dropdown menu",
      "Build an account dropdown aligned to the right edge.",
      [
        "A div.dropdown with a button.btn.btn-secondary.dropdown-toggle (data-bs-toggle=\"dropdown\", aria-expanded=\"false\") saying Account",
        "A ul.dropdown-menu.dropdown-menu-end with li > a.dropdown-item: Profile, Settings",
        "An li with hr.dropdown-divider, then a Log out item",
      ],
      page("Dropdown", `  <div class="container py-3 d-flex justify-content-end">
    <div class="dropdown">
      <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Account</button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><a class="dropdown-item" href="/profile">Profile</a></li>
        <li><a class="dropdown-item" href="/settings">Settings</a></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="/logout">Log out</a></li>
      </ul>
    </div>
  </div>
`),
      [
        el('.dropdown > button.dropdown-toggle[data-bs-toggle="dropdown"][aria-expanded="false"]', "The toggle button opens the dropdown"),
        el(".dropdown > ul.dropdown-menu.dropdown-menu-end", "The menu is right-aligned"),
        el(".dropdown-menu li > a.dropdown-item", "Has three menu items", { min: 3 }),
        el(".dropdown-menu hr.dropdown-divider", "Has a divider"),
        el("a.dropdown-item", "Has a Log out item", { text: "Log out" }),
      ],
    ),
    bq(
      "Toast shown from JavaScript",
      "Show a Saved notification in the bottom-right corner when the user clicks Save.",
      [
        "A button#saveBtn saying Save",
        "A div.toast-container.position-fixed.bottom-0.end-0.p-3 holding a div.toast#savedToast with role=\"alert\", aria-live=\"assertive\" and aria-atomic=\"true\"",
        "The toast has a toast-header (strong Inveon and a btn-close with data-bs-dismiss=\"toast\") and a toast-body saying Your changes were saved",
        "A script that, on the button's click, shows the toast with bootstrap.Toast.getOrCreateInstance(...).show()",
      ],
      page("Toast", `  <div class="container py-3">
    <button type="button" class="btn btn-primary" id="saveBtn">Save</button>
  </div>
  <div class="toast-container position-fixed bottom-0 end-0 p-3">
    <div id="savedToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header">
        <strong class="me-auto">Inveon</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">Your changes were saved.</div>
    </div>
  </div>
  <script>
    document.getElementById("saveBtn").addEventListener("click", function () {
      bootstrap.Toast.getOrCreateInstance(document.getElementById("savedToast")).show();
    });
  </script>
`),
      [
        el(".toast-container.position-fixed.bottom-0.end-0 > .toast#savedToast", "The toast sits in a fixed bottom-right container"),
        el('.toast[role="alert"][aria-live="assertive"][aria-atomic="true"]', "The toast has the live-region attributes"),
        el('.toast-header > .btn-close[data-bs-dismiss="toast"]', "The header has a close button"),
        el(".toast > .toast-body", "The body has the message", { text: "saved" }),
        { match: String.raw`bootstrap\.Toast\.(getOrCreateInstance\([^)]*\)|getInstance\([^)]*\))\.show\(\)|new\s+bootstrap\.Toast\([^)]*\)[\s\S]*\.show\(\)`, message: "The script shows the toast with the Toast API" },
        { match: String.raw`addEventListener\(\s*["']click["']`, message: "The toast is shown on click" },
      ],
      { level: "advanced" },
    ),
    bq(
      "Tooltips and a popover",
      "Add hover hints to icon buttons and a click popover with extra details.",
      [
        "Two buttons with data-bs-toggle=\"tooltip\" and data-bs-title: Copy link and Share",
        "One button with data-bs-toggle=\"popover\", data-bs-title=\"Refund policy\" and data-bs-content with the policy text",
        "A script that creates a bootstrap.Tooltip for every [data-bs-toggle=\"tooltip\"] element and a bootstrap.Popover for every popover element",
      ],
      page("Tooltips", `  <div class="container py-5">
    <button type="button" class="btn btn-outline-secondary" data-bs-toggle="tooltip" data-bs-title="Copy link">Copy</button>
    <button type="button" class="btn btn-outline-secondary" data-bs-toggle="tooltip" data-bs-title="Share">Share</button>
    <button type="button" class="btn btn-link" data-bs-toggle="popover" data-bs-title="Refund policy" data-bs-content="Full refund within 7 days of purchase.">Refunds</button>
  </div>
  <script>
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
      new bootstrap.Tooltip(el);
    });
    document.querySelectorAll('[data-bs-toggle="popover"]').forEach(function (el) {
      new bootstrap.Popover(el);
    });
  </script>
`),
      [
        el('[data-bs-toggle="tooltip"][data-bs-title]', "Has two elements with tooltips", { min: 2 }),
        el('[data-bs-toggle="popover"][data-bs-title][data-bs-content]', "Has a popover with a title and content"),
        { match: String.raw`new\s+bootstrap\.Tooltip\(`, message: "The script initialises the tooltips" },
        { match: String.raw`new\s+bootstrap\.Popover\(`, message: "The script initialises the popover" },
        { match: String.raw`querySelectorAll\(\s*['"]\[data-bs-toggle="tooltip"\]['"]\s*\)`, message: "Tooltips are found with the [data-bs-toggle=\"tooltip\"] selector" },
      ],
      { level: "advanced" },
    ),
    bq(
      "Modal opened from code",
      "Open a welcome modal automatically when the page loads, using Bootstrap's JavaScript API instead of a button.",
      [
        "A div.modal.fade#welcome with the usual modal-dialog > modal-content, a modal-header with title and close button, and a modal-body saying Welcome to Inveon",
        "A script that creates the modal with new bootstrap.Modal(document.getElementById(\"welcome\")) and calls show()",
      ],
      page("Welcome", `  <div class="modal fade" id="welcome" tabindex="-1" aria-labelledby="welcomeTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5" id="welcomeTitle">Hello!</h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">Welcome to Inveon. Start with the first unit.</div>
      </div>
    </div>
  </div>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      const welcome = new bootstrap.Modal(document.getElementById("welcome"));
      welcome.show();
    });
  </script>
`),
      [
        el(".modal.fade#welcome > .modal-dialog > .modal-content", "Has the #welcome modal with the right structure"),
        el("#welcome .modal-body", "The body has the welcome text", { text: "Welcome to Inveon" }),
        el('#welcome .modal-header .btn-close[data-bs-dismiss="modal"]', "The modal can be closed"),
        { match: String.raw`new\s+bootstrap\.Modal\(\s*document\.getElementById\(\s*["']welcome["']\s*\)\s*\)`, message: "Creates the modal with new bootstrap.Modal(...)" },
        { match: String.raw`\.show\(\)`, message: "Calls show() to open it" },
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "Which attribute on a button opens a modal?", options: ["data-bs-open=\"modal\"", "data-bs-toggle=\"modal\" with data-bs-target=\"#id\"", "onclick=\"modal()\"", "href=\"#modal\" only"], answer: 1, why: "data-bs-toggle picks the plugin and data-bs-target picks the element." },
    { q: "What is the required nesting of a Bootstrap modal?", options: ["modal > modal-content > modal-dialog", "modal > modal-dialog > modal-content", "modal-dialog > modal > modal-content", "modal > modal-body only"], answer: 1, why: "The dialog positions the box, the content draws it; header, body and footer go inside the content." },
    { q: "Which class centres a modal vertically?", options: ["modal-centered", "modal-dialog-centered on the modal-dialog", "align-middle", "my-auto on the modal"], answer: 1, why: "modal-dialog-centered goes on the .modal-dialog element." },
    { q: "In an accordion, what makes the other panels close when one opens?", options: ["The accordion-flush class", "data-bs-parent pointing at the accordion's id on each collapse", "aria-expanded", "The collapsed class"], answer: 1, why: "data-bs-parent groups the collapses so only one is open at a time." },
    { q: "What must be true of the slides in a carousel?", options: ["Each needs an id", "Exactly one carousel-item must have active", "All of them must have active", "They must be images only"], answer: 1, why: "The active slide is the one shown; with none active, nothing is visible." },
    { q: "Why must you load bootstrap.bundle.min.js (not bootstrap.min.js) for dropdowns?", options: ["The bundle has the CSS", "Dropdowns need Popper for positioning, and only the bundle includes it", "bootstrap.min.js is for Bootstrap 4", "It's faster"], answer: 1, why: "Dropdowns, tooltips and popovers use Popper, included in the bundle." },
    { q: "What does data-bs-backdrop=\"static\" do on a modal?", options: ["Removes the dark background", "Clicking outside the modal no longer closes it", "Makes the modal non-scrollable", "Stops the fade animation"], answer: 1, why: "A static backdrop keeps the modal open until a button closes it." },
    { q: "You added data-bs-toggle=\"tooltip\" and data-bs-title to a button, and the bundle is loaded, but no tooltip appears. Why?", options: ["Tooltips need jQuery", "Tooltips are opt-in: you must create them with new bootstrap.Tooltip(element)", "The title must be in the title attribute only", "Tooltips only work on links"], answer: 1, why: "For performance, Bootstrap doesn't auto-initialise tooltips and popovers." },
    { q: "A toast is in the page with correct markup but never appears. What is missing?", options: ["A data-bs-toggle=\"toast\" on the toast itself", "A call like bootstrap.Toast.getOrCreateInstance(el).show() (toasts start hidden)", "The class show-toast", "A toast-header"], answer: 1, why: "Toasts are shown from JavaScript; there is no automatic trigger." },
    { q: "Two accordion items both use data-bs-target=\"#panel\" and there are two divs with id=\"panel\". What happens?", options: ["Both work fine", "Duplicate ids are invalid and both buttons control the same (first) panel, so the second never opens properly", "Bootstrap renames them", "Only CSS breaks"], answer: 1, why: "An id must be unique; the selector finds the first match, so the second button can't reach its own panel." },
  ],
};
