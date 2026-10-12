// Project settings (workflow, permission and notification schemes),
// automation rules run by the job worker, and dashboards.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";
import { createDb } from "../dist/modules/shared/db/client.js";
import { runDueSoon } from "../dist/modules/tasks/automation.js";

let api, manager, dev, other, outsider;

before(async () => {
  api = await startServer();
  manager = await api.createUser("manager");
  dev = await api.createUser("employee");
  other = await api.createUser("employee");
  outsider = await api.createUser("employee");
});
after(async () => {
  await api?.stop();
});

async function project() {
  const r = await api.call("POST", "/projects", { token: manager.token, body: { title: `Auto test ${Math.random().toString(36).slice(2, 7)}`, memberIds: [dev.id, other.id] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.project;
}
async function task(projectId, body = {}, token = manager.token) {
  const r = await api.call("POST", "/tasks", { token, body: { projectId, title: "Fix the login page", ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.task;
}
const get = async (id) => (await api.call("GET", `/tasks/${id}`, { token: manager.token })).json.task;
// The job worker polls every 2 seconds.
async function eventually(check, ms = 9000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) assert.fail("timed out waiting for automation");
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe("project settings", () => {
  test("defaults, and only leads change them", async () => {
    const p = await project();
    const r = await api.call("GET", `/projects/${p.id}/settings`, { token: dev.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.settings.workflow.requireReview, true);
    assert.equal(r.json.settings.permissions.planSprints, "leads");
    assert.equal(r.json.canManage, false);
    assert.equal((await api.call("PUT", `/projects/${p.id}/settings`, { token: dev.token, body: { workflow: { requireReview: false } } })).status, 403);
    assert.equal((await api.call("GET", `/projects/${p.id}/settings`, { token: outsider.token })).status, 403);
    const put = await api.call("PUT", `/projects/${p.id}/settings`, { token: manager.token, body: { workflow: { labels: { in_review: "QA" } } } });
    assert.equal(put.status, 200);
    assert.equal(put.json.settings.workflow.labels.in_review, "QA");
    assert.equal(put.json.settings.workflow.requireReview, true);
  });

  test("without the review step the assignee closes their own work", async () => {
    const p = await project();
    const t = await task(p.id, { assigneeId: dev.id });
    await api.call("POST", `/tasks/${t.id}/transition`, { token: dev.token, body: { toStatus: "in_progress" } });
    assert.equal((await api.call("POST", `/tasks/${t.id}/transition`, { token: dev.token, body: { toStatus: "done" } })).status, 400);
    await api.call("PUT", `/projects/${p.id}/settings`, { token: manager.token, body: { workflow: { requireReview: false } } });
    const done = await api.call("POST", `/tasks/${t.id}/transition`, { token: dev.token, body: { toStatus: "done" } });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal((await get(t.id)).status, "done");
  });

  test("permission scheme: who creates issues and plans sprints", async () => {
    const p = await project();
    assert.equal((await api.call("POST", `/projects/${p.id}/sprints`, { token: dev.token, body: {} })).status, 403);
    await api.call("PUT", `/projects/${p.id}/settings`, { token: manager.token, body: { permissions: { planSprints: "members", createIssues: "leads" } } });
    assert.equal((await api.call("POST", `/projects/${p.id}/sprints`, { token: dev.token, body: {} })).status, 201);
    assert.equal((await api.call("POST", "/tasks", { token: dev.token, body: { projectId: p.id, title: "Members can't create" } })).status, 403);
  });

  test("notification scheme: comments can stop notifying followers", async () => {
    const p = await project();
    const t = await task(p.id, { assigneeId: dev.id });
    await api.call("PUT", `/projects/${p.id}/settings`, { token: manager.token, body: { notifications: { comment: false } } });
    await api.call("POST", `/tasks/${t.id}/comments`, { token: manager.token, body: { body: "Quiet comment" } });
    const { rows } = await api.pool.query("SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'task.comment' AND link = $2", [dev.id, `/tasks/${t.id}`]);
    assert.equal(rows.length, 0);
  });
});

describe("automation", () => {
  test("a rule on new bugs assigns, labels and raises priority; the run is logged", async () => {
    const p = await project();
    const bad = await api.call("POST", `/projects/${p.id}/automation`, {
      token: manager.token,
      body: { name: "Outsider", trigger: "issue_created", actions: [{ kind: "assign", to: outsider.id }] },
    });
    assert.equal(bad.status, 400);
    assert.equal((await api.call("POST", `/projects/${p.id}/automation`, { token: dev.token, body: { name: "x", trigger: "issue_created", actions: [{ kind: "set_priority", priority: "low" }] } })).status, 403);

    const r = await api.call("POST", `/projects/${p.id}/automation`, {
      token: manager.token,
      body: {
        name: "Triage bugs",
        trigger: "issue_created",
        conditions: { types: ["bug"] },
        actions: [{ kind: "assign", to: dev.id }, { kind: "add_label", label: "triage" }, { kind: "set_priority", priority: "high" }, { kind: "comment", body: "Thanks, we're on it." }],
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const rule = r.json.rule;

    const story = await task(p.id, { type: "story", title: "Not a bug" });
    const bug = await task(p.id, { type: "bug", title: "Crash on save" });
    const after = await eventually(async () => {
      const t = await get(bug.id);
      return t.assigneeId === dev.id && t;
    });
    assert.deepEqual(after.labels, ["triage"]);
    assert.equal(after.priority, "high");
    assert.equal((await get(story.id)).assigneeId, null);

    const runs = await eventually(async () => {
      const x = (await api.call("GET", `/automation/${rule.id}/runs`, { token: dev.token })).json.runs;
      return x.length >= 2 && x;
    });
    const byIssue = Object.fromEntries(runs.map((x) => [x.issue.title, x]));
    assert.equal(byIssue["Crash on save"].status, "success");
    assert.match(byIssue["Crash on save"].message, /assigned to/);
    assert.equal(byIssue["Not a bug"].status, "skipped");
    const history = (await api.call("GET", `/tasks/${bug.id}/timeline`, { token: manager.token })).json.timeline;
    assert.ok(history.some((e) => e.field === "priority" && e.note === "Automation: Triage bugs"));
    const comments = (await api.call("GET", `/tasks/${bug.id}/comments`, { token: manager.token })).json.comments;
    assert.equal(comments[0].body, "Thanks, we're on it.");
    const rules = (await api.call("GET", `/projects/${p.id}/automation`, { token: manager.token })).json.rules;
    assert.equal(rules[0].runCount, 1);
  });

  test("status rules fire on the right move, and changes made by rules don't fire rules", async () => {
    const p = await project();
    await api.call("POST", `/projects/${p.id}/automation`, {
      token: manager.token,
      body: { name: "Tell leads about reviews", trigger: "status_changed", conditions: { toStatus: "in_review" }, actions: [{ kind: "notify", to: "leads", message: "Ready to review" }, { kind: "add_watcher", userId: other.id }] },
    });
    await api.call("POST", `/projects/${p.id}/automation`, {
      token: manager.token,
      body: { name: "Assigned → label", trigger: "issue_assigned", actions: [{ kind: "add_label", label: "picked" }] },
    });
    await api.call("POST", `/projects/${p.id}/automation`, {
      token: manager.token,
      body: { name: "Unassigned created → assign", trigger: "issue_created", conditions: { unassigned: true }, actions: [{ kind: "assign", to: "creator" }] },
    });
    const t = await task(p.id);
    // The create rule assigns it; that must not fire the "assigned" rule.
    await eventually(async () => (await get(t.id)).assigneeId === manager.id);
    await new Promise((r) => setTimeout(r, 2500));
    assert.deepEqual((await get(t.id)).labels, []);

    // A person assigning does fire it.
    await api.call("PUT", `/tasks/${t.id}`, { token: manager.token, body: { assigneeId: dev.id } });
    await eventually(async () => (await get(t.id)).labels.includes("picked"));

    await api.call("POST", `/tasks/${t.id}/transition`, { token: dev.token, body: { toStatus: "in_progress" } });
    await api.call("POST", `/tasks/${t.id}/transition`, { token: dev.token, body: { toStatus: "in_review" } });
    await eventually(async () => {
      const { rows } = await api.pool.query("SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'automation' AND link = $2", [manager.id, `/tasks/${t.id}`]);
      return rows.length === 1;
    });
    const { rows } = await api.pool.query("SELECT 1 FROM task_watchers WHERE task_id = $1 AND user_id = $2", [t.id, other.id]);
    assert.equal(rows.length, 1);
  });

  test("disabled rules don't run; due-soon rules run once per issue", async () => {
    const p = await project();
    const r = await api.call("POST", `/projects/${p.id}/automation`, {
      token: manager.token,
      body: { name: "Off", enabled: false, trigger: "issue_created", actions: [{ kind: "set_priority", priority: "urgent" }] },
    });
    const t = await task(p.id, { dueDate: new Date(Date.now() + 3 * 3600_000).toISOString(), assigneeId: dev.id });
    await new Promise((res) => setTimeout(res, 2500));
    assert.equal((await get(t.id)).priority, "medium");
    const upd = await api.call("PUT", `/automation/${r.json.rule.id}`, { token: manager.token, body: { enabled: true, trigger: "due_soon", conditions: { withinHours: 24 }, actions: [{ kind: "notify", to: "assignee", message: "Due soon" }] } });
    assert.equal(upd.status, 200, JSON.stringify(upd.json));
    const dbh = createDb({ PORTAL_DATABASE_URL: process.env.TEST_DATABASE_URL });
    await runDueSoon(dbh.db);
    await runDueSoon(dbh.db);
    await dbh.pool.end();
    const { rows } = await api.pool.query("SELECT status FROM automation_runs WHERE rule_id = $1 AND task_id = $2", [r.json.rule.id, t.id]);
    assert.deepEqual(rows.map((x) => x.status), ["success"]);
  });
});

describe("dashboards", () => {
  test("own and shared dashboards, with stats that respect visibility", async () => {
    const p = await project();
    await task(p.id, { type: "bug", storyPoints: 3 });
    await task(p.id, { type: "bug" });
    await task(p.id, { type: "story", storyPoints: 5 });
    const d = await api.call("POST", "/dashboards", {
      token: dev.token,
      body: { name: "My work", gadgets: [{ id: "g1", kind: "pie", config: { groupBy: "type", projectId: p.id } }] },
    });
    assert.equal(d.status, 201, JSON.stringify(d.json));
    assert.equal((await api.call("GET", `/dashboards/${d.json.dashboard.id}`, { token: other.token })).status, 404);
    await api.call("PUT", `/dashboards/${d.json.dashboard.id}`, { token: dev.token, body: { shared: true } });
    const seen = await api.call("GET", "/dashboards", { token: other.token });
    assert.ok(seen.json.dashboards.some((x) => x.id === d.json.dashboard.id && !x.mine));
    assert.equal((await api.call("PUT", `/dashboards/${d.json.dashboard.id}`, { token: other.token, body: { name: "Mine now" } })).status, 403);

    const stats = await api.call("GET", `/dashboards/data/stats?groupBy=type&projectId=${p.id}`, { token: dev.token });
    assert.equal(stats.status, 200, JSON.stringify(stats.json));
    const byType = Object.fromEntries(stats.json.rows.map((r) => [r.value, r]));
    assert.equal(byType.bug.count, 2);
    assert.equal(byType.bug.points, 3);
    assert.equal(byType.story.points, 5);
    assert.equal((await api.call("GET", `/dashboards/data/stats?groupBy=type&projectId=${p.id}`, { token: outsider.token })).status, 403);
    const mine = await api.call("GET", "/dashboards/data/stats?groupBy=status", { token: outsider.token });
    assert.equal(mine.json.rows.length, 0);

    const cvr = await api.call("GET", `/dashboards/data/created-vs-resolved?projectId=${p.id}&days=7`, { token: manager.token });
    assert.equal(cvr.json.days.length, 7);
    assert.equal(cvr.json.days.at(-1).created, 3);

    const candidate = await api.createUser("candidate");
    assert.equal((await api.call("GET", "/dashboards", { token: candidate.token })).status, 403);
  });
});
