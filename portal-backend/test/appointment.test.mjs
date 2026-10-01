import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startServer, JWT_SECRET } from "./helpers.mjs";
import { createDb } from "../dist/modules/shared/db/client.js";
import { createEmployeeRecord } from "../dist/modules/employees/onboarding.js";
import { parseRichText } from "../dist/modules/shared/letter-pdf.js";

let api, admin, hr, dbh;
const tokenFor = (user, role) => jwt.sign({ sub: user.id, role }, JWT_SECRET, { expiresIn: "15m" });

before(async () => {
  api = await startServer();
  admin = await api.createUser("admin");
  hr = await api.createUser("hr");
  dbh = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
});
after(async () => {
  await api?.stop();
  await dbh?.pool.end();
});

async function newIntern() {
  const user = await api.createUser("candidate");
  const employee = await createEmployeeRecord(dbh.db, { userId: user.id, employeeType: "intern", joiningDate: new Date("2026-10-05T00:00:00Z"), durationMonths: 6, createdBy: hr.id });
  return { user, employee, token: tokenFor(user, "intern") };
}

async function waitFor(check, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await check();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

describe("company policies", () => {
  test("defaults are seeded, anyone signed in can read and download them, only admins edit", async () => {
    const list = await api.call("GET", "/policies", { token: hr.token });
    assert.equal(list.status, 200);
    const slugs = list.json.policies.map((p) => p.slug);
    for (const slug of ["code-of-conduct", "leave-and-attendance", "information-security", "confidentiality-and-ip", "posh", "internship-program", "remote-work"]) assert.ok(slugs.includes(slug), slug);

    const policy = list.json.policies.find((p) => p.slug === "posh");
    const pdf = await fetch(`${api.base}/policies/${policy.id}/pdf`, { headers: { Authorization: `Bearer ${hr.token}` } });
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");

    assert.equal((await api.call("PUT", `/policies/${policy.id}`, { token: hr.token, body: { summary: "x".repeat(10) } })).status, 403);
    const summaryOnly = await api.call("PUT", `/policies/${policy.id}`, { token: admin.token, body: { summary: "Updated summary line" } });
    assert.equal(summaryOnly.json.policy.version, policy.version, "a summary edit isn't a new version");
    const reworded = await api.call("PUT", `/policies/${policy.id}`, { token: admin.token, body: { body: `${policy.body}\n\n## Contact\nWrite to the Internal Committee.` } });
    assert.equal(reworded.json.policy.version, policy.version + 1);
  });

  test("the policy text format becomes headings, paragraphs and bullets", () => {
    const blocks = parseRichText("Intro line\ncontinues here.\n\n## Rules\n- one\n- two\nAfter");
    assert.deepEqual(blocks.map((b) => b.kind), ["para", "heading", "bullets", "para"]);
    assert.equal(blocks[0].text, "Intro line continues here.");
    assert.deepEqual(blocks[2].items, ["one", "two"]);
  });
});

describe("appointment letters", () => {
  test("only admins issue; the letter is emailed with every policy attached, and HR sees it", async () => {
    const { employee } = await newIntern();
    const defaults = await api.call("GET", `/employees/${employee.id}/appointment-defaults`, { token: hr.token });
    assert.equal(defaults.status, 200);
    assert.equal(defaults.json.defaults.durationMonths, 6);
    assert.equal(defaults.json.defaults.noticeDays, 7);
    assert.ok(defaults.json.policies.length >= 7);

    const body = { ...defaults.json.defaults, designation: "Full Stack Developer Intern", monthlyPay: 5000, signatoryName: "Vaibhav Petkar", signatoryTitle: "Director" };
    assert.equal((await api.call("POST", `/employees/${employee.id}/appointment-letter`, { token: hr.token, body })).status, 403, "HR can't issue");

    const issued = await api.call("POST", `/employees/${employee.id}/appointment-letter`, { token: admin.token, body });
    assert.equal(issued.status, 201, JSON.stringify(issued.json));
    const letter = issued.json.letter;
    assert.match(letter.referenceNo, /^INV\/HR\/APT\/\d{4}\/\d{4}$/);
    assert.equal(letter.details.endDate, "2027-04-04");
    assert.equal(letter.policies.length, defaults.json.policies.length);

    const emailed = await waitFor(async () => (await api.pool.query("SELECT emailed_at FROM employee_letters WHERE id = $1", [letter.id])).rows[0].emailed_at);
    assert.ok(emailed, "the email job ran");
    assert.match(api.logs(), /Appointment-Letter-.*\.pdf/);
    assert.match(api.logs(), /Prevention-of-Sexual-Harassment-POSH-Policy-v\d+\.pdf/);

    const pdf = await fetch(`${api.base}/appointment-letters/${letter.id}/pdf`, { headers: { Authorization: `Bearer ${hr.token}` } });
    assert.equal(pdf.status, 200);
    assert.ok((await pdf.arrayBuffer()).byteLength > 2000);
  });

  test("the employee accepts it, which ticks their policy and letter checklist items; others can't read it", async () => {
    const { employee, token } = await newIntern();
    const defaults = (await api.call("GET", `/employees/${employee.id}/appointment-defaults`, { token: admin.token })).json;
    const first = (await api.call("POST", `/employees/${employee.id}/appointment-letter`, { token: admin.token, body: { ...defaults.defaults, designation: "React Intern", signatoryName: "A Admin", signatoryTitle: "Director", sendEmail: false } })).json.letter;
    const second = (await api.call("POST", `/employees/${employee.id}/appointment-letter`, { token: admin.token, body: { ...defaults.defaults, designation: "React Developer Intern", signatoryName: "A Admin", signatoryTitle: "Director", sendEmail: false, policyIds: defaults.policies.slice(0, 2).map((p) => p.id) } })).json.letter;
    assert.equal(second.version, 2);
    assert.equal(second.policies.length, 2);

    const other = await newIntern();
    assert.equal((await api.call("GET", `/employees/${employee.id}/appointment-letters`, { token: other.token })).status, 403);
    assert.equal((await fetch(`${api.base}/appointment-letters/${second.id}/pdf`, { headers: { Authorization: `Bearer ${other.token}` } })).status, 403);

    const mine = await api.call("GET", `/employees/${employee.id}/appointment-letters`, { token });
    assert.deepEqual(mine.json.letters.map((l) => l.version), [2, 1]);
    assert.equal(mine.json.canIssue, false);

    assert.equal((await api.call("POST", `/appointment-letters/${first.id}/accept`, { token, body: { fullName: "Test Intern" } })).json.error.code, "LETTER_SUPERSEDED");
    assert.equal((await api.call("POST", `/appointment-letters/${second.id}/accept`, { token: other.token, body: { fullName: "Someone" } })).status, 403);
    const accepted = await api.call("POST", `/appointment-letters/${second.id}/accept`, { token, body: { fullName: "Test Intern" } });
    assert.equal(accepted.status, 200);
    assert.equal((await api.call("POST", `/appointment-letters/${second.id}/accept`, { token, body: { fullName: "Test Intern" } })).status, 409);

    const tasks = (await api.call("GET", `/employees/${employee.id}/onboarding-tasks`, { token })).json.tasks;
    assert.equal(tasks.find((t) => t.taskType === "policy_consent").status, "completed");
    assert.equal(tasks.find((t) => /appointment letter/i.test(t.title)).status, "completed");
    assert.equal(tasks.find((t) => /government ID/i.test(t.title)).status, "pending");

    const policyPdf = await fetch(`${api.base}/appointment-letters/${second.id}/policies/${second.policies[0].slug}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(policyPdf.status, 200);
  });
});
