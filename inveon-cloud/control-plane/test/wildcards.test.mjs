// Wildcard certificates with DNS-01: Cloudflare (fake-clouds.mjs) and
// Route 53 (fake-aws.mjs), the agent's challenge hooks, and previews
// served with the wildcard.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { startServer, freePort, sha } from "./helpers.mjs";
import { startFakeClouds } from "./fake-clouds.mjs";

let api;
let clouds;
let aws;
const CF_TOKEN = "cf-token-" + "c".repeat(32);
const VALUE_A = "A".repeat(43);
const VALUE_B = "b".repeat(43);

before(async () => {
  clouds = await startFakeClouds();
  clouds.state.tokens.cloudflare.add(CF_TOKEN);
  const port = await freePort();
  api = await startServer({ ...clouds.env, FAKE_AWS_PORT: String(port), INVEON_DNS_PROPAGATION_SEC: "7" }, { nodeArgs: ["--import", fileURLToPath(new URL("./fake-aws.mjs", import.meta.url))] });
  const base = `http://127.0.0.1:${port}`;
  aws = { txt: async () => (await fetch(`${base}/route53/txt`)).json(), calls: async (m) => (await (await fetch(`${base}/calls`)).json()).filter((c) => c.method === m) };
});
after(async () => {
  await api?.stop();
  await clouds?.close();
});

const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.json));
  return r.json;
};
const rand = () => randomBytes(4).toString("hex");

/** An org with a server (203.0.113.9) and Cloudflare connected; a zone example-<x>.net in the fake. */
async function cloudflareOrg() {
  const o = await api.createOrg();
  const srv = await api.registerServer(o.orgId, o.owner);
  ok(await api.call("PATCH", `/orgs/${o.orgId}/servers/${srv.serverId}`, { token: o.owner.token, body: { ipAddress: "203.0.113.9" } }));
  const zone = { id: randomBytes(16).toString("hex"), name: `example-${rand()}.net` };
  clouds.state.zones.push(zone);
  ok(await api.call("PUT", `/orgs/${o.orgId}/dns/cloudflare`, { token: o.owner.token, body: { token: CF_TOKEN } }));
  return { ...o, srv, zone };
}

const claim = async (agentToken) => (await api.call("POST", "/agent/jobs/claim", { token: agentToken })).json?.job ?? null;
const challenge = (agentToken, jobId, body) => api.call("POST", `/agent/jobs/${jobId}/dns-challenge`, { token: agentToken, body });
const cfRecords = (zone) => [...clouds.state.records.values()].filter((r) => r.zoneId === zone.id);

async function finishJob(agentToken, job, { fail = false, result } = {}) {
  for (const s of job.steps) {
    ok(await api.call("POST", `/agent/jobs/${job.id}/steps/${s.id}`, { token: agentToken, body: { status: fail ? "failure" : "success", result } }));
    if (fail) break;
  }
  return ok(await api.call("POST", `/agent/jobs/${job.id}/finish`, { token: agentToken, body: { status: fail ? "failure" : "success", error: fail ? "certbot failed" : undefined } }));
}

test("Cloudflare DNS connection: verified before saving, encrypted, write-only", async () => {
  const o = await api.createOrg();
  const bad = await api.call("PUT", `/orgs/${o.orgId}/dns/cloudflare`, { token: o.owner.token, body: { token: "wrong-token-" + "x".repeat(20) } });
  assert.equal(bad.json.error.code, "PROVIDER_VERIFY_FAILED");
  assert.equal((await api.call("PUT", `/orgs/${o.orgId}/dns/cloudflare`, { token: o.owner.token, body: { token: "has spaces in it, which no token has" } })).status, 400);
  ok(await api.call("PUT", `/orgs/${o.orgId}/dns/cloudflare`, { token: o.owner.token, body: { token: CF_TOKEN } }));
  const view = ok(await api.call("GET", `/orgs/${o.orgId}/dns`, { token: o.owner.token }));
  assert.equal(view.connections.cloudflare.connected, true);
  assert.equal(view.connections.cloudflare.tokenHint, `…${CF_TOKEN.slice(-4)}`);
  assert.equal(view.connections.route53.connected, false);
  assert.ok(!JSON.stringify(view).includes(CF_TOKEN));
  const row = (await api.pool.query("SELECT token_enc FROM provider_connections WHERE org_id = $1 AND provider = 'cloudflare'", [o.orgId])).rows[0];
  assert.ok(!row.token_enc.includes(CF_TOKEN));
  const dev = await o.member("developer");
  assert.equal((await api.call("GET", `/orgs/${o.orgId}/dns`, { token: dev.token })).status, 403);
});

test("a Cloudflare wildcard: the hooks publish and remove TXT records for their own job only", async () => {
  const { orgId, owner, srv, zone } = await cloudflareOrg();
  const base = `preview.${zone.name}`;
  // Base domains must be plain hostnames; the zone must exist.
  assert.equal((await api.call("POST", `/orgs/${orgId}/wildcards`, { token: owner.token, body: { baseDomain: `*.${base}`, dnsProvider: "cloudflare", serverId: srv.serverId } })).status, 400);
  assert.equal((await api.call("POST", `/orgs/${orgId}/wildcards`, { token: owner.token, body: { baseDomain: `x.nozone-${rand()}.org`, dnsProvider: "cloudflare", serverId: srv.serverId } })).json.error.code, "ZONE_NOT_FOUND");
  assert.equal((await api.call("POST", `/orgs/${orgId}/wildcards`, { token: owner.token, body: { baseDomain: base, dnsProvider: "route53", serverId: srv.serverId } })).json.error.code, "AWS_NOT_CONNECTED");

  const created = ok(await api.call("POST", `/orgs/${orgId}/wildcards`, { token: owner.token, body: { baseDomain: base.toUpperCase(), dnsProvider: "cloudflare", serverId: srv.serverId } }), 201);
  assert.equal(created.wildcard.zoneId, zone.id, "the parent zone is found");
  assert.equal(created.wildcard.status, "issuing");
  assert.deepEqual(created.wildcard.dnsRecords.map((r) => [r.name, r.value]), [[`*.${base}`, "203.0.113.9"], [base, "203.0.113.9"]]);

  const job = await claim(srv.agentToken);
  assert.equal(job.type, "wildcard_issue");
  assert.deepEqual(job.steps.map((s) => [s.action, s.params]), [["certbot.issue_wildcard", { baseDomain: base, email: null }]]);

  // Another server, a different domain, or a malformed value: refused.
  const other = await api.registerServer(orgId, owner);
  assert.equal((await challenge(other.agentToken, job.id, { phase: "auth", domain: base, validation: VALUE_A })).status, 404);
  assert.equal((await challenge(srv.agentToken, job.id, { phase: "auth", domain: zone.name, validation: VALUE_A })).status, 403);
  assert.equal((await challenge(srv.agentToken, job.id, { phase: "auth", domain: base, validation: "x; rm -rf /" })).status, 400);
  assert.equal(cfRecords(zone).length, 0);

  // certbot asks twice for the same name (*.base and base).
  assert.deepEqual(ok(await challenge(srv.agentToken, job.id, { phase: "auth", domain: base, validation: VALUE_A })), { waitSec: 7 });
  ok(await challenge(srv.agentToken, job.id, { phase: "auth", domain: base, validation: VALUE_B }));
  assert.deepEqual(cfRecords(zone).map((r) => [r.type, r.name, r.content, r.ttl]).sort(), [["TXT", `_acme-challenge.${base}`, VALUE_A, 60], ["TXT", `_acme-challenge.${base}`, VALUE_B, 60]].sort());
  assert.equal(clouds.calls("cloudflare", "POST").filter((c) => c.auth === `Bearer ${CF_TOKEN}`).length, 2);
  assert.deepEqual(ok(await challenge(srv.agentToken, job.id, { phase: "cleanup", domain: base, validation: VALUE_A })), { removed: 1 });
  assert.deepEqual(cfRecords(zone).map((r) => r.content), [VALUE_B]);
  ok(await challenge(srv.agentToken, job.id, { phase: "cleanup", domain: base, validation: VALUE_B }));
  assert.equal(cfRecords(zone).length, 0);

  const expiresAt = "2026-12-30T10:00:00.000Z";
  await finishJob(srv.agentToken, job, { result: { certName: `wildcard_${base}`, wildcards: [{ baseDomain: base, expiresAt }] } });
  const row = (await api.pool.query("SELECT status, cert_expires_at FROM wildcard_certificates WHERE id = $1", [created.wildcard.id])).rows[0];
  assert.equal(row.status, "active");
  assert.equal(row.cert_expires_at.toISOString(), expiresAt);
  // Once the job is over its hooks are refused.
  assert.equal((await challenge(srv.agentToken, job.id, { phase: "auth", domain: base, validation: VALUE_A })).status, 409);

  // A failed run: whatever the cleanup hook left behind is removed when the job ends.
  const again = ok(await api.call("POST", `/orgs/${orgId}/wildcards/${created.wildcard.id}/issue`, { token: owner.token }));
  const retry = await claim(srv.agentToken);
  assert.equal(retry.id, again.job.id);
  ok(await challenge(srv.agentToken, retry.id, { phase: "auth", domain: base, validation: VALUE_A }));
  assert.equal(cfRecords(zone).length, 1);
  await finishJob(srv.agentToken, retry, { fail: true });
  assert.equal(cfRecords(zone).length, 0);
  assert.equal((await api.pool.query("SELECT status FROM wildcard_certificates WHERE id = $1", [created.wildcard.id])).rows[0].status, "failed");
  // The server holding it can't be deleted, nor the connection its renewals need.
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/servers/${srv.serverId}`, { token: owner.token })).status, 409);
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/dns/cloudflare`, { token: owner.token })).status, 409);
});

test("a Route 53 wildcard through the AWS connection: the record set holds every live value, synced before certbot goes on", async () => {
  const o = await api.createOrg();
  const srv = await api.registerServer(o.orgId, o.owner);
  ok(await api.call("POST", `/orgs/${o.orgId}/aws/setup`, { token: o.owner.token }));
  ok(await api.call("PUT", `/orgs/${o.orgId}/aws`, { token: o.owner.token, body: { authType: "role", roleArn: "arn:aws:iam::123456789012:role/inveon-cloud", defaultRegion: "ap-south-1" } }));
  const base = `p${rand()}.aws-zone.test`;
  const created = ok(await api.call("POST", `/orgs/${o.orgId}/wildcards`, { token: o.owner.token, body: { baseDomain: base, dnsProvider: "route53", serverId: srv.serverId } }), 201);
  assert.equal(created.wildcard.zoneId, "Z0FAKEZONE00001");
  const job = await claim(srv.agentToken);
  const key = `Z0FAKEZONE00001|_acme-challenge.${base}`;

  ok(await challenge(srv.agentToken, job.id, { phase: "auth", domain: base, validation: VALUE_A }));
  ok(await challenge(srv.agentToken, job.id, { phase: "auth", domain: base, validation: VALUE_B }));
  assert.deepEqual((await aws.txt())[key], [VALUE_A, VALUE_B]);
  // Each change was polled until in sync (the fake is PENDING once).
  const statusPolls = (await aws.calls("route53.changeStatus")).length;
  assert.ok(statusPolls >= 4, `polled ${statusPolls} times`);
  ok(await challenge(srv.agentToken, job.id, { phase: "cleanup", domain: base, validation: VALUE_A }));
  assert.deepEqual((await aws.txt())[key], [VALUE_B]);
  ok(await challenge(srv.agentToken, job.id, { phase: "cleanup", domain: base, validation: VALUE_B }));
  assert.equal((await aws.txt())[key], undefined);
  const changes = (await aws.calls("route53.changeTxt")).filter((c) => c.args.name === `_acme-challenge.${base}`).map((c) => [c.args.action, c.args.values]);
  assert.deepEqual(changes, [["UPSERT", [VALUE_A]], ["UPSERT", [VALUE_A, VALUE_B]], ["UPSERT", [VALUE_B]], ["DELETE", [VALUE_B]]]);
  assert.ok((await aws.calls("route53.changeTxt")).every((c) => c.creds.authType === "role"));
});

test("domains under an active wildcard use it (previews too): no certbot run of their own", async () => {
  const { orgId, owner, srv, zone } = await cloudflareOrg();
  const base = `pv.${zone.name}`;
  const created = ok(await api.call("POST", `/orgs/${orgId}/wildcards`, { token: owner.token, body: { baseDomain: base, dnsProvider: "cloudflare", serverId: srv.serverId } }), 201);
  await finishJob(srv.agentToken, await claim(srv.agentToken), { result: { wildcards: [{ baseDomain: base, expiresAt: "2026-12-31T00:00:00.000Z" }] } });

  // Previews on that server under the base domain.
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  ok(await api.call("PATCH", `/orgs/${orgId}/apps/${ctx.app.id}`, { token: owner.token, body: { previewsEnabled: true, previewServerId: srv.serverId, previewBaseDomain: base } }));
  const full = `${ctx.repoOwner}/${ctx.repo}`;
  const raw = JSON.stringify({
    action: "opened",
    number: 31,
    pull_request: { title: "PR 31", head: { sha: sha(), ref: "feature", repo: { full_name: full } }, base: { ref: "main", repo: { full_name: full } } },
    repository: { full_name: full },
  });
  const hook = await api.call("POST", `/webhooks/github/${ctx.app.id}`, {
    raw,
    headers: { "X-GitHub-Event": "pull_request", "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=" + createHmac("sha256", ctx.webhookSecret).update(raw).digest("hex") },
  });
  assert.equal(hook.status, 202, JSON.stringify(hook.json));
  await api.runClaimedJob(srv.agentToken); // the preview's deploy
  const site = await claim(srv.agentToken);
  assert.equal(site.type, "domain_issue");
  assert.deepEqual(site.steps.map((s) => s.action), ["nginx.write_site", "nginx.reload"]);
  assert.deepEqual(site.steps[0].params, { hostname: `pr-31.${base}`, slug: site.steps[0].params.slug, tls: true, certName: `wildcard_${base}` });
  await finishJob(srv.agentToken, site);
  const d = (await api.pool.query("SELECT status, wildcard_id, cert_expires_at FROM domains WHERE hostname = $1", [`pr-31.${base}`])).rows[0];
  assert.equal(d.status, "active");
  assert.equal(d.wildcard_id, created.wildcard.id);
  assert.equal(d.cert_expires_at.toISOString(), "2026-12-31T00:00:00.000Z");

  // Closing the PR removes the site but leaves the shared certificate alone.
  const closeRaw = raw.replace('"opened"', '"closed"');
  await api.call("POST", `/webhooks/github/${ctx.app.id}`, {
    raw: closeRaw,
    headers: { "X-GitHub-Event": "pull_request", "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=" + createHmac("sha256", ctx.webhookSecret).update(closeRaw).digest("hex") },
  });
  const teardown = await claim(srv.agentToken);
  assert.equal(teardown.type, "preview_teardown");
  assert.ok(teardown.steps.some((s) => s.action === "nginx.remove_site"));
  assert.ok(!teardown.steps.some((s) => s.action === "certbot.delete"));

  // Two labels down is not covered by *.<base>: that domain gets its own certificate.
  const deep = ok(await api.call("POST", `/orgs/${orgId}/environments/${ctx.environment.id}/domains`, { token: owner.token, body: { hostname: `a.b.${base}` } }), 201);
  await api.runClaimedJob(srv.agentToken).catch(() => null); // drain anything queued
  ok(await api.call("POST", `/orgs/${orgId}/environments/${ctx.environment.id}/deploy`, { token: owner.token, body: {} }), 201);
  await api.runClaimedJob(srv.agentToken);
  await api.pool.query("UPDATE domains SET dns_checked_at = now() WHERE id = $1", [deep.domain.id]);
  ok(await api.call("POST", `/orgs/${orgId}/domains/${deep.domain.id}/issue`, { token: owner.token }));
  const own = await claim(srv.agentToken);
  assert.ok(own.steps.some((s) => s.action === "certbot.issue"));

  // A wildcard still used by a domain can't be removed.
  await api.pool.query("UPDATE domains SET wildcard_id = $1 WHERE id = $2", [created.wildcard.id, deep.domain.id]);
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/wildcards/${created.wildcard.id}`, { token: owner.token })).status, 409);
});
