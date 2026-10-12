import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { startServer, freePort } from "./helpers.mjs";
import { buildUserData } from "../dist/modules/aws/service.js";

let api;
let fake;
before(async () => {
  const port = await freePort();
  api = await startServer({ FAKE_AWS_PORT: String(port) }, { nodeArgs: ["--import", fileURLToPath(new URL("./fake-aws.mjs", import.meta.url))] });
  const base = `http://127.0.0.1:${port}`;
  const req = async (method, path, body) => (await fetch(base + path, { method, body: body ? JSON.stringify(body) : undefined })).json();
  fake = {
    calls: async (method) => (await req("GET", "/calls")).filter((c) => !method || c.method === method),
    setInstance: (id, patch) => req("POST", `/instances/${id}`, patch),
    dropInstance: (id) => req("DELETE", `/instances/${id}`),
    groups: () => req("GET", "/groups"),
    failNext: (method, message) => req("POST", "/fail", { method, message }),
  };
});
after(async () => api?.stop());

const ROLE = "arn:aws:iam::123456789012:role/inveon-cloud";

async function connectedOrg() {
  const o = await api.createOrg();
  const setup = await api.call("POST", `/orgs/${o.orgId}/aws/setup`, { token: o.owner.token });
  const put = await api.call("PUT", `/orgs/${o.orgId}/aws`, { token: o.owner.token, body: { authType: "role", roleArn: ROLE, defaultRegion: "ap-south-1" } });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  return { ...o, externalId: setup.json.connection.externalId };
}

const launchBody = (over = {}) => ({ name: "web-1", region: "ap-south-1", instanceType: "t3.small", diskGb: 30, createSecurityGroup: { sshCidr: "203.0.113.0/24" }, ...over });

test("AWS connection: role with a generated external id, verified before saving; keys stored encrypted and never returned", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const developer = await member("developer");
  const empty = await api.call("GET", `/orgs/${orgId}/aws`, { token: owner.token });
  assert.equal(empty.json.connection, null);
  assert.ok(empty.json.regions.includes("ap-south-1"));
  assert.ok(empty.json.instanceTypes.some((t) => t.id === "t4g.small" && t.arch === "arm64"));
  assert.equal((await api.call("GET", `/orgs/${orgId}/aws`, { token: developer.token })).status, 403);
  assert.equal((await api.call("POST", `/orgs/${orgId}/aws/setup`, { token: developer.token })).status, 403);

  // Role mode needs the external id first.
  assert.equal((await api.call("PUT", `/orgs/${orgId}/aws`, { token: owner.token, body: { authType: "role", roleArn: ROLE, defaultRegion: "ap-south-1" } })).json.error.code, "NO_EXTERNAL_ID");
  const setup = await api.call("POST", `/orgs/${orgId}/aws/setup`, { token: owner.token });
  const externalId = setup.json.connection.externalId;
  assert.match(externalId, /^inveon-[A-Za-z0-9_-]{32}$/);
  assert.equal(setup.json.connection.connected, false);
  // Stable: a second setup keeps the same id.
  assert.equal((await api.call("POST", `/orgs/${orgId}/aws/setup`, { token: owner.token })).json.connection.externalId, externalId);

  for (const bad of [
    { authType: "role", roleArn: "arn:aws:iam::12345:role/x", defaultRegion: "ap-south-1" },
    { authType: "role", roleArn: ROLE, defaultRegion: "mars-north-1" },
    { authType: "role", roleArn: `${ROLE} --profile x`, defaultRegion: "ap-south-1" },
    { authType: "keys", accessKeyId: "ASIAABCDEFGHIJKLMNOP", secretAccessKey: "x".repeat(40), defaultRegion: "ap-south-1" },
    { authType: "keys", accessKeyId: "AKIAABCDEFGHIJKLMNOP", secretAccessKey: "short", defaultRegion: "ap-south-1" },
  ]) {
    assert.equal((await api.call("PUT", `/orgs/${orgId}/aws`, { token: owner.token, body: bad })).status, 400, JSON.stringify(bad));
  }

  // AWS refusing the credentials: nothing saved.
  await fake.failNext("verify", "User is not authorized to perform: sts:AssumeRole");
  const refused = await api.call("PUT", `/orgs/${orgId}/aws`, { token: owner.token, body: { authType: "role", roleArn: ROLE, defaultRegion: "ap-south-1" } });
  assert.equal(refused.status, 400);
  assert.equal(refused.json.error.code, "AWS_VERIFY_FAILED");
  assert.match(refused.json.error.message, /sts:AssumeRole/);
  assert.equal((await api.call("GET", `/orgs/${orgId}/aws`, { token: owner.token })).json.connection.connected, false);

  const ok = await api.call("PUT", `/orgs/${orgId}/aws`, { token: owner.token, body: { authType: "role", roleArn: ROLE, defaultRegion: "eu-west-1" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.connection.accountId, "123456789012");
  assert.ok(ok.json.connection.verifiedAt);
  const verify = (await fake.calls("verify")).at(-1);
  assert.deepEqual(verify.creds, { authType: "role", roleArn: ROLE, externalId });
  assert.equal(verify.region, "eu-west-1");

  // Access keys: the secret is encrypted and write-only.
  const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  const keys = await api.call("PUT", `/orgs/${orgId}/aws`, { token: owner.token, body: { authType: "keys", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: secret, defaultRegion: "ap-south-1" } });
  assert.equal(keys.status, 200);
  assert.equal(keys.json.connection.hasSecret, true);
  assert.equal(keys.json.connection.roleArn, null);
  assert.ok(!JSON.stringify(keys.json).includes(secret));
  assert.ok(!JSON.stringify((await api.call("GET", `/orgs/${orgId}/aws`, { token: owner.token })).json).includes(secret));
  const { rows } = await api.pool.query("SELECT secret_access_key_enc FROM aws_connections WHERE org_id = $1", [orgId]);
  assert.ok(rows[0].secret_access_key_enc.startsWith("v1."));
  assert.ok(!rows[0].secret_access_key_enc.includes(secret));
  assert.equal((await fake.calls("verify")).at(-1).creds.secretAccessKey, "(set)");

  const log = await api.call("GET", `/orgs/${orgId}/audit`, { token: owner.token });
  const entries = log.json.entries.filter((e) => e.action === "aws.connect");
  assert.equal(entries.length, 2);
  assert.ok(!JSON.stringify(entries).includes(secret));
});

test("create server: strict input checks", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const admin = await member("admin");
  // Not connected yet.
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: owner.token, body: launchBody() })).json.error.code, "AWS_NOT_CONNECTED");
  await api.call("POST", `/orgs/${orgId}/aws/setup`, { token: owner.token });
  await api.call("PUT", `/orgs/${orgId}/aws`, { token: owner.token, body: { authType: "role", roleArn: ROLE, defaultRegion: "ap-south-1" } });
  const developer = await member("developer");
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: developer.token, body: launchBody() })).status, 403);

  const bad = [
    { region: "us-gov-west-1" },
    { region: "ap-south-1; rm -rf /" },
    { instanceType: "p5.48xlarge" },
    { instanceType: "t3.small " },
    { diskGb: 8 },
    { diskGb: 5000 },
    { diskGb: 30.5 },
    { createSecurityGroup: { sshCidr: "0.0.0.0/0" } },
    { createSecurityGroup: { sshCidr: "10.0.0.0/8" } },
    { createSecurityGroup: { sshCidr: "203.0.113.7/24" } },
    { createSecurityGroup: { sshCidr: "203.0.113.0/33" } },
    { createSecurityGroup: { sshCidr: "::/0" } },
    { createSecurityGroup: { sshCidr: "203.0.113.0/24", extra: 1 } },
    { createSecurityGroup: undefined },
    { securityGroupId: "sg-0123456789abcdef0" },
    { createSecurityGroup: undefined, securityGroupId: "default" },
    { keyName: "key; curl evil" },
    { subnetId: "subnet-xyz" },
    { instanceProfile: "a b" },
    { name: "" },
    { userData: "#!/bin/bash\nevil" },
  ];
  for (const over of bad) {
    const r = await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: admin.token, body: launchBody(over) });
    assert.equal(r.status, 400, JSON.stringify(over));
  }
  const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM servers WHERE org_id = $1", [orgId]);
  assert.equal(rows[0].n, 0);
  assert.equal((await fake.calls("runInstance")).filter((c) => c.args.tags["inveon:org-id"] === orgId).length, 0);
});

test("create server: AMI from SSM, security group, cloud-init with a single-use token, then pending -> running -> agent online", async () => {
  const { orgId, owner, externalId } = await connectedOrg();
  const res = await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: owner.token, body: launchBody({ name: "arm-1", instanceType: "t4g.small", keyName: "ops-key", instanceProfile: "inveon-backups" }) });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const server = res.json.server;
  assert.equal(server.provider, "aws");
  assert.equal(server.provisionState, "pending");
  assert.equal(server.status, "pending");
  assert.equal(server.awsInstanceType, "t4g.small");
  assert.equal(server.awsAmiId, "ami-0aaaaaaaaaaaaaaa1");
  assert.ok(server.awsInstanceId.startsWith("i-"));
  assert.equal(server.awsCreatedSecurityGroup, true);

  const mine = (c) => c.args?.tags?.["inveon:server-id"] === server.id;
  const ami = (await fake.calls("ubuntuAmi")).at(-1);
  assert.deepEqual([ami.args.arch, ami.region, ami.creds.externalId], ["arm64", "ap-south-1", externalId]);
  const sg = (await fake.calls("createSecurityGroup")).find(mine);
  assert.equal(sg.args.sshCidr, "203.0.113.0/24");
  assert.equal(sg.args.vpcId, "vpc-0123456789abcdef0");
  assert.equal(server.awsSecurityGroupId.startsWith("sg-"), true);

  const run = (await fake.calls("runInstance")).find(mine);
  assert.equal(run.args.amiId, "ami-0aaaaaaaaaaaaaaa1");
  assert.equal(run.args.instanceType, "t4g.small");
  assert.equal(run.args.diskGb, 30);
  assert.equal(run.args.securityGroupId, server.awsSecurityGroupId);
  assert.equal(run.args.keyName, "ops-key");
  assert.equal(run.args.instanceProfile, "inveon-backups");
  assert.deepEqual(run.args.tags, { "inveon:server-id": server.id, "inveon:org-id": orgId, "inveon:managed-by": "inveon-cloud" });
  const m = run.args.userData.match(/^curl -fsSL .*'https:\/\/cloud\.test\/install\.sh' \| bash -s -- '([A-Za-z0-9_-]+)'$/m);
  assert.ok(m, run.args.userData);
  assert.ok(run.args.userData.startsWith("#!/bin/bash\n"));
  const token = m[1];

  // The token is stored hashed, single use, for an hour.
  const { rows } = await api.pool.query("SELECT token_hash, expires_at FROM server_bootstrap_tokens WHERE server_id = $1", [server.id]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  const ttlMin = (new Date(rows[0].expires_at) - Date.now()) / 60000;
  assert.ok(ttlMin > 55 && ttlMin <= 60, String(ttlMin));

  // EC2 reports it running with a public IP.
  await fake.setInstance(server.awsInstanceId, { state: "running", publicIp: "198.51.100.20" });
  const refreshed = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/refresh`, { token: owner.token });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.json.server.provisionState, "running");
  assert.equal(refreshed.json.server.awsState, "running");
  assert.equal(refreshed.json.server.ipAddress, "198.51.100.20");

  // cloud-init runs the installer, which registers with the token: agent online.
  const reg = await api.call("POST", "/agent/register", { body: { token, facts: { hostname: "ip-10-0-0-5", os: "Ubuntu 24.04" } } });
  assert.equal(reg.status, 201);
  const list = await api.call("GET", `/orgs/${orgId}/servers`, { token: owner.token });
  const after = list.json.servers.find((s) => s.id === server.id);
  assert.equal(after.provisionState, "agent_online");
  assert.equal(after.status, "online");
  assert.equal(after.ipAddress, "198.51.100.20", "the instance's public IP, not the registering connection's");
  // Used once.
  assert.equal((await api.call("POST", "/agent/register", { body: { token, facts: {} } })).status, 401);

  const audit = await api.call("GET", `/orgs/${orgId}/audit`, { token: owner.token });
  const launch = audit.json.entries.find((e) => e.action === "server.launch");
  assert.equal(launch.metadata.instanceId, server.awsInstanceId);
  assert.ok(!JSON.stringify(launch).includes(token));
});

test("create server: an existing security group and the x86 AMI; a failed launch leaves nothing behind", async () => {
  const { orgId, owner } = await connectedOrg();
  const ok = await api.call("POST", `/orgs/${orgId}/servers/aws`, {
    token: owner.token,
    body: launchBody({ name: "x86-1", createSecurityGroup: undefined, securityGroupId: "sg-0123456789abcdef0", subnetId: "subnet-0123456789abcdef0" }),
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.server.awsAmiId, "ami-0bbbbbbbbbbbbbbb2");
  assert.equal(ok.json.server.awsSecurityGroupId, "sg-0123456789abcdef0");
  assert.equal(ok.json.server.awsCreatedSecurityGroup, false);
  const run = (await fake.calls("runInstance")).find((c) => c.args.tags["inveon:server-id"] === ok.json.server.id);
  assert.equal(run.args.subnetId, "subnet-0123456789abcdef0");

  // Options for the form.
  const opts = await api.call("GET", `/orgs/${orgId}/aws/options?region=ap-south-1`, { token: owner.token });
  assert.deepEqual(opts.json.keyPairs, ["ops-key"]);
  assert.equal((await api.call("GET", `/orgs/${orgId}/aws/options?region=nowhere`, { token: owner.token })).status, 400);

  // RunInstances refused: the created group is deleted and no server row remains.
  const groupsBefore = await fake.groups();
  await fake.failNext("runInstance", "You are not authorized to perform: ec2:RunInstances");
  const failed = await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: owner.token, body: launchBody({ name: "nope" }) });
  assert.equal(failed.status, 502);
  assert.equal(failed.json.error.code, "AWS_ERROR");
  assert.match(failed.json.error.message, /ec2:RunInstances/);
  assert.deepEqual(await fake.groups(), groupsBefore);
  const created = (await fake.calls("createSecurityGroup")).at(-1);
  assert.ok((await fake.calls("deleteSecurityGroup")).some((c) => created && c.args.id.startsWith("sg-")));
  const { rows } = await api.pool.query("SELECT name FROM servers WHERE org_id = $1 ORDER BY name", [orgId]);
  assert.deepEqual(rows.map((r) => r.name), ["x86-1"]);
});

test("terminate: typed confirmation, never with environments, only the tagged instance, then the group is cleaned up", async () => {
  const { orgId, owner, member } = await connectedOrg();
  const created = await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: owner.token, body: launchBody({ name: "to-go" }) });
  const server = created.json.server;
  const token = (await fake.calls("runInstance")).find((c) => c.args.tags["inveon:server-id"] === server.id).args.userData.match(/bash -s -- '([^']+)'/)[1];
  await fake.setInstance(server.awsInstanceId, { state: "running", publicIp: "198.51.100.30" });
  const reg = await api.call("POST", "/agent/register", { body: { token, facts: {} } });
  const agentToken = reg.json.agentToken;

  const developer = await member("developer");
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: developer.token, body: { confirm: "to-go" } })).status, 403);
  const wrong = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "TO-GO" } });
  assert.equal(wrong.json.error.code, "CONFIRMATION_MISMATCH");
  // Deleting the record while the instance runs would leave it running.
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/servers/${server.id}`, { token: owner.token })).status, 409);

  const { environment } = await api.createAppWithEnvironment(orgId, owner, { serverId: server.id });
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "to-go" } })).status, 409);
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/environments/${environment.id}`, { token: owner.token })).status, 200);

  // A tag that doesn't match this server: refused.
  await fake.setInstance(server.awsInstanceId, { tags: { "inveon:server-id": "someone-else" } });
  const mismatch = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "to-go" } });
  assert.equal(mismatch.json.error.code, "INSTANCE_MISMATCH");
  await fake.setInstance(server.awsInstanceId, { tags: { "inveon:server-id": server.id } });

  const term = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "to-go" } });
  assert.equal(term.status, 200, JSON.stringify(term.json));
  assert.equal(term.json.server.provisionState, "terminating");
  assert.ok((await fake.calls("terminateInstance")).some((c) => c.args.id === server.awsInstanceId));
  // The agent is cut off at once.
  assert.equal((await api.call("POST", "/agent/jobs/claim", { token: agentToken })).status, 401);

  await fake.setInstance(server.awsInstanceId, { state: "terminated" });
  const done = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/refresh`, { token: owner.token });
  assert.equal(done.json.server.provisionState, "terminated");
  assert.ok(done.json.server.terminatedAt);
  assert.equal(done.json.server.awsCreatedSecurityGroup, false);
  assert.ok((await fake.calls("deleteSecurityGroup")).some((c) => c.args.id === server.awsSecurityGroupId));
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "to-go" } })).status, 409);

  const audit = await api.call("GET", `/orgs/${orgId}/audit`, { token: owner.token });
  const entry = audit.json.entries.find((e) => e.action === "server.terminate");
  assert.deepEqual([entry.entityId, entry.metadata.instanceId, entry.actorUserId], [server.id, server.awsInstanceId, owner.id]);

  // Now the record can go, and the connection can be removed.
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/servers/${server.id}`, { token: owner.token })).status, 200);
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/aws`, { token: owner.token })).status, 200);
});

test("a disappeared instance being terminated is marked terminated; a manual server can't be terminated here", async () => {
  const { orgId, owner } = await connectedOrg();
  const created = await api.call("POST", `/orgs/${orgId}/servers/aws`, { token: owner.token, body: launchBody({ name: "gone", createSecurityGroup: undefined, securityGroupId: "sg-0123456789abcdef0" }) });
  const server = created.json.server;
  // Just launched and not listed yet (eventual consistency): stays pending.
  await fake.dropInstance(server.awsInstanceId);
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers/${server.id}/refresh`, { token: owner.token })).json.server.provisionState, "pending");
  // The connection can't be removed while it's live.
  assert.equal((await api.call("DELETE", `/orgs/${orgId}/aws`, { token: owner.token })).status, 409);
  const term = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/terminate`, { token: owner.token, body: { confirm: "gone" } });
  assert.equal(term.status, 200);
  const done = await api.call("POST", `/orgs/${orgId}/servers/${server.id}/refresh`, { token: owner.token });
  assert.equal(done.json.server.provisionState, "terminated");

  const manual = await api.registerServer(orgId, owner);
  const r = await api.call("POST", `/orgs/${orgId}/servers/${manual.serverId}/terminate`, { token: owner.token, body: { confirm: manual.server.name } });
  assert.equal(r.json.error.code, "NOT_AWS");
});

test("user data only carries a safe URL and token", () => {
  const script = buildUserData("https://cloud.example.com/", "A".repeat(43));
  assert.equal(script.split("\n")[3], `curl -fsSL --retry 10 --retry-delay 6 --retry-all-errors 'https://cloud.example.com/install.sh' | bash -s -- '${"A".repeat(43)}'`);
  assert.throws(() => buildUserData("https://cloud.example.com", "x'; rm -rf / #aaaaaaaaaaaaaaaa"));
  assert.throws(() => buildUserData("https://cloud.example.com/'$(id)", "A".repeat(43)));
});

test("the AWS SDK implementation loads and builds its clients without calling AWS", async () => {
  const { sdkEc2Api } = await import("../dist/modules/aws/sdk.js");
  const keys = sdkEc2Api({ authType: "keys", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }, "ap-south-1");
  const role = sdkEc2Api({ authType: "role", roleArn: ROLE, externalId: "inveon-x" }, "eu-west-1");
  for (const m of ["verify", "ubuntuAmi", "defaultVpcId", "subnetVpcId", "listSecurityGroups", "listKeyPairs", "createSecurityGroup", "deleteSecurityGroup", "runInstance", "describeInstances", "terminateInstance"]) {
    assert.equal(typeof keys[m], "function", m);
    assert.equal(typeof role[m], "function", m);
  }
  assert.deepEqual(await keys.describeInstances([]), []);
});
