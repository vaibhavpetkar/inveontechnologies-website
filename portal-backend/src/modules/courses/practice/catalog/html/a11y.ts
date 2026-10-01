import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const a11y: PracticeUnit = {
  key: "a11y-seo",
  title: "Accessibility and SEO basics",
  summary: "alt text, labels, heading outlines, skip links, ARIA basics, language, meta descriptions, canonical URLs and social sharing tags",
  reading: String.raw`## Who accessibility is for

Accessibility (a11y) means everyone can use your page: blind users with screen readers, people who navigate with only a keyboard, users with low vision who zoom to 200%, people with colour blindness, and anyone on a slow phone in bright sunlight. In India alone that is tens of millions of people, and many companies and government sites are required to meet the WCAG guidelines. The good news: correct, semantic HTML gives you most of it for free.

## The essentials

- Alt text on every image. Describe what matters in context, in a short sentence. Do not start with "image of". Decorative images get alt="".
- A label for every form field (label for/id), and fieldset with legend for groups.
- One h1, then headings in order. Screen reader users jump through a page by its headings, so the outline should read like a table of contents.
- Links and buttons that say what they do. Use <a href> to go somewhere and <button> to do something. A div with a click handler is invisible to the keyboard.
- lang on html, and lang on any part in another language (<span lang="hi">नमस्ते</span>), so screen readers switch pronunciation.
- Never rely on colour alone. "Fields in red are required" fails for colour-blind users; add text or an asterisk explained in words.

## Keyboard users

Everything must work with Tab, Shift+Tab, Enter and Space. Native links, buttons and form fields are focusable automatically. A skip link lets keyboard users jump past a long menu:

` + "```html" + String.raw`
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>...long navigation...</header>
  <main id="main">...</main>
</body>
` + "```" + String.raw`

tabindex="0" makes a custom element focusable in the normal order and tabindex="-1" makes it focusable only from script. Avoid positive values like tabindex="5": they break the natural order.

## ARIA, carefully

ARIA attributes add accessibility information that HTML cannot express. The first rule of ARIA: if a native element does the job, use it instead. Useful basics:

- aria-label="Close" names an element that has no visible text, such as an icon button.
- aria-labelledby and aria-describedby point to the id of another element that names or describes this one, for example a hint under a password field.
- aria-hidden="true" hides decorative content (icons) from screen readers. Never put it on something focusable.
- aria-current="page" marks the current link in a menu; aria-expanded="true" or "false" tells whether a menu button's panel is open.
- aria-invalid="true" marks a field with an error, and role="alert" makes an error message be announced as soon as it appears.

## SEO basics

Search engines read your HTML much like a screen reader does, so accessible pages are usually SEO-friendly too.

` + "```html" + String.raw`
<head>
  <title>Full Stack Web Course in Pune | Inveon Academy</title>
  <meta name="description" content="A 16-week full stack course with live projects, mentor reviews and an internship.">
  <link rel="canonical" href="https://www.inveon.in/courses/full-stack">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="Full Stack Web Course | Inveon Academy">
  <meta property="og:description" content="Build and deploy real apps in 16 weeks.">
  <meta property="og:image" content="https://www.inveon.in/og/full-stack.png">
  <meta property="og:url" content="https://www.inveon.in/courses/full-stack">
  <meta name="twitter:card" content="summary_large_image">
</head>
` + "```" + String.raw`

- title: unique per page, about 50-60 characters, most important words first. It is the blue link in search results.
- meta description: about 150-160 characters. It does not change ranking directly, but it is often the snippet under the link, so it decides whether people click.
- canonical: when the same content is reachable at several URLs (with ?utm= tracking, with and without www), this tells search engines which one to index.
- robots: noindex keeps a page out of search results (thank-you pages, internal search results).
- Open Graph (og:) and Twitter card tags control the preview card when a link is shared on WhatsApp, LinkedIn or X. Note that Open Graph uses property, not name.
- The meta keywords tag is ignored by Google; do not waste time on it.
- Use descriptive URLs, one h1 that matches the page topic, real text instead of text inside images, and fast-loading pages.

## Common mistakes

- alt text stuffed with keywords.
- Clickable divs and spans instead of buttons and links.
- Removing the focus outline with CSS without adding a visible replacement.
- The same title and description on every page.
- Skipping from h1 straight to h4 because of the font size.

## How your assignments are checked

The checker looks for the attributes and structure described in each question: the alt texts, labels connected to fields, one h1, a skip link that points at the main element, aria attributes where they are needed, and the meta and link tags in the head.`,
  questions: [
    hq(
      "Alt text that describes",
      "A news page has three images. Give each one the right kind of alt text.",
      [
        "A photo of students receiving awards: a descriptive alt of a few words",
        "A chart of admissions: an alt that states what the chart shows (the key number or trend)",
        'A decorative divider image (images/divider.png): an empty alt=""',
        "No alt may start with image of or picture of",
      ],
      page("Annual Day", String.raw`
  <main>
    <h1>Annual Day 2026</h1>
    <img src="images/awards.jpg" alt="Five students holding their trophies on stage with the principal" width="800" height="500">
    <img src="images/divider.png" alt="" width="800" height="20">
    <img src="images/admissions-chart.png" alt="Line chart: admissions grew from 400 in 2022 to 750 in 2026" width="600" height="400">
  </main>`),
      [
        el("img[alt]", "Every image has an alt attribute", { min: 3 }),
        el('img[src="images/divider.png"][alt=""]', "The divider has an empty alt"),
        el('img[alt*=" "]', "Two images have descriptive alt text", { min: 2 }),
        { notMatch: "alt=[\"'](image|picture|photo) of", flags: "i", message: "No alt starts with image of or picture of" },
      ],
    ),

    hq(
      "Search engine meta tags",
      "Fill in the head of a course page so it shows well in search results.",
      [
        "A title: Python Course for Beginners | Inveon Academy",
        "A meta description (a full sentence, over 70 characters)",
        'A canonical link to https://www.inveon.in/courses/python',
        'A robots meta tag with content="index, follow"',
        "One h1 in the body",
      ],
      page(
        "Python Course for Beginners | Inveon Academy",
        String.raw`
  <main>
    <h1>Python Course for Beginners</h1>
    <p>Learn Python from zero with 60 checked assignments.</p>
  </main>`,
        String.raw`  <meta name="description" content="Learn Python from scratch with short lessons, 60 auto-checked assignments and a final project, taught in simple English.">
  <link rel="canonical" href="https://www.inveon.in/courses/python">
  <meta name="robots" content="index, follow">`,
      ),
      [
        el("head > title", "A descriptive title", { text: "Python Course" }),
        el("head > meta[name=description]", "A meta description"),
        { match: 'name="description"\\s+content="[^"]{70,}"', message: "The description is a full sentence (over 70 characters)" },
        el('head > link[rel=canonical][href="https://www.inveon.in/courses/python"]', "A canonical link"),
        el("head > meta[name=robots][content]", "A robots meta tag"),
        el("h1", "Exactly one h1", { min: 1, max: 1 }),
      ],
    ),

    hq(
      "Social sharing tags",
      "Make a blog post show a rich preview card when shared on WhatsApp or LinkedIn.",
      [
        "Open Graph tags (with property, not name): og:title, og:description, og:image (an absolute https URL), og:url and og:type=\"article\"",
        'A Twitter card: <meta name="twitter:card" content="summary_large_image">',
      ],
      page(
        "My Internship Story",
        String.raw`
  <main>
    <article>
      <h1>My Internship Story</h1>
      <p>Three months, two projects and one very patient mentor.</p>
    </article>
  </main>`,
        String.raw`  <meta property="og:title" content="My Internship Story">
  <meta property="og:description" content="Three months, two projects and one very patient mentor.">
  <meta property="og:image" content="https://www.inveon.in/blog/images/internship-story.png">
  <meta property="og:url" content="https://www.inveon.in/blog/internship-story">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">`,
      ),
      [
        el("meta[property=og:title][content]", "og:title"),
        el("meta[property=og:description][content]", "og:description"),
        el('meta[property=og:image][content^="https://"]', "og:image with an absolute https URL"),
        el("meta[property=og:url][content]", "og:url"),
        el("meta[property=og:type][content=article]", "og:type is article"),
        el("meta[name=twitter:card][content]", "A Twitter card tag"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Clean heading outline",
      "Fix the heading outline of a documentation page so it reads like a table of contents.",
      [
        "Exactly one h1: Git Handbook",
        "Three h2 sections: Setup, Everyday commands, Branching",
        "Under Everyday commands, two h3: Saving changes and Viewing history",
        "No h4, h5 or h6 (the starter skips levels)",
      ],
      page("Git Handbook", String.raw`
  <main>
    <h1>Git Handbook</h1>
    <h2>Setup</h2>
    <p>Install Git and set your name and email.</p>
    <h2>Everyday commands</h2>
    <h3>Saving changes</h3>
    <p>Use git add and git commit.</p>
    <h3>Viewing history</h3>
    <p>Use git log --oneline.</p>
    <h2>Branching</h2>
    <p>Create a branch for every feature.</p>
  </main>`),
      [
        el("h1", "Exactly one h1", { min: 1, max: 1, text: "Git Handbook" }),
        el("h2", "Three h2 sections", { min: 3, max: 3 }),
        el("h3", "Two h3 sub-sections", { min: 2 }),
        el("h4, h5, h6", "No skipped levels (no h4-h6)", { max: 0 }),
      ],
      {
        starter: page("Git Handbook", String.raw`
  <main>
    <h1>Git Handbook</h1>
    <h1>Setup</h1>
    <p>Install Git and set your name and email.</p>
    <h4>Everyday commands</h4>
    <h6>Saving changes</h6>
    <p>Use git add and git commit.</p>
    <h6>Viewing history</h6>
    <p>Use git log --oneline.</p>
    <h4>Branching</h4>
    <p>Create a branch for every feature.</p>
  </main>`),
      },
    ),

    hq(
      "Skip link for keyboard users",
      "Add a skip link so keyboard users can jump past the navigation.",
      [
        'The first element in body is a link with class="skip-link" and href="#main" that says Skip to main content',
        "A header with a nav of at least three links",
        'A main element with id="main" containing the h1',
      ],
      page("Skip link", String.raw`
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>
    <nav aria-label="Main">
      <a href="/">Home</a>
      <a href="/courses">Courses</a>
      <a href="/blog">Blog</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main id="main">
    <h1>Courses</h1>
    <p>Pick a track and start learning today.</p>
  </main>`),
      [
        el('body > a.skip-link[href="#main"]', "A skip link to #main directly in body", { text: "Skip to main content" }),
        el("header nav a", "A navigation with at least three links", { min: 3 }),
        el("main#main", 'The main element has id="main"'),
        el("main#main h1", "The h1 is inside main"),
      ],
    ),

    hq(
      "Accessible icon buttons",
      "A music player has buttons that show only icons. Make them usable with a screen reader and keyboard.",
      [
        "Three button elements with type=\"button\" (not divs): play, pause and next",
        'Each button has an aria-label (Play, Pause, Next track)',
        'The svg icon inside each button has aria-hidden="true"',
        'A menu toggle button with aria-expanded="false" and aria-controls pointing at the id of a ul',
      ],
      page("Player", String.raw`
  <div class="player">
    <button type="button" aria-label="Play">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>
    </button>
    <button type="button" aria-label="Pause">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"></path></svg>
    </button>
    <button type="button" aria-label="Next track">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5l8 7-8 7zM16 5h2v14h-2z"></path></svg>
    </button>
  </div>
  <button type="button" aria-expanded="false" aria-controls="playlist-menu">Playlist</button>
  <ul id="playlist-menu" hidden>
    <li>Focus beats</li>
    <li>Chai break</li>
  </ul>`),
      [
        el("button[type=button][aria-label]", "Three labelled icon buttons", { min: 3 }),
        el('button[aria-label="Next track"]', "The next button is named Next track"),
        el("button > svg[aria-hidden=true]", "The icons are hidden from screen readers", { min: 3 }),
        el("button[aria-expanded=false][aria-controls=playlist-menu]", "The menu toggle has aria-expanded and aria-controls"),
        el("ul#playlist-menu", "The controlled list has a matching id"),
        { notMatch: "<div[^>]*onclick", flags: "i", message: "No clickable divs" },
      ],
      { level: "intermediate" },
    ),

    hq(
      "Form errors screen readers announce",
      "Show a password field in its error state so a screen reader user hears both the hint and the error.",
      [
        'A label for="password" and a password input with id="password"',
        'A hint paragraph with id="password-hint": At least 8 characters, with a number',
        'An error paragraph with id="password-error" and role="alert"',
        'The input has aria-describedby="password-hint password-error" and aria-invalid="true"',
      ],
      page("Sign up", String.raw`
  <form action="/signup" method="post">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" minlength="8" required aria-invalid="true" aria-describedby="password-hint password-error">
    <p id="password-hint">At least 8 characters, with a number.</p>
    <p id="password-error" role="alert">Your password is too short.</p>
    <button type="submit">Create account</button>
  </form>`),
      [
        el("label[for=password]", "A label for the password field"),
        el("input#password[type=password]", "A password input with id password"),
        el("p#password-hint", "A hint paragraph with id password-hint", { text: "8 characters" }),
        el("#password-error[role=alert]", "An error message with role=alert"),
        el("input[aria-describedby*=password-hint][aria-describedby*=password-error]", "The input is described by the hint and the error"),
        el("input[aria-invalid=true]", "The input is marked invalid"),
      ],
      { level: "advanced" },
    ),

    hq(
      "Mixed-language page",
      "A greeting page mixes English, Hindi and Marathi. Mark the languages so screen readers pronounce each correctly.",
      [
        'The html element has lang="en" (the page skeleton already does)',
        'A paragraph in Hindi with lang="hi"',
        'A span inside an English paragraph with a Marathi word and lang="mr"',
        "An abbr with a title for the abbreviation UI",
      ],
      page("Greetings", String.raw`
  <main>
    <h1>Greetings</h1>
    <p lang="hi">नमस्ते, आपका स्वागत है।</p>
    <p>In Pune we say <span lang="mr">नमस्कार</span> to welcome guests.</p>
    <p>Good <abbr title="user interface">UI</abbr> works for every language.</p>
  </main>`),
      [
        el("html[lang=en]", "The page language is English"),
        el("p[lang=hi]", "A Hindi paragraph marked lang=hi"),
        el("p span[lang=mr]", "A Marathi word marked lang=mr"),
        el("abbr[title]", "An abbreviation with its full form", { text: "UI" }),
      ],
    ),

    hq(
      "Accessible, SEO-ready landing page",
      "Build a complete landing page that puts together everything from this course.",
      [
        "Head: a descriptive title, a meta description, a canonical link and og:title and og:image tags",
        "A skip link to #main, then a header with a labelled nav",
        "A main with id main containing exactly one h1, an image with descriptive alt, and a section with an h2",
        "In main, a newsletter form with a labelled email field (required) and a submit button",
        "A footer with a copyright line",
      ],
      page(
        "Cloud Computing Course in Pune | Inveon Academy",
        String.raw`
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>
    <nav aria-label="Main">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/courses" aria-current="page">Courses</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
  </header>
  <main id="main">
    <h1>Cloud Computing Course</h1>
    <img src="images/cloud-lab.jpg" alt="Students configuring servers on laptops during a cloud lab session" width="1200" height="600">
    <section>
      <h2>What you will learn</h2>
      <p>Linux, AWS, Docker, Kubernetes and CI/CD, with a real deployment every week.</p>
    </section>
    <section>
      <h2>Get course updates</h2>
      <form action="/newsletter" method="post">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required>
        <button type="submit">Subscribe</button>
      </form>
    </section>
  </main>
  <footer>
    <p>&copy; 2026 Inveon Technologies</p>
  </footer>`,
        String.raw`  <meta name="description" content="A 12-week cloud computing course in Pune covering Linux, AWS, Docker, Kubernetes and CI/CD with hands-on labs.">
  <link rel="canonical" href="https://www.inveon.in/courses/cloud">
  <meta property="og:title" content="Cloud Computing Course | Inveon Academy">
  <meta property="og:image" content="https://www.inveon.in/og/cloud.png">`,
      ),
      [
        el("head > meta[name=description][content]", "A meta description"),
        el("head > link[rel=canonical]", "A canonical link"),
        el("head > meta[property=og:title], head > meta[property=og:image]", "og:title and og:image", { min: 2 }),
        el('body > a[href="#main"]', "A skip link to #main"),
        el("header > nav[aria-label]", "A labelled nav in the header"),
        el("main#main h1", "Exactly one h1, inside main", { min: 1, max: 1 }),
        el('main img[alt*=" "]', "An image with descriptive alt"),
        el("main form label[for=email]", "A labelled email field in a form"),
        el("input[type=email][required]", "The email field is required"),
        el("body > footer", "A footer"),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "Which alt text is best for a photo of a student presenting a project?", options: ["image", "photo.jpg", "Student presenting her weather app to the judges", "Image of a student, students, project, best college Pune"], answer: 2, why: "Describe what matters in the image, briefly, without filler or keyword stuffing." },
    { q: "What is the first rule of ARIA?", options: ["Add ARIA to every element", "If a native HTML element does the job, use it instead of ARIA", "Always use role=\"button\"", "Use aria-hidden on all images"], answer: 1, why: "Native elements come with keyboard support and semantics built in." },
    { q: "Why is <div onclick=\"save()\">Save</div> a problem?", options: ["onclick is deprecated", "It cannot be focused or activated with the keyboard and is not announced as a button", "divs cannot contain text", "It only works in Chrome"], answer: 1, why: "A button element is focusable, works with Enter and Space and has the button role." },
    { q: "What does a skip link do?", options: ["Skips loading images", "Lets keyboard users jump past repeated navigation to the main content", "Skips the page in search results", "Hides the header"], answer: 1, why: "It is the first focusable element and targets the main content's id." },
    { q: "Which tag tells search engines which URL is the preferred version of a page?", options: ["<meta name=\"url\">", "<link rel=\"canonical\" href=\"...\">", "<meta name=\"robots\" content=\"canonical\">", "<link rel=\"preferred\">"], answer: 1, why: "The canonical link consolidates duplicate URLs onto one." },
    { q: "Which attribute do Open Graph meta tags use for their name?", options: ["name", "property", "og", "itemprop"], answer: 1, why: "Open Graph uses property=\"og:title\"; Twitter cards use name." },
    { q: "What is wrong with tabindex=\"3\" on a link?", options: ["Nothing", "Positive tabindex values change the natural tab order and confuse keyboard users", "tabindex only works on divs", "It hides the link"], answer: 1, why: "Use 0 or -1; positive values jump the element ahead of the document order." },
    { q: "A form error message appears after submission. How can you make screen readers announce it immediately?", options: ["Make it red", "Give it role=\"alert\" (and link it to the field with aria-describedby)", "Put it in the title", "Use aria-hidden=\"true\""], answer: 1, why: "role=\"alert\" is a live region that is read out as soon as it appears." },
    { q: "Why is aria-hidden=\"true\" on a focusable button a serious bug?", options: ["It makes the button invisible", "Keyboard users can still focus it, but screen readers announce nothing", "It disables the button", "It is ignored by browsers"], answer: 1, why: "The element stays in the tab order while being removed from the accessibility tree." },
    { q: "Two pages on a site have the same title and meta description. What is the main effect?", options: ["The site is removed from Google", "Search engines struggle to tell them apart, and users cannot tell which result to click", "The pages load slower", "Nothing at all"], answer: 1, why: "Titles and descriptions are how both search engines and users distinguish pages." },
  ],
};
