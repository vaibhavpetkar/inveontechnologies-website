import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startServer, sha } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const sign = (secret, body) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

async function setup(strategy = "blue_green") {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId, strategy });
  return { orgId, owner, member, srv, ...ctx };
}

test("GitHub webhook: signature is required and checked", async () => {
  const { app, webhookSecret, srv, repoOwner, repo } = await setup();
  const commit = sha();
  const body = JSON.stringify({ ref: "refs/heads/main", after: commit, head_commit: { message: "Fix footer" }, repository: { full_name: `${repoOwner}/${repo}` } });
  const path = `/webhooks/github/${app.id}`;

  const unsigned = await api.call("POST", path, { raw: body, headers: { "X-GitHub-Event": "push", "Content-Type": "application/json" } });
  assert.equal(unsigned.status, 401);
  const wrong = await api.call("POST", path, { raw: body, headers: { "X-GitHub-Event": "push", "Content-Type": "application/json", "X-Hub-Signature-256": sign("wrong-secret", body) } });
  assert.equal(wrong.status, 401);
  // Signature over a different body.
  const tampered = await api.call("POST", path, { raw: body.replace("Fix", "Pwn"), headers: { "X-GitHub-Event": "push", "Content-Type": "application/json", "X-Hub-Signature-256": sign(webhookSecret, body) } });
  assert.equal(tampered.status, 401);
  const badPrefix = await api.call("POST", path, { raw: body, headers: { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(webhookSecret, body).replace("sha256=", "sha1=") } });
  assert.equal(badPrefix.status, 401);
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM releases WHERE app_id = $1", [app.id])).rows[0].n, 0);

  const ping = await api.call("POST", path, { raw: "{}", headers: { "X-GitHub-Event": "ping", "X-Hub-Signature-256": sign(webhookSecret, "{}") } });
  assert.equal(ping.status, 200);

  const otherBranchBody = JSON.stringify({ ref: "refs/heads/feature", after: sha() });
  const other = await api.call("POST", path, { raw: otherBranchBody, headers: { "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(webhookSecret, otherBranchBody) } });
  assert.equal(other.status, 202);
  assert.ok(other.json.ignored);

  const ok = await api.call("POST", path, { raw: body, headers: { "X-GitHub-Event": "push", "Content-Type": "application/json", "X-Hub-Signature-256": sign(webhookSecret, body) } });
  assert.equal(ok.status, 202);
  assert.equal(ok.json.jobIds.length, 1);
  const rel = await api.pool.query("SELECT commit_sha, commit_message, source FROM releases WHERE id = $1", [ok.json.releaseId]);
  assert.deepEqual(rel.rows[0], { commit_sha: commit, commit_message: "Fix footer", source: "webhook" });

  // The deploy job is queued for this app's server.
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(claim.json.job.id, ok.json.jobIds[0]);
});

test("deploy creates the blue/green steps in order", async () => {
  const { orgId, owner, environment, app } = await setup();
  const res = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  assert.equal(res.status, 201);
  const view = await api.call("GET", `/orgs/${orgId}/jobs/${res.json.job.id}`, { token: owner.token });
  const steps = view.json.steps;
  // First deploy: nothing to stop.
  assert.deepEqual(
    steps.map((s) => s.action),
    ["release.prepare", "compose.validate", "compose.pull", "compose.up", "health.check", "nginx.write_upstream", "nginx.reload"],
  );
  assert.equal(steps[3].params.slot, "blue");
  assert.equal(steps[4].params.port, environment.bluePort);
  assert.equal(steps[5].params.port, environment.bluePort);
  assert.equal(steps[0].params.composePath, app.composePath);
  assert.ok(steps.every((s) => s.status === "pending"));

  // A second deploy while one is pending is refused.
  assert.equal((await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} })).status, 409);
});

test("second deploy starts green, switches, stops blue; rollback targets the previous release", async () => {
  const { orgId, owner, member, environment, srv, repoOwner, repo } = await setup();
  const developer = await member("developer");
  const viewer = await member("viewer");
  const first = sha();
  const second = sha();
  const base = `/orgs/${orgId}/environments/${environment.id}`;

  assert.equal((await api.call("POST", `${base}/deploy`, { token: viewer.token, body: { commitSha: first } })).status, 403);
  assert.equal((await api.call("POST", `${base}/rollback`, { token: developer.token })).status, 400);

  const d1 = await api.call("POST", `${base}/deploy`, { token: developer.token, body: { commitSha: first } });
  assert.equal(d1.status, 201);
  assert.equal((await api.runClaimedJob(srv.agentToken)).finish.status, "success");

  let env = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(env.environment.activeSlot, "blue");
  assert.equal(env.currentRelease.commitSha, first);
  assert.equal(env.previousRelease, null);

  api.github.setFile(repoOwner, repo, second, "docker-compose.yml", "services:\n  web:\n    image: ghcr.io/inveon/site:${IMAGE_TAG}\n");
  const d2 = await api.call("POST", `${base}/deploy`, { token: developer.token, body: { commitSha: second } });
  const steps2 = (await api.call("GET", `/orgs/${orgId}/jobs/${d2.json.job.id}`, { token: owner.token })).json.steps;
  assert.equal(steps2.find((s) => s.action === "compose.up").params.slot, "green");
  assert.equal(steps2.find((s) => s.action === "health.check").params.port, environment.greenPort);
  const stop = steps2.at(-1);
  assert.equal(stop.action, "compose.down");
  assert.equal(stop.params.slot, "blue");
  const claimed = await api.runClaimedJob(srv.agentToken);
  assert.match(claimed.job.steps[0].params.composeContent, /IMAGE_TAG/);

  env = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(env.environment.activeSlot, "green");
  assert.equal(env.currentRelease.commitSha, second);
  assert.equal(env.previousRelease.commitSha, first);

  const rb = await api.call("POST", `${base}/rollback`, { token: developer.token });
  assert.equal(rb.status, 201);
  assert.equal(rb.json.release.commitSha, first);
  assert.equal(rb.json.deployment.kind, "rollback");
  assert.equal(rb.json.deployment.slot, "blue");
  await api.runClaimedJob(srv.agentToken);
  env = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(env.currentRelease.commitSha, first);
  assert.equal(env.previousRelease.commitSha, second);
  assert.equal(env.environment.activeSlot, "blue");

  const list = await api.call("GET", `${base}/deployments`, { token: viewer.token });
  assert.deepEqual(list.json.deployments.map((d) => [d.kind, d.status, d.commitSha]), [
    ["rollback", "success", first],
    ["deploy", "success", second],
    ["deploy", "success", first],
  ]);
});

test("a failed deploy keeps the current release and queues a clean-up of the new colour", async () => {
  const { orgId, owner, environment, srv } = await setup();
  const base = `/orgs/${orgId}/environments/${environment.id}`;
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  const before = (await api.call("GET", base, { token: owner.token })).json;

  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  // Agent gets through compose.up, then the health check fails.
  const { json } = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  for (const s of json.job.steps) {
    const failing = s.action === "health.check";
    const result = s.action === "compose.validate" ? { appRoot: `/srv/inveon/apps/${s.params.slug}`, model: { services: { web: { image: "x" } } } } : undefined;
    await api.call("POST", `/agent/jobs/${json.job.id}/steps/${s.id}`, { token: srv.agentToken, body: { status: failing ? "failure" : "success", append: failing ? "HTTP 502\n" : "", result } });
    if (failing) break;
  }
  const fin = await api.call("POST", `/agent/jobs/${json.job.id}/finish`, { token: srv.agentToken, body: { status: "failure", error: "Health check failed" } });
  assert.equal(fin.json.status, "failure");

  const after = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(after.environment.activeSlot, "blue");
  assert.equal(after.currentRelease.id, before.currentRelease.id);

  const cleanup = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(cleanup.json.job.type, "deploy_cleanup");
  assert.deepEqual(cleanup.json.job.steps.map((s) => [s.action, s.params.slot ?? null]), [["compose.down", "green"]]);
});

test("recreate strategy deploys one project in place", async () => {
  const { orgId, owner, environment } = await setup("recreate");
  const res = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const steps = (await api.call("GET", `/orgs/${orgId}/jobs/${res.json.job.id}`, { token: owner.token })).json.steps;
  assert.ok(steps.every((s) => !("slot" in s.params) || s.params.slot === "main"));
  assert.ok(!steps.some((s) => s.action === "compose.down"));
});

test("container logs are requested through a job", async () => {
  const { orgId, owner, member, environment, srv } = await setup();
  const viewer = await member("viewer");
  const base = `/orgs/${orgId}/environments/${environment.id}`;
  assert.equal((await api.call("POST", `${base}/logs`, { token: owner.token, body: { lines: 100 } })).status, 400); // not deployed yet
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  assert.equal((await api.call("POST", `${base}/logs`, { token: viewer.token, body: { lines: 100 } })).status, 403);
  assert.equal((await api.call("POST", `${base}/logs`, { token: owner.token, body: { lines: 100, service: "web; rm -rf /" } })).status, 400);
  const res = await api.call("POST", `${base}/logs`, { token: owner.token, body: { lines: 100, service: "web" } });
  assert.equal(res.status, 201);
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.deepEqual(claim.json.job.steps[0].action, "compose.logs");
  assert.equal(claim.json.job.steps[0].params.lines, 100);
  assert.equal(claim.json.job.steps[0].params.slot, "blue");
});
