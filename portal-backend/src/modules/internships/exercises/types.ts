/**
 * Auto-checked coding exercises. Each exercise is checked one of two ways:
 *
 * - run: the code is compiled and run against test cases (stdin in,
 *   expected stdout out) by the code runner (Judge0 in production).
 * - rules: the code is inspected without running it (HTML structure, CSS
 *   declarations, patterns in JSX, Python, Java, YAML and so on).
 *
 * An exercise can use both, e.g. run the tests and also require a loop.
 */

/** Languages the code runner can execute. */
export type RunLanguage = "javascript" | "python" | "c" | "cpp" | "csharp" | "java" | "sql" | "php" | "bash";

/** What the editor highlights and labels the code as. */
export type EditorLanguage = RunLanguage | "html" | "css" | "jsx" | "yaml" | "dockerfile" | "shell" | "hcl" | "json" | "text";

export interface TestCase {
  stdin: string;
  expected: string;
  /** Hidden tests run on submit only and never show their input or output. */
  hidden?: boolean;
  /**
   * "tokens" matching only: words that must not be in the answer, e.g. "not"
   * when the answer is "Leap year". Only the last line printed counts, after
   * its last ":" (so menus and input prompts are ignored).
   */
  forbid?: string[];
}

export type Rule =
  /** An element matching a CSS-like selector exists (min/max times), optionally with text matching a regex. */
  | { html: string; min?: number; max?: number; text?: string; message: string }
  /** A CSS rule for the selector sets the property (to a value matching the regex, when given), optionally inside an at-rule matching `inside` (e.g. "min-width:\\s*768px"). */
  | { css: string; prop: string; value?: string; inside?: string; message: string }
  /** An at-rule (e.g. "media") whose prelude matches the regex exists. */
  | { cssAt: string; prelude?: string; message: string }
  /** The code matches (or must not match) a regex. */
  | { match: string; flags?: string; message: string }
  | { notMatch: string; flags?: string; message: string };

export interface ExerciseCheck {
  run?: {
    language: RunLanguage;
    tests: TestCase[];
    /** SQL only: statements run before the student's code (tables and rows). */
    setup?: string;
    /** SQL only: a query run after the student's code, whose output is compared. */
    after?: string;
    /**
     * How output is compared. "exact" (default) compares line by line.
     * "tokens" looks only for the words and numbers of the expected output,
     * in order, anywhere in the output, so prompts like "Enter a number:"
     * don't fail a correct answer; numbers compare by value (78.5 = 78.50).
     */
    match?: "exact" | "tokens";
  };
  rules?: Rule[];
}

/** The part stored in track_assignments.exercise (no solution). */
export interface ExerciseSpec {
  editor: EditorLanguage;
  starter: string;
  check: ExerciseCheck;
}

/** An exercise as written in the bank, with a reference solution that must pass. */
export interface ExerciseSeed extends ExerciseSpec {
  title: string;
  brief: string;
  /** Short hints or requirements shown as a checklist. */
  steps: string[];
  level?: "basic" | "intermediate" | "advanced";
  solution: string;
}

export interface CheckItem {
  kind: "test" | "rule";
  label: string;
  passed: boolean;
  hidden?: boolean;
  /** Visible tests only. */
  stdin?: string;
  expected?: string;
  actual?: string;
  /** Compile or runtime error output, trimmed. */
  error?: string;
  /** A plain-language explanation of what differs (visible tests only). */
  hint?: string;
}

/** A comment on one line of the submitted code, from the compiler, the runtime or the static reviewer. */
export interface ReviewFinding {
  line: number | null;
  column?: number;
  /** error: must be fixed (blocks passing); warning: likely a bug; tip: style or good practice. */
  severity: "error" | "warning" | "tip";
  message: string;
  source: "compiler" | "runtime" | "review";
}

export interface CheckReport {
  passed: boolean;
  /** Tests could not run (runner off or unreachable); rules were still checked. */
  runnerUnavailable?: boolean;
  items: CheckItem[];
  summary: string;
  checkedAt: string;
  /** Line-by-line review (assignment questions only). */
  review?: ReviewFinding[];
}
