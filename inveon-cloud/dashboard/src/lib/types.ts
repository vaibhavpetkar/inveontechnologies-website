export type Role = "owner" | "admin" | "developer" | "viewer";
export type JobStatus = "pending" | "running" | "success" | "failure" | "cancelled";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  organizations: OrgSummary[];
}

export interface Server {
  id: string;
  name: string;
  status: "pending" | "online" | "offline";
  ipAddress: string | null;
  hostname: string | null;
  os: string | null;
  cpuCount: number | null;
  memoryBytes: number | null;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  dockerVersion: string | null;
  agentVersion: string | null;
  lastSeenAt: string | null;
  registeredAt: string | null;
  createdAt: string;
}

export interface App {
  id: string;
  name: string;
  slug: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  composePath: string;
  imageRegistry: string | null;
  buildOnServer: boolean;
  dockerfilePath: string;
  buildContext: string;
  registryCredentials: { server: string; username: string | null; password: string } | null;
  deployKey: { publicKey: string } | null;
  previewsEnabled: boolean;
  previewServerId: string | null;
  previewBaseDomain: string | null;
  previewVarsFromEnvironmentId: string | null;
  webhookUrl: string;
  environmentCount?: number;
  createdAt: string;
}

export interface Environment {
  id: string;
  appId: string;
  serverId: string;
  name: string;
  slug: string;
  strategy: "blue_green" | "recreate";
  healthPath: string;
  bluePort: number;
  greenPort: number;
  activeSlot: "blue" | "green" | "main" | null;
  currentReleaseId: string | null;
  previousReleaseId: string | null;
  autoDeploy: boolean;
  releaseCommand: string | null;
  releaseService: string | null;
  previewPr: number | null;
  createdAt: string;
  serverName?: string;
  serverIp?: string | null;
  currentCommitSha?: string | null;
}

export interface Release {
  id: string;
  commitSha: string;
  commitMessage: string | null;
  source: "webhook" | "manual" | "pull_request";
  createdAt: string;
}

export interface Job {
  id: string;
  serverId: string;
  environmentId: string | null;
  type: string;
  title: string;
  status: JobStatus;
  error: string | null;
  createdAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
  serverName?: string;
}

export interface JobStep {
  id: string;
  jobId: string;
  position: number;
  name: string;
  action: string;
  params?: Record<string, unknown>;
  status: JobStatus;
  log?: string;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Deployment {
  id: string;
  kind: "deploy" | "rollback";
  slot: string;
  status: JobStatus;
  jobId: string;
  createdAt: string;
  finishedAt: string | null;
  commitSha: string;
  commitMessage: string | null;
  error: string | null;
  releaseOutput: string | null;
  backupId: string | null;
  backupStatus: JobStatus | null;
}

export interface EnvVar {
  key: string;
  isSecret: boolean;
  value: string | null;
  masked: string | null;
  updatedAt: string;
}

export interface Domain {
  id: string;
  hostname: string;
  status: "pending_dns" | "issuing" | "active" | "failed";
  dnsCheckedAt: string | null;
  lastError: string | null;
  certIssuedAt: string | null;
  certExpiresAt: string | null;
  dnsRecord?: { type: string; name: string; value: string | null };
}

export interface HealthCheck {
  id: string;
  url: string;
  intervalSec: number;
  enabled: boolean;
  status: "unknown" | "up" | "down";
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
}

export interface BackupConfig {
  enabled: boolean;
  hourUtc: number;
  dbType: "none" | "postgres" | "mysql";
  dbService: string | null;
  dbName: string | null;
  dbUser: string | null;
  volumePaths: string[];
  s3Bucket: string | null;
  s3Prefix: string;
  s3Region: string;
  keepDaily: number | null;
  keepWeekly: number;
  lastPrunedAt?: string | null;
}

export interface Backup {
  id: string;
  kind: "scheduled" | "manual" | "pre_restore" | "pre_deploy";
  status: JobStatus;
  s3Bucket: string;
  s3Key: string;
  jobId: string | null;
  sizeBytes: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface EnvironmentDetail {
  environment: Environment;
  app: App;
  server: Server;
  currentRelease: Release | null;
  previousRelease: Release | null;
  domains: Domain[];
  healthCheck: HealthCheck | null;
  backupConfig: BackupConfig | null;
}

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  expired: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorServerId: string | null;
}

export const ROLE_RANK: Record<Role, number> = { viewer: 0, developer: 1, admin: 2, owner: 3 };

export type AlertChannelType = "slack" | "webhook" | "email";

export interface AlertChannel {
  id: string;
  name: string;
  type: AlertChannelType;
  /** Scheme and host only; the rest of the URL is write-only. */
  url: string | null;
  signingSecret: string | null;
  emails: string[];
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEventInfo {
  id: string;
  label: string;
  default: boolean;
}

export interface AlertDelivery {
  id: string;
  channelId: string;
  channelName: string;
  channelType: AlertChannelType;
  event: string;
  payload: { title?: string; text?: string };
  status: "pending" | "success" | "failure";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  responseStatus: number | null;
  lastError: string | null;
  detail: string | null;
  createdAt: string;
  deliveredAt: string | null;
}
