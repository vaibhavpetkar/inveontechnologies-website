// Alerts: channels (Slack, signed webhooks, email), SSRF checks on URLs,
// write-only secrets, events from deploys, health, servers, backups and
// certificates, the delivery log and retries.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { startServer, sha, waitUntil, MASTER_KEY } from "./helpers.mjs";
import { isPublicAddress, validateOutboundUrl, configureOutbound } from "../dist/lib/outbound.js";
import { createDb } from "../dist/db/client.js";
import { configureMasterKey } from "../dist/lib/crypto.js";
import { processDueDeliveries } from "../dist/modules/alerts/service.js";
import { markOfflineServers } from "../dist/modules/agent/routes.js";
import { alertExpiringCertificates } from "../dist/modules/domains/routes.js";

let api;
let receiver;
let received = [];
let respond = () => 200;
let local;

before(async () => {
  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      received.push({ path: req.url, headers: req.headers, body: JSON.parse(body || "{}") });
      res.writeHead(respond(req)).end("ok");
    });
  });
  await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
  api = await startServer({ INVEON_ALERT_PRIVATE_HOSTS: "127.0.0.1" });
  // The test process also runs scheduler tasks against the same database.
  configureMasterKey(MASTER_KEY);
  configureOutbound("127.0.0.1");
  local = createDb(process.env.TEST_DATABASE_URL);
});
after(async () => {
  await api?.stop();
  await local?.pool.end();
  receiver?.close();
});

const hook = (path) => `http://127.0.0.1:${receiver.address().port}${path}`;
const deliveriesFor = async (channelId) => (await api.pool.query("SELECT * FROM alert_deliveries WHERE channel_id = $1 ORDER BY created_at", [channelId])).rows;

test("only public https URLs are accepted (SSRF)", () => {
  configureOutbound("");
  try {
    for (const bad of [
      "http://hooks.slack.com/services/x",
      "ftp://example.com/x",
      "https://user:pass@example.com/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.10/x",
      "https://172.20.0.1/x",
      "https://100.64.0.1/x",
      "https://[::1]/x",
      "https://[fd00::1]/x",
      "https://[fe80::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://localhost/x",
      "https://metadata.google.internal/x",
      "https://printer.local/x",
      "https://intranet/x",
      "not a url",
    ]) {
      assert.throws(() => validateOutboundUrl(bad), /URL/, bad);
    }
    assert.equal(validateOutboundUrl("https://hooks.slack.com/services/T0/B0/abc").hostname, "hooks.slack.com");
    assert.equal(validateOutboundUrl("https://8.8.8.8/hook").hostname, "8.8.8.8");
  } finally {
    configureOutbound("127.0.0.1");
  }
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "0.0.0.0", "::1", "::", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "224.0.0.1", "100.64.1.1", "64:ff9b::a00:1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(ip), true, ip);
});

test("channels: admins only, URLs validated, secrets write-only, signed test delivery", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const developer = await member("developer");
  const base = `/orgs/${orgId}/alert-channels`;
  assert.equal((await api.call("GET", base, { token: developer.token })).status, 403);
  assert.equal((await api.call("POST", base, { token: developer.token, body: { type: "webhook", name: "x", url: "https://example.com/x" } })).status, 403);
  // Through the API: private targets (other than the configured trusted host) are refused.
  for (const url of ["https://169.254.169.254/latest", "http://example.com/x", "https://localhost:8080/x", "https://10.0.0.5/x"]) {
    const r = await api.call("POST", base, { token: owner.token, body: { type: "webhook", name: "x", url } });
    assert.equal(r.status, 400, url);
    assert.equal(r.json.error.code, "INVALID_URL");
  }
  assert.equal((await api.call("POST", base, { token: owner.token, body: { type: "webhook", name: "x", url: "https://example.com/x", events: ["deploy.exploded"] } })).status, 400);

  const created = await api.call("POST", base, { token: owner.token, body: { type: "webhook", name: "Ops", url: hook("/ops?token=very-secret") } });
  assert.equal(created.status, 201);
  const secret = created.json.signingSecret;
  assert.match(secret, /^whsec_/);
  const channel = created.json.channel;
  assert.deepEqual(channel.events.sort(), ["backup.failed", "cert.expiring", "deploy.failed", "health.down", "health.up", "server.offline", "server.online", "server.threshold", "server.threshold_cleared"]);
  assert.ok(!JSON.stringify(channel).includes("very-secret"), "the URL path is never returned");
  assert.equal(channel.signingSecret, "••••••••");
  const list = await api.call("GET", base, { token: owner.token });
  assert.ok(!JSON.stringify(list.json).includes("very-secret") && !JSON.stringify(list.json).includes(secret));
  const { rows } = await api.pool.query("SELECT url_enc, signing_secret_enc FROM alert_channels WHERE id = $1", [channel.id]);
  assert.ok(!rows[0].url_enc.includes("very-secret") && !rows[0].signing_secret_enc.includes(secret), "stored encrypted");

  received = [];
  const t = await api.call("POST", `${base}/${channel.id}/test`, { token: owner.token });
  assert.equal(t.status, 200);
  assert.equal(t.json.delivery.status, "success");
  assert.equal(t.json.delivery.responseStatus, 200);
  assert.equal(received.length, 1);
  const got = received[0];
  assert.equal(got.path, "/ops?token=very-secret");
  assert.equal(got.headers["x-inveon-event"], "test");
  assert.equal(got.body.title, "Test alert");
  const [, ts, sig] = got.headers["x-inveon-signature"].match(/^t=(\d+),v1=([0-9a-f]{64})$/);
  const raw = JSON.stringify(got.body);
  assert.equal(sig, createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex"), "HMAC over timestamp and body");

  // Rotating the secret returns a new one once.
  const rotated = await api.call("POST", `${base}/${channel.id}/signing-secret`, { token: owner.token });
  assert.notEqual(rotated.json.signingSecret, secret);

  const log = await api.call("GET", `/orgs/${orgId}/alert-deliveries?channelId=${channel.id}`, { token: owner.token });
  assert.equal(log.json.deliveries[0].event, "test");
  assert.equal(log.json.deliveries[0].channelName, "Ops");
  const audit = await api.pool.query("SELECT action FROM audit_logs WHERE org_id = $1 AND action LIKE 'alert_channel.%' ORDER BY created_at", [orgId]);
  assert.deepEqual(audit.rows.map((r) => r.action), ["alert_channel.create", "alert_channel.test", "alert_channel.rotate_secret"]);

  // Another org can't see or test it.
  const other = await api.createOrg();
  assert.equal((await api.call("POST", `/orgs/${other.orgId}/alert-channels/${channel.id}/test`, { token: other.owner.token })).status, 404);
});

test("deploy events go only to channels that chose them; Slack gets a text message", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const failedOnly = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "slack", name: "Slack", url: hook("/slack"), events: ["deploy.failed"] } })).json.channel;
  const both = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "webhook", name: "All deploys", url: hook("/all"), events: ["deploy.failed", "deploy.succeeded"] } })).json.channel;
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  received = [];

  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  await waitUntil(async () => (await deliveriesFor(both.id)).some((d) => d.status === "success"));
  assert.equal((await deliveriesFor(failedOnly.id)).length, 0);
  assert.equal((await deliveriesFor(both.id))[0].event, "deploy.succeeded");

  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken, { failAt: "health.check" });
  await waitUntil(async () => (await deliveriesFor(failedOnly.id)).some((d) => d.status === "success"));
  await waitUntil(async () => (await deliveriesFor(both.id)).filter((d) => d.status === "success").length === 2);
  const slack = received.find((r) => r.path === "/slack");
  assert.match(slack.body.text, /Deploy failed: App .* \/ production/);
  assert.match(slack.body.text, /Open in Inveon Cloud/);
  const hookMsg = received.filter((r) => r.path === "/all").at(-1);
  assert.equal(hookMsg.body.event, "deploy.failed");
  assert.equal(hookMsg.body.severity, "critical");
  assert.equal(hookMsg.body.details.environment, "production");
});

test("failed deliveries are retried with backoff and end up in the log", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const channel = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "webhook", name: "Flaky", url: hook("/flaky"), events: ["deploy.failed"] } })).json.channel;
  let calls = 0;
  respond = (req) => (req.url === "/flaky" && ++calls === 1 ? 503 : 200);
  try {
    await api.call("POST", `/orgs/${orgId}/environments/${ctx.environment.id}/deploy`, { token: owner.token, body: { commitSha: sha() } });
    await api.runClaimedJob(srv.agentToken, { fail: true });
    const [first] = await waitUntil(async () => {
      const d = await deliveriesFor(channel.id);
      return d.length && d[0].attempts === 1 && d[0].last_error ? d : null;
    });
    assert.equal(first.status, "pending");
    assert.equal(first.response_status, 503);
    assert.match(first.last_error, /HTTP 503/);
    assert.ok(new Date(first.next_attempt_at) > new Date(Date.now() + 30_000), "waits before retrying");

    // Not due yet: the scheduler leaves it alone. Once due, it is retried.
    assert.equal(await processDueDeliveries(local.db), 0);
    await api.pool.query("UPDATE alert_deliveries SET next_attempt_at = now() WHERE id = $1", [first.id]);
    assert.equal(await processDueDeliveries(local.db), 1);
    const [second] = await deliveriesFor(channel.id);
    assert.equal(second.status, "success");
    assert.equal(second.attempts, 2);
    assert.equal(second.last_error, null);

    // A delivery that keeps failing stops after the last attempt.
    respond = () => 500;
    await api.pool.query("UPDATE alert_deliveries SET status = 'pending', attempts = max_attempts - 1, next_attempt_at = now() WHERE id = $1", [first.id]);
    await processDueDeliveries(local.db);
    const [last] = await deliveriesFor(channel.id);
    assert.equal(last.status, "failure");
  } finally {
    respond = () => 200;
  }
});

test("email channels use the mailer (logged without SMTP); turned-off channels get nothing", async () => {
  const { orgId, owner } = await api.createOrg();
  assert.equal((await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "email", name: "Mail", emails: ["not-an-email"] } })).status, 400);
  const mail = await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "email", name: "On-call", emails: ["oncall@example.com"] } });
  assert.equal(mail.status, 201);
  assert.equal(mail.json.signingSecret, undefined);
  const t = await api.call("POST", `/orgs/${orgId}/alert-channels/${mail.json.channel.id}/test`, { token: owner.token });
  assert.equal(t.json.delivery.status, "success");
  assert.match(t.json.delivery.detail, /SMTP is not configured/);
  await waitUntil(() => /\[Inveon Cloud\] Test alert/.test(api.logs()));

  const off = await api.call("PATCH", `/orgs/${orgId}/alert-channels/${mail.json.channel.id}`, { token: owner.token, body: { enabled: false } });
  assert.equal(off.json.channel.enabled, false);
  assert.equal((await api.call("POST", `/orgs/${orgId}/alert-channels/${mail.json.channel.id}/test`, { token: owner.token })).status, 400);
});

test("server offline and back online, backup failures and expiring certificates raise alerts", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const channel = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "webhook", name: "Ops", url: hook(`/ops-${orgId}`) } })).json.channel;
  const events = async () => (await deliveriesFor(channel.id)).map((d) => d.event);

  await api.pool.query("UPDATE servers SET last_seen_at = now() - interval '10 minutes' WHERE id = $1", [srv.serverId]);
  await markOfflineServers(local.db, 90);
  await markOfflineServers(local.db, 90); // once per transition
  assert.deepEqual(await events(), ["server.offline"]);
  await api.call("POST", "/agent/heartbeat", { token: srv.agentToken, body: { facts: {} } });
  await api.call("POST", "/agent/heartbeat", { token: srv.agentToken, body: { facts: {} } });
  await waitUntil(async () => (await events()).includes("server.online"));
  assert.deepEqual(await events(), ["server.offline", "server.online"]);

  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { enabled: true, hourUtc: 1, dbType: "none", volumePaths: ["uploads"], s3Bucket: "inveon-backups", s3Prefix: "cloud", s3Region: "ap-south-1" } });
  await api.call("POST", `${base}/backups`, { token: owner.token });
  await api.runClaimedJob(srv.agentToken, { fail: true });
  await waitUntil(async () => (await events()).includes("backup.failed"));
  const backupAlert = (await deliveriesFor(channel.id)).find((d) => d.event === "backup.failed");
  assert.equal(backupAlert.payload.details.kind, "manual");

  const d = await api.call("POST", `${base}/domains`, { token: owner.token, body: { hostname: `exp-${Date.now()}.example.com` } });
  await api.pool.query("UPDATE domains SET status = 'active', cert_expires_at = now() + interval '5 days' WHERE id = $1", [d.json.domain.id]);
  assert.ok((await alertExpiringCertificates(local.db)) >= 1);
  await alertExpiringCertificates(local.db); // once per certificate and expiry date
  const certAlerts = (await deliveriesFor(channel.id)).filter((x) => x.event === "cert.expiring");
  assert.equal(certAlerts.length, 1);
  assert.match(certAlerts[0].payload.title, /expires in [45] days/);
});

test("health checks alert channels instead of the built-in email once a channel subscribes", async () => {
  const target = createServer((_req, res) => res.writeHead(500).end("x"));
  await new Promise((r) => target.listen(0, "127.0.0.1", r));
  try {
    const { orgId, owner } = await api.createOrg();
    const srv = await api.registerServer(orgId, owner);
    const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
    const channel = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "webhook", name: "Health", url: hook("/health"), events: ["health.down", "health.up"] } })).json.channel;
    const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
    await api.call("PUT", `${base}/health`, { token: owner.token, body: { url: `http://127.0.0.1:${target.address().port}/`, intervalSec: 60 } });
    for (let i = 0; i < 3; i++) await api.call("POST", `${base}/health/run`, { token: owner.token });
    await waitUntil(async () => (await deliveriesFor(channel.id)).some((x) => x.event === "health.down" && x.status === "success"));
    assert.ok(!api.logs().includes(`[Down] ${ctx.app.name}`), "no duplicate built-in email");
  } finally {
    target.close();
  }
});
