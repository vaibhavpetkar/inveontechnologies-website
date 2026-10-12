import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

async function deployableEnv() {
  const { orgId, owner, member } = await api.createOrg();
  const a = await api.registerServer(orgId, owner);
  const b = await api.registerServer(orgId, owner);
  const { environment } = await api.createAppWithEnvironment(orgId, owner, { serverId: a.serverId });
  return { orgId, owner, member, a, b, environment };
}

test("agents only claim their own server's jobs", async () => {
  const { orgId, owner, a, b, environment } = await deployableEnv();
  const dep = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  assert.equal(dep.status, 201);

  const other = await api.call("POST", "/agent/jobs/claim", { token: b.agentToken });
  assert.equal(other.status, 204);
  const mine = await api.call("POST", "/agent/jobs/claim", { token: a.agentToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.job.id, dep.json.job.id);
  // Claimed exactly once.
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: a.agentToken })).status, 204);
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: "bogus" })).status, 401);
});

test("an agent can't report or finish another server's job", async () => {
  const { orgId, owner, a, b, environment } = await deployableEnv();
  await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  const { json } = await api.call("POST", "/agent/jobs/claim", { token: a.agentToken });
  const job = json.job;
  const step = job.steps[0];

  const forged = await api.call("POST", `/agent/jobs/${job.id}/steps/${step.id}`, { token: b.agentToken, body: { status: "success", append: "pwned\n" } });
  assert.equal(forged.status, 404);
  const forgedFinish = await api.call("POST", `/agent/jobs/${job.id}/finish`, { token: b.agentToken, body: { status: "success" } });
  assert.equal(forgedFinish.status, 404);

  // A step id from another job is rejected even for the right server.
  const view = await api.call("GET", `/orgs/${orgId}/jobs/${job.id}`, { token: owner.token });
  assert.equal(view.json.job.status, "running");
  assert.ok(!view.json.steps.some((s) => s.log.includes("pwned")));
  assert.equal((await api.call("POST", `/agent/jobs/${job.id}/steps/00000000-0000-0000-0000-000000000000`, { token: a.agentToken, body: { status: "success" } })).status, 404);
});

test("finish is re-checked: success with unfinished steps is a failure", async () => {
  const { orgId, owner, a, environment } = await deployableEnv();
  await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  const { json } = await api.call("POST", "/agent/jobs/claim", { token: a.agentToken });
  const job = json.job;
  await api.call("POST", `/agent/jobs/${job.id}/steps/${job.steps[0].id}`, { token: a.agentToken, body: { status: "success", append: "ok\n" } });
  const fin = await api.call("POST", `/agent/jobs/${job.id}/finish`, { token: a.agentToken, body: { status: "success" } });
  assert.equal(fin.json.status, "failure");

  const view = await api.call("GET", `/orgs/${orgId}/jobs/${job.id}`, { token: owner.token });
  assert.equal(view.json.job.status, "failure");
  assert.equal(view.json.steps[0].status, "success");
  assert.equal(view.json.steps[0].log, "ok\n");
  assert.equal(view.json.steps[1].status, "cancelled");
  // Terminal jobs accept no more reports.
  assert.equal((await api.call("POST", `/agent/jobs/${job.id}/steps/${job.steps[1].id}`, { token: a.agentToken, body: { status: "success" } })).status, 409);
});

test("cancelling a running job stops further reports; viewers can't cancel", async () => {
  const { orgId, owner, member, a, environment } = await deployableEnv();
  const viewer = await member("viewer");
  const dep = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  const { json } = await api.call("POST", "/agent/jobs/claim", { token: a.agentToken });
  assert.equal((await api.call("POST", `/orgs/${orgId}/jobs/${dep.json.job.id}/cancel`, { token: viewer.token })).status, 403);
  assert.equal((await api.call("POST", `/orgs/${orgId}/jobs/${dep.json.job.id}/cancel`, { token: owner.token })).status, 200);
  const r = await api.call("POST", `/agent/jobs/${json.job.id}/steps/${json.job.steps[0].id}`, { token: a.agentToken, body: { status: "running" } });
  assert.equal(r.status, 409);
});

test("job stream sends a snapshot over SSE", async () => {
  const { orgId, owner, a, environment } = await deployableEnv();
  const dep = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  await api.runClaimedJob(a.agentToken);
  const res = await fetch(`${api.base}/orgs/${orgId}/jobs/${dep.json.job.id}/stream`, { headers: { Authorization: `Bearer ${owner.token}` } });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  assert.match(text, /^event: snapshot\ndata: /);
  const data = JSON.parse(text.split("\n")[1].slice(6));
  assert.equal(data.job.status, "success");
  assert.ok(data.steps.every((s) => s.status === "success"));
});
