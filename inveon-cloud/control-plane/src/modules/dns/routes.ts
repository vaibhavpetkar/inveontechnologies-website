import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { awsConnections, domains, jobs, providerConnections, servers, wildcardCertificates } from "../../db/schema.js";
import { encryptValue } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { requireRole } from "../auth/middleware.js";
import { loadServer } from "../servers/routes.js";
import { HOSTNAME_RE } from "../domains/routes.js";
import { createJob, notifyServer, registerJobEffect } from "../jobs/service.js";
import { apiTokenSchema, providerErrorMessage, providerTokenAad, tokenHint } from "../cloud/service.js";
import { providerRequest } from "../cloud/http.js";
import { publicProviderConnection } from "../cloud/routes.js";
import { DNS_PROVIDERS, DNS_PROVIDER_LABELS, cleanupJobChallenges, dnsApiFor, dnsFailure, findZoneFor, wildcardCertName, type DnsProvider } from "./service.js";

type Wildcard = typeof wildcardCertificates.$inferSelect;
type Server = typeof servers.$inferSelect;

function publicWildcard(w: Wildcard, server: Pick<Server, "name" | "ipAddress"> | undefined) {
  return {
    ...w,
    certName: wildcardCertName(w.baseDomain),
    serverName: server?.name ?? null,
    // Hostnames under the base reach the server through these records.
    dnsRecords: [
      { type: "A", name: `*.${w.baseDomain}`, value: server?.ipAddress ?? null },
      { type: "A", name: w.baseDomain, value: server?.ipAddress ?? null },
    ],
  };
}

/** Issues (or re-issues) the wildcard on its server: certbot with the DNS-01 hooks. */
export async function startWildcardJob(db: Database, env: Env, w: Wildcard, userId: string | null) {
  const running = await db.query.jobs.findFirst({
    where: and(eq(jobs.type, "wildcard_issue"), eq(jobs.serverId, w.serverId), inArray(jobs.status, ["pending", "running"])),
    columns: { id: true, meta: true },
  });
  if (running && running.meta.wildcardId === w.id) throw new ConflictError("This certificate is already being issued");
  const job = await createJob(db, {
    orgId: w.orgId,
    serverId: w.serverId,
    type: "wildcard_issue",
    title: `Wildcard certificate for *.${w.baseDomain}`,
    createdBy: userId,
    meta: { wildcardId: w.id },
    steps: [
      {
        name: `Issue *.${w.baseDomain} and ${w.baseDomain} (DNS-01 via ${DNS_PROVIDER_LABELS[w.dnsProvider]})`,
        action: "certbot.issue_wildcard",
        params: { baseDomain: w.baseDomain, email: env.INVEON_ACME_EMAIL ?? null },
      },
    ],
  });
  await db.update(wildcardCertificates).set({ status: "issuing", lastError: null }).where(eq(wildcardCertificates.id, w.id));
  notifyServer(w.serverId);
  return job;
}

async function loadWildcard(db: Database, orgId: string, id: string) {
  const w = await db.query.wildcardCertificates.findFirst({ where: and(eq(wildcardCertificates.id, id), eq(wildcardCertificates.orgId, orgId)) });
  if (!w) throw new NotFoundError("Wildcard certificate not found");
  return w;
}

/**
 * DNS connections (Cloudflare with an API token; Route 53 through the AWS
 * connection) and the wildcard certificates issued with them.
 */
export function dnsRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });

  router.get("/dns", requireRole("admin"), async (req, res) => {
    const orgId = req.member!.orgId;
    const cf = await db.query.providerConnections.findFirst({ where: and(eq(providerConnections.orgId, orgId), eq(providerConnections.provider, "cloudflare")) });
    const aws = await db.query.awsConnections.findFirst({ where: eq(awsConnections.orgId, orgId), columns: { authType: true } });
    const rows = await db
      .select({ w: wildcardCertificates, server: { name: servers.name, ipAddress: servers.ipAddress } })
      .from(wildcardCertificates)
      .innerJoin(servers, eq(servers.id, wildcardCertificates.serverId))
      .where(eq(wildcardCertificates.orgId, orgId))
      .orderBy(asc(wildcardCertificates.baseDomain));
    res.json({
      connections: {
        cloudflare: { ...publicProviderConnection(cf, "cloudflare"), label: DNS_PROVIDER_LABELS.cloudflare },
        route53: { provider: "route53", label: DNS_PROVIDER_LABELS.route53, connected: !!aws?.authType },
      },
      wildcards: rows.map((r) => publicWildcard(r.w, r.server)),
    });
  });

  // Saved only once Cloudflare accepts the token. It needs Zone:Read and DNS:Edit.
  router.put("/dns/cloudflare", requireRole("admin"), async (req, res) => {
    const { token } = z.object({ token: apiTokenSchema }).strict().parse(req.body);
    const orgId = req.member!.orgId;
    try {
      await providerRequest("cloudflare", token, "GET", "/user/tokens/verify");
    } catch (err) {
      throw new AppError("PROVIDER_VERIFY_FAILED", `Cloudflare refused this token: ${providerErrorMessage(err)}`, 400);
    }
    const values = { tokenEnc: encryptValue(token, providerTokenAad(orgId, "cloudflare")), tokenHint: tokenHint(token), accountLabel: "Cloudflare API token", verifiedAt: new Date(), updatedAt: new Date() };
    const [saved] = await db
      .insert(providerConnections)
      .values({ orgId, provider: "cloudflare", createdBy: req.user!.sub, ...values })
      .onConflictDoUpdate({ target: [providerConnections.orgId, providerConnections.provider], set: values })
      .returning();
    await audit(db, req, "dns.connect", "provider_connection", saved.id, { provider: "cloudflare" });
    res.json({ connection: publicProviderConnection(saved, "cloudflare") });
  });

  router.delete("/dns/cloudflare", requireRole("admin"), async (req, res) => {
    const orgId = req.member!.orgId;
    const inUse = await db.query.wildcardCertificates.findFirst({ where: and(eq(wildcardCertificates.orgId, orgId), eq(wildcardCertificates.dnsProvider, "cloudflare")) });
    if (inUse) throw new ConflictError(`Remove the wildcard for ${inUse.baseDomain} first: its renewals need this connection`);
    await db.delete(providerConnections).where(and(eq(providerConnections.orgId, orgId), eq(providerConnections.provider, "cloudflare")));
    await audit(db, req, "dns.disconnect", "provider_connection", null, { provider: "cloudflare" });
    res.json({ ok: true });
  });

  router.post("/wildcards", requireRole("admin"), async (req, res) => {
    const body = z
      .object({
        baseDomain: z.string().trim().toLowerCase().max(200).regex(HOSTNAME_RE, "Enter a domain like preview.example.com"),
        dnsProvider: z.enum(DNS_PROVIDERS),
        serverId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    const orgId = req.member!.orgId;
    const server = await loadServer(db, orgId, body.serverId);
    if (await db.query.wildcardCertificates.findFirst({ where: and(eq(wildcardCertificates.serverId, server.id), eq(wildcardCertificates.baseDomain, body.baseDomain)) })) {
      throw new ConflictError(`${server.name} already has a wildcard for ${body.baseDomain}`);
    }
    const api = await dnsApiFor(db, orgId, body.dnsProvider as DnsProvider);
    let zone: { id: string; name: string } | null;
    try {
      zone = await findZoneFor(api, body.baseDomain);
    } catch (err) {
      throw dnsFailure(err, `Could not look up the zone in ${DNS_PROVIDER_LABELS[body.dnsProvider]}`);
    }
    if (!zone) throw new AppError("ZONE_NOT_FOUND", `${DNS_PROVIDER_LABELS[body.dnsProvider]} has no zone for ${body.baseDomain} that this connection can edit`, 400);
    const [w] = await db
      .insert(wildcardCertificates)
      .values({ orgId, baseDomain: body.baseDomain, dnsProvider: body.dnsProvider, zoneId: zone.id, zoneName: zone.name, serverId: server.id, createdBy: req.user!.sub })
      .returning();
    const job = await startWildcardJob(db, env, w, req.user!.sub);
    await audit(db, req, "wildcard.create", "wildcard_certificate", w.id, { baseDomain: w.baseDomain, provider: w.dnsProvider, server: server.name, jobId: job.id });
    res.status(201).json({ wildcard: publicWildcard({ ...w, status: "issuing" }, server), job });
  });

  router.post("/wildcards/:id/issue", requireRole("admin"), async (req, res) => {
    const w = await loadWildcard(db, req.member!.orgId, req.params.id);
    const job = await startWildcardJob(db, env, w, req.user!.sub);
    await audit(db, req, "wildcard.issue", "wildcard_certificate", w.id, { baseDomain: w.baseDomain, jobId: job.id });
    res.json({ job });
  });

  router.delete("/wildcards/:id", requireRole("admin"), async (req, res) => {
    const w = await loadWildcard(db, req.member!.orgId, req.params.id);
    const used = await db.query.domains.findFirst({ where: eq(domains.wildcardId, w.id), columns: { hostname: true } });
    if (used) throw new ConflictError(`${used.hostname} uses this certificate; remove it first`);
    const job = await createJob(db, {
      orgId: w.orgId,
      serverId: w.serverId,
      type: "wildcard_delete",
      title: `Delete the wildcard certificate for *.${w.baseDomain}`,
      createdBy: req.user!.sub,
      steps: [{ name: `Delete ${wildcardCertName(w.baseDomain)}`, action: "certbot.delete", params: { certName: wildcardCertName(w.baseDomain) } }],
    });
    notifyServer(w.serverId);
    await db.delete(wildcardCertificates).where(eq(wildcardCertificates.id, w.id));
    await audit(db, req, "wildcard.delete", "wildcard_certificate", w.id, { baseDomain: w.baseDomain, jobId: job.id });
    res.json({ ok: true, jobId: job.id });
  });

  return router;
}

/** The expiry certbot.issue_wildcard / certbot.renew reported for a wildcard. */
export function wildcardExpiry(result: Record<string, unknown> | null, baseDomain: string): Date | null {
  const list = Array.isArray(result?.wildcards) ? (result!.wildcards as { baseDomain?: unknown; expiresAt?: unknown }[]) : [];
  const hit = list.find((c) => c.baseDomain === baseDomain);
  const at = typeof hit?.expiresAt === "string" ? new Date(hit.expiresAt) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** A new or renewed wildcard: its expiry, and that of the domains served with it. */
export async function recordWildcardExpiry(db: Database, w: Wildcard, expiresAt: Date) {
  await db.update(wildcardCertificates).set({ certExpiresAt: expiresAt }).where(eq(wildcardCertificates.id, w.id));
  await db.update(domains).set({ certExpiresAt: expiresAt }).where(eq(domains.wildcardId, w.id));
}

registerJobEffect("wildcard_issue", async (db, job, steps) => {
  await cleanupJobChallenges(db, job.id);
  const w = await db.query.wildcardCertificates.findFirst({ where: eq(wildcardCertificates.id, String(job.meta.wildcardId ?? "")) });
  if (!w) return;
  if (job.status !== "success") {
    await db.update(wildcardCertificates).set({ status: "failed", lastError: (job.error ?? "Certificate job failed").slice(0, 2000) }).where(eq(wildcardCertificates.id, w.id));
    return;
  }
  const result = steps.find((s) => s.action === "certbot.issue_wildcard")?.result ?? null;
  await db.update(wildcardCertificates).set({ status: "active", lastError: null, certIssuedAt: new Date() }).where(eq(wildcardCertificates.id, w.id));
  await recordWildcardExpiry(db, w, wildcardExpiry(result, w.baseDomain) ?? new Date(Date.now() + 90 * 86400000));
});
