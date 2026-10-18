import { serverInUse } from "../replicas/pool.js";
import { Router } from "express";
import { z } from "zod";
import { and, eq, notInArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { awsConnections, environments, serverBootstrapTokens, servers } from "../../db/schema.js";
import { encryptValue, randomToken } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { AppError, ConflictError } from "../../lib/errors.js";
import { requireRole } from "../auth/middleware.js";
import { issueBootstrapToken, loadServer, publicServer } from "../servers/routes.js";
import { ec2Api } from "./provider.js";
import {
  AWS_BOOTSTRAP_TTL_MS,
  AWS_REGIONS,
  INSTANCE_TYPES,
  MAX_DISK_GB,
  MIN_DISK_GB,
  apiFor,
  awsErrorMessage,
  awsSecretAad,
  buildUserData,
  connectionSchema,
  createServerSchema,
  credentialsOf,
  loadConnection,
  pollAwsServers,
  regionSchema,
} from "./service.js";

type Connection = typeof awsConnections.$inferSelect;

/** Never returns the secret key; only the external id, the role or the key id. */
function publicConnection(c: Connection | undefined) {
  if (!c) return null;
  return {
    connected: !!c.authType,
    authType: c.authType,
    roleArn: c.roleArn,
    externalId: c.externalId,
    accessKeyId: c.accessKeyId,
    hasSecret: !!c.secretAccessKeyEnc,
    defaultRegion: c.defaultRegion,
    accountId: c.accountId,
    verifiedAt: c.verifiedAt,
    updatedAt: c.updatedAt,
  };
}

const awsFailure = (err: unknown, what: string) => new AppError("AWS_ERROR", `${what}: ${awsErrorMessage(err)}`, 502);

/** Slug for AWS resource names. */
const awsName = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "server";

export function awsRouter(db: Database, env: Env) {
  const router = Router({ mergeParams: true });
  const view = (s: typeof servers.$inferSelect) => publicServer(s, env.INVEON_HEARTBEAT_TIMEOUT_SEC);

  // ---------------------------------------------------------------- connection (admins)

  router.get("/aws", requireRole("admin"), async (req, res) => {
    const c = await db.query.awsConnections.findFirst({ where: eq(awsConnections.orgId, req.member!.orgId) });
    res.json({
      connection: publicConnection(c),
      regions: AWS_REGIONS,
      instanceTypes: Object.entries(INSTANCE_TYPES).map(([id, t]) => ({ id, ...t })),
      disk: { min: MIN_DISK_GB, max: MAX_DISK_GB },
    });
  });

  // Creates the external id the role's trust policy needs, before the role exists.
  router.post("/aws/setup", requireRole("admin"), async (req, res) => {
    await db.insert(awsConnections).values({ orgId: req.member!.orgId, externalId: `inveon-${randomToken(24)}`, createdBy: req.user!.sub }).onConflictDoNothing();
    const c = await db.query.awsConnections.findFirst({ where: eq(awsConnections.orgId, req.member!.orgId) });
    res.json({ connection: publicConnection(c) });
  });

  // Saves the connection only after sts:GetCallerIdentity works with it.
  router.put("/aws", requireRole("admin"), async (req, res) => {
    const body = connectionSchema.parse(req.body);
    const orgId = req.member!.orgId;
    const existing = await db.query.awsConnections.findFirst({ where: eq(awsConnections.orgId, orgId) });
    if (body.authType === "role" && !existing) throw new AppError("NO_EXTERNAL_ID", "Start the setup first: the role's trust policy needs the external id", 400);
    const externalId = existing?.externalId ?? `inveon-${randomToken(24)}`;
    const creds =
      body.authType === "role" ? { authType: "role" as const, roleArn: body.roleArn, externalId } : { authType: "keys" as const, accessKeyId: body.accessKeyId, secretAccessKey: body.secretAccessKey };
    let identity: { accountId: string };
    try {
      identity = await (await ec2Api(creds, body.defaultRegion)).verify();
    } catch (err) {
      throw new AppError("AWS_VERIFY_FAILED", `AWS refused these credentials: ${awsErrorMessage(err)}`, 400);
    }
    const values = {
      authType: body.authType,
      roleArn: body.authType === "role" ? body.roleArn : null,
      accessKeyId: body.authType === "keys" ? body.accessKeyId : null,
      secretAccessKeyEnc: body.authType === "keys" ? encryptValue(body.secretAccessKey, awsSecretAad(orgId)) : null,
      defaultRegion: body.defaultRegion,
      accountId: identity.accountId,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    };
    const [saved] = await db
      .insert(awsConnections)
      .values({ orgId, externalId, createdBy: req.user!.sub, ...values })
      .onConflictDoUpdate({ target: awsConnections.orgId, set: values })
      .returning();
    await audit(db, req, "aws.connect", "aws_connection", saved.id, { authType: body.authType, roleArn: values.roleArn, accessKeyId: values.accessKeyId, accountId: identity.accountId });
    res.json({ connection: publicConnection(saved) });
  });

  router.delete("/aws", requireRole("admin"), async (req, res) => {
    const orgId = req.member!.orgId;
    const live = await db.query.servers.findFirst({
      where: and(eq(servers.orgId, orgId), eq(servers.provider, "aws"), notInArray(servers.provisionState, ["terminated", "failed"])),
    });
    if (live) throw new ConflictError(`Terminate ${live.name} first: it needs this connection`);
    await db.delete(awsConnections).where(eq(awsConnections.orgId, orgId));
    await audit(db, req, "aws.disconnect", "aws_connection", null);
    res.json({ ok: true });
  });

  // Security groups and key pairs in a region, for the create form.
  router.get("/aws/options", requireRole("admin"), async (req, res) => {
    const { region } = z.object({ region: regionSchema }).parse(req.query);
    const api = await apiFor(db, req.member!.orgId, region);
    try {
      const [securityGroups, keyPairs] = await Promise.all([api.listSecurityGroups(), api.listKeyPairs()]);
      res.json({ securityGroups, keyPairs });
    } catch (err) {
      throw awsFailure(err, "Could not list security groups and key pairs");
    }
  });

  // ---------------------------------------------------------------- servers

  router.post("/servers/aws", requireRole("admin"), async (req, res) => {
    const body = createServerSchema.parse(req.body);
    const orgId = req.member!.orgId;
    const connection = await loadConnection(db, orgId);
    const api = await ec2Api(credentialsOf(connection), body.region);
    const type = INSTANCE_TYPES[body.instanceType];

    let amiId: string;
    try {
      amiId = await api.ubuntuAmi(type.arch);
    } catch (err) {
      throw awsFailure(err, "Could not look up the Ubuntu AMI");
    }

    const [server] = await db
      .insert(servers)
      .values({ orgId, name: body.name, createdBy: req.user!.sub, provider: "aws", provisionState: "pending", awsRegion: body.region, awsInstanceType: body.instanceType, awsAmiId: amiId })
      .returning();
    const tags = { "inveon:server-id": server.id, "inveon:org-id": orgId, "inveon:managed-by": "inveon-cloud" };

    let securityGroupId = body.securityGroupId ?? null;
    let createdGroup = false;
    try {
      if (body.createSecurityGroup) {
        const vpcId = body.subnetId ? await api.subnetVpcId(body.subnetId) : await api.defaultVpcId();
        if (!vpcId) throw new AppError("NO_DEFAULT_VPC", "This region has no default VPC: give a subnet", 400);
        securityGroupId = await api.createSecurityGroup({
          name: `inveon-${awsName(body.name)}-${server.id.slice(0, 8)}`,
          description: `Inveon Cloud server ${body.name}: web (80, 443)${body.createSecurityGroup.sshCidr ? " and SSH" : ""}`,
          vpcId,
          sshCidr: body.createSecurityGroup.sshCidr,
          tags: { Name: `inveon-${awsName(body.name)}`, ...tags },
        });
        createdGroup = true;
      }
      // Single use; it outlives the boot and the installer, then it's spent.
      const bootstrap = await issueBootstrapToken(db, env, server.id, req.user!.sub, AWS_BOOTSTRAP_TTL_MS);
      const { instanceId } = await api.runInstance({
        name: body.name,
        amiId,
        instanceType: body.instanceType,
        diskGb: body.diskGb,
        securityGroupId: securityGroupId!,
        subnetId: body.subnetId,
        keyName: body.keyName,
        instanceProfile: body.instanceProfile,
        userData: buildUserData(env.INVEON_PUBLIC_URL, bootstrap.token),
        tags,
      });
      const [launched] = await db
        .update(servers)
        .set({ awsInstanceId: instanceId, awsSecurityGroupId: securityGroupId, awsCreatedSecurityGroup: createdGroup, awsState: "pending" })
        .where(eq(servers.id, server.id))
        .returning();
      await audit(db, req, "server.launch", "server", server.id, {
        name: body.name,
        region: body.region,
        instanceType: body.instanceType,
        diskGb: body.diskGb,
        instanceId,
        securityGroupId,
        createdSecurityGroup: createdGroup,
        sshCidr: body.createSecurityGroup?.sshCidr ?? null,
        keyName: body.keyName ?? null,
      });
      res.status(201).json({ server: view(launched) });
    } catch (err) {
      // Nothing launched: undo what was made, and say why.
      if (createdGroup && securityGroupId) await api.deleteSecurityGroup(securityGroupId).catch(() => undefined);
      await db.delete(servers).where(eq(servers.id, server.id));
      if (err instanceof AppError) throw err;
      throw awsFailure(err, "Could not launch the instance");
    }
  });

  router.post("/servers/:id/refresh", requireRole("admin"), async (req, res) => {
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    if (server.provider !== "aws") throw new AppError("NOT_AWS", "Only servers launched from Inveon Cloud can be refreshed from AWS", 400);
    await pollAwsServers(db, { orgId: req.member!.orgId, serverId: server.id });
    res.json({ server: view(await loadServer(db, req.member!.orgId, server.id)) });
  });

  // Typed confirmation: the server's exact name.
  router.post("/servers/:id/terminate", requireRole("admin"), async (req, res) => {
    const { confirm } = z.object({ confirm: z.string().max(200) }).parse(req.body);
    const server = await loadServer(db, req.member!.orgId, req.params.id);
    if (server.provider !== "aws" || !server.awsInstanceId || !server.awsRegion) throw new AppError("NOT_AWS", "Only servers launched from Inveon Cloud can be terminated here", 400);
    if (confirm !== server.name) throw new AppError("CONFIRMATION_MISMATCH", "Type the server's name exactly to confirm", 400);
    if (server.provisionState === "terminated") throw new ConflictError("This instance is already terminated");
    if (await serverInUse(db, server.id)) throw new ConflictError("Remove the environments on this server first (or take it out of their replicas and proxies)");

    const api = await apiFor(db, req.member!.orgId, server.awsRegion);
    try {
      // Only ever terminate the instance this server launched (checked by its tag).
      const [info] = await api.describeInstances([server.awsInstanceId]);
      if (info && info.tags["inveon:server-id"] !== server.id) throw new AppError("INSTANCE_MISMATCH", "That instance isn't tagged as this server's; refusing to terminate it", 409);
      if (info && info.state !== "terminated") await api.terminateInstance(server.awsInstanceId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw awsFailure(err, "Could not terminate the instance");
    }
    // The agent token stops working at once.
    const [updated] = await db.update(servers).set({ provisionState: "terminating", tokenHash: null }).where(eq(servers.id, server.id)).returning();
    await db.delete(serverBootstrapTokens).where(eq(serverBootstrapTokens.serverId, server.id));
    await audit(db, req, "server.terminate", "server", server.id, { name: server.name, instanceId: server.awsInstanceId, region: server.awsRegion });
    res.json({ server: view(updated) });
  });

  return router;
}
