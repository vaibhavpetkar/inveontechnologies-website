import type { ExerciseSeed } from "../types.js";

const CSS = `<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">`;
const JS = `<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>`;

/** A Bootstrap 5 page around the given body markup (stylesheet included, JS bundle optional). */
const page = (title: string, body: string, withJs = false) =>
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${title}</title>\n  ${CSS}\n</head>\n<body>\n${body}\n${withJs ? `  ${JS}\n` : ""}</body>\n</html>\n`;

export default [
  {
    title: "Container with three columns",
    brief: "Use the Bootstrap grid to show three equal columns on medium screens and up, stacked on phones.",
    steps: [
      "A div with class container",
      "Inside it a div with class row",
      "Inside the row, 3 divs with class col-md-4, each with some text",
    ],
    level: "basic",
    editor: "html",
    starter: page("Grid", `  <div>\n    <!-- Build the container, row and three columns -->\n  </div>`),
    solution: page(
      "Grid",
      `  <div class="container">\n    <div class="row">\n      <div class="col-md-4">Fast</div>\n      <div class="col-md-4">Simple</div>\n      <div class="col-md-4">Responsive</div>\n    </div>\n  </div>`,
    ),
    check: {
      rules: [
        { html: ".container", message: "A .container element" },
        { html: ".container > .row", message: "A .row directly inside the container" },
        { html: ".row > .col-md-4", min: 3, message: "Three .col-md-4 columns inside the row" },
        { html: ".row > .col-md-4", text: "\\w", min: 3, message: "Each column has some text" },
      ],
    },
  },
  {
    title: "Button variations",
    brief: "Show a set of Bootstrap buttons in different colours and sizes.",
    steps: [
      "A button with classes btn btn-primary",
      "A button with classes btn btn-outline-secondary",
      "A large button (btn btn-success btn-lg)",
      "A link styled as a button: an a element with classes btn btn-danger btn-sm",
    ],
    level: "basic",
    editor: "html",
    starter: page("Buttons", `  <div class="container py-4">\n    <button>Save</button>\n  </div>`),
    solution: page(
      "Buttons",
      `  <div class="container py-4">\n    <button type="button" class="btn btn-primary">Save</button>\n    <button type="button" class="btn btn-outline-secondary">Cancel</button>\n    <button type="button" class="btn btn-success btn-lg">Publish</button>\n    <a href="#" class="btn btn-danger btn-sm">Delete</a>\n  </div>`,
    ),
    check: {
      rules: [
        { html: "button.btn.btn-primary", message: "A btn btn-primary button" },
        { html: "button.btn.btn-outline-secondary", message: "A btn btn-outline-secondary button" },
        { html: ".btn.btn-success.btn-lg", message: "A large btn btn-success btn-lg button" },
        { html: "a.btn.btn-danger.btn-sm", message: "A link styled btn btn-danger btn-sm" },
      ],
    },
  },
  {
    title: "Alert messages",
    brief: "Show a success alert and a dismissible danger alert using Bootstrap alert classes.",
    steps: [
      "A div with classes alert alert-success and role=\"alert\"",
      "A div with classes alert alert-danger alert-dismissible",
      "Inside the danger alert, a button with class btn-close and data-bs-dismiss=\"alert\"",
      "Include the Bootstrap JS bundle script so the close button works",
    ],
    level: "basic",
    editor: "html",
    starter: page("Alerts", `  <div class="container py-4">\n    <div>Saved!</div>\n    <div>Something went wrong.</div>\n  </div>`),
    solution: page(
      "Alerts",
      `  <div class="container py-4">\n    <div class="alert alert-success" role="alert">Saved!</div>\n    <div class="alert alert-danger alert-dismissible fade show" role="alert">\n      Something went wrong.\n      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>\n    </div>\n  </div>`,
      true,
    ),
    check: {
      rules: [
        { html: ".alert.alert-success[role=alert]", message: "An alert alert-success with role=\"alert\"" },
        { html: ".alert.alert-danger.alert-dismissible", message: "A dismissible alert alert-danger" },
        { html: ".alert-dismissible button.btn-close[data-bs-dismiss=alert]", message: "A btn-close button with data-bs-dismiss=\"alert\"" },
        { html: "script[src*=bootstrap]", message: "The Bootstrap JS bundle is included" },
      ],
    },
  },
  {
    title: "Profile card",
    brief: "Build a Bootstrap card with an image on top, a title, some text and a button.",
    steps: [
      "A div with class card (you may add style=\"width: 18rem\")",
      "An img with class card-img-top and an alt",
      "A div card-body holding an h5 card-title and a p card-text",
      "A link with classes btn btn-primary inside the card-body",
    ],
    level: "basic",
    editor: "html",
    starter: page("Card", `  <div class="container py-4">\n    <div>\n      <img src="me.jpg">\n      <h5>Asha</h5>\n      <p>Frontend intern</p>\n    </div>\n  </div>`),
    solution: page(
      "Card",
      `  <div class="container py-4">\n    <div class="card" style="width: 18rem;">\n      <img src="me.jpg" class="card-img-top" alt="Asha smiling">\n      <div class="card-body">\n        <h5 class="card-title">Asha</h5>\n        <p class="card-text">Frontend intern who loves clean layouts.</p>\n        <a href="#" class="btn btn-primary">View profile</a>\n      </div>\n    </div>\n  </div>`,
    ),
    check: {
      rules: [
        { html: ".card", message: "A .card element" },
        { html: ".card img.card-img-top[alt]", message: "An img.card-img-top with alt text" },
        { html: ".card .card-body h5.card-title", message: "An h5.card-title in the card-body" },
        { html: ".card .card-body p.card-text", message: "A p.card-text in the card-body" },
        { html: ".card-body .btn.btn-primary", message: "A btn btn-primary in the card-body" },
      ],
    },
  },
  {
    title: "Collapsible navbar",
    brief: "Build a Bootstrap navbar that collapses into a toggler (hamburger) button on small screens.",
    steps: [
      "A nav with classes navbar navbar-expand-lg, containing an a with class navbar-brand",
      "A button.navbar-toggler with data-bs-toggle=\"collapse\" and data-bs-target=\"#mainNav\"",
      "A div with classes collapse navbar-collapse and id=\"mainNav\"",
      "Inside it a ul.navbar-nav with at least 3 li.nav-item holding a.nav-link, plus the Bootstrap JS bundle script",
    ],
    level: "intermediate",
    editor: "html",
    starter: page("Navbar", `  <nav>\n    <a href="#">Inveon</a>\n    <ul>\n      <li><a href="#">Home</a></li>\n    </ul>\n  </nav>`),
    solution: page(
      "Navbar",
      `  <nav class="navbar navbar-expand-lg bg-body-tertiary">\n    <div class="container-fluid">\n      <a class="navbar-brand" href="#">Inveon</a>\n      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">\n        <span class="navbar-toggler-icon"></span>\n      </button>\n      <div class="collapse navbar-collapse" id="mainNav">\n        <ul class="navbar-nav">\n          <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Home</a></li>\n          <li class="nav-item"><a class="nav-link" href="#">Courses</a></li>\n          <li class="nav-item"><a class="nav-link" href="#">Contact</a></li>\n        </ul>\n      </div>\n    </div>\n  </nav>`,
      true,
    ),
    check: {
      rules: [
        { html: "nav.navbar.navbar-expand-lg", message: "A nav with navbar navbar-expand-lg" },
        { html: ".navbar a.navbar-brand", message: "An a.navbar-brand inside the navbar" },
        { html: "button.navbar-toggler[data-bs-toggle=collapse][data-bs-target=#mainNav]", message: "A navbar-toggler targeting #mainNav" },
        { html: ".collapse.navbar-collapse#mainNav", message: "A collapse navbar-collapse div with id=\"mainNav\"" },
        { html: "#mainNav ul.navbar-nav li.nav-item a.nav-link", min: 3, message: "At least 3 nav-item links in a navbar-nav" },
        { html: "script[src*=bootstrap]", message: "The Bootstrap JS bundle is included" },
      ],
    },
  },
  {
    title: "Login form",
    brief: "Build a login form styled with Bootstrap form classes.",
    steps: [
      "Each field in a div with class mb-3, with a label.form-label",
      "An input type=\"email\" and an input type=\"password\", both with class form-control",
      "A div.form-check with an input.form-check-input type=\"checkbox\" ('Remember me')",
      "A button type=\"submit\" with classes btn btn-primary",
    ],
    level: "intermediate",
    editor: "html",
    starter: page("Login", `  <div class="container py-4">\n    <form>\n      <input type="email">\n      <input type="password">\n      <button>Log in</button>\n    </form>\n  </div>`),
    solution: page(
      "Login",
      `  <div class="container py-4">\n    <form>\n      <div class="mb-3">\n        <label for="email" class="form-label">Email</label>\n        <input type="email" class="form-control" id="email">\n      </div>\n      <div class="mb-3">\n        <label for="password" class="form-label">Password</label>\n        <input type="password" class="form-control" id="password">\n      </div>\n      <div class="mb-3 form-check">\n        <input type="checkbox" class="form-check-input" id="remember">\n        <label class="form-check-label" for="remember">Remember me</label>\n      </div>\n      <button type="submit" class="btn btn-primary">Log in</button>\n    </form>\n  </div>`,
    ),
    check: {
      rules: [
        { html: "form .mb-3 label.form-label", min: 2, message: "Fields wrapped in .mb-3 with a label.form-label" },
        { html: "input.form-control[type=email]", message: "An email input with class form-control" },
        { html: "input.form-control[type=password]", message: "A password input with class form-control" },
        { html: ".form-check input.form-check-input[type=checkbox]", message: "A form-check checkbox" },
        { html: "form button.btn.btn-primary[type=submit]", message: "A btn btn-primary submit button" },
      ],
    },
  },
  {
    title: "Spacing and text utilities",
    brief: "Style a welcome banner using only Bootstrap utility classes, no custom CSS.",
    steps: [
      "A section with classes bg-light, p-4 and rounded",
      "An h1 inside it with classes text-center and fw-bold",
      "A p inside it with classes text-muted and mt-3",
      "No style attribute and no style tag",
    ],
    level: "intermediate",
    editor: "html",
    starter: page("Banner", `  <section style="background: #eee; padding: 24px;">\n    <h1 style="text-align: center;">Welcome</h1>\n    <p>Start your internship journey.</p>\n  </section>`),
    solution: page(
      "Banner",
      `  <section class="bg-light p-4 rounded">\n    <h1 class="text-center fw-bold">Welcome</h1>\n    <p class="text-muted mt-3">Start your internship journey.</p>\n  </section>`,
    ),
    check: {
      rules: [
        { html: "section.bg-light.p-4.rounded", message: "A section with bg-light p-4 rounded" },
        { html: "section h1.text-center.fw-bold", message: "An h1 with text-center fw-bold" },
        { html: "section p.text-muted.mt-3", message: "A p with text-muted mt-3" },
        { html: "[style], style", min: 0, max: 0, message: "No inline style attributes or style tags" },
      ],
    },
  },
  {
    title: "Responsive breakpoint columns",
    brief: "Show four boxes: one per row on phones, two per row on tablets and four per row on large screens.",
    steps: [
      "A div.container holding a div with classes row and g-3",
      "4 divs inside the row, each with classes col-12 col-md-6 col-lg-3",
      "Inside each column, a div with classes p-3 and border holding some text",
    ],
    level: "intermediate",
    editor: "html",
    starter: page("Columns", `  <div class="container">\n    <div class="row">\n      <div class="col">One</div>\n      <div class="col">Two</div>\n      <div class="col">Three</div>\n      <div class="col">Four</div>\n    </div>\n  </div>`),
    solution: page(
      "Columns",
      `  <div class="container">\n    <div class="row g-3">\n      <div class="col-12 col-md-6 col-lg-3"><div class="p-3 border">One</div></div>\n      <div class="col-12 col-md-6 col-lg-3"><div class="p-3 border">Two</div></div>\n      <div class="col-12 col-md-6 col-lg-3"><div class="p-3 border">Three</div></div>\n      <div class="col-12 col-md-6 col-lg-3"><div class="p-3 border">Four</div></div>\n    </div>\n  </div>`,
    ),
    check: {
      rules: [
        { html: ".container .row.g-3", message: "A row with gutter class g-3 inside a container" },
        { html: ".row > .col-12.col-md-6.col-lg-3", min: 4, message: "Four columns with col-12 col-md-6 col-lg-3" },
        { html: ".col-lg-3 > .p-3.border", min: 4, message: "Each column holds a p-3 border box" },
        { html: ".col-lg-3 .border", text: "\\w", min: 4, message: "Each box has some text" },
      ],
    },
  },
  {
    title: "Info modal popup",
    brief: "Add a button that opens a Bootstrap modal with a title, a message and a close button.",
    steps: [
      "A button.btn with data-bs-toggle=\"modal\" and data-bs-target=\"#infoModal\"",
      "A div with classes modal fade and id=\"infoModal\", holding .modal-dialog > .modal-content",
      "Inside modal-content: a .modal-header with an h5.modal-title, a .modal-body, and a .modal-footer",
      "A button with data-bs-dismiss=\"modal\" in the footer, plus the Bootstrap JS bundle script",
    ],
    level: "advanced",
    editor: "html",
    starter: page("Modal", `  <div class="container py-4">\n    <button class="btn btn-primary">Show info</button>\n    <div id="infoModal">\n      <h5>About the course</h5>\n      <p>Six months, real projects.</p>\n    </div>\n  </div>`),
    solution: page(
      "Modal",
      `  <div class="container py-4">\n    <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#infoModal">Show info</button>\n    <div class="modal fade" id="infoModal" tabindex="-1" aria-labelledby="infoModalLabel" aria-hidden="true">\n      <div class="modal-dialog">\n        <div class="modal-content">\n          <div class="modal-header">\n            <h5 class="modal-title" id="infoModalLabel">About the course</h5>\n            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>\n          </div>\n          <div class="modal-body">Six months, real projects.</div>\n          <div class="modal-footer">\n            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>`,
      true,
    ),
    check: {
      rules: [
        { html: "button.btn[data-bs-toggle=modal][data-bs-target=#infoModal]", message: "A button that opens #infoModal" },
        { html: ".modal.fade#infoModal > .modal-dialog > .modal-content", message: "A modal fade #infoModal with modal-dialog and modal-content" },
        { html: ".modal-content .modal-header .modal-title", message: "A modal-header with a modal-title" },
        { html: ".modal-content .modal-body", message: "A modal-body" },
        { html: ".modal-footer button[data-bs-dismiss=modal]", message: "A close button with data-bs-dismiss=\"modal\" in the footer" },
        { html: "script[src*=bootstrap]", message: "The Bootstrap JS bundle is included" },
      ],
    },
  },
  {
    title: "Pricing plans",
    brief: "Show three pricing plans as equal-height cards in a responsive grid, with a badge on the popular plan.",
    steps: [
      "A div with classes row row-cols-1 row-cols-md-3 g-4",
      "3 div.col, each holding a div with classes card h-100",
      "Each card has a .card-header, a .card-body with a ul.list-group.list-group-flush (or list-unstyled) of features, and a .card-footer with a .btn",
      "One card-header contains a span with classes badge bg-success ('Popular')",
    ],
    level: "advanced",
    editor: "html",
    starter: page("Pricing", `  <div class="container py-4">\n    <div class="row">\n      <!-- three plan cards -->\n    </div>\n  </div>`),
    solution: page(
      "Pricing",
      `  <div class="container py-4">\n    <div class="row row-cols-1 row-cols-md-3 g-4">\n      <div class="col">\n        <div class="card h-100">\n          <div class="card-header">Free</div>\n          <div class="card-body">\n            <ul class="list-group list-group-flush">\n              <li class="list-group-item">1 project</li>\n              <li class="list-group-item">Community help</li>\n            </ul>\n          </div>\n          <div class="card-footer"><a href="#" class="btn btn-outline-primary w-100">Start</a></div>\n        </div>\n      </div>\n      <div class="col">\n        <div class="card h-100">\n          <div class="card-header">Pro <span class="badge bg-success">Popular</span></div>\n          <div class="card-body">\n            <ul class="list-group list-group-flush">\n              <li class="list-group-item">10 projects</li>\n              <li class="list-group-item">Mentor reviews</li>\n            </ul>\n          </div>\n          <div class="card-footer"><a href="#" class="btn btn-primary w-100">Buy Pro</a></div>\n        </div>\n      </div>\n      <div class="col">\n        <div class="card h-100">\n          <div class="card-header">Team</div>\n          <div class="card-body">\n            <ul class="list-group list-group-flush">\n              <li class="list-group-item">Unlimited projects</li>\n              <li class="list-group-item">Priority support</li>\n            </ul>\n          </div>\n          <div class="card-footer"><a href="#" class="btn btn-outline-primary w-100">Contact us</a></div>\n        </div>\n      </div>\n    </div>\n  </div>`,
    ),
    check: {
      rules: [
        { html: ".row.row-cols-1.row-cols-md-3.g-4", message: "A row with row-cols-1 row-cols-md-3 g-4" },
        { html: ".row-cols-md-3 > .col > .card.h-100", min: 3, message: "Three .col > .card.h-100 plans" },
        { html: ".card > .card-header", min: 3, message: "Each card has a card-header" },
        { html: ".card .card-body ul.list-group-flush, .card .card-body ul.list-unstyled", min: 3, message: "Each card-body lists features" },
        { html: ".card > .card-footer .btn", min: 3, message: "Each card has a card-footer with a button" },
        { html: ".card-header span.badge.bg-success", min: 1, max: 1, message: "One card-header has a badge bg-success" },
      ],
    },
  },
] satisfies ExerciseSeed[];
