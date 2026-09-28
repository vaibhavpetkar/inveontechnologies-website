import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { startServer, JWT_SECRET } from "./helpers.mjs";
import { computeSlip } from "../dist/modules/payroll/calc.js";
import { amountInWords } from "../dist/modules/payroll/pdf.js";
import { createDb } from "../dist/modules/shared/db/client.js";
import { draftMonthlyPayslips, issueDueInternshipCertificates } from "../dist/modules/payroll/service.js";

let api, hr, admin, dbh;
const tokenFor = (user, role) => jwt.sign({ sub: user.id, role }, JWT_SECRET, { expiresIn: "15m" });
const STRUCTURE = [
  { name: "Basic", amount: 20000, kind: "earning" },
  { name: "HRA", amount: 8000, kind: "earning" },
  { name: "Provident fund", amount: 1800, kind: "deduction" },
  { name: "Professional tax", amount: 200, kind: "deduction" },
];

before(async () => {
  api = await startServer();
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
  dbh = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
});
after(async () => {
  await api?.stop();
  await dbh?.pool.end();
});

/** A candidate who passed the HR round of a free program (so their fee is waived). */
async function programMember() {
  const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Program ${randomUUID().slice(0, 6)}`, description: "Free internship program", programFee: 0 } })).json.opportunity;
  await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
  const candidate = await api.createUser("candidate");
  const application = (await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} })).json.application;
  await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus: "under_review" } });
  const interview = (await api.call("POST", `/applications/${application.id}/interviews`, { token: hr.token, body: { interviewerId: hr.id, scheduledAt: new Date(Date.now() + 3600_000).toISOString() } })).json.interview;
  const fb = await api.call("POST", `/interviews/${interview.id}/feedback`, { token: hr.token, body: { feedback: "Strong", decision: "pass" } });
  assert.equal(fb.json.enrollment.status, "waived");
  return { candidate, application, enrollment: fb.json.enrollment };
}

async function hire(opts = {}) {
  const m = await programMember();
  const r = await api.call("POST", `/program/enrollments/${m.enrollment.id}/hire`, { token: hr.token, body: { employeeType: "intern", joiningDate: "2026-09-16", durationMonths: 3, designationTitle: "Software Intern", ...opts } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { ...m, employee: r.json.employee, token: tokenFor(m.candidate, opts.employeeType === "full_time" ? "employee" : "intern") };
}

describe("pay calculation", () => {
  test("a mid-month joiner is paid from their joining day, loss of pay comes off, deductions never exceed pay", () => {
    const joined = computeSlip(STRUCTURE, { period: "2026-09", joiningDate: new Date("2026-09-16T00:00:00Z"), lopDays: 0 });
    assert.equal(joined.daysInMonth, 30);
    assert.equal(joined.payableDays, 15);
    assert.equal(joined.gross, 14000);
    assert.equal(joined.net, 12000);
    const full = computeSlip(STRUCTURE, { period: "2026-10", joiningDate: new Date("2026-09-16T00:00:00Z"), lopDays: 3.5 });
    assert.equal(full.payableDays, 27.5);
    assert.equal(full.earnings[0].amount, Math.round((20000 * 27.5) / 31));
    const tiny = computeSlip([{ name: "Stipend", amount: 1000, kind: "earning" }, { name: "Tax", amount: 5000, kind: "deduction" }], { period: "2026-10", joiningDate: new Date("2026-01-01"), lopDays: 0 });
    assert.equal(tiny.net, 0);
    assert.equal(amountInWords(125400), "One Lakh Twenty Five Thousand Four Hundred Rupees Only");
  });
});

describe("hire from the program", () => {
  test("HR hires a waived candidate: they become an intern with a stipend and the application is selected", async () => {
    const { enrollment, application, employee, candidate } = await hire({ monthlyPay: 15000 });
    assert.match(employee.businessId, /^INV-EMP-/);
    const role = (await api.pool.query("SELECT role FROM users WHERE id = $1", [candidate.id])).rows[0].role;
    assert.equal(role, "intern");
    assert.equal((await api.pool.query("SELECT status FROM applications WHERE id = $1", [application.id])).rows[0].status, "selected");
    const salary = await api.call("GET", `/payroll/employees/${employee.id}/salary`, { token: hr.token });
    assert.equal(salary.json.history[0].components[0].name, "Stipend");
    assert.equal((await api.call("POST", `/program/enrollments/${enrollment.id}/hire`, { token: hr.token, body: { joiningDate: "2026-09-16" } })).status, 409, "only once");
  });

  test("only HR can hire, and only once the fee is settled", async () => {
    const m = await programMember();
    const manager = await api.createUser("manager");
    assert.equal((await api.call("POST", `/program/enrollments/${m.enrollment.id}/hire`, { token: manager.token, body: { joiningDate: "2026-09-16" } })).status, 403);
  });
});

describe("payslips", () => {
  test("HR sets pay, drafts a month, adjusts loss of pay and publishes; the employee only sees it once published", async () => {
    const { employee, token } = await hire();
    assert.equal((await api.call("PUT", `/payroll/employees/${employee.id}/salary`, { token, body: { effectiveFrom: "2026-09-16", components: STRUCTURE } })).status, 403);
    const set = await api.call("PUT", `/payroll/employees/${employee.id}/salary`, { token: hr.token, body: { effectiveFrom: "2026-09-16", components: STRUCTURE } });
    assert.equal(set.status, 201, JSON.stringify(set.json));

    const run = await api.call("POST", "/payroll/run", { token: hr.token, body: { period: "2026-09", employeeIds: [employee.id] } });
    assert.equal(run.json.created, 1);
    const overview = await api.call("GET", "/payroll/overview?period=2026-09", { token: hr.token });
    const row = overview.json.people.find((p) => p.id === employee.id);
    assert.equal(Number(row.net), 12000);
    assert.equal(row.slipStatus, "draft");

    assert.equal((await api.call("GET", `/payroll/slips/${row.slipId}`, { token })).status, 403, "drafts are HR only");
    assert.equal((await api.call("GET", "/payroll/me", { token })).json.slips.length, 0);

    const adj = await api.call("PATCH", `/payroll/slips/${row.slipId}`, { token: hr.token, body: { lopDays: 5 } });
    assert.equal(Number(adj.json.slip.payableDays), 10);
    assert.equal(Number(adj.json.slip.gross), Math.round((20000 * 10) / 30) + Math.round((8000 * 10) / 30));

    const pub = await api.call("POST", "/payroll/publish", { token: hr.token, body: { period: "2026-09", ids: [row.slipId] } });
    assert.equal(pub.json.published, 1);
    assert.equal((await api.call("PATCH", `/payroll/slips/${row.slipId}`, { token: hr.token, body: { lopDays: 0 } })).status, 409, "published slips are final");
    const rerun = await api.call("POST", "/payroll/run", { token: hr.token, body: { period: "2026-09", employeeIds: [employee.id] } });
    assert.equal(rerun.json.skipped[0].reason, "published");

    const me = await api.call("GET", "/payroll/me", { token });
    assert.equal(me.json.slips.length, 1);
    assert.equal(me.json.slips[0].periodLabel, "September 2026");
    const note = await api.pool.query("SELECT link FROM notifications WHERE user_id = $1 AND kind = 'payroll.payslip'", [employee.userId]);
    assert.equal(note.rows[0].link, `/payslips?slip=${row.slipId}`);

    const pdf = await fetch(`${api.base}/payroll/slips/${row.slipId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal((await pdf.arrayBuffer()).byteLength > 1000, true);

    const other = await hire();
    assert.equal((await api.call("GET", `/payroll/slips/${row.slipId}`, { token: other.token })).status, 403);
  });

  test("the monthly job drafts missing slips from the draft day and tells HR", async () => {
    const { employee } = await hire({ joiningDate: "2026-08-01" });
    await api.call("PUT", `/payroll/employees/${employee.id}/salary`, { token: hr.token, body: { effectiveFrom: "2026-08-01", components: STRUCTURE } });
    assert.equal(await draftMonthlyPayslips(dbh.db, 25, new Date("2026-10-10T06:00:00Z")), 0, "not before the draft day");
    const made = await draftMonthlyPayslips(dbh.db, 25, new Date("2026-10-26T06:00:00Z"));
    assert.ok(made >= 1);
    const slip = await api.pool.query("SELECT status, generated_by FROM payslips WHERE employee_id = $1 AND period = '2026-10'", [employee.id]);
    assert.equal(slip.rows[0].status, "draft");
    assert.equal(slip.rows[0].generated_by, null);
    const hrNote = await api.pool.query("SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'payroll.drafts_ready'", [hr.id]);
    assert.ok(hrNote.rowCount >= 1);
  });
});

describe("completion certificates", () => {
  test("an intern's certificate is issued automatically when the internship ends, once, and verifies publicly", async () => {
    const { employee } = await hire({ joiningDate: "2026-01-05", durationMonths: 3 });
    await api.pool.query("UPDATE employees SET status = 'active' WHERE id = $1", [employee.id]);
    await issueDueInternshipCertificates(dbh.db, "https://portal.test", new Date("2026-04-10T00:00:00Z"));
    await issueDueInternshipCertificates(dbh.db, "https://portal.test", new Date("2026-04-11T00:00:00Z"));
    const certs = (await api.call("GET", `/payroll/employees/${employee.id}/certificates`, { token: hr.token })).json.certificates;
    assert.equal(certs.length, 1);
    assert.equal(certs[0].kind, "internship_completion");
    assert.equal(certs[0].roleTitle, "Software Intern");
    assert.equal(certs[0].toDate.slice(0, 10), "2026-04-04");
    assert.match(certs[0].businessId, /^INV-EXP-\d{4}-\d{6}$/);

    const verify = await api.call("GET", `/certificates/verify/${certs[0].verificationCode}`);
    assert.equal(verify.status, 200);
    assert.equal(verify.json.valid, true);
    assert.equal(verify.json.courseTitle, "Internship Completion Certificate: Software Intern");
    assert.equal(verify.json.recipientName, "Test candidate");
    const pdf = await fetch(`${api.base}/certificates/verify/${certs[0].verificationCode}/pdf`);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");

    await api.call("POST", `/payroll/certificates/${certs[0].id}/revoke`, { token: hr.token, body: { reason: "Issued in error" } });
    assert.equal((await api.call("GET", `/certificates/verify/${certs[0].verificationCode}`)).json.valid, false);
  });

  test("offboarding someone issues their experience certificate", async () => {
    const { employee, token } = await hire({ employeeType: "full_time", durationMonths: undefined, designationTitle: "Developer" });
    const r = await api.call("PUT", `/people/${employee.id}`, { token: hr.token, body: { status: "offboarded" } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const me = await api.call("GET", "/payroll/me", { token });
    assert.equal(me.json.certificates.length, 1);
    assert.equal(me.json.certificates[0].kind, "experience");
    const again = await api.call("POST", `/payroll/employees/${employee.id}/certificates`, { token: hr.token, body: {} });
    assert.equal(again.json.created, false, "no duplicates");
  });
});
