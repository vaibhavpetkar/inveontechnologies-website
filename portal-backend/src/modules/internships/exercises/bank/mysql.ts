import type { ExerciseSeed } from "../types.js";

const setup = `CREATE TABLE departments (
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);
INSERT INTO departments (id, name) VALUES
  (1, 'Engineering'),
  (2, 'Sales'),
  (3, 'HR'),
  (4, 'Marketing');
CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  dept_id INT,
  salary INT NOT NULL,
  city VARCHAR(50) NOT NULL
);
INSERT INTO employees (id, name, dept_id, salary, city) VALUES
  (1, 'Asha', 1, 72000, 'Pune'),
  (2, 'Ravi', 1, 65000, 'Mumbai'),
  (3, 'Meena', 2, 48000, 'Pune'),
  (4, 'John', 2, 52000, 'Delhi'),
  (5, 'Sara', 3, 45000, 'Mumbai'),
  (6, 'Vikram', 1, 90000, 'Delhi'),
  (7, 'Priya', 2, 39000, 'Pune'),
  (8, 'Karan', NULL, 30000, 'Pune')`;

const tables =
  "Tables: departments(id, name) and employees(id, name, dept_id, salary, city). Karan has no department (dept_id is NULL) and Marketing has no employees.";

const starter = `-- ${tables}\n-- Write your query here\nSELECT 1;\n`;

export default [
  {
    title: "List all employees",
    brief: "Select the name and city of every employee, sorted by name A to Z.",
    steps: [tables, "Return two columns: name, city", "Sort by name ascending"],
    level: "basic",
    editor: "sql",
    starter,
    solution: `SELECT name, city FROM employees ORDER BY name;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Asha|Pune\nJohn|Delhi\nKaran|Pune\nMeena|Pune\nPriya|Pune\nRavi|Mumbai\nSara|Mumbai\nVikram|Delhi" }],
      },
    },
  },
  {
    title: "Employees in Pune",
    brief: "Select the name and salary of employees whose city is Pune, highest salary first.",
    steps: [tables, "Return two columns: name, salary", "Only rows where city is 'Pune'", "Sort by salary descending"],
    level: "basic",
    editor: "sql",
    starter,
    solution: `SELECT name, salary FROM employees WHERE city = 'Pune' ORDER BY salary DESC;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Asha|72000\nMeena|48000\nPriya|39000\nKaran|30000" }],
      },
      rules: [{ match: String.raw`\bWHERE\b`, flags: "i", message: "Filters rows with WHERE" }],
    },
  },
  {
    title: "Salary range filter",
    brief: "Select the name and salary of employees earning between 45000 and 70000 (both included), lowest salary first.",
    steps: [tables, "Return two columns: name, salary", "Only salaries from 45000 to 70000 inclusive (BETWEEN works well)", "Sort by salary ascending"],
    level: "basic",
    editor: "sql",
    starter,
    solution: `SELECT name, salary FROM employees WHERE salary BETWEEN 45000 AND 70000 ORDER BY salary;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Sara|45000\nMeena|48000\nJohn|52000\nRavi|65000" }],
      },
    },
  },
  {
    title: "Top 3 earners",
    brief: "Select the name and salary of the three highest-paid employees.",
    steps: [tables, "Return two columns: name, salary", "Sort by salary descending and keep only 3 rows with LIMIT"],
    level: "basic",
    editor: "sql",
    starter,
    solution: `SELECT name, salary FROM employees ORDER BY salary DESC LIMIT 3;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Vikram|90000\nAsha|72000\nRavi|65000" }],
      },
      rules: [{ match: String.raw`\bLIMIT\s+3\b`, flags: "i", message: "Uses LIMIT 3" }],
    },
  },
  {
    title: "Head count per city",
    brief: "Count how many employees work in each city.",
    steps: [tables, "Return two columns: city, number of employees", "Use COUNT(*) with GROUP BY city", "Sort by city A to Z"],
    level: "intermediate",
    editor: "sql",
    starter,
    solution: `SELECT city, COUNT(*) AS total FROM employees GROUP BY city ORDER BY city;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Delhi|2\nMumbai|2\nPune|4" }],
      },
      rules: [{ match: String.raw`\bGROUP\s+BY\b`, flags: "i", message: "Uses GROUP BY" }],
    },
  },
  {
    title: "Average salary by city",
    brief: "Show the average salary in each city, rounded to 2 decimal places.",
    steps: [tables, "Return two columns: city, average salary", "Use ROUND(AVG(salary), 2) with GROUP BY city", "Sort by the average salary descending"],
    level: "intermediate",
    editor: "sql",
    starter,
    solution: `SELECT city, ROUND(AVG(salary), 2) AS avg_salary FROM employees GROUP BY city ORDER BY avg_salary DESC;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Delhi|71000\nMumbai|55000\nPune|47250" }],
      },
      rules: [{ match: String.raw`\bAVG\s*\(`, flags: "i", message: "Uses AVG()" }],
    },
  },
  {
    title: "Employees with departments",
    brief: "List each employee's name next to their department name. Employees without a department are left out.",
    steps: [tables, "Return two columns aliased AS employee and AS department", "Use an INNER JOIN on employees.dept_id = departments.id", "Sort by employee name A to Z"],
    level: "intermediate",
    editor: "sql",
    starter,
    solution: `SELECT e.name AS employee, d.name AS department FROM employees e JOIN departments d ON e.dept_id = d.id ORDER BY e.name;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Asha|Engineering\nJohn|Sales\nMeena|Sales\nPriya|Sales\nRavi|Engineering\nSara|HR\nVikram|Engineering" }],
      },
      rules: [{ match: String.raw`\bJOIN\b`, flags: "i", message: "Uses a JOIN" }],
    },
  },
  {
    title: "Pay raise for Sales",
    brief: "Give every employee in the Sales department (dept_id 2) a raise of 5000.",
    steps: [tables, "Write an UPDATE statement that adds 5000 to salary where dept_id = 2", "Don't change anyone else; the checker then prints every employee's name and salary"],
    level: "intermediate",
    editor: "sql",
    starter,
    solution: `UPDATE employees SET salary = salary + 5000 WHERE dept_id = 2;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        after: `SELECT name, salary FROM employees ORDER BY id`,
        tests: [{ stdin: "", expected: "Asha|72000\nRavi|65000\nMeena|53000\nJohn|57000\nSara|45000\nVikram|90000\nPriya|44000\nKaran|30000" }],
      },
      rules: [{ match: String.raw`\bUPDATE\s+employees\b`, flags: "i", message: "Uses UPDATE on employees" }],
    },
  },
  {
    title: "Staff count per department",
    brief: "List every department with how many employees it has, including departments with zero employees.",
    steps: [tables, "Return two columns: department name, number of employees", "Use LEFT JOIN from departments to employees and COUNT(employees.id) so empty departments show 0", "Sort by department name A to Z"],
    level: "advanced",
    editor: "sql",
    starter,
    solution: `SELECT d.name, COUNT(e.id) AS staff FROM departments d LEFT JOIN employees e ON e.dept_id = d.id GROUP BY d.id, d.name ORDER BY d.name;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Engineering|3\nHR|1\nMarketing|0\nSales|3" }],
      },
      rules: [{ match: String.raw`\bLEFT\s+(OUTER\s+)?JOIN\b`, flags: "i", message: "Uses a LEFT JOIN" }],
    },
  },
  {
    title: "Above-average earners",
    brief: "Find employees who earn more than the average salary of all employees.",
    steps: [tables, "Return two columns: name, salary", "Compare salary with a subquery: (SELECT AVG(salary) FROM employees)", "Sort by salary descending"],
    level: "advanced",
    editor: "sql",
    starter,
    solution: `SELECT name, salary FROM employees WHERE salary > (SELECT AVG(salary) FROM employees) ORDER BY salary DESC;\n`,
    check: {
      run: {
        language: "sql",
        setup,
        tests: [{ stdin: "", expected: "Vikram|90000\nAsha|72000\nRavi|65000" }],
      },
      rules: [{ match: String.raw`\(\s*SELECT\b`, flags: "i", message: "Uses a subquery" }],
    },
  },
] satisfies ExerciseSeed[];
