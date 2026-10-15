// Monitoring: agent metric batches (own server only, validated, capped),
// charts and container tables, the daily rollup and retention, threshold
// alerts (one when it starts, one when it clears), and the Prometheus
// export with its per-organization scrape token. Time-dependent parts run
// with a fixed clock and fixed sample timestamps.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startServer, MASTER_KEY } from "./helpers.mjs";
import { createDb } from "../dist/db/client.js";
import { configureMasterKey } from "../dist/lib/crypto.js";
import { configureOutbound } from "../dist/lib/outbound.js";
import { configureAlerts } from "../dist/modules/alerts/service.js";
import { rollupMetrics, serverSeries, containerSummary, MAX_SAMPLES_PER_BATCH } from "../dist/modules/metrics/service.js";
import { evaluateMetricAlerts, evaluateThreshold, evaluateOffline, effectiveRules, metricValue } from "../dist/modules/metrics/alerts.js";
import { escapeLabel, prometheusText, renderExposition } from "../dist/modules/metrics/prometheus.js";

let api;
let local;
before(async () => {
  api = await startServer();
  configureMasterKey(MASTER_KEY);
  configureOutbound("127.0.0.1");
  configureAlerts("https://cloud.test");
  local = createDb(process.env.TEST_DATABASE_URL);
});
after(async () => {
  await api?.stop();
  await local?.pool.end();
});

const NOW = new Date("2026-10-12T12:00:00Z");
const ago = (sec, from = NOW) => new Date(from.getTime() - sec * 1000);
const GB = 1024 ** 3;

const sample = (at, extra = {}) => ({
  at: at.toISOString(),
  cpuPct: 12.5,
  load1: 0.4,
  load5: 0.3,
  load15: 0.2,
  memUsedBytes: 2 * GB,
  memTotalBytes: 8 * GB,
  diskRootUsedBytes: 20 * GB,
  diskRootTotalBytes: 100 * GB,
  diskDockerUsedBytes: 20 * GB,
  diskDockerTotalBytes: 100 * GB,
  netRxBps: 1500,
  netTxBps: 700,
  containers: [],
  ...extra,
});

/** Inserts a raw sample straight into the table (for fixed timestamps the API would refuse as too old). */
async function insertSample(serverId, at, extra = {}) {
  const s = sample(at, extra);
  await api.pool.query(
    `INSERT INTO server_metrics (server_id, at, cpu_pct, load1, load5, load15, mem_used_bytes, mem_total_bytes, disk_root_used_bytes, disk_root_total_bytes,
       disk_docker_used_bytes, disk_docker_total_bytes, net_rx_bps, net_tx_bps, containers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [serverId, at, s.cpuPct, s.load1, s.load5, s.load15, s.memUsedBytes, s.memTotalBytes, s.diskRootUsedBytes, s.diskRootTotalBytes, s.diskDockerUsedBytes, s.diskDockerTotalBytes, s.netRxBps, s.netTxBps, JSON.stringify(s.containers)],
  );
}

test("agents send metric batches for their own server only; input is validated and capped", async () => {
  const { orgId, owner } = await api.createOrg();
  const a = await api.registerServer(orgId, owner);
  const b = await api.registerServer(orgId, owner);

  const hb = await api.call("POST", "/agent/heartbeat", { token: a.agentToken, body: { facts: {} } });
  assert.ok(hb.json.features.includes("metrics"), "the heartbeat says metrics are accepted");

  assert.equal((await api.call("POST", "/agent/metrics", { body: { samples: [sample(new Date())] } })).status, 401);
  assert.equal((await api.call("POST", "/agent/metrics", { token: "nope", body: { samples: [sample(new Date())] } })).status, 401);

  const now = Date.now();
  const at1 = new Date(now - 60_000);
  const at2 = new Date(now - 30_000);
  const containers = [{ name: "site-x-blue-web-1", project: "site-x-blue", service: "web", cpuPct: 3.5, memBytes: 50e6, memLimitBytes: 1e9 }];
  const ok = await api.call("POST", "/agent/metrics", { token: a.agentToken, body: { samples: [sample(at1, { containers }), sample(at2, { cpuPct: 40 })] } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { stored: 2, skipped: 0, duplicates: 0 });

  // A re-sent batch is ignored; too old or future samples are skipped, not stored.
  const again = await api.call("POST", "/agent/metrics", { token: a.agentToken, body: { samples: [sample(at2), sample(new Date(now - 2 * 3600_000)), sample(new Date(now + 3600_000))] } });
  assert.deepEqual(again.json, { stored: 0, skipped: 2, duplicates: 1 });

  // There is no way to name another server: unknown fields are refused.
  const spoof = await api.call("POST", "/agent/metrics", { token: a.agentToken, body: { serverId: b.serverId, samples: [sample(new Date())] } });
  assert.equal(spoof.status, 400);
  const spoof2 = await api.call("POST", "/agent/metrics", { token: a.agentToken, body: { samples: [{ ...sample(new Date()), serverId: b.serverId }] } });
  assert.equal(spoof2.status, 400);

  const bad = [
    { samples: [] },
    { samples: Array.from({ length: MAX_SAMPLES_PER_BATCH + 1 }, (_, i) => sample(new Date(now - i * 1000))) },
    { samples: [sample(new Date(), { cpuPct: 150 })] },
    { samples: [sample(new Date(), { memUsedBytes: -1 })] },
    { samples: [{ ...sample(new Date()), at: "yesterday" }] },
    { samples: [sample(new Date(), { containers: [{ name: "evil;rm -rf", cpuPct: 1, memBytes: 1, memLimitBytes: 1 }] })] },
    { samples: [sample(new Date(), { containers: Array.from({ length: 101 }, (_, i) => ({ name: `c${i}`, cpuPct: 1, memBytes: 1, memLimitBytes: 1 })) })] },
  ];
  for (const body of bad) assert.equal((await api.call("POST", "/agent/metrics", { token: a.agentToken, body })).status, 400, JSON.stringify(body).slice(0, 80));

  const rows = await api.pool.query("SELECT server_id, cpu_pct FROM server_metrics WHERE server_id = ANY($1) ORDER BY at", [[a.serverId, b.serverId]]);
  assert.deepEqual(rows.rows.map((r) => [r.server_id, r.cpu_pct]), [[a.serverId, 12.5], [a.serverId, 40]]);

  // The dashboard reads it back: series and the container table.
  const m = await api.call("GET", `/orgs/${orgId}/servers/${a.serverId}/metrics?range=1h`, { token: owner.token });
  assert.equal(m.status, 200);
  assert.equal(m.json.stepSec, 30);
  assert.equal(m.json.points.length, 2);
  assert.equal(m.json.points.at(-1).cpuPct, 40);
  assert.equal(m.json.points[0].memTotalBytes, 8 * GB);
  assert.equal(m.json.containers.length, 0, "the newest sample has no containers");
  assert.equal((await api.call("GET", `/orgs/${orgId}/servers/${a.serverId}/metrics?range=2y`, { token: owner.token })).status, 400);

  // Viewers can read; another organization can't.
  const viewer = await api.createUser({ orgId, role: "viewer" });
  assert.equal((await api.call("GET", `/orgs/${orgId}/servers/${a.serverId}/metrics?range=24h`, { token: viewer.token })).status, 200);
  const other = await api.createOrg();
  assert.equal((await api.call("GET", `/orgs/${other.orgId}/servers/${a.serverId}/metrics`, { token: other.owner.token })).status, 404);
});

test("an environment's resource view only shows its own compose projects", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const slug = ctx.environment.slug;
  const containers = [
    { name: `${slug}-blue-web-1`, project: `${slug}-blue`, service: "web", cpuPct: 10, memBytes: 100e6, memLimitBytes: 2e9 },
    { name: `${slug}-blue-worker-1`, project: `${slug}-blue`, service: "worker", cpuPct: 5, memBytes: 50e6, memLimitBytes: 2e9 },
    // Another environment whose slug merely starts the same way.
    { name: `${slug}-api-web-1`, project: `${slug}-api`, service: "web", cpuPct: 90, memBytes: 900e6, memLimitBytes: 2e9 },
  ];
  const r = await api.call("POST", "/agent/metrics", { token: srv.agentToken, body: { samples: [sample(new Date(Date.now() - 5000), { containers })] } });
  assert.equal(r.json.stored, 1);
  const res = await api.call("GET", `/orgs/${orgId}/environments/${ctx.environment.id}/resources?range=1h`, { token: owner.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.containers.map((c) => c.name), [`${slug}-blue-web-1`, `${slug}-blue-worker-1`]);
  assert.equal(res.json.containers[0].cpuPctAvg, 10);
  assert.equal(res.json.points.length, 1);
  assert.equal(res.json.points[0].cpuPct, 15);
  assert.equal(res.json.points[0].memBytes, 150e6);

  const server = await api.call("GET", `/orgs/${orgId}/servers/${srv.serverId}/metrics?range=1h`, { token: owner.token });
  assert.equal(server.json.containers.length, 3, "the server page lists every container");
});

test("daily rollup: raw older than 24 hours becomes 5-minute buckets, rollups keep 30 days", async () => {
  const { orgId, owner } = await api.createOrg();
  const { serverId } = await api.registerServer(orgId, owner);
  const bucketStart = new Date("2026-10-11T08:00:00Z"); // 28 hours before NOW
  const web = (cpu, mem) => [{ name: "web-1", project: "p", service: "web", cpuPct: cpu, memBytes: mem, memLimitBytes: 1e9 }];
  // Ten samples in one 5-minute bucket (CPU 10..55), and one in the next bucket.
  for (let i = 0; i < 10; i++) await insertSample(serverId, new Date(bucketStart.getTime() + i * 30_000), { cpuPct: 10 + i * 5, memUsedBytes: (2 + (i % 2)) * GB, containers: web(i, 1000 * (i + 1)) });
  await insertSample(serverId, new Date(bucketStart.getTime() + 300_000), { cpuPct: 80 });
  // Recent raw samples stay raw.
  await insertSample(serverId, ago(3600), { cpuPct: 33 });
  await insertSample(serverId, ago(23 * 3600), { cpuPct: 34 });
  // An old rollup from 31 days ago is dropped.
  await api.pool.query("INSERT INTO server_metric_rollups (server_id, bucket, samples, cpu_pct) VALUES ($1, $2, 10, 5)", [serverId, ago(31 * 86400)]);
  await api.pool.query("INSERT INTO server_metric_rollups (server_id, bucket, samples, cpu_pct) VALUES ($1, $2, 10, 6)", [serverId, ago(29 * 86400)]);

  const result = await rollupMetrics(local.db, NOW);
  assert.equal(result.cutoff.toISOString(), "2026-10-11T12:00:00.000Z");
  assert.ok(result.rollups >= 2 && result.rawDeleted >= 11);

  const rollups = (await api.pool.query("SELECT * FROM server_metric_rollups WHERE server_id = $1 ORDER BY bucket", [serverId])).rows;
  assert.deepEqual(rollups.map((r) => new Date(r.bucket).toISOString()), [ago(29 * 86400).toISOString(), "2026-10-11T08:00:00.000Z", "2026-10-11T08:05:00.000Z"]);
  const b = rollups[1];
  assert.equal(b.samples, 10);
  assert.equal(b.cpu_pct, 32.5);
  assert.equal(b.cpu_pct_max, 55);
  assert.equal(Number(b.mem_used_bytes), 2.5 * GB);
  assert.equal(Number(b.mem_used_bytes_max), 3 * GB);
  assert.equal(Number(b.mem_total_bytes), 8 * GB);
  assert.deepEqual(b.containers, [{ name: "web-1", project: "p", service: "web", cpuPct: 4.5, cpuPctMax: 9, memBytes: 5500, memBytesMax: 10000, memLimitBytes: 1e9 }]);
  assert.equal(rollups[2].samples, 1);

  const raw = (await api.pool.query("SELECT cpu_pct FROM server_metrics WHERE server_id = $1 ORDER BY at", [serverId])).rows.map((r) => r.cpu_pct);
  assert.deepEqual(raw, [34, 33], "only the last 24 hours stay raw");

  // A second run changes nothing for this server.
  await rollupMetrics(local.db, NOW);
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM server_metric_rollups WHERE server_id = $1", [serverId])).rows[0].n, 3);

  // The 7-day chart merges rollups (weighted by samples) and raw rows into 30-minute buckets.
  const week = await serverSeries(local.db, serverId, "7d", NOW);
  assert.equal(week.stepSec, 1800);
  const eight = week.points.find((p) => p.t === "2026-10-11T08:00:00.000Z");
  assert.equal(Math.round(eight.cpuPct * 100) / 100, Math.round(((32.5 * 10 + 80) / 11) * 100) / 100);
  assert.equal(eight.cpuPctMax, 80);
  assert.ok(week.points.some((p) => p.cpuPct === 33));
  const month = await serverSeries(local.db, serverId, "30d", NOW);
  assert.ok(month.points.some((p) => p.cpuPct === 6), "29-day-old rollup is still shown");
  const containers = await containerSummary(local.db, serverId, "7d", NOW);
  assert.deepEqual(containers.containers, [], "no container is running now");
});

test("threshold rules: pure evaluation", () => {
  const rule = { metric: "cpu", thresholdPct: 80, forMinutes: 5 };
  const series = (values, step = 30) => values.map((v, i) => ({ at: ago((values.length - 1 - i) * step), value: v }));
  assert.equal(evaluateThreshold(rule, [], NOW).state, "unknown");
  assert.equal(evaluateThreshold(rule, [{ at: ago(600), value: 99 }], NOW).state, "unknown", "stale data changes nothing");
  assert.equal(evaluateThreshold(rule, series([90, 90, 50]), NOW).state, "ok");
  assert.equal(evaluateThreshold(rule, series(Array(5).fill(95)), NOW).state, "above", "not for 5 minutes yet");
  assert.equal(evaluateThreshold(rule, series(Array(11).fill(95)), NOW).state, "breach");
  assert.deepEqual(evaluateThreshold(rule, series([...Array(5).fill(95), 70, ...Array(5).fill(95)]), NOW).state, "above", "a dip inside the window resets it");
  assert.equal(evaluateThreshold({ ...rule, forMinutes: 0 }, series([81]), NOW).state, "breach");
  assert.equal(evaluateThreshold({ ...rule, forMinutes: 0 }, series([80]), NOW).state, "ok", "at the threshold is not above it");
  assert.deepEqual(evaluateThreshold(rule, [...series(Array(11).fill(95)), { at: ago(10), value: null }], NOW), { state: "breach", value: 95 });

  assert.equal(evaluateOffline({ forMinutes: 5 }, null, NOW, 90).state, "unknown");
  assert.equal(evaluateOffline({ forMinutes: 5 }, ago(30), NOW, 90).state, "ok");
  assert.equal(evaluateOffline({ forMinutes: 5 }, ago(120), NOW, 90).state, "above");
  assert.equal(evaluateOffline({ forMinutes: 5 }, ago(90 + 300), NOW, 90).state, "breach");

  const s = { cpuPct: 5, memUsedBytes: 3, memTotalBytes: 4, diskRootUsedBytes: 10, diskRootTotalBytes: 100, diskDockerUsedBytes: 90, diskDockerTotalBytes: 100 };
  assert.equal(metricValue("memory", s), 75);
  assert.equal(metricValue("disk", s), 90, "the fuller disk counts");
  assert.equal(metricValue("memory", { ...s, memTotalBytes: null }), null);

  const rules = [
    { id: "d", serverId: null, metric: "cpu" },
    { id: "o", serverId: "s1", metric: "cpu" },
    { id: "m", serverId: null, metric: "memory" },
  ];
  const e = effectiveRules(rules, "s1");
  assert.equal(e.get("cpu").id, "o");
  assert.equal(e.get("memory").id, "m");
  assert.equal(effectiveRules(rules, "s2").get("cpu").id, "d");
});

test("threshold alerts fire once when they start and once when they clear; server overrides win", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const a = await api.registerServer(orgId, owner);
  const b = await api.registerServer(orgId, owner);
  const developer = await member("developer");
  const channel = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "email", name: "Ops", emails: ["ops@example.com"], events: ["server.threshold", "server.threshold_cleared"] } })).json.channel;
  const deliveries = async () => (await api.pool.query("SELECT event, payload FROM alert_deliveries WHERE channel_id = $1 ORDER BY created_at", [channel.id])).rows;

  const rules = `/orgs/${orgId}/metric-alert-rules`;
  assert.equal((await api.call("PUT", rules, { token: developer.token, body: { metric: "cpu", thresholdPct: 80, forMinutes: 5 } })).status, 403);
  assert.equal((await api.call("PUT", rules, { token: owner.token, body: { metric: "cpu" } })).status, 400, "a threshold is required");
  assert.equal((await api.call("PUT", rules, { token: owner.token, body: { metric: "cpu", thresholdPct: 101 } })).status, 400);
  assert.equal((await api.call("PUT", rules, { token: owner.token, body: { metric: "load", thresholdPct: 50 } })).status, 400);
  const other = await api.createOrg();
  const foreign = await api.registerServer(other.orgId, other.owner);
  assert.equal((await api.call("PUT", rules, { token: owner.token, body: { serverId: foreign.serverId, metric: "cpu", thresholdPct: 50 } })).status, 404);

  const created = await api.call("PUT", rules, { token: owner.token, body: { metric: "cpu", thresholdPct: 80, forMinutes: 5 } });
  assert.equal(created.status, 201);
  const updated = await api.call("PUT", rules, { token: owner.token, body: { metric: "cpu", thresholdPct: 85, forMinutes: 5 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.rule.id, created.json.rule.id, "one default per metric");
  // Server b turns CPU alerts off.
  assert.equal((await api.call("PUT", rules, { token: owner.token, body: { serverId: b.serverId, metric: "cpu", thresholdPct: 85, forMinutes: 5, enabled: false } })).status, 201);
  const listed = await api.call("GET", `${rules}?serverId=${b.serverId}`, { token: developer.token });
  assert.equal(listed.json.effective.cpu.enabled, false);

  // Both servers run hot for 6 minutes.
  for (let i = 0; i <= 12; i++) {
    await insertSample(a.serverId, ago(i * 30), { cpuPct: 97 });
    await insertSample(b.serverId, ago(i * 30), { cpuPct: 97 });
  }
  await evaluateMetricAlerts(local.db, 90, NOW);
  await evaluateMetricAlerts(local.db, 90, new Date(NOW.getTime() + 1000)); // no second alert
  let open = (await api.pool.query("SELECT * FROM metric_incidents WHERE server_id = ANY($1)", [[a.serverId, b.serverId]])).rows;
  assert.equal(open.length, 1);
  assert.equal(open[0].server_id, a.serverId);
  assert.equal(open[0].metric, "cpu");
  assert.equal(open[0].threshold_pct, 85);
  assert.equal(open[0].resolved_at, null);
  let sent = await deliveries();
  assert.deepEqual(sent.map((d) => d.event), ["server.threshold"]);
  assert.match(sent[0].payload.title, /^CPU above 85%: srv-/);
  assert.equal(sent[0].payload.details.value, 97);
  assert.equal(sent[0].payload.url, `https://cloud.test/servers/${a.serverId}`);

  // Shown on the server page.
  const page = await api.call("GET", `/orgs/${orgId}/servers/${a.serverId}/incidents`, { token: developer.token });
  assert.equal(page.json.incidents.length, 1);
  assert.equal((await api.call("GET", `/orgs/${orgId}/metric-incidents`, { token: developer.token })).json.incidents.length, 1);

  // It peaks, then clears: one more alert, then nothing.
  const later = new Date(NOW.getTime() + 60_000);
  await insertSample(a.serverId, ago(30, later), { cpuPct: 99 });
  await evaluateMetricAlerts(local.db, 90, ago(30, later));
  await insertSample(a.serverId, later, { cpuPct: 20 });
  await evaluateMetricAlerts(local.db, 90, later);
  await evaluateMetricAlerts(local.db, 90, new Date(later.getTime() + 1000));
  open = (await api.pool.query("SELECT * FROM metric_incidents WHERE server_id = $1", [a.serverId])).rows;
  assert.equal(open.length, 1);
  assert.equal(new Date(open[0].resolved_at).toISOString(), later.toISOString());
  assert.equal(open[0].peak_value, 99);
  assert.equal(open[0].clear_value, 20);
  sent = await deliveries();
  assert.deepEqual(sent.map((d) => d.event), ["server.threshold", "server.threshold_cleared"]);
  assert.match(sent[1].payload.text, /^CPU on srv-\S+ is back at 20%, at or below the 85% threshold, after 1 minute \(peak 99%\)\.$/);

  const audit = await api.pool.query("SELECT action FROM audit_logs WHERE org_id = $1 AND action LIKE 'metric_%' ORDER BY created_at", [orgId]);
  assert.deepEqual(audit.rows.map((r) => r.action), ["metric_rule.create", "metric_rule.update", "metric_rule.create", "metric_alert.open", "metric_alert.resolve"]);
});

test("disk and offline rules; removing a rule closes its incident without an alert", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const channel = (await api.call("POST", `/orgs/${orgId}/alert-channels`, { token: owner.token, body: { type: "email", name: "Ops", events: ["server.threshold", "server.threshold_cleared"] } })).json.channel;
  const events = async () => (await api.pool.query("SELECT event FROM alert_deliveries WHERE channel_id = $1 ORDER BY created_at", [channel.id])).rows.map((r) => r.event);
  const rules = `/orgs/${orgId}/metric-alert-rules`;
  const disk = (await api.call("PUT", rules, { token: owner.token, body: { metric: "disk", thresholdPct: 85 } })).json.rule;
  await api.call("PUT", rules, { token: owner.token, body: { metric: "offline", forMinutes: 5, thresholdPct: 50 } });
  const stored = await api.pool.query("SELECT threshold_pct FROM metric_alert_rules WHERE org_id = $1 AND metric = 'offline'", [orgId]);
  assert.equal(stored.rows[0].threshold_pct, null, "offline has no threshold");

  // Docker's data root is 90% full.
  await insertSample(srv.serverId, ago(10), { diskDockerUsedBytes: 90 * GB });
  await api.pool.query("UPDATE servers SET last_seen_at = $2 WHERE id = $1", [srv.serverId, ago(10)]);
  await evaluateMetricAlerts(local.db, 90, NOW);
  assert.deepEqual(await events(), ["server.threshold"]);

  // Deleting the rule closes the incident quietly.
  assert.equal((await api.call("DELETE", `${rules}/${disk.id}`, { token: owner.token })).status, 200);
  await evaluateMetricAlerts(local.db, 90, NOW);
  const closed = (await api.pool.query("SELECT closed_reason, resolved_at FROM metric_incidents WHERE server_id = $1 AND metric = 'disk'", [srv.serverId])).rows[0];
  assert.ok(closed.resolved_at);
  assert.match(closed.closed_reason, /rule removed/);
  assert.deepEqual(await events(), ["server.threshold"]);

  // Silent for 3 minutes: offline, but not for 5 minutes past the timeout yet.
  await api.pool.query("UPDATE servers SET last_seen_at = $2 WHERE id = $1", [srv.serverId, ago(180)]);
  await evaluateMetricAlerts(local.db, 90, NOW);
  assert.deepEqual(await events(), ["server.threshold"]);
  await api.pool.query("UPDATE servers SET last_seen_at = $2 WHERE id = $1", [srv.serverId, ago(90 + 301)]);
  await evaluateMetricAlerts(local.db, 90, NOW);
  await evaluateMetricAlerts(local.db, 90, NOW);
  assert.deepEqual(await events(), ["server.threshold", "server.threshold"]);
  await api.pool.query("UPDATE servers SET last_seen_at = $2 WHERE id = $1", [srv.serverId, ago(5)]);
  await evaluateMetricAlerts(local.db, 90, NOW);
  assert.deepEqual(await events(), ["server.threshold", "server.threshold", "server.threshold_cleared"]);
});

test("Prometheus text format: escaping, HELP/TYPE once per family, empty families left out", () => {
  assert.equal(escapeLabel('a"b\\c\nd'), 'a\\"b\\\\c\\nd');
  const text = renderExposition({
    m_one: { help: "First.", type: "gauge", samples: [{ labels: { a: "x" }, value: 1 }, { labels: { a: 'q"' }, value: 2.5 }] },
    m_empty: { help: "Nothing.", type: "gauge", samples: [] },
    m_plain: { help: "No labels.", type: "gauge", samples: [{ labels: {}, value: NaN }] },
  });
  assert.equal(text, '# HELP m_one First.\n# TYPE m_one gauge\nm_one{a="x"} 1\nm_one{a="q\\""} 2.5\n# HELP m_plain No labels.\n# TYPE m_plain gauge\nm_plain NaN\n');

  const servers = [
    { id: "s1", name: 'web "1"', hostname: "h1", os: "Ubuntu", agentVersion: "0.2.0", dockerVersion: "27", lastSeenAt: ago(10), cpuCount: 2 },
    { id: "s2", name: "db", hostname: null, os: null, agentVersion: null, dockerVersion: null, lastSeenAt: ago(600), cpuCount: null },
  ];
  const latest = new Map([["s1", { serverId: "s1", at: ago(20), cpuPct: 12.5, load1: 0.5, load5: null, load15: null, memUsedBytes: 100, memTotalBytes: 400, diskRootUsedBytes: 5, diskRootTotalBytes: 10, diskDockerUsedBytes: null, diskDockerTotalBytes: null, netRxBps: 1, netTxBps: 2, containers: [{ name: "web-1", project: "p", service: "web", cpuPct: 3, memBytes: 7, memLimitBytes: null }] }]]);
  const out = prometheusText(servers, latest, [{ serverId: "s2", metric: "offline" }], NOW, 90);
  assert.match(out, /^inveon_server_up\{server_id="s1",server="web \\"1\\""\} 1$/m);
  assert.match(out, /^inveon_server_up\{server_id="s2",server="db"\} 0$/m);
  assert.match(out, /^inveon_server_cpu_percent\{server_id="s1",server="web \\"1\\""\} 12.5$/m);
  assert.match(out, /^inveon_server_disk_used_bytes\{server_id="s1",server="web \\"1\\"",mount="\/"\} 5$/m);
  assert.ok(!/mount="docker"/.test(out), "missing values are left out");
  assert.match(out, /^inveon_container_memory_bytes\{server_id="s1",server="web \\"1\\"",container="web-1",project="p",service="web"\} 7$/m);
  assert.match(out, /^inveon_server_alert_open\{server_id="s2",server="db",metric="offline"\} 1$/m);
  assert.ok(out.includes(`inveon_server_metrics_timestamp_seconds{server_id="s1",server="web \\"1\\""} ${Math.floor(ago(20).getTime() / 1000)}\n`));
  assert.equal(out.match(/^# TYPE inveon_server_up gauge$/gm).length, 1);
  assert.ok(out.endsWith("\n"));
  for (const line of out.trim().split("\n")) assert.match(line, /^(# (HELP|TYPE) [a-z_0-9]+ .+|[a-z_0-9]+(\{.*\})? (-?[0-9.e+]+|NaN))$/, line);
});

test("/metrics needs an organization's scrape token: hashed, admin-managed, revocable, org-scoped", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const developer = await member("developer");
  const other = await api.createOrg();
  const otherSrv = await api.registerServer(other.orgId, other.owner);
  await api.call("POST", "/agent/metrics", { token: srv.agentToken, body: { samples: [sample(new Date(Date.now() - 5000), { cpuPct: 42.5 })] } });

  const base = `/orgs/${orgId}/scrape-tokens`;
  assert.equal((await api.call("POST", base, { token: developer.token, body: { name: "grafana" } })).status, 403);
  assert.equal((await api.call("GET", base, { token: developer.token })).status, 403);
  const created = await api.call("POST", base, { token: owner.token, body: { name: "grafana" } });
  assert.equal(created.status, 201);
  const secret = created.json.secret;
  assert.match(secret, /^ics_[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.json.token.tokenHash, undefined);
  assert.ok(secret.startsWith(created.json.token.tokenPrefix));
  const row = (await api.pool.query("SELECT token_hash FROM scrape_tokens WHERE id = $1", [created.json.token.id])).rows[0];
  assert.equal(row.token_hash, createHash("sha256").update(secret).digest("hex"));
  assert.ok(!JSON.stringify((await api.call("GET", base, { token: owner.token })).json).includes(secret));

  const scrape = (token) => fetch(`${api.origin}/metrics`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await scrape()).status, 401);
  assert.equal((await scrape("ics_wrong")).status, 401);
  assert.equal((await scrape(owner.token)).status, 401, "a dashboard session is not a scrape token");
  const res = await scrape(secret);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/plain;.*version=0\.0\.4/);
  const text = await res.text();
  assert.match(text, new RegExp(`^inveon_server_up\\{server_id="${srv.serverId}",server="[^"]+"\\} 1$`, "m"));
  assert.match(text, new RegExp(`^inveon_server_cpu_percent\\{server_id="${srv.serverId}",[^}]*\\} 42.5$`, "m"));
  assert.ok(!text.includes(otherSrv.serverId), "only this organization's servers");
  assert.ok((await api.pool.query("SELECT last_used_at FROM scrape_tokens WHERE id = $1", [created.json.token.id])).rows[0].last_used_at);

  // POST and other methods do nothing.
  assert.equal((await fetch(`${api.origin}/metrics`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } })).status === 200, false);

  assert.equal((await api.call("DELETE", `/orgs/${other.orgId}/scrape-tokens/${created.json.token.id}`, { token: other.owner.token })).status, 404);
  assert.equal((await api.call("DELETE", `${base}/${created.json.token.id}`, { token: owner.token })).status, 200);
  assert.equal((await scrape(secret)).status, 401, "revoked");
  const audit = await api.pool.query("SELECT action, metadata FROM audit_logs WHERE org_id = $1 AND action LIKE 'scrape_token.%' ORDER BY created_at", [orgId]);
  assert.deepEqual(audit.rows.map((r) => r.action), ["scrape_token.create", "scrape_token.revoke"]);
  assert.ok(!JSON.stringify(audit.rows).includes(secret));
});
