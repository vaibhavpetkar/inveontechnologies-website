import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const structure: PracticeUnit = {
  key: "structure",
  title: "Document structure and text",
  summary: "the HTML5 page skeleton, the head and metadata, headings, paragraphs, text-level tags, quotes, code and entities",
  reading: String.raw`## What HTML is

HTML (HyperText Markup Language) describes the structure and meaning of a web page. It does not decide colours or layout (that is CSS) and it does not add behaviour (that is JavaScript). A browser reads your HTML from top to bottom and builds a tree of elements called the DOM.

An element is usually an opening tag, some content and a closing tag: <p>Hello</p>. Some elements are void, which means they have no content and no closing tag: <br>, <hr>, <img>, <input>, <meta> and <link>. Attributes go inside the opening tag and give extra information: <html lang="en">.

## The HTML5 page skeleton

Every page you build should start from this skeleton:

` + "```html" + String.raw`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inveon Technologies | Home</title>
</head>
<body>
  <h1>Welcome</h1>
  <p>Our first page.</p>
</body>
</html>
` + "```" + String.raw`

- <!DOCTYPE html> tells the browser to use standards mode. Without it, old "quirks mode" rules kick in and CSS behaves strangely.
- lang="en" tells screen readers and search engines the language of the page.
- meta charset="UTF-8" lets you use any character: ₹, é, हिंदी, emoji.
- The viewport meta tag makes the page fit phone screens instead of showing a zoomed-out desktop page.
- title is the text in the browser tab, in bookmarks and in Google results. Every page needs a unique, meaningful title.
- Only what is inside body is shown on the page. The head holds information about the page.

## Headings and paragraphs

There are six heading levels, h1 to h6. Use exactly one h1 for the main topic of the page, then h2 for sections, h3 for sub-sections, and so on, without skipping levels. Pick a heading for its level of importance, never for its size: size is CSS's job.

Paragraphs go in <p>. The browser collapses extra spaces and new lines in your code into a single space, so pressing Enter in the editor does not create a new line on the page. Use a new <p> for a new paragraph, and <br> only where a line break is part of the content (an address, a poem). <hr> marks a thematic break between topics.

## Text-level elements

- <strong>: strong importance (a warning, a deadline). Shown bold.
- <em>: stress emphasis that changes the meaning of a sentence. Shown italic.
- <b> and <i>: bold or italic without extra importance (a product name, a term in another language).
- <mark>: highlighted text, like search matches.
- <small>: side comments and fine print.
- <sub> and <sup>: subscript and superscript, as in H<sub>2</sub>O and x<sup>2</sup>.
- <abbr title="Hypertext Markup Language">HTML</abbr>: an abbreviation with its full form.
- <code>, <kbd>, <samp>: code, keyboard keys and program output. Put multi-line code in <pre><code>...</code></pre>; pre keeps spaces and line breaks exactly.
- <blockquote cite="url"> for a long quote, <q> for a short inline quote, <cite> for the title of a work.

## Entities

Some characters have special meaning in HTML. To show them as text, write an entity: &lt; for <, &gt; for >, &amp; for &, &quot; for a double quote. Other useful ones: &copy; for ©, &nbsp; for a space that never breaks (as in "10&nbsp;kg"), &rarr; for →, and numeric forms like &#8377; for ₹.

## Common mistakes

- Forgetting to close a tag, or closing tags in the wrong order: <strong><em>text</strong></em>. Close the inner tag first.
- Using <br><br> to make space between paragraphs. Use separate <p> elements and CSS margins.
- Choosing h4 because "it looks the right size".
- Writing a bare < in text, which the browser may treat as the start of a tag.
- Using obsolete tags like <font>, <center> and <marquee>. They are gone from HTML5.

## How your assignments are checked

Upload one .html file per question. The checker parses your page into a tree and checks its structure with selectors, for example "an h2 inside main" or "at least three li inside ul", and sometimes the text inside an element. It also reviews your code line by line for unclosed tags, images without alt text and obsolete tags. Comments are ignored, so the answer must be real markup. Start every file from the skeleton above.`,
  questions: [
    hq(
      "Basic page skeleton",
      "Write a complete HTML5 page from scratch with the correct doctype, language, head and body.",
      [
        "Start with the HTML5 doctype",
        'Set the page language to English with lang="en" on <html>',
        "In the head: a UTF-8 charset meta tag, the viewport meta tag and a title with the text My First Page",
        "In the body: an h1 that says Hello, World and one paragraph about yourself",
      ],
      page("My First Page", String.raw`
  <h1>Hello, World</h1>
  <p>I am Priya, a first-year computer science student from Pune, and this is my first web page.</p>`),
      [
        { match: "<!DOCTYPE html>", flags: "i", message: "Starts with the HTML5 doctype" },
        el("html[lang=en]", 'The html element has lang="en"'),
        el("head > meta[charset]", "The head declares the character set"),
        el("head > meta[name=viewport]", "The head has the viewport meta tag"),
        el("head > title", "The title says My First Page", { text: "^\\s*My First Page\\s*$" }),
        el("body > h1", "The body has an h1 saying Hello, World", { text: "Hello,? World" }),
        el("body > p", "The body has a paragraph"),
      ],
      { starter: "<!-- Build the complete page here -->\n" },
    ),

    hq(
      "Headings in the right order",
      "Build the outline of a college fest page using headings in a correct hierarchy.",
      [
        "One h1: TechFest 2026",
        "An h2 Events, followed by two h3 headings: Coding Contest and Robo Race",
        "Another h2 Contact",
        "Put a short paragraph under each h3 and under Contact",
        "Do not skip levels and use only one h1",
      ],
      page("TechFest 2026", String.raw`
  <h1>TechFest 2026</h1>
  <h2>Events</h2>
  <h3>Coding Contest</h3>
  <p>Solve five problems in three hours. Teams of two.</p>
  <h3>Robo Race</h3>
  <p>Build a line-following robot and race it on our track.</p>
  <h2>Contact</h2>
  <p>Write to the student council for registrations.</p>`),
      [
        el("h1", "Exactly one h1, saying TechFest 2026", { min: 1, max: 1, text: "TechFest 2026" }),
        el("h2", "Two h2 headings", { min: 2 }),
        el("h2", "An h2 named Events", { text: "Events" }),
        el("h3", "An h3 Coding Contest", { text: "Coding Contest" }),
        el("h3", "An h3 Robo Race", { text: "Robo Race" }),
        el("p", "A paragraph under each h3 and under Contact", { min: 3 }),
      ],
    ),

    hq(
      "Paragraphs and line breaks",
      "Show a college's postal address and a note using paragraphs, line breaks and a thematic break.",
      [
        "A heading h1 with the text Visit Us",
        "One paragraph with the address on four lines separated by <br> (name, street, city, PIN)",
        "An <hr> after the address",
        "A second paragraph with the office timings",
      ],
      page("Visit Us", String.raw`
  <h1>Visit Us</h1>
  <p>
    Inveon Technologies<br>
    2nd Floor, FC Road<br>
    Pune, Maharashtra<br>
    411004
  </p>
  <hr>
  <p>Our office is open Monday to Saturday, 10 AM to 6 PM.</p>`),
      [
        el("h1", "An h1 saying Visit Us", { text: "Visit Us" }),
        el("p br", "The address paragraph uses at least three <br> tags", { min: 3 }),
        el("hr", "A thematic break (hr) after the address"),
        el("p", "Two paragraphs", { min: 2 }),
        el("p", "The address includes a six-digit PIN code", { text: "\\b\\d{6}\\b" }),
      ],
    ),

    hq(
      "Strong, emphasis, subscripts and superscripts",
      "Write a short chemistry and maths notice that uses the right text-level elements.",
      [
        "A paragraph where the word Deadline is inside <strong>",
        "In the same paragraph, stress the word must with <em>",
        "A paragraph that writes the formula of water as H<sub>2</sub>O",
        "A paragraph that writes a squared as a<sup>2</sup> + b<sup>2</sup>",
        "Add one line of fine print inside <small>",
      ],
      page("Lab Notice", String.raw`
  <h1>Lab Notice</h1>
  <p><strong>Deadline:</strong> you <em>must</em> submit your lab record by Friday.</p>
  <p>Today we will study the electrolysis of water, H<sub>2</sub>O.</p>
  <p>Revise the identity (a + b)<sup>2</sup> = a<sup>2</sup> + 2ab + b<sup>2</sup>.</p>
  <p><small>Late submissions lose 10% of the marks.</small></p>`),
      [
        el("p strong", "Deadline is inside strong", { text: "Deadline" }),
        el("p em", "The word must is stressed with em", { text: "must" }),
        el("sub", "H2O is written with sub", { text: "^2$" }),
        el("sup", "At least two superscripts", { min: 2 }),
        el("small", "Fine print in small"),
      ],
    ),

    hq(
      "Quotes, citations and abbreviations",
      "Write a short article about a famous quote using the correct quotation elements.",
      [
        "A <blockquote> with a cite attribute (a URL) containing a paragraph of the quote",
        "A paragraph that names the book or speech inside <cite>",
        "A paragraph with a short inline quote inside <q>",
        'Use <abbr> with a title for at least one abbreviation, e.g. <abbr title="Indian Space Research Organisation">ISRO</abbr>',
      ],
      page("Quotes", String.raw`
  <h1>Words That Inspire</h1>
  <blockquote cite="https://www.isro.gov.in/">
    <p>Dream is not that which you see while sleeping, it is something that does not let you sleep.</p>
  </blockquote>
  <p>This line is from <cite>Wings of Fire</cite> by Dr. A. P. J. Abdul Kalam.</p>
  <p>He also said, <q>Excellence is a continuous process and not an accident.</q></p>
  <p>Before becoming President, he worked at <abbr title="Indian Space Research Organisation">ISRO</abbr>.</p>`),
      [
        el("blockquote[cite]", "A blockquote with a cite attribute"),
        el("blockquote p", "The quote text is in a paragraph inside the blockquote"),
        el("cite", "The source is named with cite"),
        el("q", "A short inline quote with q"),
        el("abbr[title]", "An abbreviation with its full form in title"),
      ],
    ),

    hq(
      "Showing code on a page",
      "Make a small tutorial page that shows code and keyboard shortcuts correctly.",
      [
        "A paragraph that mentions the <code> element inline, e.g. the print() function",
        "A <pre><code> block with at least two lines of Python",
        "A paragraph with the shortcut Ctrl + S written using two <kbd> elements",
        "The block must show an HTML tag as text, so write it with &lt; and &gt;",
      ],
      page("Code Tips", String.raw`
  <h1>Code Tips</h1>
  <p>Use the <code>print()</code> function to show output in Python.</p>
  <pre><code>name = input("Your name: ")
print("Hello", name)</code></pre>
  <p>Save your file often with <kbd>Ctrl</kbd> + <kbd>S</kbd>.</p>
  <p>In HTML, a paragraph starts with <code>&lt;p&gt;</code>.</p>`),
      [
        el("p code", "Inline code inside a paragraph"),
        el("pre > code", "A pre block wrapping code"),
        el("kbd", "Keys written with kbd", { min: 2 }),
        { match: "&lt;", message: "A tag shown as text using &lt;" },
        { match: "&gt;", message: "Closed with &gt;" },
      ],
      { level: "intermediate" },
    ),

    hq(
      "Price list with entities",
      "Build a small café price list that uses character entities for special symbols.",
      [
        "An h1 Menu and a paragraph for each of three items with its price in rupees (write ₹ as &#8377; or &#x20B9;)",
        "Keep the number and unit together with &nbsp;, e.g. 250&nbsp;ml",
        "Write the café name Chai &amp; Code with &amp;",
        "A footer paragraph with &copy; 2026",
      ],
      page("Menu", String.raw`
  <h1>Menu</h1>
  <p>Chai &amp; Code Café</p>
  <p>Masala chai, 150&nbsp;ml: &#8377;30</p>
  <p>Filter coffee, 200&nbsp;ml: &#8377;40</p>
  <p>Vada pav: &#8377;25</p>
  <p>&copy; 2026 Chai &amp; Code</p>`),
      [
        { match: "&#8377;|&#x20B9;|&#X20B9;|&inr;", flags: "i", message: "The rupee sign is written as an entity" },
        { match: "&nbsp;", message: "A non-breaking space keeps a number and unit together" },
        { match: "&amp;", message: "The ampersand is written as &amp;" },
        { match: "&copy;|&#169;", message: "The copyright sign is written as &copy;" },
        el("p", "At least four paragraphs", { min: 4 }),
      ],
    ),

    hq(
      "Metadata in the head",
      "Fill in the head of a page with the metadata that browsers and search engines use.",
      [
        "A title: Learn HTML | Inveon Academy",
        "A meta description of one sentence",
        "A meta author tag with your name",
        'A favicon: <link rel="icon" href="favicon.ico">',
        "A body with an h1 Learn HTML",
      ],
      page(
        "Learn HTML | Inveon Academy",
        String.raw`
  <h1>Learn HTML</h1>
  <p>Start building web pages today.</p>`,
        String.raw`  <meta name="description" content="Free HTML lessons for students, from your first tag to complete accessible pages.">
  <meta name="author" content="Rahul Sharma">
  <link rel="icon" href="favicon.ico">`,
      ),
      [
        el("head > title", "The title is Learn HTML | Inveon Academy", { text: "Learn HTML \\| Inveon Academy" }),
        el("head > meta[name=description][content]", "A meta description with content"),
        el("head > meta[name=author][content]", "A meta author tag"),
        el("head > link[rel=icon][href]", "A favicon link"),
        el("body > h1", "An h1 in the body", { text: "Learn HTML" }),
      ],
    ),

    hq(
      "Recipe page",
      "Turn a plain-text recipe into a well structured page using everything from this unit.",
      [
        "An h1 with the dish name Masala Chai",
        "An intro paragraph where the serving size is in <strong>",
        "Two h2 headings: Ingredients and Method, each followed by at least one paragraph",
        "An <hr> before a final paragraph of tips",
        "A final line of fine print in <small>",
      ],
      page("Masala Chai Recipe", String.raw`
  <h1>Masala Chai</h1>
  <p>A warm, spiced tea that is ready in ten minutes. Serves <strong>2 people</strong>.</p>
  <h2>Ingredients</h2>
  <p>1 cup water, 1 cup milk, 2 teaspoons tea leaves, 2 teaspoons sugar, 2 crushed cardamom pods and a small piece of ginger.</p>
  <h2>Method</h2>
  <p>Boil the water with ginger and cardamom. Add the tea leaves and sugar and boil for two minutes.</p>
  <p>Add the milk, bring it to a boil again, then strain into cups.</p>
  <hr>
  <p>Tip: crush the ginger instead of grating it for a milder taste.</p>
  <p><small>Recipe shared by the Inveon canteen team.</small></p>`),
      [
        el("h1", "One h1 with the dish name", { min: 1, max: 1, text: "Masala Chai" }),
        el("h2", "An Ingredients heading", { text: "Ingredients" }),
        el("h2", "A Method heading", { text: "Method" }),
        el("p strong", "The serving size is in strong"),
        el("hr", "A thematic break before the tips"),
        el("p", "At least four paragraphs", { min: 4 }),
        el("small", "Fine print in small"),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "What does <!DOCTYPE html> do?", options: ["Loads the HTML library", "Tells the browser to render the page in standards mode", "Makes the page responsive", "Declares the character set"], answer: 1, why: "Without the doctype, browsers fall back to quirks mode, where layout rules differ." },
    { q: "Which element's content is shown in the browser tab?", options: ["<h1>", "<meta name=\"title\">", "<title>", "<header>"], answer: 2, why: "The title element (inside head) is shown in the tab, bookmarks and search results." },
    { q: "Which of these is a void element (no closing tag)?", options: ["<p>", "<br>", "<span>", "<strong>"], answer: 1, why: "br, hr, img, input, meta and link have no content and no closing tag." },
    { q: "Why should a page include <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">?", options: ["It improves SEO ranking directly", "It makes the page use the device's width instead of a zoomed-out desktop width on phones", "It sets the character encoding", "It is required for CSS to work"], answer: 1, why: "Without it, mobile browsers render at about 980px wide and shrink the page." },
    { q: "What is the difference between <strong> and <b>?", options: ["None, they are aliases", "<strong> marks importance; <b> only draws attention without extra importance", "<b> is obsolete and must not be used", "<strong> is bigger than <b>"], answer: 1, why: "Both look bold by default, but strong carries meaning that screen readers and search engines can use." },
    { q: "How do you show the text <p> on a page without the browser treating it as a tag?", options: ["<\"p\">", "\\<p\\>", "&lt;p&gt;", "<code><p></code>"], answer: 2, why: "Entities &lt; and &gt; show the angle brackets as text." },
    { q: "Which element should wrap a multi-line code sample so its spaces and line breaks are kept?", options: ["<code>", "<pre>", "<samp>", "<blockquote>"], answer: 1, why: "pre preserves whitespace; code inside it marks the content as code." },
    { q: "How many h1 elements should a typical page have?", options: ["None", "One, for the main topic", "One per section", "As many as needed for big text"], answer: 1, why: "One h1 names the page's topic; sections use h2 and below." },
    { q: "What does this render?\n\n<p>Hello\n\n\n     World</p>", options: ["Hello and World on separate lines with blank lines between", "Hello World on one line with a single space", "HelloWorld", "Hello followed by five spaces and World"], answer: 1, why: "HTML collapses runs of whitespace, including new lines, into a single space (outside pre)." },
    { q: "Which markup is correctly nested?", options: ["<p><strong><em>Hi</strong></em></p>", "<p><strong><em>Hi</em></strong></p>", "<strong><p>Hi</strong></p>", "<p><em>Hi</p></em>"], answer: 1, why: "Tags must close in the reverse order they opened: the innermost first." },
  ],
};
