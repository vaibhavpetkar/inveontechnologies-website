// Multi-server environments: the replica listener and the proxy's pool
// upstream (rendering, address and port checks, nginx -t rollback).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAction } from "../dist/actions.js";
import { renderListener, renderPool, renderSite } from "../dist/templates.js";

let root;
let config;
let calls;
let runnerImpl;
const ctx = () => ({ config, runner: async (bin, args, opts, log) => (calls.push({ bin, args }), runnerImpl(bin, args, opts, log)), log: () => {}, sleep: async () => {} });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inveon-agent-replicas-"));
  config = { controlPlaneUrl: "https://cloud.test", serverId: "s", token: "t", appsRoot: join(root, "apps"), nginxConfDir: join(root, "nginx"), acmeWebroot: join(root, "acme"), letsencryptDir: join(root, "le"), workDir: join(root, "work") };
  calls = [];
  runnerImpl = async () => ({ code: 0, stdout: "" });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("the pool lists every replica with passive health checks; IPv6 is bracketed", () => {
  const pool = renderPool("shop-prod-ab12", [{ host: "10.0.0.5", port: 20002 }, { host: "127.0.0.1", port: 20005 }, { host: "2001:db8::7", port: 20002 }], { maxFails: 3, failTimeoutSec: 10 });
  assert.equal(
    pool,
    "# Managed by inveon-agent. Do not edit.\nupstream inveon_pool_shop_prod_ab12 {\n" +
      "    server 10.0.0.5:20002 max_fails=3 fail_timeout=10s;\n" +
      "    server 127.0.0.1:20005 max_fails=3 fail_timeout=10s;\n" +
      "    server [2001:db8::7]:20002 max_fails=3 fail_timeout=10s;\n" +
      "    keepalive 16;\n}\n",
  );
  for (const host of ["evil.example.com", "10.0.0.1 backup", "10.0.0.1;", "::1]", "10.0.0.256", "", 7]) {
    assert.throws(() => renderPool("shop", [{ host, port: 20000 }], { maxFails: 3, failTimeoutSec: 10 }), String(host));
  }
  for (const port of [80, 70000, 20000.5, "20000"]) assert.throws(() => renderPool("shop", [{ host: "10.0.0.1", port }], { maxFails: 3, failTimeoutSec: 10 }));
  assert.throws(() => renderPool("shop", [], { maxFails: 3, failTimeoutSec: 10 }));
  assert.throws(() => renderPool("shop", [{ host: "10.0.0.1", port: 20000 }], { maxFails: 0, failTimeoutSec: 10 }));
  assert.throws(() => renderPool("Shop;", [{ host: "10.0.0.1", port: 20000 }], { maxFails: 3, failTimeoutSec: 10 }));
});

test("the listener only lets the proxy in and passes the proxy's forwarding headers on", () => {
  const conf = renderListener("shop-prod-ab12", 20002, ["10.0.0.9", "203.0.113.9", "127.0.0.1", "::1"]);
  assert.match(conf, /listen 20002;\n    listen \[::\]:20002;/);
  assert.match(conf, /allow 10\.0\.0\.9;\n    allow 203\.0\.113\.9;\n    allow 127\.0\.0\.1;\n    allow ::1;\n    deny all;/);
  assert.match(conf, /proxy_pass http:\/\/inveon_shop_prod_ab12;/);
  assert.match(conf, /X-Forwarded-For \$http_x_forwarded_for/);
  assert.throws(() => renderListener("shop", 20002, []));
  assert.throws(() => renderListener("shop", 20002, ["all"]));
  assert.throws(() => renderListener("shop", 20002, ["10.0.0.0/8"]));
  assert.throws(() => renderListener("shop", 443, ["10.0.0.9"]));
});

test("a site on the proxy goes to the pool and retries the next replica", () => {
  const site = renderSite({ hostname: "shop.example.com", slug: "shop-prod-ab12", tls: false, acmeWebroot: "/a", letsencryptDir: "/l", pool: true });
  assert.match(site, /proxy_pass http:\/\/inveon_pool_shop_prod_ab12;/);
  assert.match(site, /proxy_next_upstream error timeout http_502 http_503 http_504;/);
  const local = renderSite({ hostname: "shop.example.com", slug: "shop-prod-ab12", tls: false, acmeWebroot: "/a", letsencryptDir: "/l" });
  assert.match(local, /proxy_pass http:\/\/inveon_shop_prod_ab12;/);
  assert.doesNotMatch(local, /proxy_next_upstream/);
});

test("write_pool, write_listener and their removal test nginx and put the old file back on failure", async () => {
  const servers = [{ host: "10.0.0.5", port: 20002 }, { host: "10.0.0.6", port: 20004 }];
  await runAction("nginx.write_pool", { slug: "shop-prod-ab12", servers, maxFails: 3, failTimeoutSec: 10 }, ctx());
  const poolFile = join(config.nginxConfDir, "inveon-pool-shop-prod-ab12.conf");
  assert.match(readFileSync(poolFile, "utf8"), /10\.0\.0\.6:20004/);
  assert.deepEqual(calls.map((c) => [c.bin, ...c.args]), [["nginx", "-t"]]);

  // Removing a replica rewrites the pool; a failing nginx -t keeps the old one.
  runnerImpl = async (bin) => ({ code: bin === "nginx" ? 1 : 0, stdout: "" });
  await assert.rejects(runAction("nginx.write_pool", { slug: "shop-prod-ab12", servers: servers.slice(0, 1), maxFails: 3, failTimeoutSec: 10 }, ctx()));
  assert.match(readFileSync(poolFile, "utf8"), /10\.0\.0\.6:20004/);
  runnerImpl = async () => ({ code: 0, stdout: "" });
  await runAction("nginx.write_pool", { slug: "shop-prod-ab12", servers: servers.slice(0, 1), maxFails: 3, failTimeoutSec: 10 }, ctx());
  assert.doesNotMatch(readFileSync(poolFile, "utf8"), /10\.0\.0\.6/);

  await runAction("nginx.write_listener", { slug: "shop-prod-ab12", port: 20002, allow: ["10.0.0.9", "127.0.0.1"] }, ctx());
  assert.ok(existsSync(join(config.nginxConfDir, "inveon-listener-shop-prod-ab12.conf")));
  await runAction("nginx.remove_listener", { slug: "shop-prod-ab12" }, ctx());
  await runAction("nginx.remove_pool", { slug: "shop-prod-ab12" }, ctx());
  assert.ok(!existsSync(join(config.nginxConfDir, "inveon-listener-shop-prod-ab12.conf")));
  assert.ok(!existsSync(poolFile));

  for (const bad of [
    { slug: "shop", servers: [{ host: "evil.com", port: 20000 }], maxFails: 3, failTimeoutSec: 10 },
    { slug: "shop", servers: [{ host: "10.0.0.1", port: 20000, extra: "x;" }].map(({ host, port }) => ({ host: `${host}\n`, port })), maxFails: 3, failTimeoutSec: 10 },
    { slug: "../etc", servers, maxFails: 3, failTimeoutSec: 10 },
    { slug: "shop", servers: "10.0.0.1:20000", maxFails: 3, failTimeoutSec: 10 },
    { slug: "shop", servers, maxFails: 3 },
  ]) {
    await assert.rejects(runAction("nginx.write_pool", bad, ctx()), JSON.stringify(bad));
  }
  await assert.rejects(runAction("nginx.write_listener", { slug: "shop", port: 20002, allow: ["0.0.0.0/0"] }, ctx()));
  await assert.rejects(runAction("nginx.write_site", { hostname: "a.example.com", slug: "shop", tls: false, pool: "yes" }, ctx()));
});
