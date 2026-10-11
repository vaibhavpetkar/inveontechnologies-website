import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCompose, isInside } from "../dist/compose-validate.js";

const ROOT = "/srv/inveon/apps/crm-prod-x1y2";
const one = (svc) => ({ services: { web: { image: "app:1", ...svc } } });
const rejected = (model) => {
  const r = validateCompose(model, { appRoot: ROOT });
  assert.equal(r.ok, false, JSON.stringify(model));
  return r.errors.join("\n");
};

test("isInside handles traversal and sibling prefixes", () => {
  assert.equal(isInside(ROOT, `${ROOT}/data/x`), true);
  assert.equal(isInside(ROOT, ROOT), true);
  assert.equal(isInside(ROOT, `${ROOT}/../other`), false);
  assert.equal(isInside(ROOT, `${ROOT}-evil`), false);
  assert.equal(isInside(ROOT, "/etc/passwd"), false);
});

test("rejects privileged containers", () => {
  assert.match(rejected(one({ privileged: true })), /privileged/);
});

test("rejects host network and other host namespaces", () => {
  assert.match(rejected(one({ network_mode: "host" })), /network_mode: host/);
  assert.match(rejected(one({ network_mode: "HOST" })), /network_mode: host/);
  assert.match(rejected(one({ pid: "host" })), /pid: host/);
  assert.match(rejected(one({ ipc: "host" })), /ipc: host/);
  assert.match(rejected(one({ userns_mode: "host" })), /userns_mode/);
});

test("rejects bind mounts outside the app folder", () => {
  assert.match(rejected(one({ volumes: [{ type: "bind", source: "/", target: "/host" }] })), /outside the app folder/);
  assert.match(rejected(one({ volumes: [{ type: "bind", source: "/home/ubuntu", target: "/h" }] })), /outside/);
  assert.match(rejected(one({ volumes: [{ type: "bind", source: `${ROOT}/../../..`, target: "/h" }] })), /outside/);
  assert.match(rejected(one({ volumes: ["/etc:/etc:ro"] })), /outside/);
  assert.match(rejected(one({ volumes: ["~/.ssh:/ssh"] })), /home-directory/);
  assert.match(rejected(one({ build: { context: "/" } })), /outside/);
});

test("rejects Docker socket mounts in every form", () => {
  for (const source of ["/var/run/docker.sock", "/run/docker.sock", "/var/run", `${ROOT}/docker.sock`]) {
    rejected(one({ volumes: [{ type: "bind", source, target: "/var/run/docker.sock" }] }));
  }
  assert.match(rejected(one({ volumes: ["/var/run/docker.sock:/var/run/docker.sock"] })), /Docker socket/);
});

test("rejects dangerous capabilities, devices and unconfined profiles", () => {
  assert.match(rejected(one({ cap_add: ["SYS_ADMIN"] })), /SYS_ADMIN/);
  assert.match(rejected(one({ cap_add: ["CAP_SYS_PTRACE"] })), /SYS_PTRACE/);
  assert.match(rejected(one({ cap_add: ["ALL"] })), /ALL/);
  assert.match(rejected(one({ devices: [{ source: "/dev/kvm", target: "/dev/kvm" }] })), /devices/);
  assert.match(rejected(one({ security_opt: ["apparmor=unconfined"] })), /security_opt/);
  assert.match(rejected(one({ security_opt: ["seccomp:unconfined"] })), /security_opt/);
});

test("rejects public port bindings", () => {
  assert.match(rejected(one({ ports: [{ target: 80, published: "80", protocol: "tcp", mode: "ingress" }] })), /127\.0\.0\.1/);
  assert.match(rejected(one({ ports: [{ host_ip: "0.0.0.0", target: 80, published: "80" }] })), /127\.0\.0\.1/);
  assert.match(rejected(one({ ports: ["8080:80"] })), /127\.0\.0\.1/);
  assert.equal(validateCompose(one({ ports: ["127.0.0.1:20000:80"] }), { appRoot: ROOT }).ok, true);
  assert.equal(validateCompose(one({ ports: [{ target: 80 }] }), { appRoot: ROOT }).ok, true);
});

test("rejects binds hidden in named volumes, configs and secrets", () => {
  rejected({ services: { web: { image: "x" } }, volumes: { v: { driver_opts: { type: "none", o: "bind", device: "/etc" } } } });
  rejected({ services: { web: { image: "x" } }, configs: { c: { file: "/etc/shadow" } } });
  rejected({ services: { web: { image: "x" } }, secrets: { s: { file: "/root/.aws/credentials" } } });
  assert.equal(
    validateCompose({ services: { web: { image: "x" } }, volumes: { v: { driver_opts: { type: "none", o: "bind", device: `${ROOT}/data/v` } } } }, { appRoot: ROOT }).ok,
    true,
  );
});

test("rejects malformed models", () => {
  rejected(null);
  rejected({});
  rejected({ services: {} });
  rejected({ services: { web: "nginx" } });
});

test("accepts a typical app with a database", () => {
  const model = {
    name: "crm-prod-x1y2-blue",
    services: {
      web: {
        image: "ghcr.io/inveon/crm:0123456789abcdef0123456789abcdef01234567",
        ports: [{ mode: "ingress", host_ip: "127.0.0.1", target: 3000, published: "20002", protocol: "tcp" }],
        volumes: [{ type: "bind", source: `${ROOT}/data/uploads`, target: "/app/uploads", bind: { create_host_path: true } }],
        depends_on: { db: { condition: "service_started" } },
      },
      db: { image: "postgres:16-alpine", volumes: [{ type: "bind", source: `${ROOT}/data/postgres`, target: "/var/lib/postgresql/data" }, { type: "tmpfs", target: "/tmp" }] },
      cache: { image: "redis:7", volumes: [{ type: "volume", source: "redis", target: "/data" }] },
    },
    volumes: { redis: { name: "crm_redis" } },
    networks: { default: { name: "crm_default" } },
  };
  assert.deepEqual(validateCompose(model, { appRoot: ROOT }), { ok: true, errors: [] });
});
