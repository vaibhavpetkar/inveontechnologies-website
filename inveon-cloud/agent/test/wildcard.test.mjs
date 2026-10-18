// Wildcard certificates: certbot's DNS-01 run with the agent's fixed hook
// commands, the hook itself, and sites served with a wildcard certificate.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dnsHookCommand, runAction } from "../dist/actions.js";
import { renderSite } from "../dist/templates.js";
import { runDnsHook } from "../dist/dns-hook.js";

const JOB = "3f1c2b6e-8a4d-4c1e-9b7a-0d2e4f6a8b1c";
let root;
let config;
let calls;
const ctx = (extra = {}) => ({
  config,
  runner: async (bin, args, opts) => (calls.push({ bin, args, env: opts.env }), { code: 0, stdout: "" }),
  log: () => {},
  jobId: JOB,
  nodePath: "/usr/bin/node",
  agentEntry: "/opt/inveon-agent/dist/index.js",
  configPath: "/etc/inveon-agent/config.json",
  ...extra,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inveon-agent-wildcard-"));
  config = { controlPlaneUrl: "https://cloud.test", serverId: "s", token: "t", appsRoot: join(root, "apps"), nginxConfDir: join(root, "nginx"), acmeWebroot: join(root, "acme"), letsencryptDir: join(root, "le"), workDir: join(root, "work") };
  mkdirSync(config.nginxConfDir, { recursive: true });
  calls = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("certbot issues *.<base> and <base> with the DNS-01 hooks, told which job they answer for", async () => {
  await runAction("certbot.issue_wildcard", { baseDomain: "preview.example.com", email: "ops@example.com" }, ctx());
  assert.equal(calls.length, 1);
  const { bin, args, env } = calls[0];
  assert.equal(bin, "certbot");
  assert.deepEqual(args, [
    "certonly",
    "--manual",
    "--preferred-challenges",
    "dns",
    "--manual-auth-hook",
    "/usr/bin/node /opt/inveon-agent/dist/index.js dns-hook auth --config /etc/inveon-agent/config.json",
    "--manual-cleanup-hook",
    "/usr/bin/node /opt/inveon-agent/dist/index.js dns-hook cleanup --config /etc/inveon-agent/config.json",
    "--cert-name",
    "wildcard_preview.example.com",
    "-d",
    "*.preview.example.com",
    "-d",
    "preview.example.com",
    "--non-interactive",
    "--agree-tos",
    "--keep-until-expiring",
    "--email",
    "ops@example.com",
  ]);
  assert.deepEqual(env, { INVEON_DNS_JOB_ID: JOB });
});

test("the wildcard action refuses bad domains, a missing job id and hook paths a shell would interpret", async () => {
  for (const baseDomain of ["*.example.com", "-d evil.com", "example.com --dry-run", "EXAMPLE", "a..com", ""]) {
    await assert.rejects(runAction("certbot.issue_wildcard", { baseDomain, email: null }, ctx()), baseDomain);
  }
  await assert.rejects(runAction("certbot.issue_wildcard", { baseDomain: "example.com", email: null }, ctx({ jobId: undefined })), /job id/);
  await assert.rejects(runAction("certbot.issue_wildcard", { baseDomain: "example.com", email: null }, ctx({ jobId: "1; rm -rf /" })), /job id/);
  for (const agentEntry of ["/opt/my agent/index.js", "/opt/a;b.js", "/opt/$(id).js", "relative/index.js", "/opt/../etc/x.js", "/opt/`id`"]) {
    assert.throws(() => dnsHookCommand("auth", { nodePath: "/usr/bin/node", agentEntry, configPath: "/etc/inveon-agent/config.json" }), agentEntry);
  }
  assert.equal(calls.length, 0);
});

test("renewing wildcards passes the job id to the saved hooks and reports their expiry", async () => {
  const r = await runAction("certbot.renew", { hostnames: ["a.example.com"], wildcards: ["preview.example.com"] }, ctx());
  assert.deepEqual(calls[0].args, ["renew", "--non-interactive"]);
  assert.deepEqual(calls[0].env, { INVEON_DNS_JOB_ID: JOB });
  assert.deepEqual(r.wildcards, [{ baseDomain: "preview.example.com", expiresAt: null }]);
  // Without wildcards nothing changes (no job id needed).
  calls = [];
  const plain = await runAction("certbot.renew", { hostnames: ["a.example.com"] }, ctx({ jobId: undefined }));
  assert.equal(calls[0].env, undefined);
  assert.equal(plain.wildcards, undefined);
  await assert.rejects(runAction("certbot.renew", { hostnames: [], wildcards: ["*.x.com"] }, ctx()));
});

test("a site under a wildcard uses the wildcard's certificate files", async () => {
  const site = renderSite({ hostname: "pr-7.preview.example.com", slug: "shop-pr-7-ab12", tls: true, acmeWebroot: "/var/www/acme", letsencryptDir: "/etc/letsencrypt", certName: "wildcard_preview.example.com" });
  assert.match(site, /ssl_certificate \/etc\/letsencrypt\/live\/wildcard_preview\.example\.com\/fullchain\.pem;/);
  assert.match(site, /server_name pr-7\.preview\.example\.com;/);
  for (const certName of ["../x", "wildcard_x;", "wildcard_ example.com", "other_example.com"]) {
    assert.throws(() => renderSite({ hostname: "a.example.com", slug: "s", tls: true, acmeWebroot: "/a", letsencryptDir: "/l", certName }), certName);
  }
  // The action only takes a wildcard name, and wants the certificate on disk.
  const params = { hostname: "pr-7.preview.example.com", slug: "shop-pr-7-ab12", tls: true, certName: "wildcard_preview.example.com" };
  await assert.rejects(runAction("nginx.write_site", params, ctx()), /No certificate wildcard_preview\.example\.com/);
  await assert.rejects(runAction("nginx.write_site", { ...params, certName: "a.example.com" }, ctx()), /certName/);
  mkdirSync(join(config.letsencryptDir, "live", "wildcard_preview.example.com"), { recursive: true });
  writeFileSync(join(config.letsencryptDir, "live", "wildcard_preview.example.com", "fullchain.pem"), "x");
  await runAction("nginx.write_site", params, ctx());
  assert.match(readFileSync(join(config.nginxConfDir, "inveon-site-pr-7.preview.example.com.conf"), "utf8"), /live\/wildcard_preview\.example\.com\/privkey\.pem/);
});

test("certbot.delete takes a wildcard's name", async () => {
  mkdirSync(join(config.letsencryptDir, "live", "wildcard_preview.example.com"), { recursive: true });
  await runAction("certbot.delete", { certName: "wildcard_preview.example.com" }, ctx());
  assert.deepEqual(calls[0].args, ["delete", "--cert-name", "wildcard_preview.example.com", "--non-interactive"]);
  await assert.rejects(runAction("certbot.delete", { certName: "--all" }, ctx()));
});

test("the hook publishes through the control plane, waits as told (capped), and cleans up without waiting", async () => {
  const sent = [];
  const waits = [];
  const client = { dnsChallenge: async (jobId, body) => (sent.push({ jobId, body }), { waitSec: 45 }) };
  const env = { INVEON_DNS_JOB_ID: JOB, CERTBOT_DOMAIN: "Preview.Example.com", CERTBOT_VALIDATION: "a".repeat(43) };
  assert.equal(await runDnsHook("auth", env, { client, sleep: async (ms) => waits.push(ms) }), 45);
  assert.deepEqual(sent[0], { jobId: JOB, body: { phase: "auth", domain: "preview.example.com", validation: "a".repeat(43) } });
  assert.deepEqual(waits, [45000]);
  await runDnsHook("cleanup", env, { client, sleep: async (ms) => waits.push(ms) });
  assert.equal(sent[1].body.phase, "cleanup");
  assert.equal(waits.length, 1);
  const greedy = { dnsChallenge: async () => ({ waitSec: 99999 }) };
  assert.equal(await runDnsHook("auth", env, { client: greedy, sleep: async () => {} }), 600);

  for (const bad of [{ INVEON_DNS_JOB_ID: undefined }, { CERTBOT_DOMAIN: "evil.com/../x" }, { CERTBOT_VALIDATION: "short" }, { CERTBOT_VALIDATION: "a".repeat(43) + ";id" }]) {
    await assert.rejects(runDnsHook("auth", { ...env, ...bad }, { client, sleep: async () => {} }), JSON.stringify(bad));
  }
  await assert.rejects(runDnsHook("deploy", env, { client }), /Usage/);
});
