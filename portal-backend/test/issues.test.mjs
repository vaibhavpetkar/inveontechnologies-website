// Jira-style issues: project keys and numbers, issue types and labels,
// server-side search with saved filters, watchers, @mentions and the full
// change history.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api, manager, dev, other, admin;

before(async () => {
  api = await startServer();
  manager = await api.createUser("manager");
  dev = await api.createUser("employee");
  other = await api.createUser("employee");
  admin = await api.createUser("admin");
});
after(async () => {
  await api?.stop();
});

const unique = () => Math.random().toString(36).slice(2, 7).toUpperCase().replace(/^[0-9]/, "Q");

async function project(body = {}) {
  const r = await api.call("POST", "/projects", { token: manager.token, body: { title: `Rail booking ${unique()}`, memberIds: [dev.id], ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.project;
}
async function task(projectId, body = {}) {
  const r = await api.call("POST", "/tasks", { token: manager.token, body: { projectId, title: "Build the seat map", assigneeId: dev.id, ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.task;
}

describe("project keys and issue numbers", () => {
  test("a project gets a key from its title, or the one given; tasks are numbered KEY-1, KEY-2", async () => {
    const key = `R${unique()}`;
    const p = await project({ key: key.toLowerCase() });
    assert.equal(p.key, key, "keys are upper-cased");
    const a = await task(p.id);
    const b = await task(p.id, { title: "Payment page", type: "story" });
    assert.equal(a.key, `${key}-1`);
    assert.equal(b.key, `${key}-2`);
    assert.equal(b.type, "story");

    const dup = await api.call("POST", "/projects", { token: manager.token, body: { title: "Dup", key } });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.code, "KEY_TAKEN");
    const bad = await api.call("POST", "/projects", { token: manager.token, body: { title: "Bad", key: "1X" } });
    assert.equal(bad.status, 400);

    const suggestion = await api.call("GET", `/projects/key-suggestion?title=${encodeURIComponent("Inveon Hiring Portal")}`, { token: manager.token });
    assert.match(suggestion.json.key, /^IHP\d*$/);

    // Open a task by its key, any case.
    const byKey = await api.call("GET", `/tasks/${key.toLowerCase()}-2`, { token: dev.token });
    assert.equal(byKey.status, 200, JSON.stringify(byKey.json));
    assert.equal(byKey.json.task.id, b.id);
    assert.equal((await api.call("GET", `/tasks/${key}-99`, { token: dev.token })).status, 404);

    // Personal tasks have no key.
    const personal = await api.call("POST", "/tasks", { token: dev.token, body: { title: "Read the docs" } });
    assert.equal(personal.json.task.key, null);
  });

  test("subtasks stay in their parent's project, and the parent lists them", async () => {
    const p = await project();
    const parent = await task(p.id, { type: "story" });
    const sub = await task(p.id, { parentTaskId: parent.id, title: "Seat icons" });
    const view = await api.call("GET", `/tasks/${parent.id}`, { token: dev.token });
    assert.deepEqual(view.json.subtasks.map((s) => s.id), [sub.id]);
    assert.ok(view.json.subtasks[0].key);
    assert.equal((await api.call("GET", `/tasks/${sub.id}`, { token: dev.token })).json.parent.id, parent.id);
    const elsewhere = await api.call("POST", "/tasks", { token: manager.token, body: { title: "Wrong place", parentTaskId: parent.id } });
    assert.equal(elsewhere.json.error.code, "INVALID_PARENT");
  });
});

describe("search, labels and saved filters", () => {
  test("filters by type, label, priority, status and text; sorts and pages on the server", async () => {
    const p = await project();
    const bug = await task(p.id, { title: "Login fails on Safari", type: "bug", priority: "urgent", labels: ["Frontend", "safari", "frontend"] });
    await task(p.id, { title: "Add a footer", labels: ["frontend"] });
    await task(p.id, { title: "Database backups", priority: "low", labels: ["ops"] });
    assert.deepEqual(bug.labels, ["frontend", "safari"], "labels are lower-cased and de-duplicated");

    const q = (params) => api.call("GET", `/tasks/search?projectId=${p.id}&${params}`, { token: dev.token }).then((r) => r.json);
    assert.deepEqual((await q("type=bug")).tasks.map((t) => t.id), [bug.id]);
    assert.equal((await q("label=frontend")).total, 2);
    assert.equal((await q("priority=urgent,high")).total, 1);
    assert.equal((await q("q=safari")).total, 1);
    assert.equal((await q(`q=${bug.key}`)).tasks[0].id, bug.id, "search by key");
    assert.equal((await q("assignee=me&state=open")).total, 3);
    assert.equal((await q("assignee=none")).total, 0);
    const sorted = await q("sort=priority&order=desc");
    assert.equal(sorted.tasks[0].priority, "urgent");
    assert.equal(sorted.tasks[0].assignee.id, dev.id);
    const page = await q("sort=title&order=asc&pageSize=2&page=2");
    assert.equal(page.total, 3);
    assert.deepEqual(page.tasks.map((t) => t.title), ["Login fails on Safari"]);

    const labels = await api.call("GET", `/tasks/labels?projectId=${p.id}`, { token: dev.token });
    assert.equal(labels.json.labels[0], "frontend");

    // Someone outside the project sees none of it.
    assert.equal((await api.call("GET", `/tasks/search?projectId=${p.id}`, { token: other.token })).status, 403);
    assert.ok(!(await api.call("GET", "/tasks/search?q=safari", { token: other.token })).json.tasks.some((t) => t.id === bug.id));
  });

  test("saved searches belong to their owner", async () => {
    const saved = await api.call("POST", "/tasks/filters", { token: dev.token, body: { name: "My urgent bugs", filters: { type: ["bug"], priority: "urgent", assignee: "me", bogus: 1 } } });
    assert.equal(saved.status, 201, JSON.stringify(saved.json));
    assert.deepEqual(saved.json.filter.filters.type, ["bug"]);
    assert.equal(saved.json.filter.filters.bogus, undefined);
    assert.ok((await api.call("GET", "/tasks/filters", { token: dev.token })).json.filters.some((f) => f.id === saved.json.filter.id));
    assert.ok(!(await api.call("GET", "/tasks/filters", { token: other.token })).json.filters.some((f) => f.id === saved.json.filter.id));
    await api.call("DELETE", `/tasks/filters/${saved.json.filter.id}`, { token: other.token });
    assert.ok((await api.call("GET", "/tasks/filters", { token: dev.token })).json.filters.some((f) => f.id === saved.json.filter.id), "others can't delete it");
    await api.call("DELETE", `/tasks/filters/${saved.json.filter.id}`, { token: dev.token });
    assert.ok(!(await api.call("GET", "/tasks/filters", { token: dev.token })).json.filters.some((f) => f.id === saved.json.filter.id));
  });
});

describe("watchers, mentions and history", () => {
  test("mentioned people are notified and start watching; watchers hear about comments", async () => {
    const p = await project({ memberIds: [dev.id, other.id] });
    const t = await task(p.id);
    const comment = await api.call("POST", `/tasks/${t.id}/comments`, { token: dev.token, body: { body: "Can you check the API?", mentionedUserIds: [other.id, admin.id] } });
    assert.equal(comment.status, 201);
    assert.deepEqual(comment.json.comment.mentionedUserIds.sort(), [other.id, admin.id].sort());

    const view = await api.call("GET", `/tasks/${t.id}`, { token: other.token });
    assert.equal(view.json.watching, true, "mentioned people follow the task");
    const inbox = await api.call("GET", "/notifications?limit=20", { token: other.token });
    assert.ok(inbox.json.notifications.some((n) => n.kind === "task.mention" && n.title.includes(t.key)));

    // other unwatches, then hears nothing about the next comment.
    await api.call("DELETE", `/tasks/${t.id}/watch`, { token: other.token });
    assert.equal((await api.call("GET", `/tasks/${t.id}`, { token: other.token })).json.watching, false);
    await api.call("POST", `/tasks/${t.id}/comments`, { token: manager.token, body: { body: "Looks good" } });
    const after = await api.call("GET", "/notifications?limit=20", { token: other.token });
    assert.equal(after.json.notifications.filter((n) => n.kind === "task.comment" && n.link === `/tasks/${t.id}`).length, 0);
    const devInbox = await api.call("GET", "/notifications?limit=20", { token: dev.token });
    assert.ok(devInbox.json.notifications.some((n) => n.kind === "task.comment" && n.link === `/tasks/${t.id}`));

    // People outside the project can't be mentioned.
    const outsider = await api.createUser("employee");
    const c2 = await api.call("POST", `/tasks/${t.id}/comments`, { token: dev.token, body: { body: "hi", mentionedUserIds: [outsider.id] } });
    assert.deepEqual(c2.json.comment.mentionedUserIds, []);
  });

  test("every field change is in the history with old and new values", async () => {
    const p = await project({ memberIds: [dev.id, other.id] });
    const t = await task(p.id, { estimateHours: 4 });
    const r = await api.call("PUT", `/tasks/${t.id}`, { token: manager.token, body: { priority: "high", type: "bug", labels: ["api"], assigneeId: other.id, estimateHours: 4, dueDate: null } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const timeline = (await api.call("GET", `/tasks/${t.id}/timeline`, { token: manager.token })).json.timeline.filter((e) => e.action === "field_change");
    const by = Object.fromEntries(timeline.map((e) => [e.field, e]));
    assert.deepEqual(Object.keys(by).sort(), ["assignee", "labels", "priority", "type"], "unchanged estimate is not recorded");
    assert.equal(by.priority.fromValue, "medium");
    assert.equal(by.priority.toValue, "high");
    assert.equal(by.labels.toValue, "api");
    assert.ok(by.assignee.toValue && by.assignee.toValue !== other.id, "people are stored by name");
  });
});
