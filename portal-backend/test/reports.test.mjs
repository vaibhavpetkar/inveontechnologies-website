import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { startServer } from "./helpers.mjs";
import { crc32 } from "../dist/modules/reports/zip.js";

let api, hr, admin;

before(async () => {
  api = await startServer();
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
});
after(async () => {
  await api?.stop();
});

async function download(token, body) {
  const res = await fetch(`${api.base}/reports/export`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, type: res.headers.get("content-type"), disposition: res.headers.get("content-disposition"), buf: Buffer.from(await res.arrayBuffer()) };
}

/** Reads the files out of a zip written by zip.ts (local headers, deflate), checking each CRC. */
function unzip(buf) {
  const files = {};
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString();
    const data = inflateRawSync(buf.subarray(at + 30 + nameLen, at + 30 + nameLen + size));
    assert.equal(crc32(data), buf.readUInt32LE(at + 14), `CRC of ${name}`);
    files[name] = data.toString();
    at += 30 + nameLen + size;
  }
  return files;
}

describe("reports", () => {
  test("HR sees operational reports; employee data and the audit log are admin only", async () => {
    const hrList = (await api.call("GET", "/reports", { token: hr.token })).json.reports.map((r) => r.key);
    assert.ok(hrList.includes("attendance") && hrList.includes("payroll") && hrList.includes("applications"));
    assert.ok(!hrList.includes("employees") && !hrList.includes("audit-logs"));
    const adminList = (await api.call("GET", "/reports", { token: admin.token })).json.reports.map((r) => r.key);
    assert.ok(adminList.includes("employees") && adminList.includes("audit-logs"));
    assert.equal((await download(hr.token, { reportKey: "employees", format: "xlsx" })).status, 403);
    const employee = await api.createUser("employee");
    assert.equal((await api.call("GET", "/reports", { token: employee.token })).status, 403);
  });

  test("reports show names and titles, not ids", async () => {
    const candidate = await api.createUser("candidate");
    await api.pool.query("UPDATE candidate_profiles SET full_name = 'Asha =Rao' WHERE user_id = $1", [candidate.id]);
    const r = await api.call("GET", "/reports/candidates?limit=500", { token: hr.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.columns[0].label, "Name");
    assert.ok(r.json.rows.every((row) => row.role === "candidate"));
    assert.ok(r.json.rows.some((row) => row.name === "Asha =Rao" && row.email === candidate.email));
  });

  test("Excel export is a real workbook with a header row, numbers and dates", async () => {
    const candidate = await api.createUser("candidate");
    await api.pool.query("UPDATE candidate_profiles SET full_name = '=HYPERLINK(\"x\") & <Co>' WHERE user_id = $1", [candidate.id]);
    const f = await download(hr.token, { reportKey: "candidates", format: "xlsx" });
    assert.equal(f.status, 200);
    assert.match(f.type, /spreadsheetml/);
    assert.match(f.disposition, /candidates-\d{4}-\d{2}-\d{2}\.xlsx/);
    const files = unzip(f.buf);
    assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = files["xl/worksheets/sheet1.xml"];
    assert.match(sheet, /<c r="A1" t="inlineStr" s="4"><is><t>Name<\/t>/);
    assert.match(sheet, /<pane ySplit="1"/);
    // Text is escaped and stored as a string, never as a formula.
    assert.ok(sheet.includes("=HYPERLINK(&quot;x&quot;) &amp; &lt;Co&gt;"));
    assert.ok(!sheet.includes("<f>"));
    // Registered is a real date cell (style 2), Applications a number.
    assert.match(sheet, /<c r="F\d+" s="2"><v>\d+\.?\d*<\/v><\/c>/);
    assert.match(sheet, /<c r="E\d+" s="0"><v>0<\/v><\/c>/);
    assert.match(files["xl/workbook.xml"], /<sheet name="Candidates"/);
  });

  test("PDF and CSV exports", async () => {
    const pdf = await download(hr.token, { reportKey: "applications", format: "pdf", from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T23:59:59.000Z" });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.type, "application/pdf");
    assert.equal(pdf.buf.subarray(0, 5).toString(), "%PDF-");
    const csv = await download(hr.token, { reportKey: "candidates", format: "csv" });
    assert.match(csv.buf.toString().split("\n")[0], /^Name,Email,Phone,Profile complete,Applications,Registered$/);
    const jobs = await api.call("GET", "/reports/export/jobs", { token: admin.token });
    assert.ok(jobs.json.jobs.some((j) => j.format === "pdf" && j.status === "completed"));
  });

  test("attendance and payroll reports", async () => {
    const user = await api.createUser("intern", { profile: true });
    const { rows } = await api.pool.query(
      "INSERT INTO employees (user_id, employee_type, joining_date, status, portal_access_active, created_by) VALUES ($1, 'intern', '2026-01-01', 'active', true, $2) RETURNING id",
      [user.id, hr.id],
    );
    const id = rows[0].id;
    // Mon 5 to Fri 9 Oct 2026: present Mon, half day Tue, absent Wed, leave Thu, nothing Fri.
    await api.pool.query("INSERT INTO attendance_records (employee_id, date, status, work_mode, check_in_at) VALUES ($1, '2026-10-05', 'present', 'remote', now())", [id]);
    await api.pool.query("INSERT INTO attendance_records (employee_id, date, status, marked_by) VALUES ($1, '2026-10-06', 'half_day', $2), ($1, '2026-10-07', 'absent', $2)", [id, hr.id]);
    await api.pool.query("INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status) VALUES ($1, 'casual', '2026-10-08', '2026-10-08', 1, 'Errand', 'approved')", [id]);
    const r = await api.call("GET", `/reports/attendance?from=2026-10-04T18:30:00.000Z&to=2026-10-09T18:29:00.000Z&limit=500`, { token: hr.token });
    const me = r.json.rows.find((x) => x.id === id);
    assert.deepEqual(
      { workingDays: me.workingDays, present: me.present, halfDays: me.halfDays, absent: me.absent, leaveDays: me.leaveDays, unrecorded: me.unrecorded, remoteDays: me.remoteDays },
      { workingDays: 5, present: 1, halfDays: 1, absent: 1, leaveDays: 1, unrecorded: 1, remoteDays: 1 },
    );
    const leave = await api.call("GET", `/reports/leave?limit=500`, { token: hr.token });
    assert.ok(leave.json.rows.some((l) => l.reason === "Errand" && l.days === 1));
    const x = await download(hr.token, { reportKey: "payroll", format: "xlsx" });
    assert.equal(x.status, 200);
  });
});
