import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { startServer, sha } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.json));
  return r.json;
};

/** An org with servers A (primary, 10.0.0.1 / 203.0.113.1), B, C… and a blue/green app on A. */
async function setup(n = 2, strategy = "blue_green") {
  const { orgId, owner } = await api.createOrg();
  const srv = [];
  for (let i = 0; i < n; i++) {
    const s = await api.registerServer(orgId, owner, { hostname: `host-${i}`, os: "Ubuntu 24.04", cpuCount: 2 });
    ok(await api.call("PATCH", `/orgs/${orgId}/servers/${s.serverId}`, { token: owner.token, body: { ipAddress: `203.0.113.${i + 1}`, privateIpAddress: `10.0.0.${i + 1}` } }));
    srv.push(s);
  }
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv[0].serverId, strategy });
  const e = (p = "") => `/orgs/${orgId}/environments/${ctx.environment.id}${p}`;
  const deploy = async () => ok(await api.call("POST", e("/deploy"), { token: owner.token, body: { commitSha: await newCommit(ctx) } }), 201);
  return { orgId, owner, srv, ...ctx, e, deploy };
}

async function newCommit(ctx) {
  const c = sha();
  ctx.lastCommit = c;
  return c;
}

const stepsOf = (run) => run.job.steps.map((s) => s.action);
const step = (run, action, n = 0) => run.job.steps.filter((s) => s.action === action)[n];
const replicaRows = async (envId) => (await api.pool.query("SELECT server_id, status, active_slot, blue_port, green_port, listen_port, current_release_id FROM environment_replicas WHERE environment_id = $1", [envId])).rows;

test("a new environment has its primary as its only replica; the backfill migration adds missing rows", async () => {
  const { environment, srv, e, owner } = await setup(1);
  const rows = await replicaRows(environment.id);
  assert.deepEqual(rows.map((r) => [r.server_id, r.status, r.blue_port, r.green_port, r.listen_port]), [[srv[0].serverId, "active", environment.bluePort, environment.greenPort, null]]);
  const view = ok(await api.call("GET", e("/replicas"), { token: owner.token }));
  assert.equal(view.pooled, false);
  assert.equal(view.replicas[0].primary, true);
  assert.equal(view.replicas[0].proxy, true);

  // Environments from before replicas: the backfill (a generated custom migration) gives each its row.
  await api.pool.query("DELETE FROM environment_replicas WHERE environment_id = $1", [environment.id]);
  const file = readdirSync("src/migrations").find((f) => /^\d+_backfill_environment_replicas\.sql$/.test(f));
  await api.pool.query(readFileSync(`src/migrations/${file}`, "utf8"));
  assert.equal((await replicaRows(environment.id)).length, 1);
  // Running it again changes nothing.
  await api.pool.query(readFileSync(`src/migrations/${file}`, "utf8"));
  assert.equal((await replicaRows(environment.id)).length, 1);
});

test("one server: deploys have no listener, no pool, and stop the old colour as before", async () => {
  const { srv, deploy } = await setup(1);
  await deploy();
  const first = await api.runClaimedJob(srv[0].agentToken);
  assert.ok(!stepsOf(first).includes("nginx.write_listener"));
  await deploy();
  const second = await api.runClaimedJob(srv[0].agentToken);
  assert.deepEqual(stepsOf(second).slice(-3), ["nginx.write_upstream", "nginx.reload", "compose.down"]);
  // Nothing else queued (no pool sync, no rollout_finish).
  assert.equal(await api.runClaimedJob(srv[0].agentToken), null);
});

test("adding a replica deploys the live release there, then the proxy pools both servers", async () => {
  const { orgId, owner, srv, environment, e, deploy } = await setup(2);
  await deploy();
  await api.runClaimedJob(srv[0].agentToken);

  const add = ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[1].serverId } }), 201);
  assert.equal(add.replica.status, "adding");
  assert.ok(add.jobId);
  // A second add or a deploy waits.
  assert.equal((await api.call("POST", e("/deploy"), { token: owner.token, body: {} })).status, 409);

  const onB = await api.runClaimedJob(srv[1].agentToken);
  assert.equal(onB.job.type, "replica_add");
  assert.ok(!stepsOf(onB).includes("release.run"));
  assert.ok(!stepsOf(onB).includes("compose.down"));
  const listener = step(onB, "nginx.write_listener");
  assert.equal(listener.params.port, add.replica.listenPort);
  assert.deepEqual(listener.params.allow, ["203.0.113.1", "10.0.0.1", "127.0.0.1", "::1"]);
  assert.equal(step(onB, "health.check").params.port, add.replica.bluePort);

  // The pool update: listener on B again (idempotent), then the proxy (A).
  const syncB = await api.runClaimedJob(srv[1].agentToken);
  assert.equal(syncB.job.type, "upstream_sync");
  assert.deepEqual(stepsOf(syncB), ["nginx.write_listener", "nginx.reload"]);
  const syncA = await api.runClaimedJob(srv[0].agentToken);
  assert.deepEqual(stepsOf(syncA), ["nginx.write_listener", "nginx.write_pool", "nginx.reload"]);
  const rows = await replicaRows(environment.id);
  const a = rows.find((r) => r.server_id === srv[0].serverId);
  const b = rows.find((r) => r.server_id === srv[1].serverId);
  assert.ok(a.listen_port, "the primary got a listener port when the environment became pooled");
  assert.deepEqual(step(syncA, "nginx.write_pool").params, {
    slug: environment.slug,
    servers: [
      { host: "127.0.0.1", port: a.listen_port },
      { host: "10.0.0.2", port: b.listen_port },
    ],
    maxFails: 3,
    failTimeoutSec: 10,
  });
  assert.equal(b.status, "active");
  assert.equal(b.active_slot, "blue");
  const view = ok(await api.call("GET", e("/replicas"), { token: owner.token }));
  assert.equal(view.pooled, true);
  assert.deepEqual(view.replicas.map((r) => r.primary), [true, false]);

  // Ports on B are allocated above everything else B runs.
  const other = await api.createAppWithEnvironment(orgId, owner, { serverId: srv[1].serverId });
  assert.ok(other.environment.bluePort > b.listen_port);

  // Deleting the environment: the proxy drops the pool, then every server tears down.
  ok(await api.call("DELETE", e(), { token: owner.token }));
  assert.deepEqual(stepsOf(await api.runClaimedJob(srv[0].agentToken)), ["nginx.remove_pool", "nginx.reload"]);
  assert.deepEqual(stepsOf(await api.runClaimedJob(srv[0].agentToken)), ["compose.down", "nginx.remove_listener", "nginx.remove_upstream", "nginx.reload"]);
  assert.deepEqual(stepsOf(await api.runClaimedJob(srv[1].agentToken)), ["compose.down", "nginx.remove_listener", "nginx.remove_upstream", "nginx.reload"]);
  assert.equal((await replicaRows(environment.id)).length, 0);
});

test("a deploy rolls out server by server, primary first, and stops the old colours at the end", async () => {
  const { owner, srv, environment, e, deploy } = await setup(2);
  await deploy();
  await api.runClaimedJob(srv[0].agentToken);
  ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[1].serverId } }), 201);
  await api.runClaimedJob(srv[1].agentToken); // replica_add
  await api.runClaimedJob(srv[1].agentToken); // sync B
  await api.runClaimedJob(srv[0].agentToken); // sync A

  const started = await deploy();
  // Only the primary has a job so far.
  assert.equal(await api.runClaimedJob(srv[1].agentToken), null);
  const onA = await api.runClaimedJob(srv[0].agentToken);
  assert.match(onA.job.title, /\(1\/2\)$/);
  assert.equal(step(onA, "compose.up").params.slot, "green");
  assert.ok(stepsOf(onA).includes("nginx.write_listener"));
  assert.ok(!stepsOf(onA).includes("compose.down"), "the old colour keeps running until every server is updated");
  let dep = (await api.pool.query("SELECT status, rollout FROM deployments WHERE id = $1", [started.deployment.id])).rows[0];
  assert.equal(dep.status, "running");
  assert.deepEqual(dep.rollout.done, [srv[0].serverId]);

  const onB = await api.runClaimedJob(srv[1].agentToken);
  assert.match(onB.job.title, /\(2\/2\)$/);
  assert.equal(step(onB, "compose.up").params.slot, "green");
  const rows = await replicaRows(environment.id);
  assert.equal(step(onB, "health.check").params.port, rows.find((r) => r.server_id === srv[1].serverId).green_port);
  dep = (await api.pool.query("SELECT status, rollout FROM deployments WHERE id = $1", [started.deployment.id])).rows[0];
  assert.equal(dep.status, "success");
  const env = (await api.pool.query("SELECT active_slot, current_release_id FROM environments WHERE id = $1", [environment.id])).rows[0];
  assert.equal(env.active_slot, "green");
  assert.ok(rows.every((r) => r.active_slot === "green" && r.current_release_id === env.current_release_id));

  // Both servers now stop blue; no pool change (membership is the same).
  for (const s of [srv[0], srv[1]]) {
    const fin = await api.runClaimedJob(s.agentToken);
    assert.equal(fin.job.type, "rollout_finish");
    assert.deepEqual(fin.job.steps.map((x) => [x.action, x.params.slot]), [["compose.down", "blue"]]);
    assert.equal(await api.runClaimedJob(s.agentToken), null);
  }
});

test("a failure on the second server stops the rollout and rolls back the first", async () => {
  const { owner, srv, environment, e, deploy } = await setup(3);
  await deploy();
  await api.runClaimedJob(srv[0].agentToken);
  for (const s of [srv[1], srv[2]]) {
    ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: s.serverId } }), 201);
    await api.runClaimedJob(s.agentToken); // replica_add
    // Sync: listeners on the other deployed replicas, then the proxy.
    for (let i = 0; i < 3; i++) for (const t of [srv[1], srv[2], srv[0]]) await api.runClaimedJob(t.agentToken);
  }
  const before = (await api.pool.query("SELECT current_release_id, active_slot FROM environments WHERE id = $1", [environment.id])).rows[0];

  const started = await deploy();
  await api.runClaimedJob(srv[0].agentToken); // primary: green, healthy
  const failed = await api.runClaimedJob(srv[1].agentToken, { failAt: "health.check" });
  assert.match(failed.job.title, /\(2\/3\)$/);

  const dep = (await api.pool.query("SELECT status, error, rollout FROM deployments WHERE id = $1", [started.deployment.id])).rows[0];
  assert.equal(dep.status, "failure");
  assert.equal(dep.rollout.failedServerId, srv[1].serverId);
  assert.match(dep.error, /^srv-/);
  // The third server was never touched.
  assert.equal(await api.runClaimedJob(srv[2].agentToken), null);
  // The failed server stops its half-started colour (the upstream was not switched yet).
  const cleanup = await api.runClaimedJob(srv[1].agentToken);
  assert.equal(cleanup.job.type, "deploy_cleanup");
  assert.deepEqual(cleanup.job.steps.map((s) => [s.action, s.params.slot ?? null]), [["compose.down", "green"]]);
  // The primary goes back to blue.
  const revert = await api.runClaimedJob(srv[0].agentToken);
  assert.equal(revert.job.type, "rollout_revert");
  const rows = await replicaRows(environment.id);
  const a = rows.find((r) => r.server_id === srv[0].serverId);
  assert.deepEqual(revert.job.steps.map((s) => s.action), ["nginx.write_upstream", "nginx.reload", "compose.down"]);
  assert.equal(revert.job.steps[0].params.port, a.blue_port);
  assert.equal(revert.job.steps[2].params.slot, "green");
  assert.ok(rows.every((r) => r.active_slot === "blue" && r.current_release_id === before.current_release_id));
  const after = (await api.pool.query("SELECT current_release_id, active_slot FROM environments WHERE id = $1", [environment.id])).rows[0];
  assert.deepEqual(after, before);
  // The environment is free again.
  await deploy();
});

test("recreate: a failed rollout redeploys the previous release on the servers already updated", async () => {
  const { owner, srv, e, deploy } = await setup(2, "recreate");
  await deploy();
  await api.runClaimedJob(srv[0].agentToken);
  ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[1].serverId } }), 201);
  await api.runClaimedJob(srv[1].agentToken);
  await api.runClaimedJob(srv[1].agentToken);
  await api.runClaimedJob(srv[0].agentToken);
  const firstRelease = (await api.pool.query("SELECT current_release_id FROM environment_replicas WHERE server_id = $1", [srv[0].serverId])).rows[0].current_release_id;

  await deploy();
  await api.runClaimedJob(srv[0].agentToken);
  await api.runClaimedJob(srv[1].agentToken, { failAt: "compose.up" });
  const revert = await api.runClaimedJob(srv[0].agentToken);
  assert.equal(revert.job.type, "rollout_revert");
  assert.equal(step(revert, "release.prepare").params.releaseId, firstRelease);
  assert.ok(!stepsOf(revert).includes("release.run"));
});

test("removing a replica takes it out of the pool first, then stops it; the last one leaves the pool", async () => {
  const { owner, srv, environment, e, deploy } = await setup(2);
  await deploy();
  await api.runClaimedJob(srv[0].agentToken);
  ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[1].serverId } }), 201);
  await api.runClaimedJob(srv[1].agentToken);
  await api.runClaimedJob(srv[1].agentToken);
  await api.runClaimedJob(srv[0].agentToken);

  assert.equal((await api.call("DELETE", e(`/replicas/${srv[0].serverId}`), { token: owner.token })).json.error.code, "PRIMARY_REPLICA");
  const removed = ok(await api.call("DELETE", e(`/replicas/${srv[1].serverId}`), { token: owner.token }), 202);
  assert.ok(removed.jobId);
  // Back to one server: the primary drops the pool and its listener.
  const unpool = await api.runClaimedJob(srv[0].agentToken);
  assert.deepEqual(stepsOf(unpool), ["nginx.remove_pool", "nginx.remove_listener", "nginx.reload"]);
  assert.equal((await replicaRows(environment.id)).find((r) => r.server_id === srv[1].serverId).status, "removing");
  const teardown = await api.runClaimedJob(srv[1].agentToken);
  assert.equal(teardown.job.type, "replica_teardown");
  assert.deepEqual(stepsOf(teardown), ["nginx.remove_listener", "compose.down", "compose.down", "nginx.remove_upstream", "nginx.reload"]);
  assert.deepEqual((await replicaRows(environment.id)).map((r) => r.server_id), [srv[0].serverId]);
  // Single-server deploys again.
  await deploy();
  const next = await api.runClaimedJob(srv[0].agentToken);
  assert.ok(!stepsOf(next).includes("nginx.write_listener"));
  assert.ok(stepsOf(next).includes("compose.down"));
});

test("a dedicated proxy, domains on the pool, and server deletion guarded", async () => {
  const { orgId, owner, srv, environment, e, deploy } = await setup(3);
  await deploy();
  await api.runClaimedJob(srv[0].agentToken);
  ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[1].serverId } }), 201);
  await api.runClaimedJob(srv[1].agentToken);
  await api.runClaimedJob(srv[1].agentToken);
  await api.runClaimedJob(srv[0].agentToken);

  // C becomes the proxy: A drops the pool, listeners are rewritten to allow C, C gets the pool.
  const moved = ok(await api.call("PUT", e("/proxy"), { token: owner.token, body: { serverId: srv[2].serverId } }));
  assert.equal(moved.environment.proxyServerId, srv[2].serverId);
  const dropA = await api.runClaimedJob(srv[0].agentToken);
  assert.deepEqual(stepsOf(dropA), ["nginx.remove_pool", "nginx.reload"]);
  const listenA = await api.runClaimedJob(srv[0].agentToken);
  assert.deepEqual(step(listenA, "nginx.write_listener").params.allow, ["203.0.113.3", "10.0.0.3", "127.0.0.1", "::1"]);
  await api.runClaimedJob(srv[1].agentToken);
  const poolC = await api.runClaimedJob(srv[2].agentToken);
  assert.deepEqual(step(poolC, "nginx.write_pool").params.servers.map((m) => m.host), ["10.0.0.1", "10.0.0.2"]);

  // Domains are served by the proxy: DNS shows its IP and certificates are issued there, on the pool.
  const d = ok(await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/domains`, { token: owner.token, body: { hostname: `shop-${sha().slice(0, 8)}.example.com` } }), 201);
  assert.equal(d.domain.dnsRecord.value, "203.0.113.3");
  await api.pool.query("UPDATE domains SET dns_checked_at = now() WHERE id = $1", [d.domain.id]);
  ok(await api.call("POST", `/orgs/${orgId}/domains/${d.domain.id}/issue`, { token: owner.token }));
  const issue = await api.runClaimedJob(srv[2].agentToken);
  assert.equal(issue.job.type, "domain_issue");
  assert.ok(issue.job.steps.filter((s) => s.action === "nginx.write_site").every((s) => s.params.pool === true));
  // With domains the proxy can't move.
  assert.equal((await api.call("PUT", e("/proxy"), { token: owner.token, body: { serverId: srv[0].serverId } })).status, 409);
  // A server in use as a replica or proxy can't be deleted.
  for (const s of [srv[1], srv[2]]) assert.equal((await api.call("DELETE", `/orgs/${orgId}/servers/${s.serverId}`, { token: owner.token })).status, 409);

  // Make B the primary: ports and slot follow it, the proxy stays.
  const promoted = ok(await api.call("POST", e(`/replicas/${srv[1].serverId}/primary`), { token: owner.token }));
  const b = (await replicaRows(environment.id)).find((r) => r.server_id === srv[1].serverId);
  assert.equal(promoted.environment.serverId, srv[1].serverId);
  assert.equal(promoted.environment.bluePort, b.blue_port);
  assert.equal(promoted.environment.proxyServerId, srv[2].serverId);
  await deploy();
  const first = await api.runClaimedJob(srv[1].agentToken);
  assert.match(first.job.title, /\(1\/2\)$/);
});

test("replica input is validated", async () => {
  const { orgId, owner, srv, e } = await setup(2);
  assert.equal((await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: "nope" } })).status, 400);
  assert.equal((await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[0].serverId } })).status, 409);
  // A server without an address can't join (the proxy could not reach it).
  const bare = await api.registerServer(orgId, owner);
  await api.pool.query("UPDATE servers SET ip_address = NULL, private_ip_address = NULL WHERE id = $1", [bare.serverId]);
  assert.equal((await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: bare.serverId } })).json.error.code, "REPLICA_NO_IP");
  // An undeployed environment adds the replica at once (nothing to deploy yet).
  const added = ok(await api.call("POST", e("/replicas"), { token: owner.token, body: { serverId: srv[1].serverId } }), 201);
  assert.equal(added.replica.status, "active");
  assert.equal(added.jobId, null);
  assert.equal((await api.call("PATCH", `/orgs/${orgId}/servers/${srv[1].serverId}`, { token: owner.token, body: { privateIpAddress: "not-an-ip" } })).status, 400);
});
