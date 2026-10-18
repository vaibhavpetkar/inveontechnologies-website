// Engineering workflow: issue links, GitHub branches/commits/PRs on issues,
// releases, the timeline, work logs and timesheets, bulk edit and CSV import.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startServer } from "./helpers.mjs";

const SECRET = "eng-webhook-secret";
let api, manager, dev, other, outsider;

before(async () => {
  // A GitHub token is needed for the webhook to be enabled; nothing here calls GitHub.
  api = await startServer({ GITHUB_TOKEN: "ghp_test", GITHUB_WEBHOOK_SECRET: SECRET, GITHUB_API_BASE: "http://127.0.0.1:9" });
  manager = await api.createUser("manager");
  dev = await api.createUser("employee", { email: `dev-${Date.now()}@test.local` });
  other = await api.createUser("employee");
  outsider = await api.createUser("employee");
});
after(async () => {
  await api?.stop();
});

// Six random letters: replacing digits with one letter made collisions likely.
const key = () => `E${Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;
async function project(extra = {}) {
  const r = await api.call("POST", "/projects", { token: manager.token, body: { title: `Eng ${Math.random().toString(36).slice(2, 7)}`, key: key(), memberIds: [dev.id, other.id], ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.project;
}
async function task(projectId, body = {}) {
  const r = await api.call("POST", "/tasks", { token: manager.token, body: { projectId, title: "Build the seat map", assigneeId: dev.id, ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.task;
}
function hook(event, payload) {
  const raw = JSON.stringify(payload);
  return fetch(`${api.base}/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-github-event": event, "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}` },
    body: raw,
  });
}

describe("issue links", () => {
  test("blocks / is blocked by, both sides see the link; no self links, duplicates or loops", async () => {
    const p = await project();
    const a = await task(p.id, { title: "Seat lock API" });
    const b = await task(p.id, { title: "Seat map UI" });
    const r = await api.call("POST", `/tasks/${a.id}/links`, { token: manager.token, body: { target: b.key.toLowerCase(), type: "blocks" } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const fromA = (await api.call("GET", `/tasks/${a.id}/links`, { token: dev.token })).json.links;
    assert.deepEqual(fromA.map((l) => [l.label, l.task.key]), [["blocks", b.key]]);
    const fromB = (await api.call("GET", `/tasks/${b.key}/links`, { token: dev.token })).json.links;
    assert.deepEqual(fromB.map((l) => [l.label, l.task.key]), [["is blocked by", a.key]]);

    assert.equal((await api.call("POST", `/tasks/${a.id}/links`, { token: manager.token, body: { target: b.key, type: "blocks" } })).status, 409);
    assert.equal((await api.call("POST", `/tasks/${b.id}/links`, { token: manager.token, body: { target: a.key, type: "blocks" } })).json.error.code, "INVALID_LINK");
    assert.equal((await api.call("POST", `/tasks/${a.id}/links`, { token: manager.token, body: { target: a.key, type: "relates" } })).json.error.code, "INVALID_LINK");
    assert.equal((await api.call("POST", `/tasks/${a.id}/links`, { token: outsider.token, body: { target: b.key, type: "relates" } })).status, 403);

    // "Is blocked by" from the blocked issue's side stores the same link.
    const c = await task(p.id, { title: "Payment page" });
    const inward = await api.call("POST", `/tasks/${c.id}/links`, { token: manager.token, body: { target: a.key, type: "blocks", inward: true } });
    assert.equal(inward.status, 201);
    const fromC = (await api.call("GET", `/tasks/${c.id}/links`, { token: manager.token })).json.links;
    assert.equal(fromC[0].label, "is blocked by");

    const del = await api.call("DELETE", `/task-links/${r.json.link.id}`, { token: manager.token });
    assert.equal(del.status, 204);
    assert.equal((await api.call("GET", `/tasks/${b.id}/links`, { token: dev.token })).json.links.length, 0);
  });
});

describe("GitHub development on issues", () => {
  test("branches, commits and PRs naming a key are linked; opening a PR moves the issue to review", async () => {
    const p = await project();
    const repo = `inveon/${p.key.toLowerCase()}`;
    await api.pool.query("UPDATE projects SET github_repo = $2 WHERE id = $1", [p.id, repo]);
    const t = await task(p.id, { title: "Seat map" });
    await api.call("POST", `/tasks/${t.id}/transition`, { token: dev.token, body: { toStatus: "in_progress" } });

    const branch = `${t.key.toLowerCase()}-seat-map`;
    let r = await hook("push", { ref: `refs/heads/${branch}`, repository: { full_name: repo, html_url: `https://github.com/${repo}` }, commits: [{ id: "abc1234", message: `${t.key} draw the coach\n\nmore`, url: "https://github.com/x/commit/abc1234", author: { username: "dev1" } }] });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).linked, 2);
    // A repo the project isn't linked to is ignored.
    r = await hook("push", { ref: "refs/heads/main", repository: { full_name: "someone/else" }, commits: [{ id: "zzz", message: `${t.key} sneaky` }] });
    assert.equal((await r.json()).linked, 0);

    r = await hook("pull_request", { action: "opened", repository: { full_name: repo }, pull_request: { number: 7, title: `Seat map (${t.key})`, html_url: `https://github.com/${repo}/pull/7`, state: "open", draft: false, merged: false, head: { ref: branch }, user: { login: "dev1" } } });
    assert.equal((await r.json()).linked, 1);
    const dev1 = (await api.call("GET", `/tasks/${t.id}/development`, { token: dev.token })).json;
    assert.deepEqual(dev1.branches.map((b) => b.ref), [branch]);
    assert.equal(dev1.commits[0].title, `${t.key} draw the coach`);
    assert.deepEqual(dev1.pullRequests.map((x) => [x.ref, x.state]), [["7", "open"]]);
    assert.match(dev1.branchName, new RegExp(`^${t.key}-seat-map$`));
    assert.equal((await api.call("GET", `/tasks/${t.id}`, { token: dev.token })).json.task.status, "in_review");

    r = await hook("pull_request", { action: "closed", repository: { full_name: repo }, pull_request: { number: 7, title: `Seat map (${t.key})`, html_url: `https://github.com/${repo}/pull/7`, state: "closed", merged: true, head: { ref: branch } } });
    const dev2 = (await api.call("GET", `/tasks/${t.id}/development`, { token: dev.token })).json;
    assert.equal(dev2.pullRequests[0].state, "merged");
    // Merging doesn't skip the review: a person still approves.
    assert.equal((await api.call("GET", `/tasks/${t.id}`, { token: dev.token })).json.task.status, "in_review");
  });
});

describe("releases", () => {
  test("issues get a fix version; releasing moves unfinished ones to the next version", async () => {
    const p = await project();
    const v1 = (await api.call("POST", `/projects/${p.id}/versions`, { token: manager.token, body: { name: "v1.0", releaseDate: new Date(Date.now() + 7 * 864e5).toISOString() } })).json.version;
    const v2 = (await api.call("POST", `/projects/${p.id}/versions`, { token: manager.token, body: { name: "v1.1" } })).json.version;
    assert.equal((await api.call("POST", `/projects/${p.id}/versions`, { token: manager.token, body: { name: "v1.0" } })).status, 409);
    assert.equal((await api.call("POST", `/projects/${p.id}/versions`, { token: dev.token, body: { name: "v9" } })).status, 403);
    const a = await task(p.id, { fixVersionId: v1.id, storyPoints: 3 });
    const b = await task(p.id, { title: "Seat icons" });
    await api.call("PUT", `/tasks/${b.id}`, { token: manager.token, body: { fixVersionId: v1.id } });
    await api.pool.query("UPDATE tasks SET status = 'done' WHERE id = $1", [a.id]);

    const list = (await api.call("GET", `/projects/${p.id}/versions`, { token: dev.token })).json.versions;
    assert.deepEqual(list.find((v) => v.id === v1.id).progress, { issues: 2, done: 1, inProgress: 0, points: 3 });

    const rel = await api.call("POST", `/versions/${v1.id}/release`, { token: manager.token, body: { moveOpenTo: v2.id } });
    assert.equal(rel.status, 200, JSON.stringify(rel.json));
    assert.equal(rel.json.movedOpen, 1);
    assert.equal(rel.json.version.status, "released");
    assert.equal((await api.call("GET", `/tasks/${b.id}`, { token: dev.token })).json.task.fixVersionId, v2.id);
    assert.equal((await api.call("GET", `/tasks/${a.id}`, { token: dev.token })).json.task.fixVersionId, v1.id);

    const other = await project();
    const foreign = (await api.call("POST", `/projects/${other.id}/versions`, { token: manager.token, body: { name: "x" } })).json.version;
    assert.equal((await api.call("PUT", `/tasks/${b.id}`, { token: manager.token, body: { fixVersionId: foreign.id } })).json.error.code, "INVALID_VERSION");
  });
});

describe("timeline", () => {
  test("epics span their issues, dependencies come from blocks links", async () => {
    const p = await project();
    const epic = await task(p.id, { type: "epic", title: "Booking", assigneeId: undefined });
    const day = (n) => new Date(Date.UTC(2026, 10, n)).toISOString();
    const a = await task(p.id, { parentTaskId: epic.id, type: "story", startDate: day(2), dueDate: day(6) });
    const b = await task(p.id, { parentTaskId: epic.id, type: "story", startDate: day(7), dueDate: day(12) });
    await api.call("POST", `/tasks/${a.id}/links`, { token: manager.token, body: { target: b.key, type: "blocks" } });
    const tl = (await api.call("GET", `/projects/${p.id}/timeline`, { token: dev.token })).json;
    const e = tl.items.find((i) => i.id === epic.id);
    assert.equal(e.start, day(2));
    assert.equal(e.end, day(12));
    assert.equal(tl.items.find((i) => i.id === a.id).parentId, epic.id);
    assert.deepEqual(tl.dependencies, [{ from: a.id, to: b.id }]);
  });
});

describe("work logs and timesheets", () => {
  test("logging burns the remaining estimate; logs can be fixed; timesheet totals per person and day, CSV too", async () => {
    const p = await project();
    const t = await task(p.id, { estimateHours: 10 });
    assert.equal(Number(t.remainingHours), 10);
    const when = new Date().toISOString();
    const log = await api.call("POST", `/tasks/${t.id}/time-entries`, { token: dev.token, body: { hours: 3, entryDate: when, note: "=HYPERLINK(evil)" } });
    assert.equal(log.status, 201, JSON.stringify(log.json));
    assert.equal(Number((await api.call("GET", `/tasks/${t.id}`, { token: dev.token })).json.task.remainingHours), 7);

    const fix = await api.call("PUT", `/tasks/${t.id}/time-entries/${log.json.entry.id}`, { token: dev.token, body: { hours: 4 } });
    assert.equal(fix.json.taskActualHours, 4);
    assert.equal((await api.call("PUT", `/tasks/${t.id}/time-entries/${log.json.entry.id}`, { token: other.token, body: { hours: 1 } })).status, 403);
    const entries = (await api.call("GET", `/tasks/${t.id}/time-entries`, { token: manager.token })).json.entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].canEdit, true);

    const from = new Date(Date.now() - 864e5).toISOString();
    const to = new Date(Date.now() + 864e5).toISOString();
    const sheet = (await api.call("GET", `/tasks/timesheet?from=${from}&to=${to}&projectId=${p.id}`, { token: manager.token })).json;
    assert.equal(sheet.people.length, 1);
    assert.equal(sheet.people[0].userId, dev.id);
    assert.equal(sheet.people[0].total, 4);
    // Others on the project only see their own hours.
    const theirs = (await api.call("GET", `/tasks/timesheet?from=${from}&to=${to}&projectId=${p.id}`, { token: other.token })).json;
    assert.equal(theirs.people.length, 0);

    const csv = await fetch(`${api.base}/tasks/timesheet?from=${from}&to=${to}&projectId=${p.id}&format=csv`, { headers: { Authorization: `Bearer ${manager.token}` } });
    const text = await csv.text();
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(text, /"'=HYPERLINK\(evil\)"/, "formulas are defused");

    const del = await api.call("DELETE", `/tasks/${t.id}/time-entries/${log.json.entry.id}`, { token: manager.token });
    assert.equal(del.json.taskActualHours, 0);
  });
});

describe("bulk edit and CSV import", () => {
  test("bulk edit changes many issues and records history; it refuses issues the caller can't edit", async () => {
    const p = await project();
    const a = await task(p.id, { labels: ["old"] });
    const b = await task(p.id, { labels: ["old", "keep"] });
    const r = await api.call("POST", "/tasks/bulk", { token: manager.token, body: { taskIds: [a.id, b.id], patch: { priority: "urgent", assigneeId: other.id, addLabels: ["mvp"], removeLabels: ["old"], storyPoints: 2 } } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.updated, 2);
    const nowB = (await api.call("GET", `/tasks/${b.id}`, { token: manager.token })).json.task;
    assert.equal(nowB.priority, "urgent");
    assert.equal(nowB.assigneeId, other.id);
    assert.deepEqual(nowB.labels.sort(), ["keep", "mvp"]);
    const history = (await api.call("GET", `/tasks/${b.id}/timeline`, { token: manager.token })).json.timeline;
    assert.ok(history.some((e) => e.field === "priority" && e.toValue === "urgent"));

    const mine = await api.call("POST", "/tasks", { token: other.token, body: { title: "My personal note" } });
    assert.equal((await api.call("POST", "/tasks/bulk", { token: dev.token, body: { taskIds: [mine.json.task.id], patch: { priority: "low" } } })).status, 403);
    assert.equal((await api.call("POST", "/tasks/bulk", { token: manager.token, body: { taskIds: [a.id], patch: {} } })).status, 400);
  });

  test("CSV rows are checked first, then created with parents, assignees and labels", async () => {
    const p = await project();
    const rows = [
      { title: "Booking", type: "Epic" },
      { title: "Pick a seat", type: "story", parent: `${p.key}-1`, assignee: dev.email.toUpperCase(), labels: "frontend; booking", storyPoints: "5", dueDate: "2026-12-01" },
      { title: "Lock seats", type: "", priority: "High", parent: `${p.key}-1` },
    ];
    const check = await api.call("POST", `/projects/${p.id}/import`, { token: manager.token, body: { rows, dryRun: true } });
    assert.equal(check.status, 200);
    assert.deepEqual(check.json, { ok: true, rows: 3, errors: [] });

    const bad = await api.call("POST", `/projects/${p.id}/import`, { token: manager.token, body: { rows: [...rows, { title: "x" }, { title: "Who", assignee: "nobody@x.y" }] } });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.json.errors.map((e) => e.row), [4, 5]);
    assert.equal((await api.call("GET", `/tasks/search?projectId=${p.id}`, { token: manager.token })).json.total, 0, "nothing created when a row is bad");

    const done = await api.call("POST", `/projects/${p.id}/import`, { token: manager.token, body: { rows } });
    assert.equal(done.status, 201, JSON.stringify(done.json));
    assert.equal(done.json.created, 3);
    const story = (await api.call("GET", `/tasks/${p.key}-2`, { token: manager.token })).json.task;
    assert.equal(story.type, "story");
    assert.equal(story.assigneeId, dev.id);
    assert.deepEqual(story.labels, ["frontend", "booking"]);
    assert.equal(story.storyPoints, 5);
    assert.equal(story.parentTaskId, done.json.tasks[0].id);
    assert.equal((await api.call("GET", `/tasks/${p.key}-3`, { token: manager.token })).json.task.priority, "high");
    assert.equal((await api.call("POST", `/projects/${p.id}/import`, { token: dev.token, body: { rows } })).status, 403);
  });
});
