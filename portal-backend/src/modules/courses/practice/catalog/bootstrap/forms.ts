import type { PracticeUnit } from "../../types.js";
import { bq, el, page } from "./shared.js";

export const forms: PracticeUnit = {
  key: "forms",
  title: "Forms and validation",
  summary: "form controls, labels, selects, checks and switches, input groups, floating labels, form grids and validation styles",
  reading: String.raw`## Form controls

Bootstrap restyles native form elements so they look the same in every browser. The pattern is always a label with form-label and a control with form-control, linked by for and id:

` + "```html" + String.raw`
<form>
  <div class="mb-3">
    <label for="email" class="form-label">Email address</label>
    <input type="email" class="form-control" id="email" aria-describedby="emailHelp">
    <div id="emailHelp" class="form-text">We never share your email.</div>
  </div>
  <button type="submit" class="btn btn-primary">Subscribe</button>
</form>
` + "```" + String.raw`

- mb-3 on a wrapper div spaces the fields out.
- form-text is small grey help text; link it with aria-describedby.
- form-control-lg and form-control-sm change the size.
- textarea also uses form-control.
- select uses form-select, not form-control.
- disabled greys a field out; readonly keeps it readable but uneditable. form-control-plaintext shows a readonly value as plain text.
- input type="range" uses form-range; type="file" uses form-control; type="color" uses form-control form-control-color.

Always give every input a type (email, password, number, tel, date) so phones show the right keyboard and browsers can validate it.

## Checkboxes, radios and switches

` + "```html" + String.raw`
<div class="form-check">
  <input class="form-check-input" type="checkbox" id="terms">
  <label class="form-check-label" for="terms">I accept the terms</label>
</div>
<div class="form-check form-switch">
  <input class="form-check-input" type="checkbox" role="switch" id="dark">
  <label class="form-check-label" for="dark">Dark mode</label>
</div>
` + "```" + String.raw`

Radios in one group share the same name so only one can be chosen. form-check-inline puts options side by side.

## Input groups and floating labels

An input group attaches text or buttons to a field: div.input-group containing span.input-group-text (for @, Rs, .com) and the input. Buttons can go inside too, for a search box.

Floating labels start inside the field and move up when you type. The input must come before the label, and it needs a placeholder (any text) for the effect to work:

` + "```html" + String.raw`
<div class="form-floating mb-3">
  <input type="password" class="form-control" id="pwd" placeholder="Password">
  <label for="pwd">Password</label>
</div>
` + "```" + String.raw`

## Form layout

Forms use the normal grid. For a two-column form, use div.row.g-3 with columns like col-md-6 for first and last name and col-12 for the address. For a label beside its input, use row with col-form-label on the label (col-sm-2 col-form-label) and a col-sm-10 around the input.

## Validation

Bootstrap gives you validation styles; the browser does the checking using HTML attributes such as required, minlength, pattern, min and max.

- Add novalidate and the class needs-validation to the form. novalidate turns off the browser's own bubbles so Bootstrap's messages show instead.
- After each input add div.invalid-feedback (and optionally div.valid-feedback) with the message.
- On submit, a small script adds was-validated to the form, which reveals the messages:

` + "```html" + String.raw`
<script>
  document.querySelectorAll(".needs-validation").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add("was-validated");
    });
  });
</script>
` + "```" + String.raw`

For errors that come back from the server (for example "username already taken"), skip was-validated and put is-invalid (or is-valid) directly on the input, with the invalid-feedback after it.

Remember: client-side validation is only for user comfort. The server must validate again, because anyone can bypass the browser.

## Common mistakes

- Labels without for, or for values that don't match any id: clicking the label does nothing and screen readers can't connect them.
- form-control on a select (use form-select) or on a checkbox (use form-check-input).
- Floating labels with the label before the input, or with no placeholder.
- invalid-feedback placed somewhere other than right after the input (or inside the same parent), so it never appears.
- Forgetting novalidate, so the browser's popups appear instead of Bootstrap's messages.

## How your assignments are checked

The checker parses your form and checks the Bootstrap classes, the input types, that labels point at real ids, and the validation attributes and feedback elements the question lists. You do not need a working server; action can point anywhere.`,
  questions: [
    bq(
      "Contact form",
      "Build a contact form with labelled fields.",
      [
        "A form with three div.mb-3 groups",
        "Name: label.form-label for=\"name\" and input.form-control type=\"text\" id=\"name\"",
        "Email: label for=\"email\" and input.form-control type=\"email\" id=\"email\"",
        "Message: label for=\"message\" and textarea.form-control id=\"message\" rows=\"4\"",
        "A button.btn.btn-primary type=\"submit\" saying Send",
      ],
      page("Contact", `  <div class="container py-3">
    <form action="/contact" method="post">
      <div class="mb-3">
        <label for="name" class="form-label">Name</label>
        <input type="text" class="form-control" id="name" name="name">
      </div>
      <div class="mb-3">
        <label for="email" class="form-label">Email</label>
        <input type="email" class="form-control" id="email" name="email">
      </div>
      <div class="mb-3">
        <label for="message" class="form-label">Message</label>
        <textarea class="form-control" id="message" name="message" rows="4"></textarea>
      </div>
      <button type="submit" class="btn btn-primary">Send</button>
    </form>
  </div>
`),
      [
        el('form .mb-3 label.form-label[for="name"]', "The name field has a linked label"),
        el('input.form-control[type="email"]#email', "Has an email input with id email"),
        el("textarea.form-control#message", "Has a message textarea"),
        el("form label.form-label[for]", "All three fields have labels", { min: 3 }),
        el('form button.btn.btn-primary[type="submit"]', "Has a submit button", { text: "Send" }),
      ],
    ),
    bq(
      "Select, help text and disabled field",
      "Build a course enrolment form with a dropdown, help text and a locked field.",
      [
        "A select.form-select with id=\"course\" (label for=\"course\") and at least three options",
        "An input.form-control type=\"tel\" id=\"phone\" with aria-describedby=\"phoneHelp\" and a div.form-text#phoneHelp",
        "An input.form-control id=\"batch\" that is disabled with value=\"September 2026\"",
      ],
      page("Enrol", `  <div class="container py-3">
    <form>
      <div class="mb-3">
        <label for="course" class="form-label">Course</label>
        <select class="form-select" id="course">
          <option value="">Choose a course</option>
          <option value="web">Web development</option>
          <option value="data">Data science</option>
          <option value="cloud">Cloud computing</option>
        </select>
      </div>
      <div class="mb-3">
        <label for="phone" class="form-label">Phone</label>
        <input type="tel" class="form-control" id="phone" aria-describedby="phoneHelp">
        <div id="phoneHelp" class="form-text">We will send your batch details by SMS.</div>
      </div>
      <div class="mb-3">
        <label for="batch" class="form-label">Batch</label>
        <input type="text" class="form-control" id="batch" value="September 2026" disabled>
      </div>
    </form>
  </div>
`),
      [
        el("select.form-select#course option", "The course select uses form-select and has options", { min: 3 }),
        el('label[for="course"]', "The select has a label"),
        el('input.form-control[type="tel"][aria-describedby="phoneHelp"]', "The phone input is linked to its help text"),
        el(".form-text#phoneHelp", "Has the help text with id phoneHelp"),
        el("input.form-control#batch[disabled]", "The batch field is disabled"),
      ],
    ),
    bq(
      "Checkboxes, radios and a switch",
      "Build the preferences part of a sign-up form.",
      [
        "Two inline radios (div.form-check.form-check-inline) named mode with ids online and offline",
        "A checkbox div.form-check with input.form-check-input id=\"terms\" and label.form-check-label for=\"terms\"",
        "A switch: div.form-check.form-switch with an input type=\"checkbox\" role=\"switch\" id=\"alerts\" and its label",
      ],
      page("Preferences", `  <div class="container py-3">
    <form>
      <p class="mb-1">Mode</p>
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" name="mode" id="online" value="online" checked>
        <label class="form-check-label" for="online">Online</label>
      </div>
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" name="mode" id="offline" value="offline">
        <label class="form-check-label" for="offline">Offline</label>
      </div>
      <div class="form-check mt-3">
        <input class="form-check-input" type="checkbox" id="terms">
        <label class="form-check-label" for="terms">I accept the terms</label>
      </div>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" role="switch" id="alerts">
        <label class="form-check-label" for="alerts">Email alerts</label>
      </div>
    </form>
  </div>
`),
      [
        el('.form-check.form-check-inline > input.form-check-input[type="radio"][name="mode"]', "Has two inline radios named mode", { min: 2 }),
        el('.form-check > input.form-check-input[type="checkbox"]#terms', "Has the terms checkbox"),
        el('.form-check > label.form-check-label[for="terms"]', "The checkbox has a linked label"),
        el('.form-check.form-switch > input[type="checkbox"][role="switch"]#alerts', "Has an alerts switch"),
      ],
    ),
    bq(
      "Input groups",
      "Use input groups for a username, a price and a search box.",
      [
        "A div.input-group with span.input-group-text @ and an input.form-control for the username",
        "A div.input-group with span.input-group-text Rs, an input type=\"number\", and span.input-group-text .00",
        "A div.input-group with an input type=\"search\" and a button.btn.btn-outline-secondary Search",
      ],
      page("Input groups", `  <div class="container py-3">
    <div class="input-group mb-3">
      <span class="input-group-text" id="at">@</span>
      <input type="text" class="form-control" placeholder="Username" aria-label="Username" aria-describedby="at">
    </div>
    <div class="input-group mb-3">
      <span class="input-group-text">Rs</span>
      <input type="number" class="form-control" aria-label="Amount">
      <span class="input-group-text">.00</span>
    </div>
    <div class="input-group">
      <input type="search" class="form-control" placeholder="Search courses" aria-label="Search courses">
      <button class="btn btn-outline-secondary" type="button">Search</button>
    </div>
  </div>
`),
      [
        el(".input-group > .input-group-text", "The username group starts with @", { text: "@" }),
        el('.input-group > input.form-control[type="number"]', "Has a number input in an input group"),
        el(".input-group > .input-group-text", "The price group has Rs and .00 addons", { min: 3 }),
        el('.input-group > input.form-control[type="search"]', "Has a search input in an input group"),
        el(".input-group > button.btn.btn-outline-secondary", "The search group has a Search button", { text: "Search" }),
      ],
    ),
    bq(
      "Floating label login",
      "Build a login box with floating labels.",
      [
        "Two div.form-floating.mb-3 blocks",
        "Each has the input first (with a placeholder), then its label: email (id=\"loginEmail\") and password (id=\"loginPassword\")",
        "A button.btn.btn-primary.w-100 type=\"submit\" saying Log in",
      ],
      page("Login", `  <div class="container py-3" style="max-width: 400px">
    <form>
      <div class="form-floating mb-3">
        <input type="email" class="form-control" id="loginEmail" placeholder="name@example.com">
        <label for="loginEmail">Email address</label>
      </div>
      <div class="form-floating mb-3">
        <input type="password" class="form-control" id="loginPassword" placeholder="Password">
        <label for="loginPassword">Password</label>
      </div>
      <button type="submit" class="btn btn-primary w-100">Log in</button>
    </form>
  </div>
`),
      [
        el(".form-floating > input.form-control[placeholder]", "Both floating inputs have a placeholder", { min: 2 }),
        el('.form-floating > label[for="loginEmail"]', "The email field has a floating label"),
        el('.form-floating > input[type="password"]#loginPassword', "Has a password field with id loginPassword"),
        { match: String.raw`<input[^>]*loginPassword[^>]*>\s*<label`, message: "The input comes before its label" },
        el('button.btn.btn-primary.w-100[type="submit"]', "Has a full-width submit button", { text: "Log in" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Two column address form",
      "Lay out an address form on the grid: two fields per row from md up.",
      [
        "A form.row.g-3",
        "div.col-md-6 for First name and Last name",
        "div.col-12 for Address",
        "div.col-md-6 for City, div.col-md-4 for State (a form-select) and div.col-md-2 for PIN",
        "Every field has a form-label and a matching id",
      ],
      page("Address", `  <div class="container py-3">
    <form class="row g-3">
      <div class="col-md-6">
        <label for="first" class="form-label">First name</label>
        <input type="text" class="form-control" id="first">
      </div>
      <div class="col-md-6">
        <label for="last" class="form-label">Last name</label>
        <input type="text" class="form-control" id="last">
      </div>
      <div class="col-12">
        <label for="address" class="form-label">Address</label>
        <input type="text" class="form-control" id="address">
      </div>
      <div class="col-md-6">
        <label for="city" class="form-label">City</label>
        <input type="text" class="form-control" id="city">
      </div>
      <div class="col-md-4">
        <label for="state" class="form-label">State</label>
        <select class="form-select" id="state">
          <option>Maharashtra</option>
          <option>Karnataka</option>
        </select>
      </div>
      <div class="col-md-2">
        <label for="pin" class="form-label">PIN</label>
        <input type="text" class="form-control" id="pin" inputmode="numeric">
      </div>
      <div class="col-12">
        <button type="submit" class="btn btn-primary">Save address</button>
      </div>
    </form>
  </div>
`),
      [
        el("form.row.g-3", "The form itself is a row with g-3"),
        el("form.row > .col-md-6 input.form-control", "First name, last name and city are in col-md-6", { min: 3 }),
        el("form.row > .col-12 input#address", "Address is full width"),
        el("form.row > .col-md-4 select.form-select#state", "State is a form-select in col-md-4"),
        el("form.row > .col-md-2 input#pin", "PIN is in col-md-2"),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Horizontal form",
      "Put labels beside their fields on wider screens.",
      [
        "Two div.row.mb-3 groups",
        "Each label has col-sm-2 col-form-label and the input sits in a div.col-sm-10",
        "Fields: Email (type email, id hEmail) and Password (type password, id hPassword)",
      ],
      page("Horizontal", `  <div class="container py-3">
    <form>
      <div class="row mb-3">
        <label for="hEmail" class="col-sm-2 col-form-label">Email</label>
        <div class="col-sm-10">
          <input type="email" class="form-control" id="hEmail">
        </div>
      </div>
      <div class="row mb-3">
        <label for="hPassword" class="col-sm-2 col-form-label">Password</label>
        <div class="col-sm-10">
          <input type="password" class="form-control" id="hPassword">
        </div>
      </div>
      <button type="submit" class="btn btn-primary">Sign in</button>
    </form>
  </div>
`),
      [
        el(".row.mb-3 > label.col-sm-2.col-form-label", "Labels use col-sm-2 col-form-label", { min: 2 }),
        el(".row.mb-3 > .col-sm-10 > input.form-control", "Inputs sit in col-sm-10", { min: 2 }),
        el('input[type="email"]#hEmail', "Has the email field"),
        el('label[for="hPassword"]', "The password label points at hPassword"),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Client-side validation",
      "Build a registration form that shows Bootstrap's validation messages when submitted empty.",
      [
        "A form.needs-validation with the novalidate attribute",
        "A required text input id=\"username\" with minlength=\"3\", followed by a div.invalid-feedback",
        "A required email input id=\"regEmail\" followed by a div.invalid-feedback",
        "A script that, on submit, calls checkValidity(), prevents submission when invalid and adds the class was-validated",
      ],
      page("Validation", `  <div class="container py-3">
    <form class="needs-validation" novalidate>
      <div class="mb-3">
        <label for="username" class="form-label">Username</label>
        <input type="text" class="form-control" id="username" minlength="3" required>
        <div class="invalid-feedback">Choose a username of at least 3 characters.</div>
      </div>
      <div class="mb-3">
        <label for="regEmail" class="form-label">Email</label>
        <input type="email" class="form-control" id="regEmail" required>
        <div class="invalid-feedback">Enter a valid email address.</div>
      </div>
      <button type="submit" class="btn btn-primary">Register</button>
    </form>
  </div>
  <script>
    document.querySelectorAll(".needs-validation").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        }
        form.classList.add("was-validated");
      });
    });
  </script>
`),
      [
        el("form.needs-validation[novalidate]", "The form has needs-validation and novalidate"),
        el("input#username[required][minlength]", "The username is required with a minimum length"),
        el('input[type="email"][required]#regEmail', "The email is required"),
        el(".mb-3 > .invalid-feedback", "Each field has an invalid-feedback message", { min: 2 }),
        { match: String.raw`checkValidity\(\)[\s\S]*preventDefault\(\)[\s\S]*was-validated`, message: "The script checks validity, prevents the submit and adds was-validated" },
      ],
      { level: "advanced" },
    ),
    bq(
      "Server-side validation states",
      "Show the result of a server check: the username is taken and the email is fine.",
      [
        "An input#takenUser with the class is-invalid and aria-describedby=\"takenUserFeedback\", followed by div.invalid-feedback#takenUserFeedback saying That username is already taken",
        "An input#okEmail (type email) with the class is-valid, followed by div.valid-feedback saying Looks good",
        "Both inputs have form-control and labels",
      ],
      page("Server validation", `  <div class="container py-3">
    <form>
      <div class="mb-3">
        <label for="takenUser" class="form-label">Username</label>
        <input type="text" class="form-control is-invalid" id="takenUser" value="rahul" aria-describedby="takenUserFeedback">
        <div id="takenUserFeedback" class="invalid-feedback">That username is already taken.</div>
      </div>
      <div class="mb-3">
        <label for="okEmail" class="form-label">Email</label>
        <input type="email" class="form-control is-valid" id="okEmail" value="rahul@example.com">
        <div class="valid-feedback">Looks good!</div>
      </div>
    </form>
  </div>
`),
      [
        el('input.form-control.is-invalid#takenUser[aria-describedby="takenUserFeedback"]', "The username input is marked is-invalid and linked to its message"),
        el(".invalid-feedback#takenUserFeedback", "The invalid message explains the problem", { text: "already taken" }),
        el('input.form-control.is-valid[type="email"]#okEmail', "The email input is marked is-valid"),
        el(".valid-feedback", "Has a valid-feedback message", { text: "Looks good" }),
      ],
      { level: "advanced" },
    ),
    bq(
      "Range, file and colour inputs",
      "Build a profile settings form with the less common input types.",
      [
        "An input type=\"range\" with class form-range, id=\"volume\", min=\"0\" and max=\"100\"",
        "An input type=\"file\" with class form-control, id=\"photo\" and accept=\"image/*\"",
        "An input type=\"color\" with classes form-control form-control-color and id=\"theme\"",
        "Each has a label pointing at it",
      ],
      page("Settings form", `  <div class="container py-3">
    <form>
      <div class="mb-3">
        <label for="volume" class="form-label">Notification volume</label>
        <input type="range" class="form-range" id="volume" min="0" max="100">
      </div>
      <div class="mb-3">
        <label for="photo" class="form-label">Profile photo</label>
        <input type="file" class="form-control" id="photo" accept="image/*">
      </div>
      <div class="mb-3">
        <label for="theme" class="form-label">Theme colour</label>
        <input type="color" class="form-control form-control-color" id="theme" value="#0d6efd">
      </div>
    </form>
  </div>
`),
      [
        el('input.form-range[type="range"]#volume[min][max]', "Has a range slider with min and max"),
        el('input.form-control[type="file"]#photo[accept]', "Has a file input that accepts images"),
        el('input.form-control.form-control-color[type="color"]#theme', "Has a colour picker"),
        el('label[for="volume"], label[for="photo"], label[for="theme"]', "Each input has a label", { min: 3 }),
      ],
      { level: "intermediate" },
    ),
  ],
  quiz: [
    { q: "Which class styles a select dropdown in Bootstrap 5?", options: ["form-control", "form-select", "custom-select", "select-control"], answer: 1, why: "Bootstrap 5 uses form-select; custom-select was Bootstrap 4." },
    { q: "What links a label to its input?", options: ["Putting them in the same div", "The label's for matches the input's id", "The label's name matches the input's name", "aria-label on the div"], answer: 1, why: "for=\"x\" on the label and id=\"x\" on the input connect them for clicks and screen readers." },
    { q: "Which wrapper and input class make a checkbox look like a toggle switch?", options: ["form-toggle", "form-check form-switch with form-check-input", "btn-check", "switch"], answer: 1, why: "form-switch on the form-check wrapper turns the checkbox into a switch." },
    { q: "What is the purpose of span.input-group-text?", options: ["It shows an error", "It shows text like @ or Rs attached to the side of an input", "It replaces the label", "It makes the input bigger"], answer: 1, why: "Input group text is an addon glued to the field." },
    { q: "Why do radios in one question share the same name?", options: ["For styling", "So that only one of them can be selected at a time", "Bootstrap requires it for the circle", "So they share an id"], answer: 1, why: "Radios with the same name form a group where selecting one deselects the others." },
    { q: "What does the novalidate attribute on a form do in Bootstrap's validation pattern?", options: ["It disables all validation", "It turns off the browser's own popups so Bootstrap's feedback messages can be shown", "It validates on the server", "It hides invalid-feedback"], answer: 1, why: "checkValidity() still works; novalidate only stops the browser from showing its native tooltips and blocking submit itself." },
    { q: "When should you put is-invalid directly on an input?", options: ["Never", "When showing an error that came from the server, without was-validated", "On every required field", "Only on checkboxes"], answer: 1, why: "is-invalid and is-valid are for states you set yourself, typically after a server-side check." },
    { q: "A floating label overlaps the text you type. Which mistake causes that?", options: ["The input has no id", "The input has no placeholder (or the label comes before the input)", "form-floating needs JS", "The label needs form-label"], answer: 1, why: "Floating labels use :placeholder-shown and a sibling selector, so the input needs a placeholder and must come first." },
    { q: "Your form has was-validated and a required input, but the invalid-feedback never shows. The feedback div is placed after the form's submit button. Why?", options: ["invalid-feedback needs JS", "The feedback must be a sibling right after the input (or in the same parent), because Bootstrap uses a sibling selector", "was-validated only works on inputs", "required needs a value"], answer: 1, why: "Bootstrap shows it with .is-invalid ~ .invalid-feedback / :invalid ~ .invalid-feedback, so it must follow the input as a sibling." },
    { q: "Client-side Bootstrap validation passes. Why must the server still validate the data?", options: ["It doesn't need to", "Anyone can bypass or edit browser checks (for example with DevTools or a direct HTTP request)", "Because Bootstrap validation only works in Chrome", "To make the page faster"], answer: 1, why: "Browser validation is for convenience; it gives no security, so the server must check every request." },
  ],
};
