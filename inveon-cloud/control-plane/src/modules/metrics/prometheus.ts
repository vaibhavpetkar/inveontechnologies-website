import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { metricIncidents, scrapeTokens, servers } from "../../db/schema.js";
import { randomToken, sha256Hex } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { requireRole } from "../auth/middleware.js";
import { latestSamples, type LatestSample } from "./service.js";

/**
 * Read-only Prometheus export: GET /metrics with a per-organization scrape
 * token (`Authorization: Bearer ics_…`) returns the latest values of every
 * server in that organization, in the text exposition format (0.0.4). Tokens
 * are random, shown once, stored as SHA-256 hashes and revoked from the
 * dashboard. Nothing here can change anything.
 */

export const SCRAPE_TOKEN_PREFIX = "ics_";
const MAX_TOKENS_PER_ORG = 20;

type Server = typeof servers.$inferSelect;
type Incident = typeof metricIncidents.$inferSelect;

// ---------------------------------------------------------------- text format

/** Label values escape backslash, double quote and newline. */
export const escapeLabel = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const formatValue = (v: number) => (Number.isNaN(v) ? "NaN" : v === Infinity ? "+Inf" : v === -Infinity ? "-Inf" : String(v));

interface Family {
  help: string;
  type: "gauge";
  samples: { labels: Record<string, string>; value: number }[];
}

/** Builds the exposition text: HELP and TYPE once per family, then its samples. Families with no samples are left out. */
export function renderExposition(families: Record<string, Family>) {
  const lines: string[] = [];
  for (const [name, f] of Object.entries(families)) {
    if (!f.samples.length) continue;
    lines.push(`# HELP ${name} ${f.help.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}`, `# TYPE ${name} ${f.type}`);
    for (const s of f.samples) {
      const labels = Object.entries(s.labels)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
        .join(",");
      lines.push(`${name}${labels ? `{${labels}}` : ""} ${formatValue(s.value)}`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Pure: the organization's servers, their newest sample (if any) and open
 * incidents, as Prometheus families. up comes from the heartbeat, like the
 * dashboard.
 */
export function prometheusText(serverRows: Pick<Server, "id" | "name" | "hostname" | "os" | "agentVersion" | "dockerVersion" | "lastSeenAt" | "cpuCount">[], latest: Map<string, LatestSample>, incidents: Pick<Incident, "serverId" | "metric">[], now: Date, heartbeatTimeoutSec: number) {
  const f = (help: string): Family => ({ help, type: "gauge", samples: [] });
  const fam = {
    inveon_server_up: f("1 if the server's agent checked in within the heartbeat timeout, else 0."),
    inveon_server_info: f("Server details as labels; always 1."),
    inveon_server_last_seen_timestamp_seconds: f("Unix time of the agent's last check-in."),
    inveon_server_cpu_count: f("Number of CPUs."),
    inveon_server_metrics_timestamp_seconds: f("Unix time of the newest metrics sample."),
    inveon_server_cpu_percent: f("CPU used, percent of all CPUs."),
    inveon_server_load1: f("Load average over 1 minute."),
    inveon_server_load5: f("Load average over 5 minutes."),
    inveon_server_load15: f("Load average over 15 minutes."),
    inveon_server_memory_used_bytes: f("Memory in use (total minus available)."),
    inveon_server_memory_total_bytes: f("Total memory."),
    inveon_server_disk_used_bytes: f("Disk space used, by mount (/ or docker for Docker's data root)."),
    inveon_server_disk_total_bytes: f("Disk size, by mount (/ or docker for Docker's data root)."),
    inveon_server_network_receive_bytes_per_second: f("Bytes received per second on the host's physical interfaces."),
    inveon_server_network_transmit_bytes_per_second: f("Bytes sent per second on the host's physical interfaces."),
    inveon_container_cpu_percent: f("Container CPU, percent of one CPU (as docker stats)."),
    inveon_container_memory_bytes: f("Container memory in use."),
    inveon_container_memory_limit_bytes: f("Container memory limit."),
    inveon_server_alert_open: f("1 for each open threshold incident, by metric."),
  };
  const put = (family: Family, labels: Record<string, string>, value: number | null | undefined) => {
    if (value !== null && value !== undefined && Number.isFinite(value)) family.samples.push({ labels, value });
  };
  const secs = (d: Date) => Math.floor(d.getTime() / 1000);
  for (const s of serverRows) {
    const base = { server_id: s.id, server: s.name };
    const up = !!s.lastSeenAt && now.getTime() - s.lastSeenAt.getTime() < heartbeatTimeoutSec * 1000;
    put(fam.inveon_server_up, base, up ? 1 : 0);
    put(fam.inveon_server_info, { ...base, hostname: s.hostname ?? "", os: s.os ?? "", agent_version: s.agentVersion ?? "", docker_version: s.dockerVersion ?? "" }, 1);
    if (s.lastSeenAt) put(fam.inveon_server_last_seen_timestamp_seconds, base, secs(s.lastSeenAt));
    put(fam.inveon_server_cpu_count, base, s.cpuCount);
    const m = latest.get(s.id);
    if (m) {
      put(fam.inveon_server_metrics_timestamp_seconds, base, secs(m.at));
      put(fam.inveon_server_cpu_percent, base, m.cpuPct);
      put(fam.inveon_server_load1, base, m.load1);
      put(fam.inveon_server_load5, base, m.load5);
      put(fam.inveon_server_load15, base, m.load15);
      put(fam.inveon_server_memory_used_bytes, base, m.memUsedBytes);
      put(fam.inveon_server_memory_total_bytes, base, m.memTotalBytes);
      put(fam.inveon_server_disk_used_bytes, { ...base, mount: "/" }, m.diskRootUsedBytes);
      put(fam.inveon_server_disk_total_bytes, { ...base, mount: "/" }, m.diskRootTotalBytes);
      put(fam.inveon_server_disk_used_bytes, { ...base, mount: "docker" }, m.diskDockerUsedBytes);
      put(fam.inveon_server_disk_total_bytes, { ...base, mount: "docker" }, m.diskDockerTotalBytes);
      put(fam.inveon_server_network_receive_bytes_per_second, base, m.netRxBps);
      put(fam.inveon_server_network_transmit_bytes_per_second, base, m.netTxBps);
      for (const c of m.containers) {
        const labels = { ...base, container: c.name, project: c.project ?? "", service: c.service ?? "" };
        put(fam.inveon_container_cpu_percent, labels, c.cpuPct);
        put(fam.inveon_container_memory_bytes, labels, c.memBytes);
        put(fam.inveon_container_memory_limit_bytes, labels, c.memLimitBytes);
      }
    }
    for (const i of incidents.filter((x) => x.serverId === s.id)) put(fam.inveon_server_alert_open, { ...base, metric: i.metric }, 1);
  }
  return renderExposition(fam);
}

// ---------------------------------------------------------------- endpoint

/** GET /metrics. Failed attempts are rate-limited per IP; successful scrapes are not. */
export function scrapeRouter(db: Database, env: Env) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: env.INVEON_AUTH_RATE_LIMIT,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
  });
  router.get("/metrics", limiter, async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ") || !header.slice(7).startsWith(SCRAPE_TOKEN_PREFIX)) throw new UnauthorizedError("Scrape token required");
    const token = await db.query.scrapeTokens.findFirst({ where: and(eq(scrapeTokens.tokenHash, sha256Hex(header.slice(7))), isNull(scrapeTokens.revokedAt)) });
    if (!token) throw new UnauthorizedError("Invalid or revoked scrape token");
    const now = new Date();
    // Recorded at most once a minute, so frequent scrapes don't write on every request.
    await db
      .update(scrapeTokens)
      .set({ lastUsedAt: now })
      .where(and(eq(scrapeTokens.id, token.id), or(isNull(scrapeTokens.lastUsedAt), lt(scrapeTokens.lastUsedAt, new Date(now.getTime() - 60_000)))));
    const rows = (await db.select().from(servers).where(and(eq(servers.orgId, token.orgId), isNotNull(servers.registeredAt)))).filter((s) => s.provisionState !== "terminated");
    const latest = await latestSamples(
      db,
      rows.map((s) => s.id),
      now,
    );
    const incidents = await db.select({ serverId: metricIncidents.serverId, metric: metricIncidents.metric }).from(metricIncidents).where(and(eq(metricIncidents.orgId, token.orgId), isNull(metricIncidents.resolvedAt)));
    res.setHeader("Cache-Control", "no-store");
    res.type("text/plain; version=0.0.4; charset=utf-8").send(prometheusText(rows, latest, incidents, now, env.INVEON_HEARTBEAT_TIMEOUT_SEC));
  });
  return router;
}

// ---------------------------------------------------------------- tokens (dashboard)

type Token = typeof scrapeTokens.$inferSelect;
const publicToken = ({ tokenHash: _h, ...rest }: Token) => rest;

/** Admins create and revoke scrape tokens. The token is returned once. */
export function scrapeTokensRouter(db: Database) {
  const router = Router({ mergeParams: true });
  router.use("/scrape-tokens", requireRole("admin"));

  router.get("/scrape-tokens", async (req, res) => {
    const rows = await db.select().from(scrapeTokens).where(eq(scrapeTokens.orgId, req.member!.orgId)).orderBy(desc(scrapeTokens.createdAt));
    res.json({ tokens: rows.map(publicToken) });
  });

  router.post("/scrape-tokens", async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).strict().parse(req.body);
    const active = await db.select({ id: scrapeTokens.id }).from(scrapeTokens).where(and(eq(scrapeTokens.orgId, req.member!.orgId), isNull(scrapeTokens.revokedAt)));
    if (active.length >= MAX_TOKENS_PER_ORG) throw new ConflictError(`At most ${MAX_TOKENS_PER_ORG} active scrape tokens: revoke an old one first`);
    const token = `${SCRAPE_TOKEN_PREFIX}${randomToken(32)}`;
    const [row] = await db
      .insert(scrapeTokens)
      .values({ orgId: req.member!.orgId, name, tokenHash: sha256Hex(token), tokenPrefix: token.slice(0, SCRAPE_TOKEN_PREFIX.length + 6), createdBy: req.user!.sub })
      .returning();
    await audit(db, req, "scrape_token.create", "scrape_token", row.id, { name, prefix: row.tokenPrefix });
    res.status(201).json({ token: publicToken(row), secret: token });
  });

  router.delete("/scrape-tokens/:id", async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const row = id.success ? await db.query.scrapeTokens.findFirst({ where: and(eq(scrapeTokens.id, id.data), eq(scrapeTokens.orgId, req.member!.orgId)) }) : null;
    if (!row) throw new NotFoundError("Scrape token not found");
    if (!row.revokedAt) await db.update(scrapeTokens).set({ revokedAt: new Date() }).where(eq(scrapeTokens.id, row.id));
    await audit(db, req, "scrape_token.revoke", "scrape_token", row.id, { name: row.name, prefix: row.tokenPrefix });
    res.json({ ok: true });
  });

  return router;
}
