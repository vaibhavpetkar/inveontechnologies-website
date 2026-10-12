// Scrum planning: sprints, backlog ranking, story points, starting and
// completing sprints with unfinished work rolling over, burndown, velocity
// and board WIP limits.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api, manager, dev, outsider;

before(async () => {
  api = await startServer();
  manager = await api.createUser("manager");
  dev = await api.createUser("employee");
  outsider = await api.createUser("employee");
});
after(async () => {
  await api?.stop();
});

async function project() {
  const r = await api.call("POST", "/projects", { token: manager.token, body: { title: `Sprint test ${Math.random().toString(36).slice(2, 7)}`, memberIds: [dev.id] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.project;
}
async function task(projectId, body = {}) {
  const r = await api.call("POST", "/tasks", { token: manager.token, body: { projectId, title: "Build the seat map", assigneeId: dev.id, ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.task;
}
const backlog = async (p, token = manager.token) => (await api.call("GET", `/projects/${p.id}/backlog`, { token })).json;
const finish = (id) => api.pool.query("UPDATE tasks SET status = 'done', completed_at = now(), updated_at = now() WHERE id = $1", [id]);

describe("backlog and sprint planning", () => {
  test("new issues join the bottom of the backlog; drag ranks them and plans them into a sprint", async () => {
    const p = await project();
    const a = await task(p.id, { title: "Item A", storyPoints: 3 });
    const b = await task(p.id, { title: "Item B", storyPoints: 5 });
    const c = await task(p.id, { title: "Item C" });
    let view = await backlog(p);
    assert.deepEqual(view.backlog.issues.map((i) => i.title), ["Item A", "Item B", "Item C"]);
    assert.equal(view.backlog.stats.points, 8);

    // C to the top.
    const top = await api.call("POST", `/projects/${p.id}/backlog/move`, { token: manager.token, body: { taskIds: [c.id], beforeId: a.id } });
    assert.equal(top.status, 200, JSON.stringify(top.json));
    view = await backlog(p);
    assert.deepEqual(view.backlog.issues.map((i) => i.title), ["Item C", "Item A", "Item B"]);

    const s = await api.call("POST", `/projects/${p.id}/sprints`, { token: manager.token, body: { goal: "Seat map live" } });
    assert.equal(s.status, 201);
    assert.equal(s.json.sprint.name, `${p.key} Sprint 1`);
    const sprint = s.json.sprint;

    await api.call("POST", `/projects/${p.id}/backlog/move`, { token: manager.token, body: { taskIds: [a.id, b.id], sprintId: sprint.id } });
    view = await backlog(p);
    assert.deepEqual(view.sprints[0].issues.map((i) => i.title), ["Item A", "Item B"]);
    assert.equal(view.sprints[0].stats.points, 8);
    assert.deepEqual(view.backlog.issues.map((i) => i.title), ["Item C"]);

    // Moving it is in the issue's history.
    const history = (await api.call("GET", `/tasks/${a.id}/timeline`, { token: manager.token })).json;
    const events = history.events ?? history.timeline ?? history;
    assert.ok(JSON.stringify(events).includes(sprint.name), "sprint move recorded");

    // Members can see the plan but not change it; others can't see it.
    assert.equal((await api.call("GET", `/projects/${p.id}/backlog`, { token: dev.token })).status, 200);
    assert.equal((await api.call("POST", `/projects/${p.id}/sprints`, { token: dev.token, body: {} })).status, 403);
    assert.equal((await api.call("POST", `/projects/${p.id}/backlog/move`, { token: dev.token, body: { taskIds: [c.id], sprintId: sprint.id } })).status, 403);
    assert.equal((await api.call("GET", `/projects/${p.id}/backlog`, { token: outsider.token })).status, 403);
  });

  test("subtasks follow their parent into a sprint; points and sprint can be set on the issue", async () => {
    const p = await project();
    const sprint = (await api.call("POST", `/projects/${p.id}/sprints`, { token: manager.token, body: {} })).json.sprint;
    const story = await task(p.id, { type: "story" });
    const sub = await task(p.id, { parentTaskId: story.id, title: "Icons" });
    await api.call("POST", `/projects/${p.id}/backlog/move`, { token: manager.token, body: { taskIds: [story.id], sprintId: sprint.id } });
    const subNow = (await api.call("GET", `/tasks/${sub.id}`, { token: manager.token })).json.task;
    assert.equal(subNow.sprintId, sprint.id);

    const put = await api.call("PUT", `/tasks/${story.id}`, { token: manager.token, body: { storyPoints: 8, sprintId: null } });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    assert.equal(put.json.task.storyPoints, 8);
    assert.equal(put.json.task.sprintId, null);

    const other = await project();
    const foreign = (await api.call("POST", `/projects/${other.id}/sprints`, { token: manager.token, body: {} })).json.sprint;
    const wrong = await api.call("PUT", `/tasks/${story.id}`, { token: manager.token, body: { sprintId: foreign.id } });
    assert.equal(wrong.json.error.code, "INVALID_SPRINT");
  });
});

describe("running a sprint", () => {
  test("start snapshots commitment; one active sprint; complete rolls unfinished work over and feeds velocity", async () => {
    const p = await project();
    const s1 = (await api.call("POST", `/projects/${p.id}/sprints`, { token: manager.token, body: {} })).json.sprint;
    const s2 = (await api.call("POST", `/projects/${p.id}/sprints`, { token: manager.token, body: {} })).json.sprint;
    assert.equal(s2.name, `${p.key} Sprint 2`);
    assert.equal((await api.call("POST", `/sprints/${s1.id}/start`, { token: manager.token, body: {} })).json.error.code, "SPRINT_EMPTY");

    const a = await task(p.id, { storyPoints: 5, sprintId: s1.id });
    const b = await task(p.id, { storyPoints: 3, sprintId: s1.id });
    const c = await task(p.id, { storyPoints: 2, sprintId: s2.id });
    const started = await api.call("POST", `/sprints/${s1.id}/start`, { token: manager.token, body: { goal: "Ship it" } });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    assert.equal(started.json.sprint.status, "active");
    assert.equal(started.json.sprint.committedPoints, 8);
    assert.ok(new Date(started.json.sprint.endDate) > new Date(started.json.sprint.startDate));

    const second = await api.call("POST", `/sprints/${s2.id}/start`, { token: manager.token, body: {} });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, "SPRINT_ACTIVE");
    assert.equal((await api.call("DELETE", `/sprints/${s1.id}`, { token: manager.token })).status, 400);

    // Search can find the running sprint's issues.
    const active = await api.call("GET", `/tasks/search?projectId=${p.id}&sprint=active&sort=rank&order=asc`, { token: dev.token });
    assert.deepEqual(active.json.tasks.map((t) => t.id), [a.id, b.id]);

    await finish(a.id);
    const report = (await api.call("GET", `/sprints/${s1.id}/report`, { token: dev.token })).json;
    assert.equal(report.burndown.committed, 8);
    assert.equal(report.burndown.days.at(-1).remaining, 3, "5 of 8 points done");
    assert.deepEqual(report.completed.map((t) => t.id), [a.id]);
    assert.deepEqual(report.notCompleted.map((t) => t.id), [b.id]);

    const done = await api.call("POST", `/sprints/${s1.id}/complete`, { token: manager.token, body: { moveTo: s2.id } });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal(done.json.carriedOver, 1);
    assert.equal(done.json.sprint.completedPoints, 5);
    const view = await backlog(p);
    assert.deepEqual(view.sprints.map((s) => s.id), [s2.id]);
    assert.deepEqual(new Set(view.sprints[0].issues.map((i) => i.id)), new Set([b.id, c.id]));

    // The closed sprint's report still shows what rolled over.
    const after = (await api.call("GET", `/sprints/${s1.id}/report`, { token: dev.token })).json;
    assert.deepEqual(after.notCompleted.map((t) => t.id), [b.id]);
    assert.deepEqual(after.completed.map((t) => t.id), [a.id]);

    const velocity = (await api.call("GET", `/projects/${p.id}/velocity`, { token: dev.token })).json;
    assert.deepEqual(velocity.sprints.map((s) => [s.committed, s.completed]), [[8, 5]]);
    assert.equal(velocity.average, 5);

    // Completing into a new sprint creates it.
    await api.call("POST", `/sprints/${s2.id}/start`, { token: manager.token, body: {} });
    const rolled = await api.call("POST", `/sprints/${s2.id}/complete`, { token: manager.token, body: { moveTo: "new" } });
    assert.equal(rolled.json.carriedOver, 2);
    const next = await backlog(p);
    assert.equal(next.sprints[0].name, `${p.key} Sprint 3`);
    assert.equal(next.sprints[0].issues.length, 2);
  });

  test("burndown counts scope added mid-sprint", async () => {
    const p = await project();
    const s = (await api.call("POST", `/projects/${p.id}/sprints`, { token: manager.token, body: {} })).json.sprint;
    await task(p.id, { storyPoints: 4, sprintId: s.id });
    await api.call("POST", `/sprints/${s.id}/start`, { token: manager.token, body: {} });
    // Pretend it started two days ago so the late addition lands on a later day.
    await api.pool.query("UPDATE sprints SET started_at = now() - interval '2 days', start_date = now() - interval '2 days' WHERE id = $1", [s.id]);
    await api.pool.query("UPDATE sprint_scope SET added_at = now() - interval '3 days' WHERE sprint_id = $1", [s.id]);
    const late = await task(p.id, { storyPoints: 6, sprintId: s.id });
    const report = (await api.call("GET", `/sprints/${s.id}/report`, { token: manager.token })).json;
    assert.equal(report.burndown.days[0].remaining, 4);
    assert.equal(report.burndown.days.at(-1).remaining, 10);
    assert.deepEqual(report.addedAfterStart.map((t) => t.id), [late.id]);
  });

  test("WIP limits are saved per project and only by its managers", async () => {
    const p = await project();
    const r = await api.call("PUT", `/projects/${p.id}/wip-limits`, { token: manager.token, body: { limits: { in_progress: 3, in_review: null } } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.wipLimits, { in_progress: 3 });
    assert.equal((await api.call("PUT", `/projects/${p.id}/wip-limits`, { token: dev.token, body: { limits: { in_progress: 1 } } })).status, 403);
    assert.deepEqual((await backlog(p)).project.wipLimits, { in_progress: 3 });
  });
});
