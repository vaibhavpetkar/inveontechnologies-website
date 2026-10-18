import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { environments, providerConnections, serverBootstrapTokens, servers } from "../../db/schema.js";
import { encryptValue } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { AppError, ConflictError } from "../../lib/errors.js";
import { requireRole } from "../auth/middleware.js";
import { serverInUse } from "../replicas/pool.js";
import { issueBootstrapToken, loadServer, publicServer } from "../servers/routes.js";
import { AWS_BOOTSTRAP_TTL_MS, buildUserData } from "../aws/service.js";
import { CLOUD_IMAGES, INSTANCE_TAG_KEYS, type TokenCloud } from "./provider.js";
import {
  CLOUD_LABELS,
  TOKEN_CLOUDS,
  apiTokenSchema,
  cloudApiFor,
  instanceName,
  pollCloudServers,
  providerFailure,
  providerErrorMessage,
  providerTokenAad,
  resizeOptions,
  serverCloud,
  tokenCloudApi,
  tokenHint,
} from "./service.js";

type Connection = typeof providerConnections.$inferSelect;
type Server = typeof servers.$inferSelect;

/** Never the token: only its last four characters and what it belongs to. */
export function publicProviderConnection(c: Connection | undefined, provider: string) {
  return { provider, connected: !!c, tokenHint: c?.tokenHint ?? null, accountLabel: c?.accountLabel ?? null, verifiedAt: c?.verifiedAt ?? null, updatedAt: c?.updatedAt ?? null };
}

const cloudParam = z.enum(TOKEN_CLOUDS);
const isTokenCloud = (p: string): p is TokenCloud => (TOKEN_CLOUDS as readonly string[]).includes(p);

const createSchema = z
  .object({
    provider: cloudParam,
    name: z.string().trim().min(1).max(80),
    region: z.string().regex(/^[a-z0-9-]{2,20}$/, "Pick one of the listed regions"),
    size: z.string().regex(/^[a-z0-9-]{2,40}$/, "Pick one of the listed sizes"),
    image: z.string().regex(/^[a-z0-9.-]{2,40}$/, "Pick one of the listed images"),
  })
  .strict()
  .refine((b) => CLOUD_IMAGES[b.provider].includes(b.image), { message: "Pick Ubuntu or Debian from the list", path: ["image"] });

/** Servers whose instance may still run (they need the connection). */
const LIVE = notInArray(servers.provisionState, ["terminated", "failed"]);

export function cloudRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });
  const view = (s: Server) => publicServer(s, env.INVEON_HEARTBEAT_TIMEOUT_SEC);

  // ---------------------------------------------------------------- connections (admins)

  router.get("/clouds", requireRole("admin"), async (req, res) => {
    const rows = await db.select().from(providerConnections).where(and(eq(providerConnections.orgId, req.member!.orgId), inArray(providerConnections.provider, [...TOKEN_CLOUDS])));
    res.json({
      connections: TOKEN_CLOUDS.map((p) => ({ ...publicProviderConnection(rows.find((r) => r.provider === p), p), label: CLOUD_LABELS[p], images: CLOUD_IMAGES[p] })),
    });
  });

  // Saved only once the provider accepts the token.
  router.put("/clouds/:provider", requireRole("admin"), async (req, res) => {
    const provider = cloudParam.parse(req.params.provider);
    const { token } = z.object({ token: apiTokenSchema }).strict().parse(req.body);
    const orgId = req.member!.orgId;
    let account: string;
    try {
      account = (await cloudApiFor(provider, token).verify()).account;
    } catch (err) {
      throw new AppError("PROVIDER_VERIFY_FAILED", `${CLOUD_LABELS[provider]} refused this token: ${providerErrorMessage(err)}`, 400);
    }
    const values = { tokenEnc: encryptValue(token, providerTokenAad(orgId, provider)), tokenHint: tokenHint(token), accountLabel: account.slice(0, 200), verifiedAt: new Date(), updatedAt: new Date() };
    const [saved] = await db
      .insert(providerConnections)
      .values({ orgId, provider, createdBy: req.user!.sub, ...values })
      .onConflictDoUpdate({ target: [providerConnections.orgId, providerConnections.provider], set: values })
      .returning();
    await audit(db, req, "cloud.connect", "provider_connection", saved.id, { provider, account: saved.accountLabel });
    res.json({ connection: publicProviderConnection(saved, provider) });
  });

  router.delete("/clouds/:provider", requireRole("admin"), async (req, res) => {
    const provider = cloudParam.parse(req.params.provider);
    const orgId = req.member!.orgId;
    const live = await db.query.servers.findFirst({ where: and(eq(servers.orgId, orgId), eq(servers.provider, provider), LIVE) });
    if (live) throw new ConflictError(`Terminate ${live.name} first: it needs this connection`);
    await db.delete(providerConnections).where(and(eq(providerConnections.orgId, orgId), eq(providerConnections.provider, provider)));
    await audit(db, req, "cloud.disconnect", "provider_connection", null, { provider });
    res.json({ ok: true });
  });

  // Regions, sizes and images for the create form, straight from the provider.
  router.get("/clouds/:provider/options", requireRole("admin"), async (req, res) => {
    const provider = cloudParam.parse(req.params.provider);
    const api = await tokenCloudApi(db, req.member!.orgId, provider);
    try {
      const [regions, sizes, images] = await Promise.all([api.regions(), api.sizes(), api.images()]);
      res.json({ regions, sizes, images });
    } catch (err) {
      throw providerFailure(err, "Could not list regions, sizes and images");
    }
  });

  // ---------------------------------------------------------------- servers

  router.post("/servers/cloud", requireRole("admin"), async (req, res) => {
    const body = createSchema.parse(req.body);
    const orgId = req.member!.orgId;
    const api = await tokenCloudApi(db, orgId, body.provider);
    // The region and size must be ones the provider offers, and the size available in that region.
    try {
      const [regions, sizes] = await Promise.all([api.regions(), api.sizes()]);
      if (!regions.some((r) => r.id === body.region)) throw new AppError("INVALID_REGION", "Pick one of the listed regions", 400);
      const size = sizes.find((s) => s.id === body.size);
      if (!size || (size.regions.length && !size.regions.includes(body.region))) throw new AppError("INVALID_SIZE", "That size isn't available in this region", 400);
    } catch (err) {
      throw providerFailure(err, "Could not check the region and size");
    }

    const [server] = await db
      .insert(servers)
      .values({ orgId, name: body.name, createdBy: req.user!.sub, provider: body.provider, provisionState: "pending", cloudRegion: body.region, cloudSize: body.size, cloudImage: body.image })
      .returning();
    try {
      // Single use; it outlives the boot and the installer, then it's spent.
      const bootstrap = await issueBootstrapToken(db, env, server.id, req.user!.sub, AWS_BOOTSTRAP_TTL_MS);
      const { instanceId } = await api.create({
        name: instanceName(body.name, server.id),
        region: body.region,
        size: body.size,
        image: body.image,
        userData: buildUserData(env.INVEON_PUBLIC_URL, bootstrap.token),
        tags: { [INSTANCE_TAG_KEYS.serverId]: server.id, [INSTANCE_TAG_KEYS.orgId]: orgId, [INSTANCE_TAG_KEYS.managedBy]: "inveon-cloud" },
      });
      const [launched] = await db.update(servers).set({ cloudInstanceId: instanceId, cloudState: "new" }).where(eq(servers.id, server.id)).returning();
      await audit(db, req, "server.launch", "server", server.id, { provider: body.provider, name: body.name, region: body.region, size: body.size, image: body.image, instanceId });
      res.status(201).json({ server: view(launched) });
    } catch (err) {
      // Nothing launched: no server is left behind.
      await db.delete(servers).where(eq(servers.id, server.id));
      throw providerFailure(err, "Could not create the server");
    }
  });

  // DigitalOcean and Hetzner here; EC2 servers go on to the AWS routes.
  const tokenCloudServer = async (req: Request, next: NextFunction) => {
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    if (!isTokenCloud(server.provider)) {
      next();
      return null;
    }
    return server;
  };

  router.post("/servers/:id/refresh", requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    const server = await tokenCloudServer(req, next);
    if (!server) return;
    await pollCloudServers(db, { orgId: req.member!.orgId, serverId: server.id });
    res.json({ server: view(await loadServer(db, req.member!.orgId, server.id)) });
  });

  // Typed confirmation: the server's exact name. Only the instance labelled as this server.
  router.post("/servers/:id/terminate", requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    const server = await tokenCloudServer(req, next);
    if (!server) return;
    const { confirm } = z.object({ confirm: z.string().max(200) }).parse(req.body);
    if (!server.cloudInstanceId) throw new AppError("NOT_PROVIDER_SERVER", "This server has no instance to terminate", 400);
    if (confirm !== server.name) throw new AppError("CONFIRMATION_MISMATCH", "Type the server's name exactly to confirm", 400);
    if (server.provisionState === "terminated") throw new ConflictError("This server is already terminated");
    if (await serverInUse(db, server.id)) throw new ConflictError("Remove the environments on this server first (or take it out of their replicas and proxies)");
    const { api } = await serverCloud(db, server);
    try {
      const [info] = await api.describe([server.cloudInstanceId]);
      if (info && info.tags[INSTANCE_TAG_KEYS.serverId] !== server.id) throw new AppError("INSTANCE_MISMATCH", "That instance isn't labelled as this server's; refusing to terminate it", 409);
      if (info) await api.terminate(server.cloudInstanceId);
    } catch (err) {
      throw providerFailure(err, "Could not terminate the server");
    }
    // The agent token stops working at once.
    const [updated] = await db.update(servers).set({ provisionState: "terminating", tokenHash: null }).where(eq(servers.id, server.id)).returning();
    await db.delete(serverBootstrapTokens).where(eq(serverBootstrapTokens.serverId, server.id));
    await audit(db, req, "server.terminate", "server", server.id, { provider: server.provider, name: server.name, instanceId: server.cloudInstanceId });
    res.json({ server: view(updated) });
  });

  // ---------------------------------------------------------------- stop, start, resize (every cloud)

  router.get("/servers/:id/sizes", requireRole("admin"), async (req, res) => {
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    await serverCloud(db, server);
    try {
      res.json({ current: server.provider === "aws" ? server.awsInstanceType : server.cloudSize, sizes: await resizeOptions(db, server) });
    } catch (err) {
      throw providerFailure(err, "Could not list sizes");
    }
  });

  // Stopping takes every app on the server down, so it needs the typed name too.
  router.post("/servers/:id/stop", requireRole("admin"), async (req, res) => {
    const { confirm } = z.object({ confirm: z.string().max(200) }).strict().parse(req.body);
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    const cloud = await serverCloud(db, server);
    if (confirm !== server.name) throw new AppError("CONFIRMATION_MISMATCH", "Type the server's name exactly to confirm", 400);
    if (server.provisionState !== "agent_online" && server.provisionState !== "running") throw new ConflictError(`The server is ${server.provisionState ?? "not running"}; it can be stopped once it runs`);
    try {
      await cloud.api.stop(cloud.instanceId);
    } catch (err) {
      throw providerFailure(err, "Could not stop the server");
    }
    const [updated] = await db.update(servers).set({ provisionState: "stopping" }).where(eq(servers.id, server.id)).returning();
    await audit(db, req, "server.stop", "server", server.id, { provider: cloud.provider, instanceId: cloud.instanceId });
    res.json({ server: view(updated) });
  });

  router.post("/servers/:id/start", requireRole("admin"), async (req, res) => {
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    const cloud = await serverCloud(db, server);
    if (server.provisionState !== "stopped") throw new ConflictError("Only a stopped server can be started");
    try {
      await cloud.api.start(cloud.instanceId);
    } catch (err) {
      throw providerFailure(err, "Could not start the server");
    }
    const [updated] = await db.update(servers).set({ provisionState: "starting" }).where(eq(servers.id, server.id)).returning();
    await audit(db, req, "server.start", "server", server.id, { provider: cloud.provider, instanceId: cloud.instanceId });
    res.json({ server: view(updated) });
  });

  // Resizing needs the server stopped first; the disk is kept as it is.
  router.post("/servers/:id/resize", requireRole("admin"), async (req, res) => {
    const { size } = z.object({ size: z.string().regex(/^[a-z0-9.-]{2,40}$/, "Pick one of the listed sizes") }).strict().parse(req.body);
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    const cloud = await serverCloud(db, server);
    if (server.provisionState !== "stopped") throw new ConflictError("Stop the server first: it can only be resized while it is stopped");
    if (size === cloud.size) throw new AppError("SAME_SIZE", "The server already has that size", 400);
    let options;
    try {
      options = await resizeOptions(db, server);
    } catch (err) {
      throw providerFailure(err, "Could not list sizes");
    }
    if (!options.some((o) => o.id === size)) throw new AppError("INVALID_SIZE", "Pick one of the listed sizes (same CPU architecture, available in this region)", 400);
    try {
      await cloud.api.resize(cloud.instanceId, size);
    } catch (err) {
      throw providerFailure(err, "Could not resize the server");
    }
    // EC2 changes the type at once; DigitalOcean and Hetzner report it when done.
    const set: Partial<Server> = cloud.provider === "aws" ? { awsInstanceType: size } : { provisionState: "resizing", resizeTarget: size };
    const [updated] = await db.update(servers).set(set).where(eq(servers.id, server.id)).returning();
    await audit(db, req, "server.resize", "server", server.id, { provider: cloud.provider, instanceId: cloud.instanceId, from: cloud.size, to: size });
    res.json({ server: view(updated) });
  });

  return router;
}
