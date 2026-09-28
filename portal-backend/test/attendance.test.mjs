import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";
import { createDb } from "../dist/modules/shared/db/client.js";
import { suggestedLopDays, todayIst } from "../dist/modules/attendance/service.js";
import { generatePayslips } from "../dist/modules/payroll/service.js";

let api, hr, dbh;

before(async () => {
  api = await startServer();
  hr = await api.createUser("hr");
  dbh = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
});
after(async () => {
  await api?.stop();
  await dbh?.pool.end();
});

/** An active employee of the given type, reporting to `managerId`. */
async function employee(role = "intern", { type = "intern", managerId = null } = {}) {
  const user = await api.createUser(role, { profile: true });
  const { rows } = await api.pool.query(
    "INSERT INTO employees (user_id, employee_type, manager_id, joining_date, status, portal_access_active, created_by) VALUES ($1, $2, $3, '2026-01-01', 'active', true, $4) RETURNING id",
    [user.id, type, managerId, hr.id],
  );
  return { ...user, employeeId: rows[0].id };
}

const notificationsFor = async (userId, kind) => (await api.pool.query("SELECT title FROM notifications WHERE user_id = $1 AND kind = $2", [userId, kind])).rows;

describe("attendance", () => {
  test("people check in once a day and check out; people who aren't on the team can't", async () => {
    const me = await employee();
    const out0 = await api.call("POST", "/attendance/check-out", { token: me.token });
    assert.equal(out0.status, 409);
    const inn = await api.call("POST", "/attendance/check-in", { token: me.token, body: { workMode: "remote" } });
    assert.equal(inn.status, 201, JSON.stringify(inn.json));
    assert.equal(inn.json.record.workMode, "remote");
    assert.equal((await api.call("POST", "/attendance/check-in", { token: me.token, body: {} })).json.error.code, "ALREADY_CHECKED_IN");
    const out = await api.call("POST", "/attendance/check-out", { token: me.token });
    assert.equal(out.status, 200);
    assert.ok(out.json.record.checkOutAt);

    const month = await api.call("GET", "/attendance/me", { token: me.token });
    assert.equal(month.json.todayRecord.id, inn.json.record.id);
    assert.ok(month.json.days.length >= 28);

    const candidate = await api.createUser("candidate");
    assert.equal((await api.call("POST", "/attendance/check-in", { token: candidate.token, body: {} })).json.error.code, "NOT_AN_EMPLOYEE");
  });

  test("managers see and mark only their team; HR sees everyone", async () => {
    const manager = await api.createUser("manager");
    const mine = await employee("intern", { managerId: manager.id });
    const other = await employee();
    const team = await api.call("GET", "/attendance/team", { token: manager.token });
    assert.equal(team.status, 200);
    assert.deepEqual(team.json.people.map((p) => p.employeeId), [mine.employeeId]);
    const all = await api.call("GET", "/attendance/team", { token: hr.token });
    assert.ok(all.json.people.some((p) => p.employeeId === other.employeeId));

    const today = todayIst();
    const mark = await api.call("PUT", `/attendance/${mine.employeeId}/${today}`, { token: manager.token, body: { status: "absent", note: "No show" } });
    assert.equal(mark.status, 200, JSON.stringify(mark.json));
    assert.equal(mark.json.record.status, "absent");
    assert.equal((await api.call("PUT", `/attendance/${other.employeeId}/${today}`, { token: manager.token, body: { status: "absent" } })).status, 403);
    assert.equal((await api.call("PUT", `/attendance/${mine.employeeId}/2999-01-01`, { token: hr.token, body: { status: "absent" } })).json.error.code, "FUTURE_DATE");
    const cleared = await api.call("PUT", `/attendance/${mine.employeeId}/${today}`, { token: manager.token, body: { status: null } });
    assert.equal(cleared.json.record, null);
    assert.equal((await api.call("PUT", `/attendance/${mine.employeeId}/${today}`, { token: mine.token, body: { status: "present" } })).status, 403);
  });
});

describe("leave", () => {
  test("requests count working days, respect balances and overlaps, and go to the manager", async () => {
    const holiday = await api.call("POST", "/holidays", { token: hr.token, body: { date: "2026-11-04", name: "Test holiday" } });
    assert.ok([201, 409].includes(holiday.status));
    const manager = await api.createUser("manager");
    const me = await employee("intern", { managerId: manager.id });

    // Mon 2 Nov to Fri 6 Nov, with a holiday on Wednesday: 4 days.
    assert.equal((await api.call("GET", "/leave/days?start=2026-11-02&end=2026-11-06", { token: me.token })).json.days, 4);
    const r = await api.call("POST", "/leave", { token: me.token, body: { leaveType: "casual", startDate: "2026-11-02", endDate: "2026-11-06", reason: "Family function" } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(Number(r.json.request.days), 4);
    assert.equal((await notificationsFor(manager.id, "leave.requested")).length, 1);

    const casual = (await api.call("GET", "/leave/me?year=2026", { token: me.token })).json.balances.find((b) => b.type === "casual");
    assert.deepEqual([casual.allowance, casual.pending, casual.remaining], [6, 4, 2]);

    const tooMuch = await api.call("POST", "/leave", { token: me.token, body: { leaveType: "casual", startDate: "2026-11-09", endDate: "2026-11-13", reason: "Trip" } });
    assert.equal(tooMuch.json.error.code, "INSUFFICIENT_BALANCE");
    const overlap = await api.call("POST", "/leave", { token: me.token, body: { leaveType: "unpaid", startDate: "2026-11-06", endDate: "2026-11-06", reason: "Overlap" } });
    assert.equal(overlap.json.error.code, "LEAVE_OVERLAP");
    const weekend = await api.call("POST", "/leave", { token: me.token, body: { leaveType: "unpaid", startDate: "2026-11-07", endDate: "2026-11-08", reason: "Weekend" } });
    assert.equal(weekend.json.error.code, "NO_WORKING_DAYS");
    const badHalf = await api.call("POST", "/leave", { token: me.token, body: { leaveType: "sick", startDate: "2026-11-09", endDate: "2026-11-10", halfDay: true, reason: "Doctor" } });
    assert.equal(badHalf.status, 400);

    // Only their manager or HR decides.
    const stranger = await api.createUser("manager");
    assert.equal((await api.call("GET", "/leave/requests", { token: stranger.token })).json.requests.length, 0);
    assert.equal((await api.call("POST", `/leave/${r.json.request.id}/decide`, { token: stranger.token, body: { approve: true } })).status, 403);
    const queue = await api.call("GET", "/leave/requests", { token: manager.token });
    assert.deepEqual(queue.json.requests.map((x) => x.id), [r.json.request.id]);
    const ok = await api.call("POST", `/leave/${r.json.request.id}/decide`, { token: manager.token, body: { approve: true, note: "Enjoy" } });
    assert.equal(ok.json.request.status, "approved");
    assert.equal((await api.call("POST", `/leave/${r.json.request.id}/decide`, { token: hr.token, body: { approve: false } })).json.error.code, "ALREADY_DECIDED");
    assert.equal((await notificationsFor(me.id, "leave.approved")).length, 1);

    // The person can still cancel approved leave that hasn't started.
    const cancel = await api.call("POST", `/leave/${r.json.request.id}/cancel`, { token: me.token });
    assert.equal(cancel.json.request.status, "cancelled");
  });

  test("with no manager, HR is asked; nobody approves their own leave", async () => {
    const hrPerson = await employee("hr", { type: "full_time" });
    const r = await api.call("POST", "/leave", { token: hrPerson.token, body: { leaveType: "sick", startDate: "2026-12-07", endDate: "2026-12-07", halfDay: true, reason: "Dentist" } });
    assert.equal(r.status, 201);
    assert.equal(Number(r.json.request.days), 0.5);
    assert.equal((await notificationsFor(hr.id, "leave.requested")).length >= 1, true);
    assert.equal((await api.call("POST", `/leave/${r.json.request.id}/decide`, { token: hrPerson.token, body: { approve: true } })).status, 403);
    const own = await api.call("GET", "/leave/requests", { token: hrPerson.token });
    assert.ok(!own.json.requests.some((x) => x.id === r.json.request.id));
  });

  test("HR sets the yearly allowance", async () => {
    const put = await api.call("PUT", "/leave/policies", { token: hr.token, body: { policies: [{ employeeType: "contract", leaveType: "earned", daysPerYear: 5 }] } });
    assert.equal(put.status, 200);
    assert.equal(Number(put.json.policies.find((p) => p.employeeType === "contract" && p.leaveType === "earned").daysPerYear), 5);
    const me = await employee();
    assert.equal((await api.call("PUT", "/leave/policies", { token: me.token, body: { policies: [{ employeeType: "intern", leaveType: "casual", daysPerYear: 60 }] } })).status, 403);
  });

  test("unpaid leave and absences become the loss-of-pay days on a new payslip draft", async () => {
    const me = await employee();
    await api.pool.query(
      "INSERT INTO salary_structures (employee_id, effective_from, components, created_by) VALUES ($1, '2026-01-01', $2, $3)",
      [me.employeeId, JSON.stringify([{ name: "Stipend", amount: 30000, kind: "earning" }]), hr.id],
    );
    // Mon 9 to Tue 10 Nov unpaid (2 days), absent on Thu 12, half day on Fri 13.
    const r = await api.call("POST", "/leave", { token: me.token, body: { leaveType: "unpaid", startDate: "2026-11-09", endDate: "2026-11-10", reason: "Travel" } });
    await api.call("POST", `/leave/${r.json.request.id}/decide`, { token: hr.token, body: { approve: true } });
    await api.pool.query("INSERT INTO attendance_records (employee_id, date, status, marked_by) VALUES ($1, '2026-11-12', 'absent', $2), ($1, '2026-11-13', 'half_day', $2)", [me.employeeId, hr.id]);
    // A mark on a day already on leave doesn't count twice.
    await api.pool.query("INSERT INTO attendance_records (employee_id, date, status, marked_by) VALUES ($1, '2026-11-10', 'absent', $2)", [me.employeeId, hr.id]);
    assert.equal(await suggestedLopDays(dbh.db, me.employeeId, "2026-11"), 3.5);
    const out = await generatePayslips(dbh.db, "2026-11", { actorUserId: hr.id, employeeIds: [me.employeeId] });
    assert.equal(Number(out.created[0].lopDays), 3.5);
    assert.equal(Number(out.created[0].payableDays), 26.5);
  });
});
