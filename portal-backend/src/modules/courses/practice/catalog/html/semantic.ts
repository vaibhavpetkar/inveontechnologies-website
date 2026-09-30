import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const semantic: PracticeUnit = {
  key: "semantic",
  title: "Semantic layout elements",
  summary: "header, nav, main, section, article, aside and footer, plus time, address, details, summary and dialog",
  reading: String.raw`## Why semantics matter

A page built only from <div> elements can look fine, but the browser, screen readers and search engines cannot tell the menu from the main content or an article from an advert. HTML5 added elements that say what each part of the page is. They look exactly like a div until you style them, but they carry meaning:

- Screen readers let users jump straight to the navigation, the main content or the footer (these are called landmarks).
- Search engines understand which text is the main content.
- Your CSS and your teammates' code become easier to read: </nav> is clearer than the fifth </div> in a row.

## The layout elements

- <header>: introductory content for the page or for a section or article: a logo, a title, a nav. A page can have several headers.
- <nav>: a block of major navigation links: the main menu, a table of contents, pagination. Not every group of links is a nav; a few links in a footer usually are not.
- <main>: the main content of the page, unique to it. Only one visible main per page, and it should not be inside header, footer, nav, article or aside.
- <section>: a thematic group of content, normally with its own heading. If you cannot think of a heading for it, you probably want a div.
- <article>: a self-contained piece that would still make sense on its own: a blog post, a news story, a product card, a comment. Articles can contain sections and sections can contain articles.
- <aside>: content related to the main content but not part of it: a sidebar, related links, a "did you know" box.
- <footer>: closing information for the page or for a section or article: copyright, contact details, links to policies, the author of a post.

` + "```html" + String.raw`
<body>
  <header>
    <a href="/">Inveon</a>
    <nav aria-label="Main">
      <ul>
        <li><a href="/courses">Courses</a></li>
        <li><a href="/internships">Internships</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <article>
      <h1>How I got my first internship</h1>
      <p>...</p>
    </article>
    <aside>
      <h2>Related posts</h2>
    </aside>
  </main>
  <footer>
    <p>&copy; 2026 Inveon Technologies</p>
  </footer>
</body>
` + "```" + String.raw`

## When a div is still right

<div> and <span> have no meaning. That is useful: use a div when you only need a box for styling or layout (a flex row, a card wrapper) and no semantic element fits. The rule is not "never use div"; it is "use the element that describes the content, and div when nothing does".

## Smaller semantic elements

- <time datetime="2026-10-15">15 October</time>: a date or time that machines can read. The datetime attribute uses the ISO format YYYY-MM-DD, with an optional time like 2026-10-15T18:30.
- <address>: contact information for the page or article's author or owner, not any postal address.
- <figure> and <figcaption>: self-contained content with a caption.
- <mark>: text highlighted because it is relevant right now, like a search match.
- <details> and <summary>: a disclosure widget that opens and closes with no JavaScript. The summary is the clickable line; add open to start it expanded. Great for FAQs.
- <dialog>: a pop-up dialog box. Opened with JavaScript (showModal()), or shown from the start with the open attribute. A form inside it with method="dialog" closes it.

` + "```html" + String.raw`
<details>
  <summary>Is the internship paid?</summary>
  <p>Yes, all interns get a monthly stipend.</p>
</details>
` + "```" + String.raw`

## Headings inside sections

Each section and article should start with a heading. Keep using the normal heading levels in order (h1 for the page, h2 for sections, h3 inside them). Browsers never implemented the old idea that every section restarts at h1, so do not rely on it.

## Labelling repeated landmarks

When a page has two navs (a main menu and a footer menu), give each one a name with aria-label="Main" and aria-label="Footer" so screen reader users can tell them apart.

## Common mistakes

- Wrapping the whole page in a section, or using section just to add a background colour.
- Putting two visible main elements on one page.
- Using article for everything; ask "could this be shared on its own?".
- Using <header> for the <head> contents. The head holds metadata; header is visible content in the body.

## How your assignments are checked

The checker looks for the landmark elements and where they sit, for example "nav inside header", "exactly one main", "at least three article elements, each with a heading". Some questions give you a page built from divs to rewrite; the checker then also makes sure the old div classes are gone.`,
  questions: [
    hq(
      "Header, main and footer",
      "Lay out a simple page with the three basic landmarks.",
      [
        "A header with the site name in a paragraph or link",
        "Exactly one main containing the h1 and a paragraph",
        "A footer with a copyright line",
        "All three are direct children of body",
      ],
      page("Landmarks", String.raw`
  <header>
    <p><a href="/">Inveon Academy</a></p>
  </header>
  <main>
    <h1>Welcome to Inveon Academy</h1>
    <p>Learn to build websites and apps with projects that are checked automatically.</p>
  </main>
  <footer>
    <p>&copy; 2026 Inveon Technologies</p>
  </footer>`),
      [
        el("body > header", "A header in the body"),
        el("body > main", "Exactly one main", { min: 1, max: 1 }),
        el("main h1", "The h1 is inside main"),
        el("body > footer", "A footer in the body"),
        el("footer", "The footer has a copyright line", { text: "©|2026" }),
      ],
    ),

    hq(
      "Navigation bar in the header",
      "Build the main navigation of a site as a labelled list of links in the header.",
      [
        'A header containing a nav with aria-label="Main"',
        "Inside the nav, a ul with at least four li, each containing a link",
        "Mark the current page's link with aria-current=\"page\"",
      ],
      page("Navigation", String.raw`
  <header>
    <nav aria-label="Main">
      <ul>
        <li><a href="/" aria-current="page">Home</a></li>
        <li><a href="/courses">Courses</a></li>
        <li><a href="/internships">Internships</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <h1>Home</h1>
  </main>`),
      [
        el("header > nav", "A nav inside the header"),
        el("nav[aria-label]", "The nav has an aria-label"),
        el("nav > ul > li > a", "At least four links in the list", { min: 4 }),
        el('a[aria-current="page"]', "The current page is marked with aria-current", { min: 1, max: 1 }),
      ],
    ),

    hq(
      "Blog post as an article",
      "Mark up a blog post that could be shared on its own.",
      [
        "Inside main, an article",
        "The article has a header with an h1 title and a published date in <time> with a datetime attribute (YYYY-MM-DD)",
        "At least two paragraphs of content",
        "An article footer naming the author",
      ],
      page("Blog post", String.raw`
  <main>
    <article>
      <header>
        <h1>How I Cracked My First Internship Interview</h1>
        <p>Published on <time datetime="2026-08-14">14 August 2026</time></p>
      </header>
      <p>I prepared by building three small projects and explaining each one out loud to a friend.</p>
      <p>In the interview they asked me to walk through my code, and that practice made all the difference.</p>
      <footer>
        <p>Written by Karan Mehta</p>
      </footer>
    </article>
  </main>`),
      [
        el("main > article", "An article inside main"),
        el("article > header > h1", "The title is an h1 in the article's header"),
        el("article time[datetime]", "The date is a time element with datetime"),
        el("article > p", "At least two paragraphs", { min: 2 }),
        el("article > footer", "An article footer with the author", { text: "Written by|Author|By " }),
        { match: 'datetime="\\d{4}-\\d{2}-\\d{2}', message: "datetime uses the YYYY-MM-DD format" },
      ],
    ),

    hq(
      "Sections with headings",
      "Split a course page into thematic sections.",
      [
        "Inside main: an h1 Full Stack Web Development",
        "Three section elements, About, Syllabus and Fees, each starting with an h2",
        "Each section has at least one paragraph",
      ],
      page("Course", String.raw`
  <main>
    <h1>Full Stack Web Development</h1>
    <section>
      <h2>About</h2>
      <p>A 16-week course that takes you from HTML to deploying a full app.</p>
    </section>
    <section>
      <h2>Syllabus</h2>
      <p>HTML, CSS, JavaScript, React, Node.js, Express and MongoDB.</p>
    </section>
    <section>
      <h2>Fees</h2>
      <p>Rs 25,000, payable in two instalments.</p>
    </section>
  </main>`),
      [
        el("main > h1", "An h1 in main"),
        el("main > section", "Three sections", { min: 3 }),
        el("section > h2", "Each section starts with an h2", { min: 3 }),
        el("section > p", "Each section has a paragraph", { min: 3 }),
        el("h2", "A Syllabus section", { text: "Syllabus" }),
      ],
    ),

    hq(
      "Sidebar with aside",
      "Add a related-links sidebar next to an article.",
      [
        "Inside main: an article with an h1 and a paragraph",
        "An aside (also in main) with an h2 Related posts and a list of at least three links",
      ],
      page("Article with sidebar", String.raw`
  <main>
    <article>
      <h1>Getting Started with Git</h1>
      <p>Git keeps a history of your project so you can go back to any version.</p>
    </article>
    <aside>
      <h2>Related posts</h2>
      <ul>
        <li><a href="/blog/github-basics">GitHub basics</a></li>
        <li><a href="/blog/branching">Branching without fear</a></li>
        <li><a href="/blog/pull-requests">Your first pull request</a></li>
      </ul>
    </aside>
  </main>`),
      [
        el("main > article", "An article in main"),
        el("main > aside", "An aside in main"),
        el("aside > h2", "The aside has a heading", { text: "Related" }),
        el("aside li a", "At least three related links", { min: 3 }),
      ],
    ),

    hq(
      "Footer with address and links",
      "Build a page footer with contact details and a small footer menu.",
      [
        "A footer containing an address element",
        "The address has an email link (mailto:) and a phone link (tel:)",
        'A second nav in the footer with aria-label="Footer" and at least two links (Privacy, Terms)',
        "A copyright paragraph",
      ],
      page("Footer", String.raw`
  <main>
    <h1>Inveon Technologies</h1>
  </main>
  <footer>
    <address>
      Inveon Technologies, FC Road, Pune<br>
      <a href="mailto:info@inveon.in">info@inveon.in</a><br>
      <a href="tel:+912012345678">+91 20 1234 5678</a>
    </address>
    <nav aria-label="Footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
    <p>&copy; 2026 Inveon Technologies</p>
  </footer>`),
      [
        el("footer > address", "An address in the footer"),
        el('address a[href^="mailto:"]', "An email link in the address"),
        el('address a[href^="tel:"]', "A phone link in the address"),
        el('footer > nav[aria-label="Footer"] a', "A labelled footer nav with at least two links", { min: 2 }),
        el("footer > p", "A copyright paragraph"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "FAQ with details and summary",
      "Build an FAQ where each answer opens and closes without JavaScript.",
      [
        "A section with an h2 Frequently asked questions",
        "At least three details elements, each with a summary (the question) and a paragraph (the answer)",
        "The first one starts open",
      ],
      page("FAQ", String.raw`
  <main>
    <section>
      <h2>Frequently asked questions</h2>
      <details open>
        <summary>Is the internship remote?</summary>
        <p>You can choose remote, hybrid or on-site at our Pune office.</p>
      </details>
      <details>
        <summary>Do I get a certificate?</summary>
        <p>Yes, after you finish all the assignments and the final project.</p>
      </details>
      <details>
        <summary>What if I miss a live session?</summary>
        <p>Every session is recorded and shared the same evening.</p>
      </details>
    </section>
  </main>`),
      [
        el("section > h2", "An FAQ heading", { text: "questions" }),
        el("details", "At least three details elements", { min: 3 }),
        el("details > summary", "Each has a summary", { min: 3 }),
        el("details > p", "Each has an answer paragraph", { min: 3 }),
        el("details[open]", "The first one starts open", { min: 1, max: 1 }),
      ],
    ),

    hq(
      "Event notice with time, mark and dialog",
      "Mark up an event notice with machine-readable times and a confirmation dialog.",
      [
        "An article with an h2 Hackathon 2026",
        'A paragraph with the start as <time datetime="2026-11-21T09:00">21 November, 9 AM</time>',
        "Highlight the words Registration closes soon with <mark>",
        "A dialog element with the open attribute containing a paragraph and a form with method=\"dialog\" and a button to close it",
      ],
      page("Hackathon", String.raw`
  <main>
    <article>
      <h2>Hackathon 2026</h2>
      <p>Starts on <time datetime="2026-11-21T09:00">21 November, 9 AM</time> and runs for 24 hours.</p>
      <p><mark>Registration closes soon</mark>, so sign up with your team today.</p>
    </article>
    <dialog open>
      <p>You are registered for Hackathon 2026.</p>
      <form method="dialog">
        <button type="submit">Close</button>
      </form>
    </dialog>
  </main>`),
      [
        el("article > h2", "An article with a heading", { text: "Hackathon" }),
        el("time[datetime]", "The start time is a time element"),
        { match: 'datetime="\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}', message: "datetime includes a date and a time (YYYY-MM-DDTHH:MM)" },
        el("mark", "The urgent words are highlighted with mark", { text: "Registration closes soon" }),
        el("dialog[open] form[method=dialog] button", "An open dialog with a close button in a method=dialog form"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Replace div soup with semantic elements",
      "The starter page is built only from divs with class names. Rewrite it with the right semantic elements.",
      [
        "div.header becomes header, div.nav becomes nav, div.main becomes main",
        "Each div.post becomes an article, div.sidebar becomes aside, div.footer becomes footer",
        "Keep all the content; no div with those class names should remain",
      ],
      page("My Blog", String.raw`
  <header>
    <p>My Tech Blog</p>
    <nav aria-label="Main">
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <article>
      <h2>Why I Love CSS Grid</h2>
      <p>Two lines of CSS gave me a layout that used to take fifty.</p>
    </article>
    <article>
      <h2>Learning Git the Easy Way</h2>
      <p>Commit small, commit often, and write messages your future self will thank you for.</p>
    </article>
  </main>
  <aside>
    <h2>About me</h2>
    <p>Final-year student and web development intern.</p>
  </aside>
  <footer>
    <p>&copy; 2026 My Tech Blog</p>
  </footer>`),
      [
        el("header > nav", "The nav is inside the header"),
        el("main > article", "The posts are articles inside main", { min: 2 }),
        el("article > h2", "Each post keeps its heading", { min: 2 }),
        el("aside", "The sidebar is an aside"),
        el("footer", "The footer is a footer"),
        { notMatch: "class=[\"'](header|nav|main|post|sidebar|footer)[\"']", message: "No div classes like header, nav, post or footer remain" },
      ],
      {
        level: "advanced",
        starter: page("My Blog", String.raw`
  <div class="header">
    <p>My Tech Blog</p>
    <div class="nav">
      <a href="/">Home</a>
      <a href="/about">About</a>
    </div>
  </div>
  <div class="main">
    <div class="post">
      <h2>Why I Love CSS Grid</h2>
      <p>Two lines of CSS gave me a layout that used to take fifty.</p>
    </div>
    <div class="post">
      <h2>Learning Git the Easy Way</h2>
      <p>Commit small, commit often, and write messages your future self will thank you for.</p>
    </div>
  </div>
  <div class="sidebar">
    <h2>About me</h2>
    <p>Final-year student and web development intern.</p>
  </div>
  <div class="footer">
    <p>&copy; 2026 My Tech Blog</p>
  </div>`),
      },
    ),

    hq(
      "Product listing with article cards",
      "Build a product listing page where each product is a self-contained card.",
      [
        "Inside main, a section with an h2 Laptops for students",
        "At least three article cards, each with an h3 product name, an img with alt text, a paragraph with the price and a link to the product page",
        "An aside with a tip for buyers",
      ],
      page("Laptops", String.raw`
  <main>
    <section>
      <h2>Laptops for students</h2>
      <article>
        <h3>Swift Air 14</h3>
        <img src="images/swift-air.jpg" alt="Silver 14-inch laptop, open, side view" width="300" height="200">
        <p>Rs 54,990</p>
        <a href="/laptops/swift-air-14">View details</a>
      </article>
      <article>
        <h3>CodeBook Pro 15</h3>
        <img src="images/codebook-pro.jpg" alt="Dark grey 15-inch laptop with a backlit keyboard" width="300" height="200">
        <p>Rs 72,500</p>
        <a href="/laptops/codebook-pro-15">View details</a>
      </article>
      <article>
        <h3>Student Lite 13</h3>
        <img src="images/student-lite.jpg" alt="Blue 13-inch laptop, closed, on a desk" width="300" height="200">
        <p>Rs 38,999</p>
        <a href="/laptops/student-lite-13">View details</a>
      </article>
    </section>
    <aside>
      <p>Tip: for programming, choose at least 16 GB of RAM and an SSD.</p>
    </aside>
  </main>`),
      [
        el("main > section > h2", "A section heading"),
        el("section > article", "At least three product articles", { min: 3 }),
        el("article > h3", "Each product has an h3 name", { min: 3 }),
        el("article > img[alt]", "Each product has an image with alt text", { min: 3 }),
        el("article > a[href]", "Each product links to its page", { min: 3 }),
        el("main > aside", "An aside with a buying tip"),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "What is the main benefit of semantic elements like <nav> and <main> over <div>?", options: ["They load faster", "They describe what content is, which helps screen readers, search engines and other developers", "They have built-in styles", "They are required for CSS to work"], answer: 1, why: "They look like divs but create landmarks and meaning." },
    { q: "How many visible <main> elements should a page have?", options: ["As many as there are sections", "Exactly one", "One per article", "None, it is optional"], answer: 1, why: "main holds the page's unique content; there should be one visible main." },
    { q: "Which content fits <article> best?", options: ["The site's navigation menu", "A product card that could be shown on its own", "A wrapper used only for a flex layout", "The copyright line"], answer: 1, why: "article is for self-contained, independently distributable content." },
    { q: "What should the datetime attribute of <time> contain for 5 March 2026?", options: ["05/03/2026", "5 March 2026", "2026-03-05", "March 5th"], answer: 2, why: "Machine-readable dates use the ISO format YYYY-MM-DD." },
    { q: "What does <details> do without any JavaScript?", options: ["Nothing until scripted", "Creates a box that opens and closes when its summary is clicked", "Shows a tooltip", "Opens a modal dialog"], answer: 1, why: "details and summary form a native disclosure widget." },
    { q: "What is <address> meant for?", options: ["Any postal address on the page", "Contact information for the page's or article's owner or author", "The page URL", "Email links only"], answer: 1, why: "address describes how to contact the author or owner, not arbitrary addresses." },
    { q: "When is a <div> the right choice?", options: ["Never in HTML5", "When you need a box for styling or layout and no semantic element fits", "For every section of a page", "Only inside forms"], answer: 1, why: "div has no meaning, which is exactly right for pure layout wrappers." },
    { q: "A page has a main menu in the header and a small menu in the footer, both as <nav>. What should you add?", options: ["Nothing", "Different aria-label values so the landmarks can be told apart", "role=\"menu\" on both", "Make one of them a div"], answer: 1, why: "Screen readers list landmarks by name; two unnamed navs are confusing." },
    { q: "Which structure is invalid or wrong?", options: ["An article containing a header and a footer", "A section containing articles", "A main element inside a footer", "A nav inside a header"], answer: 2, why: "main must not be a descendant of header, footer, nav, article or aside." },
    { q: "A developer wraps the entire body content in one <section> to give the page a background colour. What is wrong?", options: ["Nothing, section is a generic wrapper", "section is for a thematic group with a heading; a styling wrapper should be a div (or style body)", "section cannot be styled", "section must be inside article"], answer: 1, why: "section implies a themed part of the document; use div when you only need a box." },
  ],
};
