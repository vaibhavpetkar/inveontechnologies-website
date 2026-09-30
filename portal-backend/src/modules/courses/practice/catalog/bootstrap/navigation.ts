import type { PracticeUnit } from "../../types.js";
import { bq, el, page } from "./shared.js";

export const navigation: PracticeUnit = {
  key: "navigation",
  title: "Navigation: navbars, tabs, breadcrumbs and pagination",
  summary: "responsive navbars with a collapsing menu, nav tabs and pills, tab panels, breadcrumbs, pagination and offcanvas menus",
  reading: String.raw`## The navbar

The navbar is the menu bar at the top of most sites. On a laptop it shows every link; on a phone it folds into a "hamburger" button. That folding is done by the collapse plugin, so the JavaScript bundle must be on the page.

` + "```html" + String.raw`
<nav class="navbar navbar-expand-lg bg-body-tertiary">
  <div class="container">
    <a class="navbar-brand" href="/">Inveon</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
            data-bs-target="#mainNav" aria-controls="mainNav"
            aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="mainNav">
      <ul class="navbar-nav ms-auto">
        <li class="nav-item"><a class="nav-link active" aria-current="page" href="/">Home</a></li>
        <li class="nav-item"><a class="nav-link" href="/courses">Courses</a></li>
      </ul>
    </div>
  </div>
</nav>
` + "```" + String.raw`

How the pieces fit:

- navbar-expand-lg: the menu is expanded from lg up and collapsed below. Use navbar-expand-md to expand earlier, or plain navbar-expand to never collapse.
- navbar-brand: your logo or name.
- navbar-toggler: the hamburger button. Its data-bs-target must point at the id of the collapse div (#mainNav and id="mainNav"). A typo here is the number one reason a menu will not open.
- collapse navbar-collapse: the part that hides on small screens.
- navbar-nav with nav-item and nav-link: the links. ms-auto pushes them to the right.
- active plus aria-current="page" marks the current page.

For a dark navbar in Bootstrap 5.3, add data-bs-theme="dark" to the nav together with a dark background such as bg-dark or bg-primary. (navbar-dark from older versions still works but is deprecated.) Add fixed-top or sticky-top to keep it on screen while scrolling; with fixed-top, give the body some top padding so content is not hidden underneath.

## Navs: tabs and pills

The same nav component draws tabs and pills:

- ul.nav.nav-tabs with li.nav-item and a.nav-link: folder-style tabs.
- nav-pills: rounded buttons instead of tabs.
- nav-fill or nav-justified: items share the full width.
- flex-column on the nav: a vertical menu.

To switch content without reloading, turn the links into tab buttons and add panes:

` + "```html" + String.raw`
<ul class="nav nav-tabs" role="tablist">
  <li class="nav-item" role="presentation">
    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#home-pane" type="button" role="tab">Home</button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#profile-pane" type="button" role="tab">Profile</button>
  </li>
</ul>
<div class="tab-content">
  <div class="tab-pane fade show active" id="home-pane" role="tabpanel">Home content</div>
  <div class="tab-pane fade" id="profile-pane" role="tabpanel">Profile content</div>
</div>
` + "```" + String.raw`

The first pane needs show active so something is visible on load.

## Breadcrumbs

Breadcrumbs show where the page sits in the site: nav aria-label="breadcrumb" wrapping an ol.breadcrumb of li.breadcrumb-item. The last item is the current page: add active and aria-current="page" and do not make it a link. Bootstrap adds the / separators with CSS.

## Pagination

ul.pagination with li.page-item and a.page-link. Mark the current page with active (and aria-current="page"), and a missing previous page with disabled. pagination-sm and pagination-lg change the size; justify-content-center on the ul centres it. Wrap it in nav aria-label="Page navigation".

## Offcanvas

An offcanvas is a side drawer, great for mobile menus and filters. A button with data-bs-toggle="offcanvas" and data-bs-target="#filters" opens div.offcanvas.offcanvas-start id="filters" (use offcanvas-end for the right side). Inside go offcanvas-header (with a title and a btn-close with data-bs-dismiss="offcanvas") and offcanvas-body.

## Common mistakes

- data-bs-target="#menu" but id="mainMenu": the button targets nothing.
- Using Bootstrap 4 attributes (data-toggle, data-target): Bootstrap 5 ignores them.
- Forgetting the JS bundle: the hamburger shows but never opens.
- Putting nav-link directly in navbar-nav without nav-item. It works visually, but keep the structure consistent.

## How your assignments are checked

The checker parses your page and follows the structure: a nav.navbar with a navbar-toggler whose data-bs-target matches the id of the .navbar-collapse, links inside .navbar-nav, the right aria attributes, and the text of each link. Write ids and targets exactly as the question asks.`,
  questions: [
    bq(
      "Simple navbar with a brand",
      "Build a navbar that is always expanded, with a brand and three links.",
      [
        "A nav.navbar.navbar-expand.bg-body-tertiary",
        "Inside a .container-fluid: an a.navbar-brand saying Inveon",
        "A ul.navbar-nav with three li.nav-item > a.nav-link: Home, Courses, Contact",
        "Home is active with aria-current=\"page\"",
      ],
      page("Navbar", `  <nav class="navbar navbar-expand bg-body-tertiary">
    <div class="container-fluid">
      <a class="navbar-brand" href="/">Inveon</a>
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link active" aria-current="page" href="/">Home</a></li>
        <li class="nav-item"><a class="nav-link" href="/courses">Courses</a></li>
        <li class="nav-item"><a class="nav-link" href="/contact">Contact</a></li>
      </ul>
    </div>
  </nav>
`),
      [
        el("nav.navbar.navbar-expand", "Has a nav.navbar.navbar-expand"),
        el(".navbar a.navbar-brand", "Has a brand link", { text: "Inveon" }),
        el(".navbar-nav > li.nav-item > a.nav-link", "Has three nav links", { min: 3 }),
        el('a.nav-link.active[aria-current="page"]', "Home is active with aria-current", { text: "Home" }),
      ],
    ),
    bq(
      "Responsive navbar with collapse",
      "Build a navbar that collapses into a hamburger menu below lg.",
      [
        "A nav.navbar.navbar-expand-lg.bg-body-tertiary with a .container inside",
        "An a.navbar-brand saying Campus",
        "A button.navbar-toggler with data-bs-toggle=\"collapse\", data-bs-target=\"#mainNav\", aria-controls=\"mainNav\", aria-expanded=\"false\", aria-label, and a span.navbar-toggler-icon",
        "A div.collapse.navbar-collapse with id=\"mainNav\" holding a ul.navbar-nav.ms-auto with links About and Events",
      ],
      page("Responsive navbar", `  <nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
      <a class="navbar-brand" href="/">Campus</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item"><a class="nav-link" href="/about">About</a></li>
          <li class="nav-item"><a class="nav-link" href="/events">Events</a></li>
        </ul>
      </div>
    </div>
  </nav>
`),
      [
        el("nav.navbar.navbar-expand-lg", "The navbar expands from lg"),
        el('button.navbar-toggler[data-bs-toggle="collapse"][data-bs-target="#mainNav"][aria-controls="mainNav"][aria-label]', "The toggler targets #mainNav and is labelled"),
        el(".navbar-toggler > span.navbar-toggler-icon", "The toggler shows the hamburger icon"),
        el("div.collapse.navbar-collapse#mainNav", "The collapse div has id=\"mainNav\""),
        el("#mainNav ul.navbar-nav.ms-auto a.nav-link", "The links are right-aligned inside the collapse", { min: 2 }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Dark sticky navbar",
      "Make a dark navbar that stays at the top while the page scrolls.",
      [
        "A nav.navbar.navbar-expand-md.bg-dark.sticky-top with data-bs-theme=\"dark\"",
        "A brand Shopkart, a toggler targeting #shopNav, and a div.collapse.navbar-collapse#shopNav",
        "The nav has links Deals and Cart",
      ],
      page("Dark navbar", `  <nav class="navbar navbar-expand-md bg-dark sticky-top" data-bs-theme="dark">
    <div class="container">
      <a class="navbar-brand" href="/">Shopkart</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#shopNav" aria-controls="shopNav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="shopNav">
        <ul class="navbar-nav">
          <li class="nav-item"><a class="nav-link" href="/deals">Deals</a></li>
          <li class="nav-item"><a class="nav-link" href="/cart">Cart</a></li>
        </ul>
      </div>
    </div>
  </nav>
`),
      [
        el('nav.navbar.navbar-expand-md.bg-dark.sticky-top[data-bs-theme="dark"]', "The navbar is dark (bg-dark with data-bs-theme=\"dark\") and sticky"),
        el('.navbar-toggler[data-bs-target="#shopNav"]', "The toggler targets #shopNav"),
        el(".navbar-collapse#shopNav .nav-link", "The collapse #shopNav holds the links", { min: 2 }),
        el(".navbar-brand", "Has the Shopkart brand", { text: "Shopkart" }),
      ],
      { level: "intermediate" },
    ),
    bq(
      "Nav tabs and pills",
      "Show the same three links as tabs and as full-width pills.",
      [
        "A ul.nav.nav-tabs with three li.nav-item > a.nav-link: Overview, Syllabus, Reviews (Overview active)",
        "A ul.nav.nav-pills.nav-fill with the same three links (Syllabus active)",
        "Mark active links with aria-current=\"page\"",
      ],
      page("Tabs", `  <div class="container py-3">
    <ul class="nav nav-tabs mb-4">
      <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Overview</a></li>
      <li class="nav-item"><a class="nav-link" href="#">Syllabus</a></li>
      <li class="nav-item"><a class="nav-link" href="#">Reviews</a></li>
    </ul>
    <ul class="nav nav-pills nav-fill">
      <li class="nav-item"><a class="nav-link" href="#">Overview</a></li>
      <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Syllabus</a></li>
      <li class="nav-item"><a class="nav-link" href="#">Reviews</a></li>
    </ul>
  </div>
`),
      [
        el("ul.nav.nav-tabs > li.nav-item > a.nav-link", "The tabs have three links", { min: 3 }),
        el(".nav-tabs a.nav-link.active", "Overview is the active tab", { text: "Overview" }),
        el("ul.nav.nav-pills.nav-fill > li.nav-item > a.nav-link", "The full-width pills have three links", { min: 3 }),
        el(".nav-pills a.nav-link.active[aria-current=\"page\"]", "Syllabus is the active pill", { text: "Syllabus" }),
      ],
    ),
    bq(
      "Breadcrumb trail",
      "Show where the user is: Home / Courses / Bootstrap.",
      [
        "A nav with aria-label=\"breadcrumb\" containing an ol.breadcrumb",
        "Home and Courses are li.breadcrumb-item with links",
        "Bootstrap is the last li.breadcrumb-item with active and aria-current=\"page\", and is not a link",
      ],
      page("Breadcrumb", `  <div class="container py-3">
    <nav aria-label="breadcrumb">
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="/">Home</a></li>
        <li class="breadcrumb-item"><a href="/courses">Courses</a></li>
        <li class="breadcrumb-item active" aria-current="page">Bootstrap</li>
      </ol>
    </nav>
  </div>
`),
      [
        el('nav[aria-label="breadcrumb"] > ol.breadcrumb', "Has a labelled nav with an ol.breadcrumb"),
        el("ol.breadcrumb > li.breadcrumb-item > a[href]", "Home and Courses are links", { min: 2 }),
        el('li.breadcrumb-item.active[aria-current="page"]', "The current page is the active item", { text: "Bootstrap" }),
        el("li.breadcrumb-item.active a", "The current page is not a link", { min: 0, max: 0 }),
      ],
    ),
    bq(
      "Centred pagination",
      "Build a centred pager for search results where page 2 is current and Previous is unavailable.",
      [
        "A nav with aria-label=\"Page navigation\" holding a ul.pagination.justify-content-center",
        "li.page-item > a.page-link for: Previous, 1, 2, 3, Next",
        "Previous is disabled; page 2 is active with aria-current=\"page\"",
      ],
      page("Pagination", `  <div class="container py-3">
    <nav aria-label="Page navigation">
      <ul class="pagination justify-content-center">
        <li class="page-item disabled"><a class="page-link" href="#" aria-disabled="true">Previous</a></li>
        <li class="page-item"><a class="page-link" href="?page=1">1</a></li>
        <li class="page-item active"><a class="page-link" href="?page=2" aria-current="page">2</a></li>
        <li class="page-item"><a class="page-link" href="?page=3">3</a></li>
        <li class="page-item"><a class="page-link" href="?page=3">Next</a></li>
      </ul>
    </nav>
  </div>
`),
      [
        el("nav[aria-label] > ul.pagination.justify-content-center", "Has a centred pagination in a labelled nav"),
        el("ul.pagination > li.page-item > a.page-link", "Has five page links", { min: 5 }),
        el("li.page-item.disabled", "Previous is disabled", { text: "Previous" }),
        el("li.page-item.active > a[aria-current=\"page\"]", "Page 2 is active", { text: "2" }),
      ],
    ),
    bq(
      "Vertical pill menu",
      "Build a vertical settings menu using nav pills.",
      [
        "A nav.nav.nav-pills.flex-column",
        "Four a.nav-link items: Account, Security, Notifications, Privacy",
        "Account is active with aria-current=\"page\"",
      ],
      page("Settings", `  <div class="container py-3">
    <nav class="nav nav-pills flex-column">
      <a class="nav-link active" aria-current="page" href="#account">Account</a>
      <a class="nav-link" href="#security">Security</a>
      <a class="nav-link" href="#notifications">Notifications</a>
      <a class="nav-link" href="#privacy">Privacy</a>
    </nav>
  </div>
`),
      [
        el("nav.nav.nav-pills.flex-column", "The menu is a vertical pill nav"),
        el(".nav-pills > a.nav-link", "Has four menu links", { min: 4 }),
        el(".nav-pills > a.nav-link.active", "Account is active", { text: "Account" }),
      ],
    ),
    bq(
      "Tabs that switch content",
      "Make two tabs that switch between panes without reloading the page.",
      [
        "A ul.nav.nav-tabs with role=\"tablist\" holding two button.nav-link with data-bs-toggle=\"tab\" and role=\"tab\"",
        "The first button (Details, active) targets #details-pane, the second (Reviews) targets #reviews-pane",
        "A div.tab-content with div.tab-pane#details-pane (fade show active) and div.tab-pane#reviews-pane (fade), both role=\"tabpanel\"",
      ],
      page("Tab panes", `  <div class="container py-3">
    <ul class="nav nav-tabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#details-pane" type="button" role="tab" aria-controls="details-pane" aria-selected="true">Details</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#reviews-pane" type="button" role="tab" aria-controls="reviews-pane" aria-selected="false">Reviews</button>
      </li>
    </ul>
    <div class="tab-content pt-3">
      <div class="tab-pane fade show active" id="details-pane" role="tabpanel">A 6-week course on responsive design.</div>
      <div class="tab-pane fade" id="reviews-pane" role="tabpanel">4.8 out of 5 from 320 learners.</div>
    </div>
  </div>
`),
      [
        el('ul.nav.nav-tabs[role="tablist"] button.nav-link[data-bs-toggle="tab"][role="tab"]', "Has two tab buttons with data-bs-toggle=\"tab\"", { min: 2 }),
        el('button.nav-link.active[data-bs-target="#details-pane"]', "The active Details tab targets #details-pane", { text: "Details" }),
        el('button[data-bs-target="#reviews-pane"]', "The Reviews tab targets #reviews-pane", { text: "Reviews" }),
        el('.tab-content > .tab-pane.fade.show.active#details-pane[role="tabpanel"]', "The details pane is shown on load"),
        el('.tab-content > .tab-pane.fade#reviews-pane[role="tabpanel"]', "The reviews pane exists"),
      ],
      { level: "advanced" },
    ),
    bq(
      "Offcanvas filter drawer",
      "Add a button that slides in a filter panel from the left.",
      [
        "A button.btn.btn-outline-primary with data-bs-toggle=\"offcanvas\", data-bs-target=\"#filters\" and aria-controls=\"filters\" saying Filters",
        "A div.offcanvas.offcanvas-start with id=\"filters\", tabindex=\"-1\" and aria-labelledby=\"filtersLabel\"",
        "An offcanvas-header with an h5.offcanvas-title#filtersLabel Filters and a btn-close with data-bs-dismiss=\"offcanvas\" and aria-label",
        "An offcanvas-body with at least two filter options",
      ],
      page("Offcanvas", `  <div class="container py-3">
    <button class="btn btn-outline-primary" type="button" data-bs-toggle="offcanvas" data-bs-target="#filters" aria-controls="filters">Filters</button>
  </div>
  <div class="offcanvas offcanvas-start" tabindex="-1" id="filters" aria-labelledby="filtersLabel">
    <div class="offcanvas-header">
      <h5 class="offcanvas-title" id="filtersLabel">Filters</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <p>Price: under Rs 1,000</p>
      <p>Rating: 4 stars and up</p>
    </div>
  </div>
`),
      [
        el('button[data-bs-toggle="offcanvas"][data-bs-target="#filters"]', "The button opens #filters"),
        el('div.offcanvas.offcanvas-start#filters[aria-labelledby="filtersLabel"]', "The drawer is an offcanvas-start with id filters"),
        el(".offcanvas-header > .offcanvas-title#filtersLabel", "The header has a title with id filtersLabel"),
        el('.offcanvas-header > .btn-close[data-bs-dismiss="offcanvas"][aria-label]', "The header has a labelled close button"),
        el(".offcanvas > .offcanvas-body p", "The body has filter options", { min: 2 }),
      ],
      { level: "advanced" },
    ),
    bq(
      "Navbar with an offcanvas menu",
      "Build a navbar whose mobile menu opens as an offcanvas drawer from the right instead of dropping down.",
      [
        "A nav.navbar.navbar-expand-lg.bg-body-tertiary with a .container-fluid",
        "A brand Inveon and a button.navbar-toggler with data-bs-toggle=\"offcanvas\" and data-bs-target=\"#sideMenu\"",
        "A div.offcanvas.offcanvas-end#sideMenu with an offcanvas-header (title and close button) and an offcanvas-body holding ul.navbar-nav with links Home, Jobs, Blog",
      ],
      page("Offcanvas navbar", `  <nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container-fluid">
      <a class="navbar-brand" href="/">Inveon</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#sideMenu" aria-controls="sideMenu" aria-label="Open menu">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="offcanvas offcanvas-end" tabindex="-1" id="sideMenu" aria-labelledby="sideMenuLabel">
        <div class="offcanvas-header">
          <h5 class="offcanvas-title" id="sideMenuLabel">Menu</h5>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
        </div>
        <div class="offcanvas-body">
          <ul class="navbar-nav ms-auto">
            <li class="nav-item"><a class="nav-link" href="/">Home</a></li>
            <li class="nav-item"><a class="nav-link" href="/jobs">Jobs</a></li>
            <li class="nav-item"><a class="nav-link" href="/blog">Blog</a></li>
          </ul>
        </div>
      </div>
    </div>
  </nav>
`),
      [
        el("nav.navbar.navbar-expand-lg", "Has a navbar that expands from lg"),
        el('.navbar-toggler[data-bs-toggle="offcanvas"][data-bs-target="#sideMenu"]', "The toggler opens the offcanvas #sideMenu"),
        el(".navbar .offcanvas.offcanvas-end#sideMenu", "The menu is an offcanvas-end inside the navbar"),
        el("#sideMenu .offcanvas-body .navbar-nav a.nav-link", "The offcanvas body has three nav links", { min: 3 }),
        el('#sideMenu .btn-close[data-bs-dismiss="offcanvas"]', "The drawer can be closed"),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "What does navbar-expand-md mean?", options: ["The navbar is always collapsed", "The menu is expanded from md (768px) up and collapsed below", "The navbar is medium height", "The navbar is expanded only on md screens"], answer: 1, why: "navbar-expand-{bp} shows the full menu from that breakpoint up; below it the toggler is used." },
    { q: "Which class goes on the logo or site name in a navbar?", options: ["navbar-logo", "navbar-brand", "nav-brand", "brand"], answer: 1, why: "navbar-brand styles the name or logo." },
    { q: "Which attribute tells the toggler which element to show and hide?", options: ["href", "data-bs-target", "aria-expanded", "data-bs-parent"], answer: 1, why: "data-bs-target holds a selector (like #mainNav) for the collapse element." },
    { q: "How do you show that a link is the current page, for both sighted and screen reader users?", options: ["Bold text only", "class=\"active\" and aria-current=\"page\"", "disabled", "aria-selected=\"true\" only"], answer: 1, why: "active styles it, aria-current=\"page\" announces it." },
    { q: "Which list element does a breadcrumb use?", options: ["ul.breadcrumb", "ol.breadcrumb", "div.breadcrumb", "nav.breadcrumb only"], answer: 1, why: "Breadcrumbs are an ordered path, so Bootstrap uses an ol." },
    { q: "Which class makes nav pills share the full width equally?", options: ["nav-wide", "nav-justified", "w-100 only", "nav-stretch"], answer: 1, why: "nav-justified makes equal-width items; nav-fill fills the width with proportionally sized items." },
    { q: "In Bootstrap 5.3, what is the recommended way to get light text in a navbar with a dark background?", options: ["navbar-light", "data-bs-theme=\"dark\" on the nav", "text-dark", "navbar-inverse"], answer: 1, why: "5.3 uses colour modes; data-bs-theme=\"dark\" switches the navbar's colours. navbar-dark is deprecated." },
    { q: "The hamburger button appears on a phone but tapping it does nothing. The markup has data-bs-target=\"#nav\" and <div class=\"collapse navbar-collapse\" id=\"navbar\">. What is wrong?", options: ["The toggler needs btn-primary", "The target #nav does not match the id navbar", "collapse needs show", "navbar-collapse must be a ul"], answer: 1, why: "The toggler looks for an element with id nav; none exists, so nothing toggles." },
    { q: "You copied a Bootstrap 4 navbar with data-toggle=\"collapse\" and data-target=\"#menu\" into a Bootstrap 5 page. What happens?", options: ["It works the same", "The menu will not open: Bootstrap 5 listens for data-bs-toggle and data-bs-target", "Only the brand disappears", "The CSS breaks but JS works"], answer: 1, why: "Bootstrap 5 namespaced its data attributes with bs, so the old ones are ignored." },
    { q: "Your tabs switch correctly, but when the page loads no pane content is visible. What is missing?", options: ["role=\"tablist\"", "show active on the first .tab-pane", "data-bs-parent", "A tab-content id"], answer: 1, why: "Panes are hidden unless they have active (and show when using fade), so the first pane needs both on load." },
  ],
};
