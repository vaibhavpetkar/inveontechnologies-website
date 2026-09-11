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

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
