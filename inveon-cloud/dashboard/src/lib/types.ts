export type Role = "owner" | "admin" | "developer" | "viewer";
export type JobStatus = "pending" | "running" | "success" | "failure" | "cancelled";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  /** Passkeys registered (missing on control planes from before passkeys). */
  passkeys?: number;
  /** TOTP or a passkey: what the owner requirement checks. */
  satisfied?: boolean;
  /** An owner somewhere, or an admin where the organization requires it. */
  required: boolean;
}

export interface Passkey {
  id: string;
  name: string;
  alg: number;
  aaguid: string | null;
  transports: string[];
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  organizations: OrgSummary[];
  twoFactor: TwoFactorStatus;
  /** Runs the installation itself (encryption keys). */
  platformAdmin: boolean;
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
  /** "unsigned": the agent predates request signing; null until it registers. */
  requestSigning?: "signed" | "unsigned" | null;
  signingKeyAt?: string | null;
  lastSeenAt: string | null;
  registeredAt: string | null;
  createdAt: string;
  provider: "manual" | "aws";
  provisionState: "pending" | "running" | "agent_online" | "terminating" | "terminated" | "failed" | null;
  provisionError: string | null;
  awsRegion: string | null;
  awsInstanceId: string | null;
  awsInstanceType: string | null;
  awsAmiId: string | null;
  awsState: string | null;
  awsSecurityGroupId: string | null;
  awsCreatedSecurityGroup: boolean;
  terminatedAt: string | null;
}

export interface AwsConnection {
  connected: boolean;
  authType: "role" | "keys" | null;
  roleArn: string | null;
  externalId: string;
  accessKeyId: string | null;
  hasSecret: boolean;
  defaultRegion: string;
  accountId: string | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface AwsInfo {
  connection: AwsConnection | null;
  regions: string[];
  instanceTypes: { id: string; arch: "x86_64" | "arm64"; vcpu: number; memoryGb: number }[];
  disk: { min: number; max: number };
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
  keepReleases: number;
  maintenanceWindows: MaintenanceWindow[];
  maintenanceTimeZone: string;
  queuedReleaseId: string | null;
  queuedAt: string | null;
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

export interface MaintenanceWindow {
  /** 0 = Sunday. */
  day: number;
  /** HH:MM, UTC. */
  start: string;
  durationMin: number;
}

export interface MaintenanceState {
  windows: MaintenanceWindow[];
  /** IANA name the windows are read in (UTC unless chosen). */
  timeZone: string;
  currentLabel: string | null;
  restricted: boolean;
  open: boolean;
  current: { start: string; end: string } | null;
  next: { start: string; end: string } | null;
  nextLabel: string | null;
  queuedReleaseId: string | null;
  queuedAt: string | null;
  queuedRelease: Release | null;
}

export interface EnvironmentDetail {
  maintenance: MaintenanceState;
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
  twoFactorEnabled: boolean;
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

export interface DeployedRelease {
  releaseId: string;
  commitSha: string;
  commitMessage: string | null;
  lastDeployedAt: string;
  archivedAt: string | null;
  current: boolean;
  previous: boolean;
}

// ---------------------------------------------------------------- monitoring

export type MetricRange = "1h" | "24h" | "7d" | "30d";
export type MetricKind = "cpu" | "memory" | "disk" | "offline";

export interface MetricPoint {
  t: string;
  cpuPct: number | null;
  cpuPctMax: number | null;
  load1: number | null;
  memUsedBytes: number | null;
  memUsedBytesMax: number | null;
  memTotalBytes: number | null;
  diskRootUsedBytes: number | null;
  diskRootTotalBytes: number | null;
  diskDockerUsedBytes: number | null;
  diskDockerTotalBytes: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
}

export interface ContainerSummary {
  name: string;
  project: string | null;
  service: string | null;
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
  cpuPctAvg: number | null;
  cpuPctMax: number | null;
  memBytesMax: number | null;
}

export interface ServerMetrics {
  range: MetricRange;
  stepSec: number;
  since: string;
  until: string;
  points: MetricPoint[];
  latestAt: string | null;
  containers: ContainerSummary[];
}

export interface EnvironmentResources {
  range: MetricRange;
  stepSec: number;
  since: string;
  until: string;
  points: { t: string; cpuPct: number | null; memBytes: number | null }[];
  latestAt: string | null;
  containers: ContainerSummary[];
  serverId: string;
}

export interface MetricIncident {
  id: string;
  serverId: string;
  metric: MetricKind;
  thresholdPct: number | null;
  forMinutes: number;
  startedAt: string;
  resolvedAt: string | null;
  openValue: number | null;
  peakValue: number | null;
  clearValue: number | null;
  closedReason: string | null;
}

export interface MetricRule {
  id: string;
  serverId: string | null;
  metric: MetricKind;
  thresholdPct: number | null;
  forMinutes: number;
  enabled: boolean;
  updatedAt: string;
}

export interface MetricRulesResponse {
  rules: MetricRule[];
  effective: Partial<Record<MetricKind, MetricRule>> | null;
  metrics: { id: MetricKind; label: string; suggested: { thresholdPct: number | null; forMinutes: number } }[];
}

export interface ScrapeToken {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
