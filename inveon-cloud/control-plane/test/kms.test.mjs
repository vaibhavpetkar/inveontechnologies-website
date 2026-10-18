import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { startServer, MASTER_KEY, JWT_SECRET } from "./helpers.mjs";
import { configureMasterKeys, decryptValue, encryptValue, keyringInfo, loadMasterKeys } from "../dist/lib/crypto.js";

const FAKE = fileURLToPath(new URL("./fake-aws.mjs", import.meta.url));
const baseEnv = { ...process.env, INVEON_DATABASE_URL: process.env.TEST_DATABASE_URL, INVEON_JWT_SECRET: JWT_SECRET, INVEON_MASTER_KEY: MASTER_KEY };
/** keys.js with the fake KMS preloaded. */
const keysCli = (args, env = {}) => spawnSync(process.execPath, ["--import", FAKE, "dist/keys.js", ...args], { env: { ...baseEnv, ...env }, encoding: "utf8" });

test("keyring: a kms: entry needs its data key decrypted first, and is then an ordinary key id", async () => {
  const blob = randomBytes(60).toString("base64");
  assert.throws(() => configureMasterKeys({ legacy: MASTER_KEY, keys: `k1:kms:${blob}` }), /KMS-backed and wasn't decrypted/);
  assert.throws(() => configureMasterKeys({ legacy: MASTER_KEY, keys: "k1:kms:not base64!" }), /kms: needs the base64 CiphertextBlob/);

  const dataKey = randomBytes(32);
  const seen = [];
  await loadMasterKeys({ legacy: MASTER_KEY, keys: `k1:kms:${blob}` }, async (b) => {
    seen.push(b.toString("base64"));
    return Buffer.from(dataKey);
  });
  assert.deepEqual(seen, [blob], "decrypted once, with the blob from the entry");
  assert.deepEqual(keyringInfo().kmsKeyIds, ["k1"]);
  assert.equal(keyringInfo().currentKeyId, "k1");
  const value = encryptValue("on kms", "env:e:K");
  assert.ok(value.startsWith("v2.k1."));
  assert.equal(decryptValue(value, "env:e:K"), "on kms");

  // A KMS failure names the entry; nothing is half-configured.
  await assert.rejects(
    loadMasterKeys({ legacy: MASTER_KEY, keys: `k2:kms:${blob}` }, async () => {
      throw new Error("AccessDenied");
    }),
    /KMS could not decrypt master key "k2": AccessDenied/,
  );
  assert.equal(keyringInfo().currentKeyId, "k1");
  // Without kms: entries, KMS is never asked.
  await loadMasterKeys({ legacy: MASTER_KEY }, async () => assert.fail("no KMS call expected"));
  configureMasterKeys({ legacy: MASTER_KEY });
});

test("keys:kms-generate prints an env line with only the encrypted data key", () => {
  const out = keysCli(["kms-generate", "arn:aws:kms:ap-south-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab", "--id", "kms-a"], { INVEON_DATABASE_URL: "" });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^INVEON_MASTER_KEYS=kms-a:kms:[A-Za-z0-9+/]+={0,2}\n$/);
  assert.match(out.stderr, /kms:Decrypt/);
  // Default id from the month; aliases are fine.
  assert.match(keysCli(["kms-generate", "alias/inveon-master"]).stdout, /^INVEON_MASTER_KEYS=kms-\d{4}-\d{2}:kms:/);
  // Refused before calling KMS, and KMS errors are reported.
  assert.equal(keysCli(["kms-generate", "--profile=x"]).status, 64);
  assert.equal(keysCli(["kms-generate", "alias/x", "--id", "legacy"]).status, 1);
  const denied = keysCli(["kms-generate", "alias/deny-me"]);
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /not authorized/);
});

test("rotation onto a KMS-backed key with keys:rotate, a bad blob stops start-up, and back", async () => {
  const gen = keysCli(["kms-generate", "alias/inveon-master", "--id", "kms-t"]);
  assert.equal(gen.status, 0, gen.stderr);
  const entry = gen.stdout.trim().replace(/^INVEON_MASTER_KEYS=/, "");

  // Something on the legacy key first.
  const a = await startServer();
  let s;
  try {
    const { orgId, owner } = await a.createOrg();
    const { serverId } = await a.registerServer(orgId, owner);
    const { environment } = await a.createAppWithEnvironment(orgId, owner, { serverId });
    s = { owner, envPath: `/orgs/${orgId}/environments/${environment.id}`, environment };
    assert.equal((await a.call("PUT", `${s.envPath}/vars/OLD`, { token: owner.token, body: { value: "before-kms", isSecret: true } })).status, 200);
  } finally {
    await a.stop();
  }

  const b = await startServer({ INVEON_MASTER_KEYS: entry }, { nodeArgs: ["--import", FAKE] });
  try {
    assert.equal((await b.call("PUT", `${s.envPath}/vars/NEW`, { token: s.owner.token, body: { value: "on-kms" } })).status, 200);
    const { rows } = await b.pool.query("SELECT key, value_enc FROM env_vars WHERE environment_id = $1 ORDER BY key", [s.environment.id]);
    assert.ok(rows.find((r) => r.key === "NEW").value_enc.startsWith("v2.kms-t."));
    assert.ok(rows.find((r) => r.key === "OLD").value_enc.startsWith("v1."));

    const rotated = keysCli(["rotate"], { INVEON_MASTER_KEYS: entry });
    assert.equal(rotated.status, 0, rotated.stderr);
    const out = JSON.parse(rotated.stdout);
    assert.equal(out.result.failed, 0);
    assert.equal(out.status.pendingRotation, 0);
    assert.deepEqual(out.status.kmsKeyIds, ["kms-t"]);
    assert.deepEqual(out.status.removableKeyIds, ["legacy"]);
    const vars = await b.call("GET", `${s.envPath}/vars`, { token: s.owner.token });
    assert.equal(vars.json.vars.find((v) => v.key === "NEW").value, "on-kms");
  } finally {
    await b.stop();
  }

  // Only the KMS key is configured now, and it still reads everything.
  const only = keysCli(["status"], { INVEON_MASTER_KEY: "", INVEON_MASTER_KEYS: entry });
  assert.equal(only.status, 0, only.stderr);
  assert.deepEqual(JSON.parse(only.stdout).missingKeyIds, []);

  // A blob KMS can't decrypt (tampered, or another key) stops the control plane.
  const raw = Buffer.from(entry.split(":kms:")[1], "base64");
  raw[raw.length - 1] ^= 1;
  const bad = spawnSync(process.execPath, ["--import", FAKE, "dist/index.js"], {
    env: { ...baseEnv, INVEON_MASTER_KEYS: `kms-t:kms:${raw.toString("base64")}`, INVEON_AUTO_MIGRATE: "false", INVEON_SCHEDULER: "false", INVEON_PORT: "0" },
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /KMS could not decrypt master key \\?"kms-t\\?"/);

  // Back onto the legacy key so the rest of the suite can read the shared database.
  const back = execFileSync(process.execPath, ["--import", FAKE, "dist/keys.js", "rotate"], { env: { ...baseEnv, INVEON_MASTER_KEYS: entry, INVEON_MASTER_KEY_CURRENT: "legacy" }, stdio: ["ignore", "pipe", "ignore"] });
  const result = JSON.parse(back.toString());
  assert.equal(result.result.failed, 0);
  assert.deepEqual(result.status.removableKeyIds, ["kms-t"]);
});
