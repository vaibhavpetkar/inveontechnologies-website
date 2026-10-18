import { readFileSync, statfsSync } from "node:fs";
import { loadavg } from "node:os";
import { isAbsolute } from "node:path";
import { HttpError } from "./client.js";
import type { Runner } from "./exec.js";

/**
 * Host metrics, sampled every 30 seconds and sent to the control plane in
 * small batches: CPU, load, memory, disk (/ and Docker's data root),
 * network and per-container CPU and memory. Everything is read from /proc,
 * statfs and three fixed docker commands (`docker stats --no-stream`,
 * `docker ps` and `docker info`), never through a shell.
 */

export const SAMPLE_INTERVAL_MS = 30_000;
/** At most an hour of samples waits for the control plane (it refuses older ones anyway). */
export const MAX_BUFFERED = 120;
/** Samples per request. */
export const BATCH_SIZE = 20;
export const MAX_CONTAINERS = 100;

export const DOCKER_STATS_ARGS = ["stats", "--no-stream", "--format", "json"];
export const DOCKER_PS_ARGS = ["ps", "--format", "json"];
export const DOCKER_ROOT_ARGS = ["info", "--format", "{{.DockerRootDir}}"];

export interface ContainerSample {
  name: string;
  project: string | null;
  service: string | null;
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
}

export interface MetricSample {
  at: string;
  cpuPct: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  diskRootUsedBytes: number | null;
  diskRootTotalBytes: number | null;
  diskDockerUsedBytes: number | null;
  diskDockerTotalBytes: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
  containers: ContainerSample[];
}

// ---------------------------------------------------------------- parsers (pure)

export interface CpuTimes {
  idle: number;
  total: number;
}

/**
 * The aggregate `cpu` line of /proc/stat. guest and guest_nice are already
 * counted in user and nice, so they are left out of the total.
 */
export function parseProcStat(text: string): CpuTimes | null {
  const line = text.split("\n").find((l) => /^cpu\s/.test(l));
  if (!line) return null;
  const v = line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (v.length < 4 || v.some((n) => !Number.isFinite(n))) return null;
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = v;
  return { idle: idle + iowait, total: user + nice + system + idle + iowait + irq + softirq + steal };
}

/** Busy share of the time between two readings, in percent; null for the first reading or a counter reset. */
export function cpuPercent(prev: CpuTimes | null, cur: CpuTimes | null): number | null {
  if (!prev || !cur) return null;
  const total = cur.total - prev.total;
  const idle = cur.idle - prev.idle;
  if (total <= 0 || idle < 0) return null;
  return round2(Math.min(100, Math.max(0, ((total - idle) / total) * 100)));
}

/** MemTotal and MemAvailable from /proc/meminfo, in bytes. Used = total - available, like `free`. */
export function parseMeminfo(text: string): { totalBytes: number; usedBytes: number } | null {
  const kb = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, "m"));
    return m ? Number(m[1]) * 1024 : null;
  };
  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  if (total === null || available === null) return null;
  return { totalBytes: total, usedBytes: Math.max(0, total - available) };
}

/** Interfaces that only carry traffic inside the host (loopback, Docker and VM bridges, veth pairs). */
const VIRTUAL_IF = /^(lo|docker\d*|br-[0-9a-f]+|veth.*|virbr.*|vnet.*|cni.*|flannel.*|cali.*|tun.*|tap.*|wg.*)$/;

export interface NetCounters {
  rx: number;
  tx: number;
}

/** Received and sent byte counters summed over the physical interfaces in /proc/net/dev. */
export function parseNetDev(text: string): NetCounters | null {
  let rx = 0;
  let tx = 0;
  let found = false;
  for (const line of text.split("\n").slice(2)) {
    const m = line.match(/^\s*([^:\s]+):\s*(.*)$/);
    if (!m || VIRTUAL_IF.test(m[1])) continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    if (f.length < 9 || !Number.isFinite(f[0]) || !Number.isFinite(f[8])) continue;
    rx += f[0];
    tx += f[8];
    found = true;
  }
  return found ? { rx, tx } : null;
}

/** Bytes per second between two counter readings; null across a counter reset. */
export function netRates(prev: NetCounters | null, cur: NetCounters | null, seconds: number): { rx: number | null; tx: number | null } {
  if (!prev || !cur || seconds <= 0) return { rx: null, tx: null };
  const rate = (a: number, b: number) => (b >= a ? round2((b - a) / seconds) : null);
  return { rx: rate(prev.rx, cur.rx), tx: rate(prev.tx, cur.tx) };
}

const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

/** "12.5MiB", "1.944GiB", "980kB", "0B" (as docker stats prints them) to bytes. */
export function parseSize(text: string): number | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?i?B)$/i);
  if (!m) return null;
  const unit = UNITS[m[2].toLowerCase()];
  return unit === undefined ? null : Math.round(Number(m[1]) * unit);
}

const CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const LABEL_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** One JSON object per line from `docker stats --no-stream --format json`. Unparseable lines are skipped. */
export function parseDockerStats(stdout: string): Omit<ContainerSample, "project" | "service">[] {
  const out: Omit<ContainerSample, "project" | "service">[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = typeof row.Name === "string" ? row.Name.replace(/^\//, "") : "";
    if (!CONTAINER_NAME.test(name)) continue;
    const cpu = typeof row.CPUPerc === "string" ? Number(row.CPUPerc.replace("%", "")) : NaN;
    const [used, limit] = typeof row.MemUsage === "string" ? row.MemUsage.split("/").map((s) => parseSize(s)) : [null, null];
    out.push({ name, cpuPct: Number.isFinite(cpu) && cpu >= 0 ? round2(Math.min(cpu, 100 * 1024)) : null, memBytes: used ?? null, memLimitBytes: limit ?? null });
  }
  return out;
}

/** Compose project and service of each running container, by name, from `docker ps --format json`. */
export function parseDockerPs(stdout: string): Map<string, { project: string | null; service: string | null }> {
  const out = new Map<string, { project: string | null; service: string | null }>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof row.Names !== "string") continue;
    const labels = new Map<string, string>();
    for (const pair of typeof row.Labels === "string" ? row.Labels.split(",") : []) {
      const i = pair.indexOf("=");
      if (i > 0) labels.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const label = (k: string) => {
      const v = labels.get(k);
      return v && LABEL_VALUE.test(v) ? v : null;
    };
    for (const name of row.Names.split(",")) out.set(name.replace(/^\//, ""), { project: label("com.docker.compose.project"), service: label("com.docker.compose.service") });
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- sampling

export interface SamplerDeps {
  runner: Runner;
  readFile?: (path: string) => string;
  /** used and total bytes of the file system holding path. */
  disk?: (path: string) => { usedBytes: number; totalBytes: number } | null;
  loadavg?: () => number[];
  now?: () => Date;
}

const defaultDisk = (path: string) => {
  try {
    const s = statfsSync(path);
    return { usedBytes: (s.blocks - s.bfree) * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
};

/**
 * Keeps the previous CPU and network counters so each sample reports the
 * rates since the last one. Docker's data root is looked up once an hour.
 * A failing source leaves its fields empty; it never stops the sample.
 */
export class MetricsSampler {
  private prevCpu: CpuTimes | null = null;
  private prevNet: { at: number; counters: NetCounters } | null = null;
  private dockerRoot: { path: string | null; checkedAt: number } | null = null;
  private readonly readFile: (path: string) => string;
  private readonly disk: (path: string) => { usedBytes: number; totalBytes: number } | null;
  private readonly loadavg: () => number[];
  private readonly now: () => Date;

  constructor(private readonly deps: SamplerDeps) {
    this.readFile = deps.readFile ?? ((p) => readFileSync(p, "utf8"));
    this.disk = deps.disk ?? defaultDisk;
    this.loadavg = deps.loadavg ?? loadavg;
    this.now = deps.now ?? (() => new Date());
  }

  private read(path: string) {
    try {
      return this.readFile(path);
    } catch {
      return null;
    }
  }

  private async docker(args: string[], timeoutMs = 20_000) {
    try {
      const r = await this.deps.runner("docker", args, { captureStdout: true, timeoutMs }, () => undefined);
      return r.code === 0 ? r.stdout : null;
    } catch {
      return null;
    }
  }

  private async dockerRootDir(nowMs: number) {
    if (!this.dockerRoot || nowMs - this.dockerRoot.checkedAt > 3600_000) {
      const out = (await this.docker(DOCKER_ROOT_ARGS, 10_000))?.trim() ?? "";
      this.dockerRoot = { path: isAbsolute(out) && !out.includes("\n") ? out : null, checkedAt: nowMs };
    }
    return this.dockerRoot.path;
  }

  async containers(): Promise<ContainerSample[]> {
    const stats = await this.docker(DOCKER_STATS_ARGS);
    if (stats === null) return [];
    const labels = parseDockerPs((await this.docker(DOCKER_PS_ARGS)) ?? "");
    return parseDockerStats(stats)
      .slice(0, MAX_CONTAINERS)
      .map((c) => ({ ...c, project: labels.get(c.name)?.project ?? null, service: labels.get(c.name)?.service ?? null }));
  }

  async sample(): Promise<MetricSample> {
    const containers = await this.containers();
    // Timed after docker stats (which takes a couple of seconds), so the counters line up with the timestamp.
    const at = this.now();
    const ms = at.getTime();

    const cpu = parseProcStat(this.read("/proc/stat") ?? "");
    const cpuPct = cpuPercent(this.prevCpu, cpu);
    this.prevCpu = cpu;

    const mem = parseMeminfo(this.read("/proc/meminfo") ?? "");

    const counters = parseNetDev(this.read("/proc/net/dev") ?? "");
    const net = this.prevNet && counters ? netRates(this.prevNet.counters, counters, (ms - this.prevNet.at) / 1000) : { rx: null, tx: null };
    this.prevNet = counters ? { at: ms, counters } : null;

    const [l1, l5, l15] = this.loadavg();
    const root = this.disk("/");
    const dockerDir = await this.dockerRootDir(ms);
    const dockerDisk = dockerDir ? this.disk(dockerDir) : null;

    const finite = (n: number | undefined) => (n !== undefined && Number.isFinite(n) && n >= 0 ? round2(n) : null);
    return {
      at: at.toISOString(),
      cpuPct,
      load1: finite(l1),
      load5: finite(l5),
      load15: finite(l15),
      memUsedBytes: mem?.usedBytes ?? null,
      memTotalBytes: mem?.totalBytes ?? null,
      diskRootUsedBytes: root?.usedBytes ?? null,
      diskRootTotalBytes: root?.totalBytes ?? null,
      diskDockerUsedBytes: dockerDisk?.usedBytes ?? null,
      diskDockerTotalBytes: dockerDisk?.totalBytes ?? null,
      netRxBps: net.rx,
      netTxBps: net.tx,
      containers,
    };
  }
}

// ---------------------------------------------------------------- sending

export interface MetricsClient {
  sendMetrics(samples: MetricSample[]): Promise<unknown>;
}

/**
 * Samples waiting to be sent, oldest first, capped at MAX_BUFFERED (the
 * oldest are dropped). flush() sends them in batches: a batch the control
 * plane refuses (4xx) is dropped so it can't block the rest; anything else
 * (network, 5xx) stays for the next try.
 */
export class MetricsBuffer {
  readonly samples: MetricSample[] = [];

  push(sample: MetricSample) {
    this.samples.push(sample);
    if (this.samples.length > MAX_BUFFERED) this.samples.splice(0, this.samples.length - MAX_BUFFERED);
  }

  async flush(client: MetricsClient) {
    let sent = 0;
    while (this.samples.length) {
      const batch = this.samples.slice(0, BATCH_SIZE);
      try {
        await client.sendMetrics(batch);
      } catch (err) {
        if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
          this.samples.splice(0, batch.length);
          continue;
        }
        throw err;
      }
      this.samples.splice(0, batch.length);
      sent += batch.length;
    }
    return sent;
  }
}
