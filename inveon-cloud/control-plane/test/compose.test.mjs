import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startServer, sha } from "./helpers.mjs";
import { validateCompose } from "../dist/lib/compose-validate.js";

const ROOT = "/srv/inveon/apps/site-prod-ab12";
const svc = (extra) => ({ services: { web: { image: "nginx", ...extra } } });

test("the control plane and agent validators are the same file", () => {
  const cp = readFileSync(new URL("../src/lib/compose-validate.ts", import.meta.url), "utf8");
  const agent = readFileSync(new URL("../../agent/src/compose-validate.ts", import.meta.url), "utf8");
  assert.equal(cp, agent);
});

test("compose validation rejects unsafe files", () => {
  const bad = {
    privileged: svc({ privileged: true }),
    hostNetwork: svc({ network_mode: "host" }),
    hostPid: svc({ pid: "host" }),
    dockerSock: svc({ volumes: [{ type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock" }] }),
    dockerSockShort: svc({ volumes: ["/var/run/docker.sock:/var/run/docker.sock"] }),
    outsideBind: svc({ volumes: [{ type: "bind", source: "/etc", target: "/host-etc" }] }),
    traversal: svc({ volumes: [{ type: "bind", source: `${ROOT}/../other-app`, target: "/x" }] }),
    siblingPrefix: svc({ volumes: [{ type: "bind", source: `${ROOT}-evil/data`, target: "/x" }] }),
    capSysAdmin: svc({ cap_add: ["SYS_ADMIN"] }),
    devices: svc({ devices: ["/dev/sda:/dev/sda"] }),
    unconfined: svc({ security_opt: ["seccomp:unconfined"] }),
    publicPort: svc({ ports: [{ mode: "ingress", target: 80, published: "8080", protocol: "tcp" }] }),
    publicPortAllIfaces: svc({ ports: [{ host_ip: "0.0.0.0", target: 80, published: "8080" }] }),
    disguisedBind: { services: { web: { image: "x", volumes: [{ type: "volume", source: "data", target: "/d" }] } }, volumes: { data: { driver: "local", driver_opts: { type: "none", o: "bind", device: "/root" } } } },
    secretFile: { services: { web: { image: "x" } }, secrets: { key: { file: "/root/.ssh/id_rsa" } } },
    noServices: {},
  };
  for (const [name, model] of Object.entries(bad)) {
    const r = validateCompose(model, { appRoot: ROOT });
    assert.equal(r.ok, false, `${name} should be rejected`);
    assert.ok(r.errors.length > 0);
  }
});

test("compose validation accepts a normal app", () => {
  const model = {
    services: {
      web: {
        image: "ghcr.io/inveon/site:abc123",
        env_file: [`${ROOT}/blue/.env`],
        ports: [{ host_ip: "127.0.0.1", target: 3000, published: "20000", protocol: "tcp" }],
        volumes: [{ type: "bind", source: `${ROOT}/data/uploads`, target: "/app/uploads" }, { type: "volume", source: "cache", target: "/cache" }],
        cap_add: ["NET_BIND_SERVICE"],
      },
      db: { image: "postgres:16", volumes: [{ type: "bind", source: `${ROOT}/data/pg`, target: "/var/lib/postgresql/data" }], expose: ["5432"] },
    },
    volumes: { cache: {} },
  };
  assert.deepEqual(validateCompose(model, { appRoot: ROOT }), { ok: true, errors: [] });
});

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

test("the control plane re-checks the resolved compose model the agent reports", async () => {
  const { orgId, owner } = await api.createOrg();
  const srv = await api.registerServer(orgId, owner);
  const { environment } = await api.createAppWithEnvironment(orgId, owner, { serverId: srv.serverId });
  await api.call("POST", `/orgs/${orgId}/environments/${environment.id}/deploy`, { token: owner.token, body: { commitSha: sha() } });
  const { json } = await api.call("POST", "/agent/jobs/claim", { token: srv.agentToken });
  const [prepare, validate] = json.job.steps;
  await api.call("POST", `/agent/jobs/${json.job.id}/steps/${prepare.id}`, { token: srv.agentToken, body: { status: "success" } });
  // An agent claiming "valid" for a privileged, host-network file.
  const r = await api.call("POST", `/agent/jobs/${json.job.id}/steps/${validate.id}`, {
    token: srv.agentToken,
    body: { status: "success", result: { appRoot: `/srv/inveon/apps/${environment.slug}`, model: svc({ privileged: true, network_mode: "host" }) } },
  });
  assert.equal(r.status, 200);
  const view = await api.call("GET", `/orgs/${orgId}/jobs/${json.job.id}`, { token: owner.token });
  const step = view.json.steps[1];
  assert.equal(step.status, "failure");
  assert.match(step.log, /privileged: true is not allowed/);
  assert.match(step.log, /network_mode: host is not allowed/);
  assert.equal(step.result.ok, false);
  assert.equal(step.result.model, undefined);

  // Wrong app folder is also refused.
  const fin = await api.call("POST", `/agent/jobs/${json.job.id}/finish`, { token: srv.agentToken, body: { status: "success" } });
  assert.equal(fin.json.status, "failure");
});

test("compose path must stay inside the repo", async () => {
  const { orgId, owner } = await api.createOrg();
  for (const composePath of ["../etc/passwd.yml", "/etc/compose.yml", "a/../../b.yml", "compose.txt"]) {
    const res = await api.call("POST", `/orgs/${orgId}/apps`, { token: owner.token, body: { name: "x", repoUrl: "https://github.com/a/b", composePath } });
    assert.equal(res.status, 400, composePath);
  }
  const ok = await api.call("POST", `/orgs/${orgId}/apps`, { token: owner.token, body: { name: "x", repoUrl: "https://github.com/a/b.git", composePath: "deploy/compose.prod.yml" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.app.repoUrl, "https://github.com/a/b");
});
