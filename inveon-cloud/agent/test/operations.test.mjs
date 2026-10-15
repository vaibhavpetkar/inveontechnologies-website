// Operations actions: live logs (compose.logs_follow) and the agent's
// stream lane / cancel handling.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAction, STREAMING_ACTIONS } from "../dist/actions.js";
import { runJob } from "../dist/agent.js";
import { HttpError } from "../dist/client.js";

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

const ref = { slug: "site-prod-ab12", slot: "blue", composePath: "docker-compose.yml" };
function composeFile() {
  const dir = join(config.appsRoot, ref.slug, "blue");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "docker-compose.yml");
  writeFileSync(file, "services: {}\n");
  return { dir, file, base: ["compose", "-p", "site-prod-ab12-blue", "-f", file, "--project-directory", dir] };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inveon-agent-ops-"));
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

const silence = () => {
  const orig = console.log;
  console.log = () => {};
  return () => (console.log = orig);
};

// ---------------------------------------------------------------- live logs

test("compose.logs_follow runs `docker compose logs -f --tail N <service>` with a time limit and the job's abort signal", async () => {
  const { base } = composeFile();
  const controller = new AbortController();
  runnerImpl = async (_bin, _args, _opts, log) => {
    log("2026-10-12T10:00:00Z web | GET / 200\n");
    return { code: 0, stdout: "" };
  };
  const c = ctx({ signal: controller.signal });
  const result = await runAction("compose.logs_follow", { ...ref, service: "web", tail: 100, durationSec: 600 }, c);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, "docker");
  assert.deepEqual(calls[0].args, [...base, "logs", "-f", "--no-color", "--timestamps", "--tail", "100", "web"]);
  assert.equal(calls[0].opts.timeoutMs, 600_000);
  assert.equal(calls[0].opts.signal, controller.signal);
  assert.deepEqual(result, { stopped: "exited" });
  assert.match(c.logs.join(""), /GET \/ 200/);
});

test("compose.logs_follow ends normally when the viewer leaves (abort) and fails on a real error", async () => {
  composeFile();
  const controller = new AbortController();
  runnerImpl = async (_bin, _args, opts) => {
    controller.abort();
    assert.ok(opts.signal.aborted);
    return { code: 143, stdout: "" };
  };
  const c = ctx({ signal: controller.signal });
  assert.deepEqual(await runAction("compose.logs_follow", { ...ref, service: "web", tail: 0, durationSec: 30 }, c), { stopped: "viewer" });
  assert.match(c.logs.join(""), /the viewer left/);

  runnerImpl = async () => ({ code: 1, stdout: "" });
  await assert.rejects(runAction("compose.logs_follow", { ...ref, service: "web", tail: 10, durationSec: 30 }, ctx()), /exited with code 1/);
});

test("compose.logs_follow refuses bad parameters before running anything", async () => {
  composeFile();
  const bad = [
    { ...ref, tail: 100, durationSec: 60 }, // service is required
    { ...ref, service: "--volume=/:/host", tail: 100, durationSec: 60 },
    { ...ref, service: "web; rm -rf /", tail: 100, durationSec: 60 },
    { ...ref, service: "web", tail: 100000, durationSec: 60 },
    { ...ref, service: "web", tail: 100, durationSec: 601 }, // at most 10 minutes
    { ...ref, service: "web", tail: 100, durationSec: 5 },
    { ...ref, slug: "../etc", service: "web", tail: 100, durationSec: 60 },
  ];
  for (const p of bad) await assert.rejects(runAction("compose.logs_follow", p, ctx()), undefined, JSON.stringify(p));
  assert.equal(calls.length, 0);
});

test("only live logs are streaming actions", () => {
  assert.deepEqual([...STREAMING_ACTIONS], ["compose.logs_follow"]);
});

test("a streaming step checks in while quiet and is aborted as soon as the job is cancelled", async () => {
  const restore = silence();
  try {
    composeFile();
    const reports = [];
    const finishes = [];
    let cancelled = false;
    const client = {
      reportStep: async (_jobId, stepId, body) => {
        if (cancelled) throw new HttpError(409, "Job is cancelled");
        reports.push({ stepId, ...body });
      },
      finish: async (_jobId, status) => finishes.push(status),
    };
    let sawSignal = null;
    const runner = (_bin, _args, opts) =>
      new Promise((resolve) => {
        sawSignal = opts.signal;
        // A quiet container: no output. The viewer leaves after a moment.
        setTimeout(() => (cancelled = true), 60);
        opts.signal.addEventListener("abort", () => resolve({ code: 143, stdout: "" }));
      });
    const status = await runJob(
      client,
      { id: "j", type: "logs_follow", title: "x", steps: [{ id: "s", position: 0, name: "follow", action: "compose.logs_follow", params: { ...ref, service: "web", tail: 10, durationSec: 600 } }] },
      { config, runner, flushMs: 10, keepaliveMs: 20 },
    );
    assert.equal(status, "cancelled");
    assert.ok(sawSignal.aborted, "the docker process was told to stop");
    assert.ok(reports.some((r) => r.status === undefined && r.append === undefined), "sent an empty check-in while quiet");
    assert.equal(finishes.length, 0, "a cancelled job is not reported as finished");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------- backup retention

const del = { slug: "site-prod-ab12", bucket: "inveon-backups", region: "ap-south-1", prefix: "cloud/site-prod-ab12/" };

test("backup.delete runs `aws s3 rm` on each exact key, never recursively", async () => {
  const keys = ["cloud/site-prod-ab12/20261001T020000Z-scheduled-1a2b3c4d.tar.gz", "cloud/site-prod-ab12/20261002T020000Z-manual-5e6f7a8b.tar.gz"];
  const result = await runAction("backup.delete", { ...del, keys }, ctx());
  assert.deepEqual(
    calls.map((c) => [c.bin, ...c.args]),
    keys.map((k) => ["aws", "s3", "rm", `s3://inveon-backups/${k}`, "--region", "ap-south-1", "--only-show-errors"]),
  );
  assert.ok(calls.every((c) => !c.args.includes("--recursive")));
  assert.deepEqual(result, { deleted: 2 });
  // A prefix that is just the slug (no configured prefix) works too.
  calls = [];
  await runAction("backup.delete", { ...del, prefix: "site-prod-ab12/", keys: ["site-prod-ab12/x-manual-1.tar.gz"] }, ctx());
  assert.equal(calls[0].args[2], "s3://inveon-backups/site-prod-ab12/x-manual-1.tar.gz");
});

test("backup.delete only touches backup archives inside the environment's own prefix", async () => {
  const ok = "cloud/site-prod-ab12/20261001T020000Z-scheduled-1a2b3c4d.tar.gz";
  const bad = [
    { ...del, keys: [] },
    { ...del, keys: ["cloud/other-env-zz99/20261001T020000Z-scheduled-1a2b3c4d.tar.gz"] }, // another environment
    { ...del, keys: ["cloud/site-prod-ab12/nested/x.tar.gz"] }, // below the folder
    { ...del, keys: ["cloud/site-prod-ab12/database.sql"] }, // not an archive
    { ...del, keys: ["cloud/site-prod-ab12/"] },
    { ...del, keys: ["--recursive"] },
    { ...del, keys: [ok, "s3://elsewhere/x.tar.gz"] },
    { ...del, prefix: "cloud/", keys: ["cloud/x.tar.gz"] }, // prefix isn't the environment's folder
    { ...del, prefix: "", keys: [ok] },
    { ...del, prefix: "cloud/../site-prod-ab12/", keys: ["cloud/../site-prod-ab12/x.tar.gz"] },
    { ...del, prefix: "/site-prod-ab12/", keys: ["/site-prod-ab12/x.tar.gz"] },
    { ...del, slug: "../x", keys: [ok] },
    { ...del, bucket: "Bad_Bucket", keys: [ok] },
    { ...del, region: "us-east-1; rm", keys: [ok] },
    { ...del, keys: Array.from({ length: 201 }, (_, i) => `cloud/site-prod-ab12/${i}.tar.gz`) },
  ];
  for (const p of bad) await assert.rejects(runAction("backup.delete", p, ctx()), undefined, JSON.stringify(p).slice(0, 120));
  assert.equal(calls.length, 0);
});

test("backup.delete tries every key and fails the step if any delete failed", async () => {
  const keys = ["cloud/site-prod-ab12/a.tar.gz", "cloud/site-prod-ab12/b.tar.gz", "cloud/site-prod-ab12/c.tar.gz"];
  runnerImpl = async (_bin, args) => ({ code: args[2].endsWith("b.tar.gz") ? 1 : 0, stdout: "" });
  const c = ctx();
  await assert.rejects(runAction("backup.delete", { ...del, keys }, c), /1 backup\(s\) could not be deleted/);
  assert.equal(calls.length, 3);
  assert.match(c.logs.join(""), /deleted 2 of 3/);
});

// ---------------------------------------------------------------- release archiving

const SHA_A = "0123456789abcdef0123456789abcdef01234567";

test("image.remove runs `docker image rm` (never forced) per image and skips images in use", async () => {
  const images = [`ghcr.io/inveon-technologies/website:${SHA_A}`, `inveon-build/site-1a2b3c4d:${SHA_A}`, `localhost:5000/team/api:sha-${SHA_A}`];
  runnerImpl = async (_bin, args) => ({ code: args[2].startsWith("inveon-build/") ? 1 : 0, stdout: "" });
  const c = ctx();
  const result = await runAction("image.remove", { images }, c);
  assert.deepEqual(calls.map((x) => [x.bin, ...x.args]), images.map((i) => ["docker", "image", "rm", i]));
  assert.ok(calls.every((x) => !x.args.includes("-f") && !x.args.includes("--force")));
  assert.deepEqual(result, { removed: [images[0], images[2]], skipped: [images[1]] });
  assert.match(c.logs.join(""), /removed 2 image\(s\), skipped 1/);
});

test("image.remove only accepts tagged references that carry a commit SHA", async () => {
  const bad = [
    { images: [] },
    { images: ["postgres:16"] },
    { images: ["nginx:alpine"] },
    { images: ["ghcr.io/inveon/site"] }, // no tag
    { images: [`ghcr.io/inveon/site@sha256:${"a".repeat(64)}`] },
    { images: [`-f`] },
    { images: [`--force ghcr.io/x:${SHA_A}`] },
    { images: [`ghcr.io/x:${SHA_A}; docker system prune -af`] },
    { images: [`GHCR.IO/X:${SHA_A}`] },
    { images: [`ghcr.io/${SHA_A}/site:latest`] }, // the SHA must be in the tag
    { images: Array.from({ length: 101 }, () => `ghcr.io/x:${SHA_A}`) },
    { images: "ghcr.io/x" },
  ];
  for (const p of bad) await assert.rejects(runAction("image.remove", p, ctx()), undefined, JSON.stringify(p).slice(0, 100));
  assert.equal(calls.length, 0);
});
