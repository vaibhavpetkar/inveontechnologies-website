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
