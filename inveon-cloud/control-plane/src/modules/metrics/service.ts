import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { serverMetrics, type ContainerSample } from "../../db/schema.js";

/**
 * Server metrics, in-house instead of a Prometheus/Grafana/Loki stack. The
 * agent samples its host every 30 seconds and sends the samples in small
 * batches. Raw rows are kept 24 hours; the daily run folds older ones into
 * 5-minute rollups, which are kept 30 days. Charts read both and bucket
 * them to the range shown.
 */

export const SAMPLE_INTERVAL_SEC = 30;
/** Per request: an agent that was cut off for a while sends its buffer in pieces. */
export const MAX_SAMPLES_PER_BATCH = 120;
export const MAX_CONTAINERS_PER_SAMPLE = 100;
/** Samples older than this (or more than 5 minutes ahead) are skipped, so a rolled-up bucket never gets late rows. */
export const MAX_SAMPLE_AGE_SEC = 3600;
export const MAX_SAMPLE_SKEW_SEC = 300;
export const RAW_RETENTION_HOURS = 24;
export const ROLLUP_RETENTION_DAYS = 30;
export const ROLLUP_BUCKET_SEC = 300;

const pct = z.number().finite().min(0).max(100);
const bytes = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rate = z.number().finite().min(0).max(1e13);
const load = z.number().finite().min(0).max(1e5);
const label = z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

const containerSchema = z
  .object({
    name: label,
    project: label.nullable().optional(),
    service: label.nullable().optional(),
    // docker stats reports percent of one CPU: 400% on a busy 4-core host.
    cpuPct: z.number().finite().min(0).max(100 * 1024).nullable(),
    memBytes: bytes.nullable(),
    memLimitBytes: bytes.nullable(),
  })
  .strict();

/**
 * One sample as the agent sends it. Strict: there is no server id to set,
 * the server is always the one the agent token belongs to.
 */
export const sampleSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    cpuPct: pct.nullable().default(null),
    load1: load.nullable().default(null),
    load5: load.nullable().default(null),
    load15: load.nullable().default(null),
    memUsedBytes: bytes.nullable().default(null),
    memTotalBytes: bytes.nullable().default(null),
    diskRootUsedBytes: bytes.nullable().default(null),
    diskRootTotalBytes: bytes.nullable().default(null),
    diskDockerUsedBytes: bytes.nullable().default(null),
    diskDockerTotalBytes: bytes.nullable().default(null),
    netRxBps: rate.nullable().default(null),
    netTxBps: rate.nullable().default(null),
    containers: z.array(containerSchema).max(MAX_CONTAINERS_PER_SAMPLE).default([]),
  })
  .strict();

export const batchSchema = z.object({ samples: z.array(sampleSchema).min(1).max(MAX_SAMPLES_PER_BATCH) }).strict();
export type MetricSample = z.infer<typeof sampleSchema>;

/**
 * Stores a batch for one server. Samples outside the accepted time window
 * are skipped (not an error: a wrong clock shouldn't make the agent retry
 * forever); a sample already stored for that second is ignored.
 */
export async function ingestSamples(db: Database, serverId: string, samples: MetricSample[], now = new Date()) {
  const oldest = now.getTime() - MAX_SAMPLE_AGE_SEC * 1000;
  const newest = now.getTime() + MAX_SAMPLE_SKEW_SEC * 1000;
  const rows = samples
    .map((s) => ({ ...s, at: new Date(s.at) }))
    .filter((s) => s.at.getTime() >= oldest && s.at.getTime() <= newest)
    .map((s) => ({ ...s, serverId, containers: s.containers as ContainerSample[] }));
  let stored = 0;
  if (rows.length) {
    const inserted = await db.insert(serverMetrics).values(rows).onConflictDoNothing().returning({ at: serverMetrics.at });
    stored = inserted.length;
  }
  return { stored, skipped: samples.length - rows.length, duplicates: rows.length - stored };
}

// ---------------------------------------------------------------- rollups and retention

const floorTo = (ms: number, stepSec: number) => Math.floor(ms / (stepSec * 1000)) * stepSec * 1000;

/**
 * Daily: raw samples older than 24 hours (to the 5-minute boundary) become
 * 5-minute rollups and are deleted, in one transaction; rollups older than
 * 30 days are deleted. Late samples can't land in a rolled-up bucket because
 * ingestion only accepts samples up to an hour old.
 */
export async function rollupMetrics(db: Database, now = new Date()) {
  const cutoff = new Date(floorTo(now.getTime() - RAW_RETENTION_HOURS * 3600_000, ROLLUP_BUCKET_SEC));
  const expire = new Date(now.getTime() - ROLLUP_RETENTION_DAYS * 86400_000);
  return db.transaction(async (tx) => {
    const rolled = await tx.execute(sql`
      WITH src AS (
        SELECT *, date_bin(make_interval(secs => ${ROLLUP_BUCKET_SEC}), at, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket
        FROM server_metrics WHERE at < ${cutoff}
      ),
      host AS (
        SELECT server_id, bucket, count(*)::int AS samples,
          avg(cpu_pct) AS cpu_pct, max(cpu_pct) AS cpu_pct_max,
          avg(load1) AS load1, avg(load5) AS load5, avg(load15) AS load15,
          round(avg(mem_used_bytes))::bigint AS mem_used_bytes, max(mem_used_bytes) AS mem_used_bytes_max, max(mem_total_bytes) AS mem_total_bytes,
          round(avg(disk_root_used_bytes))::bigint AS disk_root_used_bytes, max(disk_root_total_bytes) AS disk_root_total_bytes,
          round(avg(disk_docker_used_bytes))::bigint AS disk_docker_used_bytes, max(disk_docker_total_bytes) AS disk_docker_total_bytes,
          avg(net_rx_bps) AS net_rx_bps, avg(net_tx_bps) AS net_tx_bps
        FROM src GROUP BY server_id, bucket
      ),
      per_container AS (
        SELECT server_id, bucket, e->>'name' AS name, max(e->>'project') AS project, max(e->>'service') AS service,
          avg((e->>'cpuPct')::float8) AS cpu, max((e->>'cpuPct')::float8) AS cpu_max,
          avg((e->>'memBytes')::float8) AS mem, max((e->>'memBytes')::float8) AS mem_max, max((e->>'memLimitBytes')::float8) AS mem_limit
        FROM src, jsonb_array_elements(src.containers) AS e GROUP BY server_id, bucket, e->>'name'
      ),
      containers AS (
        SELECT server_id, bucket, jsonb_agg(jsonb_build_object(
          'name', name, 'project', project, 'service', service,
          'cpuPct', round(cpu::numeric, 2), 'cpuPctMax', round(cpu_max::numeric, 2),
          'memBytes', round(mem), 'memBytesMax', round(mem_max), 'memLimitBytes', round(mem_limit)) ORDER BY name) AS containers
        FROM per_container GROUP BY server_id, bucket
      )
      INSERT INTO server_metric_rollups (server_id, bucket, samples, cpu_pct, cpu_pct_max, load1, load5, load15, mem_used_bytes, mem_used_bytes_max, mem_total_bytes,
        disk_root_used_bytes, disk_root_total_bytes, disk_docker_used_bytes, disk_docker_total_bytes, net_rx_bps, net_tx_bps, containers)
      SELECT h.server_id, h.bucket, h.samples, h.cpu_pct, h.cpu_pct_max, h.load1, h.load5, h.load15, h.mem_used_bytes, h.mem_used_bytes_max, h.mem_total_bytes,
        h.disk_root_used_bytes, h.disk_root_total_bytes, h.disk_docker_used_bytes, h.disk_docker_total_bytes, h.net_rx_bps, h.net_tx_bps, coalesce(c.containers, '[]'::jsonb)
      FROM host h LEFT JOIN containers c ON c.server_id = h.server_id AND c.bucket = h.bucket
      ON CONFLICT (server_id, bucket) DO NOTHING
      RETURNING server_id`);
    const deletedRaw = await tx.execute(sql`DELETE FROM server_metrics WHERE at < ${cutoff}`);
    const expired = await tx.execute(sql`DELETE FROM server_metric_rollups WHERE bucket < ${expire}`);
    return { rollups: rolled.rows.length, rawDeleted: deletedRaw.rowCount ?? 0, rollupsDeleted: expired.rowCount ?? 0, cutoff };
  });
}

// ---------------------------------------------------------------- reading

/** Chart ranges and the bucket each one is drawn with (about 120 to 360 points). */
export const RANGES = {
  "1h": { seconds: 3600, stepSec: 30 },
  "24h": { seconds: 86400, stepSec: 300 },
  "7d": { seconds: 7 * 86400, stepSec: 1800 },
  "30d": { seconds: 30 * 86400, stepSec: 7200 },
} as const;
export type RangeName = keyof typeof RANGES;
export const rangeSchema = z.enum(Object.keys(RANGES) as [RangeName, ...RangeName[]]).default("1h");

export interface MetricPoint {
  t: string;
  cpuPct: number | null;
  cpuPctMax: number | null;
  load1: number | null;
  memUsedBytes: number | null;
  memUsedBytesMax: number | null;
  memTotalBytes: number | null;
  diskRootUsedBytes: number | null;
  diskRootTotalBytes: number | null;
  diskDockerUsedBytes: number | null;
  diskDockerTotalBytes: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
}

export interface ContainerSummary {
  name: string;
  project: string | null;
  service: string | null;
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
  cpuPctAvg: number | null;
  cpuPctMax: number | null;
  memBytesMax: number | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();

/**
 * Raw samples and rollups in one weighted stream: a raw row weighs 1, a
 * rollup weighs its sample count. The two never overlap, because raw rows
 * are deleted in the same transaction that rolls them up.
 */
function sourceRows(serverIds: string[], since: Date, until: Date) {
  const ids = sql.param(serverIds);
  return sql`
    SELECT server_id, at AS t, 1 AS w, cpu_pct, cpu_pct AS cpu_pct_max, load1, mem_used_bytes, mem_used_bytes AS mem_used_bytes_max, mem_total_bytes,
      disk_root_used_bytes, disk_root_total_bytes, disk_docker_used_bytes, disk_docker_total_bytes, net_rx_bps, net_tx_bps, containers
    FROM server_metrics WHERE server_id = ANY(${ids}::uuid[]) AND at > ${since} AND at <= ${until}
    UNION ALL
    SELECT server_id, bucket, samples, cpu_pct, cpu_pct_max, load1, mem_used_bytes, mem_used_bytes_max, mem_total_bytes,
      disk_root_used_bytes, disk_root_total_bytes, disk_docker_used_bytes, disk_docker_total_bytes, net_rx_bps, net_tx_bps, containers
    FROM server_metric_rollups WHERE server_id = ANY(${ids}::uuid[]) AND bucket > ${since} AND bucket <= ${until}`;
}

const wavg = (col: string) => sql.raw(`(sum(${col}::float8 * w) / nullif(sum(CASE WHEN ${col} IS NOT NULL THEN w END), 0))`);

/** Host series for one server, bucketed to the range's step. */
export async function serverSeries(db: Database, serverId: string, range: RangeName, now = new Date()) {
  const { seconds, stepSec } = RANGES[range];
  const since = new Date(now.getTime() - seconds * 1000);
  const result = await db.execute(sql`
    WITH src AS (${sourceRows([serverId], since, now)})
    SELECT date_bin(make_interval(secs => ${stepSec}), t, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS b,
      ${wavg("cpu_pct")} AS cpu_pct, max(cpu_pct_max)::float8 AS cpu_pct_max, ${wavg("load1")} AS load1,
      ${wavg("mem_used_bytes")} AS mem_used_bytes, max(mem_used_bytes_max)::float8 AS mem_used_bytes_max, max(mem_total_bytes)::float8 AS mem_total_bytes,
      ${wavg("disk_root_used_bytes")} AS disk_root_used_bytes, max(disk_root_total_bytes)::float8 AS disk_root_total_bytes,
      ${wavg("disk_docker_used_bytes")} AS disk_docker_used_bytes, max(disk_docker_total_bytes)::float8 AS disk_docker_total_bytes,
      ${wavg("net_rx_bps")} AS net_rx_bps, ${wavg("net_tx_bps")} AS net_tx_bps
    FROM src GROUP BY b ORDER BY b`);
  const points: MetricPoint[] = (result.rows as Record<string, unknown>[]).map((r) => ({
    t: iso(r.b),
    cpuPct: num(r.cpu_pct),
    cpuPctMax: num(r.cpu_pct_max),
    load1: num(r.load1),
    memUsedBytes: num(r.mem_used_bytes),
    memUsedBytesMax: num(r.mem_used_bytes_max),
    memTotalBytes: num(r.mem_total_bytes),
    diskRootUsedBytes: num(r.disk_root_used_bytes),
    diskRootTotalBytes: num(r.disk_root_total_bytes),
    diskDockerUsedBytes: num(r.disk_docker_used_bytes),
    diskDockerTotalBytes: num(r.disk_docker_total_bytes),
    netRxBps: num(r.net_rx_bps),
    netTxBps: num(r.net_tx_bps),
  }));
  return { range, stepSec, since: since.toISOString(), until: now.toISOString(), points };
}

/**
 * Per-container table: the latest values (from the newest sample within 10
 * minutes) next to the range's average and peak. projects limits it to
 * those compose projects (an environment's containers).
 */
export async function containerSummary(db: Database, serverId: string, range: RangeName, now = new Date(), projects?: string[]) {
  const since = new Date(now.getTime() - RANGES[range].seconds * 1000);
  const filter = projects ? sql`WHERE e->>'project' = ANY(${sql.param(projects)}::text[])` : sql``;
  const stats = await db.execute(sql`
    WITH src AS (${sourceRows([serverId], since, now)}),
    el AS (SELECT w, e FROM src, jsonb_array_elements(src.containers) AS e ${filter})
    SELECT e->>'name' AS name,
      sum((e->>'cpuPct')::float8 * w) / nullif(sum(CASE WHEN e->>'cpuPct' IS NOT NULL THEN w END), 0) AS cpu_avg,
      max(coalesce(e->>'cpuPctMax', e->>'cpuPct')::float8) AS cpu_max,
      max(coalesce(e->>'memBytesMax', e->>'memBytes')::float8) AS mem_max
    FROM el GROUP BY 1`);
  const latestRow = await db.execute(sql`
    SELECT at, containers FROM server_metrics WHERE server_id = ${serverId} AND at <= ${now} AND at > ${new Date(now.getTime() - 600_000)}
    ORDER BY at DESC LIMIT 1`);
  const latest = (latestRow.rows[0] as { at: Date; containers: ContainerSample[] } | undefined) ?? null;
  const byName = new Map<string, ContainerSummary>();
  for (const c of latest?.containers ?? []) {
    if (projects && !projects.includes(c.project ?? "")) continue;
    byName.set(c.name, { name: c.name, project: c.project ?? null, service: c.service ?? null, cpuPct: c.cpuPct, memBytes: c.memBytes, memLimitBytes: c.memLimitBytes, cpuPctAvg: null, cpuPctMax: null, memBytesMax: null });
  }
  for (const r of stats.rows as { name: string; cpu_avg: unknown; cpu_max: unknown; mem_max: unknown }[]) {
    const row = byName.get(r.name);
    // Containers that ran during the range but are gone now are not listed.
    if (!row) continue;
    row.cpuPctAvg = num(r.cpu_avg);
    row.cpuPctMax = num(r.cpu_max);
    row.memBytesMax = num(r.mem_max);
  }
  return { latestAt: latest ? iso(latest.at) : null, containers: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Summed CPU and memory of some compose projects' containers over time (the app page's view). */
export async function projectSeries(db: Database, serverId: string, projects: string[], range: RangeName, now = new Date()) {
  const { seconds, stepSec } = RANGES[range];
  const since = new Date(now.getTime() - seconds * 1000);
  const result = await db.execute(sql`
    WITH src AS (${sourceRows([serverId], since, now)}),
    per_t AS (
      SELECT t, w, sum((e->>'cpuPct')::float8) AS cpu, sum((e->>'memBytes')::float8) AS mem
      FROM src, jsonb_array_elements(src.containers) AS e
      WHERE e->>'project' = ANY(${sql.param(projects)}::text[]) GROUP BY t, w
    )
    SELECT date_bin(make_interval(secs => ${stepSec}), t, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS b,
      sum(cpu * w) / nullif(sum(w), 0) AS cpu_pct, sum(mem * w) / nullif(sum(w), 0) AS mem_bytes
    FROM per_t GROUP BY b ORDER BY b`);
  return {
    range,
    stepSec,
    since: since.toISOString(),
    until: now.toISOString(),
    points: (result.rows as Record<string, unknown>[]).map((r) => ({ t: iso(r.b), cpuPct: num(r.cpu_pct), memBytes: num(r.mem_bytes) })),
  };
}

export type LatestSample = typeof serverMetrics.$inferSelect;

/** The newest sample per server within the last hour. */
export async function latestSamples(db: Database, serverIds: string[], now = new Date()) {
  if (!serverIds.length) return new Map<string, LatestSample>();
  const rows = await db
    .selectDistinctOn([serverMetrics.serverId])
    .from(serverMetrics)
    .where(sql`${serverMetrics.serverId} = ANY(${sql.param(serverIds)}::uuid[]) AND ${serverMetrics.at} > ${new Date(now.getTime() - 3600_000)} AND ${serverMetrics.at} <= ${new Date(now.getTime() + MAX_SAMPLE_SKEW_SEC * 1000)}`)
    .orderBy(serverMetrics.serverId, sql`${serverMetrics.at} DESC`);
  return new Map(rows.map((r) => [r.serverId, r]));
}

/** An environment's compose projects: one per colour, or the slug itself for recreate. */
export const environmentProjects = (slug: string) => [slug, `${slug}-blue`, `${slug}-green`];

export const percentOf = (used: number | null | undefined, total: number | null | undefined) => (used === null || used === undefined || !total ? null : Math.min(100, (used / total) * 100));
