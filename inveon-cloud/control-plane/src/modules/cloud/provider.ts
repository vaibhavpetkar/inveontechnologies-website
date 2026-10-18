/**
 * The provider interface every cloud implements: DigitalOcean and Hetzner
 * Cloud here (REST with fetch), and EC2 through an adapter over the AWS
 * module (aws/provider.ts keeps its own launch path for security groups,
 * subnets and instance profiles).
 *
 * States are normalised so the scheduler and the dashboard treat every
 * cloud the same; the provider's own word is kept next to it (raw).
 */

export type CloudProviderName = "aws" | "digitalocean" | "hetzner";
/** The clouds connected with an API token (EC2 has its own connection). */
export type TokenCloud = "digitalocean" | "hetzner";

export type CloudState = "pending" | "running" | "stopping" | "stopped" | "terminating" | "terminated" | "unknown";

export interface CloudInstance {
  instanceId: string;
  state: CloudState;
  /** The provider's own status word (DigitalOcean "active", Hetzner "off", ...). */
  raw: string;
  publicIp: string | null;
  privateIp: string | null;
  size: string | null;
  tags: Record<string, string>;
}

export interface CloudRegion {
  id: string;
  name: string;
}

export interface CloudSize {
  id: string;
  vcpu: number;
  memoryGb: number;
  diskGb: number;
  /** Monthly list price in USD (DigitalOcean) or EUR gross (Hetzner), when known. */
  priceMonthly: number | null;
  /** Regions it can be created in; empty means all. */
  regions: string[];
  arch: "x86_64" | "arm64";
}

export interface CloudImage {
  id: string;
  name: string;
  arch?: "x86_64" | "arm64";
}

export interface CreateInstanceInput {
  /** Already a valid host name (letters, digits, dashes). */
  name: string;
  region: string;
  size: string;
  image: string;
  /** cloud-init user data, plain text. */
  userData: string;
  tags: Record<string, string>;
}

/** Instance lifecycle: every cloud. */
export interface LifecycleApi {
  /** Missing instances are left out of the result. */
  describe(ids: string[]): Promise<CloudInstance[]>;
  stop(id: string): Promise<void>;
  start(id: string): Promise<void>;
  /** The instance must be stopped; the disk is kept as it is (so it can be resized back down). */
  resize(id: string, size: string): Promise<void>;
  terminate(id: string): Promise<void>;
}

/** A token cloud: lifecycle plus what creating a server needs. */
export interface CloudApi extends LifecycleApi {
  /** Checks the token; returns a label for the account or project. */
  verify(): Promise<{ account: string }>;
  regions(): Promise<CloudRegion[]>;
  sizes(): Promise<CloudSize[]>;
  images(): Promise<CloudImage[]>;
  create(input: CreateInstanceInput): Promise<{ instanceId: string }>;
}

/** Ubuntu and Debian only: install.sh supports these. */
export const CLOUD_IMAGES: Record<TokenCloud, string[]> = {
  digitalocean: ["ubuntu-24-04-x64", "ubuntu-22-04-x64", "debian-12-x64"],
  hetzner: ["ubuntu-24.04", "ubuntu-22.04", "debian-12"],
};

/** Tags as provider-safe strings: DigitalOcean tags are single words, Hetzner labels key=value. */
export const INSTANCE_TAG_KEYS = { serverId: "inveon-server-id", orgId: "inveon-org-id", managedBy: "inveon-managed-by" } as const;
