// In dev, the backend runs on :4000; in production, nginx proxies /api/
// on the same origin (see docs/domain-and-deployment.md), so an empty
// base works there. Vite exposes env vars prefixed VITE_.
const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
}

// Access tokens live for 15 minutes (PORTAL_ACCESS_TOKEN_TTL_MIN). When an
// authenticated call comes back 401, the session is silently refreshed via
// the httpOnly refresh cookie and the call retried once — otherwise every
// page (and any exam longer than the token lifetime) starts failing a
// quarter of an hour after sign-in. AuthProvider registers the listener so
// it can store the new token / sign the user out.
type SessionListener = (accessToken: string | null) => void;
let sessionListener: SessionListener | null = null;
let refreshInFlight: Promise<string | null> | null = null;
// Bumped on login/logout. A refresh that started under an older session
// must not report back — e.g. the on-load refresh finding "no session"
// after the person has already signed in would otherwise sign them out.
let sessionGeneration = 0;

export function onSessionChange(listener: SessionListener | null) {
  sessionListener = listener;
}

export function getSessionGeneration() {
  return sessionGeneration;
}

/** Call when login/logout replaces the session outside refreshSession(). */
export function startNewSession() {
  sessionGeneration++;
  refreshInFlight = null;
}

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers
 * share one request: the backend rotates the refresh token on every use, so
 * two parallel refreshes would race each other's rotation.
 */
export function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    const generation = sessionGeneration;
    const inFlight: Promise<string | null> = request<{ accessToken: string }>("/api/v1/auth/refresh", { method: "POST" })
      .then((r) => r.accessToken)
      .catch(() => null)
      .then((token) => {
        if (generation !== sessionGeneration) return null;
        sessionListener?.(token);
        return token;
      })
      .finally(() => {
        if (refreshInFlight === inFlight) refreshInFlight = null;
      });
    refreshInFlight = inFlight;
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    // Sends/receives the httpOnly refresh-token cookie set by the backend.
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const code = data?.error?.code ?? "UNKNOWN_ERROR";
    const message = data?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(code, message, res.status);
  }

  return data as T;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await request<T>(path, options);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !options.accessToken) throw err;
    const fresh = await refreshSession();
    if (!fresh) throw err;
    return request<T>(path, { ...options, accessToken: fresh });
  }
}
