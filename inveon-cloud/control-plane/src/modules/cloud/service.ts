import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import { providerConnections, servers } from "../../db/schema.js";
import { decryptValue } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { apiFor as awsApiFor, awsErrorMessage, INSTANCE_TYPES } from "../aws/service.js";
import { ProviderApiError } from "./http.js";
import { digitalOceanApi } from "./digitalocean.js";
import { hetznerApi } from "./hetzner.js";
import { CHANGING_STATES, ec2State, nextProvisionState } from "./state.js";
import type { CloudApi, CloudInstance, LifecycleApi, TokenCloud } from "./provider.js";

type Server = typeof servers.$inferSelect;
type Connection = typeof providerConnections.$inferSelect;

export const TOKEN_CLOUDS = ["digitalocean", "hetzner"] as const satisfies readonly TokenCloud[];
export const CLOUD_LABELS: Record<TokenCloud | "aws", string> = { aws: "AWS EC2", digitalocean: "DigitalOcean", hetzner: "Hetzner Cloud" };

export const providerTokenAad = (orgId: string, provider: string) => `provider-token:${orgId}:${provider}`;

/** Personal access tokens and project tokens: printable, no spaces, a sane length. */
export const apiTokenSchema = z
  .string()
  .trim()
  .min(20, "Paste the whole API token")
  .max(400)
  .regex(/^[A-Za-z0-9_\-.:]+$/, "An API token has no spaces or quotes");

export const tokenHint = (token: string) => `…${token.slice(-4)}`;

export function cloudApiFor(provider: TokenCloud, token: string): CloudApi {
  return provider === "digitalocean" ? digitalOceanApi(token) : hetznerApi(token);
}

export async function loadProviderConnection(db: Database, orgId: string, provider: Connection["provider"]) {
  const c = await db.query.providerConnections.findFirst({ where: and(eq(providerConnections.orgId, orgId), eq(providerConnections.provider, provider)) });
  if (!c) throw new AppError("PROVIDER_NOT_CONNECTED", `Connect ${provider === "cloudflare" ? "Cloudflare" : CLOUD_LABELS[provider]} first`, 400);
  return c;
}

export const connectionToken = (c: Connection) => decryptValue(c.tokenEnc, providerTokenAad(c.orgId, c.provider));

export async function tokenCloudApi(db: Database, orgId: string, provider: TokenCloud) {
  return cloudApiFor(provider, connectionToken(await loadProviderConnection(db, orgId, provider)));
}

/** Provider errors as one short line for admins. */
export function providerErrorMessage(err: unknown) {
  if (err instanceof ProviderApiError) return err.message;
  return awsErrorMessage(err);
}

export const providerFailure = (err: unknown, what: string) => (err instanceof AppError ? err : new AppError("PROVIDER_ERROR", `${what}: ${providerErrorMessage(err)}`, 502));

/** Host names for droplets and Hetzner servers: lowercase letters, digits and dashes. */
export const instanceName = (name: string, id: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "server"}-${id.slice(0, 8)}`;

// ---------------------------------------------------------------- lifecycle across clouds

/** EC2 through the same lifecycle interface as the token clouds. */
function ec2Lifecycle(api: Awaited<ReturnType<typeof awsApiFor>>): LifecycleApi {
  return {
    async describe(ids) {
      return (await api.describeInstances(ids)).map(
        (i): CloudInstance => ({ instanceId: i.instanceId, state: ec2State(i.state), raw: i.state, publicIp: i.publicIp, privateIp: i.privateIp, size: i.instanceType ?? null, tags: i.tags }),
      );
    },
    stop: (id) => api.stopInstance(id),
    start: (id) => api.startInstance(id),
    resize: (id, size) => api.modifyInstanceType(id, size),
    terminate: (id) => api.terminateInstance(id),
  };
}

export interface ServerCloud {
  provider: "aws" | TokenCloud;
  instanceId: string;
  region: string;
  size: string | null;
  api: LifecycleApi;
}

/** The cloud behind a server Inveon Cloud launched, or an error for servers added by hand. */
export async function serverCloud(db: Database, s: Server): Promise<ServerCloud> {
  if (s.provider === "aws" && s.awsInstanceId && s.awsRegion) {
    return { provider: "aws", instanceId: s.awsInstanceId, region: s.awsRegion, size: s.awsInstanceType, api: ec2Lifecycle(await awsApiFor(db, s.orgId, s.awsRegion)) };
  }
  if ((s.provider === "digitalocean" || s.provider === "hetzner") && s.cloudInstanceId) {
    return { provider: s.provider, instanceId: s.cloudInstanceId, region: s.cloudRegion ?? "", size: s.cloudSize, api: await tokenCloudApi(db, s.orgId, s.provider) };
  }
  throw new AppError("NOT_PROVIDER_SERVER", "Only servers launched from Inveon Cloud (AWS, DigitalOcean or Hetzner) can be managed here", 400);
}

/** Sizes a server can be resized to: same CPU architecture, available where it runs. */
export async function resizeOptions(db: Database, s: Server) {
  if (s.provider === "aws") {
    const arch = INSTANCE_TYPES[s.awsInstanceType ?? ""]?.arch;
    return Object.entries(INSTANCE_TYPES)
      .filter(([, t]) => !arch || t.arch === arch)
      .map(([id, t]) => ({ id, vcpu: t.vcpu, memoryGb: t.memoryGb, diskGb: null as number | null, priceMonthly: null as number | null, arch: t.arch }));
  }
  if (s.provider !== "digitalocean" && s.provider !== "hetzner") return [];
  const sizes = await (await tokenCloudApi(db, s.orgId, s.provider)).sizes();
  const current = sizes.find((z) => z.id === s.cloudSize);
  return sizes
    .filter((z) => (!z.regions.length || z.regions.includes(s.cloudRegion ?? "")) && (!current || z.arch === current.arch))
    .map(({ regions: _r, ...z }) => z);
}

/**
 * Applies what a token cloud reports to one server row (the EC2 version is
 * in aws/service.ts, which also cleans up security groups).
 */
async function applyCloudState(db: Database, s: Server, info: CloudInstance | null) {
  const set: Partial<Server> = {};
  if (!info) {
    // Listed again in a moment right after a launch; gone for good once terminating.
    if (s.provisionState === "terminating") Object.assign(set, { provisionState: "terminated", cloudState: "deleted", terminatedAt: new Date() });
  } else {
    set.cloudState = info.raw;
    if (info.publicIp && info.publicIp !== s.ipAddress) set.ipAddress = info.publicIp;
    if (info.privateIp && info.privateIp !== s.privateIpAddress) set.privateIpAddress = info.privateIp;
    if (info.size && info.size !== s.cloudSize) set.cloudSize = info.size;
    if (s.provisionState === "resizing" && info.size && info.size === s.resizeTarget) {
      // The new size is in place; the server stays off until Start.
      Object.assign(set, { provisionState: info.state === "running" ? (s.registeredAt ? "agent_online" : "running") : "stopped", resizeTarget: null });
    } else {
      const next = nextProvisionState(s, info.state);
      if (next && next !== s.provisionState) set.provisionState = next;
      if (next === "terminated") set.terminatedAt = s.terminatedAt ?? new Date();
    }
  }
  for (const k of Object.keys(set) as (keyof Server)[]) if (set[k] === s[k]) delete set[k];
  if (!Object.keys(set).length) return s;
  const [updated] = await db.update(servers).set(set).where(eq(servers.id, s.id)).returning();
  return updated;
}

/** Refreshes DigitalOcean and Hetzner servers that are still changing (scheduler, and Refresh). */
export async function pollCloudServers(db: Database, only?: { orgId: string; serverId: string }) {
  // Refresh asks about one server whatever its state; the scheduler only about changing ones.
  const where = only
    ? [inArray(servers.provider, [...TOKEN_CLOUDS]), eq(servers.orgId, only.orgId), eq(servers.id, only.serverId)]
    : [inArray(servers.provider, [...TOKEN_CLOUDS]), inArray(servers.provisionState, CHANGING_STATES)];
  const rows = await db.select().from(servers).where(and(...where));
  const groups = new Map<string, Server[]>();
  for (const s of rows) {
    if (!s.cloudInstanceId) continue;
    const key = `${s.orgId}|${s.provider}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const updated: Server[] = [];
  for (const [key, list] of groups) {
    const [orgId, provider] = key.split("|") as [string, TokenCloud];
    try {
      const api = await tokenCloudApi(db, orgId, provider);
      const infos = await api.describe(list.map((s) => s.cloudInstanceId!));
      for (const s of list) updated.push(await applyCloudState(db, s, infos.find((i) => i.instanceId === s.cloudInstanceId) ?? null));
    } catch (err) {
      logger.warn({ err: providerErrorMessage(err), orgId, provider }, "Could not refresh cloud servers");
      if (only) throw providerFailure(err, "Could not refresh the server");
    }
  }
  return updated;
}
