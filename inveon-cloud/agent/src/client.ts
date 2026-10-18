import type { RequestSigner } from "./signing.js";

/**
 * HTTPS client for the control plane's agent API. The agent only ever
 * connects out. With a signer, every request is also signed (signing.ts).
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface AgentStep {
  id: string;
  position: number;
  name: string;
  action: string;
  params: unknown;
}

export interface AgentJob {
  id: string;
  type: string;
  title: string;
  steps: AgentStep[];
}

export class ControlPlaneClient {
  constructor(
    private baseUrl: string,
    private token: string | null,
    private signer: RequestSigner | null = null,
  ) {}

  private async post(path: string, body: unknown, timeoutMs = 30000) {
    const url = new URL(`${this.baseUrl}/api/v1/agent${path}`);
    const payload = JSON.stringify(body ?? {});
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "inveon-agent",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        // The exact path and bytes sent are what is signed.
        ...(this.signer ? this.signer.headers("POST", url.pathname + url.search, payload) : {}),
      },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 204) return null;
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) throw new HttpError(res.status, data?.error?.message ?? `HTTP ${res.status}`);
    return data;
  }

  /** publicKey: the agent's Ed25519 key (SPKI DER, base64); older control planes ignore it. */
  register(token: string, facts: unknown, publicKey?: string) {
    return this.post("/register", { token, facts, publicKey }) as Promise<{ serverId: string; agentToken: string; signingKey?: string | null }>;
  }

  /** Enrols the signing key of an agent installed before request signing. */
  registerSigningKey(publicKey: string) {
    return this.post("/signing-key", { publicKey }) as Promise<{ signingKey: string }>;
  }

  heartbeat(facts: unknown) {
    return this.post("/heartbeat", { facts });
  }

  /** Host metrics, in batches (see metrics.ts). */
  sendMetrics(samples: unknown[]) {
    return this.post("/metrics", { samples });
  }

  /**
   * Long poll: the control plane holds the request until a job arrives or ~25s
   * pass. The "stream" lane only hands out live log streams; "main" everything else.
   */
  async claim(lane: "main" | "stream" = "main"): Promise<AgentJob | null> {
    const data = (await this.post("/jobs/claim", { lane }, 70000)) as { job: AgentJob } | null;
    return data?.job ?? null;
  }

  reportStep(jobId: string, stepId: string, report: { status?: "running" | "success" | "failure"; append?: string; result?: unknown }) {
    return this.post(`/jobs/${jobId}/steps/${stepId}`, report);
  }

  /** certbot's DNS-01 hook: publish or remove the TXT record (Route 53 can take a minute to sync). */
  dnsChallenge(jobId: string, body: { phase: "auth" | "cleanup"; domain: string; validation: string }) {
    return this.post(`/jobs/${jobId}/dns-challenge`, body, 240000) as Promise<{ waitSec?: number } | null>;
  }

  finish(jobId: string, status: "success" | "failure", error?: string) {
    return this.post(`/jobs/${jobId}/finish`, { status, error });
  }
}
