import { pgTable, uuid, text, timestamp, boolean, jsonb, pgEnum, integer, bigint, unique, index, primaryKey } from "drizzle-orm/pg-core";

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
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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
  hostname: text("hostname"),
  os: text("os"),
  cpuCount: integer("cpu_count"),
  memoryBytes: bigint("memory_bytes", { mode: "number" }),
  diskTotalBytes: bigint("disk_total_bytes", { mode: "number" }),
  diskFreeBytes: bigint("disk_free_bytes", { mode: "number" }),
  dockerVersion: text("docker_version"),
  agentVersion: text("agent_version"),
  lastSeenAt: ts("last_seen_at"),
  registeredAt: ts("registered_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const serverBootstrapTokens = pgTable("server_bootstrap_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

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
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "restrict" }),
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
    createdAt: createdAt(),
  },
  (t) => ({ uniqName: unique().on(t.appId, t.name), uniqPort: unique().on(t.serverId, t.bluePort) }),
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
