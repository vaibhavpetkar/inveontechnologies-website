// Preview environments per pull request.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { startServer, sha } from "./helpers.mjs";

let api;
before(async () => (api = await startServer({ INVEON_ACME_EMAIL: "ops@example.com" })));
after(async () => api?.stop());

const sign = (secret, body) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

async function setup({ enable = true } = {}) {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const previewSrv = await api.registerServer(orgId, owner, { hostname: "preview-1" });
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  const appPath = `/orgs/${orgId}/apps/${ctx.app.id}`;
  // Hostnames are globally unique: a fresh base domain per test keeps reruns independent.
  const domain = `preview-${randomBytes(4).toString("hex")}.example.com`;
  if (enable) {
    const r = await api.call("PATCH", appPath, {
      token: owner.token,
      body: { previewsEnabled: true, previewServerId: previewSrv.serverId, previewBaseDomain: domain.toUpperCase(), previewVarsFromEnvironmentId: ctx.environment.id },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const hook = async (event, payload) => {
    const raw = JSON.stringify(payload);
    return api.call("POST", `/webhooks/github/${ctx.app.id}`, { raw, headers: { "X-GitHub-Event": event, "Content-Type": "application/json", "X-Hub-Signature-256": sign(ctx.webhookSecret, raw) } });
  };
  const full = `${ctx.repoOwner}/${ctx.repo}`;
  const prEvent = (action, number, headSha, headRepo = full) => ({
    action,
    number,
    pull_request: { title: `PR ${number}`, head: { sha: headSha, ref: "feature", repo: { full_name: headRepo } }, base: { ref: "main", repo: { full_name: full } } },
    repository: { full_name: full },
  });
  return { orgId, owner, member, srv, previewSrv, appPath, hook, prEvent, full, domain, ...ctx };
}

test("preview settings: admin-only, complete, same org, own environments only", async () => {
  const { orgId, owner, member, appPath, previewSrv, environment } = await setup({ enable: false });
  const developer = await member("developer");
  const other = await api.createOrg();
  const otherSrv = await api.registerServer(other.orgId, other.owner);
  const otherApp = await api.createAppWithEnvironment(other.orgId, other.owner, { serverId: otherSrv.serverId });

  const patch = (token, body) => api.call("PATCH", appPath, { token, body });
  assert.equal((await patch(developer.token, { previewsEnabled: true })).status, 403);
  assert.equal((await patch(owner.token, { previewsEnabled: true })).status, 400, "needs a server and base domain");
  assert.equal((await patch(owner.token, { previewsEnabled: true, previewServerId: otherSrv.serverId, previewBaseDomain: "preview.example.com" })).status, 404);
  assert.equal((await patch(owner.token, { previewsEnabled: true, previewServerId: previewSrv.serverId, previewBaseDomain: "*.example.com" })).status, 400);
  assert.equal((await patch(owner.token, { previewVarsFromEnvironmentId: otherApp.environment.id })).status, 400);
  const ok = await patch(owner.token, { previewsEnabled: true, previewServerId: previewSrv.serverId, previewBaseDomain: "preview.example.com", previewVarsFromEnvironmentId: environment.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.app.previewsEnabled, true);
  assert.equal(ok.json.app.previewBaseDomain, "preview.example.com");
  assert.ok(orgId);
});

test("opened PR creates pr-<n> on the preview server with its domain and copied variables, and deploys the head", async () => {
  const { orgId, owner, hook, prEvent, previewSrv, srv, environment, app, appPath, domain } = await setup();
  const base = `/orgs/${orgId}/environments/${environment.id}`;
  await api.call("PUT", `${base}/vars/API_URL`, { token: owner.token, body: { value: "https://staging.api", isSecret: false } });
  await api.call("PUT", `${base}/vars/DB_PASSWORD`, { token: owner.token, body: { value: "s3cret-pw", isSecret: true } });

  const head = sha();
  const res = await hook("pull_request", prEvent("opened", 12, head));
  assert.equal(res.status, 202, JSON.stringify(res.json));
  assert.equal(res.json.jobIds.length, 1);

  const detail = await api.call("GET", appPath, { token: owner.token });
  const preview = detail.json.environments.find((e) => e.name === "pr-12");
  assert.ok(preview);
  assert.equal(preview.previewPr, 12);
  assert.equal(preview.serverId, previewSrv.serverId);
  assert.equal(preview.autoDeploy, false);
  const domains = await api.call("GET", `/orgs/${orgId}/environments/${preview.id}/domains`, { token: owner.token });
  assert.deepEqual(domains.json.domains.map((d) => [d.hostname, d.status]), [[`pr-12.${domain}`, "pending_dns"]]);
  const vars = await api.call("GET", `/orgs/${orgId}/environments/${preview.id}/vars`, { token: owner.token });
  assert.deepEqual(vars.json.vars.map((v) => [v.key, v.isSecret, v.value]), [["API_URL", false, "https://staging.api"], ["DB_PASSWORD", true, null]]);

  // The production server gets nothing; the preview server gets the deploy, with the copied secret.
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken })).status, 204);
  const ran = await api.runClaimedJob(previewSrv.agentToken);
  assert.equal(ran.job.id, res.json.jobIds[0]);
  assert.equal(ran.job.steps[0].params.commitSha, head);
  assert.equal(ran.job.steps[0].params.env.DB_PASSWORD, "s3cret-pw");
  assert.equal(ran.finish.status, "success");
  const rel = await api.pool.query("SELECT source, commit_message FROM releases WHERE app_id = $1 AND commit_sha = $2", [app.id, head]);
  assert.deepEqual(rel.rows[0], { source: "pull_request", commit_message: "PR 12" });

  // First deploy done: the certificate job for the preview hostname follows.
  const cert = await api.call("POST", "/agent/jobs/claim", { token: previewSrv.agentToken });
  assert.equal(cert.json.job.type, "domain_issue");
  assert.deepEqual(cert.json.job.steps.map((s) => s.action), ["nginx.write_site", "nginx.reload", "certbot.issue", "nginx.write_site", "nginx.reload"]);
  assert.equal(cert.json.job.steps[0].params.hostname, `pr-12.${domain}`);
  assert.equal(cert.json.job.steps[0].params.slug, preview.slug);

  // synchronize: same environment, the new head is deployed.
  await api.call("POST", `/agent/jobs/${cert.json.job.id}/finish`, { token: previewSrv.agentToken, body: { status: "failure" } });
  const next = sha();
  const sync = await hook("pull_request", prEvent("synchronize", 12, next));
  assert.equal(sync.json.environmentId, preview.id);
  const again = await api.call("POST", "/agent/jobs/claim", { token: previewSrv.agentToken });
  assert.equal(again.json.job.steps[0].params.commitSha, next);
  assert.equal(again.json.job.steps.find((s) => s.action === "compose.up").params.slot, "green");
});

test("pushes to the branch never deploy previews; forks and disabled previews are ignored", async () => {
  const { hook, prEvent, previewSrv, srv, appPath, owner, app } = await setup();
  const opened = await hook("pull_request", prEvent("opened", 3, sha()));
  await api.runClaimedJob(previewSrv.agentToken);
  assert.equal(opened.status, 202);

  const commit = sha();
  const push = await hook("push", { ref: "refs/heads/main", after: commit, head_commit: { message: "merge" } });
  assert.equal(push.json.jobIds.length, 1, "only production");
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken })).json.job.id, push.json.jobIds[0]);

  const fork = await hook("pull_request", prEvent("opened", 4, sha(), "someone/fork"));
  assert.equal(fork.status, 202);
  assert.match(fork.json.ignored, /forks/);
  const labeled = await hook("pull_request", prEvent("labeled", 3, sha()));
  assert.match(labeled.json.ignored, /labeled/);
  const envs = (await api.call("GET", appPath, { token: owner.token })).json.environments.map((e) => e.name).sort();
  assert.deepEqual(envs, ["pr-3", "production"]);

  await api.call("PATCH", appPath, { token: owner.token, body: { previewsEnabled: false } });
  const off = await hook("pull_request", prEvent("opened", 5, sha()));
  assert.match(off.json.ignored, /previews are off/);
  assert.ok(app);
});

test("closing the PR tears the preview down completely, then deletes it", async () => {
  const { orgId, owner, hook, prEvent, previewSrv, appPath, domain } = await setup();
  await hook("pull_request", prEvent("opened", 21, sha()));
  await api.runClaimedJob(previewSrv.agentToken); // deploy
  const preview = (await api.call("GET", appPath, { token: owner.token })).json.environments.find((e) => e.name === "pr-21");
  // The certificate job is still queued when the PR closes.
  const closed = await hook("pull_request", prEvent("closed", 21, sha()));
  assert.equal(closed.status, 202);
  assert.equal(closed.json.teardown, true);
  // Closing twice doesn't queue a second teardown.
  assert.equal((await hook("pull_request", prEvent("closed", 21, sha()))).json.jobId, closed.json.jobId);

  const view = await api.call("GET", `/orgs/${orgId}/jobs/${closed.json.jobId}`, { token: owner.token });
  assert.deepEqual(
    view.json.steps.map((s) => [s.action, s.params.slot ?? s.params.hostname ?? s.params.slug ?? null]),
    [
      ["compose.down", "blue"],
      ["compose.down", "green"],
      ["nginx.remove_site", `pr-21.${domain}`],
      ["certbot.delete", `pr-21.${domain}`],
      ["nginx.remove_upstream", preview.slug],
      ["nginx.reload", null],
      ["app.remove_folder", preview.slug],
    ],
  );
  assert.ok(view.json.steps.filter((s) => s.action === "compose.down").every((s) => s.params.removeVolumes === true));

  // The cert job (queued first) runs, then the teardown.
  const cert = await api.call("POST", "/agent/jobs/claim", { token: previewSrv.agentToken });
  assert.equal(cert.json.job.type, "domain_issue");
  await api.call("POST", `/agent/jobs/${cert.json.job.id}/finish`, { token: previewSrv.agentToken, body: { status: "failure" } });
  // A synchronize that lands mid-teardown is refused rather than redeploying.
  const late = await hook("pull_request", prEvent("synchronize", 21, sha()));
  assert.match(late.json.ignored, /torn down/);

  const td = await api.runClaimedJob(previewSrv.agentToken);
  assert.equal(td.job.id, closed.json.jobId);
  assert.equal(td.finish.status, "success");
  const envs = (await api.call("GET", appPath, { token: owner.token })).json.environments.map((e) => e.name);
  assert.ok(!envs.includes("pr-21"));
  const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM domains WHERE hostname = $1", [`pr-21.${domain}`]);
  assert.equal(rows[0].n, 0);

  // Reopening creates a fresh preview.
  const reopened = await hook("pull_request", prEvent("reopened", 21, sha()));
  assert.equal(reopened.json.jobIds.length, 1);
  assert.notEqual(reopened.json.environmentId, preview.id);
});

test("a preview can be torn down from the dashboard; a failed teardown keeps it for a retry", async () => {
  const { orgId, owner, member, hook, prEvent, previewSrv, appPath } = await setup();
  const developer = await member("developer");
  await hook("pull_request", prEvent("opened", 8, sha()));
  await api.runClaimedJob(previewSrv.agentToken);
  await api.runClaimedJob(previewSrv.agentToken); // certificate
  const preview = (await api.call("GET", appPath, { token: owner.token })).json.environments.find((e) => e.name === "pr-8");
  const path = `/orgs/${orgId}/environments/${preview.id}`;
  assert.equal((await api.call("DELETE", path, { token: developer.token })).status, 403);
  const del = await api.call("DELETE", path, { token: owner.token });
  assert.equal(del.status, 202);
  assert.equal(del.json.pending, true);
  const failed = await api.runClaimedJob(previewSrv.agentToken, { failAt: "nginx.remove_site" });
  assert.equal(failed.job.id, del.json.jobId);
  assert.equal((await api.call("GET", path, { token: owner.token })).status, 200, "kept after a failed teardown");

  const retry = await api.call("DELETE", path, { token: owner.token });
  assert.notEqual(retry.json.jobId, del.json.jobId);
  await api.runClaimedJob(previewSrv.agentToken);
  assert.equal((await api.call("GET", path, { token: owner.token })).status, 404);
});

test("an existing non-preview environment named pr-<n> is never touched", async () => {
  const { orgId, owner, hook, prEvent, app, previewSrv } = await setup();
  const manual = await api.call("POST", `/orgs/${orgId}/apps/${app.id}/environments`, { token: owner.token, body: { name: "pr-9", serverId: previewSrv.serverId } });
  assert.equal(manual.status, 201);
  const res = await hook("pull_request", prEvent("opened", 9, sha()));
  assert.match(res.json.ignored, /not a preview/);
  const closed = await hook("pull_request", prEvent("closed", 9, sha()));
  assert.match(closed.json.ignored, /no preview/);
});
