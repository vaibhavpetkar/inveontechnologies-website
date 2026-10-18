// Backup retention: the keep rule, the prune job (exact keys inside the
// environment's prefix only), deleting records after success, and the daily run.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, sha } from "./helpers.mjs";
import { backupsToPrune, envPrefixOf, weekKey } from "../dist/modules/backups/retention.js";
import { pruneAllBackups } from "../dist/modules/backups/retention.js";
import { createDb } from "../dist/db/client.js";

let api;
let local;
before(async () => {
  api = await startServer();
  local = createDb(process.env.TEST_DATABASE_URL);
});
after(async () => {
  await api?.stop();
  await local?.pool.end();
});

const DAY = 86400_000;
const NOW = new Date("2026-10-12T12:00:00Z");
const at = (daysAgo, hour = 2) => new Date(Date.UTC(2026, 9, 12 - daysAgo, hour));

test("retention rule: newest per day for N days, newest per week for M weeks, nothing under 24 hours, failures cleared", () => {
  const rows = [];
  for (let d = 0; d < 40; d++) rows.push({ id: `s${d}`, createdAt: at(d), status: "success" });
  rows.push({ id: "extra-today", createdAt: at(0, 1), status: "success" }); // two today, both < 24h
  rows.push({ id: "extra-d3", createdAt: at(3, 1), status: "success" }); // older duplicate on day 3
  rows.push({ id: "failed-old", createdAt: at(5, 3), status: "failure" });
  rows.push({ id: "failed-new", createdAt: new Date(NOW.getTime() - 3600_000), status: "failure" });
  rows.push({ id: "running-old", createdAt: at(30, 3), status: "running" });

  assert.deepEqual(backupsToPrune(rows, null, 4, NOW), [], "null keeps everything");

  const pruned = new Set(backupsToPrune(rows, 7, 0, NOW));
  for (let d = 0; d < 7; d++) assert.ok(!pruned.has(`s${d}`), `day ${d} kept`);
  for (let d = 7; d < 40; d++) assert.ok(pruned.has(`s${d}`), `day ${d} pruned`);
  assert.ok(pruned.has("extra-d3"), "only the newest backup of a day counts");
  assert.ok(!pruned.has("extra-today") && !pruned.has("failed-new"), "younger than 24 hours");
  assert.ok(pruned.has("failed-old"));
  assert.ok(!pruned.has("running-old"), "never anything unfinished");

  const weekly = new Set(backupsToPrune(rows, 7, 4, NOW));
  const keptOld = [...Array(40).keys()].filter((d) => d >= 7 && !weekly.has(`s${d}`));
  // 4 most recent weeks: the newest backup in each; the ones beyond 7 days are the week's newest.
  assert.ok(keptOld.length >= 1 && keptOld.length <= 3, `kept ${keptOld}`);
  for (const d of keptOld) assert.equal(weekKey(at(d)) !== weekKey(at(d - 1)) || d === 0, true);

  assert.equal(weekKey(new Date("2026-10-12T00:00:00Z")), "2026-W42");
  assert.equal(weekKey(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(envPrefixOf("cloud/site-x1/20261001T020000Z-manual-1.tar.gz", "site-x1"), "cloud/site-x1/");
  assert.equal(envPrefixOf("site-x1/a.tar.gz", "site-x1"), "site-x1/");
  assert.equal(envPrefixOf("cloud/other/a.tar.gz", "site-x1"), null);
  assert.equal(envPrefixOf("cloud/site-x1/a.sql", "site-x1"), null);
});

async function setup() {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  return { orgId, owner, member, srv, base, ...ctx };
}

const cfg = { enabled: true, hourUtc: 2, dbType: "none", volumePaths: ["uploads"], s3Bucket: "inveon-backups", s3Prefix: "cloud", s3Region: "ap-south-1" };

async function insertBackup(environmentId, key, daysAgo, status = "success") {
  const { rows } = await api.pool.query(
    "INSERT INTO backups (environment_id, kind, status, s3_bucket, s3_region, s3_key, created_at) VALUES ($1, 'scheduled', $2, 'inveon-backups', 'ap-south-1', $3, now() - make_interval(days => $4)) RETURNING id",
    [environmentId, status, key, daysAgo],
  );
  return rows[0].id;
}

test("retention settings are validated and prune is admin-only", async () => {
  const { member, base, owner } = await setup();
  const developer = await member("developer");
  assert.equal((await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, keepDaily: 0 } })).status, 400);
  assert.equal((await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, keepDaily: null, keepWeekly: 4 } })).status, 400);
  assert.equal((await api.call("POST", `${base}/backups/prune`, { token: owner.token })).status, 400, "no rule yet");
  const saved = await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, keepDaily: 7, keepWeekly: 4 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.backupConfig.keepDaily, 7);
  assert.equal(saved.json.backupConfig.keepWeekly, 4);
  // Saving without the retention fields leaves them as they were.
  const again = await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, hourUtc: 3 } });
  assert.equal(again.json.backupConfig.keepDaily, 7);
  assert.equal((await api.call("POST", `${base}/backups/prune`, { token: developer.token })).status, 403);
});

test("prune deletes exactly the old keys in the environment's prefix, then the records", async () => {
  const { orgId, owner, base, srv, environment } = await setup();
  await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, keepDaily: 3, keepWeekly: 0 } });
  const key = (n) => `cloud/${environment.slug}/2026100${n}T020000Z-scheduled-0000000${n}.tar.gz`;
  const ids = [];
  for (let d = 1; d <= 6; d++) ids.push(await insertBackup(environment.id, key(d), d));
  const failed = await insertBackup(environment.id, `cloud/${environment.slug}/20260930T020000Z-scheduled-deadbeef.tar.gz`, 8, "failure");
  // A record whose key is not in this environment's folder is never sent to the agent.
  const foreign = await insertBackup(environment.id, "cloud/someone-else/20260901T020000Z-scheduled-11111111.tar.gz", 20);

  const res = await api.call("POST", `${base}/backups/prune`, { token: owner.token });
  assert.equal(res.status, 201);
  assert.equal(res.json.count, 4);
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  const job = claim.json.job;
  assert.equal(job.type, "backup_prune");
  assert.deepEqual(job.steps.map((s) => s.action), ["backup.delete"]);
  const p = job.steps[0].params;
  assert.equal(p.prefix, `cloud/${environment.slug}/`);
  assert.equal(p.bucket, "inveon-backups");
  assert.deepEqual(p.keys.sort(), [key(4), key(5), key(6), `cloud/${environment.slug}/20260930T020000Z-scheduled-deadbeef.tar.gz`].sort());
  // A second prune while one runs does nothing.
  assert.equal((await api.call("POST", `${base}/backups/prune`, { token: owner.token })).json.job, null);

  for (const s of job.steps) await api.call("POST", `/agent/jobs/${job.id}/steps/${s.id}`, { token: srv.agentToken, body: { status: "success", result: { deleted: s.params.keys.length } } });
  await api.call("POST", `/agent/jobs/${job.id}/finish`, { token: srv.agentToken, body: { status: "success" } });
  const left = (await api.pool.query("SELECT id FROM backups WHERE environment_id = $1", [environment.id])).rows.map((r) => r.id);
  assert.deepEqual(left.sort(), [ids[0], ids[1], ids[2], foreign].sort());
  assert.ok(!left.includes(failed));
  const audit = await api.pool.query("SELECT metadata FROM audit_logs WHERE org_id = $1 AND action = 'backup.prune'", [orgId]);
  assert.equal(audit.rows[0].metadata.count, 4);
});

test("a failed prune keeps the records; the daily run queues prunes for environments with a rule", async () => {
  const { owner, base, srv, environment } = await setup();
  await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: { ...cfg, keepDaily: 1 } });
  const old = await insertBackup(environment.id, `cloud/${environment.slug}/20260901T020000Z-scheduled-22222222.tar.gz`, 10);
  await insertBackup(environment.id, `cloud/${environment.slug}/20261010T020000Z-scheduled-33333333.tar.gz`, 2);
  await api.call("POST", `${base}/backups/prune`, { token: owner.token });
  await api.runClaimedJob(srv.agentToken, { fail: true });
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM backups WHERE id = $1", [old])).rows[0].n, 1);

  assert.ok((await pruneAllBackups(local.db)) >= 1);
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(claim.json.job.type, "backup_prune");
  assert.deepEqual(claim.json.job.steps[0].params.keys, [`cloud/${environment.slug}/20260901T020000Z-scheduled-22222222.tar.gz`]);
});
