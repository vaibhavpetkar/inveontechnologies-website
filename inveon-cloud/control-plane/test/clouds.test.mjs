// DigitalOcean and Hetzner servers (against the fakes in fake-clouds.mjs),
// and stop, start and resize on all three clouds (EC2 through fake-aws.mjs).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { startServer, freePort } from "./helpers.mjs";
import { startFakeClouds } from "./fake-clouds.mjs";
import { nextProvisionState } from "../dist/modules/cloud/state.js";

let api;
let clouds;
let aws;
const DO_TOKEN = "dop_v1_" + "a".repeat(64);
const HZ_TOKEN = "H".repeat(64);

before(async () => {
  clouds = await startFakeClouds();
  clouds.state.tokens.digitalocean.add(DO_TOKEN);
  clouds.state.tokens.hetzner.add(HZ_TOKEN);
  const port = await freePort();
  api = await startServer({ ...clouds.env, FAKE_AWS_PORT: String(port) }, { nodeArgs: ["--import", fileURLToPath(new URL("./fake-aws.mjs", import.meta.url))] });
  const base = `http://127.0.0.1:${port}`;
  const req = async (method, path, body) => (await fetch(base + path, { method, body: body ? JSON.stringify(body) : undefined })).json();
  aws = { calls: async (method) => (await req("GET", "/calls")).filter((c) => !method || c.method === method), setInstance: (id, patch) => req("POST", `/instances/${id}`, patch) };
});
after(async () => {
  await api?.stop();
  await clouds?.close();
});

async function connected(provider) {
  const o = await api.createOrg();
  const r = await api.call("PUT", `/orgs/${o.orgId}/clouds/${provider}`, { token: o.owner.token, body: { token: provider === "digitalocean" ? DO_TOKEN : HZ_TOKEN } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return o;
}

const installToken = (userData) => userData.match(/bash -s -- '([A-Za-z0-9_-]+)'$/m)[1];

test("cloud connections: verified before saving, encrypted, write-only, admins only", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const developer = await member("developer");
  assert.equal((await api.call("GET", `/orgs/${orgId}/clouds`, { token: developer.token })).status, 403);
  const empty = await api.call("GET", `/orgs/${orgId}/clouds`, { token: owner.token });
  assert.deepEqual(empty.json.connections.map((c) => [c.provider, c.connected]), [["digitalocean", false], ["hetzner", false]]);

  for (const bad of ["short", "a b c d e f g h i j k l m n o p", "x".repeat(401), `${DO_TOKEN}"`]) {
    assert.equal((await api.call("PUT", `/orgs/${orgId}/clouds/digitalocean`, { token: owner.token, body: { token: bad } })).status, 400);
  }
  assert.equal((await api.call("PUT", `/orgs/${orgId}/clouds/vultr`, { token: owner.token, body: { token: DO_TOKEN } })).status, 400);
  assert.equal((await api.call("PUT", `/orgs/${orgId}/clouds/digitalocean`, { token: owner.token, body: { token: DO_TOKEN, extra: 1 } })).status, 400);
  // The provider refuses the token: nothing is saved.
  const refused = await api.call("PUT", `/orgs/${orgId}/clouds/digitalocean`, { token: owner.token, body: { token: "dop_v1_" + "b".repeat(64) } });
  assert.equal(refused.json.error.code, "PROVIDER_VERIFY_FAILED");
  assert.match(refused.json.error.message, /Unable to authenticate/);

  const ok = await api.call("PUT", `/orgs/${orgId}/clouds/digitalocean`, { token: owner.token, body: { token: DO_TOKEN } });
  assert.equal(ok.json.connection.accountLabel, "Inveon");
  assert.equal(ok.json.connection.tokenHint, "…aaaa");
  const hz = await api.call("PUT", `/orgs/${orgId}/clouds/hetzner`, { token: owner.token, body: { token: HZ_TOKEN } });
  assert.equal(hz.json.connection.connected, true);
  const list = await api.call("GET", `/orgs/${orgId}/clouds`, { token: owner.token });
  assert.ok(!JSON.stringify(list.json).includes(DO_TOKEN) && !JSON.stringify(list.json).includes(HZ_TOKEN));
  const { rows } = await api.pool.query("SELECT provider, token_enc FROM provider_connections WHERE org_id = $1 ORDER BY provider", [orgId]);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.ok(r.token_enc.startsWith("v1.") && !r.token_enc.includes(DO_TOKEN) && !r.token_enc.includes(HZ_TOKEN));
  // The token only ever goes to the provider, in the Authorization header.
  assert.ok(clouds.calls("digitalocean", "GET", "/account").some((c) => c.auth === `Bearer ${DO_TOKEN}`));
  const audit = await api.call("GET", `/orgs/${orgId}/audit`, { token: owner.token });
  const entries = audit.json.entries.filter((e) => e.action === "cloud.connect");
  assert.equal(entries.length, 2);
  assert.ok(!JSON.stringify(entries).includes(DO_TOKEN));
});

test("DigitalOcean: options, strict create with cloud-init and tags, pending -> running -> agent online, terminate", async () => {
  const { orgId, owner } = await connected("digitalocean");
  const opts = await api.call("GET", `/orgs/${orgId}/clouds/digitalocean/options`, { token: owner.token });
  assert.deepEqual(opts.json.regions.map((r) => r.id), ["blr1", "fra1"], "unavailable regions are left out");
  assert.deepEqual(opts.json.images.map((i) => i.id), ["ubuntu-24-04-x64", "debian-12-x64"], "only Ubuntu and Debian");
  assert.deepEqual(opts.json.sizes[0], { id: "s-1vcpu-2gb", vcpu: 1, memoryGb: 2, diskGb: 50, priceMonthly: 12, regions: ["blr1", "fra1"], arch: "x86_64" });

  const body = { provider: "digitalocean", name: "Web 1", region: "blr1", size: "s-1vcpu-2gb", image: "ubuntu-24-04-x64" };
  for (const over of [{ region: "mars1" }, { region: "blr1; rm" }, { size: "s-8vcpu-16gb" }, { size: "gpu-h100" }, { image: "fedora-40-x64" }, { userData: "#!/bin/bash" }, { name: "" }]) {
    const r = await api.call("POST", `/orgs/${orgId}/servers/cloud`, { token: owner.token, body: { ...body, ...over } });
    assert.equal(r.status, 400, JSON.stringify(over));
  }
  assert.equal(clouds.calls("digitalocean", "POST", "/droplets").filter((c) => c.body.tags.includes(`inveon-org-id:${orgId}`)).length, 0);

  const res = await api.call("POST", `/orgs/${orgId}/servers/cloud`, { token: owner.token, body });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const server = res.json.server;
  assert.deepEqual([server.provider, server.provisionState, server.cloudRegion, server.cloudSize, server.cloudImage], ["digitalocean", "pending", "blr1", "s-1vcpu-2gb", "ubuntu-24-04-x64"]);
  const create = clouds.calls("digitalocean", "POST", "/droplets").at(-1).body;
  assert.equal(create.name, `web-1-${server.id.slice(0, 8)}`);
  assert.deepEqual(create.tags, [`inveon-server-id:${server.id}`, `inveon-org-id:${orgId}`, "inveon-managed-by:inveon-cloud"]);
  assert.ok(create.user_data.startsWith("#!/bin/bash\n"));
  const token = installToken(create.user_data);
  const droplet = clouds.state.droplets.get(Number(server.cloudInstanceId));

  droplet.status = "active";
  droplet.networks.v4 = [{ ip_address: "203.0.113.40", type: "public" }, { ip_address: "10.110.0.4", type: "private" }];
  const refreshed = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/refresh`, { token: owner.token });
  assert.deepEqual([refreshed.json.server.provisionState, refreshed.json.server.cloudState, refreshed.json.server.ipAddress, refreshed.json.server.privateIpAddress], ["running", "active", "203.0.113.40", "10.110.0.4"]);
  const reg = await api.call("POST", "/agent/register", { body: { token, facts: { hostname: "web-1" } } });
  assert.equal(reg.status, 201);
  assert.equal((await api.call("GET", `/orgs/${orgId}/servers/${server.id}`, { token: owner.token })).json.server.provisionState, "agent_online");

  // A droplet that isn't tagged as this server is never deleted.
  droplet.tags = ["inveon-server-id:someone-else"];
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "Web 1" } })).json.error.code, "INSTANCE_MISMATCH");
  droplet.tags = create.tags;
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "web 1" } })).json.error.code, "CONFIRMATION_MISMATCH");
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/clouds/digitalocean`, { token: owner.token })).status, 409, "the connection is in use");
  const term = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "Web 1" } });
  assert.equal(term.json.server.provisionState, "terminating");
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: reg.json.agentToken })).status, 401, "the agent is cut off at once");
  assert.ok(!clouds.state.droplets.has(droplet.id));
  const gone = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/refresh`, { token: owner.token });
  assert.equal(gone.json.server.provisionState, "terminated");
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/servers/${server.id}`, { token: owner.token })).status, 200);
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/clouds/digitalocean`, { token: owner.token })).status, 200);
});

test("Hetzner: labels, location and server type checks, a failed create leaves nothing behind", async () => {
  const { orgId, owner } = await connected("hetzner");
  const opts = await api.call("GET", `/orgs/${orgId}/clouds/hetzner/options`, { token: owner.token });
  assert.deepEqual(opts.json.sizes.map((s) => s.id), ["cx22", "cx32", "cax11"], "deprecated types are left out");
  assert.equal(opts.json.sizes.find((s) => s.id === "cax11").arch, "arm64");
  assert.deepEqual(opts.json.images.map((i) => i.id), ["ubuntu-24.04"]);
  assert.equal(opts.json.sizes[0].priceMonthly, 4.51);

  const body = { provider: "hetzner", name: "db-1", region: "hel1", size: "cax11", image: "ubuntu-24.04" };
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/cloud`, { token: owner.token, body })).json.error.code, "INVALID_SIZE", "cax11 isn't sold in hel1");

  clouds.failNext("hetzner POST /servers", 403, "insufficient permissions for this token");
  const failed = await api.call("POST", `/orgs/${orgId}/servers/cloud`, { token: owner.token, body: { ...body, region: "fsn1" } });
  assert.equal(failed.status, 502);
  assert.match(failed.json.error.message, /insufficient permissions/);
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM servers WHERE org_id = $1", [orgId])).rows[0].n, 0);

  const res = await api.call("POST", `/orgs/${orgId}/servers/cloud`, { token: owner.token, body: { ...body, region: "fsn1" } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const create = clouds.calls("hetzner", "POST", "/servers").at(-1).body;
  assert.deepEqual(create.labels, { "inveon-server-id": res.json.server.id, "inveon-org-id": orgId, "inveon-managed-by": "inveon-cloud" });
  assert.deepEqual([create.server_type, create.location, create.image, create.start_after_create], ["cax11", "fsn1", "ubuntu-24.04", true]);
  assert.match(create.user_data, /install\.sh' \| bash -s -- '/);
});

async function onlineCloudServer(provider) {
  const o = await connected(provider);
  const body = provider === "digitalocean" ? { provider, name: "app-1", region: "fra1", size: "s-1vcpu-2gb", image: "ubuntu-24-04-x64" } : { provider, name: "app-1", region: "fsn1", size: "cx22", image: "ubuntu-24.04" };
  const server = (await api.call("POST", `/orgs/${o.orgId}/servers/cloud`, { token: o.owner.token, body })).json.server;
  const remote = provider === "digitalocean" ? clouds.state.droplets.get(Number(server.cloudInstanceId)) : clouds.state.hetznerServers.get(Number(server.cloudInstanceId));
  remote.status = provider === "digitalocean" ? "active" : "running";
  const userData = provider === "digitalocean" ? remote.user_data : remote.user_data;
  await api.call("POST", "/agent/register", { body: { token: installToken(userData), facts: {} } });
  return { ...o, server, remote };
}

test("stop, start and resize: typed confirmation, held states, only while stopped, same architecture", async () => {
  for (const provider of ["digitalocean", "hetzner"]) {
    const { orgId, owner, member, server, remote } = await onlineCloudServer(provider);
    const base = `/orgs/${orgId}/servers/${server.id}`;
    const developer = await member("developer");
    const off = provider === "digitalocean" ? "off" : "off";
    const on = provider === "digitalocean" ? "active" : "running";
    assert.equal((await api.call("POST", `${base}/stop`, { token: developer.token, body: { confirm: "app-1" } })).status, 403);
    assert.equal((await api.call("POST", `${base}/stop`, { token: owner.token, body: { confirm: "nope" } })).json.error.code, "CONFIRMATION_MISMATCH");
    assert.equal((await api.call("POST", `${base}/resize`, { token: owner.token, body: { size: provider === "digitalocean" ? "s-2vcpu-4gb" : "cx32" } })).status, 409, "only while stopped");

    const stop = await api.call("POST", `${base}/stop`, { token: owner.token, body: { confirm: "app-1" } });
    assert.equal(stop.json.server.provisionState, "stopping");
    const stopCall = provider === "digitalocean" ? clouds.calls("digitalocean", "POST", `/droplets/${remote.id}/actions`).at(-1).body : clouds.calls("hetzner", "POST", `/servers/${remote.id}/actions/shutdown`).at(-1);
    assert.ok(provider === "digitalocean" ? stopCall.type === "shutdown" : stopCall);
    // The provider still says running: the stop we asked for holds.
    assert.equal((await api.call("POST", `${base}/refresh`, { token: owner.token })).json.server.provisionState, "stopping");
    remote.status = off;
    assert.equal((await api.call("POST", `${base}/refresh`, { token: owner.token })).json.server.provisionState, "stopped");

    const sizes = await api.call("GET", `${base}/sizes`, { token: owner.token });
    const ids = sizes.json.sizes.map((s) => s.id);
    if (provider === "hetzner") assert.ok(!ids.includes("cax11"), "no switching to Arm");
    if (provider === "digitalocean") assert.ok(ids.includes("s-8vcpu-16gb"), "available in fra1");
    const target = provider === "digitalocean" ? "s-2vcpu-4gb" : "cx32";
    for (const bad of [server.cloudSize, "cax11", "huge; rm", "gpu-h100"]) {
      assert.equal((await api.call("POST", `${base}/resize`, { token: owner.token, body: { size: bad } })).status, 400, bad);
    }
    const resize = await api.call("POST", `${base}/resize`, { token: owner.token, body: { size: target } });
    assert.equal(resize.status, 200, JSON.stringify(resize.json));
    assert.deepEqual([resize.json.server.provisionState, resize.json.server.resizeTarget], ["resizing", target]);
    if (provider === "digitalocean") assert.deepEqual(clouds.calls("digitalocean", "POST", `/droplets/${remote.id}/actions`).at(-1).body, { type: "resize", size: target, disk: false });
    else assert.deepEqual(clouds.calls("hetzner", "POST", `/servers/${remote.id}/actions/change_type`).at(-1).body, { server_type: target, upgrade_disk: false });
    // Not done yet: still resizing. Then the provider reports the new size.
    assert.equal((await api.call("POST", `${base}/refresh`, { token: owner.token })).json.server.provisionState, "resizing");
    if (provider === "digitalocean") remote.size_slug = target;
    else remote.server_type = { name: target };
    const resized = (await api.call("POST", `${base}/refresh`, { token: owner.token })).json.server;
    assert.deepEqual([resized.provisionState, resized.cloudSize, resized.resizeTarget], ["stopped", target, null]);

    const start = await api.call("POST", `${base}/start`, { token: owner.token });
    assert.equal(start.json.server.provisionState, "starting");
    assert.equal((await api.call("POST", `${base}/start`, { token: owner.token })).status, 409);
    assert.equal((await api.call("POST", `${base}/refresh`, { token: owner.token })).json.server.provisionState, "starting", "still off: the start holds");
    remote.status = on;
    assert.equal((await api.call("POST", `${base}/refresh`, { token: owner.token })).json.server.provisionState, "agent_online");

    const audit = (await api.call("GET", `/orgs/${orgId}/audit`, { token: owner.token })).json.entries.map((e) => e.action);
    for (const a of ["server.stop", "server.resize", "server.start"]) assert.ok(audit.includes(a), a);
  }
});

test("EC2: stop, resize to a type of the same architecture, start; the new public IP is picked up", async () => {
  const o = await api.createOrg();
  await api.call("POST", `/orgs/${o.orgId}/aws/setup`, { token: o.owner.token });
  await api.call("PUT", `/orgs/${o.orgId}/aws`, { token: o.owner.token, body: { authType: "role", roleArn: "arn:aws:iam::123456789012:role/inveon-cloud", defaultRegion: "ap-south-1" } });
  const server = (await api.call("POST", `/orgs/${o.orgId}/servers/aws`, { token: o.owner.token, body: { name: "ec2-1", region: "ap-south-1", instanceType: "t3.small", diskGb: 30, securityGroupId: "sg-0123456789abcdef0" } })).json.server;
  const userData = (await aws.calls("runInstance")).find((c) => c.args.tags["inveon:server-id"] === server.id).args.userData;
  await aws.setInstance(server.awsInstanceId, { state: "running", publicIp: "198.51.100.50" });
  await api.call("POST", "/agent/register", { body: { token: installToken(userData), facts: {} } });
  const base = `/orgs/${o.orgId}/servers/${server.id}`;

  assert.equal((await api.call("POST", `${base}/stop`, { token: o.owner.token, body: { confirm: "ec2-1" } })).json.server.provisionState, "stopping");
  assert.ok((await aws.calls("stopInstance")).some((c) => c.args.id === server.awsInstanceId));
  await aws.setInstance(server.awsInstanceId, { state: "stopped", publicIp: null });
  assert.equal((await api.call("POST", `${base}/refresh`, { token: o.owner.token })).json.server.provisionState, "stopped");

  const sizes = (await api.call("GET", `${base}/sizes`, { token: o.owner.token })).json.sizes.map((s) => s.id);
  assert.ok(sizes.includes("m6i.large") && !sizes.includes("t4g.small"), "x86 only: the AMI is x86");
  assert.equal((await api.call("POST", `${base}/resize`, { token: o.owner.token, body: { size: "t4g.small" } })).status, 400);
  const resized = await api.call("POST", `${base}/resize`, { token: o.owner.token, body: { size: "m6i.large" } });
  assert.equal(resized.json.server.awsInstanceType, "m6i.large");
  assert.equal(resized.json.server.provisionState, "stopped");
  assert.ok((await aws.calls("modifyInstanceType")).some((c) => c.args.instanceType === "m6i.large"));

  assert.equal((await api.call("POST", `${base}/start`, { token: o.owner.token })).json.server.provisionState, "starting");
  await aws.setInstance(server.awsInstanceId, { state: "running", publicIp: "198.51.100.77" });
  const back = (await api.call("POST", `${base}/refresh`, { token: o.owner.token })).json.server;
  assert.deepEqual([back.provisionState, back.ipAddress, back.privateIpAddress], ["agent_online", "198.51.100.77", "10.0.0.5"]);

  // A server added by hand has no cloud to ask.
  const manual = await api.registerServer(o.orgId, o.owner);
  assert.equal((await api.call("POST", `/orgs/${o.orgId}/servers/${manual.serverId}/stop`, { token: o.owner.token, body: { confirm: manual.server.name } })).json.error.code, "NOT_PROVIDER_SERVER");
});

test("provision state transitions hold what was asked for until the provider shows it", () => {
  const s = (provisionState, registeredAt = new Date()) => ({ provisionState, registeredAt });
  assert.equal(nextProvisionState(s("pending", null), "running"), "running");
  assert.equal(nextProvisionState(s("pending"), "running"), "agent_online");
  assert.equal(nextProvisionState(s("stopping"), "running"), null);
  assert.equal(nextProvisionState(s("stopping"), "stopped"), "stopped");
  assert.equal(nextProvisionState(s("starting"), "stopped"), null);
  assert.equal(nextProvisionState(s("starting"), "running"), "agent_online");
  assert.equal(nextProvisionState(s("resizing"), "stopped"), null);
  assert.equal(nextProvisionState(s("agent_online"), "stopped"), "stopped", "stopped from the provider's console");
  assert.equal(nextProvisionState(s("terminating"), "stopped"), null);
  assert.equal(nextProvisionState(s("terminated"), "running"), null);
  assert.equal(nextProvisionState(s("agent_online"), "terminated"), "terminated");
});
