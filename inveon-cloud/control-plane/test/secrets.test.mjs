import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, MASTER_KEY } from "./helpers.mjs";
import { encryptValue, decryptValue, parseMasterKey } from "../dist/lib/crypto.js";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

test("envelope encryption round-trips and is bound to its key and AAD", () => {
  const key = parseMasterKey(MASTER_KEY);
  const ct = encryptValue("s3cr3t-value", "env:abc:DB_PASSWORD", key);
  assert.ok(!ct.includes("s3cr3t"));
  assert.equal(decryptValue(ct, "env:abc:DB_PASSWORD", key), "s3cr3t-value");
  // Fresh data key and IV every time.
  assert.notEqual(ct, encryptValue("s3cr3t-value", "env:abc:DB_PASSWORD", key));
  // Moved to another row/key: fails.
  assert.throws(() => decryptValue(ct, "env:abc:OTHER", key));
  // Wrong master key: fails.
  assert.throws(() => decryptValue(ct, "env:abc:DB_PASSWORD", Buffer.alloc(32, 9)));
  // Tampered ciphertext: fails.
  const parts = ct.split(".");
  parts[6] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptValue(parts.join("."), "env:abc:DB_PASSWORD", key));
  assert.throws(() => parseMasterKey("too-short"));
});

test("secrets are write-only in the API, encrypted in the database, and decrypted only for the owning agent", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const viewer = await member("viewer");
  const developer = await member("developer");
  const srv = await api.registerServer(orgId, owner);
  const { environment } = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const base = `/orgs/${orgId}/environments/${environment.id}/vars`;

  assert.equal((await api.call("PUT", `${base}/DB_PASSWORD`, { token: viewer.token, body: { value: "x", isSecret: true } })).status, 403);
  assert.equal((await api.call("PUT", `${base}/DB_PASSWORD`, { token: developer.token, body: { value: "hunter2-very-secret", isSecret: true } })).status, 200);
  assert.equal((await api.call("PUT", `${base}/NODE_ENV`, { token: developer.token, body: { value: "production" } })).status, 200);
  assert.equal((await api.call("PUT", `${base}/INVEON_HTTP_PORT`, { token: developer.token, body: { value: "1" } })).status, 400);
  assert.equal((await api.call("PUT", `${base}/1BAD`, { token: developer.token, body: { value: "1" } })).status, 400);

  for (const who of [viewer, owner]) {
    const list = await api.call("GET", base, { token: who.token });
    const secret = list.json.vars.find((v) => v.key === "DB_PASSWORD");
    assert.equal(secret.value, null);
    assert.equal(secret.isSecret, true);
    assert.equal(secret.masked, "••••••••");
    assert.equal(list.json.vars.find((v) => v.key === "NODE_ENV").value, "production");
    assert.ok(!JSON.stringify(list.json).includes("hunter2"));
  }

  const { rows } = await api.pool.query("SELECT value_enc FROM env_vars WHERE environment_id = $1", [environment.id]);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.match(r.value_enc, /^v1\./);
    assert.ok(!r.value_enc.includes("hunter2") && !r.value_enc.includes("production"));
  }

  // Audit log records the key, never the value.
  const audit = await api.pool.query("SELECT metadata FROM audit_logs WHERE org_id = $1 AND action = 'env_var.set'", [orgId]);
  assert.ok(audit.rows.length >= 2);
  assert.ok(!JSON.stringify(audit.rows).includes("hunter2"));

  // The deploy job stores no secrets; the agent gets them at claim time.
  const dep = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: developer.token, body: {} });
  const stored = await api.pool.query("SELECT params FROM job_steps WHERE job_id = $1", [dep.json.job.id]);
  assert.ok(!JSON.stringify(stored.rows).includes("hunter2"));
  const userView = await api.call("GET", `/orgs/${orgId}/jobs/${dep.json.job.id}`, { token: owner.token });
  assert.ok(!JSON.stringify(userView.json).includes("hunter2"));

  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  const prepare = claim.json.job.steps.find((s) => s.action === "release.prepare");
  assert.deepEqual(prepare.params.env, { DB_PASSWORD: "hunter2-very-secret", NODE_ENV: "production" });
  assert.match(prepare.params.composeContent, /services:/);
});

test("webhook secrets are shown once and never returned on read", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const { app, webhookSecret } = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  assert.ok(webhookSecret.length >= 40);
  const read = await api.call("GET", `/orgs/${orgId}/apps/${app.id}`, { token: owner.token });
  assert.ok(!JSON.stringify(read.json).includes(webhookSecret));
  assert.equal(read.json.app.webhookSecretEnc, undefined);
});
