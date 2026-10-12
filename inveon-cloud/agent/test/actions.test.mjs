import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACTIONS, isAllowedAction, runAction } from "../dist/actions.js";
import { ALLOWED_BINARIES, isAllowedBinary } from "../dist/exec.js";
import { formatEnvFile, renderSite, renderUpstream } from "../dist/templates.js";
import { checkControlPlaneUrl } from "../dist/config.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
let root;
let config;
let calls;
let runnerImpl;

function ctx(extra = {}) {
  const logs = [];
  return {
    logs,
    config,
    runner: async (bin, args, opts, log) => {
      calls.push({ bin, args, opts });
      return runnerImpl(bin, args, opts, log);
    },
    log: (c) => logs.push(c),
    sleep: async () => {},
    ...extra,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inveon-agent-test-"));
  config = {
    controlPlaneUrl: "https://cloud.test",
    serverId: "s",
    token: "t",
    appsRoot: join(root, "apps"),
    nginxConfDir: join(root, "nginx"),
    acmeWebroot: join(root, "acme"),
    letsencryptDir: join(root, "le"),
    workDir: join(root, "work"),
  };
  calls = [];
  runnerImpl = async () => ({ code: 0, stdout: "" });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("the action allow-list is exactly the documented set", () => {
  assert.deepEqual(Object.keys(ACTIONS).sort(), [
    "backup.create",
    "backup.restore",
    "certbot.issue",
    "certbot.renew",
    "compose.down",
    "compose.logs",
    "compose.ps",
    "compose.pull",
    "compose.up",
    "compose.validate",
    "health.check",
    "nginx.reload",
    "nginx.write_site",
    "nginx.write_upstream",
    "release.prepare",
  ]);
  assert.deepEqual([...ALLOWED_BINARIES].sort(), ["aws", "certbot", "docker", "nginx", "systemctl", "tar"]);
  assert.equal(isAllowedBinary("bash"), false);
  assert.equal(isAllowedBinary("sh"), false);
});

test("unknown actions are refused before anything runs", async () => {
  for (const name of ["shell.exec", "exec", "bash", "__proto__", "constructor", "toString", "compose.exec"]) {
    assert.equal(isAllowedAction(name), false, name);
    await assert.rejects(runAction(name, {}, ctx()), /Action not allowed/);
  }
  assert.equal(calls.length, 0);
});

test("parameters that could escape paths or inject arguments are rejected", async () => {
  const ref = { slug: "site-prod-ab12", slot: "blue", composePath: "docker-compose.yml" };
  const bad = [
    ["compose.up", { ...ref, slug: "../etc" }],
    ["compose.up", { ...ref, slug: "a b" }],
    ["compose.up", { ...ref, slot: "red" }],
    ["compose.up", { ...ref, composePath: "../../etc/compose.yml" }],
    ["compose.up", { ...ref, composePath: "/etc/compose.yml" }],
    ["compose.logs", { ...ref, lines: 100, service: "--volume=/:/host" }],
    ["compose.logs", { ...ref, lines: 100000 }],
    ["nginx.write_site", { hostname: "evil.com; include /etc/shadow", slug: "x", tls: false }],
    ["nginx.write_site", { hostname: "a.example.com", slug: "x", tls: "yes" }],
    ["nginx.write_upstream", { slug: "x", port: 22 }],
    ["health.check", { port: 20000, path: "http://evil", retries: 1, intervalSec: 1 }],
    ["certbot.issue", { hostname: "-d evil.com", email: null }],
    ["backup.create", { ...ref, db: { type: "postgres", service: "db", name: "app; drop", user: "u" }, volumes: [], bucket: "b-ok", region: "ap-south-1", key: "k" }],
    ["backup.create", { ...ref, db: null, volumes: ["../../root"], bucket: "b-ok", region: "ap-south-1", key: "k" }],
    ["backup.create", { ...ref, db: null, volumes: [], bucket: "Bad_Bucket", region: "ap-south-1", key: "k" }],
    ["release.prepare", { ...ref, composeContent: "services: {}", env: { "BAD KEY": "x" }, commitSha: SHA, port: 20000 }],
    ["release.prepare", { ...ref, composeContent: "services: {}", env: { INVEON_DATA_DIR: "/" }, commitSha: SHA, port: 20000 }],
    ["release.prepare", { ...ref, composeContent: "services: {}", env: {}, commitSha: "HEAD", port: 20000 }],
  ];
  for (const [name, params] of bad) await assert.rejects(runAction(name, params, ctx()), undefined, `${name} ${JSON.stringify(params)}`);
  assert.equal(calls.length, 0);
});

test("release.prepare writes the compose file and a 0600 .env with the slot's port", async () => {
  const c = ctx();
  await runAction(
    "release.prepare",
    { slug: "site-prod-ab12", slot: "green", composePath: "deploy/compose.yml", composeContent: "services:\n  web:\n    image: x\n", env: { SECRET: "it's $ecret", PLAIN: "v" }, commitSha: SHA, port: 20001 },
    c,
  );
  const dir = join(config.appsRoot, "site-prod-ab12", "green", "deploy");
  assert.equal(readFileSync(join(dir, "compose.yml"), "utf8"), "services:\n  web:\n    image: x\n");
  const env = readFileSync(join(dir, ".env"), "utf8");
  assert.match(env, /^INVEON_HTTP_PORT='20001'$/m);
  assert.match(env, /^IMAGE_TAG='0123456789abcdef0123456789abcdef01234567'$/m);
  assert.match(env, /^SECRET="it's \\\$ecret"$/m);
  assert.equal(statSync(join(dir, ".env")).mode & 0o777, 0o600);
  assert.ok(existsSync(join(config.appsRoot, "site-prod-ab12", "data")));
  assert.ok(!c.logs.join("").includes("ecret"), "values are not logged");
  assert.equal(calls.length, 0);
});

test("compose actions build fixed argv with project names per slot", async () => {
  const ref = { slug: "site-prod-ab12", slot: "blue", composePath: "docker-compose.yml" };
  const file = join(config.appsRoot, ref.slug, "blue", "docker-compose.yml");
  mkdirSync(join(config.appsRoot, ref.slug, "blue"), { recursive: true });
  writeFileSync(file, "services: {}\n");
  await runAction("compose.pull", ref, ctx());
  await runAction("compose.up", ref, ctx());
  await runAction("compose.logs", { ...ref, lines: 50, service: "web" }, ctx());
  const base = ["compose", "-p", "site-prod-ab12-blue", "-f", file, "--project-directory", join(config.appsRoot, ref.slug, "blue")];
  assert.deepEqual(calls[0].args, [...base, "pull", "--quiet", "--ignore-buildable"]);
  assert.deepEqual(calls[1].args, [...base, "up", "-d", "--remove-orphans"]);
  assert.deepEqual(calls[2].args, [...base, "logs", "--no-color", "--timestamps", "--tail", "50", "web"]);
  assert.ok(calls.every((c) => c.bin === "docker"));

  // "main" slot (recreate strategy) uses the bare slug as the project.
  calls = [];
  await runAction("compose.down", { ...ref, slot: "main" }, ctx()); // no file: nothing to stop
  assert.equal(calls.length, 0);
});

test("compose.validate rejects unsafe resolved configs and returns the model without env values", async () => {
  const ref = { slug: "site-prod-ab12", slot: "blue", composePath: "docker-compose.yml" };
  const appRoot = join(config.appsRoot, ref.slug);
  mkdirSync(join(appRoot, "blue"), { recursive: true });
  runnerImpl = async () => ({ code: 0, stdout: JSON.stringify({ services: { web: { image: "x", privileged: true } } }) });
  await assert.rejects(runAction("compose.validate", ref, ctx()), /privileged/);
  runnerImpl = async () => ({ code: 0, stdout: JSON.stringify({ services: { web: { image: "x", volumes: [{ type: "bind", source: "/var/run/docker.sock", target: "/s" }] } } }) });
  await assert.rejects(runAction("compose.validate", ref, ctx()), /Docker socket/);

  runnerImpl = async () => ({ code: 0, stdout: JSON.stringify({ services: { web: { image: "x", environment: { DB_PASSWORD: "hunter2" }, volumes: [{ type: "bind", source: `${appRoot}/data/u`, target: "/u" }] } } }) });
  const result = await runAction("compose.validate", ref, ctx());
  assert.equal(result.appRoot, appRoot);
  assert.ok(!JSON.stringify(result).includes("hunter2"));
  assert.deepEqual(calls.at(-1).args.slice(-3), ["config", "--format", "json"]);
  assert.equal(calls.at(-1).opts.captureStdout, true);
});

test("nginx upstream switch writes the file and restores it when nginx -t fails", async () => {
  await runAction("nginx.write_upstream", { slug: "site-prod-ab12", port: 20000 }, ctx());
  const file = join(config.nginxConfDir, "inveon-upstream-site-prod-ab12.conf");
  assert.match(readFileSync(file, "utf8"), /server 127\.0\.0\.1:20000;/);
  assert.deepEqual(calls.map((c) => [c.bin, ...c.args]), [["nginx", "-t"]]);

  runnerImpl = async (bin) => ({ code: bin === "nginx" ? 1 : 0, stdout: "" });
  await assert.rejects(runAction("nginx.write_upstream", { slug: "site-prod-ab12", port: 20001 }, ctx()), /nginx/);
  assert.match(readFileSync(file, "utf8"), /server 127\.0\.0\.1:20000;/);

  runnerImpl = async () => ({ code: 0, stdout: "" });
  calls = [];
  await runAction("nginx.reload", {}, ctx());
  assert.deepEqual(calls.map((c) => [c.bin, ...c.args]), [["nginx", "-t"], ["systemctl", "reload", "nginx"]]);
});

test("nginx site with TLS needs a certificate; certbot uses the webroot", async () => {
  await assert.rejects(runAction("nginx.write_site", { hostname: "app.example.com", slug: "site-prod-ab12", tls: true }, ctx()), /No certificate/);
  await runAction("nginx.write_site", { hostname: "app.example.com", slug: "site-prod-ab12", tls: false }, ctx());
  const site = readFileSync(join(config.nginxConfDir, "inveon-site-app.example.com.conf"), "utf8");
  assert.match(site, /server_name app\.example\.com;/);
  assert.match(site, /proxy_pass http:\/\/inveon_site_prod_ab12;/);
  assert.match(site, /acme-challenge/);
  calls = [];
  const res = await runAction("certbot.issue", { hostname: "app.example.com", email: "ops@example.com" }, ctx());
  assert.deepEqual(calls[0].args.slice(0, 5), ["certonly", "--webroot", "-w", config.acmeWebroot, "-d"]);
  assert.ok(calls[0].args.includes("--non-interactive"));
  assert.deepEqual(res.certs, [{ hostname: "app.example.com", expiresAt: null }]);
});

test("health check retries until the new slot answers", async () => {
  const statuses = [502, 502, 200];
  const c = ctx({ httpGet: async (url) => (assert.equal(url, "http://127.0.0.1:20001/healthz"), statuses.shift()) });
  const r = await runAction("health.check", { port: 20001, path: "/healthz", retries: 5, intervalSec: 1 }, c);
  assert.deepEqual(r, { status: 200, attempts: 3 });
  const failing = ctx({ httpGet: async () => 500 });
  await assert.rejects(runAction("health.check", { port: 20001, path: "/", retries: 3, intervalSec: 1 }, failing), /after 3 attempts/);
});

test("backup dumps with pg_dump via compose exec, tars, and uploads with SSE", async () => {
  const ref = { slug: "site-prod-ab12", slot: "blue", composePath: "docker-compose.yml" };
  mkdirSync(join(config.appsRoot, ref.slug, "data", "uploads"), { recursive: true });
  runnerImpl = async (bin, args, opts) => {
    if (opts.stdoutFile) writeFileSync(opts.stdoutFile, "-- dump\n");
    if (bin === "tar") writeFileSync(args[1], "archive-bytes");
    return { code: 0, stdout: "" };
  };
  const res = await runAction(
    "backup.create",
    { ...ref, db: { type: "postgres", service: "db", name: "app", user: "app" }, volumes: ["uploads", "missing"], bucket: "inveon-backups", region: "ap-south-1", key: "cloud/site/x.tar.gz" },
    ctx(),
  );
  assert.equal(res.sizeBytes, "archive-bytes".length);
  assert.deepEqual(calls[0].args.slice(-11), ["exec", "-T", "db", "pg_dump", "-U", "app", "-d", "app", "--clean", "--if-exists", "--no-owner"]);
  assert.equal(calls[1].bin, "tar");
  assert.ok(calls[1].args.includes("data/uploads"));
  assert.ok(!calls[1].args.includes("data/missing"));
  assert.deepEqual(calls[2].args.slice(0, 2), ["s3", "cp"]);
  assert.ok(calls[2].args.includes("s3://inveon-backups/cloud/site/x.tar.gz"));
  assert.ok(calls[2].args.includes("AES256"));
  assert.equal(readdirCount(join(config.workDir, "tmp")), 0, "temp files are removed");
});

test("env file, upstream and URL helpers", () => {
  assert.equal(formatEnvFile({ A: "1", B: "x'y\nz" }), "# Written by inveon-agent for this release. Do not edit.\nA='1'\nB=\"x'y\\nz\"\n");
  assert.throws(() => formatEnvFile({ "A-B": "1" }));
  assert.match(renderUpstream("a-b", 20000), /upstream inveon_a_b/);
  assert.throws(() => renderSite({ hostname: "x;y", slug: "a", tls: false, acmeWebroot: "/a", letsencryptDir: "/l" }));
  assert.equal(checkControlPlaneUrl("https://cloud.example.com/"), "https://cloud.example.com");
  assert.equal(checkControlPlaneUrl("http://localhost:4100"), "http://localhost:4100");
  assert.throws(() => checkControlPlaneUrl("http://cloud.example.com"));
});

function readdirCount(dir) {
  return existsSync(dir) ? readdirSync(dir).length : 0;
}
