import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequestSigner, canonicalRequest, defaultKeyPath, loadOrCreateSigningKey } from "../dist/signing.js";
import { ControlPlaneClient } from "../dist/client.js";
import { enrolSigningKey } from "../dist/agent.js";

// The same vector is checked in control-plane/test/agent-signing.test.mjs.
const SEED_KEY = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.alloc(32, 9)]), format: "der", type: "pkcs8" });
const VECTOR = {
  publicKey: "MCowBQYDK2VwAyEA/RckOFqgx1tk+3jNYC+h2ZH96/drE8WO1wLqyDXp9hg=",
  canonical: "inveon-agent-v1\nPOST\n/api/v1/agent/heartbeat\n1700000000\nfixed-nonce-0123456789\n69a5a5c3d4a916b9ca4a56f468daac9848ecb661cf2496a3d422ab79cac086da",
  signature: "4vUQTWEupoq/Jo7wDXnMOvj4xv+51g/ZenPRug4jB5ahybcTCl+3g0QCkn0+5THF3hBHoE3W1jZUNwy2SQapAw==",
};

test("request signing: the fixed vector (method, path, timestamp, nonce, body hash)", () => {
  assert.equal(canonicalRequest("post", "/api/v1/agent/heartbeat", 1700000000, "fixed-nonce-0123456789", '{"facts":{}}'), VECTOR.canonical);
  const signer = new RequestSigner(SEED_KEY, () => 1700000000999);
  assert.equal(signer.publicKey(), VECTOR.publicKey);
  const h = signer.headers("POST", "/api/v1/agent/heartbeat", '{"facts":{}}', "fixed-nonce-0123456789");
  assert.deepEqual(h, { "X-Inveon-Timestamp": "1700000000", "X-Inveon-Nonce": "fixed-nonce-0123456789", "X-Inveon-Signature": VECTOR.signature });
  // Random nonces otherwise, and a signature that only fits this request.
  const a = signer.headers("POST", "/p", "{}");
  const b = signer.headers("POST", "/p", "{}");
  assert.notEqual(a["X-Inveon-Nonce"], b["X-Inveon-Nonce"]);
  assert.match(a["X-Inveon-Nonce"], /^[A-Za-z0-9_-]{22}$/);
  const pub = createPublicKey(SEED_KEY);
  assert.ok(verify(null, Buffer.from(canonicalRequest("POST", "/p", 1700000000, a["X-Inveon-Nonce"], "{}")), pub, Buffer.from(a["X-Inveon-Signature"], "base64")));
  assert.ok(!verify(null, Buffer.from(canonicalRequest("POST", "/p", 1700000000, a["X-Inveon-Nonce"], "{ }")), pub, Buffer.from(a["X-Inveon-Signature"], "base64")));
});

test("the key is made once, next to the config, readable by root only", () => {
  const dir = mkdtempSync(join(tmpdir(), "inveon-sign-"));
  const path = defaultKeyPath(join(dir, "config.json"));
  assert.equal(path, join(dir, "agent-key.pem"));
  const first = loadOrCreateSigningKey(path);
  assert.equal(first.created, true);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.match(readFileSync(path, "utf8"), /BEGIN PRIVATE KEY/);
  const again = loadOrCreateSigningKey(path);
  assert.equal(again.created, false);
  assert.equal(again.signer.publicKey(), first.signer.publicKey());
  const rsa = join(dir, "rsa.pem");
  writeFileSync(rsa, "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n");
  assert.throws(() => loadOrCreateSigningKey(rsa));
});

test("the client signs the exact path and body it sends, and an upgraded agent enrols its key once", async () => {
  const seen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      seen.push({ url: req.url, body, headers: req.headers });
      if (req.url.endsWith("/signing-key") && seen.filter((s) => s.url.endsWith("/signing-key")).length === 1) {
        res.writeHead(503, { "Content-Type": "application/json" }).end('{"error":{"message":"busy"}}');
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true,"signingKey":"registered"}');
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const restore = console.log;
  console.log = () => {};
  try {
    const signer = new RequestSigner(SEED_KEY);
    const client = new ControlPlaneClient(url, "agent-token", signer);
    await client.heartbeat({ hostname: "h" });
    const hb = seen[0];
    assert.equal(hb.url, "/api/v1/agent/heartbeat");
    assert.equal(hb.headers.authorization, "Bearer agent-token");
    const canonical = canonicalRequest("POST", hb.url, hb.headers["x-inveon-timestamp"], hb.headers["x-inveon-nonce"], hb.body);
    assert.ok(verify(null, Buffer.from(canonical), createPublicKey(SEED_KEY), Buffer.from(hb.headers["x-inveon-signature"], "base64")));

    const dir = mkdtempSync(join(tmpdir(), "inveon-cfg-"));
    const configPath = join(dir, "config.json");
    const config = { controlPlaneUrl: url, serverId: "s", token: "agent-token" };
    // The first attempt fails (retried with the next heartbeat), the second sticks.
    assert.equal(await enrolSigningKey(client, signer, config, configPath), false);
    assert.equal(await enrolSigningKey(client, signer, config, configPath), true);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).signingKeyRegistered, true);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.equal(await enrolSigningKey(client, signer, config, configPath), true);
    const enrolments = seen.filter((s) => s.url === "/api/v1/agent/signing-key");
    assert.equal(enrolments.length, 2);
    assert.deepEqual(JSON.parse(enrolments[1].body), { publicKey: VECTOR.publicKey });
  } finally {
    console.log = restore;
    server.close();
  }
});
