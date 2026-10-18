import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const AGENT_VERSION = "0.1.0";
export const DEFAULT_CONFIG_PATH = "/etc/inveon-agent/config.json";

export interface AgentConfig {
  controlPlaneUrl: string;
  serverId: string;
  token: string;
  /** One folder per environment: <appsRoot>/<slug>/{blue,green,main,data}. */
  appsRoot: string;
  /** nginx includes *.conf from here in the http block (Debian/Ubuntu default). */
  nginxConfDir: string;
  acmeWebroot: string;
  letsencryptDir: string;
  workDir: string;
  /** The Ed25519 key for request signing (default: agent-key.pem next to this file). */
  signingKeyPath?: string;
  /** Set once the control plane has the signing key's public half. */
  signingKeyRegistered?: boolean;
}

export const DEFAULTS: Omit<AgentConfig, "controlPlaneUrl" | "serverId" | "token"> = {
  appsRoot: "/srv/inveon/apps",
  nginxConfDir: "/etc/nginx/conf.d",
  acmeWebroot: "/var/www/inveon-acme",
  letsencryptDir: "/etc/letsencrypt",
  workDir: "/var/lib/inveon-agent",
};

export function loadConfig(path: string): AgentConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentConfig>;
  if (!raw.controlPlaneUrl || !raw.token || !raw.serverId) throw new Error(`${path} is missing controlPlaneUrl, serverId or token`);
  return { ...DEFAULTS, ...raw } as AgentConfig;
}

/** The token is a credential: the file is root-only (0600). */
export function saveConfig(path: string, config: AgentConfig) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

/** HTTPS only, except to this machine (local development). */
export function checkControlPlaneUrl(url: string) {
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && (local || process.env.INVEON_AGENT_ALLOW_HTTP === "1"))) {
    throw new Error("The control plane URL must use https://");
  }
  return u.toString().replace(/\/$/, "");
}
