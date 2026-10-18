/**
 * JSON over HTTPS to the provider REST APIs (DigitalOcean, Hetzner Cloud,
 * Cloudflare) with fetch: no SDKs. The base URLs come from the environment
 * so tests can point them at local fakes. Tokens go in the Authorization
 * header only and never appear in errors or logs.
 */

export type ApiProvider = "digitalocean" | "hetzner" | "cloudflare";

const bases: Record<ApiProvider, string> = {
  digitalocean: "https://api.digitalocean.com/v2",
  hetzner: "https://api.hetzner.cloud/v1",
  cloudflare: "https://api.cloudflare.com/client/v4",
};

export function configureProviderApis(urls: Partial<Record<ApiProvider, string | undefined>>) {
  for (const [k, v] of Object.entries(urls) as [ApiProvider, string | undefined][]) if (v) bases[k] = v.replace(/\/$/, "");
}

export const providerBase = (p: ApiProvider) => bases[p];

/** A provider's API said no: status and its message (never the token). */
export class ProviderApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;

/** One request; JSON in, JSON out. 204 and empty bodies return null. */
export async function providerRequest<T = Record<string, unknown>>(
  provider: ApiProvider,
  token: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T | null> {
  if (!path.startsWith("/") || path.includes("..")) throw new Error("Bad provider API path");
  let res: Response;
  try {
    res = await fetch(`${bases[provider]}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "inveon-cloud", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderApiError(0, `Could not reach the ${provider} API (${(err as Error).name === "TimeoutError" ? "timed out" : "network error"})`);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw new ProviderApiError(res.status, errorMessage(provider, res.status, data));
  return data as T | null;
}

/** Each API words its errors differently; keep one short line. */
function errorMessage(provider: ApiProvider, status: number, data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  let msg: unknown;
  if (provider === "digitalocean") msg = d.message;
  else if (provider === "hetzner") msg = (d.error as { message?: unknown } | undefined)?.message;
  else msg = Array.isArray(d.errors) ? (d.errors as { message?: unknown }[]).map((e) => e.message).filter(Boolean).join("; ") : undefined;
  const text = typeof msg === "string" && msg ? msg : `HTTP ${status}`;
  return `${text}`.replace(/\s+/g, " ").slice(0, 300);
}
