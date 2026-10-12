import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { environments, serverBootstrapTokens, servers } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { randomToken, sha256Hex } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";

export const BOOTSTRAP_TTL_MS = 15 * 60 * 1000;

type Server = typeof servers.$inferSelect;

/** Never expose the token hash. Status is derived from the last heartbeat. */
export function publicServer(s: Server, heartbeatTimeoutSec: number) {
  const { tokenHash: _t, ...rest } = s;
  let status = s.status;
  if (s.registeredAt) status = s.lastSeenAt && Date.now() - s.lastSeenAt.getTime() < heartbeatTimeoutSec * 1000 ? "online" : "offline";
  return { ...rest, status };
}

export async function loadServer(db: Database, orgId: string, id: string) {
  const s = await db.query.servers.findFirst({ where: and(eq(servers.id, id), eq(servers.orgId, orgId)) });
  if (!s) throw new NotFoundError("Server not found");
  return s;
}

async function issueBootstrapToken(db: Database, env: Env, serverId: string, userId: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + BOOTSTRAP_TTL_MS);
  // A new token replaces any unused one for this server.
  await db.delete(serverBootstrapTokens).where(eq(serverBootstrapTokens.serverId, serverId));
  await db.insert(serverBootstrapTokens).values({ serverId, tokenHash: sha256Hex(token), expiresAt, createdBy: userId });
  const base = env.INVEON_PUBLIC_URL.replace(/\/$/, "");
  return { token, expiresAt, installCommand: `curl -fsSL ${base}/install.sh | sudo bash -s -- ${token}` };
}

export function serversRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });
  const view = (s: Server) => publicServer(s, env.INVEON_HEARTBEAT_TIMEOUT_SEC);

  router.get("/", async (req, res) => {
    const rows = await db.select().from(servers).where(eq(servers.orgId, req.member!.orgId)).orderBy(desc(servers.createdAt));
    res.json({ servers: rows.map(view) });
  });

  router.post("/", requireRole("admin"), async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const [server] = await db.insert(servers).values({ orgId: req.member!.orgId, name, createdBy: req.user!.sub }).returning();
    const bootstrap = await issueBootstrapToken(db, env, server.id, req.user!.sub);
    await audit(db, req, "server.create", "server", server.id, { name });
    // The token is shown once; only its hash is stored.
    res.status(201).json({ server: view(server), installCommand: bootstrap.installCommand, expiresAt: bootstrap.expiresAt });
  });

  router.get("/:id", async (req, res) => {
    res.json({ server: view(await loadServer(db, req.member!.orgId, req.params.id)) });
  });

  router.post("/:id/bootstrap-token", requireRole("admin"), async (req, res) => {
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    const bootstrap = await issueBootstrapToken(db, env, server.id, req.user!.sub);
    await audit(db, req, "server.bootstrap_token", "server", server.id);
    res.status(201).json({ installCommand: bootstrap.installCommand, expiresAt: bootstrap.expiresAt });
  });

  router.patch("/:id", requireRole("admin"), async (req, res) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(80).optional(), ipAddress: z.string().ip().optional() })
      .parse(req.body);
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    const [updated] = await db.update(servers).set(body).where(eq(servers.id, server.id)).returning();
    await audit(db, req, "server.update", "server", server.id, body);
    res.json({ server: view(updated) });
  });

  router.delete("/:id", requireRole("admin"), async (req, res) => {
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    const inUse = await db.query.environments.findFirst({ where: eq(environments.serverId, server.id) });
    if (inUse) throw new ConflictError("Remove the environments on this server first");
    await db.delete(servers).where(eq(servers.id, server.id));
    await audit(db, req, "server.delete", "server", server.id, { name: server.name });
    res.json({ ok: true });
  });

  return router;
}
