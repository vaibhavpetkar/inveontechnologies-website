import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { randomUUID } from "node:crypto";
import { startServer } from "./helpers.mjs";
import { canonicalRequest, checkAgentSignature } from "../dist/lib/agent-signature.js";

// The same vector is checked in agent/test/signing.test.mjs.
const VECTOR = {
  publicKey: "MCowBQYDK2VwAyEA/RckOFqgx1tk+3jNYC+h2ZH96/drE8WO1wLqyDXp9hg=",
  canonical: "inveon-agent-v1\nPOST\n/api/v1/agent/heartbeat\n1700000000\nfixed-nonce-0123456789\n69a5a5c3d4a916b9ca4a56f468daac9848ecb661cf2496a3d422ab79cac086da",
  signature: "4vUQTWEupoq/Jo7wDXnMOvj4xv+51g/ZenPRug4jB5ahybcTCl+3g0QCkn0+5THF3hBHoE3W1jZUNwy2SQapAw==",
};

const newKey = () => generateKeyPairSync("ed25519").privateKey;
const pubOf = (key) => createPublicKey(key).export({ format: "der", type: "spki" }).toString("base64");

/** Signs like the agent does; every part can be overridden to forge a bad request. */
function signed(key, path, body, { ts = Math.floor(Date.now() / 1000), nonce = randomBytes(16).toString("base64url"), signPath = path, signBody = body } = {}) {
  const sig = sign(null, Buffer.from(canonicalRequest("POST", `/api/v1${signPath}`, ts, nonce, signBody)), key).toString("base64");
  return { "Content-Type": "application/json", "X-Inveon-Timestamp": String(ts), "X-Inveon-Nonce": nonce, "X-Inveon-Signature": sig };
}

let api;
before(async () => {
  api = await startServer();
});
after(async () => api?.stop());

/** Registers an agent, with a signing key when one is given. */
async function register(key) {
  const { orgId, owner } = await api.createOrg();
  const created = await api.call("POST", `/orgs/${orgId}/servers`, { token: owner.token, body: { name: `srv-${randomUUID().slice(0, 6)}` } });
  const bootstrap = created.json.installCommand.split(" ").pop();
  const reg = await api.call("POST", "/agent/register", { body: { token: bootstrap, facts: { hostname: "h" }, ...(key ? { publicKey: pubOf(key) } : {}) } });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  return { orgId, owner, serverId: reg.json.serverId, agentToken: reg.json.agentToken, reg: reg.json };
}

const post = (agentToken, path, body, headers) => api.call("POST", path, { token: agentToken, raw: body, headers });

test("the signed string and signature match the agent's fixed vector", () => {
  assert.equal(canonicalRequest("POST", "/api/v1/agent/heartbeat", 1700000000, "fixed-nonce-0123456789", '{"facts":{}}'), VECTOR.canonical);
  const req = (headers, body = '{"facts":{}}') => ({ method: "POST", path: "/api/v1/agent/heartbeat", body: Buffer.from(body), headers });
  const headers = { "x-inveon-timestamp": "1700000000", "x-inveon-nonce": "fixed-nonce-0123456789", "x-inveon-signature": VECTOR.signature };
  // Fixed clock: 4 minutes later is fine, 5 minutes and a bit is not.
  assert.deepEqual(checkAgentSignature(VECTOR.publicKey, req(headers), 1700000240000), { ok: true, nonce: "fixed-nonce-0123456789", timestamp: 1700000000 });
  assert.equal(checkAgentSignature(VECTOR.publicKey, req(headers), 1700000301000).ok, false);
  assert.equal(checkAgentSignature(VECTOR.publicKey, req(headers), 1699999699000).ok, false);
  assert.equal(checkAgentSignature(VECTOR.publicKey, req(headers, '{"facts":{"x":1}}'), 1700000000000).ok, false);
  assert.equal(checkAgentSignature(VECTOR.publicKey, req({ ...headers, "x-inveon-nonce": "fixed-nonce-0123456780" }), 1700000000000).ok, false);
  assert.equal(checkAgentSignature(VECTOR.publicKey, req({ ...headers, "x-inveon-nonce": "bad nonce!" }), 1700000000000).ok, false);
  assert.equal(checkAgentSignature(pubOf(newKey()), req(headers), 1700000000000).ok, false);
  assert.match(checkAgentSignature(VECTOR.publicKey, req({}), 1700000000000).reason, /not signed/);
});

test("an agent with a key must sign: bad signatures, old timestamps, other paths and replays are refused", async () => {
  const key = newKey();
  const { agentToken, serverId, reg, orgId, owner } = await register(key);
  assert.equal(reg.signingKey, "registered");

  const body = JSON.stringify({ facts: { hostname: "h2" } });
  // The bearer token alone no longer works.
  const unsigned = await post(agentToken, "/agent/heartbeat", body, { "Content-Type": "application/json" });
  assert.equal(unsigned.status, 401);
  assert.equal(unsigned.json.error.code, "INVALID_AGENT_SIGNATURE");

  const good = signed(key, "/agent/heartbeat", body);
  const ok = await post(agentToken, "/agent/heartbeat", body, good);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.ok(ok.json.features.includes("signed_requests"));
  // The same request again is a replay.
  const replay = await post(agentToken, "/agent/heartbeat", body, good);
  assert.equal(replay.status, 401);
  assert.equal(replay.json.error.code, "REPLAYED_AGENT_REQUEST");

  const refused = [
    signed(key, "/agent/heartbeat", body, { ts: Math.floor(Date.now() / 1000) - 301 }),
    signed(key, "/agent/heartbeat", body, { ts: Math.floor(Date.now() / 1000) + 301 }),
    signed(key, "/agent/heartbeat", body, { signBody: JSON.stringify({ facts: {} }) }),
    signed(key, "/agent/heartbeat", body, { signPath: "/agent/metrics" }),
    signed(newKey(), "/agent/heartbeat", body),
    { ...signed(key, "/agent/heartbeat", body), "X-Inveon-Signature": "AAAA" },
  ];
  for (const headers of refused) {
    const r = await post(agentToken, "/agent/heartbeat", body, headers);
    assert.equal(r.status, 401, JSON.stringify(headers));
  }
  // Signed long polls and step reports work as before.
  const claim = await post(agentToken, "/agent/jobs/claim", "{}", signed(key, "/agent/jobs/claim", "{}"));
  assert.equal(claim.status, 204);

  // The dashboard shows the server as signed.
  const list = await api.call("GET", `/orgs/${orgId}/servers`, { token: owner.token });
  const row = list.json.servers.find((s) => s.id === serverId);
  assert.equal(row.requestSigning, "signed");
  assert.equal(row.signingPublicKey, undefined);
  const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM agent_request_nonces WHERE server_id = $1", [serverId]);
  assert.equal(rows[0].n, 2);
});

test("an old agent keeps working until its organization requires signatures, and can then enrol its key", async () => {
  const { agentToken, serverId, orgId, owner, reg } = await register(null);
  assert.equal(reg.signingKey, null);
  const body = "{}";
  assert.equal((await post(agentToken, "/agent/heartbeat", body, { "Content-Type": "application/json" })).status, 200);
  let list = await api.call("GET", `/orgs/${orgId}/servers`, { token: owner.token });
  assert.equal(list.json.servers.find((s) => s.id === serverId).requestSigning, "unsigned");

  // Only owners turn it on.
  const admin = await api.createUser({ orgId, role: "admin" });
  assert.equal((await api.call("PATCH", `/orgs/${orgId}`, { token: admin.token, body: { requireSignedAgents: true } })).status, 403);
  const on = await api.call("PATCH", `/orgs/${orgId}`, { token: owner.token, body: { requireSignedAgents: true } });
  assert.equal(on.status, 200);
  assert.equal(on.json.organization.requireSignedAgents, true);
  assert.equal((await api.call("GET", `/orgs/${orgId}`, { token: owner.token })).json.agentSignatures, "optional");

  const refused = await post(agentToken, "/agent/heartbeat", body, { "Content-Type": "application/json" });
  assert.equal(refused.status, 401);
  assert.equal(refused.json.error.code, "AGENT_SIGNATURE_REQUIRED");

  // Upgrade: the first key is enrolled on the bearer token alone.
  const key = newKey();
  const enrolBody = JSON.stringify({ publicKey: pubOf(key) });
  assert.equal((await post(agentToken, "/agent/signing-key", JSON.stringify({ publicKey: "not a key" }), { "Content-Type": "application/json" })).status, 400);
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
  assert.equal((await post(agentToken, "/agent/signing-key", JSON.stringify({ publicKey: rsa }), { "Content-Type": "application/json" })).status, 400);
  const enrol = await post(agentToken, "/agent/signing-key", enrolBody, { "Content-Type": "application/json" });
  assert.equal(enrol.status, 200, JSON.stringify(enrol.json));
  assert.equal((await post(agentToken, "/agent/heartbeat", body, signed(key, "/agent/heartbeat", body))).status, 200);

  // Replacing it needs a request signed with the current key.
  const next = newKey();
  const swapBody = JSON.stringify({ publicKey: pubOf(next) });
  assert.equal((await post(agentToken, "/agent/signing-key", swapBody, { "Content-Type": "application/json" })).status, 401);
  assert.equal((await post(agentToken, "/agent/signing-key", swapBody, signed(next, "/agent/signing-key", swapBody))).status, 401);
  assert.equal((await post(agentToken, "/agent/signing-key", swapBody, signed(key, "/agent/signing-key", swapBody))).status, 200);
  assert.equal((await post(agentToken, "/agent/heartbeat", body, signed(key, "/agent/heartbeat", body))).status, 401);
  assert.equal((await post(agentToken, "/agent/heartbeat", body, signed(next, "/agent/heartbeat", body))).status, 200);

  list = await api.call("GET", `/orgs/${orgId}/servers`, { token: owner.token });
  assert.equal(list.json.servers.find((s) => s.id === serverId).requestSigning, "signed");
  const log = await api.pool.query("SELECT action FROM audit_logs WHERE entity_id = $1 AND action LIKE 'server.signing_key%' ORDER BY created_at", [serverId]);
  assert.deepEqual(log.rows.map((r) => r.action), ["server.signing_key", "server.signing_key_rotate"]);

  // Re-installing (a new install token) replaces the key with the new agent's.
  const fresh = await api.call("POST", `/orgs/${orgId}/servers/${serverId}/bootstrap-token`, { token: owner.token });
  const third = newKey();
  const again = await api.call("POST", "/agent/register", { body: { token: fresh.json.installCommand.split(" ").pop(), facts: {}, publicKey: pubOf(third) } });
  assert.equal(again.status, 201);
  assert.equal((await post(again.json.agentToken, "/agent/heartbeat", body, signed(third, "/agent/heartbeat", body))).status, 200);
});

test("INVEON_AGENT_SIGNATURES=required refuses unsigned agents in every organization", async () => {
  const strict = await startServer({ INVEON_AGENT_SIGNATURES: "required" });
  try {
    const { orgId, owner } = await strict.createOrg();
    const { agentToken } = await strict.registerServer(orgId, owner);
    const r = await strict.call("POST", "/agent/heartbeat", { token: agentToken, body: {} });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, "AGENT_SIGNATURE_REQUIRED");
    assert.equal((await strict.call("GET", `/orgs/${orgId}`, { token: owner.token })).json.agentSignatures, "required");
    const key = newKey();
    assert.equal((await strict.call("POST", "/agent/signing-key", { token: agentToken, body: { publicKey: pubOf(key) } })).status, 200);
    const sig = sign(null, Buffer.from(canonicalRequest("POST", "/api/v1/agent/heartbeat", Math.floor(Date.now() / 1000), "n".repeat(22), "{}")), key).toString("base64");
    const ok = await strict.call("POST", "/agent/heartbeat", {
      token: agentToken,
      raw: "{}",
      headers: { "Content-Type": "application/json", "X-Inveon-Timestamp": String(Math.floor(Date.now() / 1000)), "X-Inveon-Nonce": "n".repeat(22), "X-Inveon-Signature": sig },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
  } finally {
    await strict.stop();
  }
});
