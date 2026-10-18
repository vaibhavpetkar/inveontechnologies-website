import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import { awsConnections, servers } from "../../db/schema.js";
import { decryptValue } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { ec2Api, type Arch, type AwsCredentialsInput, type Ec2Api, type InstanceInfo } from "./provider.js";
import { CHANGING_STATES, ec2State, nextProvisionState } from "../cloud/state.js";

export const awsSecretAad = (orgId: string) => `aws-secret:${orgId}`;

/** Regions servers can be launched in (commercial regions with Ubuntu 24.04 gp3 images). */
export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
] as const;

/** A short allow-list: burstable for small apps, general purpose for bigger ones. */
export const INSTANCE_TYPES: Record<string, { arch: Arch; vcpu: number; memoryGb: number }> = {
  "t3.small": { arch: "x86_64", vcpu: 2, memoryGb: 2 },
  "t3.medium": { arch: "x86_64", vcpu: 2, memoryGb: 4 },
  "t3.large": { arch: "x86_64", vcpu: 2, memoryGb: 8 },
  "t3.xlarge": { arch: "x86_64", vcpu: 4, memoryGb: 16 },
  "m6i.large": { arch: "x86_64", vcpu: 2, memoryGb: 8 },
  "m6i.xlarge": { arch: "x86_64", vcpu: 4, memoryGb: 16 },
  "t4g.small": { arch: "arm64", vcpu: 2, memoryGb: 2 },
  "t4g.medium": { arch: "arm64", vcpu: 2, memoryGb: 4 },
  "t4g.large": { arch: "arm64", vcpu: 2, memoryGb: 8 },
  "m7g.large": { arch: "arm64", vcpu: 2, memoryGb: 8 },
};

export const MIN_DISK_GB = 20;
export const MAX_DISK_GB = 1000;
/** Instances take a few minutes to boot and install; their install token lives longer. */
export const AWS_BOOTSTRAP_TTL_MS = 60 * 60 * 1000;

const ROLE_ARN_RE = /^arn:aws(-cn|-us-gov)?:iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/;
const ACCESS_KEY_RE = /^AKIA[A-Z0-9]{16}$/;
const SECRET_KEY_RE = /^[A-Za-z0-9/+=]{40}$/;

export const regionSchema = z.enum(AWS_REGIONS, { errorMap: () => ({ message: "Pick one of the listed regions" }) });

export const connectionSchema = z.discriminatedUnion("authType", [
  z.object({ authType: z.literal("role"), roleArn: z.string().trim().regex(ROLE_ARN_RE, "An IAM role ARN like arn:aws:iam::123456789012:role/inveon-cloud"), defaultRegion: regionSchema }),
  z.object({
    authType: z.literal("keys"),
    accessKeyId: z.string().trim().regex(ACCESS_KEY_RE, "A long-term access key id (AKIA…)"),
    secretAccessKey: z.string().trim().regex(SECRET_KEY_RE, "The 40-character secret access key"),
    defaultRegion: regionSchema,
  }),
]);

/** An IPv4 CIDR for SSH, no wider than /16. */
const sshCidrSchema = z
  .string()
  .trim()
  .refine((v) => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(v);
    if (!m) return false;
    const octets = m.slice(1, 5).map(Number);
    const prefix = Number(m[5]);
    if (octets.some((o) => o > 255) || prefix < 16 || prefix > 32) return false;
    // The address must be the network address for that prefix.
    const addr = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const mask = prefix === 32 ? 0xffffffff : (~(0xffffffff >>> prefix)) >>> 0;
    return (addr & mask) >>> 0 === addr;
  }, "An IPv4 network like 203.0.113.0/24 (between /16 and /32), for example your office's address with /32");

export const createServerSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    region: regionSchema,
    instanceType: z.string().refine((t) => Object.hasOwn(INSTANCE_TYPES, t), "Pick one of the listed instance types"),
    diskGb: z.number().int().min(MIN_DISK_GB).max(MAX_DISK_GB),
    securityGroupId: z.string().trim().regex(/^sg-[0-9a-f]{8,17}$/, "A security group id like sg-0123456789abcdef0").optional(),
    createSecurityGroup: z.object({ sshCidr: sshCidrSchema.optional() }).strict().optional(),
    subnetId: z.string().trim().regex(/^subnet-[0-9a-f]{8,17}$/, "A subnet id like subnet-0123456789abcdef0").optional(),
    keyName: z.string().trim().regex(/^[A-Za-z0-9._-]{1,128}$/, "A key pair name (letters, digits, . _ -)").optional(),
    instanceProfile: z.string().trim().regex(/^[\w+=,.@-]{1,128}$/, "An instance profile name").optional(),
  })
  .strict()
  .refine((b) => !!b.securityGroupId !== !!b.createSecurityGroup, { message: "Choose an existing security group or create one", path: ["securityGroupId"] });

export type CreateServerInput = z.infer<typeof createServerSchema>;

/**
 * cloud-init user data: runs the normal installer with a single-use token.
 * The token is also readable from the instance metadata, but it is used up
 * when the agent registers a few minutes later.
 */
export function buildUserData(publicUrl: string, token: string) {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw new Error("Bad install token");
  const base = publicUrl.replace(/\/$/, "");
  if (!/^https?:\/\/[A-Za-z0-9.:[\]-]+(\/[A-Za-z0-9._~/-]*)?$/.test(base)) throw new Error("INVEON_PUBLIC_URL can't be used in user data");
  return [
    "#!/bin/bash",
    "# Inveon Cloud: install the agent and register this server.",
    "set -euo pipefail",
    `curl -fsSL --retry 10 --retry-delay 6 --retry-all-errors '${base}/install.sh' | bash -s -- '${token}'`,
    "",
  ].join("\n");
}

type Connection = typeof awsConnections.$inferSelect;

export function credentialsOf(c: Connection): AwsCredentialsInput {
  if (c.authType === "role" && c.roleArn) return { authType: "role", roleArn: c.roleArn, externalId: c.externalId };
  if (c.authType === "keys" && c.accessKeyId && c.secretAccessKeyEnc) {
    return { authType: "keys", accessKeyId: c.accessKeyId, secretAccessKey: decryptValue(c.secretAccessKeyEnc, awsSecretAad(c.orgId)) };
  }
  throw new AppError("AWS_NOT_CONNECTED", "Connect an AWS account first (Servers, AWS account)", 400);
}

export async function loadConnection(db: Database, orgId: string) {
  const c = await db.query.awsConnections.findFirst({ where: eq(awsConnections.orgId, orgId) });
  if (!c?.authType) throw new AppError("AWS_NOT_CONNECTED", "Connect an AWS account first (Servers, AWS account)", 400);
  return c;
}

export async function apiFor(db: Database, orgId: string, region: string): Promise<Ec2Api> {
  return ec2Api(credentialsOf(await loadConnection(db, orgId)), region);
}

/** AWS errors as a short message for admins (no stack, no request ids). */
export function awsErrorMessage(err: unknown) {
  const e = err as { name?: string; message?: string };
  const text = `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${e.message ?? String(err)}`;
  return text.replace(/\s+/g, " ").slice(0, 400);
}

type Server = typeof servers.$inferSelect;

/** Applies what EC2 reports to one server row. Returns the updated row. */
async function applyInstanceState(db: Database, api: Ec2Api, s: Server, info: InstanceInfo | null) {
  const set: Partial<Server> = {};
  if (!info) {
    // Gone from EC2 (terminated long ago). Right after a launch EC2 may not
    // list the instance yet, so a pending server just waits.
    if (s.provisionState === "terminating") Object.assign(set, { provisionState: "terminated", awsState: "terminated", terminatedAt: new Date() });
  } else {
    set.awsState = info.state;
    // A stop and start without an Elastic IP gets a new public address.
    if (info.publicIp && info.publicIp !== s.ipAddress) set.ipAddress = info.publicIp;
    if (info.privateIp && info.privateIp !== s.privateIpAddress) set.privateIpAddress = info.privateIp;
    if (info.instanceType && info.instanceType !== s.awsInstanceType) set.awsInstanceType = info.instanceType;
    const next = nextProvisionState(s, ec2State(info.state));
    if (next && next !== s.provisionState) set.provisionState = next;
    if (next === "terminated") set.terminatedAt = s.terminatedAt ?? new Date();
  }
  if (set.provisionState === "terminated" && s.awsCreatedSecurityGroup && s.awsSecurityGroupId) {
    try {
      await api.deleteSecurityGroup(s.awsSecurityGroupId);
      set.awsCreatedSecurityGroup = false;
    } catch (err) {
      logger.warn({ err, serverId: s.id }, "Could not delete the server's security group yet");
    }
  }
  if (!Object.keys(set).length) return s;
  const [updated] = await db.update(servers).set(set).where(eq(servers.id, s.id)).returning();
  return updated;
}

const ACTIVE_STATES = CHANGING_STATES;

/** Refreshes launched servers that are still changing (scheduler, and the Refresh button). */
export async function pollAwsServers(db: Database, only?: { orgId: string; serverId: string }) {
  // Refresh asks about one server whatever its state; the scheduler only about changing ones.
  const where = only
    ? [eq(servers.provider, "aws"), eq(servers.orgId, only.orgId), eq(servers.id, only.serverId), ne(servers.provisionState, "terminated")]
    : [eq(servers.provider, "aws"), inArray(servers.provisionState, [...ACTIVE_STATES])];
  // A terminated server whose security group couldn't be deleted yet is retried too.
  const rows = [
    ...(await db.select().from(servers).where(and(...where))),
    ...(await db
      .select()
      .from(servers)
      .where(and(eq(servers.provider, "aws"), eq(servers.provisionState, "terminated"), eq(servers.awsCreatedSecurityGroup, true), ...(only ? [eq(servers.id, only.serverId)] : [])))),
  ];
  const groups = new Map<string, Server[]>();
  for (const s of rows) {
    if (!s.awsInstanceId || !s.awsRegion) continue;
    const key = `${s.orgId}|${s.awsRegion}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const updated: Server[] = [];
  for (const [key, list] of groups) {
    const [orgId, region] = key.split("|");
    try {
      const api = await apiFor(db, orgId, region);
      const infos = await api.describeInstances(list.map((s) => s.awsInstanceId!));
      for (const s of list) updated.push(await applyInstanceState(db, api, s, infos.find((i) => i.instanceId === s.awsInstanceId) ?? null));
    } catch (err) {
      logger.warn({ err, orgId, region }, "Could not refresh EC2 servers");
      if (only) throw new AppError("AWS_ERROR", awsErrorMessage(err), 502);
    }
  }
  return updated;
}
