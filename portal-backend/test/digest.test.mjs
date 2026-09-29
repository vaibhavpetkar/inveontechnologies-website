import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api, manager, db, pool, digest;

before(async () => {
  api = await startServer();
  manager = await api.createUser("manager");
  ({ db, pool } = (await import("../dist/modules/shared/db/client.js")).createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL }));
  digest = await import("../dist/modules/notifications/digest.js");
});
after(async () => {
  await pool?.end();
  await api?.stop();
});

const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const istTime = (hhmm, dayOffset = 0) => new Date(new Date(`${today}T${hhmm}:00+05:30`).getTime() + dayOffset * 86_400_000);
const mailTo = async (email) => (await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1 AND payload->>'text' LIKE 'Good morning%'", [email])).rows.map((r) => r.payload);

async function runUntilDone(now) {
  for (let i = 0; i < 100; i++) {
    const { sent, skipped } = await digest.sendDailyDigests(db, now);
    if (sent + skipped === 0) return;
  }
}

describe("daily digest", () => {
  test("nothing goes out before 8 AM IST", async () => {
    const r = await digest.sendDailyDigests(db, istTime("07:45"));
    assert.deepEqual(r, { sent: 0, skipped: 0 });
  });

  test("one morning email with today's tasks, what's overdue and unread notifications; sent once", async () => {
    const emp = await api.createUser("employee");
    const due = await api.call("POST", "/tasks", { token: manager.token, body: { title: "Ship the payroll export", assigneeId: emp.id, dueDate: istTime("17:00").toISOString() } });
    assert.equal(due.status, 201, JSON.stringify(due.json));
    await api.call("POST", "/tasks", { token: manager.token, body: { title: "Old report", assigneeId: emp.id, dueDate: istTime("12:00", -2).toISOString() } });

    const d = await digest.buildDigest(db, { id: emp.id, role: "employee" }, istTime("08:30"));
    assert.deepEqual(d.today.map((t) => t.label), ["Task due: Ship the payroll export"]);
    assert.equal(d.overdueTasks, 1);
    assert.equal(d.unread.total, 2); // the two "task assigned" notifications

    await runUntilDone(istTime("08:30"));
    await runUntilDone(istTime("09:40"));
    const mail = await mailTo(emp.email);
    assert.equal(mail.length, 1);
    assert.match(mail[0].subject, /1 thing on today/);
    assert.match(mail[0].text, /Task due: Ship the payroll export/);
    assert.match(mail[0].text, /1 overdue task/);
    assert.match(mail[0].text, /2 unread notifications/);
  });

  test("people who turned it off, or have nothing on, get no email", async () => {
    const quiet = await api.createUser("employee");
    const optedOut = await api.createUser("employee");
    await api.call("POST", "/tasks", { token: manager.token, body: { title: "Something", assigneeId: optedOut.id, dueDate: istTime("18:00").toISOString() } });

    const prefs = await api.call("PUT", "/notification-preferences", { token: optedOut.token, body: { digestEnabled: false } });
    assert.equal(prefs.json.preferences.digestEnabled, false);
    assert.equal((await api.call("GET", "/notification-preferences", { token: quiet.token })).json.preferences.digestEnabled, true);

    await runUntilDone(istTime("08:30", 1));
    assert.equal((await mailTo(quiet.email)).length, 0);
    assert.equal((await mailTo(optedOut.email)).length, 0);
    const claimed = (await api.pool.query("SELECT user_id FROM digest_sends WHERE user_id = ANY($1)", [[quiet.id, optedOut.id]])).rows.map((r) => r.user_id);
    assert.deepEqual(claimed, [quiet.id]); // checked, nothing to say
  });

  test("managers see leave waiting on them", async () => {
    const d = await digest.buildDigest(db, { id: manager.id, role: "manager" }, istTime("08:30"));
    assert.equal(typeof d.leaveWaiting, "number");
    const text = digest.digestEmail({ unread: { total: 0, titles: [] }, today: [], overdueTasks: 0, leaveWaiting: 2 }, "Priya Sharma", istTime("08:30")).text;
    assert.match(text, /^Good morning Priya/);
    assert.match(text, /2 leave requests to decide/);
  });
});
