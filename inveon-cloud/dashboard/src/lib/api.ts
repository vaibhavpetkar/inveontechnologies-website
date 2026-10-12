// Same-origin API: the control plane serves this app in production and Vite
// proxies /api in development, so the httpOnly refresh cookie just works.
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

// The access token lives in memory only (never localStorage). On a 401 the
// session is refreshed once through the refresh cookie and the call retried.
let accessToken: string | null = null;
let sessionListener: ((token: string | null) => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onSessionChange(fn: ((token: string | null) => void) | null) {
  sessionListener = fn;
}

async function raw<T>(path: string, init: { method?: string; body?: unknown; token?: string | null }): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    credentials: "include",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    const details = err?.details as Record<string, string[]> | undefined;
    const first = details ? Object.entries(details).map(([k, v]) => `${k}: ${v.join(", ")}`)[0] : undefined;
    throw new ApiError(err?.code ?? "UNKNOWN", first ? `${err?.message ?? "Invalid input"} (${first})` : (err?.message ?? `Request failed (${res.status})`), res.status, details);
  }
  return data as T;
}

export function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = raw<{ accessToken: string }>("/auth/refresh", { method: "POST" })
      .then((r) => r.accessToken)
      .catch(() => null)
      .then((token) => {
        accessToken = token;
        sessionListener?.(token);
        return token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await raw<T>(path, { ...init, token: accessToken });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !accessToken) throw err;
    const fresh = await refreshSession();
    if (!fresh) throw err;
    return raw<T>(path, { ...init, token: fresh });
  }
}

export interface StreamHandlers {
  onEvent: (event: string, data: unknown) => void;
  onEnd?: () => void;
}

/**
 * Reads a Server-Sent Events stream with fetch(), so the bearer token goes
 * in a header (EventSource can't send one). Returns an abort function.
 */
export function stream(path: string, handlers: StreamHandlers): () => void {
  const controller = new AbortController();
  (async () => {
    let token = accessToken;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${API_BASE}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include", signal: controller.signal });
      if (res.status === 401 && attempt === 0) {
        token = await refreshSession();
        if (!token) break;
        continue;
      }
      if (!res.ok || !res.body) break;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (data) {
            try {
              handlers.onEvent(event, JSON.parse(data));
            } catch {
              // ignore malformed event
            }
          }
        }
      }
      break;
    }
  })()
    .catch(() => undefined)
    .finally(() => handlers.onEnd?.());
  return () => controller.abort();
}
