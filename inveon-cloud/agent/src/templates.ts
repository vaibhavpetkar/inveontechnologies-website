import { ENV_KEY_RE, HOSTNAME_RE, ParamError, SLUG_RE } from "./params.js";

export const upstreamName = (slug: string) => `inveon_${slug.replace(/-/g, "_")}`;

/** The one line that blue/green switching changes. */
export function renderUpstream(slug: string, port: number) {
  if (!SLUG_RE.test(slug) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new ParamError("Invalid upstream");
  return `# Managed by inveon-agent. Do not edit.\nupstream ${upstreamName(slug)} {\n    server 127.0.0.1:${port};\n    keepalive 16;\n}\n`;
}

/**
 * A site for one hostname. Without TLS it serves the ACME challenge and
 * proxies everything else; with TLS it redirects HTTP to HTTPS.
 */
export function renderSite(opts: { hostname: string; slug: string; tls: boolean; acmeWebroot: string; letsencryptDir: string }) {
  const { hostname, slug, tls, acmeWebroot, letsencryptDir } = opts;
  if (!HOSTNAME_RE.test(hostname) || !SLUG_RE.test(slug)) throw new ParamError("Invalid site");
  const up = upstreamName(slug);
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
