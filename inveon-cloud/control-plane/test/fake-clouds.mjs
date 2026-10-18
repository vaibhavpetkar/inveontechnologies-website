// In-memory DigitalOcean, Hetzner Cloud and Cloudflare REST APIs for the
// tests. It runs in the test process; the control plane under test is
// pointed at it with INVEON_DIGITALOCEAN_API_BASE, INVEON_HETZNER_API_BASE
// and INVEON_CLOUDFLARE_API_BASE. Tests change its state directly and read
// the recorded calls. Never calls a real provider.
import { createServer } from "node:http";

export async function startFakeClouds() {
  const state = {
    calls: [], // { provider, method, path, auth, body }
    tokens: { digitalocean: new Set(), hetzner: new Set(), cloudflare: new Set() },
    droplets: new Map(), // id -> droplet
    hetznerServers: new Map(), // id -> server
    // Cloudflare: zones the token can see, and the DNS records in them.
    zones: [], // { id, name }
    records: new Map(), // id -> { id, zoneId, type, name, content, ttl }
    failNext: new Map(), // "provider METHOD /path" prefix -> { status, message }
    n: 1000,
  };

  const json = (res, status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(body === undefined ? "" : JSON.stringify(body));
  const authOk = (provider, auth) => state.tokens[provider].has((auth ?? "").replace(/^Bearer /, ""));

  const doSizes = [
    { slug: "s-1vcpu-2gb", vcpus: 1, memory: 2048, disk: 50, price_monthly: 12, regions: ["blr1", "fra1"], available: true },
    { slug: "s-2vcpu-4gb", vcpus: 2, memory: 4096, disk: 80, price_monthly: 24, regions: ["blr1", "fra1"], available: true },
    { slug: "s-8vcpu-16gb", vcpus: 8, memory: 16384, disk: 320, price_monthly: 96, regions: ["fra1"], available: true },
  ];
  const hzTypes = [
    { name: "cx22", cores: 2, memory: 4, disk: 40, architecture: "x86", deprecated: false, prices: [{ location: "fsn1", price_monthly: { gross: "4.5100000000" } }, { location: "hel1", price_monthly: { gross: "4.5100000000" } }] },
    { name: "cx32", cores: 4, memory: 8, disk: 80, architecture: "x86", deprecated: false, prices: [{ location: "fsn1", price_monthly: { gross: "7.7300000000" } }, { location: "hel1", price_monthly: { gross: "7.7300000000" } }] },
    { name: "cax11", cores: 2, memory: 4, disk: 40, architecture: "arm", deprecated: false, prices: [{ location: "fsn1", price_monthly: { gross: "4.5100000000" } }] },
    { name: "cx11", cores: 1, memory: 2, disk: 20, architecture: "x86", deprecated: true, prices: [{ location: "fsn1", price_monthly: { gross: "3.9900000000" } }] },
  ];

  function digitalocean(method, path, body, res) {
    let m;
    if (method === "GET" && path === "/account") return json(res, 200, { account: { email: "ops@example.com", team: { name: "Inveon" } } });
    if (method === "GET" && path.startsWith("/regions")) return json(res, 200, { regions: [{ slug: "blr1", name: "Bangalore 1", available: true }, { slug: "fra1", name: "Frankfurt 1", available: true }, { slug: "old1", name: "Gone", available: false }] });
    if (method === "GET" && path.startsWith("/sizes")) return json(res, 200, { sizes: doSizes });
    if (method === "GET" && path.startsWith("/images")) {
      return json(res, 200, { images: [{ slug: "ubuntu-24-04-x64", distribution: "Ubuntu", name: "24.04 (LTS) x64" }, { slug: "debian-12-x64", distribution: "Debian", name: "12 x64" }, { slug: "fedora-40-x64", distribution: "Fedora", name: "40 x64" }] });
    }
    if (method === "POST" && path === "/droplets") {
      const id = ++state.n;
      const droplet = { id, name: body.name, status: "new", size_slug: body.size, region: { slug: body.region }, image: body.image, tags: body.tags ?? [], user_data: body.user_data, networks: { v4: [] } };
      state.droplets.set(id, droplet);
      return json(res, 202, { droplet: { ...droplet, user_data: undefined } });
    }
    if ((m = path.match(/^\/droplets\/(\d+)$/))) {
      const d = state.droplets.get(Number(m[1]));
      if (!d) return json(res, 404, { id: "not_found", message: "The resource you were accessing could not be found." });
      if (method === "GET") return json(res, 200, { droplet: d });
      if (method === "DELETE") {
        state.droplets.delete(d.id);
        return json(res, 204);
      }
    }
    if ((m = path.match(/^\/droplets\/(\d+)\/actions$/)) && method === "POST") {
      const d = state.droplets.get(Number(m[1]));
      if (!d) return json(res, 404, { id: "not_found", message: "The resource you were accessing could not be found." });
      if (!["shutdown", "power_on", "resize"].includes(body.type)) return json(res, 422, { id: "unprocessable_entity", message: "Unknown action" });
      if (body.type === "resize" && d.status !== "off") return json(res, 422, { id: "unprocessable_entity", message: "Droplet is currently on. Please power it off to run this event." });
      // The droplet changes when the test says so (like a real, asynchronous action).
      return json(res, 201, { action: { id: ++state.n, type: body.type, status: "in-progress" } });
    }
    return json(res, 404, { id: "not_found", message: `no fake for ${method} ${path}` });
  }

  function hetzner(method, path, body, res) {
    let m;
    if (method === "GET" && path.startsWith("/servers?")) return json(res, 200, { servers: [] });
    if (method === "GET" && path.startsWith("/locations")) return json(res, 200, { locations: [{ name: "fsn1", city: "Falkenstein" }, { name: "hel1", city: "Helsinki" }] });
    if (method === "GET" && path.startsWith("/server_types")) return json(res, 200, { server_types: hzTypes });
    if (method === "GET" && path.startsWith("/images")) {
      return json(res, 200, { images: [{ name: "ubuntu-24.04", description: "Ubuntu 24.04", architecture: "x86" }, { name: "ubuntu-24.04", description: "Ubuntu 24.04", architecture: "arm" }, { name: "fedora-40", description: "Fedora 40", architecture: "x86" }] });
    }
    if (method === "POST" && path === "/servers") {
      const id = ++state.n;
      const server = { id, name: body.name, status: "initializing", labels: body.labels ?? {}, server_type: { name: body.server_type }, location: body.location, image: body.image, user_data: body.user_data, public_net: { ipv4: null }, private_net: [] };
      state.hetznerServers.set(id, server);
      return json(res, 201, { server: { ...server, user_data: undefined }, action: { id: ++state.n }, root_password: null });
    }
    if ((m = path.match(/^\/servers\/(\d+)$/))) {
      const s = state.hetznerServers.get(Number(m[1]));
      if (!s) return json(res, 404, { error: { code: "not_found", message: "server not found" } });
      if (method === "GET") return json(res, 200, { server: s });
      if (method === "DELETE") {
        state.hetznerServers.delete(s.id);
        return json(res, 200, { action: { id: ++state.n } });
      }
    }
    if ((m = path.match(/^\/servers\/(\d+)\/actions\/([a-z_]+)$/)) && method === "POST") {
      const s = state.hetznerServers.get(Number(m[1]));
      if (!s) return json(res, 404, { error: { code: "not_found", message: "server not found" } });
      if (!["shutdown", "poweron", "change_type"].includes(m[2])) return json(res, 404, { error: { code: "not_found", message: "unknown action" } });
      if (m[2] === "change_type" && s.status !== "off") return json(res, 409, { error: { code: "server_not_stopped", message: "server must be stopped" } });
      return json(res, 201, { action: { id: ++state.n, command: m[2], status: "running" } });
    }
    return json(res, 404, { error: { code: "not_found", message: `no fake for ${method} ${path}` } });
  }

  function cloudflare(method, path, body, res) {
    const ok = (result) => json(res, 200, { success: true, errors: [], result });
    let m;
    if (method === "GET" && path === "/user/tokens/verify") return ok({ id: "tok", status: "active" });
    if (method === "GET" && path.startsWith("/zones?")) {
      const name = new URL(`http://x${path}`).searchParams.get("name");
      return ok(state.zones.filter((z) => !name || z.name === name));
    }
    if ((m = path.match(/^\/zones\/([a-f0-9]+)\/dns_records(\?.*)?$/))) {
      const zone = state.zones.find((z) => z.id === m[1]);
      if (!zone) return json(res, 404, { success: false, errors: [{ code: 7003, message: "Could not route to zone" }] });
      if (method === "GET") {
        const q = new URL(`http://x${path}`).searchParams;
        return ok([...state.records.values()].filter((r) => r.zoneId === zone.id && (!q.get("name") || r.name === q.get("name")) && (!q.get("type") || r.type === q.get("type"))));
      }
      if (method === "POST") {
        if (body.type !== "TXT" || !body.name?.endsWith(zone.name)) return json(res, 400, { success: false, errors: [{ code: 9000, message: "bad record" }] });
        const id = (++state.n).toString(16).padStart(32, "0");
        const rec = { id, zoneId: zone.id, type: body.type, name: body.name, content: body.content, ttl: body.ttl };
        state.records.set(id, rec);
        return ok(rec);
      }
    }
    if ((m = path.match(/^\/zones\/([a-f0-9]+)\/dns_records\/([a-f0-9]+)$/)) && method === "DELETE") {
      if (!state.records.delete(m[2])) return json(res, 404, { success: false, errors: [{ code: 81044, message: "Record does not exist." }] });
      return ok({ id: m[2] });
    }
    return json(res, 404, { success: false, errors: [{ code: 7000, message: `no fake for ${method} ${path}` }] });
  }

  const handlers = { digitalocean, hetzner, cloudflare };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const [, provider, ...rest] = req.url.split("/");
      const path = "/" + rest.join("/");
      const body = raw ? JSON.parse(raw) : undefined;
      state.calls.push({ provider, method: req.method, path, auth: req.headers.authorization, body });
      if (!handlers[provider]) return json(res, 404, {});
      for (const [key, f] of state.failNext) {
        if (`${provider} ${req.method} ${path}`.startsWith(key)) {
          state.failNext.delete(key);
          return json(res, f.status, provider === "hetzner" ? { error: { code: "error", message: f.message } } : provider === "cloudflare" ? { success: false, errors: [{ code: 1, message: f.message }] } : { id: "error", message: f.message });
        }
      }
      if (!authOk(provider, req.headers.authorization)) {
        return json(res, 401, provider === "hetzner" ? { error: { code: "unauthorized", message: "unable to authenticate" } } : provider === "cloudflare" ? { success: false, errors: [{ code: 1000, message: "Invalid API Token" }] } : { id: "unauthorized", message: "Unable to authenticate you" });
      }
      handlers[provider](req.method, path, body, res);
    });
  });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const base = `http://127.0.0.1:${port}`;
  return {
    state,
    env: { INVEON_DIGITALOCEAN_API_BASE: `${base}/digitalocean`, INVEON_HETZNER_API_BASE: `${base}/hetzner`, INVEON_CLOUDFLARE_API_BASE: `${base}/cloudflare` },
    calls: (provider, method, prefix = "") => state.calls.filter((c) => c.provider === provider && (!method || c.method === method) && c.path.startsWith(prefix)),
    /** The next request starting with "<provider> <METHOD> <path>" fails with this status and message. */
    failNext: (key, status, message) => state.failNext.set(key, { status, message }),
    close: () => new Promise((r) => server.close(r)),
  };
}
