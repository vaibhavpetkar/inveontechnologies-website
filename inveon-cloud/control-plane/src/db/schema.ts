import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, jsonb, pgEnum, integer, bigint, doublePrecision, unique, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";

/**
 * One record per resource, like Frappe Cloud's press: organizations own
 * servers and apps; an environment is one app on one server; every remote
 * action is a job with steps and logs.
 */

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "developer", "viewer"]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "success", "failure", "cancelled"]);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------- identity

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: ts("locked_until"),
  // Two-factor (TOTP). The secret is envelope-encrypted; a pending secret
  // waits for the first code during enrolment. totpLastStep is the newest
  // 30-second step a code was accepted for: an older or equal step is a replay.
  totpSecretEnc: text("totp_secret_enc"),
  totpPendingSecretEnc: text("totp_pending_secret_enc"),
  totpEnabledAt: ts("totp_enabled_at"),
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** One-time recovery codes for two-factor sign-in, stored as salted SHA-256 hashes. */
export const userRecoveryCodes = pgTable(
  "user_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: unique().on(t.userId, t.codeHash) }),
);

/**
 * Passkeys (WebAuthn credentials). The public key is stored as SPKI DER
 * (base64); it isn't secret. A passkey sign-in counts as two-factor.
 */
export const userPasskeys = pgTable(
  "user_passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // base64url of the raw credential id.
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    // COSE algorithm: -7 ES256, -8 EdDSA, -257 RS256.
    alg: integer("alg").notNull(),
    signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
    name: text("name").notNull(),
    aaguid: text("aaguid"),
    transports: jsonb("transports").$type<string[]>().notNull().default([]),
    backupEligible: boolean("backup_eligible").notNull().default(false),
    backedUp: boolean("backed_up").notNull().default(false),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
  },
  (t) => ({ byUser: index("user_passkeys_user_idx").on(t.userId) }),
);

/** WebAuthn challenges: single use, 5 minutes, bound to the user when there is one. */
export const webauthnChallenges = pgTable(
  "webauthn_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"register" | "login">().notNull(),
    challenge: text("challenge").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ byExpiry: index("webauthn_challenges_expires_idx").on(t.expiresAt) }),
);

// Opaque random refresh tokens, stored as SHA-256 hashes and rotated on use.
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  replacedByTokenId: uuid("replaced_by_token_id"),
  revokedAt: ts("revoked_at"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Owners always need two-factor; this extends the requirement to admins.
  require2faForAdmins: boolean("require_2fa_for_admins").notNull().default(false),
  // Refuse agent requests that aren't signed with the server's Ed25519 key
  // (INVEON_AGENT_SIGNATURES=required does this for every organization).
  requireSignedAgents: boolean("require_signed_agents").notNull().default(false),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: unique().on(t.orgId, t.userId) }),
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
  revokedAt: ts("revoked_at"),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorServerId: uuid("actor_server_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => ({ byOrg: index("audit_logs_org_created_idx").on(t.orgId, t.createdAt) }),
);

// ---------------------------------------------------------------- servers

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // pending = waiting for the agent to register; then online/offline from heartbeats.
  status: text("status").$type<"pending" | "online" | "offline">().notNull().default("pending"),
  // SHA-256 of the per-server agent token. The plaintext is shown to the agent once.
  tokenHash: text("token_hash").unique(),
  ipAddress: text("ip_address"),
  // Address other servers reach it on inside a private network (VPC). The
  // proxy of a multi-server environment prefers it over the public one.
  privateIpAddress: text("private_ip_address"),
  hostname: text("hostname"),
  os: text("os"),
  cpuCount: integer("cpu_count"),
  memoryBytes: bigint("memory_bytes", { mode: "number" }),
  diskTotalBytes: bigint("disk_total_bytes", { mode: "number" }),
  diskFreeBytes: bigint("disk_free_bytes", { mode: "number" }),
  dockerVersion: text("docker_version"),
  agentVersion: text("agent_version"),
  // The agent's Ed25519 public key (SPKI DER, base64). Once set, every agent
  // request must be signed with it; null means an agent from before signing.
  signingPublicKey: text("signing_public_key"),
  signingKeyAt: ts("signing_key_at"),
  lastSeenAt: ts("last_seen_at"),
  registeredAt: ts("registered_at"),
  // Which cloud Inveon Cloud launched the instance on ("manual": added by hand).
  provider: text("provider").$type<"manual" | "aws" | "digitalocean" | "hetzner">().notNull().default("manual"),
  // pending (launched) -> running (instance up) -> agent_online (registered);
  // stopping -> stopped -> starting after Stop and Start (resizing while a
  // stopped DigitalOcean or Hetzner server changes size); terminating ->
  // terminated after Terminate. failed if the launch failed.
  provisionState: text("provision_state").$type<"pending" | "running" | "agent_online" | "stopping" | "stopped" | "starting" | "resizing" | "terminating" | "terminated" | "failed">(),
  provisionError: text("provision_error"),
  awsRegion: text("aws_region"),
  awsInstanceId: text("aws_instance_id"),
  awsInstanceType: text("aws_instance_type"),
  awsAmiId: text("aws_ami_id"),
  awsState: text("aws_state"),
  awsSecurityGroupId: text("aws_security_group_id"),
  // The security group was created for this server (deleted after termination).
  awsCreatedSecurityGroup: boolean("aws_created_security_group").notNull().default(false),
  // DigitalOcean droplets and Hetzner servers (EC2 keeps its aws_* columns).
  cloudRegion: text("cloud_region"),
  cloudInstanceId: text("cloud_instance_id"),
  cloudSize: text("cloud_size"),
  cloudImage: text("cloud_image"),
  // The provider's own status word ("active", "off", ...).
  cloudState: text("cloud_state"),
  // The size a resize asked for, until the provider reports it.
  resizeTarget: text("resize_target"),
  terminatedAt: ts("terminated_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/**
 * An organization's AWS account, for launching servers. Preferred: a role
 * the control plane assumes with this external id (generated here, never
 * chosen by the user). Otherwise an access key, its secret envelope-encrypted.
 */
export const awsConnections = pgTable("aws_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  // null until the connection is saved (the row exists early to hold the external id).
  authType: text("auth_type").$type<"role" | "keys">(),
  roleArn: text("role_arn"),
  externalId: text("external_id").notNull(),
  accessKeyId: text("access_key_id"),
  secretAccessKeyEnc: text("secret_access_key_enc"),
  defaultRegion: text("default_region").notNull().default("ap-south-1"),
  accountId: text("account_id"),
  verifiedAt: ts("verified_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * API tokens for the clouds and DNS providers that are reached with one
 * (DigitalOcean, Hetzner Cloud, Cloudflare), one per organization and
 * provider. The token is envelope-encrypted and write-only; only its last
 * four characters are shown. Route 53 uses the AWS connection instead.
 */
export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"digitalocean" | "hetzner" | "cloudflare">().notNull(),
    tokenEnc: text("token_enc").notNull(),
    tokenHint: text("token_hint").notNull(),
    // What the provider says the token belongs to (account, team or project).
    accountLabel: text("account_label"),
    verifiedAt: ts("verified_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => ({ uniq: unique().on(t.orgId, t.provider) }),
);

/**
 * Nonces of signed agent requests, kept until their timestamp can no longer
 * pass the 5-minute window, so a captured request can't be replayed.
 */
export const agentRequestNonces = pgTable(
  "agent_request_nonces",
  {
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    nonce: text("nonce").notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.serverId, t.nonce] }), byExpiry: index("agent_request_nonces_expires_idx").on(t.expiresAt) }),
);

export const serverBootstrapTokens = pgTable("server_bootstrap_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- GitHub App

/**
 * A GitHub App installation linked to an organization (one organization
 * per installation). Its short-lived tokens read repositories owned by the
 * installation's account and comment on their pull requests.
 */
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    installationId: bigint("installation_id", { mode: "number" }).notNull().unique(),
    // The GitHub user or organization the app is installed on.
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type"),
    suspendedAt: ts("suspended_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({ byOrg: index("github_installations_org_idx").on(t.orgId) }),
);

/** The one comment per pull request that shows its preview, updated in place. */
export const githubPrComments = pgTable(
  "github_pr_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    commentId: bigint("comment_id", { mode: "number" }).notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => ({ uniq: unique().on(t.appId, t.prNumber) }),
);

// ---------------------------------------------------------------- apps

export const apps = pgTable(
  "apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    repoUrl: text("repo_url").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    branch: text("branch").notNull().default("main"),
    composePath: text("compose_path").notNull().default("docker-compose.yml"),
    imageRegistry: text("image_registry"),
    // Envelope-encrypted HMAC secret for the GitHub push webhook.
    webhookSecretEnc: text("webhook_secret_enc").notNull(),
    // For repos without a CI image: the agent clones the commit and runs
    // docker build on the server. The compose file uses ${INVEON_IMAGE}.
    buildOnServer: boolean("build_on_server").notNull().default(false),
    dockerfilePath: text("dockerfile_path").notNull().default("Dockerfile"),
    buildContext: text("build_context").notNull().default("."),
    // Registry login for pulls and builds. The password is write-only and
    // envelope-encrypted; the agent logs in for the job and logs out after.
    registryServer: text("registry_server"),
    registryUsername: text("registry_username"),
    registryPasswordEnc: text("registry_password_enc"),
    // Read-only SSH deploy key for cloning private repos on the server
    // (private half encrypted; the public half is added to GitHub by hand).
    deployKeyEnc: text("deploy_key_enc"),
    deployKeyPublic: text("deploy_key_public"),
    // Preview environments: one per pull request (pr-<number>), on this
    // server, at pr-<number>.<previewBaseDomain>. Variables are copied from
    // previewVarsFromEnvironmentId when the preview is created.
    previewsEnabled: boolean("previews_enabled").notNull().default(false),
    previewServerId: uuid("preview_server_id").references(() => servers.id, { onDelete: "set null" }),
    previewBaseDomain: text("preview_base_domain"),
    previewVarsFromEnvironmentId: uuid("preview_vars_from_environment_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => ({ uniq: unique().on(t.orgId, t.slug) }),
);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    // The primary server: release commands, backups and logs run here, and it
    // is the first replica a deploy rolls out to (environment_replicas lists all).
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "restrict" }),
    // The server whose nginx serves the environment's domains. null: the primary.
    proxyServerId: uuid("proxy_server_id").references(() => servers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Globally unique: the agent's folder name and nginx upstream name.
    slug: text("slug").notNull().unique(),
    // blue_green = two compose projects side by side; recreate = one project
    // updated in place (for apps that keep their database in the same file).
    strategy: text("strategy").$type<"blue_green" | "recreate">().notNull().default("blue_green"),
    healthPath: text("health_path").notNull().default("/"),
    bluePort: integer("blue_port").notNull(),
    greenPort: integer("green_port").notNull(),
    activeSlot: text("active_slot").$type<"blue" | "green" | "main">(),
    currentReleaseId: uuid("current_release_id"),
    previousReleaseId: uuid("previous_release_id"),
    autoDeploy: boolean("auto_deploy").notNull().default(true),
    // Optional release command (e.g. "npm run db:migrate"), run with
    // `docker compose run` in the new release's image before traffic switches.
    // Stored as text, split into a validated argv: never run through a shell.
    releaseCommand: text("release_command"),
    releaseService: text("release_service"),
    // Set on preview environments: the pull request they belong to.
    previewPr: integer("preview_pr"),
    // Release archiving: how many recently deployed releases keep their
    // images on the server (the live and previous ones always do).
    keepReleases: integer("keep_releases").notNull().default(10),
    // Weekly maintenance windows, in maintenanceTimeZone (an IANA name; UTC
    // unless chosen). When set, deploys from webhooks wait for the next
    // window: the newest pushed release is queued here.
    maintenanceWindows: jsonb("maintenance_windows").$type<{ day: number; start: string; durationMin: number }[]>().notNull().default([]),
    maintenanceTimeZone: text("maintenance_time_zone").notNull().default("UTC"),
    queuedReleaseId: uuid("queued_release_id"),
    queuedAt: ts("queued_at"),
    createdAt: createdAt(),
  },
  (t) => ({ uniqName: unique().on(t.appId, t.name), uniqPort: unique().on(t.serverId, t.bluePort) }),
);

/**
 * The servers an environment runs on (always at least its primary). Each
 * replica has its own colour ports on its server (allocated there), and in
 * a multi-server environment a listener port the proxy reaches it on. A
 * deploy rolls out to the active replicas one by one, primary first.
 */
export const environmentReplicas = pgTable(
  "environment_replicas",
  {
    environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "restrict" }),
    bluePort: integer("blue_port").notNull(),
    greenPort: integer("green_port").notNull(),
    listenPort: integer("listen_port"),
    // adding: the current release is being deployed to it; removing: being
    // taken out of the pool and stopped; failed: adding it failed.
    status: text("status").$type<"adding" | "active" | "removing" | "failed">().notNull().default("active"),
    activeSlot: text("active_slot").$type<"blue" | "green" | "main">(),
    currentReleaseId: uuid("current_release_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.environmentId, t.serverId] }), uniqPort: unique().on(t.serverId, t.bluePort), byServer: index("environment_replicas_server_idx").on(t.serverId) }),
);

export const envVars = pgTable(
  "env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    isSecret: boolean("is_secret").notNull().default(false),
    // Always envelope-encrypted, secret or not.
    valueEnc: text("value_enc").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => ({ uniq: unique().on(t.environmentId, t.key) }),
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    commitMessage: text("commit_message"),
    composeContent: text("compose_content").notNull(),
    source: text("source").$type<"webhook" | "manual" | "pull_request">().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: unique().on(t.appId, t.commitSha) }),
);

/**
 * A release that is archived for one environment: its images were pruned
 * from that environment's server and it can no longer be rolled back to
 * there. Deploying the same commit again (a fresh build or pull) un-archives it.
 */
export const archivedReleases = pgTable(
  "archived_releases",
  {
    environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
    releaseId: uuid("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
    jobId: uuid("job_id"),
    archivedAt: ts("archived_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.environmentId, t.releaseId] }) }),
);

// ---------------------------------------------------------------- jobs

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id").references(() => environments.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    // Internal references (deploymentId, domainId, backupIds), never agent-supplied.
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    claimedAt: ts("claimed_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => ({ byServer: index("jobs_server_status_idx").on(t.serverId, t.status), byOrg: index("jobs_org_created_idx").on(t.orgId, t.createdAt) }),
);

export const jobSteps = pgTable(
  "job_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    action: text("action").notNull(),
    // Never holds secrets: env files and compose content are resolved when the agent claims the job.
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatusEnum("status").notNull().default("pending"),
    log: text("log").notNull().default(""),
    result: jsonb("result").$type<Record<string, unknown>>(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => ({ uniq: unique().on(t.jobId, t.position) }),
);

export interface RolloutState {
  serverIds: string[];
  done: string[];
  // Per server: what it ran before this rollout, and the colour it is moving to.
  previous: Record<string, { slot: "blue" | "green" | "main" | null; releaseId: string | null; newSlot: "blue" | "green" | "main" }>;
  failedServerId?: string | null;
}

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  releaseId: uuid("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"deploy" | "rollback">().notNull(),
  slot: text("slot").$type<"blue" | "green" | "main">().notNull(),
  previousSlot: text("previous_slot").$type<"blue" | "green" | "main">(),
  status: jobStatusEnum("status").notNull().default("pending"),
  // Why it failed (the job's error) and the tail of the release command's output.
  error: text("error"),
  releaseOutput: text("release_output"),
  // Backup taken before the release command, offered for restore if it fails.
  backupId: uuid("backup_id").references(() => backups.id, { onDelete: "set null" }),
  // Multi-server rollouts: the servers in order, the ones already updated
  // (and what each ran before, for rolling them back), and the one that failed.
  rollout: jsonb("rollout").$type<RolloutState>(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});

// ---------------------------------------------------------------- domains, health, backups

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  status: text("status").$type<"pending_dns" | "issuing" | "active" | "failed">().notNull().default("pending_dns"),
  dnsCheckedAt: ts("dns_checked_at"),
  lastError: text("last_error"),
  certIssuedAt: ts("cert_issued_at"),
  certExpiresAt: ts("cert_expires_at"),
  createdAt: createdAt(),
});

export const healthChecks = pgTable("health_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  environmentId: uuid("environment_id").notNull().unique().references(() => environments.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  intervalSec: integer("interval_sec").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  status: text("status").$type<"unknown" | "up" | "down">().notNull().default("unknown"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastCheckedAt: ts("last_checked_at"),
  lastStatusCode: integer("last_status_code"),
  lastError: text("last_error"),
  lastChangeAt: ts("last_change_at"),
  createdAt: createdAt(),
});

export const backupConfigs = pgTable("backup_configs", {
  environmentId: uuid("environment_id").primaryKey().references(() => environments.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  hourUtc: integer("hour_utc").notNull().default(20),
  // Structured, not a free command: the agent builds pg_dump / mysqldump itself.
  dbType: text("db_type").$type<"none" | "postgres" | "mysql">().notNull().default("none"),
  dbService: text("db_service"),
  dbName: text("db_name"),
  dbUser: text("db_user"),
  // Relative to the environment's data folder on the server.
  volumePaths: jsonb("volume_paths").$type<string[]>().notNull().default([]),
  s3Bucket: text("s3_bucket"),
  s3Prefix: text("s3_prefix").notNull().default("inveon-cloud"),
  s3Region: text("s3_region").notNull().default("ap-south-1"),
  // Retention: keep the newest backup of each of the last keepDaily days, and
  // of each of the last keepWeekly weeks. null keeps everything.
  keepDaily: integer("keep_daily"),
  keepWeekly: integer("keep_weekly").notNull().default(0),
  lastPrunedAt: ts("last_pruned_at"),
  lastScheduledAt: ts("last_scheduled_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const backups = pgTable("backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  kind: text("kind").$type<"scheduled" | "manual" | "pre_restore" | "pre_deploy">().notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  s3Bucket: text("s3_bucket").notNull(),
  s3Region: text("s3_region").notNull(),
  s3Key: text("s3_key").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});

export const schedulerRuns = pgTable(
  "scheduler_runs",
  {
    name: text("name").notNull(),
    key: text("key").notNull(),
    lastRunAt: ts("last_run_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.name, t.key] }) }),
);

// ---------------------------------------------------------------- alerts

/**
 * Where an organization's alerts go. Slack and webhook URLs are secrets (a
 * Slack URL is its own credential), so they are envelope-encrypted like
 * variables; only the scheme and host are shown (urlHint). A webhook's
 * signing secret is generated here, shown once and encrypted.
 */
export const alertChannels = pgTable(
  "alert_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<"slack" | "webhook" | "email">().notNull(),
    urlEnc: text("url_enc"),
    urlHint: text("url_hint"),
    signingSecretEnc: text("signing_secret_enc"),
    // Email: recipients; empty means the organization's owners and admins.
    emails: jsonb("emails").$type<string[]>().notNull().default([]),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => ({ byOrg: index("alert_channels_org_idx").on(t.orgId) }),
);

/** One alert to one channel: a small durable queue with retries, and the delivery log. */
export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").notNull().references(() => alertChannels.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    // Title, text, link and details. Never holds secrets.
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<"pending" | "success" | "failure">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    detail: text("detail"),
    createdAt: createdAt(),
    deliveredAt: ts("delivered_at"),
  },
  (t) => ({ due: index("alert_deliveries_due_idx").on(t.status, t.nextAttemptAt), byOrg: index("alert_deliveries_org_created_idx").on(t.orgId, t.createdAt) }),
);


// ---------------------------------------------------------------- monitoring

/** One container in a metrics sample, as the agent read it from `docker stats` and `docker ps`. */
export interface ContainerSample {
  name: string;
  /** Compose project and service labels, when the container has them. */
  project?: string | null;
  service?: string | null;
  /** Percent of one CPU, like `docker stats` (can exceed 100 on several cores). */
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
  /** Rollups only: the highest values in the bucket (the plain fields are averages). */
  cpuPctMax?: number | null;
  memBytesMax?: number | null;
}

const bytesCol = (name: string) => bigint(name, { mode: "number" });

/**
 * Host metrics the agent samples every 30 seconds (raw, kept 24 hours).
 * The daily run folds older rows into 5-minute rollups. One row per server
 * and timestamp, so a batch the agent re-sends after a timeout is ignored.
 */
export const serverMetrics = pgTable(
  "server_metrics",
  {
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    cpuPct: doublePrecision("cpu_pct"),
    load1: doublePrecision("load1"),
    load5: doublePrecision("load5"),
    load15: doublePrecision("load15"),
    memUsedBytes: bytesCol("mem_used_bytes"),
    memTotalBytes: bytesCol("mem_total_bytes"),
    diskRootUsedBytes: bytesCol("disk_root_used_bytes"),
    diskRootTotalBytes: bytesCol("disk_root_total_bytes"),
    // Docker's data root (often the same file system as /).
    diskDockerUsedBytes: bytesCol("disk_docker_used_bytes"),
    diskDockerTotalBytes: bytesCol("disk_docker_total_bytes"),
    netRxBps: doublePrecision("net_rx_bps"),
    netTxBps: doublePrecision("net_tx_bps"),
    containers: jsonb("containers").$type<ContainerSample[]>().notNull().default([]),
  },
  (t) => ({ pk: primaryKey({ columns: [t.serverId, t.at] }), byTime: index("server_metrics_at_idx").on(t.at) }),
);

/**
 * 5-minute rollups of serverMetrics, kept 30 days. Averages, plus the
 * highest CPU and memory seen in the bucket; samples weights the averages
 * when buckets are merged into wider ones for the 7- and 30-day charts.
 */
export const serverMetricRollups = pgTable(
  "server_metric_rollups",
  {
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    bucket: ts("bucket").notNull(),
    samples: integer("samples").notNull(),
    cpuPct: doublePrecision("cpu_pct"),
    cpuPctMax: doublePrecision("cpu_pct_max"),
    load1: doublePrecision("load1"),
    load5: doublePrecision("load5"),
    load15: doublePrecision("load15"),
    memUsedBytes: bytesCol("mem_used_bytes"),
    memUsedBytesMax: bytesCol("mem_used_bytes_max"),
    memTotalBytes: bytesCol("mem_total_bytes"),
    diskRootUsedBytes: bytesCol("disk_root_used_bytes"),
    diskRootTotalBytes: bytesCol("disk_root_total_bytes"),
    diskDockerUsedBytes: bytesCol("disk_docker_used_bytes"),
    diskDockerTotalBytes: bytesCol("disk_docker_total_bytes"),
    netRxBps: doublePrecision("net_rx_bps"),
    netTxBps: doublePrecision("net_tx_bps"),
    containers: jsonb("containers").$type<ContainerSample[]>().notNull().default([]),
  },
  (t) => ({ pk: primaryKey({ columns: [t.serverId, t.bucket] }), byTime: index("server_metric_rollups_bucket_idx").on(t.bucket) }),
);

export type MetricRuleKind = "cpu" | "memory" | "disk" | "offline";

/**
 * Threshold alert rules. serverId null is the organization's default for
 * that metric; a row with a serverId overrides it for one server (and can
 * turn it off there). offline ignores thresholdPct.
 */
export const metricAlertRules = pgTable(
  "metric_alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
    metric: text("metric").$type<MetricRuleKind>().notNull(),
    thresholdPct: integer("threshold_pct"),
    // How long the condition must hold before an incident opens (0 = at once).
    forMinutes: integer("for_minutes").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    orgDefault: uniqueIndex("metric_alert_rules_org_default_idx").on(t.orgId, t.metric).where(sql`server_id IS NULL`),
    serverOverride: uniqueIndex("metric_alert_rules_server_idx").on(t.serverId, t.metric).where(sql`server_id IS NOT NULL`),
  }),
);

/**
 * A threshold that was crossed: open until the condition clears. At most one
 * open incident per server and metric (a partial unique index), which is
 * what keeps alerts to one when it starts and one when it clears.
 */
export const metricIncidents = pgTable(
  "metric_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    metric: text("metric").$type<MetricRuleKind>().notNull(),
    ruleId: uuid("rule_id").references(() => metricAlertRules.id, { onDelete: "set null" }),
    thresholdPct: integer("threshold_pct"),
    forMinutes: integer("for_minutes").notNull().default(0),
    startedAt: ts("started_at").notNull(),
    resolvedAt: ts("resolved_at"),
    // Value that opened it, the highest seen while open, and the one that cleared it.
    openValue: doublePrecision("open_value"),
    peakValue: doublePrecision("peak_value"),
    clearValue: doublePrecision("clear_value"),
    // Set when it closed because its rule was removed or turned off, not because it cleared.
    closedReason: text("closed_reason"),
  },
  (t) => ({
    oneOpen: uniqueIndex("metric_incidents_open_idx").on(t.serverId, t.metric).where(sql`resolved_at IS NULL`),
    byServer: index("metric_incidents_server_started_idx").on(t.serverId, t.startedAt),
  }),
);

/** Read-only tokens for the Prometheus /metrics endpoint, one organization each, stored as SHA-256 hashes. */
export const scrapeTokens = pgTable(
  "scrape_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    // The first characters, so people can tell tokens apart.
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({ byOrg: index("scrape_tokens_org_idx").on(t.orgId) }),
);
