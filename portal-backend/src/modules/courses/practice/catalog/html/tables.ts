import type { PracticeUnit } from "../../types.js";
import { el, hq, page } from "./shared.js";

export const tables: PracticeUnit = {
  key: "lists-tables",
  title: "Lists and tables",
  summary: "unordered, ordered, nested and description lists, and data tables with captions, header cells, scope, colspan and rowspan",
  reading: String.raw`## Lists

HTML has three kinds of list, and each one means something different.

- <ul> (unordered list): items where the order does not matter, like a shopping list or the features of a product. Shown with bullets.
- <ol> (ordered list): steps or rankings where the order matters. Shown with numbers.
- <dl> (description list): pairs of terms and descriptions, like a glossary or a set of key-value facts.

The only elements allowed directly inside ul and ol are <li> items. Everything else (text, links, images, even another list) goes inside an li.

` + "```html" + String.raw`
<ol>
  <li>Install VS Code</li>
  <li>Install the Live Server extension</li>
  <li>Open your project folder</li>
</ol>
` + "```" + String.raw`

Useful ol attributes: start="5" begins numbering at 5, reversed counts down, and type="A", "a", "I" or "i" changes the marker to letters or Roman numerals. The bullet style of ul is changed with CSS (list-style-type), not HTML.

## Nested lists

A sub-list goes inside the li it belongs to, not between two li elements:

` + "```html" + String.raw`
<ul>
  <li>Courses
    <ul>
      <li>Full Stack Web</li>
      <li>Data Science</li>
    </ul>
  </li>
  <li>Internships</li>
</ul>
` + "```" + String.raw`

Navigation menus and drop-down menus are built as nested ul lists inside a nav.

## Description lists

` + "```html" + String.raw`
<dl>
  <dt>HTML</dt>
  <dd>The structure and meaning of the page.</dd>
  <dt>CSS</dt>
  <dd>How the page looks.</dd>
</dl>
` + "```" + String.raw`

A dt can have several dd elements, and several dt elements can share one dd.

## Tables are for tabular data

Use a table when the data has rows and columns that relate to each other: a timetable, a marksheet, a price comparison. Never use tables to lay out a page; that is what CSS Flexbox and Grid are for.

- <table> wraps everything.
- <caption> is the table's title. It must be the first child of table, and screen readers announce it.
- <tr> is a table row.
- <th> is a header cell and <td> is a data cell.
- <thead>, <tbody> and <tfoot> group the header rows, body rows and summary rows. They help screen readers, printing (the header repeats on each printed page) and styling.

` + "```html" + String.raw`
<table>
  <caption>Semester 3 results</caption>
  <thead>
    <tr><th scope="col">Subject</th><th scope="col">Marks</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">DBMS</th><td>82</td></tr>
    <tr><th scope="row">Operating Systems</th><td>76</td></tr>
  </tbody>
  <tfoot>
    <tr><th scope="row">Total</th><td>158</td></tr>
  </tfoot>
</table>
` + "```" + String.raw`

## scope, colspan and rowspan

- scope="col" on a th says it heads its column; scope="row" says it heads its row. Screen readers then read "DBMS, Marks, 82" instead of just "82".
- colspan="3" makes a cell stretch across three columns; rowspan="2" makes it stretch down two rows. Every row must still add up to the same number of columns, so when a cell spans, leave out the cells it covers in the following columns or rows.

A quick way to check a table with spans: count the columns each row takes (a colspan of 2 counts as 2). Every row should give the same total.

## Common mistakes

- Putting text or a nested ul directly inside ul without an li.
- Using <br> or numbers typed by hand instead of an ol.
- Forgetting th and making the first row bold with CSS instead. Header cells carry meaning.
- Writing border="1" on the table. That presentational attribute is obsolete; use CSS.
- Mismatched spans that make rows longer or shorter than others, which pushes cells into the wrong columns.
- Skipping caption: without it, a screen reader user has no idea what the table is about until they read the cells.

## How your assignments are checked

The checker counts elements and checks where they sit: "at least five li directly inside ul", "a th with scope=col inside thead", "a td with colspan". Write real list and table markup; lists made of paragraphs or tables drawn with divs will not pass.`,
  questions: [
    hq(
      "Shopping list",
      "Write a shopping list for a hostel room as a bulleted list.",
      ["An h1 Hostel Shopping List", "An unordered list with at least five items"],
      page("Shopping List", String.raw`
  <h1>Hostel Shopping List</h1>
  <ul>
    <li>Bucket and mug</li>
    <li>Extension board</li>
    <li>Study lamp</li>
    <li>Water bottle</li>
    <li>Padlock</li>
  </ul>`),
      [
        el("h1", "An h1 for the list", { text: "Shopping List" }),
        el("ul > li", "At least five list items in a ul", { min: 5 }),
        el("ol", "Uses an unordered list, not an ordered one", { max: 0 }),
      ],
    ),

    hq(
      "Installation steps",
      "Write the steps to set up a web development environment as a numbered list.",
      [
        "An ordered list with at least four steps",
        "The first step must mention installing VS Code",
        "One step must contain a link to https://nodejs.org/",
      ],
      page("Setup", String.raw`
  <h1>Set Up Your Laptop</h1>
  <ol>
    <li>Install VS Code from the official website.</li>
    <li>Install the Live Server and Prettier extensions.</li>
    <li>Install Node.js from <a href="https://nodejs.org/">nodejs.org</a>.</li>
    <li>Create a folder called projects and open it in VS Code.</li>
  </ol>`),
      [
        el("ol > li", "At least four steps in an ol", { min: 4 }),
        el("ol > li", "A step about installing VS Code", { text: "VS Code" }),
        el('ol > li > a[href^="https://nodejs.org"]', "A step links to nodejs.org"),
      ],
    ),

    hq(
      "Top five countdown",
      "List the top five programming languages as a countdown from 5 to 1.",
      ["An ordered list that counts down using the reversed attribute", "Exactly five items", "An h2 above it: Top 5 Languages of 2026"],
      page("Top 5", String.raw`
  <h2>Top 5 Languages of 2026</h2>
  <ol reversed>
    <li>Go</li>
    <li>Java</li>
    <li>TypeScript</li>
    <li>JavaScript</li>
    <li>Python</li>
  </ol>`),
      [
        el("ol[reversed]", "The ordered list is reversed"),
        el("ol > li", "Exactly five items", { min: 5, max: 5 }),
        el("h2", "A heading above the list", { text: "Top 5" }),
      ],
    ),

    hq(
      "Nested menu list",
      "Build a site menu where two top-level items have their own sub-menus.",
      [
        "A nav containing a ul with at least three li items",
        "Two of those li items contain a nested ul with at least two li each",
        "Every item is a link (use # as the href for now)",
        "The nested ul must be inside the li, not between two li elements",
      ],
      page("Menu", String.raw`
  <nav>
    <ul>
      <li><a href="#">Home</a></li>
      <li><a href="#">Courses</a>
        <ul>
          <li><a href="#">Full Stack Web</a></li>
          <li><a href="#">Data Science</a></li>
        </ul>
      </li>
      <li><a href="#">Internships</a>
        <ul>
          <li><a href="#">Summer</a></li>
          <li><a href="#">Winter</a></li>
        </ul>
      </li>
    </ul>
  </nav>`),
      [
        el("nav > ul > li", "At least three top-level items", { min: 3 }),
        el("nav > ul > li > ul", "Two items have a nested list", { min: 2 }),
        el("li > ul > li", "At least four sub-menu items", { min: 4 }),
        el("li > a", "Items are links", { min: 7 }),
        el("ul > ul", "No ul directly inside another ul", { max: 0 }),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Glossary with a description list",
      "Write a glossary of web terms.",
      ["A dl with at least three terms (dt) and their meanings (dd)", "Include the terms HTML, CSS and DOM"],
      page("Glossary", String.raw`
  <h1>Web Glossary</h1>
  <dl>
    <dt>HTML</dt>
    <dd>The markup language that gives a page its structure and meaning.</dd>
    <dt>CSS</dt>
    <dd>The style sheet language that controls colours, fonts and layout.</dd>
    <dt>DOM</dt>
    <dd>The tree of objects the browser builds from your HTML, which JavaScript can change.</dd>
  </dl>`),
      [
        el("dl > dt", "At least three terms", { min: 3 }),
        el("dl > dd", "At least three descriptions", { min: 3 }),
        el("dt", "HTML is defined", { text: "^\\s*HTML\\s*$" }),
        el("dt", "DOM is defined", { text: "DOM" }),
      ],
    ),

    hq(
      "Class timetable",
      "Make a simple timetable table for two days.",
      [
        "A table whose first row has header cells: Time, Monday, Tuesday",
        "At least three more rows with a time and two subjects each",
        "Use th for the header row and td for data",
      ],
      page("Timetable", String.raw`
  <table>
    <tr>
      <th>Time</th>
      <th>Monday</th>
      <th>Tuesday</th>
    </tr>
    <tr>
      <td>9:00</td>
      <td>Maths</td>
      <td>Physics</td>
    </tr>
    <tr>
      <td>10:00</td>
      <td>Programming</td>
      <td>Maths</td>
    </tr>
    <tr>
      <td>11:00</td>
      <td>English</td>
      <td>Programming Lab</td>
    </tr>
  </table>`),
      [
        el("table tr", "At least four rows", { min: 4 }),
        el("table th", "Three header cells", { min: 3 }),
        el("th", "A Monday column", { text: "Monday" }),
        el("table td", "At least nine data cells", { min: 9 }),
      ],
    ),

    hq(
      "Table with caption, head, body and foot",
      "Write a fee structure table with all the table sections.",
      [
        "A caption: Fee structure 2026-27",
        "A thead with one row of th cells: Item and Amount",
        "A tbody with at least three rows",
        "A tfoot with the total",
      ],
      page("Fees", String.raw`
  <table>
    <caption>Fee structure 2026-27</caption>
    <thead>
      <tr>
        <th>Item</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Tuition</td>
        <td>85000</td>
      </tr>
      <tr>
        <td>Library</td>
        <td>3000</td>
      </tr>
      <tr>
        <td>Lab</td>
        <td>7000</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td>Total</td>
        <td>95000</td>
      </tr>
    </tfoot>
  </table>`),
      [
        el("table > caption", "A caption", { text: "Fee structure" }),
        el("table > thead > tr > th", "Header cells in thead", { min: 2 }),
        el("table > tbody > tr", "At least three body rows", { min: 3 }),
        el("table > tfoot > tr", "A footer row", { text: "Total" }),
      ],
    ),

    hq(
      "Merged cells with colspan and rowspan",
      "Build an exam schedule where some cells span several columns or rows.",
      [
        "A header row: Day, Morning, Afternoon",
        "A row for Monday where one cell says Holiday and spans both the Morning and Afternoon columns (colspan)",
        "A cell Lab Exam that spans two rows (rowspan) in the Afternoon column for Tuesday and Wednesday",
        "Make sure every row adds up to three columns",
      ],
      page("Exam Schedule", String.raw`
  <table>
    <caption>Exam schedule</caption>
    <tr>
      <th scope="col">Day</th>
      <th scope="col">Morning</th>
      <th scope="col">Afternoon</th>
    </tr>
    <tr>
      <th scope="row">Monday</th>
      <td colspan="2">Holiday</td>
    </tr>
    <tr>
      <th scope="row">Tuesday</th>
      <td>Maths</td>
      <td rowspan="2">Lab Exam</td>
    </tr>
    <tr>
      <th scope="row">Wednesday</th>
      <td>Physics</td>
    </tr>
  </table>`),
      [
        el("td[colspan=2]", "A cell spans two columns", { text: "Holiday" }),
        el("td[rowspan=2]", "A cell spans two rows", { text: "Lab Exam" }),
        el("table tr", "Four rows", { min: 4 }),
        el("th", "Header cells for the columns", { min: 3 }),
      ],
      { level: "intermediate" },
    ),

    hq(
      "Accessible marksheet",
      "Build a marksheet that a screen reader can read cell by cell with the right headers.",
      [
        "A caption naming the student and semester",
        "A thead row of th cells with scope=\"col\": Subject, Internal, External, Total",
        "A tbody with at least four subject rows; the subject name in each row is a th with scope=\"row\"",
        "A tfoot row where Grand Total spans the first three columns (colspan=\"3\") and is followed by the total",
      ],
      page("Marksheet", String.raw`
  <table>
    <caption>Marksheet: Ananya Iyer, Semester 4</caption>
    <thead>
      <tr>
        <th scope="col">Subject</th>
        <th scope="col">Internal</th>
        <th scope="col">External</th>
        <th scope="col">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Data Structures</th>
        <td>18</td>
        <td>62</td>
        <td>80</td>
      </tr>
      <tr>
        <th scope="row">Computer Networks</th>
        <td>17</td>
        <td>55</td>
        <td>72</td>
      </tr>
      <tr>
        <th scope="row">Web Technology</th>
        <td>19</td>
        <td>68</td>
        <td>87</td>
      </tr>
      <tr>
        <th scope="row">Mathematics III</th>
        <td>15</td>
        <td>51</td>
        <td>66</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <th scope="row" colspan="3">Grand Total</th>
        <td>305</td>
      </tr>
    </tfoot>
  </table>`),
      [
        el("table > caption", "A caption"),
        el('thead th[scope="col"]', "Column headers use scope=col", { min: 4 }),
        el('tbody th[scope="row"]', "Each subject is a row header with scope=row", { min: 4 }),
        el("tbody > tr", "At least four subject rows", { min: 4 }),
        el("tfoot [colspan=3]", "The Grand Total cell spans three columns", { text: "Grand Total" }),
      ],
      { level: "advanced" },
    ),
  ],
  quiz: [
    { q: "Which list should you use for the steps of a recipe?", options: ["<ul>", "<ol>", "<dl>", "<menu>"], answer: 1, why: "The order of the steps matters, so an ordered list carries that meaning." },
    { q: "Which elements may be direct children of <ul>?", options: ["Any element", "Only <li> (and script-supporting elements)", "<li> and <ul>", "<li> and text"], answer: 1, why: "A nested list must go inside an li, not directly in the ul." },
    { q: "What does <ol start=\"4\" reversed> with three items number them as?", options: ["4, 5, 6", "4, 3, 2", "3, 2, 1", "1, 2, 3"], answer: 1, why: "start sets the first number and reversed counts down from it." },
    { q: "In a description list, what are dt and dd?", options: ["Data table and data definition", "The term and its description", "Two kinds of list item bullets", "Header and footer of the list"], answer: 1, why: "dt holds the term, dd describes it." },
    { q: "Where must <caption> be placed?", options: ["Anywhere in the table", "As the first child of <table>", "After </table>", "Inside <thead>"], answer: 1, why: "The caption must be the first element inside table." },
    { q: "What does scope=\"row\" on a <th> tell assistive technology?", options: ["The cell is the first row", "The cell is a header for the other cells in its row", "The cell spans the whole row", "The row can be sorted"], answer: 1, why: "Screen readers announce the row header along with each data cell in that row." },
    { q: "Why should you not use tables for page layout?", options: ["Tables are deprecated", "They are meant for data; layout tables confuse screen readers and are hard to make responsive", "Tables cannot contain images", "Browsers do not render them anymore"], answer: 1, why: "Use CSS Grid or Flexbox for layout; tables communicate data relationships." },
    { q: "A table has 3 columns. Row 2 starts with a cell that has rowspan=\"2\". How many td/th elements should row 3 contain?", options: ["3", "2", "1", "4"], answer: 1, why: "The spanning cell from row 2 already fills one column of row 3, so row 3 needs only 2 cells." },
    { q: "What happens with this markup?\n\n<ul>\n  <li>A</li>\n  <ul><li>A1</li></ul>\n</ul>", options: ["It is valid and perfectly nested", "It is invalid: the inner ul must be inside the li for A", "The browser removes the inner list", "It renders as a table"], answer: 1, why: "Browsers usually render it, but it is invalid HTML; the sub-list belongs inside the li it describes." },
    { q: "A 4-column table's footer row has a th with colspan=\"3\". How many more cells does that row need?", options: ["0", "1", "3", "4"], answer: 1, why: "The th covers three columns, so one more cell completes the four columns." },
  ],
};
