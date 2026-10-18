import { isIP } from "node:net";
import { ENV_KEY_RE, HOSTNAME_RE, ParamError, SLUG_RE } from "./params.js";

export const upstreamName = (slug: string) => `inveon_${slug.replace(/-/g, "_")}`;
/** The proxy's upstream for an environment on several servers: every replica's listener. */
export const poolName = (slug: string) => `inveon_pool_${slug.replace(/-/g, "_")}`;

const validPort = (port: number) => Number.isInteger(port) && port >= 1024 && port <= 65535;

/** An IPv4 or IPv6 literal, as nginx wants it in `server` and `allow` lines. */
export function ipLiteral(ip: string) {
  const v = typeof ip === "string" ? isIP(ip) : 0;
  if (!v || ip.length > 45 || !/^[0-9A-Fa-f.:]+$/.test(ip)) throw new ParamError(`Invalid address ${String(ip).slice(0, 50)}`);
  return v;
}

/** The one line that blue/green switching changes. */
export function renderUpstream(slug: string, port: number) {
  if (!SLUG_RE.test(slug) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new ParamError("Invalid upstream");
  return `# Managed by inveon-agent. Do not edit.\nupstream ${upstreamName(slug)} {\n    server 127.0.0.1:${port};\n    keepalive 16;\n}\n`;
}

export interface PoolMember {
  host: string;
  port: number;
}

/**
 * The proxy's view of a multi-server environment: one line per replica
 * (its listener port, on its private IP when known), with nginx's passive
 * health checks. A replica that fails maxFails times within failTimeout is
 * skipped for failTimeout, and requests that fail on one go to the next.
 */
export function renderPool(slug: string, members: PoolMember[], opts: { maxFails: number; failTimeoutSec: number }) {
  if (!SLUG_RE.test(slug) || !members.length || members.length > 50) throw new ParamError("Invalid pool");
  if (!Number.isInteger(opts.maxFails) || opts.maxFails < 1 || opts.maxFails > 20 || !Number.isInteger(opts.failTimeoutSec) || opts.failTimeoutSec < 1 || opts.failTimeoutSec > 600) {
    throw new ParamError("Invalid health check settings");
  }
  const lines = members.map((m) => {
    if (!validPort(m.port)) throw new ParamError("Invalid pool port");
    const host = ipLiteral(m.host) === 6 ? `[${m.host}]` : m.host;
    return `    server ${host}:${m.port} max_fails=${opts.maxFails} fail_timeout=${opts.failTimeoutSec}s;`;
  });
  return `# Managed by inveon-agent. Do not edit.\nupstream ${poolName(slug)} {\n${lines.join("\n")}\n    keepalive 16;\n}\n`;
}

/**
 * This server's replica listener: the environment's proxy reaches the live
 * colour here (through the local upstream that blue/green switches). Only
 * the proxy's addresses and this machine may connect. The proxy already
 * set the forwarding headers, so they are passed on as they came.
 */
export function renderListener(slug: string, port: number, allow: string[]) {
  if (!SLUG_RE.test(slug) || !validPort(port) || !allow.length || allow.length > 20) throw new ParamError("Invalid listener");
  for (const a of allow) ipLiteral(a);
  return [
    "# Managed by inveon-agent. Do not edit.",
    "server {",
    `    listen ${port};`,
    `    listen [::]:${port};`,
    ...[...new Set(allow)].map((a) => `    allow ${a};`),
    "    deny all;",
    "    location / {",
    `        proxy_pass http://${upstreamName(slug)};`,
    "        proxy_http_version 1.1;",
    "        proxy_set_header Host $host;",
    "        proxy_set_header X-Real-IP $http_x_real_ip;",
    "        proxy_set_header X-Forwarded-For $http_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;",
    "        proxy_set_header Upgrade $http_upgrade;",
    '        proxy_set_header Connection "upgrade";',
    "        proxy_read_timeout 120s;",
    "        client_max_body_size 50m;",
    "    }",
    "}",
    "",
  ].join("\n");
}

/**
 * A site for one hostname. Without TLS it serves the ACME challenge and
 * proxies everything else; with TLS it redirects HTTP to HTTPS.
 */
export function renderSite(opts: { hostname: string; slug: string; tls: boolean; acmeWebroot: string; letsencryptDir: string; pool?: boolean }) {
  const { hostname, slug, tls, acmeWebroot, letsencryptDir } = opts;
  if (!HOSTNAME_RE.test(hostname) || !SLUG_RE.test(slug)) throw new ParamError("Invalid site");
  // On the proxy of a multi-server environment the site goes to the pool of replicas.
  const up = opts.pool ? poolName(slug) : upstreamName(slug);
  const acme = `    location ^~ /.well-known/acme-challenge/ {\n        root ${acmeWebroot};\n        default_type text/plain;\n    }\n`;
  const proxy = [
    "    location / {",
    `        proxy_pass http://${up};`,
    "        proxy_http_version 1.1;",
    "        proxy_set_header Host $host;",
    "        proxy_set_header X-Real-IP $remote_addr;",
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $scheme;",
    "        proxy_set_header Upgrade $http_upgrade;",
    '        proxy_set_header Connection "upgrade";',
    "        proxy_read_timeout 120s;",
    "        client_max_body_size 50m;",
    ...(opts.pool ? ["        proxy_next_upstream error timeout http_502 http_503 http_504;", "        proxy_next_upstream_tries 2;"] : []),
    "    }",
  ].join("\n");
  const header = `# Managed by inveon-agent for ${hostname}. Do not edit.\n`;
  if (!tls) {
    return `${header}server {\n    listen 80;\n    listen [::]:80;\n    server_name ${hostname};\n${acme}${proxy}\n}\n`;
  }
  const live = `${letsencryptDir}/live/${hostname}`;
  return (
    `${header}server {\n    listen 80;\n    listen [::]:80;\n    server_name ${hostname};\n${acme}    location / {\n        return 301 https://$host$request_uri;\n    }\n}\n\n` +
    `server {\n    listen 443 ssl http2;\n    listen [::]:443 ssl http2;\n    server_name ${hostname};\n` +
    `    ssl_certificate ${live}/fullchain.pem;\n    ssl_certificate_key ${live}/privkey.pem;\n` +
    `    ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_session_cache shared:inveon_ssl:10m;\n` +
    `    add_header Strict-Transport-Security "max-age=31536000" always;\n${proxy}\n}\n`
  );
}

/**
 * docker compose .env format. Single quotes are literal (no ${} expansion);
 * values containing a single quote or newline use double quotes with escapes.
 */
export function formatEnvFile(env: Record<string, string>) {
  const lines = ["# Written by inveon-agent for this release. Do not edit."];
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_RE.test(key)) throw new ParamError(`Invalid env key ${key}`);
    if (typeof value !== "string") throw new ParamError(`Invalid value for ${key}`);
    if (!/['\n\r]/.test(value)) lines.push(`${key}='${value}'`);
    else lines.push(`${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`);
  }
  return lines.join("\n") + "\n";
}
