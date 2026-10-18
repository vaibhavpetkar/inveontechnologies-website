import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, deployments, domains, environmentReplicas, environments, releases, servers } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { AppError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { loadEnvironment } from "../apps/routes.js";
import { loadServer } from "../servers/routes.js";
import { createJob, notifyServer, registerJobEffect } from "../jobs/service.js";
import { deploySteps, nextSlot } from "../deploys/service.js";
import {
  ensureListenPorts,
  environmentBusy,
  isPooled,
  listenerAllow,
  listenerStep,
  nextPort,
  proxyIdOf,
  replicaHost,
  replicasOf,
  syncUpstream,
  type ChainLink,
  type ReplicaWithServer,
} from "./pool.js";

type Environment = typeof environments.$inferSelect;
type App = typeof apps.$inferSelect;

const label = (app: App, environment: Environment) => `${app.name} / ${environment.name}`;

function publicReplica(environment: Environment, r: ReplicaWithServer) {
  return {
    serverId: r.serverId,
    serverName: r.server.name,
    ipAddress: r.server.ipAddress,
    privateIpAddress: r.server.privateIpAddress,
    status: r.status,
    error: r.error,
    activeSlot: r.activeSlot,
    currentReleaseId: r.currentReleaseId,
    bluePort: r.bluePort,
    greenPort: r.greenPort,
    listenPort: r.listenPort,
    primary: r.serverId === environment.serverId,
    proxy: r.serverId === proxyIdOf(environment),
    createdAt: r.createdAt,
  };
}

async function notBusy(db: Database, environmentId: string) {
  const busy = await environmentBusy(db, environmentId, { certificates: true });
  if (busy) throw new ConflictError(busy === "domain_issue" ? "A certificate is being issued; try again when it is done" : "A deploy or a server change is already running for this environment");
}

function notPreview(environment: Environment) {
  if (environment.previewPr !== null) throw new AppError("PREVIEW_SINGLE_SERVER", "Preview environments run on one server", 400);
}

/** The proxy must be reachable at a known address before anything is pooled. */
async function proxyServer(db: Database, environment: Environment, proxyId = proxyIdOf(environment)) {
  const proxy = await db.query.servers.findFirst({ where: eq(servers.id, proxyId) });
  if (!proxy) throw new NotFoundError("Proxy server not found");
  listenerAllow(proxy);
  return proxy;
}

/**
 * Replicas: the servers an environment runs on. Adding one deploys the
 * current release there and then adds it to the proxy's pool; removing one
 * takes it out of the pool first and then stops it. The primary (release
 * commands, backups, logs) and the proxy are changed with their own routes.
 */
export function replicasRouter(db: Database) {
  const router = Router({ mergeParams: true });

  router.get("/:envId/replicas", async (req, res) => {
    const { environment } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const list = await replicasOf(db, environment);
    const proxy = await db.query.servers.findFirst({ where: eq(servers.id, proxyIdOf(environment)), columns: { id: true, name: true, ipAddress: true, privateIpAddress: true } });
    const latest = await db.query.deployments.findFirst({ where: eq(deployments.environmentId, environment.id), orderBy: desc(deployments.createdAt), columns: { id: true, status: true, rollout: true } });
    res.json({
      replicas: list.map((r) => publicReplica(environment, r)),
      proxy: proxy ? { ...proxy, dedicated: !list.some((r) => r.serverId === proxy.id) } : null,
      pooled: isPooled(environment, list),
      rollout: latest?.rollout ? { deploymentId: latest.id, status: latest.status, ...latest.rollout } : null,
    });
  });

  router.post("/:envId/replicas", requireRole("admin"), async (req, res) => {
    const body = z.object({ serverId: z.string().uuid() }).parse(req.body);
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    notPreview(environment);
    const server = await loadServer(db, req.member!.orgId, body.serverId);
    if (await db.query.environmentReplicas.findFirst({ where: and(eq(environmentReplicas.environmentId, environment.id), eq(environmentReplicas.serverId, server.id)) })) {
      throw new ConflictError(`${server.name} already runs this environment`);
    }
    await notBusy(db, environment.id);
    await proxyServer(db, environment);
    // The proxy has to reach the new server.
    replicaHost({ serverId: server.id, server } as ReplicaWithServer, proxyIdOf(environment));

    const release = environment.currentReleaseId ? await db.query.releases.findFirst({ where: eq(releases.id, environment.currentReleaseId) }) : null;
    const replica = await db.transaction(async (tx) => {
      const bluePort = await nextPort(tx, server.id);
      const [row] = await tx
        .insert(environmentReplicas)
        .values({ environmentId: environment.id, serverId: server.id, bluePort, greenPort: bluePort + 1, listenPort: bluePort + 2, status: release ? "adding" : "active" })
        .returning();
      await ensureListenPorts(tx, environment.id);
      return row;
    });
    let jobId: string | null = null;
    if (release) {
      // Deploy what is live everywhere else; it joins the pool once healthy.
      const slot = nextSlot(environment.strategy, null);
      const proxy = await proxyServer(db, environment);
      const job = await createJob(db, {
        orgId: environment.orgId,
        serverId: server.id,
        environmentId: environment.id,
        type: "replica_add",
        title: `Add ${server.name} to ${label(app, environment)} (${release.commitSha.slice(0, 7)})`,
        createdBy: req.user!.sub,
        meta: { serverId: server.id, releaseId: release.id, slot },
        steps: deploySteps(environment, app, release, slot, null, {
          target: { bluePort: replica.bluePort, greenPort: replica.greenPort, primary: false, stopPrevious: false, listener: listenerStep(environment, replica.listenPort!, listenerAllow(proxy)) },
        }),
      });
      notifyServer(server.id);
      jobId = job.id;
    }
    await audit(db, req, "replica.add", "environment", environment.id, { server: server.name, serverId: server.id, jobId });
    res.status(201).json({ replica: publicReplica(environment, { ...replica, server }), jobId });
  });

  router.delete("/:envId/replicas/:serverId", requireRole("admin"), async (req, res) => {
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const list = await replicasOf(db, environment);
    const replica = list.find((r) => r.serverId === req.params.serverId);
    if (!replica) throw new NotFoundError("Replica not found");
    if (replica.serverId === environment.serverId) throw new AppError("PRIMARY_REPLICA", "Make another server the primary first", 400);
    if (replica.serverId === proxyIdOf(environment)) throw new AppError("PROXY_REPLICA", "Choose another proxy first", 400);
    await notBusy(db, environment.id);
    await db.update(environmentReplicas).set({ status: "removing", error: null }).where(and(eq(environmentReplicas.environmentId, environment.id), eq(environmentReplicas.serverId, replica.serverId)));
    const fresh = (await db.query.environments.findFirst({ where: eq(environments.id, environment.id) }))!;
    const slots = environment.strategy === "recreate" ? (["main"] as const) : (["blue", "green"] as const);
    const teardown: ChainLink = {
      serverId: replica.serverId,
      type: "replica_teardown",
      title: `Remove ${replica.server.name} from ${label(app, environment)}`,
      steps: [
        { name: "Remove replica listener", action: "nginx.remove_listener", params: { slug: environment.slug } },
        ...slots.map((slot) => ({ name: `Stop ${slot === "main" ? "containers" : slot}`, action: "compose.down", params: { slug: environment.slug, slot, composePath: app.composePath } })),
        { name: "Remove nginx upstream", action: "nginx.remove_upstream", params: { slug: environment.slug } },
        { name: "Reload nginx", action: "nginx.reload", params: {} },
      ],
    };
    // Out of the pool first, so the proxy stops sending it requests; then stopped.
    const job = await syncUpstream(db, fresh, label(app, environment), {
      createdBy: req.user!.sub,
      after: [teardown],
      onSuccess: { kind: "delete_replica", environmentId: environment.id, serverId: replica.serverId },
      onFailure: { kind: "replica_failed", environmentId: environment.id, serverId: replica.serverId, message: "Removing the server failed" },
    });
    await audit(db, req, "replica.remove", "environment", environment.id, { server: replica.server.name, serverId: replica.serverId, jobId: job?.id ?? null });
    res.status(202).json({ ok: true, jobId: job?.id ?? null });
  });

  // Re-applies the listeners and the pool (after fixing an IP, or a failed update).
  router.post("/:envId/replicas/sync", requireRole("admin"), async (req, res) => {
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    await notBusy(db, environment.id);
    const job = await syncUpstream(db, environment, label(app, environment), { createdBy: req.user!.sub });
    await audit(db, req, "replica.sync", "environment", environment.id, { jobId: job?.id ?? null });
    res.status(202).json({ jobId: job?.id ?? null });
  });

  // The primary runs release commands, backups and logs, and is updated first.
  router.post("/:envId/replicas/:serverId/primary", requireRole("admin"), async (req, res) => {
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    const list = await replicasOf(db, environment);
    const replica = list.find((r) => r.serverId === req.params.serverId);
    if (!replica) throw new NotFoundError("Replica not found");
    if (replica.serverId === environment.serverId) {
      res.json({ environment });
      return;
    }
    if (replica.status !== "active") throw new AppError("REPLICA_NOT_ACTIVE", "Only an active replica can become the primary", 400);
    if (environment.currentReleaseId && !replica.activeSlot) throw new AppError("REPLICA_NOT_DEPLOYED", "Deploy to this server first", 400);
    await notBusy(db, environment.id);
    const [updated] = await db
      .update(environments)
      .set({
        serverId: replica.serverId,
        bluePort: replica.bluePort,
        greenPort: replica.greenPort,
        activeSlot: replica.activeSlot,
        // The domains stay where they are served: the old primary keeps being the proxy.
        proxyServerId: proxyIdOf(environment) === replica.serverId ? null : proxyIdOf(environment),
      })
      .where(eq(environments.id, environment.id))
      .returning();
    await audit(db, req, "replica.make_primary", "environment", environment.id, { app: app.name, from: environment.serverId, to: replica.serverId });
    res.json({ environment: updated });
  });

  // The server whose nginx serves the domains: one of the replicas, or a dedicated server.
  router.put("/:envId/proxy", requireRole("admin"), async (req, res) => {
    const body = z.object({ serverId: z.string().uuid() }).parse(req.body);
    const { environment, app } = await loadEnvironment(db, req.member!.orgId, req.params.envId);
    notPreview(environment);
    const server = await loadServer(db, req.member!.orgId, body.serverId);
    const oldProxyId = proxyIdOf(environment);
    if (server.id === oldProxyId) {
      res.json({ environment, jobId: null });
      return;
    }
    const [{ n }] = await db.select({ n: count() }).from(domains).where(eq(domains.environmentId, environment.id));
    if (n > 0) throw new ConflictError("Remove the environment's domains before moving them to another proxy (their certificates live on the proxy)");
    await notBusy(db, environment.id);
    await proxyServer(db, environment, server.id);
    const list = await replicasOf(db, environment);
    const wasPooled = isPooled(environment, list);
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(environments)
        .set({ proxyServerId: server.id === environment.serverId ? null : server.id })
        .where(eq(environments.id, environment.id))
        .returning();
      if (isPooled(row, list)) await ensureListenPorts(tx, environment.id);
      return row;
    });
    // Every deployed replica must be reachable from the new proxy.
    for (const r of await replicasOf(db, updated)) if (r.activeSlot && r.status === "active") replicaHost(r, proxyIdOf(updated));
    // The old proxy stops serving the pool (it has no sites: there are no domains).
    const before: ChainLink[] = wasPooled
      ? [
          {
            serverId: oldProxyId,
            type: "upstream_sync",
            title: `Remove the pool of ${label(app, environment)} from the old proxy`,
            steps: [
              { name: "Remove pool upstream", action: "nginx.remove_pool", params: { slug: environment.slug } },
              { name: "Reload nginx", action: "nginx.reload", params: {} },
            ],
          },
        ]
      : [];
    const job = await syncUpstream(db, updated, label(app, environment), { createdBy: req.user!.sub, before });
    await audit(db, req, "replica.set_proxy", "environment", environment.id, { from: oldProxyId, to: server.id, jobId: job?.id ?? null });
    res.json({ environment: updated, jobId: job?.id ?? null });
  });

  return router;
}

// A new replica is healthy on the current release: mark it active and add it to the pool.
registerJobEffect("replica_add", async (db, job) => {
  if (!job.environmentId) return;
  const serverId = String(job.meta.serverId ?? "");
  const where = and(eq(environmentReplicas.environmentId, job.environmentId), eq(environmentReplicas.serverId, serverId));
  if (job.status !== "success") {
    await db.update(environmentReplicas).set({ status: "failed", error: (job.error ?? "Deploy to the new server failed").slice(0, 2000) }).where(where);
    return;
  }
  await db
    .update(environmentReplicas)
    .set({ status: "active", error: null, activeSlot: String(job.meta.slot) as "blue" | "main", currentReleaseId: String(job.meta.releaseId) })
    .where(where);
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, job.environmentId) });
  const app = environment ? await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) }) : undefined;
  if (!environment || !app) return;
  try {
    await syncUpstream(db, environment, label(app, environment), {
      createdBy: job.createdBy,
      onFailure: { kind: "replica_failed", environmentId: environment.id, serverId, message: "Adding the server to the pool failed" },
    });
  } catch {
    // Recorded on the replica by syncUpstream.
  }
});
