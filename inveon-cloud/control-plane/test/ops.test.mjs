// Health checks, domains and backups.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startServer, sha } from "./helpers.mjs";
import { nextHealthState } from "../dist/modules/health/service.js";

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

test("health state machine: down after 3 failures, recovered on first success", () => {
  let s = { status: "up", consecutiveFailures: 0 };
  const transitions = [];
  for (const ok of [false, false, false, false, true, true]) {
    const n = nextHealthState(s, ok);
    transitions.push(n.transition);
    s = n;
  }
  assert.deepEqual(transitions, [null, null, "down", null, "recovered", null]);
});

test("health checks mark down after 3 failures and alert, then recover", async () => {
  let code = 500;
  const target = createServer((_req, res) => res.writeHead(code).end("x"));
  await new Promise((r) => target.listen(0, "127.0.0.1", r));
  try {
    const { orgId, owner, member, base } = await deployed();
    const viewer = await member("viewer");
    const url = `http://127.0.0.1:${target.address().port}/health`;
    assert.equal((await api.call("PUT", `${base}/health`, { token: viewer.token, body: { url } })).status, 403);
    assert.equal((await api.call("PUT", `${base}/health`, { token: owner.token, body: { url: "file:///etc/passwd" } })).status, 400);
    assert.equal((await api.call("PUT", `${base}/health`, { token: owner.token, body: { url, intervalSec: 60 } })).status, 200);

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await api.call("POST", `${base}/health/run`, { token: owner.token })).json.healthCheck.status);
    assert.deepEqual(statuses, ["unknown", "unknown", "down"]);
    code = 200;
    const rec = await api.call("POST", `${base}/health/run`, { token: owner.token });
    assert.equal(rec.json.healthCheck.status, "up");
    assert.equal(rec.json.healthCheck.consecutiveFailures, 0);

    const { rows } = await api.pool.query("SELECT action FROM audit_logs WHERE org_id = $1 AND action LIKE 'health.%' ORDER BY created_at", [orgId]);
    const actions = rows.map((r) => r.action);
    assert.ok(actions.includes("health.down") && actions.includes("health.recovered"));
    // SMTP is unset in tests: the alert is logged instead of sent.
    await new Promise((r) => setTimeout(r, 200));
    assert.match(api.logs(), /\[Down\]/);
  } finally {
    target.close();
  }
});

test("domains: DNS record shown, unverified domains can't issue, issuance job writes nginx and runs certbot", async () => {
  const { orgId, owner, base, srv } = await deployed();
  await api.call("PATCH", `/orgs/${orgId}/servers/${srv.serverId}`, { token: owner.token, body: { ipAddress: "203.0.113.10" } });
  assert.equal((await api.call("POST", `${base}/domains`, { token: owner.token, body: { hostname: "bad host;rm" } })).status, 400);
  const add = await api.call("POST", `${base}/domains`, { token: owner.token, body: { hostname: `app-${Date.now()}.example.com` } });
  assert.equal(add.status, 201);
  assert.deepEqual(add.json.domain.dnsRecord, { type: "A", name: add.json.domain.hostname, value: "203.0.113.10" });
  assert.equal(add.json.domain.status, "pending_dns");
  assert.equal((await api.call("POST", `/orgs/${orgId}/domains/${add.json.domain.id}/issue`, { token: owner.token })).status, 400);

  // Simulate a verified DNS check (resolvers aren't available in tests).
  await api.pool.query("UPDATE domains SET dns_checked_at = now() WHERE id = $1", [add.json.domain.id]);
  const issue = await api.call("POST", `/orgs/${orgId}/domains/${add.json.domain.id}/issue`, { token: owner.token });
  assert.equal(issue.status, 200);
  const done = await api.runClaimedJob(srv.agentToken, {
    results: { "certbot.issue": (s) => ({ certs: [{ hostname: s.params.hostname, expiresAt: "2027-01-01T00:00:00.000Z" }] }) },
  });
  assert.deepEqual(done.job.steps.map((s) => s.action), ["nginx.write_site", "nginx.reload", "certbot.issue", "nginx.write_site", "nginx.reload"]);
  assert.equal(done.job.steps[3].params.tls, true);
  const list = await api.call("GET", `${base}/domains`, { token: owner.token });
  assert.equal(list.json.domains[0].status, "active");
  assert.equal(new Date(list.json.domains[0].certExpiresAt).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("backups: config validation, backup now, restore takes a fresh backup first", async () => {
  const { orgId, owner, member, base, srv, environment } = await deployed();
  const developer = await member("developer");
  const cfg = { enabled: true, hourUtc: 21, dbType: "postgres", dbService: "db", dbName: "app", dbUser: "app", volumePaths: ["uploads"], s3Bucket: "inveon-backups", s3Prefix: "cloud", s3Region: "ap-south-1" };
  assert.equal((await api.call("PUT", `${base}/backup-config`, { token: developer.token, body: cfg })).status, 403);
  assert.equal((await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, volumePaths: ["../../etc"] } })).status, 400);
  assert.equal((await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, dbService: "db; curl evil" } })).status, 400);
  assert.equal((await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: cfg })).status, 200);

  const now = await api.call("POST", `${base}/backups`, { token: developer.token });
  assert.equal(now.status, 201);
  assert.match(now.json.backup.s3Key, new RegExp(`^cloud/${environment.slug}/\\d{8}T\\d{6}Z-manual-[0-9a-f]{8}\\.tar\\.gz$`));
  const ran = await api.runClaimedJob(srv.agentToken, { results: { "backup.create": () => ({ sizeBytes: 1234 }) } });
  assert.equal(ran.job.steps[0].params.db.service, "db");
  let list = await api.call("GET", `${base}/backups`, { token: owner.token });
  assert.equal(list.json.backups[0].status, "success");
  assert.equal(list.json.backups[0].sizeBytes, 1234);

  assert.equal((await api.call("POST", `/orgs/${orgId}/backups/${now.json.backup.id}/restore`, { token: developer.token })).status, 403);
  const restore = await api.call("POST", `/orgs/${orgId}/backups/${now.json.backup.id}/restore`, { token: owner.token });
  assert.equal(restore.status, 201);
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.deepEqual(claim.json.job.steps.map((s) => s.action), ["backup.create", "backup.restore"]);
  assert.equal(claim.json.job.steps[0].params.key, restore.json.safetyBackup.s3Key);
  assert.equal(claim.json.job.steps[1].params.key, now.json.backup.s3Key);
  list = await api.call("GET", `${base}/backups`, { token: owner.token });
  assert.equal(list.json.backups[0].kind, "pre_restore");
});
