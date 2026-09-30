import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const forms: PracticeUnit = {
  key: "forms",
  title: "Forms, input types and validation",
  summary: "forms, labels, the modern input types, radio buttons, checkboxes, select, textarea, fieldset and built-in validation",
  reading: String.raw`## The form element

A form collects data and sends it to a server. action is the URL that receives the data and method is how it is sent:

- method="get" puts the data in the URL (?q=html&page=2). Use it for searches and filters, which are safe to bookmark and repeat.
- method="post" sends the data in the request body. Use it for logins, sign-ups, payments and anything that changes data.

Only fields with a name attribute are sent. The name is the key the server reads, for example name="email" arrives as email=riya@example.com.

` + "```html" + String.raw`
<form action="/register" method="post">
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required>
  <button type="submit">Register</button>
</form>
` + "```" + String.raw`

## Labels

Every field needs a visible label, connected to it. Either give the label a for attribute equal to the input's id, or wrap the input inside the label. A connected label is read by screen readers, and clicking it focuses the field (or ticks the checkbox), which is a big help on phones. A placeholder is not a label: it disappears as soon as you type.

## Input types

The type attribute changes the keyboard on phones, the built-in validation and the control itself:

- text, password, email, url, tel, search
- number (with min, max and step), range (a slider)
- date, time, datetime-local, month, week
- checkbox, radio, color, file, hidden
- submit, reset and button (but prefer <button> elements)

type="email" checks for an @, type="url" checks for a scheme, and type="tel" shows a number pad without checking the format, because phone formats differ across the world.

## Choices: radio, checkbox and select

Radio buttons that share the same name form a group where only one can be chosen. Each needs its own value, which is what gets sent. Checkboxes allow any number of choices. Add checked to pre-select one.

` + "```html" + String.raw`
<fieldset>
  <legend>Preferred batch</legend>
  <label><input type="radio" name="batch" value="morning" checked> Morning</label>
  <label><input type="radio" name="batch" value="evening"> Evening</label>
</fieldset>
` + "```" + String.raw`

<fieldset> groups related fields and <legend> is the group's caption. Always use them for a group of radio buttons, because the individual labels (Morning, Evening) make no sense without the question.

<select> gives a drop-down of <option> elements; <optgroup label="..."> groups options; multiple allows several choices. <textarea> is for multi-line text; its initial content goes between the tags, not in a value attribute. <datalist> gives an input a list of suggestions while still allowing free text.

## Buttons

A <button> inside a form defaults to type="submit". Write the type every time: type="submit" to send, type="reset" to clear the form, and type="button" for buttons that only run JavaScript. Forgetting this is why a "Show password" button suddenly submits the form.

## Built-in validation

The browser can check data before sending, with no JavaScript:

- required: the field must not be empty.
- minlength and maxlength: text length limits.
- min, max and step: number and date limits.
- pattern: a regular expression the whole value must match, for example pattern="[0-9]{6}" for an Indian PIN code. Explain the format in the label or a hint, because the default error message is vague.
- type itself (email, url, number) adds format checks.

The CSS pseudo-classes :valid, :invalid and :user-invalid let you style fields by their state. Remember that browser validation is for the user's convenience only: anyone can bypass it, so the server must check everything again.

## Other useful attributes

- autocomplete="email", "name", "tel", "new-password", "one-time-code" help browsers and password managers fill fields.
- inputmode="numeric" shows a number keyboard for text fields that hold digits, like an OTP.
- disabled fields are not sent; readonly fields are sent but cannot be edited.
- To upload files, the form needs method="post" and enctype="multipart/form-data", and the input can limit types with accept=".pdf,.docx".

## How your assignments are checked

The checker looks at the form's attributes, the types and names of fields, and whether each label points to an id. Give every field an id, a name and a label, and a type on every input and button.`,
  questions: [
    hq(
      "Login form",
      "Build a login form that posts to /login.",
      [
        'A form with action="/login" and method="post"',
        "An email field with id and name email, a label, and required",
        "A password field with id and name password, a label, and required",
        'A submit button: <button type="submit">Log in</button>',
      ],
      page("Log in", String.raw`
  <h1>Log in</h1>
  <form action="/login" method="post">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" autocomplete="email" required>
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required>
    <button type="submit">Log in</button>
  </form>`),
      [
        el('form[action="/login"][method=post]', "The form posts to /login"),
        el("form input#email[type=email][name=email][required]", "A required email field named email"),
        el("form input#password[type=password][name=password][required]", "A required password field named password"),
        el("label[for=email]", "A label for the email field"),
        el("label[for=password]", "A label for the password field"),
        el("form button[type=submit]", "A submit button"),
      ],
    ),

    hq(
      "Labels for every field",
      "Build a contact form where every field has a connected label, using both labelling styles.",
      [
        'Name: a separate <label for="name"> and an input with id="name"',
        'Phone: a separate <label for="phone"> and an input of type tel with id="phone"',
        "City: the input is wrapped inside its label (no for needed)",
        "Every input has a name attribute",
      ],
      page("Contact form", String.raw`
  <form action="/contact" method="post">
    <label for="name">Full name</label>
    <input type="text" id="name" name="name" autocomplete="name">
    <label for="phone">Phone</label>
    <input type="tel" id="phone" name="phone" autocomplete="tel">
    <label>City <input type="text" name="city"></label>
    <button type="submit">Send</button>
  </form>`),
      [
        el("label[for=name]", 'A label with for="name"'),
        el("input#name[name]", 'An input with id="name" and a name'),
        el("label[for=phone]", 'A label with for="phone"'),
        el("input#phone[type=tel][name]", "A tel input with id phone"),
        el("label > input[name=city]", "The city input is wrapped in its label"),
      ],
    ),

    hq(
      "Registration with the right input types",
      "Build a student registration form that uses the best input type for each field.",
      [
        "Email (type email), website or portfolio (type url), mobile (type tel)",
        "Date of birth (type date)",
        "Year of study (type number) with min 1 and max 4",
        "Every field has an id, a name and a matching label",
      ],
      page("Register", String.raw`
  <form action="/register" method="post">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required>
    <label for="portfolio">Portfolio</label>
    <input type="url" id="portfolio" name="portfolio" placeholder="https://">
    <label for="mobile">Mobile</label>
    <input type="tel" id="mobile" name="mobile">
    <label for="dob">Date of birth</label>
    <input type="date" id="dob" name="dob">
    <label for="year">Year of study</label>
    <input type="number" id="year" name="year" min="1" max="4">
    <button type="submit">Register</button>
  </form>`),
      [
        el("input[type=email][name]", "An email field"),
        el("input[type=url][name]", "A URL field"),
        el("input[type=tel][name]", "A tel field"),
        el("input[type=date][name]", "A date field"),
        el("input[type=number][min=1][max=4]", "A number field limited to 1-4"),
        el("label[for]", "Five labels", { min: 5 }),
      ],
    ),

    hq(
      "Radio buttons and checkboxes",
      "Ask which course a student wants and which extras they want.",
      [
        "A fieldset with the legend Choose a course and three radio buttons sharing name=\"course\", each with a different value",
        "Pre-select the first course with checked",
        "A second fieldset with the legend Extras and at least two checkboxes with name=\"extras\"",
        "Every radio and checkbox has a label",
      ],
      page("Course choice", String.raw`
  <form action="/enrol" method="post">
    <fieldset>
      <legend>Choose a course</legend>
      <label><input type="radio" name="course" value="web" checked> Web development</label>
      <label><input type="radio" name="course" value="data"> Data science</label>
      <label><input type="radio" name="course" value="cloud"> Cloud and DevOps</label>
    </fieldset>
    <fieldset>
      <legend>Extras</legend>
      <label><input type="checkbox" name="extras" value="mentor"> Personal mentor</label>
      <label><input type="checkbox" name="extras" value="certificate"> Printed certificate</label>
    </fieldset>
    <button type="submit">Enrol</button>
  </form>`),
      [
        el("fieldset > legend", "A fieldset with a legend for the course", { text: "course" }),
        el("input[type=radio][name=course][value]", "Three radio buttons named course", { min: 3 }),
        el("input[type=radio][checked]", "One radio is pre-selected", { min: 1, max: 1 }),
        el("input[type=checkbox][name=extras]", "At least two checkboxes named extras", { min: 2 }),
        el("label > input[type=radio], label > input[type=checkbox]", "Every choice is inside a label", { min: 5 }),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Drop-down with option groups",
      "Build a city selector grouped by state.",
      [
        'A select with id and name "city" and a label',
        'A first option with an empty value: <option value="">Select a city</option>',
        "Two optgroups with a label (a state name), each with at least two city options",
        "Make the select required",
      ],
      page("City", String.raw`
  <form action="/profile" method="post">
    <label for="city">City</label>
    <select id="city" name="city" required>
      <option value="">Select a city</option>
      <optgroup label="Maharashtra">
        <option value="pune">Pune</option>
        <option value="mumbai">Mumbai</option>
      </optgroup>
      <optgroup label="Karnataka">
        <option value="bengaluru">Bengaluru</option>
        <option value="mysuru">Mysuru</option>
      </optgroup>
    </select>
    <button type="submit">Save</button>
  </form>`),
      [
        el("label[for=city]", "A label for the select"),
        el("select#city[name=city][required]", "A required select named city"),
        el('select > option[value=""]', "A first option with an empty value"),
        el("select > optgroup[label]", "Two option groups", { min: 2 }),
        el("optgroup > option", "At least four cities inside the groups", { min: 4 }),
      ],
    ),

    hq(
      "Feedback form with textarea and range",
      "Collect course feedback with a rating slider and a comment box.",
      [
        "A range input named rating with min 1, max 10 and a label",
        "A textarea named comments with rows=\"5\", maxlength=\"500\" and a label",
        "A reset button and a submit button",
      ],
      page("Feedback", String.raw`
  <form action="/feedback" method="post">
    <label for="rating">Rate the course (1 to 10)</label>
    <input type="range" id="rating" name="rating" min="1" max="10" value="8">
    <label for="comments">Comments</label>
    <textarea id="comments" name="comments" rows="5" maxlength="500"></textarea>
    <button type="reset">Clear</button>
    <button type="submit">Send feedback</button>
  </form>`),
      [
        el("input[type=range][name=rating][min=1][max=10]", "A 1-10 range named rating"),
        el("textarea[name=comments][rows=5][maxlength=500]", "A textarea with rows and maxlength"),
        el("label[for=rating], label[for=comments]", "Labels for both fields", { min: 2 }),
        el("button[type=reset]", "A reset button"),
        el("button[type=submit]", "A submit button"),
      ],
    ),

    hq(
      "Validation with pattern, length and limits",
      "Add built-in validation to an address form so that bad data is caught before it is sent.",
      [
        "Username: required, minlength 4, maxlength 20",
        'PIN code: a text input with pattern="[0-9]{6}", inputmode="numeric" and required',
        "Mention the format in the PIN code's label, e.g. PIN code (6 digits)",
        "Age: a number with min 18, max 60",
        "Mobile: type tel with pattern=\"[6-9][0-9]{9}\"",
      ],
      page("Address", String.raw`
  <form action="/address" method="post">
    <label for="username">Username</label>
    <input type="text" id="username" name="username" minlength="4" maxlength="20" required>
    <label for="pincode">PIN code (6 digits)</label>
    <input type="text" id="pincode" name="pincode" pattern="[0-9]{6}" inputmode="numeric" required>
    <label for="age">Age</label>
    <input type="number" id="age" name="age" min="18" max="60">
    <label for="mobile">Mobile (10 digits)</label>
    <input type="tel" id="mobile" name="mobile" pattern="[6-9][0-9]{9}">
    <button type="submit">Save address</button>
  </form>`),
      [
        el("input[name=username][minlength=4][maxlength=20][required]", "Username is required with length 4-20"),
        el('input[name=pincode][pattern="[0-9]{6}"][required]', "PIN code must be exactly 6 digits"),
        el("input[name=pincode][inputmode=numeric]", "PIN code shows a number keyboard"),
        el("label[for=pincode]", "The PIN code label explains the format", { text: "6 digits" }),
        el("input[type=number][min=18][max=60]", "Age is limited to 18-60"),
        el("input[type=tel][pattern]", "Mobile has a pattern"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Search box with suggestions",
      "Build a GET search form whose input suggests programming languages as you type.",
      [
        'A form with action="/search" and method="get"',
        'A search input named q with list="languages" and a label',
        'A datalist with id="languages" and at least four options',
        "A submit button",
      ],
      page("Search", String.raw`
  <form action="/search" method="get" role="search">
    <label for="q">Search courses</label>
    <input type="search" id="q" name="q" list="languages">
    <datalist id="languages">
      <option value="Python"></option>
      <option value="JavaScript"></option>
      <option value="Java"></option>
      <option value="C++"></option>
    </datalist>
    <button type="submit">Search</button>
  </form>`),
      [
        el('form[action="/search"][method=get]', "A GET form to /search"),
        el("input[type=search][name=q][list=languages]", "A search input named q linked to the datalist"),
        el("datalist#languages > option", "A datalist with at least four options", { min: 4 }),
        el("label[for=q]", "A label for the search box"),
        el("button[type=submit]", "A submit button"),
      ],
    ),

    hq(
      "Job application form",
      "Build a complete internship application form that uploads a resume.",
      [
        'The form posts to /apply with enctype="multipart/form-data"',
        "Two fieldsets with legends: Personal details and Application",
        "Personal details: name (text), email (email), phone (tel), all required, each with a label",
        'Application: a role select, a file input named resume with accept=".pdf" and required, and a textarea for a cover note',
        "A required checkbox agreeing to the terms, then reset and submit buttons",
      ],
      page("Apply", String.raw`
  <h1>Apply for an internship</h1>
  <form action="/apply" method="post" enctype="multipart/form-data">
    <fieldset>
      <legend>Personal details</legend>
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" autocomplete="name" required>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="email" required>
      <label for="phone">Phone</label>
      <input type="tel" id="phone" name="phone" autocomplete="tel" required>
    </fieldset>
    <fieldset>
      <legend>Application</legend>
      <label for="role">Role</label>
      <select id="role" name="role" required>
        <option value="">Choose a role</option>
        <option value="frontend">Frontend developer</option>
        <option value="backend">Backend developer</option>
        <option value="devops">DevOps engineer</option>
      </select>
      <label for="resume">Resume (PDF)</label>
      <input type="file" id="resume" name="resume" accept=".pdf" required>
      <label for="note">Cover note</label>
      <textarea id="note" name="note" rows="6"></textarea>
    </fieldset>
    <label><input type="checkbox" name="terms" required> I agree to the terms</label>
    <button type="reset">Clear</button>
    <button type="submit">Submit application</button>
  </form>`),
      [
        el('form[action="/apply"][method=post][enctype="multipart/form-data"]', "The form posts multipart data to /apply"),
        el("form > fieldset > legend", "Two fieldsets with legends", { min: 2 }),
        el("input[type=email][required], input[type=tel][required]", "Required email and phone fields", { min: 2 }),
        el("input[type=file][name=resume][accept][required]", "A required resume upload limited by accept"),
        el("select[name=role]", "A role select"),
        el("textarea", "A cover note textarea"),
        el("input[type=checkbox][required]", "A required terms checkbox"),
        el("button[type=submit]", "A submit button"),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "Which form fields are sent to the server?", options: ["All fields", "Only fields with an id", "Only fields with a name (and not disabled)", "Only required fields"], answer: 2, why: "The name is the key in the submitted data; fields without one, or disabled ones, are left out." },
    { q: "When should a form use method=\"get\"?", options: ["For logins", "For searches and filters that are safe to repeat and bookmark", "For file uploads", "Never, it is insecure"], answer: 1, why: "GET puts the data in the URL, which suits searches but not passwords or changes." },
    { q: "How do you make three radio buttons act as one group?", options: ["Give them the same id", "Give them the same name", "Put them in the same label", "Give them the same value"], answer: 1, why: "Radio buttons with the same name are one group, and only one can be checked." },
    { q: "What is the default type of a <button> inside a form?", options: ["button", "submit", "reset", "It has no default"], answer: 1, why: "An untyped button submits the form, which surprises people using it for JavaScript actions." },
    { q: "Why is a placeholder not a replacement for a label?", options: ["Placeholders are not supported on phones", "It disappears when the user types and is often not read as a label", "Placeholders cannot contain spaces", "Labels are required for validation"], answer: 1, why: "Users lose the hint while typing, and contrast is usually low." },
    { q: "Which attributes does a file upload form need?", options: ["method=\"get\"", "method=\"post\" and enctype=\"multipart/form-data\"", "enctype=\"file\"", "Only type=\"file\" on the input"], answer: 1, why: "Files can only be sent in a multipart POST body." },
    { q: "What does pattern=\"[0-9]{6}\" accept?", options: ["Any value containing six digits", "Exactly six digits and nothing else", "Up to six digits", "Six or more digits"], answer: 1, why: "The pattern must match the whole value, as if wrapped in ^(?: )$." },
    { q: "A field is readonly and another is disabled. Which values are submitted?", options: ["Both", "Neither", "Only the readonly one", "Only the disabled one"], answer: 2, why: "readonly fields are sent; disabled fields are not." },
    { q: "Why must the server validate data even if the HTML form has required and pattern?", options: ["HTML validation does not work in Chrome", "Anyone can bypass browser validation (dev tools, curl, scripts)", "Servers cannot read HTML attributes", "It is only needed for GET forms"], answer: 1, why: "Client-side validation is a convenience; it is not security." },
    { q: "Which markup correctly connects a label to an input?", options: ["<label name=\"age\">Age</label><input id=\"age\">", "<label for=\"age\">Age</label><input name=\"age\">", "<label for=\"age\">Age</label><input id=\"age\" name=\"age\">", "<label id=\"age\">Age</label><input for=\"age\">"], answer: 2, why: "The label's for must equal the input's id; the name is what gets sent." },
  ],
};
