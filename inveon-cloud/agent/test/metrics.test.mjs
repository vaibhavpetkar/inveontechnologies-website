// Host metrics: /proc parsers, docker stats and ps parsing, the exact docker
// argument lists, a sampler run with fake sources, and the send buffer.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_SIZE,
  DOCKER_PS_ARGS,
  DOCKER_ROOT_ARGS,
  DOCKER_STATS_ARGS,
  MAX_BUFFERED,
  MetricsBuffer,
  MetricsSampler,
  cpuPercent,
  netRates,
  parseDockerPs,
  parseDockerStats,
  parseMeminfo,
  parseNetDev,
  parseProcStat,
  parseSize,
} from "../dist/metrics.js";
import { HttpError } from "../dist/client.js";
import { isAllowedBinary } from "../dist/exec.js";

const STAT_1 = "cpu  100 0 50 800 40 0 10 0 5 0\ncpu0 50 0 25 400 20 0 5 0 0 0\nintr 1 2 3\n";
const STAT_2 = "cpu  160 0 80 900 50 0 10 0 9 0\ncpu0 80 0 40 450 25 0 5 0 0 0\n";

test("CPU percent from two /proc/stat readings (guest time not counted twice)", () => {
  const a = parseProcStat(STAT_1);
  const b = parseProcStat(STAT_2);
  assert.deepEqual(a, { idle: 840, total: 1000 });
  assert.deepEqual(b, { idle: 950, total: 1200 });
  // 200 jiffies passed, 110 of them idle (idle + iowait): 45% busy.
  assert.equal(cpuPercent(a, b), 45);
  assert.equal(cpuPercent(null, b), null, "the first reading has nothing to compare with");
  assert.equal(cpuPercent(b, a), null, "a counter reset gives no value");
  assert.equal(parseProcStat("intr 1 2\n"), null);
  assert.equal(parseProcStat("cpu  a b c d\n"), null);
});

test("memory used is total minus available", () => {
  const text = "MemTotal:        8000000 kB\nMemFree:          500000 kB\nMemAvailable:    6000000 kB\nBuffers:  1 kB\n";
  assert.deepEqual(parseMeminfo(text), { totalBytes: 8000000 * 1024, usedBytes: 2000000 * 1024 });
  assert.equal(parseMeminfo("MemTotal: 10 kB\n"), null);
});

test("network counters skip loopback, Docker bridges and veth pairs", () => {
  const text = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 999999    100    0    0    0     0          0         0   999999     100    0    0    0     0       0          0
  ens5: 1000000   2000    0    0    0     0          0         0   400000    1000    0    0    0     0       0          0
docker0: 555555   10    0    0    0     0          0         0   555555      10    0    0    0     0       0          0
br-1a2b3c4d5e6f: 7777 1 0 0 0 0 0 0 7777 1 0 0 0 0 0 0
vethabc123: 8888   1    0    0    0     0          0         0   8888      1    0    0    0     0       0          0
  eth1: 500       5    0    0    0     0          0         0   100       1    0    0    0     0       0          0
`;
  assert.deepEqual(parseNetDev(text), { rx: 1000500, tx: 400100 });
  assert.deepEqual(netRates({ rx: 1000, tx: 500 }, { rx: 4000, tx: 2000 }, 30), { rx: 100, tx: 50 });
  assert.deepEqual(netRates({ rx: 5000, tx: 500 }, { rx: 100, tx: 2000 }, 30), { rx: null, tx: 50 }, "a counter that went back (reboot, wrap) gives no rate");
  assert.deepEqual(netRates(null, { rx: 1, tx: 1 }, 30), { rx: null, tx: null });
  assert.equal(parseNetDev("header\nheader\n    lo: 1 2 3 4 5 6 7 8 9 10\n"), null);
});

test("docker stats sizes and lines are parsed; bad lines and names are skipped", () => {
  assert.equal(parseSize("0B"), 0);
  assert.equal(parseSize("980kB"), 980000);
  assert.equal(parseSize("12.5MiB"), 13107200);
  assert.equal(parseSize("1.944GiB"), Math.round(1.944 * 1024 ** 3));
  assert.equal(parseSize(" 2GB "), 2e9);
  assert.equal(parseSize("lots"), null);
  assert.equal(parseSize("5 parsecs"), null);

  const stdout = [
    JSON.stringify({ BlockIO: "0B / 0B", CPUPerc: "3.25%", Container: "abc", ID: "abc", MemPerc: "1.2%", MemUsage: "12.5MiB / 1.944GiB", Name: "site-blue-web-1", NetIO: "1kB / 2kB", PIDs: "4" }),
    JSON.stringify({ CPUPerc: "250.50%", MemUsage: "1GiB / 4GiB", Name: "worker" }),
    "not json",
    JSON.stringify({ CPUPerc: "--", MemUsage: "-- / --", Name: "starting" }),
    JSON.stringify({ CPUPerc: "1%", MemUsage: "1MiB / 2MiB", Name: "bad name; rm -rf /" }),
    "",
  ].join("\n");
  assert.deepEqual(parseDockerStats(stdout), [
    { name: "site-blue-web-1", cpuPct: 3.25, memBytes: 13107200, memLimitBytes: Math.round(1.944 * 1024 ** 3) },
    { name: "worker", cpuPct: 250.5, memBytes: 1024 ** 3, memLimitBytes: 4 * 1024 ** 3 },
    { name: "starting", cpuPct: null, memBytes: null, memLimitBytes: null },
  ]);
});

test("docker ps labels give each container its compose project and service", () => {
  const stdout = [
    JSON.stringify({ ID: "abc", Names: "site-blue-web-1", Labels: "com.docker.compose.project=site-blue,com.docker.compose.service=web,com.docker.compose.version=2.29.1" }),
    JSON.stringify({ ID: "def", Names: "loose", Labels: "" }),
    JSON.stringify({ ID: "ghi", Names: "odd", Labels: "com.docker.compose.project=has space,com.docker.compose.service=ok" }),
  ].join("\n");
  const m = parseDockerPs(stdout);
  assert.deepEqual(m.get("site-blue-web-1"), { project: "site-blue", service: "web" });
  assert.deepEqual(m.get("loose"), { project: null, service: null });
  assert.deepEqual(m.get("odd"), { project: null, service: "ok" }, "label values that could not be valid are dropped");
});

test("the sampler only runs fixed docker argument lists and fills a complete sample", async () => {
  const calls = [];
  const runner = async (bin, args, opts) => {
    calls.push([bin, ...args]);
    assert.equal(opts.captureStdout, true);
    assert.ok(opts.timeoutMs > 0 && opts.timeoutMs <= 20_000);
    if (args[0] === "stats") return { code: 0, stdout: JSON.stringify({ CPUPerc: "2.00%", MemUsage: "100MiB / 1GiB", Name: "app-web-1" }) + "\n" };
    if (args[0] === "ps") return { code: 0, stdout: JSON.stringify({ Names: "app-web-1", Labels: "com.docker.compose.project=app,com.docker.compose.service=web" }) + "\n" };
    if (args[0] === "info") return { code: 0, stdout: "/var/lib/docker\n" };
    return { code: 1, stdout: "" };
  };
  const files = { "/proc/stat": STAT_1, "/proc/meminfo": "MemTotal: 4000 kB\nMemAvailable: 1000 kB\n", "/proc/net/dev": "h\nh\n  eth0: 1000 0 0 0 0 0 0 0 500 0 0 0 0 0 0 0\n" };
  let clock = new Date("2026-10-12T12:00:00Z");
  const disks = { "/": { usedBytes: 30, totalBytes: 100 }, "/var/lib/docker": { usedBytes: 60, totalBytes: 200 } };
  const sampler = new MetricsSampler({ runner, readFile: (p) => files[p], disk: (p) => disks[p] ?? null, loadavg: () => [0.5, 0.25, 0.125], now: () => clock });

  const first = await sampler.sample();
  assert.equal(first.at, "2026-10-12T12:00:00.000Z");
  assert.equal(first.cpuPct, null);
  assert.equal(first.netRxBps, null);
  assert.equal(first.memUsedBytes, 3000 * 1024);
  assert.equal(first.memTotalBytes, 4000 * 1024);
  assert.deepEqual([first.load1, first.load5, first.load15], [0.5, 0.25, 0.13]);
  assert.deepEqual([first.diskRootUsedBytes, first.diskRootTotalBytes, first.diskDockerUsedBytes, first.diskDockerTotalBytes], [30, 100, 60, 200]);
  assert.deepEqual(first.containers, [{ name: "app-web-1", project: "app", service: "web", cpuPct: 2, memBytes: 100 * 1024 ** 2, memLimitBytes: 1024 ** 3 }]);

  files["/proc/stat"] = STAT_2;
  files["/proc/net/dev"] = "h\nh\n  eth0: 4000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n";
  clock = new Date("2026-10-12T12:00:30Z");
  const second = await sampler.sample();
  assert.equal(second.cpuPct, 45);
  assert.equal(second.netRxBps, 100);
  assert.equal(second.netTxBps, 50);

  for (const [bin] of calls) assert.ok(isAllowedBinary(bin));
  const distinct = [...new Set(calls.map((c) => JSON.stringify(c)))].map((c) => JSON.parse(c));
  assert.deepEqual(distinct, [["docker", ...DOCKER_STATS_ARGS], ["docker", ...DOCKER_PS_ARGS], ["docker", ...DOCKER_ROOT_ARGS]]);
  assert.deepEqual(DOCKER_STATS_ARGS, ["stats", "--no-stream", "--format", "json"]);
  assert.equal(calls.filter((c) => c[1] === "info").length, 1, "Docker's data root is looked up once, not every sample");
});

test("a sampler without docker or /proc still produces a sample", async () => {
  const runner = async () => {
    throw new Error("spawn docker ENOENT");
  };
  const sampler = new MetricsSampler({
    runner,
    readFile: () => {
      throw new Error("ENOENT");
    },
    disk: () => null,
    loadavg: () => [0, 0, 0],
    now: () => new Date("2026-10-12T12:00:00Z"),
  });
  const s = await sampler.sample();
  assert.deepEqual(s.containers, []);
  assert.equal(s.memTotalBytes, null);
  assert.equal(s.diskDockerTotalBytes, null);
  assert.equal(s.load1, 0);
});

test("the buffer sends in batches, keeps samples after a network error, drops refused batches and caps its size", async () => {
  const mk = (i) => ({ at: new Date(Date.UTC(2026, 9, 12, 12, 0, i)).toISOString(), cpuPct: i, containers: [] });
  const buffer = new MetricsBuffer();
  for (let i = 0; i < MAX_BUFFERED + 5; i++) buffer.push(mk(i));
  assert.equal(buffer.samples.length, MAX_BUFFERED);
  assert.equal(buffer.samples[0].cpuPct, 5, "the oldest are dropped first");

  const batches = [];
  let mode = "down";
  const client = {
    sendMetrics: async (samples) => {
      if (mode === "down") throw new TypeError("fetch failed");
      if (mode === "refuse-first" && batches.length === 0) {
        batches.push("refused");
        throw new HttpError(400, "Invalid request body");
      }
      batches.push(samples.length);
    },
  };
  await assert.rejects(buffer.flush(client), /fetch failed/);
  assert.equal(buffer.samples.length, MAX_BUFFERED, "kept for the next try");

  mode = "refuse-first";
  const sent = await buffer.flush(client);
  assert.equal(batches[0], "refused");
  assert.ok(batches.slice(1).every((n) => n <= BATCH_SIZE));
  assert.equal(sent, MAX_BUFFERED - BATCH_SIZE);
  assert.equal(buffer.samples.length, 0);

  // 401 (token revoked) and 5xx are not the batch's fault: kept.
  buffer.push(mk(1));
  await assert.rejects(buffer.flush({ sendMetrics: async () => { throw new HttpError(401, "Invalid agent token"); } }));
  await assert.rejects(buffer.flush({ sendMetrics: async () => { throw new HttpError(503, "Unavailable"); } }));
  assert.equal(buffer.samples.length, 1);
});
