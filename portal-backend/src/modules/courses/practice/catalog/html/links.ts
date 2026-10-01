import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const links: PracticeUnit = {
  key: "links",
  title: "Links and images",
  summary: "absolute and relative links, jump links, mailto and tel links, downloads, images with alt text, figures and responsive images",
  reading: String.raw`## The anchor element

Links are made with <a> (anchor) and its href attribute. The text between the tags is what the user clicks, so it should say where the link goes: "Download the syllabus", not "click here".

` + "```html" + String.raw`
<a href="https://developer.mozilla.org/">MDN Web Docs</a>
<a href="about.html">About us</a>
<a href="#contact">Jump to contact</a>
` + "```" + String.raw`

## Absolute and relative URLs

- An absolute URL includes the scheme and domain: https://www.inveon.in/courses. Use it for other websites.
- A relative URL is resolved from the current page's folder. If you are on /site/index.html, then about.html means /site/about.html, blog/post.html goes into a sub-folder, ../index.html goes one folder up, and /index.html starts from the site root.
- Always use forward slashes, and match the file name's case exactly: servers on Linux treat About.html and about.html as different files.

## Opening links in a new tab

target="_blank" opens a new tab. Add rel="noopener" (modern browsers imply it, but write it anyway) so the new page cannot control your page through window.opener, and rel="noreferrer" if you also do not want to send the referring URL. Open new tabs only when it helps the user, such as a PDF or an external reference in the middle of a form.

## Jump links, email, phone and downloads

- Give any element an id and link to it with a # fragment: <section id="pricing"> and <a href="#pricing">. An id must be unique on the page.
- href="#top" or href="#" scrolls to the top of the page.
- mailto: opens the email app: <a href="mailto:hr@inveon.in?subject=Internship">. Spaces in the subject must be written as %20.
- tel: starts a call on phones. Use the international format: <a href="tel:+919876543210">.
- The download attribute asks the browser to download the file instead of opening it: <a href="brochure.pdf" download>. It works for files on your own site.

## Images

` + "```html" + String.raw`
<img src="images/campus.jpg" alt="Students walking across the green campus lawn"
     width="800" height="450" loading="lazy">
` + "```" + String.raw`

- src is the path to the image, relative or absolute, just like href.
- alt is required. It is read aloud by screen readers, shown if the image fails to load, and used by search engines. Describe what the image shows or does. For a purely decorative image, use an empty alt="" so screen readers skip it. Never write alt="image".
- width and height (in pixels, no unit) let the browser reserve space before the image loads, which stops the page from jumping around.
- loading="lazy" delays off-screen images until the user scrolls near them. Do not lazy-load the main image at the top of the page.
- Use JPEG or WebP for photos, PNG for screenshots and images with transparency, SVG for logos and icons, and AVIF or WebP for the smallest files.

## Figures and captions

When an image (or chart, or code sample) has a caption, wrap both in <figure> and put the caption in <figcaption>. The caption does not replace alt: alt describes the image, the caption adds context.

## Images as links

Put the <img> inside the <a>. Then the alt text becomes the link text, so describe the destination: alt="Inveon Technologies home".

## Responsive images

A phone does not need a 2000px-wide photo. srcset lists the same image in several widths and sizes tells the browser how wide it will be shown; the browser then picks the smallest file that looks sharp.

` + "```html" + String.raw`
<img src="hall-800.jpg"
     srcset="hall-400.jpg 400w, hall-800.jpg 800w, hall-1600.jpg 1600w"
     sizes="(max-width: 600px) 100vw, 50vw"
     alt="The auditorium during the annual day function">
` + "```" + String.raw`

To offer different formats or different crops, use <picture> with <source> elements. The browser takes the first source it supports and falls back to the <img>, which is required and holds the alt text.

` + "```html" + String.raw`
<picture>
  <source srcset="team.avif" type="image/avif">
  <source srcset="team.webp" type="image/webp">
  <img src="team.jpg" alt="Our team of twelve at the office" width="1200" height="800">
</picture>
` + "```" + String.raw`

## Common mistakes

- Backslashes in paths (images\logo.png) copied from Windows. Use forward slashes.
- Links with vague text like "here" or "read more" repeated many times.
- Forgetting alt, or stuffing it with keywords.
- Linking to a file on your own computer (C:/Users/...), which will not exist on the server.

## How your assignments are checked

The checker looks for the elements and attributes each question asks for, for example an a with an href starting with https://, an img with a non-empty alt, or a source inside picture. The line-by-line reviewer warns about every img without alt and every target="_blank" link without rel="noopener", so fix those before you upload.`,
  questions: [
    hq(
      "Link to an external site",
      "Add a paragraph that links to MDN Web Docs and opens it safely in a new tab.",
      [
        "A paragraph with a link to https://developer.mozilla.org/",
        "The link text must be meaningful: MDN Web Docs",
        'Open it in a new tab with target="_blank"',
        'Add rel="noopener noreferrer"',
      ],
      page("Resources", String.raw`
  <h1>Learning Resources</h1>
  <p>The best free reference for HTML is <a href="https://developer.mozilla.org/" target="_blank" rel="noopener noreferrer">MDN Web Docs</a>.</p>`),
      [
        el('a[href^="https://developer.mozilla.org"]', "Links to https://developer.mozilla.org"),
        el("a", "The link text is MDN Web Docs", { text: "MDN Web Docs" }),
        el("a[target=_blank]", "Opens in a new tab"),
        el("a[rel*=noopener]", 'Has rel="noopener"'),
        el("p a", "The link is inside a paragraph"),
      ],
    ),

    hq(
      "Links between your own pages",
      "Build the navigation for a small site that lives in several folders, using relative URLs.",
      [
        "You are on the file site/blog/index.html",
        "Link to the home page one folder up: ../index.html (text Home)",
        "Link to about.html one folder up (text About)",
        "Link to first-post.html in the current folder (text First post)",
        "Link to the image gallery at site/gallery/photos.html (text Gallery)",
        "Put all links inside a <nav>",
      ],
      page("Blog", String.raw`
  <nav>
    <a href="../index.html">Home</a>
    <a href="../about.html">About</a>
    <a href="first-post.html">First post</a>
    <a href="../gallery/photos.html">Gallery</a>
  </nav>
  <h1>Blog</h1>`),
      [
        el("nav a", "At least four links in the nav", { min: 4 }),
        el('a[href="../index.html"]', "Home goes up one folder to ../index.html"),
        el('a[href="../about.html"]', "About is ../about.html"),
        el('a[href="first-post.html"]', "First post is in the same folder"),
        el('a[href="../gallery/photos.html"]', "Gallery is ../gallery/photos.html"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Jump links within a page",
      "Make a one-page product site whose menu jumps to sections on the same page.",
      [
        "A nav with links to #features, #pricing and #faq",
        "Three sections with the matching ids, each with an h2 and a paragraph",
        "At the bottom, a Back to top link to #top, and give the h1 the id top",
      ],
      page("Study Planner App", String.raw`
  <h1 id="top">Study Planner</h1>
  <nav>
    <a href="#features">Features</a>
    <a href="#pricing">Pricing</a>
    <a href="#faq">FAQ</a>
  </nav>
  <section id="features">
    <h2>Features</h2>
    <p>Plan your week, track assignments and get reminders before exams.</p>
  </section>
  <section id="pricing">
    <h2>Pricing</h2>
    <p>Free for students. Colleges pay per campus.</p>
  </section>
  <section id="faq">
    <h2>FAQ</h2>
    <p>Yes, it works offline and syncs when you are back online.</p>
  </section>
  <p><a href="#top">Back to top</a></p>`),
      [
        el('nav a[href="#features"]', "The nav links to #features"),
        el('nav a[href="#pricing"]', "The nav links to #pricing"),
        el('nav a[href="#faq"]', "The nav links to #faq"),
        el("#features h2, #pricing h2, #faq h2", "Sections with ids features, pricing and faq, each with an h2", { min: 3 }),
        el('a[href="#top"]', "A Back to top link"),
        el("#top", "An element with id top"),
      ],
    ),

    hq(
      "Email and phone links",
      "Add a contact block with a clickable email address and phone number.",
      [
        "A mailto link to hr@inveon.in with the subject Internship Application (write the spaces as %20)",
        "A tel link to +91 98765 43210 in international format without spaces: tel:+919876543210",
        "Show the address and number as the link text",
      ],
      page("Contact", String.raw`
  <h1>Contact HR</h1>
  <p>Email: <a href="mailto:hr@inveon.in?subject=Internship%20Application">hr@inveon.in</a></p>
  <p>Phone: <a href="tel:+919876543210">+91 98765 43210</a></p>`),
      [
        el('a[href^="mailto:hr@inveon.in"]', "A mailto link to hr@inveon.in"),
        el('a[href*="subject=Internship%20Application"]', "The subject is Internship%20Application"),
        el('a[href="tel:+919876543210"]', "A tel link in international format"),
        el("a", "The email address is the link text", { text: "hr@inveon\\.in" }),
      ],
    ),

    hq(
      "Download link",
      "Offer the course brochure as a download instead of opening it in the browser.",
      [
        "A link to files/brochure-2026.pdf",
        "Add the download attribute, with the value Inveon-Brochure.pdf as the suggested file name",
        "The link text should say Download the brochure (PDF, 2 MB)",
      ],
      page("Brochure", String.raw`
  <h1>Course Brochure</h1>
  <p><a href="files/brochure-2026.pdf" download="Inveon-Brochure.pdf">Download the brochure (PDF, 2 MB)</a></p>`),
      [
        el('a[href="files/brochure-2026.pdf"]', "Links to files/brochure-2026.pdf"),
        el("a[download]", "Has the download attribute"),
        el('a[download="Inveon-Brochure.pdf"]', "Suggests the file name Inveon-Brochure.pdf"),
        el("a", "The link text says what is downloaded", { text: "Download the brochure" }),
      ],
    ),

    hq(
      "Image with alt text and dimensions",
      "Show a photo of the college campus the right way.",
      [
        "An img with src images/campus.jpg",
        "A descriptive alt text of at least a few words (not the word image)",
        "width 800 and height 450 (numbers only, no px)",
        'Lazy-load it with loading="lazy"',
      ],
      page("Campus", String.raw`
  <h1>Our Campus</h1>
  <img src="images/campus.jpg" alt="Students sitting on the lawn in front of the main building" width="800" height="450" loading="lazy">`),
      [
        el('img[src="images/campus.jpg"]', "An image from images/campus.jpg"),
        el('img[alt*=" "]', "The alt text describes the image in a few words"),
        el("img[width=800][height=450]", "width 800 and height 450"),
        el("img[loading=lazy]", "The image is lazy-loaded"),
        { notMatch: "alt=[\"']?image[\"'\\s>]", flags: "i", message: 'The alt text is not just "image"' },
      ],
    ),

    hq(
      "Figure with a caption",
      "Show a chart with a caption using figure and figcaption.",
      [
        "A <figure> containing an img of charts/placements.png with a descriptive alt",
        "A <figcaption> inside the figure: Placements by branch, 2025-26",
      ],
      page("Placements", String.raw`
  <h1>Placement Report</h1>
  <figure>
    <img src="charts/placements.png" alt="Bar chart: computer engineering placed 92 students, the highest of all branches" width="640" height="360">
    <figcaption>Placements by branch, 2025-26</figcaption>
  </figure>`),
      [
        el("figure > img[src]", "An image inside a figure"),
        el("figure > img[alt]", "The image has alt text"),
        el("figure > figcaption", "A figcaption inside the figure", { text: "Placements by branch" }),
        el("figure", "Only one figure is needed", { max: 1 }),
      ],
    ),

    hq(
      "Clickable logo",
      "Make the site logo a link back to the home page.",
      [
        "Inside a <header>, a link to index.html",
        "Inside the link, an img with src logo.svg",
        "Since the image is the link text, its alt should name the destination: Inveon Technologies home",
      ],
      page("Logo Link", String.raw`
  <header>
    <a href="index.html"><img src="logo.svg" alt="Inveon Technologies home" width="160" height="40"></a>
  </header>`),
      [
        el("header a[href=index.html]", "A link to index.html in the header"),
        el('a > img[src="logo.svg"]', "The logo image is inside the link"),
        el("header > a > img[width][height]", "The logo has width and height"),
        el('img[alt*="home"]', "The alt says it goes home"),
      ],
    ),

    hq(
      "Responsive images with srcset and picture",
      "Serve a hero image that picks the right size and the best format for each device.",
      [
        "A <picture> with a <source> of type image/avif and another of type image/webp",
        "Inside the picture, a fallback img hero-800.jpg with alt text",
        "The img has a srcset with hero-400.jpg 400w, hero-800.jpg 800w and hero-1600.jpg 1600w",
        'The img has sizes="(max-width: 600px) 100vw, 800px"',
        "This is the top image of the page, so do not lazy-load it",
      ],
      page("Hero", String.raw`
  <picture>
    <source srcset="hero-800.avif" type="image/avif">
    <source srcset="hero-800.webp" type="image/webp">
    <img src="hero-800.jpg"
         srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1600.jpg 1600w"
         sizes="(max-width: 600px) 100vw, 800px"
         alt="Interns collaborating around a laptop in the Inveon office" width="800" height="450">
  </picture>`),
      [
        el("picture > source[type=image/avif]", "An AVIF source"),
        el("picture > source[type=image/webp]", "A WebP source"),
        el("picture > img[alt]", "A fallback img with alt inside picture"),
        el("img[srcset*=400w][srcset*=800w][srcset*=1600w]", "srcset lists 400w, 800w and 1600w"),
        el("img[sizes]", "The img has a sizes attribute"),
        el("img[loading=lazy]", "The hero image is not lazy-loaded", { max: 0 }),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "You are on /site/blog/post.html. Where does href=\"../about.html\" point?", options: ["/site/blog/about.html", "/site/about.html", "/about.html", "/site/blog/../about.html as a file name"], answer: 1, why: ".. goes up one folder from /site/blog/ to /site/." },
    { q: "Which link text is best for accessibility?", options: ["Click here", "Read more", "Download the 2026 syllabus (PDF)", "Link"], answer: 2, why: "Screen reader users often jump between links; the text alone should say where it goes." },
    { q: "What does alt=\"\" on an image mean?", options: ["The image is broken", "The image is decorative and screen readers should skip it", "The alt text will be generated automatically", "It is invalid HTML"], answer: 1, why: "An empty alt marks the image as decorative. A missing alt is an error." },
    { q: "Why give an img width and height attributes?", options: ["To resize the file on the server", "So the browser can reserve space and avoid layout shift while it loads", "They are required for alt to work", "To make it responsive"], answer: 1, why: "The browser uses them to compute the aspect ratio before the image arrives." },
    { q: "Which href opens the phone dialler?", options: ["phone:9876543210", "call:+919876543210", "tel:+919876543210", "sms://9876543210"], answer: 2, why: "The tel: scheme starts a call on devices that can make one." },
    { q: "What does the download attribute do?", options: ["Makes the link open in a new tab", "Asks the browser to save the linked file instead of navigating to it", "Compresses the file", "Works on any website's files"], answer: 1, why: "download suggests saving the file (for same-origin URLs) and can set its file name." },
    { q: "Where does the alt text go when you use <picture>?", options: ["On each <source>", "On the <picture> element", "On the <img> inside picture", "In a figcaption"], answer: 2, why: "The img is required inside picture, is what gets displayed, and carries alt." },
    { q: "An <img> has srcset=\"a-400.jpg 400w, a-800.jpg 800w\" but no sizes attribute. What does the browser assume?", options: ["The image is shown at 400px", "The image is shown at 100vw (the full viewport width)", "It ignores srcset", "It downloads both files"], answer: 1, why: "sizes defaults to 100vw, which can make the browser pick a larger file than needed." },
    { q: "Which is true about target=\"_blank\"?", options: ["It is required for external links", "Add rel=\"noopener\" so the opened page cannot access window.opener", "It makes the link download the file", "It only works with mailto: links"], answer: 1, why: "noopener prevents reverse tabnabbing; modern browsers apply it by default but writing it is still good practice." },
    { q: "An image is inside a link and is the only content of the link. What should its alt text describe?", options: ["The colours of the image", "The file name", "Where the link goes or what it does", "Nothing, use alt=\"\""], answer: 2, why: "The alt becomes the link's accessible name; an empty alt would leave the link with no name." },
  ],
};
