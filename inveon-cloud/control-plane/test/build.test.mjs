// Building on the server, per-app registry credentials and deploy keys.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, sha } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

async function setup() {
  const { orgId, owner, member } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const ctx = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  return { orgId, owner, member, srv, appPath: `/orgs/${orgId}/apps/${ctx.app.id}`, base: `/orgs/${orgId}/environments/${ctx.environment.id}`, ...ctx };
}

const PASSWORD = "ghp_registry-password-0123456789";

test("registry credentials are admin-only, validated, encrypted and never returned", async () => {
  const { orgId, owner, member, appPath, app } = await setup();
  const developer = await member("developer");
  const body = { server: "ghcr.io", username: "inveon-bot", password: PASSWORD };
  assert.equal((await api.call("PUT", `${appPath}/registry-credentials`, { token: developer.token, body })).status, 403);
  assert.equal((await api.call("PUT", `${appPath}/registry-credentials`, { token: owner.token, body: { ...body, server: "ghcr.io --password-stdin" } })).status, 400);
  assert.equal((await api.call("PUT", `${appPath}/registry-credentials`, { token: owner.token, body: { ...body, password: "a\nb" } })).status, 400);
  assert.equal((await api.call("PUT", `${appPath}/registry-credentials`, { token: owner.token, body: { ...body, username: "bot; rm" } })).status, 400);

  const set = await api.call("PUT", `${appPath}/registry-credentials`, { token: owner.token, body });
  assert.equal(set.status, 200);
  assert.deepEqual(set.json.app.registryCredentials, { server: "ghcr.io", username: "inveon-bot", password: "••••••••" });
  for (const res of [set, await api.call("GET", appPath, { token: developer.token }), await api.call("GET", `/orgs/${orgId}/apps`, { token: developer.token })]) {
    const text = JSON.stringify(res.json);
    assert.ok(!text.includes(PASSWORD), "password is write-only");
    assert.ok(!text.includes("registryPasswordEnc"));
  }
  const { rows } = await api.pool.query("SELECT registry_password_enc FROM apps WHERE id = $1", [app.id]);
  assert.match(rows[0].registry_password_enc, /^v1\./);
  assert.ok(!rows[0].registry_password_enc.includes(PASSWORD));
  const audit = await api.pool.query("SELECT metadata FROM audit_logs WHERE entity_id = $1 AND action = 'app.registry_credentials_set'", [app.id]);
  assert.ok(!JSON.stringify(audit.rows).includes(PASSWORD));

  const del = await api.call("DELETE", `${appPath}/registry-credentials`, { token: owner.token });
  assert.equal(del.json.app.registryCredentials, null);
});

test("deploy keys are generated server-side; only the public half is shown", async () => {
  const { owner, member, appPath, app } = await setup();
  const developer = await member("developer");
  assert.equal((await api.call("POST", `${appPath}/deploy-key`, { token: developer.token })).status, 403);
  const gen = await api.call("POST", `${appPath}/deploy-key`, { token: owner.token });
  assert.equal(gen.status, 201);
  assert.match(gen.json.publicKey, /^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43} inveon-cloud-/);
  const view = await api.call("GET", appPath, { token: developer.token });
  assert.equal(view.json.app.deployKey.publicKey, gen.json.publicKey);
  assert.ok(!JSON.stringify(view.json).includes("PRIVATE KEY"));
  const { rows } = await api.pool.query("SELECT deploy_key_enc FROM apps WHERE id = $1", [app.id]);
  assert.match(rows[0].deploy_key_enc, /^v1\./);
  // Regenerating replaces it.
  const again = await api.call("POST", `${appPath}/deploy-key`, { token: owner.token });
  assert.notEqual(again.json.publicKey, gen.json.publicKey);
  assert.equal((await api.call("DELETE", `${appPath}/deploy-key`, { token: owner.token })).json.app.deployKey, null);
});

test("build on the server: build step first, credentials only in the agent's copy of the job", async () => {
  const { orgId, owner, appPath, base, srv, app } = await setup();
  assert.equal((await api.call("PATCH", appPath, { token: owner.token, body: { buildOnServer: true, dockerfilePath: "../Dockerfile" } })).status, 400);
  assert.equal((await api.call("PATCH", appPath, { token: owner.token, body: { buildOnServer: true, buildContext: "/" } })).status, 400);
  const patched = await api.call("PATCH", appPath, { token: owner.token, body: { buildOnServer: true, dockerfilePath: "docker/web.Dockerfile", buildContext: "." } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.app.buildOnServer, true);
  await api.call("POST", `${appPath}/deploy-key`, { token: owner.token });
  await api.call("PUT", `${appPath}/registry-credentials`, { token: owner.token, body: { server: "ghcr.io", username: "inveon-bot", password: PASSWORD } });

  const commit = sha();
  const d = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: commit } });
  assert.equal(d.status, 201);
  const view = await api.call("GET", `/orgs/${orgId}/jobs/${d.json.job.id}`, { token: owner.token });
  const steps = view.json.steps;
  assert.deepEqual(steps.slice(0, 4).map((s) => s.action), ["image.build", "release.prepare", "compose.validate", "compose.pull"]);
  const image = `inveon-build/${app.slug}-${app.id.slice(0, 8)}:${commit}`;
  assert.deepEqual(
    { ...steps[0].params, environmentId: undefined },
    { environmentId: undefined, repoOwner: app.repoOwner, repoName: app.repoName, commitSha: commit, dockerfilePath: "docker/web.Dockerfile", context: ".", image },
  );
  assert.equal(steps[1].params.builtImage, image);
  assert.equal(steps[3].params.missingOnly, true);
  // Stored steps (and the dashboard's view of them) never hold credentials.
  const stored = JSON.stringify(view.json);
  assert.ok(!stored.includes(PASSWORD) && !stored.includes("PRIVATE KEY"));

  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  const [build, , , pull] = claim.json.job.steps;
  assert.equal(build.params.gitAuth.type, "deploy_key");
  assert.match(build.params.gitAuth.privateKey, /^-----BEGIN OPENSSH PRIVATE KEY-----\n/);
  assert.deepEqual(build.params.registryAuth, { server: "ghcr.io", username: "inveon-bot", password: PASSWORD });
  assert.deepEqual(pull.params.registryAuth, build.params.registryAuth);
});

test("without build or credentials: no build step, a plain pull, public clone", async () => {
  const { orgId, owner, appPath, base, srv } = await setup();
  const d = await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(claim.json.job.id, d.json.job.id);
  assert.ok(!claim.json.job.steps.some((s) => s.action === "image.build"));
  const pull = claim.json.job.steps.find((s) => s.action === "compose.pull");
  assert.equal(pull.params.missingOnly, false);
  assert.equal(pull.params.registryAuth, null);
  assert.equal(claim.json.job.steps[0].params.builtImage, undefined);
  await api.call("POST", `/agent/jobs/${claim.json.job.id}/finish`, { token: srv.agentToken, body: { status: "failure" } });

  // Build without a deploy key: the agent clones anonymously.
  await api.call("PATCH", appPath, { token: owner.token, body: { buildOnServer: true } });
  await api.call("POST", `${base}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const c2 = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  assert.equal(c2.json.job.steps[0].action, "image.build");
  assert.equal(c2.json.job.steps[0].params.gitAuth, null);
  assert.equal(c2.json.job.steps[0].params.dockerfilePath, "Dockerfile");
  assert.ok(orgId);
});
