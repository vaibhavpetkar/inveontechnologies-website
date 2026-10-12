import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startServer } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const tokenFrom = (cmd) => cmd.split(" ").pop();

test("add server shows a one-line install command with a 15-minute token", async () => {
  const { orgId, owner } = await api.createOrg();
  const res = await api.call("POST", `/orgs/${orgId}/servers`, { token: owner.token, body: { name: "web-1" } });
  assert.equal(res.status, 201);
  assert.match(res.json.installCommand, /^curl -fsSL https:\/\/cloud\.test\/install\.sh \| sudo bash -s -- [A-Za-z0-9_-]{40,}$/);
  const ttl = new Date(res.json.expiresAt).getTime() - Date.now();
  assert.ok(ttl > 14 * 60000 && ttl <= 15 * 60000, `ttl ${ttl}`);
  assert.equal(res.json.server.status, "pending");
  assert.equal(res.json.server.tokenHash, undefined);

  // Only the hash is stored.
  const token = tokenFrom(res.json.installCommand);
  const { rows } = await api.pool.query("SELECT token_hash FROM server_bootstrap_tokens WHERE server_id = $1", [res.json.server.id]);
  assert.equal(rows[0].token_hash, createHash("sha256").update(token).digest("hex"));
});

test("bootstrap token is single use", async () => {
  const { orgId, owner } = await api.createOrg();
  const res = await api.call("POST", `/orgs/${orgId}/servers`, { token: owner.token, body: { name: "web-1" } });
  const token = tokenFrom(res.json.installCommand);
  const first = await api.call("POST", "/agent/register", { body: { token, facts: { hostname: "h1" } } });
  assert.equal(first.status, 201);
  assert.equal(first.json.serverId, res.json.server.id);
  assert.ok(first.json.agentToken.length >= 40);
  const second = await api.call("POST", "/agent/register", { body: { token, facts: { hostname: "h2" } } });
  assert.equal(second.status, 401);
  assert.equal(second.json.error.code, "INVALID_BOOTSTRAP_TOKEN");
});

test("bootstrap token expires after 15 minutes", async () => {
  const { orgId, owner } = await api.createOrg();
  const res = await api.call("POST", `/orgs/${orgId}/servers`, { token: owner.token, body: { name: "web-1" } });
  await api.pool.query("UPDATE server_bootstrap_tokens SET expires_at = now() - interval '1 second' WHERE server_id = $1", [res.json.server.id]);
  const reg = await api.call("POST", "/agent/register", { body: { token: tokenFrom(res.json.installCommand) } });
  assert.equal(reg.status, 401);

  // A fresh token works.
  const again = await api.call("POST", `/orgs/${orgId}/servers/${res.json.server.id}/bootstrap-token`, { token: owner.token });
  assert.equal(again.status, 201);
  assert.equal((await api.call("POST", "/agent/register", { body: { token: tokenFrom(again.json.installCommand) } })).status, 201);
});

test("install.sh is served with this control plane's URL filled in", async () => {
  const res = await fetch(`${api.origin}/install.sh`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /^#!\/usr\/bin\/env bash/);
  assert.match(text, /INVEON_URL="https:\/\/cloud\.test"/);
  assert.ok(!text.includes("__INVEON_URL__"));
});

test("agent token is stored hashed; heartbeat records host facts and online status", async () => {
  const { orgId, owner } = await api.createOrg();
  const { serverId, agentToken } = await api.registerServer(orgId, owner);
  const { rows } = await api.pool.query("SELECT token_hash FROM servers WHERE id = $1", [serverId]);
  assert.equal(rows[0].token_hash, createHash("sha256").update(agentToken).digest("hex"));
  assert.notEqual(rows[0].token_hash, agentToken);

  assert.equal((await api.call("POST", "/agent/heartbeat", { token: "not-a-token", body: {} })).status, 401);
  const hb = await api.call("POST", "/agent/heartbeat", {
    token: agentToken,
    body: { facts: { os: "Ubuntu 24.04 LTS", cpuCount: 4, memoryBytes: 8e9, diskTotalBytes: 1e11, diskFreeBytes: 5e10, dockerVersion: "27.1.1", agentVersion: "0.1.0" } },
  });
  assert.equal(hb.status, 200);
  const view = await api.call("GET", `/orgs/${orgId}/servers/${serverId}`, { token: owner.token });
  assert.equal(view.json.server.status, "online");
  assert.equal(view.json.server.cpuCount, 4);
  assert.equal(view.json.server.dockerVersion, "27.1.1");
  assert.ok(view.json.server.lastSeenAt);

  await api.pool.query("UPDATE servers SET last_seen_at = now() - interval '10 minutes' WHERE id = $1", [serverId]);
  const stale = await api.call("GET", `/orgs/${orgId}/servers/${serverId}`, { token: owner.token });
  assert.equal(stale.json.server.status, "offline");
});
