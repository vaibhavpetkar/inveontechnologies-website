import type { ExerciseSeed } from "../types.js";

/** A full HTML page around the given body markup. */
const page = (title: string, body: string) =>
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

export default [
  {
    title: "Favourite foods lists",
    brief: "Write a page with a heading, an unordered list of your favourite foods and an ordered list of steps to make one of them.",
    steps: ["An h1 heading for the page", "A ul with at least 3 li items (your favourite foods)", "An ol with at least 3 li items (recipe steps)", "An h2 heading above the ordered list"],
    level: "basic",
    editor: "html",
    starter: page("My foods", `  <!-- Add a heading, a bulleted list and a numbered list -->\n`),
    solution: page(
      "My foods",
      `  <h1>My favourite foods</h1>\n  <ul>\n    <li>Pizza</li>\n    <li>Dosa</li>\n    <li>Mango</li>\n  </ul>\n  <h2>How to make a mango shake</h2>\n  <ol>\n    <li>Peel and chop the mango</li>\n    <li>Add milk and sugar</li>\n    <li>Blend and serve cold</li>\n  </ol>`,
    ),
    check: {
      rules: [
        { html: "h1", message: "An h1 heading" },
        { html: "ul > li", min: 3, message: "A ul with at least 3 list items" },
        { html: "ol > li", min: 3, message: "An ol with at least 3 list items" },
        { html: "h2", message: "An h2 heading for the steps" },
      ],
    },
  },
  {
    title: "Links and images",
    brief: "Add a picture with alternative text and two links: one to another website that opens in a new tab, and one email link.",
    steps: [
      "An img with a src and an alt attribute describing the picture",
      "A link whose href starts with https:// and has target=\"_blank\"",
      "Add rel=\"noopener\" (or \"noopener noreferrer\") to that external link",
      "A link whose href starts with mailto:",
    ],
    level: "basic",
    editor: "html",
    starter: page("Links", `  <h1>My links</h1>\n  <!-- Add an image, an external link and an email link -->\n`),
    solution: page(
      "Links",
      `  <h1>My links</h1>\n  <img src="cat.jpg" alt="A sleeping orange cat" width="300">\n  <p><a href="https://developer.mozilla.org" target="_blank" rel="noopener noreferrer">MDN Web Docs</a></p>\n  <p><a href="mailto:me@example.com">Email me</a></p>`,
    ),
    check: {
      rules: [
        { html: "img[src][alt]", message: "An img with src and alt attributes" },
        { html: "a[href^=https://][target=_blank]", message: "An external https:// link with target=\"_blank\"" },
        { html: "a[target=_blank][rel*=noopener]", message: "The external link has rel=\"noopener\"" },
        { html: "a[href^=mailto:]", message: "An email link (href starts with mailto:)" },
      ],
    },
  },
  {
    title: "Marks table",
    brief: "Build a table of three students and their marks with a caption, a header row and a body.",
    steps: ["A table with a caption", "A thead row with 3 th cells (Name, Subject, Marks)", "A tbody with at least 3 rows", "Every body row has 3 td cells"],
    level: "basic",
    editor: "html",
    starter: page("Marks", `  <table>\n    <!-- caption, thead and tbody go here -->\n  </table>\n`),
    solution: page(
      "Marks",
      `  <table>\n    <caption>Class test marks</caption>\n    <thead>\n      <tr><th>Name</th><th>Subject</th><th>Marks</th></tr>\n    </thead>\n    <tbody>\n      <tr><td>Asha</td><td>Maths</td><td>88</td></tr>\n      <tr><td>Ravi</td><td>Science</td><td>74</td></tr>\n      <tr><td>Neha</td><td>English</td><td>91</td></tr>\n    </tbody>\n  </table>`,
    ),
    check: {
      rules: [
        { html: "table > caption", message: "The table has a caption" },
        { html: "table thead tr th", min: 3, message: "A header row with 3 th cells" },
        { html: "table tbody tr", min: 3, message: "At least 3 rows in the tbody" },
        { html: "table tbody tr td", min: 9, message: "Each body row has 3 td cells" },
      ],
    },
  },
  {
    title: "Contact form",
    brief: "Create a contact form with a name field, an email field, a message box and a submit button, each with a label.",
    steps: [
      "A form with method=\"post\"",
      "An input with id=\"name\" and a label for=\"name\"",
      "An input type=\"email\" with id=\"email\", required, and a label for=\"email\"",
      "A textarea for the message and a button type=\"submit\"",
    ],
    level: "basic",
    editor: "html",
    starter: page("Contact", `  <h1>Contact us</h1>\n  <form>\n    <!-- Add labelled fields and a submit button -->\n  </form>\n`),
    solution: page(
      "Contact",
      `  <h1>Contact us</h1>\n  <form action="/contact" method="post">\n    <label for="name">Name</label>\n    <input type="text" id="name" name="name">\n    <label for="email">Email</label>\n    <input type="email" id="email" name="email" required>\n    <label for="message">Message</label>\n    <textarea id="message" name="message"></textarea>\n    <button type="submit">Send</button>\n  </form>`,
    ),
    check: {
      rules: [
        { html: "form[method=post], form[method=POST]", message: "A form with method=\"post\"" },
        { html: "form input#name", message: "An input with id=\"name\"" },
        { html: "label[for=name]", message: "A label for=\"name\"" },
        { html: "form input[type=email]#email[required]", message: "A required email input with id=\"email\"" },
        { html: "label[for=email]", message: "A label for=\"email\"" },
        { html: "form textarea", message: "A textarea for the message" },
        { html: "form button[type=submit]", message: "A submit button" },
      ],
    },
  },
  {
    title: "Semantic page skeleton",
    brief: "Write a page with a header holding a nav, a main area holding one article, and a footer.",
    steps: ["Use header, main, article and footer inside body", "Put a nav with at least 3 links inside the header", "Give the article an h2 heading", "Put a copyright line (© or the word Copyright) in the footer"],
    level: "intermediate",
    editor: "html",
    starter: page("My page", ``),
    solution: page(
      "My page",
      `  <header>\n    <h1>Hello</h1>\n    <nav>\n      <a href="/">Home</a>\n      <a href="/blog">Blog</a>\n      <a href="/about">About</a>\n    </nav>\n  </header>\n  <main>\n    <article><h2>First post</h2><p>Hi.</p></article>\n  </main>\n  <footer>&copy; 2026 Me</footer>`,
    ),
    check: {
      rules: [
        { html: "body > header", message: "A header inside the body" },
        { html: "header nav a[href]", min: 3, message: "A nav with at least 3 links inside the header" },
        { html: "main article h2", message: "An article with an h2 heading inside main" },
        { html: "footer", text: "©|&copy;|copyright", message: "A footer with a copyright line" },
      ],
    },
  },
  {
    title: "Photo gallery with captions",
    brief: "Make a gallery section with three photos, each wrapped in a figure with a caption.",
    steps: ["A section with an h2 heading", "At least 3 figure elements inside the section", "Each figure holds an img with alt text", "Each figure has a figcaption"],
    level: "intermediate",
    editor: "html",
    starter: page("Gallery", `  <section>\n    <h2>My trip</h2>\n    <img src="beach.jpg">\n  </section>\n`),
    solution: page(
      "Gallery",
      `  <section>\n    <h2>My trip</h2>\n    <figure>\n      <img src="beach.jpg" alt="Sunset over the beach">\n      <figcaption>Goa beach at sunset</figcaption>\n    </figure>\n    <figure>\n      <img src="fort.jpg" alt="An old stone fort">\n      <figcaption>Aguada fort</figcaption>\n    </figure>\n    <figure>\n      <img src="food.jpg" alt="A plate of fish curry">\n      <figcaption>Lunch</figcaption>\n    </figure>\n  </section>`,
    ),
    check: {
      rules: [
        { html: "section h2", message: "A section with an h2 heading" },
        { html: "section figure", min: 3, message: "At least 3 figures in the section" },
        { html: "figure img[alt]", min: 3, message: "Each figure has an img with alt text" },
        { html: "figure figcaption", min: 3, message: "Each figure has a figcaption" },
      ],
    },
  },
  {
    title: "Feedback form choices",
    brief: "Build a feedback form that uses a fieldset of radio buttons, a checkbox and a drop-down list.",
    steps: [
      "A fieldset with a legend",
      "At least 3 radio inputs sharing name=\"rating\" inside the fieldset",
      "A checkbox input (for example 'Subscribe to updates')",
      "A select with id=\"city\" holding at least 3 option elements, plus a submit button",
    ],
    level: "intermediate",
    editor: "html",
    starter: page("Feedback", `  <form>\n    <!-- rating radios, checkbox and city drop-down -->\n    <button type="submit">Send</button>\n  </form>\n`),
    solution: page(
      "Feedback",
      `  <form method="post">\n    <fieldset>\n      <legend>How was the session?</legend>\n      <label><input type="radio" name="rating" value="good"> Good</label>\n      <label><input type="radio" name="rating" value="okay"> Okay</label>\n      <label><input type="radio" name="rating" value="bad"> Bad</label>\n    </fieldset>\n    <label><input type="checkbox" name="subscribe"> Subscribe to updates</label>\n    <label for="city">City</label>\n    <select id="city" name="city">\n      <option value="pune">Pune</option>\n      <option value="mumbai">Mumbai</option>\n      <option value="delhi">Delhi</option>\n    </select>\n    <button type="submit">Send</button>\n  </form>`,
    ),
    check: {
      rules: [
        { html: "fieldset > legend", message: "A fieldset with a legend" },
        { html: "fieldset input[type=radio][name=rating]", min: 3, message: "At least 3 radio buttons named rating" },
        { html: "input[type=checkbox]", message: "A checkbox input" },
        { html: "select#city option", min: 3, message: "A select with id=\"city\" and at least 3 options" },
        { html: "form button[type=submit], form input[type=submit]", message: "A submit button" },
      ],
    },
  },
  {
    title: "Glossary with a description list",
    brief: "Write a small glossary of web terms using a description list, with abbreviations explained.",
    steps: ["An h1 heading 'Glossary'", "A dl with at least 3 dt terms", "At least 3 dd descriptions in the dl", "At least one abbr element with a title (e.g. <abbr title=\"HyperText Markup Language\">HTML</abbr>)"],
    level: "intermediate",
    editor: "html",
    starter: page("Glossary", `  <h1>Glossary</h1>\n  <p>HTML - the language for page structure</p>\n`),
    solution: page(
      "Glossary",
      `  <h1>Glossary</h1>\n  <dl>\n    <dt><abbr title="HyperText Markup Language">HTML</abbr></dt>\n    <dd>The language that gives a page its structure.</dd>\n    <dt><abbr title="Cascading Style Sheets">CSS</abbr></dt>\n    <dd>The language that styles a page.</dd>\n    <dt>Browser</dt>\n    <dd>The program that shows web pages.</dd>\n  </dl>`,
    ),
    check: {
      rules: [
        { html: "h1", text: "glossary", message: "An h1 heading 'Glossary'" },
        { html: "dl dt", min: 3, message: "A dl with at least 3 dt terms" },
        { html: "dl dd", min: 3, message: "At least 3 dd descriptions" },
        { html: "abbr[title]", message: "An abbr with a title attribute" },
      ],
    },
  },
  {
    title: "Accessible navigation menu",
    brief: "Build a page navigation that screen-reader and keyboard users can use: a skip link, a labelled nav and a marked current page.",
    steps: [
      "The first link in the body is a skip link with href=\"#main\"",
      "A nav with aria-label=\"Main\" holding a ul of at least 4 links",
      "The current page's link has aria-current=\"page\"",
      "A main element with id=\"main\" holding an h1",
    ],
    level: "advanced",
    editor: "html",
    starter: page("Menu", `  <div class="menu">\n    <a href="/">Home</a> | <a href="/courses">Courses</a>\n  </div>\n  <div>\n    <h1>Home</h1>\n  </div>\n`),
    solution: page(
      "Menu",
      `  <a href="#main" class="skip-link">Skip to content</a>\n  <nav aria-label="Main">\n    <ul>\n      <li><a href="/" aria-current="page">Home</a></li>\n      <li><a href="/courses">Courses</a></li>\n      <li><a href="/blog">Blog</a></li>\n      <li><a href="/contact">Contact</a></li>\n    </ul>\n  </nav>\n  <main id="main">\n    <h1>Home</h1>\n  </main>`,
    ),
    check: {
      rules: [
        { html: "a[href=#main]", message: "A skip link with href=\"#main\"" },
        { html: "nav[aria-label] ul li a", min: 4, message: "A labelled nav with a list of at least 4 links" },
        { html: "nav a[aria-current=page]", message: "The current link has aria-current=\"page\"" },
        { html: "main#main h1", message: "A main with id=\"main\" holding an h1" },
      ],
    },
  },
  {
    title: "Video and audio player",
    brief: "Embed a video with captions and an audio clip using the native HTML media elements.",
    steps: [
      "A video with the controls attribute",
      "Inside it a source with type=\"video/mp4\" and a track with kind=\"captions\"",
      "An audio element with controls and a source with type=\"audio/mpeg\"",
      "Fallback text inside the video for old browsers",
    ],
    level: "advanced",
    editor: "html",
    starter: page("Media", `  <h1>Lesson 1</h1>\n  <!-- video with captions and an audio clip -->\n`),
    solution: page(
      "Media",
      `  <h1>Lesson 1</h1>\n  <video controls width="640">\n    <source src="lesson1.mp4" type="video/mp4">\n    <track src="lesson1.vtt" kind="captions" srclang="en" label="English">\n    Your browser does not support video.\n  </video>\n  <audio controls>\n    <source src="intro.mp3" type="audio/mpeg">\n    Your browser does not support audio.\n  </audio>`,
    ),
    check: {
      rules: [
        { html: "video[controls]", message: "A video with controls" },
        { html: "video > source[type=video/mp4]", message: "A video source with type=\"video/mp4\"" },
        { html: "video > track[kind=captions]", message: "A captions track inside the video" },
        { html: "audio[controls] > source[type=audio/mpeg]", message: "An audio element with controls and an audio/mpeg source" },
        { html: "video", text: "\\w", message: "Fallback text inside the video" },
      ],
    },
  },
] satisfies ExerciseSeed[];
