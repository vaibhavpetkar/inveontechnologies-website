// Onboarding automation and the People directory, against a real Postgres.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer, createOpportunityWithApplication } from "./helpers.mjs";

let api, admin, hr, superAdmin;

before(async () => {
  api = await startServer();
  admin = await api.createUser("admin");
  hr = await api.createUser("hr");
  superAdmin = await api.createUser("super_admin");
});
after(async () => api?.stop());

async function acceptedOffer(terms = {}) {
  const manager = await api.createUser("manager");
  const { application, candidate } = await createOpportunityWithApplication(api, { hr, admin, hiringManagerId: manager.id });
  for (const toStatus of ["under_review", "shortlisted", "selected"]) {
    await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus } });
  }
  const offer = (await api.call("POST", `/applications/${application.id}/offers`, { token: hr.token, body: { content: "Internship offer, 6 months, stipend 20k", ...terms } })).json.offer;
  await api.call("POST", `/offers/${offer.id}/send`, { token: admin.token });
  const accepted = await api.call("POST", `/offers/${offer.id}/accept`, { token: candidate.token });
  return { accepted, candidate, manager, application };
}

describe("automatic onboarding", () => {
  test("accepting an offer with terms creates the employee, role and checklist", async () => {
    const { accepted, candidate, manager } = await acceptedOffer({ employeeType: "intern", joiningDate: "2026-11-02T04:00:00.000Z", durationMonths: 6 });
    assert.equal(accepted.status, 200);
    assert.match(accepted.json.employee.businessId, /^INV-EMP-/);
    assert.equal(accepted.json.employee.managerId, manager.id);

    const { rows } = await api.pool.query("SELECT role FROM users WHERE id = $1", [candidate.id]);
    assert.equal(rows[0].role, "intern");
    const tasks = (await api.call("GET", `/employees/${accepted.json.employee.id}/onboarding-tasks`, { token: candidate.token })).json.tasks;
    assert.ok(tasks.length >= 5);
    assert.ok(tasks.some((t) => t.title.includes("mentor"))); // intern-only step

    const kinds = async (u) => (await api.call("GET", "/notifications", { token: u.token })).json.notifications.map((n) => n.kind);
    assert.ok((await kinds(candidate)).includes("onboarding.started"));
    assert.ok((await kinds(manager)).includes("team.joined"));
    assert.ok((await kinds(hr)).includes("onboarding.started"));
  });

  test("an offer without terms asks HR to finish onboarding instead", async () => {
    const { accepted } = await acceptedOffer();
    assert.equal(accepted.json.employee, null);
    const inbox = (await api.call("GET", "/notifications", { token: hr.token })).json.notifications;
    assert.ok(inbox.some((n) => n.kind === "onboarding.needs_hr"));
  });

  test("finishing the required checklist tells HR, and activation completes it", async () => {
    const { accepted, candidate } = await acceptedOffer({ employeeType: "full_time", joiningDate: "2026-11-02T04:00:00.000Z" });
    const employeeId = accepted.json.employee.id;
    const tasks = (await api.call("GET", `/employees/${employeeId}/onboarding-tasks`, { token: candidate.token })).json.tasks;
    assert.equal((await api.call("POST", `/employees/${employeeId}/activate-access`, { token: hr.token })).status, 400);
    for (const t of tasks.filter((t) => t.required)) {
      assert.equal((await api.call("POST", `/employees/onboarding-tasks/${t.id}/complete`, { token: candidate.token })).status, 200);
    }
    const inbox = (await api.call("GET", "/notifications", { token: hr.token })).json.notifications;
    assert.ok(inbox.some((n) => n.kind === "onboarding.ready"));

    assert.equal((await api.call("POST", `/employees/${employeeId}/activate-access`, { token: hr.token })).status, 200);
    const after = (await api.call("GET", `/employees/${employeeId}/onboarding-tasks`, { token: candidate.token })).json.tasks;
    assert.equal(after.find((t) => t.taskType === "access_activation").status, "completed");
  });
});

describe("people directory and invites", () => {
  test("HR invites one person: account, record, welcome email with a set-password link", async () => {
    const manager = await api.createUser("manager");
    const email = `new.joiner.${Date.now()}@example.com`;
    const r = await api.call("POST", "/people/invite", {
      token: hr.token,
      body: { email, fullName: "New Joiner", employeeType: "full_time", departmentName: "Engineering", designationTitle: "Software Engineer", managerEmail: manager.email, joiningDate: "2026-10-05" },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.newAccount, true);

    const people = (await api.call("GET", "/people", { token: hr.token })).json.people;
    const me = people.find((p) => p.email === email);
    assert.equal(me.name, "New Joiner");
    assert.equal(me.department, "Engineering");
    assert.equal(me.role, "employee");
    assert.ok(me.tasksTotal >= 5);

    const { rows } = await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1", [email]);
    assert.match(rows[0].payload.text, /reset-password\?token=/);

    // Same department name in a different case is reused, not duplicated.
    await api.call("POST", "/people/invite", { token: hr.token, body: { email: `b.${email}`, employeeType: "intern", departmentName: "engineering", joiningDate: "2026-10-05" } });
    const { rows: deps } = await api.pool.query("SELECT count(*)::int AS n FROM departments WHERE lower(name) = 'engineering'");
    assert.equal(deps[0].n, 1);

    // The manager sees their report; another manager doesn't; employees can't list.
    assert.ok((await api.call("GET", "/people", { token: manager.token })).json.people.some((p) => p.email === email));
    const other = await api.createUser("manager");
    assert.equal((await api.call("GET", "/people", { token: other.token })).json.people.length, 0);
    assert.equal((await api.call("GET", `/people/${me.id}`, { token: other.token })).status, 404);
    const emp = await api.createUser("employee");
    assert.equal((await api.call("GET", "/people", { token: emp.token })).status, 403);
    assert.equal((await api.call("POST", "/people/invite", { token: manager.token, body: { email: "x@example.com", employeeType: "intern", joiningDate: "2026-10-05" } })).status, 403);
  });

  test("bulk import: dry run changes nothing, then good rows go in and bad rows are reported", async () => {
    const stamp = Date.now();
    const rows = [
      { email: `csv.a.${stamp}@example.com`, fullName: "Csv A", employeeType: "intern", joiningDate: "2026-10-05", durationMonths: "6" },
      { email: `csv.b.${stamp}@example.com`, employeeType: "wizard", joiningDate: "2026-10-05" },
      { email: `csv.a.${stamp}@example.com`, employeeType: "intern", joiningDate: "2026-10-05" },
      { email: hr.email, employeeType: "full_time", joiningDate: "2026-10-05" },
    ];
    const dry = await api.call("POST", "/people/invite/bulk", { token: hr.token, body: { rows, dryRun: true } });
    assert.equal(dry.json.succeeded, 1);
    const { rows: none } = await api.pool.query("SELECT count(*)::int AS n FROM users WHERE email = $1", [rows[0].email]);
    assert.equal(none[0].n, 0);

    const real = await api.call("POST", "/people/invite/bulk", { token: hr.token, body: { rows } });
    assert.equal(real.status, 201);
    assert.deepEqual(real.json.results.map((r) => r.status), ["invited", "error", "error", "error"]);
    assert.match(real.json.results[1].message, /employeeType/);
    assert.match(real.json.results[2].message, /Duplicate/);
  });

  test("HR edits department, manager and name; someone can't manage themselves", async () => {
    const email = `edit.${Date.now()}@example.com`;
    const { employeeId } = (await api.call("POST", "/people/invite", { token: hr.token, body: { email, employeeType: "contract", joiningDate: "2026-10-05" } })).json;
    const manager = await api.createUser("manager");
    const r = await api.call("PUT", `/people/${employeeId}`, { token: hr.token, body: { fullName: "Renamed Person", departmentName: "Design", managerId: manager.id } });
    assert.equal(r.status, 200);
    assert.equal(r.json.person.name, "Renamed Person");
    assert.equal(r.json.person.department, "Design");
    const { rows } = await api.pool.query("SELECT user_id FROM employees WHERE id = $1", [employeeId]);
    assert.equal((await api.call("PUT", `/people/${employeeId}`, { token: hr.token, body: { managerId: rows[0].user_id } })).status, 400);
  });
});
