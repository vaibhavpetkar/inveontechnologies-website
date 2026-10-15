import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { startServer, MASTER_KEY, JWT_SECRET } from "./helpers.mjs";
import { configureMasterKeys, decryptValue, encryptValue, keyIdOf, parseMasterKey, rewrapValue } from "../dist/lib/crypto.js";
import { ENCRYPTED_COLUMNS } from "../dist/modules/keys/service.js";

const K2 = randomBytes(32).toString("base64");
const K3 = randomBytes(32).toString("hex");

test("keyring: v1 still decrypts, new values use the current key id, re-wrapping keeps the value", () => {
  const legacyOnly = encryptValue("old secret", "env:e1:DB", parseMasterKey(MASTER_KEY));
  assert.ok(legacyOnly.startsWith("v1."));

  configureMasterKeys({ legacy: MASTER_KEY, keys: `k2:${K2}` });
  // Default current key: the last one listed.
  const fresh = encryptValue("new secret", "env:e1:API");
  assert.ok(fresh.startsWith("v2.k2."));
  assert.equal(keyIdOf(fresh), "k2");
  assert.equal(keyIdOf(legacyOnly), "legacy");
  assert.equal(decryptValue(legacyOnly, "env:e1:DB"), "old secret");
  assert.equal(decryptValue(fresh, "env:e1:API"), "new secret");

  const moved = rewrapValue(legacyOnly, "env:e1:DB");
  assert.ok(moved.startsWith("v2.k2."));
  // Only the wrapped data key changed; the value's own ciphertext is the same.
  assert.equal(moved.split(".").slice(-3).join("."), legacyOnly.split(".").slice(-3).join("."));
  assert.equal(decryptValue(moved, "env:e1:DB"), "old secret");
  assert.equal(rewrapValue(moved, "env:e1:DB"), null, "already current");
  // Bound to the row and to the key id.
  assert.throws(() => rewrapValue(legacyOnly, "env:e2:DB"));
  assert.throws(() => decryptValue(moved, "env:e1:OTHER"));
  const relabelled = moved.replace(/^v2\.k2\./, "v2.k3.");
  configureMasterKeys({ legacy: MASTER_KEY, keys: `k2:${K2},k3:${K2}`, current: "k2" });
  assert.throws(() => decryptValue(relabelled, "env:e1:DB"), "the key id is authenticated, not just a label");

  // Back to the legacy key as current: new values are written as v1 again.
  configureMasterKeys({ legacy: MASTER_KEY, keys: `k2:${K2}`, current: "legacy" });
  assert.ok(encryptValue("x", "a").startsWith("v1."));
  assert.ok(rewrapValue(moved, "env:e1:DB").startsWith("v1."));

  // Without the old key, its values can't be read, with a clear message.
  configureMasterKeys({ keys: `k2:${K2}` });
  assert.throws(() => decryptValue(legacyOnly, "env:e1:DB"), /Master key "legacy" is not configured/);

  for (const bad of [{}, { keys: "nocolon" }, { keys: `legacy:${K2}` }, { keys: `a:${K2},a:${K2}` }, { keys: `bad id:${K2}` }, { keys: "k:short" }, { keys: `k2:${K2}`, current: "nope" }]) {
    assert.throws(() => configureMasterKeys(bad), JSON.stringify(bad));
  }
  configureMasterKeys({ legacy: MASTER_KEY });
});

test("every *_enc column in the schema is covered by rotation", async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    // Make sure migrations ran (another test file may not have started a server yet).
    execFileSync(process.execPath, ["dist/migrate.js"], { env: { ...process.env, INVEON_DATABASE_URL: process.env.TEST_DATABASE_URL, INVEON_JWT_SECRET: JWT_SECRET, INVEON_MASTER_KEY: MASTER_KEY } });
    const { rows } = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name LIKE '%\\_enc' ORDER BY 1, 2");
    const inSchema = rows.map((r) => `${r.table_name}.${r.column_name}`).sort();
    const covered = ENCRYPTED_COLUMNS.map((c) => `${c.table}.${c.column}`).sort();
    assert.deepEqual(covered, inSchema);
  } finally {
    await pool.end();
  }
});

/** Seeds one of every kind of encrypted value through the API. */
async function seed(api) {
  const { orgId, owner } = await api.createOrg();
  const { serverId } = await api.registerServer(orgId, owner);
  const { app, environment, webhookSecret } = await api.createAppWithEnvironment(orgId, owner, { serverId });
  const envPath = `/orgs/${orgId}/environments/${environment.id}`;
  assert.equal((await api.call("PUT", `${envPath}/vars/PLAIN`, { token: owner.token, body: { value: "plain-value" } })).status, 200);
  assert.equal((await api.call("PUT", `${envPath}/vars/DB_PASSWORD`, { token: owner.token, body: { value: "hunter2-secret", isSecret: true } })).status, 200);
  assert.equal((await api.call("PUT", `/orgs/${orgId}/apps/${app.id}/registry-credentials`, { token: owner.token, body: { server: "ghcr.io", username: "bot", password: "registry-pass" } })).status, 200);
  assert.equal((await api.call("POST", `/orgs/${orgId}/apps/${app.id}/deploy-key`, { token: owner.token })).status, 201);
  const ch = await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { name: "hook", type: "webhook", url: "https://hooks.example.com/inveon" } });
  assert.equal(ch.status, 201, JSON.stringify(ch.json));
  return { orgId, owner, app, environment, envPath, webhookSecret };
}

async function countsByKey(pool) {
  const out = {};
  for (const c of ENCRYPTED_COLUMNS) {
    const { rows } = await pool.query(`SELECT CASE WHEN split_part(${c.column}, '.', 1) = 'v1' THEN 'legacy' ELSE split_part(${c.column}, '.', 2) END AS kid, count(*)::int AS n FROM ${c.table} WHERE ${c.column} IS NOT NULL GROUP BY 1`);
    for (const r of rows) out[r.kid] = (out[r.kid] ?? 0) + r.n;
  }
  return out;
}

test("rotation: add a key, re-wrap everything in batches (resumable, idempotent), remove the old key, and back", async () => {
  // 1. The original setup: one key.
  const a = await startServer();
  let s;
  try {
    s = await seed(a);
  } finally {
    await a.stop();
  }

  // 2. Add k2 as current. Old values still read; new ones use k2.
  const b = await startServer({ INVEON_MASTER_KEYS: `k2:${K2}`, INVEON_PLATFORM_ADMINS: s.owner.email });
  try {
    const vars = await b.call("GET", `${s.envPath}/vars`, { token: s.owner.token });
    assert.equal(vars.json.vars.find((v) => v.key === "PLAIN").value, "plain-value");
    await b.call("PUT", `${s.envPath}/vars/NEWER`, { token: s.owner.token, body: { value: "on-k2" } });
    const { rows } = await b.pool.query("SELECT value_enc FROM env_vars WHERE environment_id = $1 AND key = 'NEWER'", [s.environment.id]);
    assert.ok(rows[0].value_enc.startsWith("v2.k2."));

    // Platform admins only, with two-factor on.
    const other = await b.createOrg();
    assert.equal((await b.call("GET", "/platform/keys", { token: other.owner.token })).status, 403);
    const me = await b.call("GET", "/auth/me", { token: s.owner.token });
    assert.equal(me.json.user.platformAdmin, true);

    const before = await b.call("GET", "/platform/keys", { token: s.owner.token });
    assert.equal(before.status, 200);
    assert.equal(before.json.status.currentKeyId, "k2");
    assert.deepEqual(before.json.status.configuredKeyIds.sort(), ["k2", "legacy"]);
    assert.ok(before.json.status.counts.legacy >= 6);
    assert.ok(before.json.status.pendingRotation >= 6);
    assert.deepEqual(before.json.status.removableKeyIds, []);
    assert.deepEqual(before.json.status.missingKeyIds, []);

    // A partial run through the command (--max) stops early; the next run resumes.
    const cliEnv = { ...process.env, INVEON_DATABASE_URL: process.env.TEST_DATABASE_URL, INVEON_JWT_SECRET: JWT_SECRET, INVEON_MASTER_KEY: MASTER_KEY, INVEON_MASTER_KEYS: `k2:${K2}` };
    const partial = JSON.parse(execFileSync(process.execPath, ["dist/keys.js", "rotate", "--batch", "2", "--max", "3"], { env: cliEnv, stdio: ["ignore", "pipe", "ignore"] }).toString());
    assert.equal(partial.result.rewrapped, 3);
    assert.equal(partial.result.stoppedEarly, true);
    assert.equal(partial.status.pendingRotation, before.json.status.pendingRotation - 3);

    // The rest through the API, in the background.
    const started = await b.call("POST", "/platform/keys/rotate", { token: s.owner.token });
    assert.equal(started.status, 202);
    let after;
    for (let i = 0; i < 100; i++) {
      after = await b.call("GET", "/platform/keys", { token: s.owner.token });
      if (!after.json.rotation.running) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(after.json.rotation.lastRun.result.failed, 0);
    assert.equal(after.json.rotation.lastRun.result.rewrapped, before.json.status.pendingRotation - 3);
    assert.equal(after.json.status.counts.legacy, undefined);
    assert.equal(after.json.status.pendingRotation, 0);
    assert.deepEqual(after.json.status.removableKeyIds, ["legacy"]);

    // Running again changes nothing.
    await b.call("POST", "/platform/keys/rotate", { token: s.owner.token });
    for (let i = 0; i < 100; i++) {
      after = await b.call("GET", "/platform/keys", { token: s.owner.token });
      if (!after.json.rotation.running) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(after.json.rotation.lastRun.result.rewrapped, 0);
    const log = await b.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'platform.keys_rotate' AND actor_user_id = $1", [s.owner.id]);
    assert.equal(log.rows[0].n, 2);
  } finally {
    await b.stop();
  }

  // 3. The old key removed: everything still decrypts with k2 alone.
  const c = await startServer({ INVEON_MASTER_KEY: "", INVEON_MASTER_KEYS: `k2:${K2}` });
  try {
    const vars = await c.call("GET", `${s.envPath}/vars`, { token: s.owner.token });
    assert.equal(vars.status, 200);
    assert.equal(vars.json.vars.find((v) => v.key === "PLAIN").value, "plain-value");
    configureMasterKeys({ keys: `k2:${K2}` });
    const { rows } = await c.pool.query("SELECT value_enc FROM env_vars WHERE environment_id = $1 AND key = 'DB_PASSWORD'", [s.environment.id]);
    assert.equal(decryptValue(rows[0].value_enc, `env:${s.environment.id}:DB_PASSWORD`), "hunter2-secret");
    const app = await c.pool.query("SELECT registry_password_enc, webhook_secret_enc FROM apps WHERE id = $1", [s.app.id]);
    assert.equal(decryptValue(app.rows[0].registry_password_enc, `registry:${s.app.id}`), "registry-pass");
    assert.equal(decryptValue(app.rows[0].webhook_secret_enc, `webhook:${s.app.id}`), s.webhookSecret);

    // A value under a key nobody has is reported, skipped, and doesn't stop the run.
    const stray = encryptValue("x", "env:00000000-0000-0000-0000-000000000000:STRAY", { id: "gone", wrap: () => ["a", "b", "c"], unwrap: () => Buffer.alloc(32) });
    await c.pool.query("INSERT INTO env_vars (environment_id, key, value_enc) VALUES ($1, 'STRAY', $2)", [s.environment.id, stray]);
    const status = JSON.parse(execFileSync(process.execPath, ["dist/keys.js", "status"], { env: { ...process.env, INVEON_DATABASE_URL: process.env.TEST_DATABASE_URL, INVEON_JWT_SECRET: JWT_SECRET, INVEON_MASTER_KEYS: `k2:${K2}` } }).toString());
    assert.deepEqual(status.missingKeyIds, ["gone"]);
    await c.pool.query("DELETE FROM env_vars WHERE key = 'STRAY'");
  } finally {
    await c.stop();
  }

  // 4. Rotate back onto the legacy key with the command, so the rest of the
  //    suite (which only has INVEON_MASTER_KEY) can read the shared database.
  const env = { ...process.env, INVEON_DATABASE_URL: process.env.TEST_DATABASE_URL, INVEON_JWT_SECRET: JWT_SECRET, INVEON_MASTER_KEY: MASTER_KEY, INVEON_MASTER_KEYS: `k2:${K2},k3:${K3}`, INVEON_MASTER_KEY_CURRENT: "legacy" };
  const back = JSON.parse(execFileSync(process.execPath, ["dist/keys.js", "rotate"], { env, stdio: ["ignore", "pipe", "ignore"] }).toString());
  assert.equal(back.result.failed, 0);
  assert.equal(back.status.pendingRotation, 0);
  assert.deepEqual(back.status.removableKeyIds.sort(), ["k2", "k3"]);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    const counts = await countsByKey(pool);
    assert.deepEqual(Object.keys(counts), ["legacy"]);
  } finally {
    await pool.end();
  }
  configureMasterKeys({ legacy: MASTER_KEY });
});
