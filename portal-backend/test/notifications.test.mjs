// Notifications, the job queue and reminders, against a real Postgres.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer, createOpportunityWithApplication } from "./helpers.mjs";

let api, admin, hr, manager;

before(async () => {
  api = await startServer();
  admin = await api.createUser("admin");
  hr = await api.createUser("hr");
  manager = await api.createUser("manager");
});
after(async () => api?.stop());

const inbox = async (user) => (await api.call("GET", "/notifications", { token: user.token })).json;
const waitFor = async (check, ms = 8000) => {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 200));
  }
};

describe("notifications", () => {
  test("assigning a task notifies the assignee (not the assigner) and queues an email", async () => {
    const emp = await api.createUser("employee");
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Write the report", assigneeId: emp.id } })).json.task;

    const mine = await inbox(emp);
    assert.equal(mine.unreadCount, 1);
    assert.equal(mine.notifications[0].kind, "task.assigned");
    assert.equal(mine.notifications[0].link, `/tasks/${task.id}`);
    assert.equal(mine.notifications[0].dedupeKey, undefined); // internal
    assert.equal((await inbox(manager)).notifications.filter((n) => n.link === `/tasks/${task.id}`).length, 0);

    // The email goes through the queue and the worker sends it (logged, as SMTP isn't set in tests).
    const job = await waitFor(async () => {
      const { rows } = await api.pool.query("SELECT status, payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1", [emp.email]);
      return rows[0]?.status === "done" && rows[0];
    });
    assert.match(job.payload.text, new RegExp(`/tasks/${task.id}`));
  });

  test("review round trip notifies each side", async () => {
    const emp = await api.createUser("employee");
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Ship it", assigneeId: emp.id } })).json.task;
    await api.call("POST", `/tasks/${task.id}/transition`, { token: emp.token, body: { toStatus: "in_progress" } });
    await api.call("POST", `/tasks/${task.id}/transition`, { token: emp.token, body: { toStatus: "in_review" } });
    assert.ok((await inbox(manager)).notifications.some((n) => n.kind === "task.in_review" && n.link === `/tasks/${task.id}`));

    await api.call("POST", `/tasks/${task.id}/transition`, { token: manager.token, body: { toStatus: "changes_requested", note: "Add the totals" } });
    const changes = (await inbox(emp)).notifications.find((n) => n.kind === "task.changes_requested");
    assert.match(changes.body, /Add the totals/);

    await api.call("POST", `/tasks/${task.id}/comments`, { token: emp.token, body: { body: "Done, have a look" } });
    assert.ok((await inbox(manager)).notifications.some((n) => n.kind === "task.comment"));
    assert.ok(!(await inbox(emp)).notifications.some((n) => n.kind === "task.comment")); // not told about your own comment
  });

  test("mark one read, mark all read, and nobody else's", async () => {
    const emp = await api.createUser("employee");
    const other = await api.createUser("employee");
    await api.call("POST", "/tasks", { token: manager.token, body: { title: "One", assigneeId: emp.id } });
    await api.call("POST", "/tasks", { token: manager.token, body: { title: "Two", assigneeId: emp.id } });
    const { notifications } = await inbox(emp);
    assert.equal(notifications.length, 2);

    assert.equal((await api.call("POST", `/notifications/${notifications[0].id}/read`, { token: other.token })).status, 404);
    const r = await api.call("POST", `/notifications/${notifications[0].id}/read`, { token: emp.token });
    assert.equal(r.json.unreadCount, 1);
    await api.call("POST", "/notifications/read-all", { token: emp.token });
    assert.equal((await api.call("GET", "/notifications/unread-count", { token: emp.token })).json.unreadCount, 0);
  });

  test("preferences: in-app off hides the bell, email off skips the email", async () => {
    const emp = await api.createUser("employee");
    await api.call("PUT", "/notification-preferences", { token: emp.token, body: { inAppEnabled: false, emailEnabled: false } });
    await api.call("POST", "/tasks", { token: manager.token, body: { title: "Quiet", assigneeId: emp.id } });
    assert.equal((await inbox(emp)).notifications.length, 0);
    const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM jobs WHERE payload->>'to' = $1", [emp.email]);
    assert.equal(rows[0].n, 0);
  });

  test("candidates hear about their application moving", async () => {
    const { application, candidate } = await createOpportunityWithApplication(api, { hr, admin });
    await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus: "under_review" } });
    await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus: "shortlisted" } });
    const kinds = (await inbox(candidate)).notifications.map((n) => n.kind);
    assert.deepEqual(kinds, ["application.shortlisted", "application.under_review"]);
  });

  test("the live stream delivers new notifications", async () => {
    const emp = await api.createUser("employee");
    const controller = new AbortController();
    const res = await fetch(`${api.base}/notifications/stream`, { headers: { Authorization: `Bearer ${emp.token}` }, signal: controller.signal });
    assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.equal(res.headers.get("x-accel-buffering"), "no");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const readUntil = async (needle) => {
      while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
    };
    await readUntil("event: ready");
    await api.call("POST", "/tasks", { token: manager.token, body: { title: "Live one", assigneeId: emp.id } });
    await readUntil("event: notification");
    assert.match(text, /Live one/);
    controller.abort();
  });

  test("email job report lists queued mail for admins only", async () => {
    assert.equal((await api.call("GET", "/reports/email-jobs", { token: hr.token })).status, 403);
    const r = await api.call("GET", "/reports/email-jobs", { token: admin.token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.jobs));
  });
});

describe("job queue and reminders", () => {
  test("a failing job is retried with backoff, then marked failed", async () => {
    const { rows } = await api.pool.query("INSERT INTO jobs (type, payload, max_attempts) VALUES ('no.such.handler', '{}', 2) RETURNING id");
    const id = rows[0].id;
    const first = await waitFor(async () => {
      const r = (await api.pool.query("SELECT status, attempts, run_at, last_error FROM jobs WHERE id = $1", [id])).rows[0];
      return r.attempts === 1 && r.status === "pending" && r;
    });
    assert.match(first.last_error, /No handler/);
    assert.ok(new Date(first.run_at) > new Date()); // backed off
    await api.pool.query("UPDATE jobs SET run_at = now() WHERE id = $1", [id]);
    const final = await waitFor(async () => {
      const r = (await api.pool.query("SELECT status, attempts FROM jobs WHERE id = $1", [id])).rows[0];
      return r.status === "failed" && r;
    });
    assert.equal(final.attempts, 2);
  });

  test("due-soon and overdue reminders go out once per due date", async () => {
    const { createDb } = await import("../dist/modules/shared/db/client.js");
    const { sendTaskDueReminders } = await import("../dist/modules/notifications/reminders.js");
    const { db, pool } = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
    try {
      const emp = await api.createUser("employee");
      const soon = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      const late = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const t1 = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Soon", assigneeId: emp.id, dueDate: soon } })).json.task;
      const t2 = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Late", assigneeId: emp.id, dueDate: late } })).json.task;

      await sendTaskDueReminders(db);
      await sendTaskDueReminders(db);

      const kinds = (await inbox(emp)).notifications.filter((n) => n.kind !== "task.assigned").map((n) => `${n.kind}:${n.link}`).sort();
      assert.deepEqual(kinds, [`task.due_soon:/tasks/${t1.id}`, `task.overdue:/tasks/${t2.id}`]);
      assert.ok((await inbox(manager)).notifications.some((n) => n.kind === "task.overdue" && n.link === `/tasks/${t2.id}`));
    } finally {
      await pool.end();
    }
  });
});
