import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const media: PracticeUnit = {
  key: "media",
  title: "Audio, video, iframes and SVG",
  summary: "the audio and video elements, sources, captions with track, autoplay rules, embedding with iframe safely, and inline SVG",
  reading: String.raw`## Video

The <video> element plays video natively, with no plugin:

` + "```html" + String.raw`
<video controls width="640" height="360" poster="images/intro-poster.jpg" preload="metadata">
  <source src="videos/intro.webm" type="video/webm">
  <source src="videos/intro.mp4" type="video/mp4">
  <track kind="subtitles" src="captions/intro-en.vtt" srclang="en" label="English" default>
  <p>Your browser cannot play this video. <a href="videos/intro.mp4">Download it</a> instead.</p>
</video>
` + "```" + String.raw`

- controls shows the play, volume and full-screen buttons. Without it the user cannot control the video (unless you build your own controls in JavaScript).
- Several <source> elements offer different formats. The browser plays the first one it supports, so list the smaller or better format (WebM, AV1) first and MP4 (H.264) last as the safe fallback. The type attribute lets the browser skip formats it cannot play without downloading them.
- poster is the image shown before playback starts.
- preload="none", "metadata" or "auto" hints how much to download before the user presses play. metadata (duration and size only) is a sensible default on mobile data.
- The content inside the video element (after the sources) is shown only by browsers that do not support video at all.

## Autoplay rules

Browsers block autoplay with sound. A background or hero video only autoplays when it is muted, and on iPhones it also needs playsinline to play inside the page instead of going full screen:

` + "```html" + String.raw`
<video autoplay muted loop playsinline poster="hero.jpg">
  <source src="hero.mp4" type="video/mp4">
</video>
` + "```" + String.raw`

Keep such videos short and small, and never autoplay a video with important information that users must hear.

## Captions and subtitles

<track> adds timed text from a WebVTT (.vtt) file. kind="subtitles" is a translation of the dialogue, kind="captions" also describes sounds for deaf users ("[door slams]"), and kind="descriptions" and "chapters" also exist. srclang is the language code and label is what appears in the player's menu. Captions are an accessibility requirement for videos with speech.

## Audio

<audio> works the same way as video, without the picture:

` + "```html" + String.raw`
<audio controls>
  <source src="podcast/ep1.ogg" type="audio/ogg">
  <source src="podcast/ep1.mp3" type="audio/mpeg">
  <a href="podcast/ep1.mp3">Download episode 1 (MP3)</a>
</audio>
` + "```" + String.raw`

Note that the MIME type for MP3 is audio/mpeg, not audio/mp3. For a podcast, also publish a transcript on the page.

## iframe: a page inside your page

An <iframe> embeds another web page: a YouTube video, a Google Map, a form or a payment widget.

` + "```html" + String.raw`
<iframe src="https://www.youtube.com/embed/VIDEO_ID"
        title="Inveon campus tour"
        width="560" height="315"
        loading="lazy"
        allow="accelerometer; encrypted-media; picture-in-picture"
        allowfullscreen></iframe>
` + "```" + String.raw`

- title is required for accessibility: screen readers announce it so users know what the frame contains.
- YouTube needs the /embed/ URL, not the normal watch?v= URL, which refuses to load in a frame.
- loading="lazy" delays off-screen frames, which is a big performance win because embeds load a lot of JavaScript.
- sandbox locks the embedded page down: with an empty sandbox it cannot run scripts, submit forms or open pop-ups. Add back only what it needs, for example sandbox="allow-scripts allow-forms". Use it for any content you do not fully trust.
- referrerpolicy controls how much of your URL the embedded site sees.
- Many sites forbid being framed (with the X-Frame-Options or Content-Security-Policy header), so you cannot iframe any site you like.

## Inline SVG

SVG is an image format made of XML, and you can write it straight into HTML. It stays sharp at any size and can be styled with CSS, which makes it perfect for icons and logos:

` + "```html" + String.raw`
<svg width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="ok-title">
  <title id="ok-title">Completed</title>
  <circle cx="12" cy="12" r="10" fill="green"></circle>
  <path d="M7 12l3 3 7-7" stroke="white" stroke-width="2" fill="none"></path>
</svg>
` + "```" + String.raw`

viewBox defines the internal coordinate system (here 24 by 24 units), and width and height set the size on the page. If an icon is decorative (next to visible text), hide it from screen readers with aria-hidden="true"; if it carries meaning, give it role="img" and a title.

## Common mistakes

- A video with no controls and no autoplay: the user sees a still frame and cannot play it.
- Using the YouTube watch URL in an iframe.
- Forgetting the title on an iframe.
- Autoplaying with sound and expecting it to work.
- Giving audio/mp3 as the type.

## How your assignments are checked

The checker looks for the media elements and their attributes: controls, sources with the right type, a track with kind, srclang and label, an iframe with a title and the embed URL, or an svg with viewBox. Write real attributes; they cannot be satisfied by comments.`,
  questions: [
    hq(
      "Video player with fallbacks",
      "Add the course intro video with two formats and a poster image.",
      [
        "A video with controls, width 640, height 360 and a poster image",
        "Two sources: videos/intro.webm (video/webm) first, then videos/intro.mp4 (video/mp4)",
        "A fallback paragraph with a download link to the MP4",
      ],
      page("Intro video", String.raw`
  <video controls width="640" height="360" poster="images/intro-poster.jpg" preload="metadata">
    <source src="videos/intro.webm" type="video/webm">
    <source src="videos/intro.mp4" type="video/mp4">
    <p>Your browser cannot play this video. <a href="videos/intro.mp4">Download the video</a>.</p>
  </video>`),
      [
        el("video[controls]", "The video has controls"),
        el("video[poster]", "The video has a poster image"),
        el("video[width=640][height=360]", "The video is 640 by 360"),
        el('video > source[type="video/webm"]', "A WebM source"),
        el('video > source[type="video/mp4"]', "An MP4 source"),
        el('video a[href$=".mp4"]', "A fallback download link"),
      ],
    ),

    hq(
      "Podcast audio player",
      "Publish a podcast episode with an audio player and a transcript.",
      [
        "An h2 with the episode title",
        "An audio element with controls",
        "Two sources: an OGG file (audio/ogg) and an MP3 file (audio/mpeg)",
        "A fallback download link inside the audio element",
        "A details element with a summary Transcript and a paragraph of text",
      ],
      page("Podcast", String.raw`
  <h2>Episode 1: From Intern to Developer</h2>
  <audio controls preload="none">
    <source src="podcast/ep1.ogg" type="audio/ogg">
    <source src="podcast/ep1.mp3" type="audio/mpeg">
    <a href="podcast/ep1.mp3">Download episode 1 (MP3)</a>
  </audio>
  <details>
    <summary>Transcript</summary>
    <p>Welcome to the Inveon podcast. Today we talk about the first ninety days of a new developer.</p>
  </details>`),
      [
        el("audio[controls]", "An audio player with controls"),
        el('audio > source[type="audio/ogg"]', "An OGG source"),
        el('audio > source[type="audio/mpeg"]', "An MP3 source with the type audio/mpeg"),
        el("audio > a[href]", "A fallback download link"),
        el("details > summary", "A transcript section", { text: "Transcript" }),
        el('source[type="audio/mp3"]', "Does not use the invalid type audio/mp3", { max: 0 }),
      ],
    ),

    hq(
      "Background hero video",
      "Add a silent looping video behind a hero heading that autoplays on every browser, including iPhones.",
      [
        "A header with an h1 and a video",
        "The video has autoplay, muted, loop and playsinline",
        "A poster image for the moment before it starts",
        "One MP4 source",
      ],
      page("Hero video", String.raw`
  <header>
    <video autoplay muted loop playsinline poster="images/hero.jpg">
      <source src="videos/hero.mp4" type="video/mp4">
    </video>
    <h1>Build Real Projects</h1>
  </header>`),
      [
        el("video[autoplay][muted]", "Autoplay only works when muted"),
        el("video[loop]", "The video loops"),
        el("video[playsinline]", "playsinline for iPhones"),
        el("video[poster]", "A poster image"),
        el('video > source[type="video/mp4"]', "An MP4 source"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Video with subtitles",
      "Make a lecture video accessible with English and Hindi subtitles.",
      [
        "A video with controls and one MP4 source",
        'A track with kind="subtitles", src ending in .vtt, srclang="en", label="English" and default',
        'A second track with srclang="hi" and label="Hindi"',
      ],
      page("Lecture", String.raw`
  <video controls width="800" height="450">
    <source src="videos/lecture-1.mp4" type="video/mp4">
    <track kind="subtitles" src="captions/lecture-1-en.vtt" srclang="en" label="English" default>
    <track kind="subtitles" src="captions/lecture-1-hi.vtt" srclang="hi" label="Hindi">
  </video>`),
      [
        el("video[controls] > source", "A video with controls and a source"),
        el('video > track[kind=subtitles][src$=".vtt"]', "Subtitle tracks from .vtt files", { min: 2 }),
        el("track[srclang=en][label=English][default]", "The English track is the default"),
        el("track[srclang=hi][label]", "A Hindi track with a label"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Embed a YouTube video",
      "Embed a YouTube video the correct way.",
      [
        "An iframe whose src starts with https://www.youtube.com/embed/",
        "A title describing the video",
        "width 560 and height 315",
        'loading="lazy" and allowfullscreen',
      ],
      page("Campus tour", String.raw`
  <h1>Campus Tour</h1>
  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"
          title="Inveon campus tour video"
          width="560" height="315"
          loading="lazy"
          allow="accelerometer; encrypted-media; picture-in-picture"
          allowfullscreen></iframe>`),
      [
        el('iframe[src^="https://www.youtube.com/embed/"]', "The src uses the /embed/ URL"),
        el("iframe[title]", "The iframe has a title"),
        el("iframe[width=560][height=315]", "The iframe is 560 by 315"),
        el("iframe[loading=lazy]", "The iframe is lazy-loaded"),
        el("iframe[allowfullscreen]", "Full screen is allowed"),
        el('iframe[src*="watch?v="]', "Does not use the watch?v= URL", { max: 0 }),
      ],
    ),

    hq(
      "Embed a Google Map",
      "Show your office location on a map on the contact page.",
      [
        "A section with an h2 Find us",
        "An iframe whose src starts with https://www.google.com/maps/embed",
        'A title, width 600, height 450, loading="lazy" and referrerpolicy="no-referrer-when-downgrade"',
        "A link below the map to open it in Google Maps, for people who cannot use the frame",
      ],
      page("Find us", String.raw`
  <section>
    <h2>Find us</h2>
    <iframe src="https://www.google.com/maps/embed?pb=inveon-pune"
            title="Map showing the Inveon office on FC Road, Pune"
            width="600" height="450"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
    <p><a href="https://maps.google.com/?q=FC+Road+Pune">Open in Google Maps</a></p>
  </section>`),
      [
        el("section > h2", "A Find us heading", { text: "Find us" }),
        el('iframe[src^="https://www.google.com/maps/embed"]', "The map uses the embed URL"),
        el("iframe[title][width=600][height=450]", "A titled 600 by 450 map"),
        el("iframe[loading=lazy][referrerpolicy]", "Lazy-loaded with a referrer policy"),
        el('a[href*="maps"]', "A link to open the map in Google Maps"),
      ],
    ),

    hq(
      "Sandboxed third-party widget",
      "Embed an untrusted quiz widget from another site with the least permissions it needs.",
      [
        "An iframe with src https://quiz.example.com/widget and a title",
        'A sandbox attribute that allows only scripts and forms: sandbox="allow-scripts allow-forms"',
        "Do not allow same-origin, top navigation or pop-ups",
        "Set width 400 and height 300",
      ],
      page("Quiz widget", String.raw`
  <iframe src="https://quiz.example.com/widget"
          title="Daily coding quiz"
          sandbox="allow-scripts allow-forms"
          width="400" height="300"
          loading="lazy"></iframe>`),
      [
        el('iframe[src="https://quiz.example.com/widget"][title]', "A titled iframe for the widget"),
        el("iframe[sandbox*=allow-scripts][sandbox*=allow-forms]", "The sandbox allows scripts and forms"),
        el("iframe[sandbox*=allow-same-origin], iframe[sandbox*=allow-top-navigation], iframe[sandbox*=allow-popups]", "No same-origin, top navigation or pop-up permissions", { max: 0 }),
        el("iframe[width=400][height=300]", "The iframe is 400 by 300"),
      ],
      { level: "advanced" },
    ),

    hq(
      "Inline SVG icons",
      "Draw two small icons with inline SVG: one meaningful, one decorative.",
      [
        'A meaningful icon: an svg with viewBox="0 0 24 24", width and height 24, role="img" and a title element inside, drawing a circle',
        'A button with the text Download and a decorative svg inside it with aria-hidden="true"',
        "Use at least one circle and one path",
      ],
      page("Icons", String.raw`
  <p>
    Status:
    <svg width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="done-title">
      <title id="done-title">Completed</title>
      <circle cx="12" cy="12" r="10" fill="green"></circle>
    </svg>
  </p>
  <button type="button">
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16" stroke="currentColor" stroke-width="2" fill="none"></path>
    </svg>
    Download
  </button>`),
      [
        el("svg[viewbox][width=24][height=24]", "A 24 by 24 svg with a viewBox"),
        el("svg[role=img] > title", "The meaningful icon has role=img and a title"),
        el("svg circle", "The icon draws a circle"),
        el("button svg[aria-hidden=true]", "The decorative icon in the button is hidden from screen readers"),
        el("svg path", "At least one path"),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Media gallery page",
      "Build a media gallery that mixes a video, an audio clip and an embedded frame, each with a caption.",
      [
        "Inside main, a section with an h2 Media gallery",
        "A figure with a video (controls, an MP4 source and an English subtitle track) and a figcaption",
        "A figure with an audio element (controls and an MP3 source) and a figcaption",
        "A figure with a titled, lazy-loaded YouTube embed iframe and a figcaption",
      ],
      page("Media gallery", String.raw`
  <main>
    <section>
      <h2>Media gallery</h2>
      <figure>
        <video controls width="640" height="360" poster="images/demo-day.jpg">
          <source src="videos/demo-day.mp4" type="video/mp4">
          <track kind="captions" src="captions/demo-day-en.vtt" srclang="en" label="English">
        </video>
        <figcaption>Demo day 2026: interns present their projects.</figcaption>
      </figure>
      <figure>
        <audio controls>
          <source src="audio/welcome.mp3" type="audio/mpeg">
        </audio>
        <figcaption>A welcome message from our CEO.</figcaption>
      </figure>
      <figure>
        <iframe src="https://www.youtube.com/embed/abc123XYZ" title="Office tour" width="560" height="315" loading="lazy" allowfullscreen></iframe>
        <figcaption>Take a tour of our Pune office.</figcaption>
      </figure>
    </section>
  </main>`),
      [
        el("main > section > h2", "A gallery heading"),
        el("figure > video[controls] > track[srclang=en]", "A captioned video in a figure"),
        el('figure > audio[controls] > source[type="audio/mpeg"]', "An MP3 audio player in a figure"),
        el('figure > iframe[title][loading=lazy][src*="/embed/"]', "A titled, lazy YouTube embed in a figure"),
        el("figure > figcaption", "Three captions", { min: 3 }),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "What happens if a <video> has neither controls nor autoplay?", options: ["It plays automatically", "It shows a still frame and the user has no way to play it (without JavaScript)", "The browser adds controls", "It is invalid HTML"], answer: 1, why: "Without controls, the user has no built-in play button." },
    { q: "Why list several <source> elements in a video?", options: ["To play them one after another", "So the browser picks the first format it supports", "To show a playlist", "For different screen sizes only"], answer: 1, why: "The browser plays the first source it can decode." },
    { q: "What is the correct MIME type for an MP3 source?", options: ["audio/mp3", "audio/mpeg", "audio/mpeg3", "video/mp3"], answer: 1, why: "MP3 files are audio/mpeg." },
    { q: "Why does a hero video need muted to autoplay?", options: ["Muted videos load faster", "Browsers block autoplay with sound", "Autoplay requires loop", "It is only needed on Firefox"], answer: 1, why: "Autoplay policies allow muted autoplay but block sound until the user interacts." },
    { q: "Which element adds subtitles or captions to a video?", options: ["<caption>", "<subtitle>", "<track>", "<figcaption>"], answer: 2, why: "track loads a WebVTT file with timed text." },
    { q: "Which attribute is required on an iframe for accessibility?", options: ["name", "title", "alt", "aria-hidden"], answer: 1, why: "The title tells screen reader users what the frame contains." },
    { q: "Why does https://www.youtube.com/watch?v=ID not work as an iframe src?", options: ["YouTube needs HTTP", "The watch page refuses to be framed; use the /embed/ URL", "iframes cannot load videos", "The ID must be in a data attribute"], answer: 1, why: "YouTube's watch page sends headers that block framing; the embed page is made for it." },
    { q: "What does an empty sandbox attribute on an iframe do?", options: ["Nothing", "Applies all restrictions: no scripts, forms, pop-ups or same-origin access", "Allows everything", "Blocks only pop-ups"], answer: 1, why: "An empty sandbox is the most restrictive; each allow- token lifts one restriction." },
    { q: "Why is sandbox=\"allow-scripts allow-same-origin\" risky for content from your own domain?", options: ["It is not risky", "The framed page can use script to remove its own sandbox attribute", "It blocks all scripts", "It makes the frame invisible"], answer: 1, why: "With both tokens, same-origin script can reach into the parent and escape the sandbox." },
    { q: "An inline SVG icon sits next to the visible text \"Delete\" inside a button. What should the SVG have?", options: ["role=\"img\" and a title \"Delete\"", "aria-hidden=\"true\", because the text already names the button", "alt=\"Delete\"", "Nothing; SVGs are ignored by screen readers"], answer: 1, why: "Hiding the decorative icon avoids reading \"Delete\" twice; svg has no alt attribute." },
  ],
};
