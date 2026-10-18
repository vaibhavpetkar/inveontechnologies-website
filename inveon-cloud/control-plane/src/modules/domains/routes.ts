import { Router } from "express";
import { z } from "zod";
import { promises as dns } from "node:dns";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, domains, environments, jobs, servers } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { loadEnvironment } from "../apps/routes.js";
import { createJob, notifyServer, registerJobEffect } from "../jobs/service.js";
import { dashboardLink, emitAlert } from "../alerts/service.js";
import { environmentBusy, isPooled, proxyIdOf, replicasOf } from "../replicas/pool.js";

export const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

type Domain = typeof domains.$inferSelect;

async function loadDomain(db: Database, orgId: string, id: string) {
  const d = await db.query.domains.findFirst({ where: and(eq(domains.id, id), eq(domains.orgId, orgId)) });
  if (!d) throw new NotFoundError("Domain not found");
  return d;
}

function withDnsRecord(d: Domain, serverIp: string | null) {
  return { ...d, dnsRecord: { type: "A", name: d.hostname, value: serverIp } };
}

/**
 * HTTP site with the ACME webroot, certbot (webroot), then the HTTPS site.
 * On the environment's proxy; with several servers the sites use the pool.
 */
export function issueSteps(hostname: string, slug: string, email: string | null, pool = false) {
  const p = pool ? { pool: true } : {};
  return [
    { name: "Write HTTP site", action: "nginx.write_site", params: { hostname, slug, tls: false, ...p } },
    { name: "Reload nginx", action: "nginx.reload", params: {} },
    { name: "Issue certificate", action: "certbot.issue", params: { hostname, email } },
    { name: "Write HTTPS site", action: "nginx.write_site", params: { hostname, slug, tls: true, ...p } },
    { name: "Reload nginx", action: "nginx.reload", params: {} },
  ];
}

/** The server that serves an environment's domains (its proxy) and whether it uses a pool. */
async function servingServer(db: Database, environment: typeof environments.$inferSelect) {
  const proxy = await db.query.servers.findFirst({ where: eq(servers.id, proxyIdOf(environment)) });
  if (!proxy) throw new NotFoundError("Server not found");
  return { proxy, pooled: isPooled(environment, await replicasOf(db, environment)) };
}

export async function startIssueJob(db: Database, env: Env, d: Domain, userId: string | null) {
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, d.environmentId) });
  if (!environment) throw new NotFoundError("Environment not found");
  if (!environment.activeSlot) throw new AppError("NOT_DEPLOYED", "Deploy the environment before issuing a certificate (nginx needs its upstream)", 400);
  const busy = await db.query.jobs.findFirst({ where: and(eq(jobs.type, "domain_issue"), inArray(jobs.status, ["pending", "running"]), eq(jobs.environmentId, environment.id)) });
  if (busy && busy.meta.domainId === d.id) throw new ConflictError("A certificate job is already running for this domain");
  const change = await environmentBusy(db, environment.id);
  if (change && change !== "deploy" && change !== "rollback") throw new ConflictError("The environment's servers are being changed; issue the certificate when that is done");
  const { proxy, pooled } = await servingServer(db, environment);
  const job = await createJob(db, {
    orgId: d.orgId,
    serverId: proxy.id,
    environmentId: environment.id,
    type: "domain_issue",
    title: `Certificate for ${d.hostname}`,
    createdBy: userId,
    meta: { domainId: d.id },
    steps: issueSteps(d.hostname, environment.slug, env.INVEON_ACME_EMAIL ?? null, pooled),
  });
  await db.update(domains).set({ status: "issuing", lastError: null }).where(eq(domains.id, d.id));
  notifyServer(proxy.id);
  return job;
}

export function domainsRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.post("/environments/:envId/domains", requireRole("admin"), async (req, res) => {
    const { hostname } = z.object({ hostname: z.string().trim().toLowerCase().regex(HOSTNAME_RE, "Enter a hostname like app.example.com") }).parse(req.body);
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const { proxy } = await servingServer(db, environment);
    const [d] = await db.insert(domains).values({ orgId: environment.orgId, environmentId: environment.id, hostname }).returning();
    await audit(db, req, "domain.add", "domain", d.id, { hostname, environmentId: environment.id });
    res.status(201).json({ domain: withDnsRecord(d, proxy.ipAddress) });
  });

  router.get("/environments/:envId/domains", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const { proxy } = await servingServer(db, environment);
    const rows = await db.select().from(domains).where(eq(domains.environmentId, environment.id));
    res.json({ domains: rows.map((d) => withDnsRecord(d, proxy.ipAddress)) });
  });

  // Checks the A record points at the server; if so, starts the certificate job.
  router.post("/domains/:id/verify", requireRole("admin"), async (req, res) => {
    const d = await loadDomain(db, req.member!.orgId, req.params.id);
    const { environment } = await loadEnvironment(db, req.member!.orgId, d.environmentId);
    const { proxy: server } = await servingServer(db, environment);
    if (!server.ipAddress) throw new AppError("NO_SERVER_IP", "Set the server's public IP first", 400);
    let addresses: string[] = [];
    try {
      addresses = await dns.resolve4(d.hostname);
    } catch {
      addresses = [];
    }
    await db.update(domains).set({ dnsCheckedAt: new Date() }).where(eq(domains.id, d.id));
    if (!addresses.includes(server.ipAddress)) {
      const msg = addresses.length ? `A record points to ${addresses.join(", ")}, expected ${server.ipAddress}` : `No A record found yet for ${d.hostname}`;
      await db.update(domains).set({ lastError: msg }).where(eq(domains.id, d.id));
      res.status(200).json({ verified: false, message: msg, addresses });
      return;
    }
    const job = await startIssueJob(db, env, d, req.user!.sub);
    await audit(db, req, "domain.verify", "domain", d.id, { hostname: d.hostname, jobId: job.id });
    res.json({ verified: true, job });
  });

  router.post("/domains/:id/issue", requireRole("admin"), async (req, res) => {
    const d = await loadDomain(db, req.member!.orgId, req.params.id);
    if (!d.dnsCheckedAt) throw new AppError("DNS_NOT_VERIFIED", "Verify DNS first", 400);
    const job = await startIssueJob(db, env, d, req.user!.sub);
    await audit(db, req, "domain.issue", "domain", d.id, { hostname: d.hostname, jobId: job.id });
    res.json({ job });
  });

  router.delete("/domains/:id", requireRole("admin"), async (req, res) => {
    const d = await loadDomain(db, req.member!.orgId, req.params.id);
    await db.delete(domains).where(eq(domains.id, d.id));
    await audit(db, req, "domain.remove", "domain", d.id, { hostname: d.hostname });
    // The nginx site file stays until phase 2 adds a remove-site action.
    res.json({ ok: true });
  });

  return router;
}

function certExpiry(result: Record<string, unknown> | null, hostname: string): Date | null {
  const certs = Array.isArray(result?.certs) ? (result!.certs as { hostname?: unknown; expiresAt?: unknown }[]) : [];
  const hit = certs.find((c) => c.hostname === hostname);
  const at = typeof hit?.expiresAt === "string" ? new Date(hit.expiresAt) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

registerJobEffect("domain_issue", async (db, job, steps) => {
  const domainId = String(job.meta.domainId ?? "");
  const d = await db.query.domains.findFirst({ where: eq(domains.id, domainId) });
  if (!d) return;
  if (job.status === "success") {
    const certStep = steps.find((s) => s.action === "certbot.issue");
    await db
      .update(domains)
      .set({ status: "active", lastError: null, certIssuedAt: new Date(), certExpiresAt: certExpiry(certStep?.result ?? null, d.hostname) ?? new Date(Date.now() + 90 * 86400000) })
      .where(eq(domains.id, d.id));
  } else {
    await db.update(domains).set({ status: "failed", lastError: job.error ?? "Certificate job failed" }).where(eq(domains.id, d.id));
  }
});

// Renewal results only update domains served by the reporting server (the environment's proxy).
registerJobEffect("cert_renew", async (db, job, steps) => {
  if (job.status !== "success") return;
  const result = steps.find((s) => s.action === "certbot.renew")?.result ?? null;
  const rows = await db
    .select({ id: domains.id, hostname: domains.hostname })
    .from(domains)
    .innerJoin(environments, eq(environments.id, domains.environmentId))
    .where(and(sql`coalesce(${environments.proxyServerId}, ${environments.serverId}) = ${job.serverId}`, eq(domains.status, "active")));
  for (const r of rows) {
    const at = certExpiry(result, r.hostname);
    if (at) await db.update(domains).set({ certExpiresAt: at }).where(eq(domains.id, r.id));
  }
});

/** Daily: one renew job per server that serves active domains. */
export async function queueRenewals(db: Database) {
  const rows = await db
    .selectDistinct({ serverId: servers.id, orgId: environments.orgId, hostname: domains.hostname })
    .from(domains)
    .innerJoin(environments, eq(environments.id, domains.environmentId))
    .innerJoin(servers, eq(servers.id, sql`coalesce(${environments.proxyServerId}, ${environments.serverId})`))
    .where(eq(domains.status, "active"));
  const byServer = new Map<string, { orgId: string; hostnames: string[] }>();
  for (const r of rows) {
    const entry = byServer.get(r.serverId) ?? { orgId: r.orgId, hostnames: [] };
    entry.hostnames.push(r.hostname);
    byServer.set(r.serverId, entry);
  }
  for (const [serverId, { orgId, hostnames }] of byServer) {
    await createJob(db, {
      orgId,
      serverId,
      type: "cert_renew",
      title: "Renew certificates",
      steps: [
        { name: "certbot renew", action: "certbot.renew", params: { hostnames } },
        { name: "Reload nginx", action: "nginx.reload", params: {} },
      ],
    });
    notifyServer(serverId);
  }
  return byServer.size;
}

export const CERT_EXPIRY_WARN_DAYS = 14;

/**
 * Daily: one alert per certificate that expires within 14 days (renewals
 * normally happen at 30 days, so this means renewal is failing). Each
 * certificate is reported once per expiry date.
 */
export async function alertExpiringCertificates(db: Database, now = new Date()) {
  const rows = await db
    .select({ domain: domains, environment: environments, appName: apps.name, appId: apps.id })
    .from(domains)
    .innerJoin(environments, eq(environments.id, domains.environmentId))
    .innerJoin(apps, eq(apps.id, environments.appId))
    .where(and(eq(domains.status, "active"), isNotNull(domains.certExpiresAt), lte(domains.certExpiresAt, new Date(now.getTime() + CERT_EXPIRY_WARN_DAYS * 86400_000))));
  let sent = 0;
  for (const { domain, environment, appName, appId } of rows) {
    const expires = domain.certExpiresAt!;
    const claimed = await db.execute(
      sql`INSERT INTO scheduler_runs (name, key, last_run_at) VALUES ('cert_expiry_alert', ${`${domain.id}:${expires.toISOString().slice(0, 10)}`}, ${now}) ON CONFLICT DO NOTHING RETURNING name`,
    );
    if (!claimed.rows.length) continue;
    const days = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 86400_000));
    await emitAlert(db, domain.orgId, "cert.expiring", {
      title: `Certificate for ${domain.hostname} expires ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
      text: `The Let's Encrypt certificate for ${domain.hostname} (${appName} / ${environment.name}) expires on ${expires.toISOString().slice(0, 10)}. Renewal is normally automatic, so check the latest "Renew certificates" job for its server.`,
      severity: days <= 3 ? "critical" : "warning",
      url: dashboardLink(`/apps/${appId}?env=${environment.id}`),
      details: { hostname: domain.hostname, expiresAt: expires.toISOString() },
    });
    sent++;
  }
  return sent;
}
