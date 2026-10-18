// GitHub App: app JWTs, installation tokens, linking an installation,
// tokens for reads and clones, the preview comment and commit status, and
// the app's own webhook. Runs against the fake GitHub in helpers.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { startServer, sha, waitUntil } from "./helpers.mjs";
import { appJwt, configureGithubApp, signSetupState, verifySetupState } from "../dist/lib/github-app.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ format: "pem", type: "pkcs8" });
const APP = { appId: "4242", clientId: "Iv1.testclient", clientSecret: "test-client-secret", webhookSecret: "app-webhook-secret-0123456789" };
const FALLBACK = "ghp_fallbackfallbackfallbackfallback0000";
const sign = (secret, body) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

let api;
before(async () => {
  api = await startServer({
    INVEON_GITHUB_APP_ID: APP.appId,
    INVEON_GITHUB_APP_SLUG: "inveon-cloud-test",
    // base64 of the PEM, as one env line.
    INVEON_GITHUB_APP_PRIVATE_KEY: Buffer.from(PEM).toString("base64"),
    INVEON_GITHUB_APP_CLIENT_ID: APP.clientId,
    INVEON_GITHUB_APP_CLIENT_SECRET: APP.clientSecret,
    INVEON_GITHUB_APP_WEBHOOK_SECRET: APP.webhookSecret,
    INVEON_GITHUB_TOKEN: FALLBACK,
    INVEON_ACME_EMAIL: "ops@example.com",
  });
  api.github.configureApp({ appId: APP.appId, publicKey, clientId: APP.clientId, clientSecret: APP.clientSecret });
});
after(async () => api?.stop());

const fakeEnv = { INVEON_GITHUB_APP_ID: APP.appId, INVEON_GITHUB_APP_SLUG: "x", INVEON_GITHUB_APP_PRIVATE_KEY: PEM, INVEON_GITHUB_API_BASE: "http://127.0.0.1:1", INVEON_GITHUB_WEB_BASE: "https://github.com", INVEON_JWT_SECRET: "j".repeat(40) };

test("app JWT: RS256 with node:crypto, backdated 60 seconds, 9 minutes valid; setup state signed and expiring", () => {
  configureGithubApp(fakeEnv);
  const now = 1_700_000_000_000;
  const [h, p, s] = appJwt(now).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), { iat: 1_700_000_000 - 60, exp: 1_700_000_000 + 540, iss: APP.appId });
  assert.ok(verify("sha256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url")));

  const state = signSetupState("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", now);
  assert.deepEqual(verifySetupState(state, now + 59 * 60_000), { orgId: "00000000-0000-0000-0000-000000000001", userId: "00000000-0000-0000-0000-000000000002" });
  assert.equal(verifySetupState(state, now + 61 * 60_000), null, "an hour at most");
  assert.equal(verifySetupState(state.replace(/.$/, (c) => (c === "A" ? "B" : "A")), now), null);
  const [body, mac] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ o: "00000000-0000-0000-0000-000000000009", u: "x", e: now + 1e9 })).toString("base64url");
  assert.equal(verifySetupState(`${forged}.${mac}`, now), null);
  assert.ok(body);
  // All three settings or none.
  assert.throws(() => configureGithubApp({ ...fakeEnv, INVEON_GITHUB_APP_SLUG: undefined }), /together/);
  configureGithubApp({ ...fakeEnv, INVEON_GITHUB_APP_ID: undefined, INVEON_GITHUB_APP_SLUG: undefined, INVEON_GITHUB_APP_PRIVATE_KEY: undefined });
});

let nextInstallation = 50_000 + Math.floor(Math.random() * 1e6);

/** An organization with the app installed on GitHub account `login`, linked through the setup redirect. */
async function linkedOrg(login = `acme-${randomBytes(3).toString("hex")}`) {
  const o = await api.createOrg();
  const installationId = nextInstallation++;
  api.github.addInstallation(installationId, login);
  const install = await api.call("POST", `/orgs/${o.orgId}/github/install`, { token: o.owner.token });
  assert.equal(install.status, 200, JSON.stringify(install.json));
  const state = new URL(install.json.url).searchParams.get("state");
  const code = `code-${randomBytes(4).toString("hex")}`;
  api.github.authorizeUser(code, [installationId]);
  const r = await fetch(`${api.base}/github/setup?installation_id=${installationId}&setup_action=install&state=${encodeURIComponent(state)}&code=${code}`, { redirect: "manual" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "https://cloud.test/apps?github=linked");
  return { ...o, login, installationId, state };
}

test("linking an installation: admins only, the OAuth user must see it, one organization per installation", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const developer = await member("developer");
  const info = await api.call("GET", `/orgs/${orgId}/github`, { token: developer.token });
  assert.deepEqual(info.json, { app: { slug: "inveon-cloud-test", canLink: true, webhook: true }, installations: [] });
  assert.equal((await api.call("POST", `/orgs/${orgId}/github/install`, { token: developer.token })).status, 403);
  const install = await api.call("POST", `/orgs/${orgId}/github/install`, { token: owner.token });
  const url = new URL(install.json.url);
  assert.equal(url.origin + url.pathname, `${api.github.url}/apps/inveon-cloud-test/installations/new`);
  const state = url.searchParams.get("state");

  const id = nextInstallation++;
  api.github.addInstallation(id, "Victim-Org");
  const setup = (q) => fetch(`${api.base}/github/setup?${new URLSearchParams(q)}`, { redirect: "manual" }).then((r) => r.headers.get("location"));
  // Someone else's installation id: this GitHub user can't see it.
  api.github.authorizeUser("c-other", [id + 1]);
  assert.equal(await setup({ installation_id: id, setup_action: "install", state, code: "c-other" }), "https://cloud.test/apps?github_error=not_yours");
  assert.equal(await setup({ installation_id: id, setup_action: "install", state: state.slice(0, -2) + "xx", code: "c-other" }), "https://cloud.test/apps?github_error=expired");
  assert.equal(await setup({ installation_id: id, setup_action: "install", state }), "https://cloud.test/apps?github_error=bad_request");
  assert.equal(await setup({ setup_action: "request", state }), "https://cloud.test/apps?github=requested");
  // An OAuth code works once.
  api.github.authorizeUser("c-good", [id]);
  assert.equal(await setup({ installation_id: id, setup_action: "install", state, code: "c-good" }), "https://cloud.test/apps?github=linked");
  assert.equal(await setup({ installation_id: id, setup_action: "install", state, code: "c-good" }), "https://cloud.test/apps?github_error=github");
  const listed = await api.call("GET", `/orgs/${orgId}/github`, { token: developer.token });
  assert.equal(listed.json.installations.length, 1);
  assert.equal(listed.json.installations[0].accountLogin, "Victim-Org");
  assert.equal(listed.json.installations[0].installationId, id);

  // Another organization can't take it over.
  const other = await api.createOrg();
  const otherState = new URL((await api.call("POST", `/orgs/${other.orgId}/github/install`, { token: other.owner.token })).json.url).searchParams.get("state");
  api.github.authorizeUser("c-again", [id]);
  assert.equal(await setup({ installation_id: id, setup_action: "install", state: otherState, code: "c-again" }), "https://cloud.test/apps?github_error=linked_elsewhere");
  // A state made for an organization where that user is no longer an admin.
  await api.pool.query("UPDATE memberships SET role = 'developer' WHERE org_id = $1 AND user_id = $2", [other.orgId, other.owner.id]);
  api.github.authorizeUser("c-dev", [id]);
  assert.equal(await setup({ installation_id: id, setup_action: "install", state: otherState, code: "c-dev" }), "https://cloud.test/apps?github_error=forbidden");

  const unlinked = await api.call("DELETE", `/orgs/${orgId}/github/installations/${listed.json.installations[0].id}`, { token: owner.token });
  assert.equal(unlinked.status, 200);
  const log = await api.pool.query("SELECT action FROM audit_logs WHERE org_id = $1 AND action LIKE 'github.%' ORDER BY created_at", [orgId]);
  assert.deepEqual(log.rows.map((r) => r.action), ["github.link", "github.unlink"]);
});

test("reads and clones use a short-lived installation token for this repo only; other repos fall back", async () => {
  const { orgId, owner, login, installationId } = await linkedOrg();
  const srv = await api.registerServer(orgId, owner);
  const before = api.github.calls.length;
  const { app, environment } = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId, owner_: login });
  const deploy = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: {} });
  assert.equal(deploy.status, 201, JSON.stringify(deploy.json));
  const reads = api.github.calls.slice(before).filter((c) => c.path.startsWith(`/repos/${login}/`));
  assert.ok(reads.length >= 2);
  for (const r of reads) {
    const t = api.github.tokens.get(r.auth.replace(/^Bearer /, ""));
    assert.ok(t, `${r.path} used an installation token`);
    assert.equal(t.installationId, installationId);
    assert.deepEqual(t.repositories, [app.repoName]);
    assert.deepEqual(t.permissions, { contents: "read" });
  }
  // Cached: one token for every read.
  assert.equal(new Set(reads.map((r) => r.auth)).size, 1);
  await api.runClaimedJob(srv.agentToken);

  // A build clones with a token as well (instead of the deploy key), sent only in the agent's copy.
  const appPath = `/orgs/${orgId}/apps/${app.id}`;
  await api.call("PATCH", appPath, { token: owner.token, body: { buildOnServer: true, dockerfilePath: "Dockerfile", buildContext: "." } });
  await api.call("POST", `${appPath}/deploy-key`, { token: owner.token });
  const d = await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const stored = await api.call("GET", `/orgs/${orgId}/jobs/${d.json.job.id}`, { token: owner.token });
  assert.ok(!JSON.stringify(stored.json).includes("ghs_"));
  const claim = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  const gitAuth = claim.json.job.steps[0].params.gitAuth;
  assert.equal(gitAuth.type, "token");
  assert.match(gitAuth.token, /^ghs_/);
  assert.deepEqual(api.github.tokens.get(gitAuth.token).repositories, [app.repoName]);

  // A repo whose owner has no linked installation: INVEON_GITHUB_TOKEN reads, the deploy key clones.
  const plain = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId, owner_: "someone-else" });
  assert.equal((await api.call("POST", `/orgs/${orgId}/environments/${plain.environment.id}/deploy`, { token: owner.token, body: {} })).status, 201);
  const reads2 = api.github.calls.filter((c) => c.path.startsWith(`/repos/someone-else/${plain.repo}/`));
  assert.ok(reads2.length >= 1);
  assert.ok(reads2.every((c) => c.auth === `Bearer ${FALLBACK}`));
});

async function previewSetup() {
  const ctx = await linkedOrg();
  const srv = await api.registerServer(ctx.orgId, ctx.owner);
  const previewSrv = await api.registerServer(ctx.orgId, ctx.owner, { hostname: "preview-1" });
  const appCtx = await api.createAppWithEnvironment(ctx.orgId, ctx.owner, { serverId: srv.serverId, owner_: ctx.login });
  const domain = `preview-${randomBytes(4).toString("hex")}.example.com`;
  const r = await api.call("PATCH", `/orgs/${ctx.orgId}/apps/${appCtx.app.id}`, { token: ctx.owner.token, body: { previewsEnabled: true, previewServerId: previewSrv.serverId, previewBaseDomain: domain } });
  assert.equal(r.status, 200);
  const full = `${ctx.login}/${appCtx.repo}`;
  const prEvent = (action, number, headSha) => ({
    action,
    number,
    installation: { id: ctx.installationId },
    pull_request: { title: `PR ${number}`, head: { sha: headSha, repo: { full_name: full } }, base: { repo: { full_name: full } } },
    repository: { full_name: full },
  });
  const hook = async (event, payload) => {
    const raw = JSON.stringify(payload);
    return api.call("POST", `/webhooks/github/${appCtx.app.id}`, { raw, headers: { "X-GitHub-Event": event, "Content-Type": "application/json", "X-Hub-Signature-256": sign(appCtx.webhookSecret, raw) } });
  };
  const commentsFor = (pr) => [...api.github.comments.entries()].filter(([, c]) => c.repo === full && c.pr === pr);
  return { ...ctx, ...appCtx, previewSrv, domain, full, prEvent, hook, commentsFor };
}

test("one comment per pull request, updated as the preview deploys, fails, redeploys and is torn down; commit statuses too", async () => {
  const p = await previewSetup();
  const head1 = sha();
  const opened = await p.hook("pull_request", p.prEvent("opened", 7, head1));
  assert.equal(opened.status, 202, JSON.stringify(opened.json));
  await waitUntil(() => p.commentsFor(7).length === 1 && p.commentsFor(7)[0][1].body.includes("Deploying"));
  const [commentId] = p.commentsFor(7)[0];
  assert.match(p.commentsFor(7)[0][1].body, /<!-- inveon-cloud-preview -->/);
  await waitUntil(() => api.github.statuses.some((s) => s.sha === head1 && s.state === "pending"));
  const pending = api.github.statuses.find((s) => s.sha === head1);
  assert.equal(pending.context, "inveon-cloud/preview");

  await api.runClaimedJob(p.previewSrv.agentToken);
  const url = `http://pr-7.${p.domain}`;
  await waitUntil(() => p.commentsFor(7)[0][1].body.includes("Live at"));
  assert.ok(p.commentsFor(7)[0][1].body.includes(url));
  await waitUntil(() => api.github.statuses.some((s) => s.sha === head1 && s.state === "success"));
  assert.equal(api.github.statuses.find((s) => s.sha === head1 && s.state === "success").target_url, url);
  // The comment token may only write PRs and statuses of this repo.
  const commentToken = [...api.github.tokens.values()].find((t) => t.permissions.pull_requests === "write" && t.installationId === p.installationId);
  assert.deepEqual(commentToken.repositories, [p.repo]);
  // The preview's certificate job is next on that server; let it pass.
  await api.runClaimedJob(p.previewSrv.agentToken);

  // A failing push: the same comment, now saying it failed.
  const head2 = sha();
  await p.hook("pull_request", p.prEvent("synchronize", 7, head2));
  await api.runClaimedJob(p.previewSrv.agentToken, { failAt: "health.check" });
  await waitUntil(() => p.commentsFor(7)[0][1].body.includes("failed"));
  await waitUntil(() => api.github.statuses.some((s) => s.sha === head2 && s.state === "failure"));
  assert.equal(p.commentsFor(7).length, 1);
  assert.equal(p.commentsFor(7)[0][0], commentId);
  // Its clean-up job.
  await api.runClaimedJob(p.previewSrv.agentToken);

  // Somebody deleted the comment: the next update posts a new one.
  api.github.comments.delete(commentId);
  const head3 = sha();
  await p.hook("pull_request", p.prEvent("synchronize", 7, head3));
  await api.runClaimedJob(p.previewSrv.agentToken);
  await waitUntil(() => p.commentsFor(7).length === 1 && p.commentsFor(7)[0][1].body.includes("Live at"));
  const newId = p.commentsFor(7)[0][0];
  assert.notEqual(newId, commentId);

  // Closed: torn down, and the comment says so.
  await p.hook("pull_request", p.prEvent("closed", 7, head3));
  const teardown = await api.runClaimedJob(p.previewSrv.agentToken);
  assert.equal(teardown.job.type, "preview_teardown");
  await waitUntil(() => p.commentsFor(7)[0][1].body.includes("Torn down"));
  assert.ok(!p.commentsFor(7)[0][1].body.includes(url));
  assert.equal(p.commentsFor(7).length, 1);
  const row = await api.pool.query("SELECT comment_id FROM github_pr_comments WHERE app_id = $1 AND pr_number = 7", [p.app.id]);
  assert.equal(Number(row.rows[0].comment_id), newId);
});

test("the app's own webhook: signed, deploys pushes and previews for linked repos, and tracks suspension and uninstalls", async () => {
  const p = await previewSetup();
  const appHook = (event, payload, secret = APP.webhookSecret) => {
    const raw = JSON.stringify(payload);
    return api.call("POST", "/webhooks/github-app", { raw, headers: { "X-GitHub-Event": event, "Content-Type": "application/json", "X-Hub-Signature-256": sign(secret, raw) } });
  };
  assert.equal((await appHook("push", {}, "wrong-secret-wrong-secret")).status, 401);
  const head = sha();
  api.github.setHead(p.login, p.repo, "main", head);
  const push = await appHook("push", { ref: "refs/heads/main", after: head, installation: { id: p.installationId }, repository: { full_name: p.full } });
  assert.equal(push.status, 202, JSON.stringify(push.json));
  assert.equal(push.json.apps.length, 1);
  assert.equal(push.json.apps[0].appId, p.app.id);
  assert.equal(push.json.apps[0].jobIds.length, 1);
  // Unknown installations and repos of other accounts do nothing.
  assert.equal((await appHook("push", { ref: "refs/heads/main", after: head, installation: { id: 1 }, repository: { full_name: p.full } })).json.ignored, "no linked organization for this repository");
  assert.equal((await appHook("push", { ref: "refs/heads/main", after: head, installation: { id: p.installationId }, repository: { full_name: `someone-else/${p.repo}` } })).json.ignored, "no linked organization for this repository");
  // Pull requests too.
  const pr = await appHook("pull_request", p.prEvent("opened", 3, sha()));
  assert.equal(pr.json.apps[0].jobIds.length, 1);

  // Suspended: not used (reads fall back to INVEON_GITHUB_TOKEN), then back.
  assert.equal((await appHook("installation", { action: "suspend", installation: { id: p.installationId } })).status, 200);
  const before = api.github.calls.length;
  await api.call("POST", `/orgs/${p.orgId}/environments/${p.environment.id}/deploy`, { token: p.owner.token, body: { commitSha: sha() } });
  const suspendedReads = api.github.calls.slice(before).filter((c) => c.method === "GET" && /^\/repos\/[^/]+\/[^/]+\/(contents|commits)\//.test(c.path));
  assert.ok(suspendedReads.length >= 1);
  assert.ok(suspendedReads.every((c) => c.auth === `Bearer ${FALLBACK}`), JSON.stringify(suspendedReads.map((c) => c.auth)));
  await appHook("installation", { action: "unsuspend", installation: { id: p.installationId } });
  const listed = await api.call("GET", `/orgs/${p.orgId}/github`, { token: p.owner.token });
  assert.equal(listed.json.installations[0].suspendedAt, null);
  // Uninstalled: unlinked.
  await appHook("installation", { action: "deleted", installation: { id: p.installationId } });
  assert.deepEqual((await api.call("GET", `/orgs/${p.orgId}/github`, { token: p.owner.token })).json.installations, []);
  const log = await api.pool.query("SELECT action FROM audit_logs WHERE org_id = $1 AND action LIKE 'github.installation_%' ORDER BY created_at", [p.orgId]);
  assert.deepEqual(log.rows.map((r) => r.action), ["github.installation_suspend", "github.installation_unsuspend", "github.installation_deleted"]);
});
