// Release archiving: keep the last N releases per environment, remove older
// images on the server (never shared ones, never ones another environment
// keeps), never archive the live or previous release, and refuse rollbacks
// to archived releases.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, sha } from "./helpers.mjs";
import { releaseImages, releasesToArchive } from "../dist/modules/deploys/archive.js";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const S = "0123456789abcdef0123456789abcdef01234567";

test("images of a release: only references tagged with its commit", () => {
  const compose = [
    "services:",
    "  web:",
    "    image: ${IMAGE_REGISTRY}/site:${IMAGE_TAG}",
    "  worker:",
    '    image: "ghcr.io/inveon/worker:sha-${INVEON_COMMIT_SHA}" # comment',
    "  built:",
    "    image: ${INVEON_IMAGE}",
    "  db:",
    "    image: postgres:16",
    "  other:",
    "    image: ghcr.io/inveon/x:${SOMETHING_ELSE}",
    "  latest:",
    "    image: ghcr.io/inveon/y:${IMAGE_TAG:-latest}",
  ].join("\n");
  const app = { id: "1a2b3c4d-0000-0000-0000-000000000000", slug: "site", buildOnServer: true, imageRegistry: "ghcr.io/inveon" };
  assert.deepEqual(releaseImages(app, { commitSha: S, composeContent: compose }).sort(), [
    `ghcr.io/inveon/site:${S}`,
    `ghcr.io/inveon/worker:sha-${S}`,
    `ghcr.io/inveon/y:${S}`,
    `inveon-build/site-1a2b3c4d:${S}`,
  ]);
  assert.deepEqual(releaseImages({ ...app, buildOnServer: false, imageRegistry: null }, { commitSha: S, composeContent: "services:\n  web:\n    image: nginx:alpine\n" }), []);
});

test("archive rule: the newest N stay, and so do the live and previous releases", () => {
  const list = ["r5", "r4", "r3", "r2", "r1"].map((releaseId) => ({ releaseId, archivedAt: null }));
  assert.deepEqual(releasesToArchive(list, 2, "r5", "r4"), ["r3", "r2", "r1"]);
  assert.deepEqual(releasesToArchive(list, 2, "r1", "r5"), ["r3", "r2"], "a rolled-back live release stays");
  assert.deepEqual(releasesToArchive(list, 10, "r5", "r4"), []);
  assert.deepEqual(releasesToArchive([...list.slice(0, 4), { releaseId: "r1", archivedAt: new Date() }], 2, "r5", "r4"), ["r3", "r2"], "already archived");
});

test("old releases are archived after deploys; archived releases can't be rolled back to; shared images are kept", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const developer = await member("developer");
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const prod = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  const compose = "services:\n  web:\n    image: ghcr.io/inveon/site:${IMAGE_TAG}\n    ports:\n      - \"127.0.0.1:${INVEON_HTTP_PORT}:80\"\n  db:\n    image: postgres:16\n";
  const shas = [sha(), sha(), sha()];
  for (const s of shas) api.github.setFile(ctx.repoOwner, ctx.repo, s, "docker-compose.yml", compose);

  assert.equal((await api.call("PATCH", prod, { token: owner.token, body: { keepReleases: 1 } })).status, 400);
  assert.equal((await api.call("PATCH", prod, { token: developer.token, body: { keepReleases: 2 } })).status, 403);
  assert.equal((await api.call("PATCH", prod, { token: owner.token, body: { keepReleases: 2 } })).json.environment.keepReleases, 2);

  const deploy = async (base, commitSha) => {
    const r = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal((await api.runClaimedJob(srv.agentToken)).finish.status, "success");
  };
  await deploy(prod, shas[0]);
  await deploy(prod, shas[1]);
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken })).status, 204, "nothing to archive yet");
  await deploy(prod, shas[2]);

  // The oldest release falls out of the last 2: its image goes, postgres:16 stays.
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  const job = claim.json.job;
  assert.equal(job.type, "release_archive");
  assert.deepEqual(job.steps.map((s) => [s.action, s.params]), [["image.remove", { images: [`ghcr.io/inveon/site:${shas[0]}`] }]]);
  for (const s of job.steps) await api.call("POST", `/agent/jobs/${job.id}/steps/${s.id}`, { token: srv.agentToken, body: { status: "success", result: { removed: s.params.images, skipped: [] } } });
  await api.call("POST", `/agent/jobs/${job.id}/finish`, { token: srv.agentToken, body: { status: "success" } });

  let list = (await api.call("GET", `${prod}/releases`, { token: developer.token })).json;
  assert.equal(list.keepReleases, 2);
  assert.deepEqual(list.releases.map((r) => [r.commitSha, !!r.archivedAt, r.current, r.previous]), [
    [shas[2], false, true, false],
    [shas[1], false, false, true],
    [shas[0], true, false, false],
  ]);

  const r0 = list.releases[2].releaseId;
  const rb = await api.call("POST", `${prod}/rollback`, { token: developer.token, body: { releaseId: r0 } });
  assert.equal(rb.status, 400);
  assert.equal(rb.json.error.code, "RELEASE_ARCHIVED");
  assert.equal((await api.call("POST", `${prod}/rollback`, { token: developer.token, body: { releaseId: list.releases[0].releaseId } })).json.error.code, "ALREADY_LIVE");

  // Staging on the same server runs the middle release, so production must not remove its image.
  const staging = await api.call("POST", `/orgs/${orgId}/apps/${ctx.app.id}/environments`, { token: owner.token, body: { name: "staging", serverId: srv.serverId } });
  await deploy(`/orgs/${orgId}/environments/${staging.json.environment.id}`, shas[1]);

  // Deploying an archived commit again un-archives it (a fresh pull); then the middle release falls out of the last 2.
  await deploy(prod, shas[0]);
  list = (await api.call("GET", `${prod}/releases`, { token: developer.token })).json;
  const state = Object.fromEntries(list.releases.map((r) => [r.commitSha, { archived: !!r.archivedAt, current: r.current, previous: r.previous }]));
  assert.deepEqual(state[shas[0]], { archived: false, current: true, previous: false });
  assert.deepEqual(state[shas[2]], { archived: false, current: false, previous: true });
  assert.equal(state[shas[1]].archived, true, "archived in production…");
  // …without a job, because staging still runs that image.
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken })).status, 204);
  const stagingList = (await api.call("GET", `/orgs/${orgId}/environments/${staging.json.environment.id}/releases`, { token: owner.token })).json;
  assert.equal(stagingList.releases[0].archivedAt, null);
  const r1 = list.releases.find((r) => r.commitSha === shas[1]).releaseId;
  assert.equal((await api.call("POST", `${prod}/rollback`, { token: developer.token, body: { releaseId: r1 } })).json.error.code, "RELEASE_ARCHIVED");
  // The plain rollback (to the previous release) still works.
  const back = await api.call("POST", `${prod}/rollback`, { token: developer.token });
  assert.equal(back.status, 201);
  assert.equal(back.json.release.commitSha, shas[2]);
  assert.equal((await api.runClaimedJob(srv.agentToken)).finish.status, "success");

  const audit = await api.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE org_id = $1 AND action = 'release.archive'", [orgId]);
  assert.ok(audit.rows[0].n >= 2);
});

test("a failed archive job archives nothing; admins can archive on demand", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const developer = await member("developer");
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  const compose = "services:\n  web:\n    image: ghcr.io/inveon/site:${IMAGE_TAG}\n";
  const shas = [sha(), sha(), sha()];
  for (const s of shas) {
    api.github.setFile(ctx.repoOwner, ctx.repo, s, "docker-compose.yml", compose);
    await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: s } });
    await api.runClaimedJob(srv.agentToken);
  }
  await api.call("PATCH", base, { token: owner.token, body: { keepReleases: 2 } });
  assert.equal((await api.call("POST", `${base}/releases/archive`, { token: developer.token })).status, 403);
  const res = await api.call("POST", `${base}/releases/archive`, { token: owner.token });
  assert.equal(res.status, 201);
  await api.runClaimedJob(srv.agentToken, { fail: true });
  const list = (await api.call("GET", `${base}/releases`, { token: owner.token })).json;
  assert.ok(list.releases.every((r) => r.archivedAt === null));
});
