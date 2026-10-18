import { createHmac, createPrivateKey, sign, type KeyObject } from "node:crypto";
import type { Env } from "../env.js";
import { safeEqual, verifyGithubSignature } from "./crypto.js";

/**
 * GitHub App client (optional; set by INVEON_GITHUB_APP_*).
 *
 * - The app authenticates as itself with a short RS256 JWT, signed here with
 *   node:crypto (iat 60 seconds back for clock drift, 9 minutes valid).
 * - It exchanges that for an installation token (1 hour), always narrowed
 *   to the repositories and permissions the caller needs. Tokens are cached
 *   per installation and scope until 5 minutes before they expire.
 * - Linking an installation to an organization goes through GitHub's setup
 *   redirect: a signed state names the organization and the admin, and the
 *   OAuth code GitHub adds proves that this GitHub user can see the
 *   installation (so nobody can link someone else's installation by id).
 */

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface AppConfig {
  appId: string;
  slug: string;
  key: KeyObject;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  apiBase: string;
  webBase: string;
  stateKey: Buffer;
}

let cfg: AppConfig | null = null;

/** Reads the PEM, or base64 of the PEM (easier to put in one env line). */
function parsePrivateKey(raw: string): KeyObject {
  const text = raw.includes("-----BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw.trim(), "base64").toString("utf8");
  const key = createPrivateKey(text);
  if (key.asymmetricKeyType !== "rsa") throw new Error("INVEON_GITHUB_APP_PRIVATE_KEY must be the app's RSA private key");
  return key;
}

/** Called once at start-up. All of id, slug and key, or none of them. */
export function configureGithubApp(env: Env) {
  const parts = [env.INVEON_GITHUB_APP_ID, env.INVEON_GITHUB_APP_SLUG, env.INVEON_GITHUB_APP_PRIVATE_KEY];
  if (parts.every((p) => !p)) {
    cfg = null;
    return;
  }
  if (parts.some((p) => !p)) throw new Error("Set INVEON_GITHUB_APP_ID, INVEON_GITHUB_APP_SLUG and INVEON_GITHUB_APP_PRIVATE_KEY together");
  cfg = {
    appId: env.INVEON_GITHUB_APP_ID!,
    slug: env.INVEON_GITHUB_APP_SLUG!,
    key: parsePrivateKey(env.INVEON_GITHUB_APP_PRIVATE_KEY!),
    clientId: env.INVEON_GITHUB_APP_CLIENT_ID,
    clientSecret: env.INVEON_GITHUB_APP_CLIENT_SECRET,
    webhookSecret: env.INVEON_GITHUB_APP_WEBHOOK_SECRET,
    apiBase: env.INVEON_GITHUB_API_BASE.replace(/\/$/, ""),
    webBase: env.INVEON_GITHUB_WEB_BASE.replace(/\/$/, ""),
    stateKey: createHmac("sha256", env.INVEON_JWT_SECRET).update("inveon-github-setup-state").digest(),
  };
  tokenCache.clear();
}

export const githubAppConfigured = () => !!cfg;
export const githubAppInfo = () => (cfg ? { slug: cfg.slug, canLink: !!(cfg.clientId && cfg.clientSecret), webhook: !!cfg.webhookSecret } : null);

function config() {
  if (!cfg) throw new GithubApiError(0, "The GitHub App is not configured");
  return cfg;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The app's own JWT (RS256), for /app endpoints only. */
export function appJwt(nowMs = Date.now()) {
  const c = config();
  const now = Math.floor(nowMs / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: c.appId }));
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), c.key);
  return `${head}.${body}.${b64url(signature)}`;
}

/** A GitHub REST call. Errors carry GitHub's status; the token is never logged. */
export async function githubRequest<T = unknown>(method: string, path: string, opts: { token: string; body?: unknown; base?: string; accept?: string }): Promise<T> {
  const base = opts.base ?? config().apiBase;
  let res: globalThis.Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        Accept: opts.accept ?? "application/vnd.github+json",
        "User-Agent": "inveon-cloud",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${opts.token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new GithubApiError(0, "Could not reach GitHub");
  }
  const text = await res.text();
  if (!res.ok) throw new GithubApiError(res.status, `GitHub returned ${res.status} for ${method} ${path.split("?")[0]}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface TokenScope {
  /** Repository names (without the owner) the token may touch. */
  repositories?: string[];
  permissions: Record<string, "read" | "write">;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
/** A cached token is used until this long before it expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

export async function installationToken(installationId: number, scope: TokenScope, nowMs = Date.now()): Promise<string> {
  const key = `${installationId}|${[...(scope.repositories ?? [])].sort().join(",")}|${Object.entries(scope.permissions).sort().map(([k, v]) => `${k}:${v}`).join(",")}`;
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt - nowMs > TOKEN_MARGIN_MS) return hit.token;
  const out = await githubRequest<{ token?: string; expires_at?: string }>("POST", `/app/installations/${installationId}/access_tokens`, {
    token: appJwt(nowMs),
    body: { ...(scope.repositories ? { repositories: scope.repositories } : {}), permissions: scope.permissions },
  });
  const expiresAt = out.expires_at ? Date.parse(out.expires_at) : NaN;
  if (!out.token || !/^[A-Za-z0-9_.-]{20,255}$/.test(out.token) || !Number.isFinite(expiresAt)) throw new GithubApiError(502, "GitHub returned no installation token");
  tokenCache.set(key, { token: out.token, expiresAt });
  return out.token;
}

/** Forget cached tokens for an installation (uninstalled or suspended). */
export function dropInstallationTokens(installationId: number) {
  for (const k of tokenCache.keys()) if (k.startsWith(`${installationId}|`)) tokenCache.delete(k);
}

export async function getInstallation(installationId: number) {
  return githubRequest<{ id: number; account?: { login?: string; type?: string } | null; suspended_at?: string | null }>("GET", `/app/installations/${installationId}`, { token: appJwt() });
}

// ---------------------------------------------------------------- linking

const STATE_TTL_MS = 60 * 60 * 1000;

/** state for the install URL: organization, admin and expiry, HMAC-signed. */
export function signSetupState(orgId: string, userId: string, nowMs = Date.now()) {
  const body = b64url(JSON.stringify({ o: orgId, u: userId, e: nowMs + STATE_TTL_MS }));
  return `${body}.${createHmac("sha256", config().stateKey).update(body).digest("base64url")}`;
}

export function verifySetupState(state: string, nowMs = Date.now()): { orgId: string; userId: string } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac || state.split(".").length !== 2) return null;
  if (!safeEqual(createHmac("sha256", config().stateKey).update(body).digest("base64url"), mac)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { o?: unknown; u?: unknown; e?: unknown };
    if (typeof v.o !== "string" || typeof v.u !== "string" || typeof v.e !== "number" || v.e < nowMs) return null;
    return { orgId: v.o, userId: v.u };
  } catch {
    return null;
  }
}

export const installUrl = (state: string) => `${config().webBase}/apps/${config().slug}/installations/new?state=${encodeURIComponent(state)}`;

/** The OAuth code from the setup redirect, for a user token (used once, to list the user's installations). */
export async function exchangeOAuthCode(code: string): Promise<string> {
  const c = config();
  if (!c.clientId || !c.clientSecret) throw new GithubApiError(0, "Set INVEON_GITHUB_APP_CLIENT_ID and INVEON_GITHUB_APP_CLIENT_SECRET to link installations");
  let res: globalThis.Response;
  try {
    res = await fetch(`${c.webBase}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "inveon-cloud" },
      body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new GithubApiError(0, "Could not reach GitHub");
  }
  const out = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !out.access_token) throw new GithubApiError(res.status, "GitHub didn't accept the authorization code");
  return out.access_token;
}

/** Whether that GitHub user can see the installation (GET /user/installations). */
export async function userCanSeeInstallation(userToken: string, installationId: number) {
  for (let page = 1; page <= 10; page++) {
    const out = await githubRequest<{ installations?: { id: number }[] }>("GET", `/user/installations?per_page=100&page=${page}`, { token: userToken });
    const list = out.installations ?? [];
    if (list.some((i) => i.id === installationId)) return true;
    if (list.length < 100) return false;
  }
  return false;
}

/** The app's own webhook (installation events, and pushes and pull requests of installed repos). */
export function verifyAppWebhook(raw: Buffer, header: string | undefined) {
  const secret = cfg?.webhookSecret;
  return !!secret && verifyGithubSignature(secret, raw, header);
}
