import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { startServer } from "./helpers.mjs";

const SECRET = "gh-webhook-secret";
const REPO = "inveon/interns";
let api, manager, intern, fake;

// A stand-in for the GitHub issues API.
function startFakeGithub() {
  const issues = new Map(); // `${repo}#${n}` -> issue
  const calls = [];
  let next = 1;
  const make = (repo, fields) => {
    const number = next++;
    const issue = { number, state: "open", body: null, assignees: [], ...fields, html_url: `https://github.com/${repo}/issues/${number}` };
    issues.set(`${repo}#${number}`, issue);
    return issue;
  };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const json = body ? JSON.parse(body) : null;
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: json });
      res.setHeader("Content-Type", "application/json");
      const list = req.url.match(/^\/repos\/([^/]+\/[^/]+)\/issues\?/);
      const one = req.url.match(/^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/);
      const create = req.url.match(/^\/repos\/([^/]+\/[^/]+)\/issues$/);
      const comment = req.url.match(/^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/comments$/);
      if (create && req.method === "POST") {
        if (json.assignees?.includes("not-a-collaborator")) {
          res.statusCode = 422;
          res.end(JSON.stringify({ message: "Validation Failed" }));
          return;
        }
        res.statusCode = 201;
        res.end(JSON.stringify(make(create[1], { title: json.title, body: json.body, assignees: (json.assignees ?? []).map((login) => ({ login })) })));
        return;
      }
      if (list) {
        res.end(JSON.stringify([...issues.entries()].filter(([k, i]) => k.startsWith(`${list[1]}#`) && i.state === "open").map(([, i]) => i)));
        return;
      }
      if (comment && req.method === "POST") {
        res.statusCode = 201;
        res.end("{}");
        return;
      }
      if (one) {
        const issue = issues.get(`${one[1]}#${one[2]}`);
        if (!issue) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: "Not Found" }));
          return;
        }
        if (req.method === "PATCH") Object.assign(issue, { state: json.state ?? issue.state });
        res.end(JSON.stringify(issue));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "Not Found" }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, issues, calls, make, url: `http://127.0.0.1:${server.address().port}` })));
}

before(async () => {
  fake = await startFakeGithub();
  api = await startServer({ GITHUB_TOKEN: "ghp_test", GITHUB_WEBHOOK_SECRET: SECRET, GITHUB_DEFAULT_REPO: REPO, GITHUB_API_BASE: fake.url });
  manager = await api.createUser("manager");
  intern = await api.createUser("intern");
});
after(async () => {
  await api?.stop();
  fake?.server.close();
});

const newTask = async (extra = {}) => (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Build the careers page", description: "Match the Figma", assigneeId: intern.id, ...extra } })).json.task;
const taskById = async (id) => (await api.call("GET", `/tasks/${id}`, { token: manager.token })).json.task;
function hook(event, payload, secret = SECRET) {
  const raw = JSON.stringify(payload);
  return fetch(`${api.base}/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-github-event": event, "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` },
    body: raw,
  });
}

describe("GitHub issues and tasks", () => {
  test("opening an issue from a task links it and assigns the intern's GitHub account", async () => {
    await api.call("PUT", "/github/me", { token: intern.token, body: { username: "meera-dev" } });
    const task = await newTask();
    const r = await api.call("POST", `/github/tasks/${task.id}/issue`, { token: manager.token, body: {} });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.task.githubRepo, REPO);
    assert.equal(r.json.task.githubIssueState, "open");
    const sent = fake.calls.findLast((c) => c.method === "POST" && c.url === `/repos/${REPO}/issues`);
    assert.equal(sent.auth, "Bearer ghp_test");
    assert.deepEqual(sent.body.assignees, ["meera-dev"]);
    assert.match(sent.body.body, new RegExp(`/tasks/${task.id}`));
    assert.equal((await api.call("POST", `/github/tasks/${task.id}/issue`, { token: manager.token, body: {} })).status, 409, "one issue per task");
  });

  test("an assignee GitHub rejects still gets the issue opened, unassigned", async () => {
    await api.call("PUT", "/github/me", { token: intern.token, body: { username: "not-a-collaborator" } });
    const task = await newTask();
    const r = await api.call("POST", `/github/tasks/${task.id}/issue`, { token: manager.token, body: {} });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    await api.call("PUT", "/github/me", { token: intern.token, body: { username: "meera-dev" } });
  });

  test("linking takes a URL, owner/repo#n or a bare number, and refuses a second task on the same issue", async () => {
    const issue = fake.make(REPO, { title: "Fix the navbar" });
    const a = await newTask();
    const byNumber = await api.call("POST", `/github/tasks/${a.id}/link`, { token: intern.token, body: { ref: `#${issue.number}` } });
    assert.equal(byNumber.status, 200, JSON.stringify(byNumber.json));
    assert.equal(byNumber.json.task.githubIssueNumber, issue.number);
    const b = await newTask();
    assert.equal((await api.call("POST", `/github/tasks/${b.id}/link`, { token: manager.token, body: { ref: issue.html_url } })).status, 409);
    assert.equal((await api.call("POST", `/github/tasks/${b.id}/link`, { token: manager.token, body: { ref: "inveon/interns#9999" } })).status, 404);
    assert.equal((await api.call("POST", `/github/tasks/${b.id}/link`, { token: manager.token, body: { ref: "hello" } })).status, 400);
    const other = await api.createUser("intern");
    assert.equal((await api.call("POST", `/github/tasks/${b.id}/link`, { token: other.token, body: { ref: issue.html_url } })).status, 403);
  });

  test("closing the issue on GitHub finishes the task; reopening puts it back in progress", async () => {
    const task = await newTask();
    const linked = (await api.call("POST", `/github/tasks/${task.id}/issue`, { token: manager.token, body: {} })).json.task;
    const issue = { number: linked.githubIssueNumber, title: linked.title, state: "closed", assignees: [] };
    const repository = { full_name: REPO };

    assert.equal((await hook("issues", { action: "closed", issue, repository }, "wrong-secret")).status, 401);
    assert.equal((await hook("issues", { action: "closed", issue, repository, sender: { login: "meera-dev" } })).status, 200);
    assert.equal((await taskById(task.id)).status, "done");
    const timeline = (await api.call("GET", `/tasks/${task.id}/timeline`, { token: manager.token })).json.timeline;
    assert.ok(timeline.some((e) => e.action === "github_sync" && e.toStatus === "done" && /meera-dev/.test(e.note)));

    await hook("issues", { action: "reopened", issue: { ...issue, state: "open" }, repository });
    assert.equal((await taskById(task.id)).status, "in_progress");

    assert.equal((await hook("issues", { action: "closed", issue: { ...issue, number: 424242 }, repository })).status, 200, "unknown issues are ignored");
    assert.equal((await hook("ping", { zen: "hi" })).status, 200);
  });

  test("finishing the task in the portal closes the issue", async () => {
    const task = await newTask();
    const linked = (await api.call("POST", `/github/tasks/${task.id}/issue`, { token: manager.token, body: {} })).json.task;
    for (const toStatus of ["in_progress", "in_review"]) await api.call("POST", `/tasks/${task.id}/transition`, { token: intern.token, body: { toStatus } });
    assert.ok(fake.calls.some((c) => c.method === "POST" && c.url === `/repos/${REPO}/issues/${linked.githubIssueNumber}/comments`), "review is noted on the issue");
    await api.call("POST", `/tasks/${task.id}/transition`, { token: manager.token, body: { toStatus: "done" } });
    assert.equal(fake.issues.get(`${REPO}#${linked.githubIssueNumber}`).state, "closed");
  });

  test("importing open issues creates tasks once, matching assignees by GitHub username", async () => {
    const repo = "inveon/website";
    fake.make(repo, { title: "Add a blog", assignees: [{ login: "Meera-Dev" }] });
    fake.make(repo, { title: "Speed up images" });
    fake.make(repo, { title: "Old one", state: "closed" });
    assert.equal((await api.call("POST", "/github/import", { token: intern.token, body: { repo } })).status, 403);
    const first = await api.call("POST", "/github/import", { token: manager.token, body: { repo } });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json.created, 2);
    assert.equal(first.json.tasks.find((t) => t.title === "Add a blog").assigneeId, intern.id);
    const again = await api.call("POST", "/github/import", { token: manager.token, body: { repo } });
    assert.equal(again.json.created, 0);
    assert.equal(again.json.skipped, 2);
  });

  test("status reports whether GitHub is connected", async () => {
    const s = await api.call("GET", "/github/status", { token: intern.token });
    assert.deepEqual(s.json, { enabled: true, defaultRepo: REPO, webhook: true, username: "meera-dev" });
  });
});
