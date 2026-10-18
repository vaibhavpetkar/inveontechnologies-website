// Release command (migrations) as a deploy step: backup first, run in the
// new release's container before traffic switches, stop on failure.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, sha } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const backupCfg = { enabled: false, hourUtc: 2, dbType: "postgres", dbService: "db", dbName: "app", dbUser: "app", volumePaths: [], s3Bucket: "inveon-backups", s3Prefix: "cloud", s3Region: "ap-south-1" };

async function setup(strategy = "blue_green") {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId, strategy });
  const base = `/orgs/${orgId}/environments/${ctx.environment.id}`;
  return { orgId, owner, member, srv, base, ...ctx };
}

const jobSteps = async (orgId, owner, jobId) => (await api.call("GET", `/orgs/${orgId}/jobs/${jobId}`, { token: owner.token })).json.steps;

test("release command: validated, admin-only, needs a service", async () => {
  const { owner, member, base } = await setup();
  const developer = await member("developer");
  const patch = (token, body) => api.call("PATCH", base, { token, body });

  assert.equal((await patch(developer.token, { releaseCommand: "npm run db:migrate", releaseService: "web" })).status, 403);
  for (const releaseCommand of ["npm run migrate; reboot", "sh -c 'rm -rf /'", "echo $(id)", "npm run `id`", "cat < /etc/passwd", "--entrypoint=/bin/sh", "a | b"]) {
    const r = await patch(owner.token, { releaseCommand, releaseService: "web" });
    assert.equal(r.status, 400, releaseCommand);
  }
  assert.equal((await patch(owner.token, { releaseCommand: "npm run db:migrate" })).status, 400, "service required");
  assert.equal((await patch(owner.token, { releaseCommand: "npm run db:migrate", releaseService: "web --privileged" })).status, 400);

  const ok = await patch(owner.token, { releaseCommand: "  python manage.py migrate --noinput ", releaseService: "web" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.environment.releaseCommand, "python manage.py migrate --noinput");
  assert.equal(ok.json.environment.releaseService, "web");

  // Clearing it again.
  const cleared = await patch(owner.token, { releaseCommand: "", releaseService: null });
  assert.equal(cleared.json.environment.releaseCommand, null);
});

test("first deploy runs the release command before start, with no backup (nothing live yet)", async () => {
  const { orgId, owner, base, srv } = await setup();
  await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: backupCfg });
  await api.call("PATCH", base, { token: owner.token, body: { releaseCommand: "npm run db:migrate", releaseService: "web" } });
  const d = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  assert.equal(d.status, 201);
  assert.equal(d.json.deployment.backupId, null);
  const steps = await jobSteps(orgId, owner, d.json.job.id);
  assert.deepEqual(
    steps.map((s) => s.action),
    ["release.prepare", "compose.validate", "compose.pull", "release.run", "compose.up", "health.check", "nginx.write_upstream", "nginx.reload"],
  );
  const run = steps[3];
  assert.deepEqual(run.params.command, ["npm", "run", "db:migrate"]);
  assert.equal(run.params.service, "web");
  assert.equal(run.params.slot, "blue");
  assert.equal(run.params.timeoutSec, 1800);
  const done = await api.runClaimedJob(srv.agentToken, { logs: { "release.run": "Applied 3 migrations\n" } });
  assert.equal(done.finish.status, "success");
  const list = await api.call("GET", `${base}/deployments`, { token: owner.token });
  assert.equal(list.json.deployments[0].status, "success");
  assert.match(list.json.deployments[0].releaseOutput, /Applied 3 migrations/);
});

test("a failing release command keeps the old release live, records the output and offers the pre-deploy backup", async () => {
  const { orgId, owner, member, base, srv, environment } = await setup();
  const viewer = await member("viewer");
  const first = sha();
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: first } });
  await api.runClaimedJob(srv.agentToken);

  await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: backupCfg });
  await api.call("PATCH", base, { token: owner.token, body: { releaseCommand: "npm run db:migrate", releaseService: "web" } });
  const d = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  assert.ok(d.json.deployment.backupId, "a backup is taken first");
  const steps = await jobSteps(orgId, owner, d.json.job.id);
  assert.deepEqual(steps.slice(0, 6).map((s) => s.action), ["release.prepare", "compose.validate", "compose.pull", "backup.create", "release.run", "compose.up"]);
  const backupStep = steps[3];
  // The backup reads the live colour; the command runs in the new one.
  assert.equal(backupStep.params.slot, "blue");
  assert.equal(backupStep.params.db.service, "db");
  assert.match(backupStep.params.key, new RegExp(`^cloud/${environment.slug}/\\d{8}T\\d{6}Z-pre_deploy-[0-9a-f]{8}\\.tar\\.gz$`));
  assert.equal(steps[4].params.slot, "green");

  const ran = await api.runClaimedJob(srv.agentToken, {
    failAt: "release.run",
    results: { "backup.create": () => ({ sizeBytes: 4321 }) },
    logs: { "release.run": "Error: relation \"users\" already exists\n" },
  });
  assert.equal(ran.finish.status, "failure");

  // The old release keeps serving.
  const env = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(env.environment.activeSlot, "blue");
  assert.equal(env.currentRelease.commitSha, first);

  // The deploy is failed with the command's output, and the backup is ready.
  const list = await api.call("GET", `${base}/deployments`, { token: viewer.token });
  const failed = list.json.deployments[0];
  assert.equal(failed.status, "failure");
  assert.match(failed.error, /Release command/);
  assert.match(failed.releaseOutput, /relation "users" already exists/);
  assert.equal(failed.backupId, d.json.deployment.backupId);
  assert.equal(failed.backupStatus, "success");
  const backups = await api.call("GET", `${base}/backups`, { token: owner.token });
  assert.equal(backups.json.backups[0].kind, "pre_deploy");
  assert.equal(backups.json.backups[0].sizeBytes, 4321);

  // compose run may have started green's dependencies: they are stopped.
  const cleanup = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(cleanup.json.job.type, "deploy_cleanup");
  assert.deepEqual(cleanup.json.job.steps.map((s) => [s.action, s.params.slot]), [["compose.down", "green"]]);
  await api.call("POST", `/agent/jobs/${cleanup.json.job.id}/finish`, { token: srv.agentToken, body: { status: "failure" } });

  // Restoring the pre-deploy backup is the usual restore (fresh backup first).
  const restore = await api.call("POST", `/orgs/${orgId}/backups/${failed.backupId}/restore`, { token: owner.token });
  assert.equal(restore.status, 201);
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.deepEqual(claim.json.job.steps.map((s) => s.action), ["backup.create", "backup.restore"]);
  assert.equal(claim.json.job.steps[1].params.key, backupStep.params.key);
});

test("a failed backup stops the deploy before the release command runs", async () => {
  const { owner, base, srv } = await setup("recreate");
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  await api.call("PUT", `${base}/backup-config`, { token: owner.token, body: backupCfg });
  await api.call("PATCH", base, { token: owner.token, body: { releaseCommand: "bin/rails db:migrate", releaseService: "app" } });
  const before = (await api.call("GET", base, { token: owner.token })).json;
  const d = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const ran = await api.runClaimedJob(srv.agentToken, { failAt: "backup.create" });
  assert.equal(ran.job.steps.find((s) => s.action === "release.run").params.slot, "main");
  const after = (await api.call("GET", base, { token: owner.token })).json;
  assert.equal(after.currentRelease.id, before.currentRelease.id);
  const list = await api.call("GET", `${base}/deployments`, { token: owner.token });
  assert.equal(list.json.deployments[0].status, "failure");
  assert.equal(list.json.deployments[0].releaseOutput, null, "the command never ran");
  assert.equal(list.json.deployments[0].backupStatus, "failure");
  assert.equal(list.json.deployments[0].backupId, d.json.deployment.backupId);
  // Recreate: nothing was started next to the live containers, so no clean-up job.
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken })).status, 204);
});

test("without backups configured the release command still runs, just without a backup", async () => {
  const { orgId, owner, base, srv } = await setup();
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  await api.runClaimedJob(srv.agentToken);
  await api.call("PATCH", base, { token: owner.token, body: { releaseCommand: "npm run db:migrate", releaseService: "web" } });
  const d = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const steps = await jobSteps(orgId, owner, d.json.job.id);
  assert.ok(!steps.some((s) => s.action === "backup.create"));
  assert.ok(steps.some((s) => s.action === "release.run"));
});
