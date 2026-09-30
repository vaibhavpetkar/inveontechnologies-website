import type { CheckReport } from "../../internships/exercises/types.js";

/** The email a learner gets when an upload fails: what to fix, line by line, and which tests failed. */
export function failureEmail(p: { name: string; courseTitle: string; lessonTitle: string; questionTitle: string; fileName: string | null; report: CheckReport; link: string }) {
  const findings = (p.report.review ?? []).filter((f) => f.severity !== "tip");
  const tests = p.report.items.filter((i) => !i.passed);
  const lines: string[] = [
    `Hi ${p.name},`,
    "",
    `Your answer to "${p.questionTitle}" (${p.lessonTitle}, ${p.courseTitle}) didn't pass the automatic review${p.fileName ? ` (file: ${p.fileName})` : ""}.`,
    "",
    `Result: ${p.report.summary}.`,
  ];
  if (findings.length) {
    lines.push("", "What to fix, line by line:");
    for (const f of findings.slice(0, 15)) lines.push(`- ${f.line ? `Line ${f.line}` : "Whole file"} (${f.severity === "error" ? "must fix" : "check this"}): ${f.message}`);
    if (findings.length > 15) lines.push(`- ...and ${findings.length - 15} more in the portal.`);
  }
  if (tests.length) {
    lines.push("", "Checks that failed:");
    for (const t of tests.slice(0, 8)) {
      if (t.kind === "rule") lines.push(`- Requirement not met: ${t.label}`);
      else if (t.hidden) lines.push(`- ${t.label}: your program gave a wrong answer for a hidden input. Test it with other values, including edge cases (0, negative numbers, the largest values).`);
      else lines.push(`- ${t.label}: input ${JSON.stringify(t.stdin ?? "")}, expected ${JSON.stringify(t.expected ?? "")}, your program printed ${JSON.stringify(t.actual ?? "")}.${t.hint ? ` ${t.hint}` : ""}${t.error ? `\n  Error: ${t.error.split("\n").slice(0, 3).join(" ")}` : ""}`);
    }
  }
  lines.push("", `Fix your code and upload it again here:\n${p.link}`, "", "You can upload as many times as you need. Every upload is reviewed straight away.", "", "Inveon Technologies Learning");
  return { subject: `Fix needed: ${p.questionTitle} (${p.courseTitle})`, text: lines.join("\n") };
}
