import type { PracticeUnit } from "../../types.js";
import { pr } from "./shared.js";

const escapes = { match: String.raw`htmlspecialchars\s*\(`, message: "Escapes output with htmlspecialchars" };
const startsSession = { match: String.raw`\bsession_start\s*\(\s*\)`, message: "Starts the session with session_start()" };
const postCheck = { match: String.raw`\$_SERVER\s*\[\s*['"]REQUEST_METHOD['"]\s*\]\s*===?\s*['"]POST['"]`, message: "Checks that the request method is POST" };
const noRawEcho = { notMatch: String.raw`(echo|print|<\?=)\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[`, message: "Never prints raw user input" };

export const web: PracticeUnit = {
  key: "web",
  title: "Forms, superglobals, sessions and cookies",
  summary: "HTML forms with GET and POST, $_GET, $_POST and $_SERVER, validation, escaping with htmlspecialchars, sessions, login and logout, cookies, file uploads and CSRF tokens",
  reading: String.raw`## How a form reaches PHP

An HTML form sends its fields to the URL in its action attribute. With method="get" the values travel in the URL (?name=Asha), which is fine for searches and filters. With method="post" they travel in the request body, which is what you use for logins, sign-ups and anything that changes data.

` + "```php" + String.raw`
<form method="post" action="register.php">
    <input type="text" name="name">
    <input type="email" name="email">
    <button type="submit">Register</button>
</form>
` + "```" + String.raw`

PHP fills the superglobal arrays for you, and they are readable everywhere:

- $_GET: the query-string values. $_POST: the posted form fields. The keys are the name attributes of the inputs.
- $_SERVER: request details, such as $_SERVER["REQUEST_METHOD"] ("GET" or "POST").
- $_FILES: uploaded files. $_COOKIE: cookies sent by the browser. $_SESSION: session data (after session_start()).

A missing field is not an error you can ignore: reading $_GET["name"] when it isn't there raises a warning. Use the null coalescing operator: $name = trim($_POST["name"] ?? "");

## Never trust input: validate, then escape

Everything in $_GET, $_POST and $_COOKIE is typed by the user and can be anything.

- Validate on the server even if the HTML has required or type="email": anyone can bypass the browser. filter_var($email, FILTER_VALIDATE_EMAIL) checks an email, filter_var($age, FILTER_VALIDATE_INT, ["options" => ["min_range" => 18]]) checks a number.
- Escape when you print. htmlspecialchars turns < > " ' & into entities, so a name like <script>alert(1)</script> shows as text instead of running. This stops cross-site scripting (XSS).

` + "```php" + String.raw`
<?php
$name = trim($_GET["name"] ?? "");
?>
<p>Hello, <?= htmlspecialchars($name) ?></p>
` + "```" + String.raw`

A handy pattern is to handle the POST at the top of the page, collect error messages in an array, and show the form again with the old values filled in (a "sticky" form) when something is wrong. After a successful POST, redirect with header("Location: thanks.php"); exit; so refreshing the page doesn't submit the form twice (Post/Redirect/Get).

## Sessions

HTTP forgets you between requests. A session gives each visitor an id stored in a cookie (PHPSESSID) and keeps the data on the server.

` + "```php" + String.raw`
<?php
session_start();                       // before any output
$_SESSION["views"] = ($_SESSION["views"] ?? 0) + 1;
echo "You have opened this page " . $_SESSION["views"] . " times";
` + "```" + String.raw`

A login stores the user's id in $_SESSION after checking the password with password_verify against a hash made by password_hash. Call session_regenerate_id(true) right after login so an attacker can't reuse an old session id (session fixation). A protected page checks the session at the top and redirects if the user isn't logged in. Logging out means clearing $_SESSION, deleting the session cookie and calling session_destroy().

## Cookies

A cookie is a small value the browser stores and sends back on every request. Set it with setcookie before any output, and read it next time from $_COOKIE.

` + "```php" + String.raw`
setcookie("theme", "dark", [
    "expires" => time() + 60 * 60 * 24 * 30,   // 30 days
    "path" => "/",
    "httponly" => true,
    "samesite" => "Lax",
]);
` + "```" + String.raw`

Cookies live on the user's machine, so never store passwords or trust a cookie value blindly: check it against a list of allowed values. Add "secure" => true on HTTPS sites.

## Uploads and CSRF

File uploads need method="post" and enctype="multipart/form-data". Check $_FILES["photo"]["error"] === UPLOAD_ERR_OK, limit the size, check the real type with finfo, and save it with move_uploaded_file under a name you generate.

A CSRF token protects forms from being submitted by another website: store bin2hex(random_bytes(32)) in the session, put it in a hidden input, and compare them with hash_equals when the form comes back.

## Common mistakes

- Printing $_GET or $_POST values without htmlspecialchars.
- Calling session_start, header or setcookie after HTML has already been sent ("headers already sent").
- Forgetting exit after header("Location: ...") so the rest of the page still runs.
- Storing plain-text passwords instead of password_hash.

## How your assignments are checked

These pages need a web server and a browser, so they are checked by reading your code. The checker looks for the important pieces (the right superglobal, escaping, validation, session calls, redirects) and flags dangerous patterns such as echoing raw input. Write a complete, working .php file for each question.`,
  questions: [
    pr("Greeting form with GET", "Build greet.php: a form with a text input called name that submits to the same page with GET, and below it a greeting Hello, <name>! shown only when a name was sent.", ["The form uses method=\"get\" and has an input with name=\"name\"", "Read the value with $_GET and ?? so a missing field is not an error", "Escape the name with htmlspecialchars when printing it"], String.raw`<?php
$name = trim($_GET["name"] ?? "");
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Greeting</title>
</head>
<body>
    <form method="get" action="greet.php">
        <label for="name">Your name</label>
        <input type="text" id="name" name="name">
        <button type="submit">Greet me</button>
    </form>
    <?php if ($name !== "") : ?>
        <p>Hello, <?= htmlspecialchars($name) ?>!</p>
    <?php endif; ?>
</body>
</html>
`, [
      { match: String.raw`<form[^>]*method\s*=\s*["']get["']`, flags: "i", message: "The form submits with GET" },
      { match: String.raw`<input[^>]*name\s*=\s*["']name["']`, message: "Has an input named name" },
      { match: String.raw`\$_GET\s*\[\s*['"]name['"]\s*\]\s*\?\?`, message: "Reads $_GET[\"name\"] with a ?? default" },
      escapes,
      noRawEcho,
    ], "basic"),

    pr("Registration form with POST validation", "Build register.php that shows a form (name, email, password) and, when it is posted, validates it: name is required, email must be valid, password must be at least 8 characters. Collect the problems in an $errors array and show them in a list; if there are none, show Registered successfully.", ["Handle the form only when $_SERVER[\"REQUEST_METHOD\"] is \"POST\"", "Trim the name and use filter_var with FILTER_VALIDATE_EMAIL for the email", "Check strlen of the password", "Print every error inside <li> with htmlspecialchars"], String.raw`<?php
$errors = [];
$success = false;
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $name = trim($_POST["name"] ?? "");
    $email = trim($_POST["email"] ?? "");
    $password = $_POST["password"] ?? "";
    if ($name === "") {
        $errors[] = "Name is required.";
    }
    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $errors[] = "Enter a valid email address.";
    }
    if (strlen($password) < 8) {
        $errors[] = "Password must be at least 8 characters.";
    }
    $success = count($errors) === 0;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Register</title>
</head>
<body>
    <?php if ($success) : ?>
        <p>Registered successfully</p>
    <?php endif; ?>
    <ul>
        <?php foreach ($errors as $error) : ?>
            <li><?= htmlspecialchars($error) ?></li>
        <?php endforeach; ?>
    </ul>
    <form method="post" action="register.php">
        <input type="text" name="name" placeholder="Name">
        <input type="email" name="email" placeholder="Email">
        <input type="password" name="password" placeholder="Password">
        <button type="submit">Register</button>
    </form>
</body>
</html>
`, [
      postCheck,
      { match: String.raw`filter_var\s*\([^)]*FILTER_VALIDATE_EMAIL`, message: "Validates the email with filter_var" },
      { match: String.raw`strlen\s*\(\s*\$\w+\s*\)\s*<\s*8`, message: "Checks the password is at least 8 characters" },
      { match: String.raw`\$errors\s*\[\s*\]\s*=`, message: "Collects messages in an $errors array" },
      { match: String.raw`<li>[^\n]*htmlspecialchars`, message: "Shows each error in an escaped <li>" },
      { match: String.raw`<form[^>]*method\s*=\s*["']post["']`, flags: "i", message: "The form submits with POST" },
    ]),

    pr("Sticky contact form", "Build contact.php: a POST form with name and message fields. When the form is posted with an empty field, show Please fill in all fields and keep what the user typed in the inputs (a sticky form). When both are filled, redirect to thanks.php with the Post/Redirect/Get pattern.", ["Put the old values back with value=\"<?= htmlspecialchars($name) ?>\" and inside the <textarea>", "Redirect with header(\"Location: thanks.php\") followed by exit", "Handle the POST before any HTML is printed"], String.raw`<?php
$name = "";
$message = "";
$error = "";
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $name = trim($_POST["name"] ?? "");
    $message = trim($_POST["message"] ?? "");
    if ($name === "" || $message === "") {
        $error = "Please fill in all fields";
    } else {
        header("Location: thanks.php");
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Contact us</title>
</head>
<body>
    <?php if ($error !== "") : ?>
        <p class="error"><?= htmlspecialchars($error) ?></p>
    <?php endif; ?>
    <form method="post" action="contact.php">
        <input type="text" name="name" value="<?= htmlspecialchars($name) ?>">
        <textarea name="message"><?= htmlspecialchars($message) ?></textarea>
        <button type="submit">Send</button>
    </form>
</body>
</html>
`, [
      postCheck,
      { match: String.raw`value\s*=\s*["']<\?=\s*htmlspecialchars\s*\(\s*\$name`, message: "Refills the name input with the escaped old value" },
      { match: String.raw`<textarea[^>]*>\s*<\?=\s*htmlspecialchars\s*\(\s*\$message`, message: "Refills the textarea with the escaped old message" },
      { match: String.raw`header\s*\(\s*["']Location:\s*thanks\.php["']\s*\)\s*;\s*exit`, message: "Redirects to thanks.php and exits" },
      noRawEcho,
    ]),

    pr("Page view counter with a session", "Build counter.php that counts how many times the current visitor has opened the page using a session, and has a reset link (counter.php?reset=1) that sets the count back to zero.", ["Call session_start() first", "Store the count in $_SESSION[\"views\"]; use ?? 0 the first time", "When $_GET[\"reset\"] is set, remove the count with unset"], String.raw`<?php
session_start();
if (isset($_GET["reset"])) {
    unset($_SESSION["views"]);
}
$_SESSION["views"] = ($_SESSION["views"] ?? 0) + 1;
$views = $_SESSION["views"];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Counter</title>
</head>
<body>
    <p>You have opened this page <?= $views ?> times.</p>
    <a href="counter.php?reset=1">Reset</a>
</body>
</html>
`, [
      startsSession,
      { match: String.raw`\$_SESSION\s*\[\s*['"]views['"]\s*\]\s*\?\?\s*0`, message: "Starts from 0 with ?? 0" },
      { match: String.raw`\$_SESSION\s*\[\s*['"]views['"]\s*\]\s*=`, message: "Saves the count in $_SESSION[\"views\"]" },
      { match: String.raw`unset\s*\(\s*\$_SESSION\s*\[\s*['"]views['"]\s*\]\s*\)`, message: "Resets with unset($_SESSION[\"views\"])" },
      { match: String.raw`isset\s*\(\s*\$_GET\s*\[\s*['"]reset['"]\s*\]\s*\)`, message: "Checks for ?reset in $_GET" },
    ], "basic"),

    pr("Login with password_verify", "Build login.php. The users are in an array: $users = [\"asha@example.com\" => password_hash(\"secret123\", PASSWORD_DEFAULT)]. When the form is posted, look up the email, check the password with password_verify, and on success regenerate the session id, store the email in $_SESSION[\"user\"] and redirect to dashboard.php. Otherwise show Invalid email or password.", ["session_start() at the top", "Use password_verify, never compare passwords with ==", "Call session_regenerate_id(true) after a successful login", "Redirect with header(\"Location: dashboard.php\") and exit"], String.raw`<?php
session_start();
$users = ["asha@example.com" => password_hash("secret123", PASSWORD_DEFAULT)];
$error = "";
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $email = trim($_POST["email"] ?? "");
    $password = $_POST["password"] ?? "";
    $hash = $users[$email] ?? null;
    if ($hash !== null && password_verify($password, $hash)) {
        session_regenerate_id(true);
        $_SESSION["user"] = $email;
        header("Location: dashboard.php");
        exit;
    }
    $error = "Invalid email or password";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Login</title>
</head>
<body>
    <?php if ($error !== "") : ?>
        <p><?= htmlspecialchars($error) ?></p>
    <?php endif; ?>
    <form method="post" action="login.php">
        <input type="email" name="email" required>
        <input type="password" name="password" required>
        <button type="submit">Log in</button>
    </form>
</body>
</html>
`, [
      startsSession,
      postCheck,
      { match: String.raw`password_verify\s*\(\s*\$\w+\s*,\s*\$\w+\s*\)`, message: "Checks the password with password_verify" },
      { match: String.raw`session_regenerate_id\s*\(\s*true\s*\)`, message: "Regenerates the session id after login" },
      { match: String.raw`\$_SESSION\s*\[\s*['"]user['"]\s*\]\s*=`, message: "Stores the user in $_SESSION[\"user\"]" },
      { match: String.raw`header\s*\(\s*["']Location:\s*dashboard\.php["']\s*\)\s*;\s*exit`, message: "Redirects to dashboard.php and exits" },
      { notMatch: String.raw`\$_POST\s*\[\s*['"]password['"]\s*\]\s*={2,3}|={2,3}\s*\$_POST\s*\[\s*['"]password['"]\s*\]`, message: "Doesn't compare passwords with ==" },
    ], "advanced"),

    pr("Protected dashboard and logout", "Build dashboard.php, which only logged-in users may see (anyone else is sent to login.php), and logout.php, which ends the session and sends the user to login.php. Write both in one file for this assignment: first the dashboard code, then the logout code under a comment.", ["Dashboard: session_start(), and if $_SESSION[\"user\"] isn't set, redirect to login.php and exit", "Show Welcome, <user> with htmlspecialchars", "Logout: clear $_SESSION, delete the session cookie with setcookie(session_name(), \"\", ...) and call session_destroy()"], String.raw`<?php
// dashboard.php
session_start();
if (!isset($_SESSION["user"])) {
    header("Location: login.php");
    exit;
}
echo "<h1>Welcome, " . htmlspecialchars($_SESSION["user"]) . "</h1>";
echo "<a href=\"logout.php\">Log out</a>";

// logout.php
session_start();
$_SESSION = [];
setcookie(session_name(), "", time() - 3600, "/");
session_destroy();
header("Location: login.php");
exit;
`, [
      startsSession,
      { match: String.raw`!\s*isset\s*\(\s*\$_SESSION\s*\[\s*['"]user['"]\s*\]\s*\)`, message: "Checks whether the user is logged in" },
      { match: String.raw`header\s*\(\s*["']Location:\s*login\.php["']\s*\)\s*;\s*exit`, message: "Sends guests to login.php and exits" },
      { match: String.raw`\$_SESSION\s*=\s*\[\s*\]|session_unset\s*\(`, message: "Clears the session data" },
      { match: String.raw`session_destroy\s*\(\s*\)`, message: "Destroys the session" },
      { match: String.raw`setcookie\s*\(\s*session_name\s*\(\s*\)`, message: "Deletes the session cookie" },
      escapes,
    ]),

    pr("Remember the theme with a cookie", "Build theme.php. When the page is opened with ?theme=dark or ?theme=light, save the choice in a cookie named theme for 30 days. On every visit, read the theme from the cookie (default light), accept only light or dark, and put it in <body class=\"...\">.", ["Allow only the values in [\"light\", \"dark\"] (in_array with true)", "setcookie with an options array: expires in 30 days, path /, httponly, samesite Lax", "Read with $_COOKIE[\"theme\"] ?? \"light\""], String.raw`<?php
$allowed = ["light", "dark"];
$theme = $_COOKIE["theme"] ?? "light";
$chosen = $_GET["theme"] ?? null;
if ($chosen !== null && in_array($chosen, $allowed, true)) {
    setcookie("theme", $chosen, [
        "expires" => time() + 60 * 60 * 24 * 30,
        "path" => "/",
        "httponly" => true,
        "samesite" => "Lax",
    ]);
    $theme = $chosen;
}
if (!in_array($theme, $allowed, true)) {
    $theme = "light";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Theme</title>
</head>
<body class="<?= htmlspecialchars($theme) ?>">
    <a href="theme.php?theme=light">Light</a>
    <a href="theme.php?theme=dark">Dark</a>
</body>
</html>
`, [
      { match: String.raw`setcookie\s*\(\s*["']theme["']`, message: "Sets a cookie named theme" },
      { match: String.raw`["']expires["']\s*=>\s*time\s*\(\s*\)\s*\+\s*(60\s*\*\s*60\s*\*\s*24\s*\*\s*30|2592000|86400\s*\*\s*30)`, message: "Expires in 30 days" },
      { match: String.raw`["']httponly["']\s*=>\s*true`, message: "Marks the cookie httponly" },
      { match: String.raw`["']samesite["']\s*=>\s*["']Lax["']`, flags: "i", message: "Sets samesite to Lax" },
      { match: String.raw`\$_COOKIE\s*\[\s*['"]theme['"]\s*\]\s*\?\?\s*["']light["']`, message: "Reads the cookie with a light default" },
      { match: String.raw`in_array\s*\([^)]*,\s*true\s*\)`, message: "Accepts only allowed values (strict in_array)" },
    ]),

    pr("Safe profile photo upload", "Build upload.php that accepts a profile photo from a form field named photo. Accept only JPEG or PNG files up to 2 MB, check the real file type with finfo, and save the file in uploads/ under a random name. Show Upload complete or the reason it failed.", ["The form needs method=\"post\" and enctype=\"multipart/form-data\"", "Check $_FILES[\"photo\"][\"error\"] === UPLOAD_ERR_OK and the size", "Detect the type with finfo (FILEINFO_MIME_TYPE), not the file name", "Save with move_uploaded_file and a name made with bin2hex(random_bytes(...))"], String.raw`<?php
$message = "";
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $file = $_FILES["photo"] ?? null;
    $types = ["image/jpeg" => "jpg", "image/png" => "png"];
    if ($file === null || $file["error"] !== UPLOAD_ERR_OK) {
        $message = "Upload failed.";
    } elseif ($file["size"] > 2 * 1024 * 1024) {
        $message = "The photo must be 2 MB or smaller.";
    } else {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file["tmp_name"]);
        if (!isset($types[$mime])) {
            $message = "Only JPEG and PNG images are allowed.";
        } else {
            $name = bin2hex(random_bytes(16)) . "." . $types[$mime];
            if (move_uploaded_file($file["tmp_name"], __DIR__ . "/uploads/" . $name)) {
                $message = "Upload complete";
            } else {
                $message = "Could not save the file.";
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Upload</title>
</head>
<body>
    <p><?= htmlspecialchars($message) ?></p>
    <form method="post" enctype="multipart/form-data" action="upload.php">
        <input type="file" name="photo" accept="image/jpeg,image/png">
        <button type="submit">Upload</button>
    </form>
</body>
</html>
`, [
      { match: String.raw`enctype\s*=\s*["']multipart/form-data["']`, message: "The form uses multipart/form-data" },
      { match: String.raw`UPLOAD_ERR_OK`, message: "Checks the upload error code" },
      { match: String.raw`\[\s*["']size["']\s*\]\s*>\s*(2\s*\*\s*1024\s*\*\s*1024|2097152)`, message: "Limits the size to 2 MB" },
      { match: String.raw`FILEINFO_MIME_TYPE`, message: "Detects the real type with finfo" },
      { match: String.raw`move_uploaded_file\s*\(`, message: "Saves with move_uploaded_file" },
      { match: String.raw`random_bytes\s*\(`, message: "Generates a random file name" },
    ], "advanced"),

    pr("CSRF token for a form", "Build transfer.php with a POST form that is protected by a CSRF token. Create the token once per session with bin2hex(random_bytes(32)), put it in a hidden input named csrf_token, and when the form is posted reject the request with HTTP status 403 unless the posted token matches, compared with hash_equals.", ["session_start() first", "Create $_SESSION[\"csrf_token\"] only if it doesn't exist yet", "Hidden input: <input type=\"hidden\" name=\"csrf_token\" value=\"...\">", "Compare with hash_equals and call http_response_code(403) when it doesn't match"], String.raw`<?php
session_start();
if (!isset($_SESSION["csrf_token"])) {
    $_SESSION["csrf_token"] = bin2hex(random_bytes(32));
}
$token = $_SESSION["csrf_token"];
$message = "";
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $sent = $_POST["csrf_token"] ?? "";
    if (!hash_equals($token, $sent)) {
        http_response_code(403);
        exit("Invalid request");
    }
    $amount = filter_var($_POST["amount"] ?? "", FILTER_VALIDATE_INT, ["options" => ["min_range" => 1]]);
    $message = $amount === false ? "Enter a valid amount." : "Transfer of Rs $amount accepted.";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Transfer</title>
</head>
<body>
    <p><?= htmlspecialchars($message) ?></p>
    <form method="post" action="transfer.php">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($token) ?>">
        <input type="number" name="amount" min="1">
        <button type="submit">Transfer</button>
    </form>
</body>
</html>
`, [
      startsSession,
      { match: String.raw`bin2hex\s*\(\s*random_bytes\s*\(\s*32\s*\)\s*\)`, message: "Creates the token with bin2hex(random_bytes(32))" },
      { match: String.raw`<input[^>]*type\s*=\s*["']hidden["'][^>]*name\s*=\s*["']csrf_token["']`, message: "Adds a hidden csrf_token input" },
      { match: String.raw`hash_equals\s*\(`, message: "Compares tokens with hash_equals" },
      { match: String.raw`http_response_code\s*\(\s*403\s*\)`, message: "Rejects bad tokens with status 403" },
      postCheck,
    ], "advanced"),

    pr("Search filter with GET parameters", "Build products.php that lists products from an array and filters them with two GET parameters: q (text that must appear in the name, ignoring case) and max (a maximum price). Keep the typed values in the search form, and print Nothing found when no product matches.", ["$products is an array of [\"name\" => ..., \"price\" => ...] records you define", "Read q with ?? \"\" and max with filter_var(..., FILTER_VALIDATE_INT)", "Filter with array_filter and stripos", "Escape every value you print"], String.raw`<?php
$products = [
    ["name" => "Blue pen", "price" => 20],
    ["name" => "Notebook", "price" => 60],
    ["name" => "Pen stand", "price" => 150],
    ["name" => "School bag", "price" => 900],
];
$q = trim($_GET["q"] ?? "");
$max = filter_var($_GET["max"] ?? "", FILTER_VALIDATE_INT);
$results = array_filter($products, function (array $p) use ($q, $max): bool {
    $nameOk = $q === "" || stripos($p["name"], $q) !== false;
    $priceOk = $max === false || $p["price"] <= $max;
    return $nameOk && $priceOk;
});
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Products</title>
</head>
<body>
    <form method="get" action="products.php">
        <input type="search" name="q" value="<?= htmlspecialchars($q) ?>">
        <input type="number" name="max" value="<?= $max === false ? "" : $max ?>">
        <button type="submit">Search</button>
    </form>
    <?php if (count($results) === 0) : ?>
        <p>Nothing found</p>
    <?php endif; ?>
    <ul>
        <?php foreach ($results as $p) : ?>
            <li><?= htmlspecialchars($p["name"]) ?>: Rs <?= $p["price"] ?></li>
        <?php endforeach; ?>
    </ul>
</body>
</html>
`, [
      { match: String.raw`\$_GET\s*\[\s*['"]q['"]\s*\]\s*\?\?`, message: "Reads q from $_GET with a default" },
      { match: String.raw`FILTER_VALIDATE_INT`, message: "Validates max as an integer" },
      { match: String.raw`array_filter\s*\(`, message: "Filters with array_filter" },
      { match: String.raw`stripos\s*\(`, message: "Matches the name ignoring case (stripos)" },
      { match: String.raw`value\s*=\s*["']<\?=\s*htmlspecialchars\s*\(\s*\$q`, message: "Keeps the escaped search text in the input" },
      noRawEcho,
    ]),
  ],
  quiz: [
    { q: "Which superglobal holds the fields of a form sent with method=\"post\"?", options: ["$_GET", "$_POST", "$_FORM", "$_REQUEST_BODY"], answer: 1, why: "Posted fields are in $_POST, keyed by each input's name attribute." },
    { q: "What decides the key under which an input's value appears in $_POST?", options: ["Its id", "Its name attribute", "Its label", "Its placeholder"], answer: 1, why: "Only the name attribute is sent to the server." },
    { q: "Which function must be called before using $_SESSION?", options: ["session_open()", "session_start()", "start_session()", "session_begin()"], answer: 1, why: "session_start() loads (or creates) the session for this request." },
    { q: "What does htmlspecialchars(\"<b>Hi</b>\") return?", options: ["<b>Hi</b>", "&lt;b&gt;Hi&lt;/b&gt;", "Hi", "An empty string"], answer: 1, why: "It converts < and > to entities so the text is shown instead of interpreted as HTML." },
    { q: "Which attack does escaping output with htmlspecialchars prevent?", options: ["SQL injection", "Cross-site scripting (XSS)", "Brute-force login", "CSRF"], answer: 1, why: "Escaping stops user input from being run as HTML or JavaScript in the page." },
    { q: "Where is session data stored by default?", options: ["In the browser's cookie", "On the server; the browser only keeps the session id", "In the URL", "In localStorage"], answer: 1, why: "The PHPSESSID cookie carries only the id; the data stays on the server." },
    { q: "Why call exit right after header(\"Location: login.php\")?", options: ["To send the header", "Otherwise the rest of the script keeps running and may show protected content", "To close the session", "It is only a style choice"], answer: 1, why: "header only adds a response header; the script continues unless you stop it." },
    { q: "What is wrong with: <p>Hi</p><?php session_start(); ?>", options: ["Nothing", "session_start is called after output, so its cookie header can't be sent", "session_start needs an argument", "PHP tags can't follow HTML"], answer: 1, why: "Headers (including the session cookie) must be sent before any output, or you get \"headers already sent\"." },
    { q: "Why use hash_equals($a, $b) instead of $a === $b to compare CSRF tokens?", options: ["It is faster", "It takes the same time whatever the input, so attackers can't learn the token from timing", "=== doesn't work on strings", "It also hashes the tokens"], answer: 1, why: "hash_equals is a constant-time comparison that resists timing attacks." },
    { q: "A login form stores passwords with password_hash. Which check is correct?", options: ["password_hash($input) === $stored", "md5($input) === $stored", "password_verify($input, $stored)", "$input == $stored"], answer: 2, why: "password_hash uses a random salt each time, so you must verify with password_verify." },
  ],
};
