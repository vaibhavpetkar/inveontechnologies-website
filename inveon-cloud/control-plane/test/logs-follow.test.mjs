// Live logs (`docker compose logs -f`): the stream lane, relaying output
// over SSE without storing it, roles, audit, and stopping when the viewer leaves.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, sha, openStream, waitUntil } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

async function deployed() {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  return { orgId, owner, member, srv, base, ...ctx };
}

const claim = (token, lane) => api.call("POST", "/agent/jobs/claim", { token, body: lane ? { lane } : {} });

test("heartbeat tells the agent about the stream lane", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const hb = await api.call("POST", "/agent/heartbeat", { token: srv.agentToken, body: { facts: {} } });
  assert.deepEqual(hb.json, { ok: true, features: ["stream_lane"] });
});

test("follow: roles and validation, stream lane only, output relayed live and never stored, audited", async () => {
  const { orgId, owner, member, srv, base, environment } = await deployed();
  const developer = await member("developer");
  const viewer = await member("viewer");

  assert.equal((await api.call("POST", `${base}/logs/follow`, { token: viewer.token, body: { service: "web" } })).status, 403);
  assert.equal((await api.call("POST", `${base}/logs/follow`, { token: developer.token, body: {} })).status, 400);
  assert.equal((await api.call("POST", `${base}/logs/follow`, { token: developer.token, body: { service: "web; rm -rf /" } })).status, 400);
  assert.equal((await api.call("POST", `${base}/logs/follow`, { token: developer.token, body: { service: "--volume=/:/x" } })).status, 400);
  assert.equal((await api.call("POST", `${base}/logs/follow`, { token: developer.token, body: { service: "web", durationSec: 601 } })).status, 400);
  assert.equal((await api.call("POST", `/orgs/${orgId}/environments/00000000-0000-0000-0000-000000000000/logs/follow`, { token: developer.token, body: { service: "web" } })).status, 404);

  const res = await api.call("POST", `${base}/logs/follow`, { token: developer.token, body: { service: "web", tail: 50 } });
  assert.equal(res.status, 201);
  const jobId = res.json.job.id;
  assert.equal(res.json.job.type, "logs_follow");
  assert.equal(res.json.streamUrl, `/orgs/${orgId}/jobs/${jobId}/stream`);

  // The main lane (deploys) never hands out a log stream, and a deploy is not held up by one.
  assert.equal((await claim(srv.agentToken)).status, 204);
  const deploy = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  assert.equal(deploy.status, 201);
  const mainClaim = await claim(srv.agentToken, "main");
  assert.equal(mainClaim.json.job.id, deploy.json.job.id);
  await api.call("POST", `/orgs/${orgId}/jobs/${deploy.json.job.id}/cancel`, { token: owner.token });

  // Viewers can't watch container output; developers can.
  assert.equal((await api.call("GET", `/orgs/${orgId}/jobs/${jobId}`, { token: viewer.token })).status, 403);
  const denied = await openStream(api.base, `/orgs/${orgId}/jobs/${jobId}/stream`, viewer.token);
  assert.equal(denied.status, 403);
  const stream = await openStream(api.base, res.json.streamUrl, developer.token);
  assert.equal(stream.status, 200);
  await stream.waitFor((e) => e.event === "snapshot");

  const claimed = await claim(srv.agentToken, "stream");
  assert.equal(claimed.status, 200);
  const job = claimed.json.job;
  assert.equal(job.id, jobId);
  assert.deepEqual(job.steps.map((s) => s.action), ["compose.logs_follow"]);
  assert.deepEqual(job.steps[0].params, { slug: environment.slug, slot: "blue", composePath: "docker-compose.yml", service: "web", tail: 50, durationSec: 600 });

  const step = job.steps[0];
  await api.call("POST", `/agent/jobs/${jobId}/steps/${step.id}`, { token: srv.agentToken, body: { status: "running" } });
  await api.call("POST", `/agent/jobs/${jobId}/steps/${step.id}`, { token: srv.agentToken, body: { append: "web-1 | GET /healthz 200\n" } });
  const ev = await stream.waitFor((e) => e.event === "log");
  assert.equal(ev.data.chunk, "web-1 | GET /healthz 200\n");
  // An empty check-in (the agent's keepalive) is accepted.
  assert.equal((await api.call("POST", `/agent/jobs/${jobId}/steps/${step.id}`, { token: srv.agentToken, body: {} })).status, 200);

  const { rows } = await api.pool.query("SELECT log FROM job_steps WHERE id = $1", [step.id]);
  assert.equal(rows[0].log, "", "live output is not stored");
  const audit = await api.pool.query("SELECT metadata FROM audit_logs WHERE org_id = $1 AND action = 'logs.follow'", [orgId]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].metadata.service, "web");
  assert.equal(audit.rows[0].metadata.jobId, jobId);

  // The viewer leaves: the job is cancelled, and the agent's next report is refused (it stops docker).
  stream.close();
  await waitUntil(async () => (await api.pool.query("SELECT status FROM jobs WHERE id = $1", [jobId])).rows[0].status === "cancelled");
  const after = await api.call("POST", `/agent/jobs/${jobId}/steps/${step.id}`, { token: srv.agentToken, body: { append: "more\n" } });
  assert.equal(after.status, 409);
});

test("a stream stays open while someone is still watching", async () => {
  const { orgId, owner, srv, base } = await deployed();
  const res = await api.call("POST", `${base}/logs/follow`, { token: owner.token, body: { service: "web" } });
  const path = `/orgs/${orgId}/jobs/${res.json.job.id}/stream`;
  const a = await openStream(api.base, path, owner.token);
  const b = await openStream(api.base, path, owner.token);
  await a.waitFor((e) => e.event === "snapshot");
  await b.waitFor((e) => e.event === "snapshot");
  await claim(srv.agentToken, "stream");
  a.close();
  await new Promise((r) => setTimeout(r, 3600));
  assert.equal((await api.pool.query("SELECT status FROM jobs WHERE id = $1", [res.json.job.id])).rows[0].status, "running");
  b.close();
  await waitUntil(async () => (await api.pool.query("SELECT status FROM jobs WHERE id = $1", [res.json.job.id])).rows[0].status === "cancelled");
});

test("at most 4 live streams per server, and only for deployed environments", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  assert.equal((await api.call("POST", `${base}/logs/follow`, { token: owner.token, body: { service: "web" } })).status, 400);
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  for (let i = 0; i < 4; i++) assert.equal((await api.call("POST", `${base}/logs/follow`, { token: owner.token, body: { service: "web" } })).status, 201);
  const fifth = await api.call("POST", `${base}/logs/follow`, { token: owner.token, body: { service: "web" } });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.json.error.code, "TOO_MANY_STREAMS");
});
