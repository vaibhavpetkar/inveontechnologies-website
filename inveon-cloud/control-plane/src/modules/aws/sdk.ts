import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeInstancesCommand,
  DescribeKeyPairsCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  ModifyInstanceAttributeCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  type IpPermission,
  type Tag,
} from "@aws-sdk/client-ec2";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import type { AwsCredentialsInput, Arch, Ec2Api, InstanceInfo } from "./provider.js";

interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * Role mode: the control plane's own credentials (instance role or the
 * default chain) assume the organization's role with its external id, for
 * 15 minutes at a time. Keys mode: the stored access key.
 */
export function credentialProvider(input: AwsCredentialsInput, region: string): () => Promise<Creds> {
  if (input.authType === "keys") {
    const fixed = { accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey };
    return async () => fixed;
  }
  let cached: Creds | null = null;
  return async () => {
    if (cached?.expiration && cached.expiration.getTime() - Date.now() > 60_000) return cached;
    const sts = new STSClient({ region });
    const out = await sts.send(new AssumeRoleCommand({ RoleArn: input.roleArn, ExternalId: input.externalId, RoleSessionName: "inveon-cloud", DurationSeconds: 900 }));
    const c = out.Credentials;
    if (!c?.AccessKeyId || !c.SecretAccessKey) throw new Error("AssumeRole returned no credentials");
    cached = { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken, expiration: c.Expiration };
    return cached;
  };
}

const toTags = (tags: Record<string, string>): Tag[] => Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
const fromTags = (tags: Tag[] | undefined) => Object.fromEntries((tags ?? []).filter((t) => t.Key).map((t) => [t.Key!, t.Value ?? ""]));

export function sdkEc2Api(input: AwsCredentialsInput, region: string): Ec2Api {
  const credentials = credentialProvider(input, region);
  const ec2 = new EC2Client({ region, credentials });
  const ssm = new SSMClient({ region, credentials });
  const sts = new STSClient({ region, credentials });

  return {
    async verify() {
      const out = await sts.send(new GetCallerIdentityCommand({}));
      return { accountId: out.Account ?? "", arn: out.Arn ?? "" };
    },

    async ubuntuAmi(arch: Arch) {
      const name = `/aws/service/canonical/ubuntu/server/24.04/stable/current/${arch === "arm64" ? "arm64" : "amd64"}/hvm/ebs-gp3/ami-id`;
      const out = await ssm.send(new GetParameterCommand({ Name: name }));
      const ami = out.Parameter?.Value;
      if (!ami || !/^ami-[0-9a-f]{8,17}$/.test(ami)) throw new Error("Could not look up the Ubuntu AMI");
      return ami;
    },

    async defaultVpcId() {
      const out = await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: "is-default", Values: ["true"] }] }));
      return out.Vpcs?.[0]?.VpcId ?? null;
    },

    async subnetVpcId(subnetId: string) {
      const out = await ec2.send(new DescribeSubnetsCommand({ SubnetIds: [subnetId] }));
      const vpc = out.Subnets?.[0]?.VpcId;
      if (!vpc) throw new Error(`Subnet ${subnetId} not found`);
      return vpc;
    },

    async listSecurityGroups() {
      const out = await ec2.send(new DescribeSecurityGroupsCommand({ MaxResults: 200 }));
      return (out.SecurityGroups ?? []).map((g) => ({ id: g.GroupId ?? "", name: g.GroupName ?? "", vpcId: g.VpcId ?? null }));
    },

    async listKeyPairs() {
      const out = await ec2.send(new DescribeKeyPairsCommand({}));
      return (out.KeyPairs ?? []).map((k) => k.KeyName ?? "").filter(Boolean);
    },

    async createSecurityGroup({ name, description, vpcId, sshCidr, tags }) {
      const out = await ec2.send(
        new CreateSecurityGroupCommand({ GroupName: name, Description: description, VpcId: vpcId, TagSpecifications: [{ ResourceType: "security-group", Tags: toTags(tags) }] }),
      );
      const id = out.GroupId;
      if (!id) throw new Error("CreateSecurityGroup returned no id");
      const web = (port: number): IpPermission => ({
        IpProtocol: "tcp",
        FromPort: port,
        ToPort: port,
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "web" }],
        Ipv6Ranges: [{ CidrIpv6: "::/0", Description: "web" }],
      });
      const perms: IpPermission[] = [web(80), web(443)];
      if (sshCidr) perms.push({ IpProtocol: "tcp", FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: sshCidr, Description: "ssh" }] });
      await ec2.send(new AuthorizeSecurityGroupIngressCommand({ GroupId: id, IpPermissions: perms }));
      return id;
    },

    async deleteSecurityGroup(id: string) {
      await ec2.send(new DeleteSecurityGroupCommand({ GroupId: id }));
    },

    async runInstance(i) {
      const network = i.subnetId
        ? { NetworkInterfaces: [{ DeviceIndex: 0, SubnetId: i.subnetId, Groups: [i.securityGroupId], AssociatePublicIpAddress: true }] }
        : { SecurityGroupIds: [i.securityGroupId] };
      const out = await ec2.send(
        new RunInstancesCommand({
          ImageId: i.amiId,
          InstanceType: i.instanceType as never,
          MinCount: 1,
          MaxCount: 1,
          KeyName: i.keyName,
          IamInstanceProfile: i.instanceProfile ? { Name: i.instanceProfile } : undefined,
          UserData: Buffer.from(i.userData, "utf8").toString("base64"),
          BlockDeviceMappings: [{ DeviceName: "/dev/sda1", Ebs: { VolumeSize: i.diskGb, VolumeType: "gp3", Encrypted: true, DeleteOnTermination: true } }],
          // IMDSv2 only, and one hop, so containers can't reach the instance's credentials.
          MetadataOptions: { HttpTokens: "required", HttpEndpoint: "enabled", HttpPutResponseHopLimit: 1 },
          TagSpecifications: [
            { ResourceType: "instance", Tags: toTags({ Name: i.name, ...i.tags }) },
            { ResourceType: "volume", Tags: toTags({ Name: i.name, ...i.tags }) },
          ],
          ...network,
        }),
      );
      const id = out.Instances?.[0]?.InstanceId;
      if (!id) throw new Error("RunInstances returned no instance");
      return { instanceId: id };
    },

    async describeInstances(ids: string[]) {
      if (!ids.length) return [];
      const found: InstanceInfo[] = [];
      try {
        const out = await ec2.send(new DescribeInstancesCommand({ InstanceIds: ids }));
        for (const r of out.Reservations ?? []) {
          for (const inst of r.Instances ?? []) {
            found.push({
              instanceId: inst.InstanceId ?? "",
              state: inst.State?.Name ?? "unknown",
              publicIp: inst.PublicIpAddress ?? null,
              privateIp: inst.PrivateIpAddress ?? null,
              instanceType: inst.InstanceType ?? null,
              tags: fromTags(inst.Tags),
            });
          }
        }
      } catch (err) {
        // Long-terminated instances disappear; ask one by one so the rest still resolve.
        if ((err as { name?: string }).name !== "InvalidInstanceID.NotFound" || ids.length === 1) {
          if ((err as { name?: string }).name === "InvalidInstanceID.NotFound") return [];
          throw err;
        }
        for (const id of ids) found.push(...(await this.describeInstances([id])));
      }
      return found;
    },

    async terminateInstance(id: string) {
      await ec2.send(new TerminateInstancesCommand({ InstanceIds: [id] }));
    },

    async stopInstance(id: string) {
      await ec2.send(new StopInstancesCommand({ InstanceIds: [id] }));
    },

    async startInstance(id: string) {
      await ec2.send(new StartInstancesCommand({ InstanceIds: [id] }));
    },

    async modifyInstanceType(id: string, instanceType: string) {
      await ec2.send(new ModifyInstanceAttributeCommand({ InstanceId: id, InstanceType: { Value: instanceType } }));
    },
  };
}
