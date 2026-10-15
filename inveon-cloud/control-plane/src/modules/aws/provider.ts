/**
 * The small slice of AWS that launching servers needs. The real
 * implementation (sdk.ts) uses the AWS SDK v3; tests swap in a fake with
 * setEc2ApiFactory, so the suite never calls AWS.
 */

export type AwsCredentialsInput =
  | { authType: "role"; roleArn: string; externalId: string }
  | { authType: "keys"; accessKeyId: string; secretAccessKey: string };

export type Arch = "x86_64" | "arm64";

export interface RunInstanceInput {
  name: string;
  amiId: string;
  instanceType: string;
  diskGb: number;
  securityGroupId: string;
  subnetId?: string;
  keyName?: string;
  instanceProfile?: string;
  /** Plain text; the implementation base64-encodes it. */
  userData: string;
  tags: Record<string, string>;
}

export interface InstanceInfo {
  instanceId: string;
  /** EC2 state name: pending, running, shutting-down, terminated, stopping, stopped. */
  state: string;
  publicIp: string | null;
  privateIp: string | null;
  tags: Record<string, string>;
}

export interface Ec2Api {
  /** sts:GetCallerIdentity with these credentials. */
  verify(): Promise<{ accountId: string; arn: string }>;
  /** The current Ubuntu 24.04 LTS AMI, from Canonical's public SSM parameter. */
  ubuntuAmi(arch: Arch): Promise<string>;
  defaultVpcId(): Promise<string | null>;
  subnetVpcId(subnetId: string): Promise<string>;
  listSecurityGroups(): Promise<{ id: string; name: string; vpcId: string | null }[]>;
  listKeyPairs(): Promise<string[]>;
  createSecurityGroup(input: { name: string; description: string; vpcId: string; sshCidr?: string; tags: Record<string, string> }): Promise<string>;
  deleteSecurityGroup(id: string): Promise<void>;
  runInstance(input: RunInstanceInput): Promise<{ instanceId: string }>;
  /** Missing instances are left out of the result. */
  describeInstances(ids: string[]): Promise<InstanceInfo[]>;
  terminateInstance(id: string): Promise<void>;
}

export type Ec2ApiFactory = (creds: AwsCredentialsInput, region: string) => Ec2Api;

let factory: Ec2ApiFactory | null = null;

export function setEc2ApiFactory(f: Ec2ApiFactory | null) {
  factory = f;
}

export async function ec2Api(creds: AwsCredentialsInput, region: string): Promise<Ec2Api> {
  if (factory) return factory(creds, region);
  // Loaded on first use so the SDK isn't imported unless AWS is used.
  const { sdkEc2Api } = await import("./sdk.js");
  return sdkEc2Api(creds, region);
}
