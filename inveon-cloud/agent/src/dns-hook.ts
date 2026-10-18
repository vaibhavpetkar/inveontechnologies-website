import { HOSTNAME_RE } from "./params.js";

/**
 * `inveon-agent dns-hook auth|cleanup`: the command certbot runs for a
 * DNS-01 challenge (--manual-auth-hook / --manual-cleanup-hook). It reads
 * what certbot sets (CERTBOT_DOMAIN, CERTBOT_VALIDATION) and the job the
 * agent gave certbot (INVEON_DNS_JOB_ID), and asks the control plane to
 * publish or remove the TXT record. The control plane checks that the job
 * is running on this server and is about that domain. After publishing it
 * waits as long as the control plane says, for the record to propagate.
 */
export interface DnsHookClient {
  dnsChallenge(jobId: string, body: { phase: "auth" | "cleanup"; domain: string; validation: string }): Promise<{ waitSec?: number } | null>;
}

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VALUE_RE = /^[A-Za-z0-9_-]{20,128}$/;
export const MAX_WAIT_SEC = 600;

export async function runDnsHook(
  phase: string,
  env: Record<string, string | undefined>,
  deps: { client: DnsHookClient; sleep?: (ms: number) => Promise<void>; log?: (msg: string) => void },
) {
  if (phase !== "auth" && phase !== "cleanup") throw new Error("Usage: inveon-agent dns-hook auth|cleanup");
  const jobId = env.INVEON_DNS_JOB_ID ?? "";
  const domain = (env.CERTBOT_DOMAIN ?? "").toLowerCase();
  const validation = env.CERTBOT_VALIDATION ?? "";
  if (!JOB_ID_RE.test(jobId)) throw new Error("INVEON_DNS_JOB_ID is not set: certbot was not started by the agent");
  if (!HOSTNAME_RE.test(domain)) throw new Error("CERTBOT_DOMAIN is missing or invalid");
  if (!VALUE_RE.test(validation)) throw new Error("CERTBOT_VALIDATION is missing or invalid");
  const res = await deps.client.dnsChallenge(jobId, { phase, domain, validation });
  if (phase !== "auth") return 0;
  const wait = Math.min(Math.max(Math.floor(Number(res?.waitSec ?? 0)) || 0, 0), MAX_WAIT_SEC);
  deps.log?.(`TXT record for _acme-challenge.${domain} published; waiting ${wait}s for it to propagate`);
  if (wait) await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(wait * 1000);
  return wait;
}
