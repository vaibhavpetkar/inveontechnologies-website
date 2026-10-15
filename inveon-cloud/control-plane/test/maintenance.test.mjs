// Maintenance windows: the weekly window maths, queuing webhook deploys
// outside a window, deploying them when it opens, and manual deploys
// running anyway (flagged so the dashboard can warn).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startServer, sha } from "./helpers.mjs";
import { windowState, describeWindow } from "../dist/lib/maintenance.js";
import { deployQueuedReleases } from "../dist/modules/deploys/maintenance.js";
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

const sign = (secret, body) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const hhmm = (d) => d.toISOString().slice(11, 16);
/** A window starting at `from` (UTC) for `minutes`. */
const windowAt = (from, minutes) => ({ day: from.getUTCDay(), start: hhmm(from), durationMin: minutes });

test("window maths: open now, next window, past midnight and across the week", () => {
  // Monday 2026-10-12 12:00 UTC.
  const now = new Date("2026-10-12T12:00:00Z");
  assert.deepEqual(windowState([], now), { restricted: false, open: true, current: null, next: null });

  const tueNight = { day: 2, start: "02:00", durationMin: 120 };
  let s = windowState([tueNight], now);
  assert.equal(s.restricted, true);
  assert.equal(s.open, false);
  assert.equal(s.next.start.toISOString(), "2026-10-13T02:00:00.000Z");
  assert.equal(describeWindow(s.next), "Tue 02:00–04:00 UTC");

  s = windowState([{ day: 1, start: "11:30", durationMin: 60 }], now);
  assert.equal(s.open, true);
  assert.equal(s.current.end.toISOString(), "2026-10-12T12:30:00.000Z");
  assert.equal(s.next.start.toISOString(), "2026-10-19T11:30:00.000Z", "next week's");

  // Sunday 23:00 for 3 hours is still open on Monday 01:00.
  s = windowState([{ day: 0, start: "23:00", durationMin: 180 }], new Date("2026-10-12T01:00:00Z"));
  assert.equal(s.open, true);
  // Saturday 23:00 for 2 hours, checked on Sunday 00:30 (crosses the week boundary).
  s = windowState([{ day: 6, start: "23:00", durationMin: 120 }], new Date("2026-10-18T00:30:00Z"));
  assert.equal(s.open, true);
  // The earliest of several windows is next.
  s = windowState([tueNight, { day: 1, start: "18:00", durationMin: 30 }], now);
  assert.equal(s.next.start.toISOString(), "2026-10-12T18:00:00.000Z");
});

async function setup() {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  const push = async (commit) => {
    const body = JSON.stringify({ ref: "refs/heads/main", after: commit, head_commit: { message: "Change" } });
    return api.call("POST", `/webhooks/github/${ctx.app.id}`, { raw: body, headers: { "X-GitHub-Event": "push", "Content-Type": "application/json", "X-Hub-Signature-256": sign(ctx.webhookSecret, body) } });
  };
  return { orgId, owner, member, srv, base, push, ...ctx };
}

test("windows are validated and admin-only", async () => {
  const { owner, member, base } = await setup();
  const developer = await member("developer");
  const ok = [{ day: 2, start: "02:00", durationMin: 120 }];
  assert.equal((await api.call("PATCH", base, { token: developer.token, body: { maintenanceWindows: ok } })).status, 403);
  for (const bad of [[{ day: 7, start: "02:00", durationMin: 60 }], [{ day: 1, start: "25:00", durationMin: 60 }], [{ day: 1, start: "2:00", durationMin: 60 }], [{ day: 1, start: "02:00", durationMin: 5 }], Array(15).fill(ok[0])]) {
    assert.equal((await api.call("PATCH", base, { token: owner.token, body: { maintenanceWindows: bad } })).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  const saved = await api.call("PATCH", base, { token: owner.token, body: { maintenanceWindows: ok } });
  assert.deepEqual(saved.json.environment.maintenanceWindows, ok);
  const detail = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(detail.maintenance.restricted, true);
  assert.match(detail.maintenance.nextLabel, /^Tue 02:00–04:00 UTC$/);
});

test("a push outside the window is queued, replaced by a newer push, and deployed when the window opens", async () => {
  const { orgId, owner, srv, base, push, environment } = await setup();
  const later = new Date(Date.now() + 3 * 3600_000);
  await api.call("PATCH", base, { token: owner.token, body: { maintenanceWindows: [windowAt(later, 60)] } });

  const first = sha();
  const r1 = await push(first);
  assert.equal(r1.status, 202);
  assert.deepEqual(r1.json.jobIds, []);
  assert.deepEqual(r1.json.queuedEnvironmentIds, [environment.id]);
  const second = sha();
  await push(second);
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken })).status, 204, "nothing deployed");
  let detail = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(detail.maintenance.open, false);
  assert.equal(detail.maintenance.queuedRelease.commitSha, second, "the newest push wins");

  // Still closed: the scheduler leaves it queued.
  assert.equal(await deployQueuedReleases(local.db), 0);
  // The window opens (here: the setting changes to one that is open now).
  await api.call("PATCH", base, { token: owner.token, body: { maintenanceWindows: [windowAt(new Date(Date.now() - 10 * 60_000), 60)] } });
  assert.ok((await deployQueuedReleases(local.db)) >= 1);
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(claim.json.job.type, "deploy");
  assert.match(claim.json.job.title, new RegExp(second.slice(0, 7)));
  detail = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(detail.maintenance.queuedReleaseId, null);
  const audit = await api.pool.query("SELECT action, metadata FROM audit_logs WHERE org_id = $1 AND action IN ('deploy.queued', 'deploy.create') ORDER BY created_at", [orgId]);
  assert.deepEqual(audit.rows.map((r) => r.action), ["deploy.queued", "deploy.queued", "deploy.create"]);
  assert.equal(audit.rows[2].metadata.source, "maintenance_window");

  // Inside the window, a push deploys straight away (once the running deploy is done).
  await api.call("POST", `/agent/jobs/${claim.json.job.id}/finish`, { token: srv.agentToken, body: { status: "failure", error: "x" } });
  await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken }); // clean-up job, if any
  const r3 = await push(sha());
  assert.equal(r3.json.jobIds.length, 1);
  assert.deepEqual(r3.json.queuedEnvironmentIds, []);
});

test("manual deploys run outside the window but are flagged; a queued deploy can be discarded", async () => {
  const { owner, member, srv, base, push } = await setup();
  const developer = await member("developer");
  const viewer = await member("viewer");
  await api.call("PATCH", base, { token: owner.token, body: { maintenanceWindows: [windowAt(new Date(Date.now() + 5 * 3600_000), 30)] } });
  await push(sha());
  assert.equal((await api.call("DELETE", `${base}/queued-deploy`, { token: viewer.token })).status, 403);
  assert.equal((await api.call("DELETE", `${base}/queued-deploy`, { token: developer.token })).status, 200);
  assert.equal((await api.call("GET", base, { token: owner.token })).json.maintenance.queuedReleaseId, null);
  assert.equal((await api.call("DELETE", `${base}/queued-deploy`, { token: developer.token })).status, 404);

  const manual = await api.call("POST", `${base}/deploy`, { token: developer.token, body: { commitSha: sha() } });
  assert.equal(manual.status, 201);
  assert.equal(manual.json.outsideMaintenanceWindow, true);
  assert.ok(manual.json.maintenance.next);
  assert.equal((await api.runClaimedJob(srv.agentToken)).finish.status, "success");

  // Without windows nothing is flagged.
  await api.call("PATCH", base, { token: owner.token, body: { maintenanceWindows: [] } });
  const free = await api.call("POST", `${base}/deploy`, { token: developer.token, body: { commitSha: sha() } });
  assert.equal(free.json.outsideMaintenanceWindow, false);
});
