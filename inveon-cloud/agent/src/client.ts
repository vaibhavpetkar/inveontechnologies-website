/** HTTPS client for the control plane's agent API. The agent only ever connects out. */
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
  ) {}

  private async post(path: string, body: unknown, timeoutMs = 30000) {
    const res = await fetch(`${this.baseUrl}/api/v1/agent${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "inveon-agent", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 204) return null;
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) throw new HttpError(res.status, data?.error?.message ?? `HTTP ${res.status}`);
    return data;
  }

  register(token: string, facts: unknown) {
    return this.post("/register", { token, facts }) as Promise<{ serverId: string; agentToken: string }>;
  }

  heartbeat(facts: unknown) {
    return this.post("/heartbeat", { facts });
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

  finish(jobId: string, status: "success" | "failure", error?: string) {
    return this.post(`/jobs/${jobId}/finish`, { status, error });
  }
}
