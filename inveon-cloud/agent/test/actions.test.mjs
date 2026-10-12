import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync, mkdirSync, statSync, symlinkSync } from "node:fs";
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
    "app.remove_folder",
    "backup.create",
    "backup.delete",
    "backup.restore",
    "certbot.delete",
    "certbot.issue",
    "certbot.renew",
    "compose.down",
    "compose.logs",
    "compose.logs_follow",
    "compose.ps",
    "compose.pull",
    "compose.up",
    "compose.validate",
    "health.check",
    "image.build",
    "image.remove",
    "nginx.reload",
    "nginx.remove_site",
    "nginx.remove_upstream",
    "nginx.write_site",
    "nginx.write_upstream",
    "release.prepare",
    "release.run",
  ]);
  assert.deepEqual([...ALLOWED_BINARIES].sort(), ["aws", "certbot", "docker", "git", "nginx", "systemctl", "tar"]);
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

test("release.run runs the validated argv with compose run in the new slot", async () => {
  const ref = { slug: "site-prod-ab12", slot: "green", composePath: "docker-compose.yml" };
  const dir = join(config.appsRoot, ref.slug, "green");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "docker-compose.yml"), "services: {}\n");
  await runAction("release.run", { ...ref, service: "web", command: ["npm", "run", "db:migrate"], timeoutSec: 1800 }, ctx());
  assert.deepEqual(calls[0].args, [
    "compose", "-p", "site-prod-ab12-green", "-f", join(dir, "docker-compose.yml"), "--project-directory", dir,
    "run", "--rm", "-T", "web", "npm", "run", "db:migrate",
  ]);
  assert.equal(calls[0].bin, "docker");
  assert.equal(calls[0].opts.timeoutMs, 1800_000);

  // A failing command fails the step with a clear message.
  runnerImpl = async (_bin, _args, _opts, log) => (log("relation already exists\n"), { code: 1, stdout: "" });
  const c = ctx();
  await assert.rejects(runAction("release.run", { ...ref, service: "web", command: ["python", "manage.py", "migrate"], timeoutSec: 60 }, c), /Release command failed.*live release keeps serving/);

  // Shell syntax, options first, bad services and missing files are refused before anything runs.
  calls = [];
  const bad = [
    { ...ref, service: "web", command: ["sh", "-c", "rm -rf /"], timeoutSec: 60 },
    { ...ref, service: "web", command: ["npm;reboot"], timeoutSec: 60 },
    { ...ref, service: "web", command: ["$(id)"], timeoutSec: 60 },
    { ...ref, service: "web", command: ["--entrypoint=/bin/sh"], timeoutSec: 60 },
    { ...ref, service: "web", command: [], timeoutSec: 60 },
    { ...ref, service: "web", command: "npm run migrate", timeoutSec: 60 },
    { ...ref, service: "-v/:/host", command: ["npm"], timeoutSec: 60 },
    { ...ref, service: "web", command: ["npm"], timeoutSec: 99999 },
    { ...ref, slot: "blue", service: "web", command: ["npm"], timeoutSec: 60 },
  ];
  for (const params of bad) await assert.rejects(runAction("release.run", params, ctx()), undefined, JSON.stringify(params));
  assert.equal(calls.length, 0);
});

const BUILD = {
  repoOwner: "inveon-technologies",
  repoName: "website",
  commitSha: SHA,
  dockerfilePath: "deploy/Dockerfile",
  context: ".",
  image: `inveon-build/website-1a2b3c4d:${SHA}`,
  gitAuth: null,
  registryAuth: null,
};
const DEPLOY_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\n" + "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW".repeat(3) + "\n-----END OPENSSH PRIVATE KEY-----\n";

/** A fake git/docker: git init makes the folder, checkout writes the repo, rev-parse answers. */
function fakeBuildRunner({ head = SHA, files = { "deploy/Dockerfile": "FROM nginx:alpine\n" }, onRun } = {}) {
  let src;
  return async (bin, args, opts, log) => {
    onRun?.(bin, args, opts);
    if (bin === "git" && args[0] === "init") {
      src = args.at(-1);
      mkdirSync(src, { recursive: true });
    }
    if (bin === "git" && args.includes("checkout")) {
      for (const [f, content] of Object.entries(files)) {
        mkdirSync(join(src, f, ".."), { recursive: true });
        if (content.symlink) symlinkSync(content.symlink, join(src, f));
        else writeFileSync(join(src, f), content);
      }
    }
    if (bin === "git" && args.includes("rev-parse")) return { code: 0, stdout: head + "\n" };
    log("ok\n");
    return { code: 0, stdout: "" };
  };
}

test("image.build clones exactly the commit with the deploy key and builds with the app's Dockerfile", async () => {
  let keyOnDisk = null;
  runnerImpl = fakeBuildRunner({
    onRun: (bin, args, opts) => {
      const m = opts.env?.GIT_SSH_COMMAND?.match(/-i (\S+)/);
      if (m && args.includes("fetch")) keyOnDisk = { content: readFileSync(m[1], "utf8"), mode: statSync(m[1]).mode & 0o777 };
    },
  });
  const c = ctx();
  const res = await runAction("image.build", { ...BUILD, gitAuth: { type: "deploy_key", privateKey: DEPLOY_KEY } }, c);
  assert.deepEqual(res, { image: BUILD.image });
  const src = calls[0].args.at(-1);
  assert.deepEqual(calls.map((x) => [x.bin, ...x.args]), [
    ["git", "init", "--quiet", src],
    ["git", "-C", src, "-c", "core.hooksPath=/dev/null", "fetch", "--depth", "1", "--no-tags", "--quiet", "git@github.com:inveon-technologies/website.git", SHA],
    ["git", "-C", src, "-c", "core.hooksPath=/dev/null", "-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", "FETCH_HEAD"],
    ["git", "-C", src, "rev-parse", "HEAD"],
    ["docker", "build", "--pull", "--file", join(src, "deploy/Dockerfile"), "--tag", BUILD.image, "--label", `org.opencontainers.image.revision=${SHA}`, src],
  ]);
  const env = calls[1].opts.env;
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
  assert.match(env.GIT_SSH_COMMAND, /-o IdentitiesOnly=yes .*-o StrictHostKeyChecking=yes -o UserKnownHostsFile=\S+known_hosts$/);
  assert.deepEqual(keyOnDisk, { content: DEPLOY_KEY, mode: 0o600 });
  // The key is never in argv or the log, and the clone is removed afterwards.
  assert.ok(!JSON.stringify(calls.map((x) => x.args)).includes("PRIVATE KEY"));
  assert.ok(!c.logs.join("").includes("PRIVATE KEY"));
  assert.ok(!existsSync(src));
  assert.equal(readdirCount(join(config.workDir, "tmp")), 0);
});

test("image.build: public repos clone over https; a token goes in the environment, not argv", async () => {
  runnerImpl = fakeBuildRunner();
  await runAction("image.build", BUILD, ctx());
  assert.equal(calls[1].args.at(-2), "https://github.com/inveon-technologies/website.git");
  assert.equal(calls[1].opts.env.GIT_SSH_COMMAND, undefined);

  calls = [];
  runnerImpl = fakeBuildRunner();
  const token = "ghs_" + "a".repeat(36);
  await runAction("image.build", { ...BUILD, gitAuth: { type: "token", token } }, ctx());
  assert.equal(calls[1].args.at(-2), "https://github.com/inveon-technologies/website.git");
  assert.equal(calls[1].opts.env.GIT_CONFIG_KEY_0, "http.https://github.com/.extraheader");
  assert.equal(calls[1].opts.env.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`);
  assert.ok(!JSON.stringify(calls.map((x) => x.args)).includes(token));
});

test("image.build logs in to the registry for the build and always logs out", async () => {
  const auth = { server: "ghcr.io", username: "inveon-bot", password: "ghp_secret$value'" };
  let stdinPassword = null;
  let failBuild = true;
  const inner = fakeBuildRunner();
  runnerImpl = async (bin, args, opts, log) => {
    if (bin === "docker" && args[0] === "login") stdinPassword = readFileSync(opts.stdinFile, "utf8");
    if (bin === "docker" && args[0] === "build" && failBuild) return { code: 1, stdout: "" };
    return inner(bin, args, opts, log);
  };
  const c = ctx();
  await assert.rejects(runAction("image.build", { ...BUILD, registryAuth: auth }, c), /docker build exited/);
  const docker = calls.filter((x) => x.bin === "docker");
  assert.deepEqual(docker.map((x) => x.args.slice(0, 2)), [["login", "ghcr.io"], ["build", "--pull"], ["logout", "ghcr.io"]]);
  assert.deepEqual(docker[0].args, ["login", "ghcr.io", "--username", "inveon-bot", "--password-stdin"]);
  assert.equal(stdinPassword, auth.password);
  // One throwaway DOCKER_CONFIG for login, build and logout; never root's.
  const dockerConfig = docker[0].opts.env.DOCKER_CONFIG;
  assert.ok(dockerConfig.startsWith(join(config.workDir, "tmp")));
  assert.ok(docker.every((x) => x.opts.env.DOCKER_CONFIG === dockerConfig));
  assert.ok(!existsSync(dockerConfig));
  assert.ok(!JSON.stringify(calls).includes("ghp_secret"));
  assert.ok(!c.logs.join("").includes("ghp_secret"));
  assert.equal(readdirCount(join(config.workDir, "tmp")), 0);
});

test("image.build refuses bad parameters, a different HEAD and Dockerfiles outside the repo", async () => {
  const bad = [
    { ...BUILD, repoOwner: "../evil" },
    { ...BUILD, repoName: ".." },
    { ...BUILD, repoName: "site --upload-pack=touch" },
    { ...BUILD, commitSha: "main" },
    { ...BUILD, dockerfilePath: "../../etc/passwd" },
    { ...BUILD, dockerfilePath: "/etc/passwd" },
    { ...BUILD, context: "../" },
    { ...BUILD, image: "nginx:alpine" },
    { ...BUILD, image: `inveon-build/x:latest` },
    { ...BUILD, gitAuth: { type: "deploy_key", privateKey: "-----BEGIN RSA PRIVATE KEY-----\nx\n" } },
    { ...BUILD, gitAuth: { type: "password", password: "x" } },
    { ...BUILD, gitAuth: { type: "token", token: "short" } },
    { ...BUILD, registryAuth: { server: "ghcr.io --password x", username: "u", password: "p" } },
    { ...BUILD, registryAuth: { server: "ghcr.io", username: "u", password: "line1\nline2" } },
  ];
  for (const params of bad) await assert.rejects(runAction("image.build", params, ctx()), undefined, JSON.stringify(params));
  assert.equal(calls.length, 0);

  runnerImpl = fakeBuildRunner({ head: "f".repeat(40) });
  await assert.rejects(runAction("image.build", BUILD, ctx()), /expected 0123456789ab/);
  assert.ok(!calls.some((x) => x.bin === "docker"));

  calls = [];
  runnerImpl = fakeBuildRunner({ files: { "deploy/Dockerfile": { symlink: "/etc/hostname" } } });
  await assert.rejects(runAction("image.build", BUILD, ctx()), /outside the repo/);
  assert.ok(!calls.some((x) => x.bin === "docker"));

  calls = [];
  runnerImpl = fakeBuildRunner({ files: {} });
  await assert.rejects(runAction("image.build", BUILD, ctx()), /not found in the repo/);
});

test("compose.pull logs in with the app's credentials and only pulls missing images for local builds", async () => {
  const ref = { slug: "site-prod-ab12", slot: "blue", composePath: "docker-compose.yml" };
  const dir = join(config.appsRoot, ref.slug, "blue");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "docker-compose.yml"), "services: {}\n");
  await runAction("compose.pull", { ...ref, missingOnly: true, registryAuth: null }, ctx());
  assert.deepEqual(calls[0].args.slice(-5), ["pull", "--quiet", "--ignore-buildable", "--policy", "missing"]);
  assert.deepEqual(calls[0].opts.env, {}, "no DOCKER_CONFIG without credentials");

  calls = [];
  await runAction("compose.pull", { ...ref, environmentId: "e", registryAuth: { server: "123456789012.dkr.ecr.ap-south-1.amazonaws.com", username: "AWS", password: "token" } }, ctx());
  assert.deepEqual(calls.map((x) => x.args[0] === "compose" ? x.args.at(-3) : x.args[0]), ["login", "pull", "logout"]);
  assert.deepEqual(calls[1].args.slice(-3), ["pull", "--quiet", "--ignore-buildable"]);
  assert.ok(calls[1].opts.env.DOCKER_CONFIG);
  assert.equal(readdirCount(join(config.workDir, "tmp")), 0);
  await assert.rejects(runAction("compose.pull", { ...ref, missingOnly: "yes" }, ctx()));
});

test("release.prepare points INVEON_IMAGE at the image built on the server", async () => {
  const ref = { slug: "site-prod-ab12", slot: "main", composePath: "docker-compose.yml" };
  const image = `inveon-build/website-1a2b3c4d:${SHA}`;
  await runAction("release.prepare", { ...ref, composeContent: "services: {}\n", env: {}, commitSha: SHA, port: 20000, builtImage: image }, ctx());
  const env = readFileSync(join(config.appsRoot, ref.slug, "main", ".env"), "utf8");
  assert.match(env, new RegExp(`^INVEON_IMAGE='${image}'$`, "m"));
  await assert.rejects(runAction("release.prepare", { ...ref, composeContent: "x", env: {}, commitSha: SHA, port: 20000, builtImage: "alpine:latest" }, ctx()));
});

test("preview teardown: down with volumes, remove nginx files (restored if nginx -t fails), delete cert and folder", async () => {
  const ref = { slug: "site-pr-12-ab12", slot: "blue", composePath: "docker-compose.yml" };
  const dir = join(config.appsRoot, ref.slug, "blue");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(config.appsRoot, ref.slug, "data", "uploads"), { recursive: true });
  writeFileSync(join(dir, "docker-compose.yml"), "services: {}\n");
  await runAction("compose.down", { ...ref, removeVolumes: true }, ctx());
  assert.deepEqual(calls[0].args.slice(-3), ["down", "--remove-orphans", "--volumes"]);
  calls = [];
  await runAction("compose.down", ref, ctx());
  assert.deepEqual(calls[0].args.slice(-2), ["down", "--remove-orphans"]);

  // nginx files: removed, then put back when nginx -t fails.
  const host = "pr-12.preview.example.com";
  await runAction("nginx.write_site", { hostname: host, slug: ref.slug, tls: false }, ctx());
  await runAction("nginx.write_upstream", { slug: ref.slug, port: 20010 }, ctx());
  const site = join(config.nginxConfDir, `inveon-site-${host}.conf`);
  const upstream = join(config.nginxConfDir, `inveon-upstream-${ref.slug}.conf`);
  runnerImpl = async (bin) => ({ code: bin === "nginx" ? 1 : 0, stdout: "" });
  await assert.rejects(runAction("nginx.remove_upstream", { slug: ref.slug }, ctx()), /nginx/);
  assert.ok(existsSync(upstream), "restored after a failed nginx -t");
  runnerImpl = async () => ({ code: 0, stdout: "" });
  calls = [];
  await runAction("nginx.remove_site", { hostname: host }, ctx());
  await runAction("nginx.remove_upstream", { slug: ref.slug }, ctx());
  assert.ok(!existsSync(site) && !existsSync(upstream));
  assert.deepEqual(calls.map((c) => [c.bin, ...c.args]), [["nginx", "-t"], ["nginx", "-t"]]);
  calls = [];
  await runAction("nginx.remove_site", { hostname: host }, ctx()); // already gone: nothing to do
  assert.equal(calls.length, 0);

  // certbot delete only when a certificate exists.
  await runAction("certbot.delete", { hostname: host }, ctx());
  assert.equal(calls.length, 0);
  mkdirSync(join(config.letsencryptDir, "live", host), { recursive: true });
  await runAction("certbot.delete", { hostname: host }, ctx());
  assert.deepEqual(calls.map((c) => [c.bin, ...c.args]), [["certbot", "delete", "--cert-name", host, "--non-interactive"]]);

  await runAction("app.remove_folder", { slug: ref.slug }, ctx());
  assert.ok(!existsSync(join(config.appsRoot, ref.slug)));
  assert.ok(existsSync(config.appsRoot), "only the environment's own folder goes");

  calls = [];
  for (const [name, params] of [
    ["app.remove_folder", { slug: ".." }],
    ["app.remove_folder", { slug: "" }],
    ["app.remove_folder", { slug: "a/../../etc" }],
    ["nginx.remove_site", { hostname: "../../etc/nginx/nginx" }],
    ["nginx.remove_upstream", { slug: "../x" }],
    ["certbot.delete", { hostname: "--all" }],
    ["compose.down", { ...ref, removeVolumes: "yes" }],
  ]) {
    await assert.rejects(runAction(name, params, ctx()), undefined, `${name} ${JSON.stringify(params)}`);
  }
  assert.equal(calls.length, 0);
});

function readdirCount(dir) {
  return existsSync(dir) ? readdirSync(dir).length : 0;
}
