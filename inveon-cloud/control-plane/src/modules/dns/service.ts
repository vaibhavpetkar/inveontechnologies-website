import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { dnsChallenges, wildcardCertificates } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { credentialsOf, loadConnection } from "../aws/service.js";
import { providerRequest } from "../cloud/http.js";
import { connectionToken, loadProviderConnection, providerErrorMessage } from "../cloud/service.js";
import { route53Api, type Route53Api } from "./route53.js";

/**
 * DNS-01 challenges for wildcard certificates. certbot runs on the server
 * with --manual and the agent's fixed hook commands; each hook calls the
 * control plane, which publishes or removes the TXT record
 * _acme-challenge.<base> through the organization's DNS provider. Provider
 * credentials never reach the server.
 */

export const DNS_PROVIDERS = ["cloudflare", "route53"] as const;
export type DnsProvider = (typeof DNS_PROVIDERS)[number];
export const DNS_PROVIDER_LABELS: Record<DnsProvider, string> = { cloudflare: "Cloudflare", route53: "Amazon Route 53" };

type Wildcard = typeof wildcardCertificates.$inferSelect;

export const challengeName = (base: string) => `_acme-challenge.${base}`;
/** What certbot hands its auth hook: base64url of a SHA-256 digest (43 characters). */
export const ACME_VALUE_RE = /^[A-Za-z0-9_-]{20,128}$/;
/** The certificate's name on the server; never a hostname, so it can't clash with a domain's own certificate. */
export const wildcardCertName = (base: string) => `wildcard_${base}`;
/** A challenge job publishes at most this many values (certbot needs one per name, twice per wildcard). */
export const MAX_CHALLENGES_PER_JOB = 8;
const TXT_TTL = 60;

const settings = { propagationSec: 30, insyncTimeoutMs: 180_000, pollMs: 2000, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

export function configureDns(opts: Partial<typeof settings>) {
  Object.assign(settings, Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)));
}

export interface DnsApi {
  /** The zone named exactly `name`, or null. */
  findZone(name: string): Promise<{ id: string; name: string } | null>;
  /** Publishes `value` next to the name's other live values; returns the provider's record id if it has one. */
  addTxt(zoneId: string, name: string, value: string, others: string[]): Promise<string | null>;
  removeTxt(zoneId: string, name: string, value: string, recordId: string | null, remaining: string[]): Promise<void>;
}

type CfZone = { id: string; name: string; status?: string };

export function cloudflareDns(token: string): DnsApi {
  return {
    async findZone(name) {
      const res = await providerRequest<{ result?: CfZone[] }>("cloudflare", token, "GET", `/zones?name=${encodeURIComponent(name)}&per_page=5`);
      const zone = (res?.result ?? []).find((z) => z.name === name);
      return zone && /^[a-f0-9]{32}$/.test(zone.id) ? { id: zone.id, name: zone.name } : null;
    },
    async addTxt(zoneId, name, value) {
      const res = await providerRequest<{ result?: { id?: string } }>("cloudflare", token, "POST", `/zones/${zoneId}/dns_records`, { type: "TXT", name, content: value, ttl: TXT_TTL });
      return res?.result?.id ?? null;
    },
    async removeTxt(zoneId, name, value, recordId) {
      let id = recordId;
      if (!id) {
        const res = await providerRequest<{ result?: { id: string; content: string }[] }>("cloudflare", token, "GET", `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`);
        id = res?.result?.find((r) => r.content.replace(/^"|"$/g, "") === value)?.id ?? null;
      }
      if (!id || !/^[a-f0-9]{32}$/.test(id)) return;
      await providerRequest("cloudflare", token, "DELETE", `/zones/${zoneId}/dns_records/${id}`);
    },
  };
}

/** Route 53 keeps one record set per name: it is rewritten with every live value, and waits until the change is in sync. */
export function route53Dns(api: Route53Api): DnsApi {
  const insync = async (changeId: string) => {
    const until = Date.now() + settings.insyncTimeoutMs;
    for (;;) {
      if ((await api.changeStatus(changeId)) === "INSYNC") return;
      if (Date.now() > until) throw new AppError("DNS_NOT_IN_SYNC", "Route 53 did not apply the TXT record in time", 504);
      await settings.sleep(settings.pollMs);
    }
  };
  return {
    findZone: (name) => api.findZone(name),
    async addTxt(zoneId, name, value, others) {
      await insync(await api.changeTxt(zoneId, "UPSERT", name, [...new Set([...others, value])], TXT_TTL));
      return null;
    },
    async removeTxt(zoneId, name, value, _recordId, remaining) {
      if (remaining.length) await api.changeTxt(zoneId, "UPSERT", name, remaining, TXT_TTL);
      else await api.changeTxt(zoneId, "DELETE", name, [value], TXT_TTL);
    },
  };
}

export async function dnsApiFor(db: Database, orgId: string, provider: DnsProvider): Promise<DnsApi> {
  if (provider === "cloudflare") return cloudflareDns(connectionToken(await loadProviderConnection(db, orgId, "cloudflare")));
  return route53Dns(await route53Api(credentialsOf(await loadConnection(db, orgId))));
}

export const dnsFailure = (err: unknown, what: string) => (err instanceof AppError ? err : new AppError("DNS_PROVIDER_ERROR", `${what}: ${providerErrorMessage(err)}`, 502));

/** The provider's zone for a base domain: the base itself or the nearest parent the account has. */
export async function findZoneFor(api: DnsApi, base: string) {
  const labels = base.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const zone = await api.findZone(labels.slice(i).join("."));
    if (zone) return zone;
  }
  return null;
}

/** An active wildcard on this server that covers the hostname (the base itself, or one label under it). */
export async function coveringWildcard(db: Database, orgId: string, serverId: string, hostname: string) {
  const rows = await db
    .select()
    .from(wildcardCertificates)
    .where(and(eq(wildcardCertificates.orgId, orgId), eq(wildcardCertificates.serverId, serverId), eq(wildcardCertificates.status, "active")));
  return rows.find((w) => hostname === w.baseDomain || (hostname.endsWith(`.${w.baseDomain}`) && !hostname.slice(0, -(w.baseDomain.length + 1)).includes("."))) ?? null;
}

const live = (db: Database, wildcard: Wildcard) =>
  db.select().from(dnsChallenges).where(and(eq(dnsChallenges.wildcardId, wildcard.id), eq(dnsChallenges.recordName, challengeName(wildcard.baseDomain)), isNull(dnsChallenges.removedAt)));

/** certbot's auth hook: publish the value; certbot then waits waitSec for it to propagate. */
export async function presentChallenge(db: Database, wildcard: Wildcard, jobId: string, value: string) {
  const name = challengeName(wildcard.baseDomain);
  const current = await live(db, wildcard);
  if (current.some((c) => c.jobId === jobId && c.value === value)) return { waitSec: settings.propagationSec };
  const forJob = await db.select({ id: dnsChallenges.id }).from(dnsChallenges).where(eq(dnsChallenges.jobId, jobId));
  if (forJob.length >= MAX_CHALLENGES_PER_JOB) throw new AppError("TOO_MANY_CHALLENGES", "This job has published enough challenge records", 429);
  const api = await dnsApiFor(db, wildcard.orgId, wildcard.dnsProvider);
  let recordId: string | null;
  try {
    recordId = await api.addTxt(wildcard.zoneId, name, value, current.map((c) => c.value));
  } catch (err) {
    throw dnsFailure(err, `Could not publish the TXT record ${name}`);
  }
  await db.insert(dnsChallenges).values({ wildcardId: wildcard.id, jobId, recordName: name, value, providerRecordId: recordId });
  return { waitSec: settings.propagationSec };
}

/** certbot's cleanup hook (and the job's end): remove what was published. */
export async function cleanupChallenge(db: Database, wildcard: Wildcard, jobId: string, value: string | null) {
  const current = await live(db, wildcard);
  const mine = current.filter((c) => c.jobId === jobId && (value === null || c.value === value));
  if (!mine.length) return 0;
  const api = await dnsApiFor(db, wildcard.orgId, wildcard.dnsProvider);
  let remaining = current.map((c) => c.value);
  for (const c of mine) {
    remaining = remaining.filter((v) => v !== c.value);
    try {
      await api.removeTxt(wildcard.zoneId, c.recordName, c.value, c.providerRecordId, remaining);
    } catch (err) {
      throw dnsFailure(err, `Could not remove the TXT record ${c.recordName}`);
    }
    await db.update(dnsChallenges).set({ removedAt: new Date() }).where(eq(dnsChallenges.id, c.id));
  }
  return mine.length;
}

/** When a job ends, anything its cleanup hook did not remove (certbot killed, hook failed). */
export async function cleanupJobChallenges(db: Database, jobId: string) {
  const rows = await db
    .selectDistinct({ wildcardId: dnsChallenges.wildcardId })
    .from(dnsChallenges)
    .where(and(eq(dnsChallenges.jobId, jobId), isNull(dnsChallenges.removedAt)));
  for (const { wildcardId } of rows) {
    const wildcard = await db.query.wildcardCertificates.findFirst({ where: eq(wildcardCertificates.id, wildcardId) });
    if (!wildcard) continue;
    try {
      await cleanupChallenge(db, wildcard, jobId, null);
    } catch (err) {
      logger.warn({ err: (err as Error).message, wildcardId, jobId }, "Could not remove leftover challenge records");
    }
  }
}

/** Wildcards a running job may answer challenges for: its own (issue), or any on its server (renew). */
export async function challengeWildcard(db: Database, job: { type: string; serverId: string; meta: Record<string, unknown> }, domain: string) {
  if (job.type === "wildcard_issue") {
    const w = await db.query.wildcardCertificates.findFirst({ where: eq(wildcardCertificates.id, String(job.meta.wildcardId ?? "")) });
    return w && w.serverId === job.serverId && w.baseDomain === domain ? w : null;
  }
  if (job.type === "cert_renew") {
    const w = await db.query.wildcardCertificates.findFirst({
      where: and(eq(wildcardCertificates.serverId, job.serverId), eq(wildcardCertificates.baseDomain, domain), ne(wildcardCertificates.status, "issuing")),
    });
    return w ?? null;
  }
  return null;
}
