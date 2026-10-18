import { isIP } from "node:net";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { deployments, domains, environmentReplicas, environments, jobs, servers, wildcardCertificates } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { createJob, notifyServer, registerJobEffect, type StepInput, type Tx } from "../jobs/service.js";

/**
 * One environment on several servers. Every environment has at least one
 * replica (its primary, environments.server_id). With more than one, or
 * with a proxy that is not the primary, the environment is "pooled":
 *
 *  - each replica runs blue/green as before, on its own ports, behind its
 *    own local upstream, and gets a listener port that only the proxy may
 *    reach (nginx.write_listener);
 *  - the proxy's nginx has a pool upstream listing every deployed replica's
 *    listener (private IP when known, else public) with passive health
 *    checks, and the domains' sites proxy to that pool.
 *
 * A single-server environment is never pooled and works exactly as before.
 */

type Environment = typeof environments.$inferSelect;
type Server = typeof servers.$inferSelect;
export type Replica = typeof environmentReplicas.$inferSelect;
export type ReplicaWithServer = Replica & { server: Server };

export const PORT_BASE = 20000;
export const POOL_MAX_FAILS = 3;
export const POOL_FAIL_TIMEOUT_SEC = 10;

/** Jobs that change what runs where; only one of these (or a deploy) at a time per environment. */
export const ENVIRONMENT_BUSY_TYPES = ["deploy", "rollback", "replica_add", "replica_teardown", "upstream_sync", "rollout_revert"];

export const proxyIdOf = (e: Pick<Environment, "proxyServerId" | "serverId">) => e.proxyServerId ?? e.serverId;

/** Every replica of an environment with its server, primary first, then in the order they were added. */
export async function replicasOf(db: Database | Tx, environment: Pick<Environment, "id" | "serverId">): Promise<ReplicaWithServer[]> {
  const rows = await db
    .select({ replica: environmentReplicas, server: servers })
    .from(environmentReplicas)
    .innerJoin(servers, eq(servers.id, environmentReplicas.serverId))
    .where(eq(environmentReplicas.environmentId, environment.id))
    .orderBy(asc(environmentReplicas.createdAt));
  const list = rows.map((r) => ({ ...r.replica, server: r.server }));
  return [...list.filter((r) => r.serverId === environment.serverId), ...list.filter((r) => r.serverId !== environment.serverId)];
}

/** Replicas that take part in deploys and in the pool. */
export const activeReplicas = (list: ReplicaWithServer[]) => list.filter((r) => r.status === "active");

export function isPooled(environment: Pick<Environment, "proxyServerId" | "serverId">, list: Replica[]) {
  return list.filter((r) => r.status === "active").length > 1 || proxyIdOf(environment) !== environment.serverId;
}

export async function isReplicaServer(db: Database, environmentId: string, serverId: string) {
  const row = await db.query.environmentReplicas.findFirst({
    where: and(eq(environmentReplicas.environmentId, environmentId), eq(environmentReplicas.serverId, serverId)),
    columns: { serverId: true },
  });
  return !!row;
}

/**
 * What keeps the environment busy: a deploy or a replica change queued or
 * running (and, with `certificates`, a certificate job, whose nginx site
 * a replica change would rewrite). null when free.
 */
export async function environmentBusy(db: Database | Tx, environmentId: string, opts: { certificates?: boolean } = {}) {
  const types = opts.certificates ? [...ENVIRONMENT_BUSY_TYPES, "domain_issue"] : ENVIRONMENT_BUSY_TYPES;
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.environmentId, environmentId), inArray(jobs.type, types), inArray(jobs.status, ["pending", "running"])),
    columns: { id: true, type: true },
  });
  if (job) return job.type;
  // Between two servers of a rollout no job is pending for an instant.
  const rolling = await db.query.deployments.findFirst({ where: and(eq(deployments.environmentId, environmentId), eq(deployments.status, "running")), columns: { id: true } });
  return rolling ? "deploy" : null;
}

/** Servers an environment uses (as a replica or as its proxy), or that hold a wildcard certificate, cannot be deleted or terminated. */
export async function serverInUse(db: Database, serverId: string) {
  const replica = await db.query.environmentReplicas.findFirst({ where: eq(environmentReplicas.serverId, serverId), columns: { environmentId: true } });
  if (replica) return true;
  if (await db.query.wildcardCertificates.findFirst({ where: eq(wildcardCertificates.serverId, serverId), columns: { id: true } })) return true;
  const env = await db.query.environments.findFirst({ where: or(eq(environments.serverId, serverId), eq(environments.proxyServerId, serverId)), columns: { id: true } });
  return !!env;
}

// ---------------------------------------------------------------- ports

/**
 * The next free host port on a server: above every port an environment or
 * a replica uses there. Call inside a transaction; the advisory lock
 * serialises allocation per server.
 */
export async function nextPort(tx: Tx, serverId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${serverId}))`);
  const result = await tx.execute(sql`
    SELECT greatest(
      (SELECT max(green_port) FROM environments WHERE server_id = ${serverId}),
      (SELECT max(greatest(green_port, coalesce(listen_port, 0))) FROM environment_replicas WHERE server_id = ${serverId})
    ) AS max_port`);
  const max = (result.rows[0] as { max_port: number | null } | undefined)?.max_port ?? null;
  return max ? Number(max) + 1 : PORT_BASE;
}

/** Gives every replica that has none a listener port (an environment becoming pooled). */
export async function ensureListenPorts(tx: Tx, environmentId: string) {
  const rows = await tx.select().from(environmentReplicas).where(eq(environmentReplicas.environmentId, environmentId));
  for (const r of rows.filter((x) => x.listenPort === null).sort((a, b) => a.serverId.localeCompare(b.serverId))) {
    const port = await nextPort(tx, r.serverId);
    await tx.update(environmentReplicas).set({ listenPort: port }).where(and(eq(environmentReplicas.environmentId, environmentId), eq(environmentReplicas.serverId, r.serverId)));
  }
}

// ---------------------------------------------------------------- nginx steps

const validIp = (ip: string | null | undefined) => (ip && isIP(ip) ? ip : null);

/** Who may connect to a replica's listener: the proxy's addresses and the machine itself. */
export function listenerAllow(proxy: Server) {
  const ips = [validIp(proxy.ipAddress), validIp(proxy.privateIpAddress)].filter((x): x is string => !!x);
  if (!ips.length) throw new AppError("PROXY_NO_IP", `Set the IP address of ${proxy.name} (the proxy) first`, 400);
  return [...new Set([...ips, "127.0.0.1", "::1"])];
}

/** How the proxy reaches a replica: locally when it is the proxy, else its private IP when known, else its public IP. */
export function replicaHost(r: ReplicaWithServer, proxyId: string) {
  if (r.serverId === proxyId) return "127.0.0.1";
  const ip = validIp(r.server.privateIpAddress) ?? validIp(r.server.ipAddress);
  if (!ip) throw new AppError("REPLICA_NO_IP", `Set the IP address of ${r.server.name} first`, 400);
  return ip;
}

export const listenerStep = (environment: Pick<Environment, "slug">, port: number, allow: string[]): StepInput => ({
  name: "Write replica listener",
  action: "nginx.write_listener",
  params: { slug: environment.slug, port, allow },
});

/** The pool lists replicas that are active and deployed. */
export function poolMembers(environment: Environment, list: ReplicaWithServer[]) {
  const proxyId = proxyIdOf(environment);
  return activeReplicas(list)
    .filter((r) => r.activeSlot && r.listenPort)
    .map((r) => ({ serverId: r.serverId, host: replicaHost(r, proxyId), port: r.listenPort! }));
}

export const poolStep = (environment: Pick<Environment, "slug">, members: { host: string; port: number }[]): StepInput => ({
  name: `Write pool upstream (${members.length} server${members.length === 1 ? "" : "s"})`,
  action: "nginx.write_pool",
  params: { slug: environment.slug, servers: members.map((m) => ({ host: m.host, port: m.port })), maxFails: POOL_MAX_FAILS, failTimeoutSec: POOL_FAIL_TIMEOUT_SEC },
});

/** Rewrites the environment's sites on the proxy for the pool (or back to the local upstream). */
async function siteSteps(db: Database | Tx, environment: Environment, pool: boolean): Promise<StepInput[]> {
  const rows = await db.select().from(domains).where(eq(domains.environmentId, environment.id)).orderBy(asc(domains.createdAt));
  return rows
    .filter((d) => d.status !== "pending_dns")
    .map((d) => ({
      name: `Point ${d.hostname} at the ${pool ? "pool" : "local upstream"}`,
      action: "nginx.write_site",
      params: { hostname: d.hostname, slug: environment.slug, tls: d.status === "active", pool },
    }));
}

// ---------------------------------------------------------------- job chains

/** One job of a chain: run on a server, the next starts only when it succeeds. */
export interface ChainLink {
  serverId: string;
  type: string;
  title: string;
  steps: StepInput[];
}

export type ChainOutcome =
  | { kind: "delete_replica"; environmentId: string; serverId: string }
  | { kind: "replica_failed"; environmentId: string; serverId: string; message: string }
  | { kind: "none" };

export const CHAIN_TYPES = ["upstream_sync", "replica_teardown", "teardown"];

/** Queues the first link; each link's success queues the next, then `onSuccess` applies. */
export async function queueChain(
  db: Database | Tx,
  environment: { id: string | null; orgId: string },
  links: ChainLink[],
  opts: { createdBy?: string | null; onSuccess?: ChainOutcome; onFailure?: ChainOutcome } = {},
) {
  const [first, ...rest] = links.filter((l) => l.steps.length);
  if (!first) {
    if (opts.onSuccess) await applyOutcome(db, opts.onSuccess);
    return null;
  }
  const job = await createJob(db, {
    orgId: environment.orgId,
    serverId: first.serverId,
    environmentId: environment.id,
    type: first.type,
    title: first.title,
    createdBy: opts.createdBy ?? null,
    meta: { chain: rest, onSuccess: opts.onSuccess ?? { kind: "none" }, onFailure: opts.onFailure ?? { kind: "none" } },
    steps: first.steps,
  });
  return job;
}

async function applyOutcome(db: Database | Tx, outcome: ChainOutcome) {
  if (outcome.kind === "delete_replica") {
    await db.delete(environmentReplicas).where(and(eq(environmentReplicas.environmentId, outcome.environmentId), eq(environmentReplicas.serverId, outcome.serverId)));
  } else if (outcome.kind === "replica_failed") {
    await db
      .update(environmentReplicas)
      .set({ status: "failed", error: outcome.message.slice(0, 2000) })
      .where(and(eq(environmentReplicas.environmentId, outcome.environmentId), eq(environmentReplicas.serverId, outcome.serverId)));
  }
}

async function onChainJob(db: Database, job: typeof jobs.$inferSelect) {
  const chain = Array.isArray(job.meta.chain) ? (job.meta.chain as ChainLink[]) : [];
  const onSuccess = (job.meta.onSuccess as ChainOutcome | undefined) ?? { kind: "none" };
  const onFailure = (job.meta.onFailure as ChainOutcome | undefined) ?? { kind: "none" };
  if (job.status !== "success") {
    if (onFailure.kind === "replica_failed") await applyOutcome(db, { ...onFailure, message: `${onFailure.message}: ${job.error ?? job.status}` });
    else await applyOutcome(db, onFailure);
    return;
  }
  const [next, ...rest] = chain;
  if (!next) return applyOutcome(db, onSuccess);
  await createJob(db, {
    orgId: job.orgId,
    serverId: next.serverId,
    environmentId: job.environmentId,
    type: next.type,
    title: next.title,
    createdBy: job.createdBy,
    meta: { chain: rest, onSuccess, onFailure },
    steps: next.steps,
  });
  notifyServer(next.serverId);
}

for (const type of CHAIN_TYPES) registerJobEffect(type, onChainJob);

/** Wakes the agent of the first link (call after the transaction commits). */
export function notifyChain(job: typeof jobs.$inferSelect | null) {
  if (job) notifyServer(job.serverId);
}

// ---------------------------------------------------------------- upstream sync

/**
 * The jobs that make the servers match the database: in a pooled
 * environment, a listener on every deployed replica, then the pool and
 * the sites on the proxy; otherwise the primary serves its domains from
 * its own upstream again and the pool and listener are removed. Order
 * matters to nginx -t: a pool is written before the sites that use it,
 * and sites leave a pool before it is removed.
 */
export async function upstreamSyncLinks(db: Database | Tx, environment: Environment, label: string): Promise<ChainLink[]> {
  const list = await replicasOf(db, environment);
  const proxyId = proxyIdOf(environment);
  if (!isPooled(environment, list)) {
    return [
      {
        serverId: environment.serverId,
        type: "upstream_sync",
        title: `Serve ${label} from one server`,
        steps: [
          ...(await siteSteps(db, environment, false)),
          { name: "Remove pool upstream", action: "nginx.remove_pool", params: { slug: environment.slug } },
          { name: "Remove replica listener", action: "nginx.remove_listener", params: { slug: environment.slug } },
          { name: "Reload nginx", action: "nginx.reload", params: {} },
        ],
      },
    ];
  }
  const proxy = await db.query.servers.findFirst({ where: eq(servers.id, proxyId) });
  if (!proxy) throw new AppError("PROXY_MISSING", "The proxy server no longer exists", 409);
  const allow = listenerAllow(proxy);
  const members = poolMembers(environment, list);
  const links: ChainLink[] = [];
  for (const r of activeReplicas(list)) {
    if (!r.activeSlot || !r.listenPort || r.serverId === proxyId) continue;
    links.push({
      serverId: r.serverId,
      type: "upstream_sync",
      title: `Replica listener for ${label} on ${r.server.name}`,
      steps: [listenerStep(environment, r.listenPort, allow), { name: "Reload nginx", action: "nginx.reload", params: {} }],
    });
  }
  const steps: StepInput[] = [];
  const self = activeReplicas(list).find((r) => r.serverId === proxyId && r.activeSlot && r.listenPort);
  if (self) steps.push(listenerStep(environment, self.listenPort!, allow));
  if (members.length) steps.push(poolStep(environment, members), ...(await siteSteps(db, environment, true)));
  steps.push({ name: "Reload nginx", action: "nginx.reload", params: {} });
  links.push({ serverId: proxyId, type: "upstream_sync", title: `Pool upstream for ${label} on ${proxy.name}`, steps });
  return links;
}

/** Queues an upstream sync for the environment as it is now in the database. */
export async function syncUpstream(db: Database, environment: Environment, label: string, opts: { createdBy?: string | null; before?: ChainLink[]; after?: ChainLink[]; onSuccess?: ChainOutcome; onFailure?: ChainOutcome } = {}) {
  try {
    const links = [...(opts.before ?? []), ...(await upstreamSyncLinks(db, environment, label)), ...(opts.after ?? [])];
    const job = await queueChain(db, environment, links, opts);
    notifyChain(job);
    return job;
  } catch (err) {
    logger.error({ err, environmentId: environment.id }, "Could not queue the upstream sync");
    if (opts.onFailure) await applyOutcome(db, opts.onFailure.kind === "replica_failed" ? { ...opts.onFailure, message: `${opts.onFailure.message}: ${(err as Error).message}` } : opts.onFailure);
    throw err;
  }
}
