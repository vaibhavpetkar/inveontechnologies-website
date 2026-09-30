import type { PracticeUnit } from "../../types.js";
import { jsq, pyq, shq, yq } from "./shared.js";

const cfnVersion = { match: String.raw`AWSTemplateFormatVersion:\s*["']?2010-09-09`, message: "Declares AWSTemplateFormatVersion 2010-09-09" };
const typeOf = (t: string, what: string) => ({ match: String.raw`Type:\s*${t.replace(/::/g, "::")}\b`, message: `Has a ${what} (${t})` });

export const vpc: PracticeUnit = {
  key: "vpc",
  title: "VPC networking",
  summary: "VPCs, CIDR blocks, public and private subnets, route tables, internet and NAT gateways, security groups vs NACLs, VPC endpoints, built with the CLI and CloudFormation",
  reading: String.raw`## Your own network in AWS

A VPC (Virtual Private Cloud) is a private network in one region. Every EC2 instance, RDS database and load balancer lives in a subnet of a VPC. Every region has a default VPC for quick tests; for real projects you build your own.

## CIDR blocks and subnets

A VPC gets an IP range written in CIDR notation, like 10.0.0.0/16. The number after the slash is how many bits are fixed; the rest are yours. A /16 has 2^(32-16) = 65,536 addresses, a /24 has 256.

- VPC sizes range from /16 (largest) to /28 (smallest). Use private ranges: 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16.
- A subnet is a slice of the VPC range in exactly one availability zone, for example 10.0.1.0/24 in ap-south-1a.
- AWS reserves 5 addresses in every subnet (the network address, the VPC router, DNS, one for future use and the broadcast address), so a /24 gives 251 usable IPs.
- Plan ranges that don't overlap with your office network or other VPCs, or you can never connect them with peering, Transit Gateway or a VPN.

## Public and private subnets

What makes a subnet public is only its route table:

- Public subnet: its route table has 0.0.0.0/0 pointing to an internet gateway (IGW). Instances also need a public IP. Put load balancers and bastion or NAT resources here.
- Private subnet: no route to the IGW. Put app servers and databases here. For outgoing internet access (updates, calling APIs) route 0.0.0.0/0 to a NAT gateway that sits in a public subnet. The NAT lets traffic out but nothing in.
- Every route table has a local route for the VPC's own range, so all subnets can talk to each other.

A NAT gateway is billed per hour and per GB, and lives in one AZ. For high availability create one per AZ; for a cheap lab, one is enough.

## Security groups and NACLs

- Security groups attach to instances and are stateful; they only have allow rules.
- Network ACLs attach to subnets, are stateless (you must allow reply traffic on ephemeral ports 1024-65535), have numbered allow and deny rules, and are evaluated in order. Leave the default NACL (allow all) unless you need a subnet-wide block list.

## VPC endpoints

Instances in private subnets reach S3 and DynamoDB through a gateway endpoint (free) instead of paying for NAT traffic. Other services use interface endpoints (PrivateLink).

## Building it with CloudFormation

` + "```yaml" + String.raw`
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsSupport: true
      EnableDnsHostnames: true
  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [0, !GetAZs ""]
      MapPublicIpOnLaunch: true
  InternetGateway:
    Type: AWS::EC2::InternetGateway
  GatewayAttachment:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref Vpc
      InternetGatewayId: !Ref InternetGateway
` + "```" + String.raw`

- !Ref returns a resource's ID; !GetAtt Resource.Attribute returns another attribute; !Sub builds strings with variables like ${"$"}{AWS::Region}.
- A route to an internet gateway needs DependsOn: GatewayAttachment, or CloudFormation may create it before the gateway is attached.
- YAML uses spaces, never tabs, and 2 spaces per level.

## The CLI way

` + "```bash" + String.raw`
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)
SUBNET_ID=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.1.0/24 \
  --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
` + "```" + String.raw`

Capturing IDs in variables with --query ... --output text is how scripts chain commands.

## Common mistakes

- Launching a web server in a subnet whose route table has no internet gateway route, then wondering why it can't be reached.
- Putting the NAT gateway in a private subnet (it must be in a public one).
- Overlapping CIDR ranges that block peering later.
- A /28 VPC that runs out of IPs when the app grows.

## How the assignments are checked

CloudFormation templates are .yaml files: the reviewer checks YAML layout (spaces, a space after every colon) and the rules look for the right resource types, properties and references. CLI sheets are .sh files. CIDR calculators and the route lookup are Python and Node programs run against hidden inputs.`,
  questions: [
    yq("VPC with public and private subnets", "Write a CloudFormation template for a VPC 10.0.0.0/16 with DNS host names, a public subnet 10.0.1.0/24 and a private subnet 10.0.2.0/24, both in the region's first AZ.", ["Resources: Vpc (AWS::EC2::VPC) with EnableDnsSupport and EnableDnsHostnames true", "PublicSubnet with MapPublicIpOnLaunch: true, PrivateSubnet without it", "Both subnets use VpcId: !Ref Vpc and AvailabilityZone: !Select [0, !GetAZs \"\"]"], String.raw`AWSTemplateFormatVersion: "2010-09-09"
Description: VPC with one public and one private subnet
Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: intern-vpc
  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [0, !GetAZs ""]
      MapPublicIpOnLaunch: true
  PrivateSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: 10.0.2.0/24
      AvailabilityZone: !Select [0, !GetAZs ""]
`, [
      cfnVersion,
      typeOf("AWS::EC2::VPC", "VPC"),
      { match: String.raw`CidrBlock:\s*10\.0\.0\.0/16`, message: "The VPC uses 10.0.0.0/16" },
      { match: String.raw`EnableDnsHostnames:\s*true`, message: "Turns on DNS host names" },
      { match: String.raw`CidrBlock:\s*10\.0\.1\.0/24[\s\S]*?MapPublicIpOnLaunch:\s*true|MapPublicIpOnLaunch:\s*true[\s\S]*?CidrBlock:\s*10\.0\.1\.0/24`, message: "The public subnet 10.0.1.0/24 maps public IPs" },
      { match: String.raw`CidrBlock:\s*10\.0\.2\.0/24`, message: "Has the private subnet 10.0.2.0/24" },
      { match: String.raw`(VpcId:\s*!Ref\s+Vpc[\s\S]*){2}`, message: "Both subnets reference the VPC with !Ref" },
    ]),

    yq("Internet gateway and public route table", "Add internet access for the public subnet: an internet gateway attached to the VPC, a route table with a default route to it, and the association with PublicSubnet. (Assume Vpc and PublicSubnet exist in the same template; write only these resources under Resources.)", ["InternetGateway (AWS::EC2::InternetGateway) and GatewayAttachment (AWS::EC2::VPCGatewayAttachment)", "PublicRouteTable (AWS::EC2::RouteTable)", "PublicRoute (AWS::EC2::Route) with DestinationCidrBlock 0.0.0.0/0, GatewayId !Ref InternetGateway and DependsOn: GatewayAttachment", "PublicSubnetRouteTableAssociation (AWS::EC2::SubnetRouteTableAssociation)"], String.raw`AWSTemplateFormatVersion: "2010-09-09"
Resources:
  InternetGateway:
    Type: AWS::EC2::InternetGateway
  GatewayAttachment:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref Vpc
      InternetGatewayId: !Ref InternetGateway
  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref Vpc
  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: GatewayAttachment
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway
  PublicSubnetRouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet
      RouteTableId: !Ref PublicRouteTable
`, [
      typeOf("AWS::EC2::InternetGateway", "internet gateway"),
      typeOf("AWS::EC2::VPCGatewayAttachment", "gateway attachment"),
      { match: String.raw`DestinationCidrBlock:\s*0\.0\.0\.0/0`, message: "Adds a default route 0.0.0.0/0" },
      { match: String.raw`GatewayId:\s*!Ref\s+InternetGateway`, message: "Points the route at the internet gateway" },
      { match: String.raw`DependsOn:\s*GatewayAttachment`, message: "The route waits for the attachment (DependsOn)" },
      typeOf("AWS::EC2::SubnetRouteTableAssociation", "route table association"),
    ], { level: "intermediate" }),

    yq("NAT gateway for private subnets", "Give the private subnet outbound internet access through a NAT gateway placed in the public subnet. (Assume Vpc, PublicSubnet and PrivateSubnet exist.)", ["NatEip: AWS::EC2::EIP with Domain: vpc", "NatGateway: AWS::EC2::NatGateway with AllocationId !GetAtt NatEip.AllocationId and SubnetId !Ref PublicSubnet", "PrivateRouteTable, a PrivateRoute 0.0.0.0/0 with NatGatewayId !Ref NatGateway, and the association with PrivateSubnet"], String.raw`AWSTemplateFormatVersion: "2010-09-09"
Resources:
  NatEip:
    Type: AWS::EC2::EIP
    Properties:
      Domain: vpc
  NatGateway:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatEip.AllocationId
      SubnetId: !Ref PublicSubnet
  PrivateRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref Vpc
  PrivateRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway
  PrivateSubnetRouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet
      RouteTableId: !Ref PrivateRouteTable
`, [
      { match: String.raw`Type:\s*AWS::EC2::EIP\b[\s\S]*?Domain:\s*vpc`, message: "Allocates an Elastic IP for the VPC" },
      typeOf("AWS::EC2::NatGateway", "NAT gateway"),
      { match: String.raw`AllocationId:\s*!GetAtt\s+NatEip\.AllocationId`, message: "Uses the EIP's AllocationId with !GetAtt" },
      { match: String.raw`Type:\s*AWS::EC2::NatGateway[\s\S]*?SubnetId:\s*!Ref\s+PublicSubnet`, message: "Places the NAT gateway in the public subnet" },
      { match: String.raw`NatGatewayId:\s*!Ref\s+NatGateway`, message: "Routes 0.0.0.0/0 to the NAT gateway" },
      { match: String.raw`SubnetId:\s*!Ref\s+PrivateSubnet`, message: "Associates the private subnet" },
    ], { level: "intermediate" }),

    yq("Chained security groups", "Write the security groups for a three-tier app: the load balancer takes HTTPS from anywhere, the app servers take port 8080 only from the load balancer's group, and the database takes 5432 only from the app servers' group. (Assume Vpc exists.)", ["AlbSecurityGroup: ingress tcp 443 from CidrIp 0.0.0.0/0", "AppSecurityGroup: ingress tcp 8080 with SourceSecurityGroupId !Ref AlbSecurityGroup", "DbSecurityGroup: ingress tcp 5432 with SourceSecurityGroupId !Ref AppSecurityGroup", "Each needs a GroupDescription and VpcId"], String.raw`AWSTemplateFormatVersion: "2010-09-09"
Resources:
  AlbSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: HTTPS from the internet
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
  AppSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: App servers, only from the load balancer
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 8080
          ToPort: 8080
          SourceSecurityGroupId: !Ref AlbSecurityGroup
  DbSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: PostgreSQL, only from the app servers
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 5432
          ToPort: 5432
          SourceSecurityGroupId: !Ref AppSecurityGroup
`, [
      { match: String.raw`(Type:\s*AWS::EC2::SecurityGroup\b[\s\S]*){3}`, message: "Defines three security groups" },
      { match: String.raw`FromPort:\s*443\s+ToPort:\s*443\s+CidrIp:\s*0\.0\.0\.0/0`, message: "The load balancer allows 443 from anywhere" },
      { match: String.raw`FromPort:\s*8080\s+ToPort:\s*8080\s+SourceSecurityGroupId:\s*!Ref\s+AlbSecurityGroup`, message: "The app allows 8080 only from the load balancer group" },
      { match: String.raw`FromPort:\s*5432\s+ToPort:\s*5432\s+SourceSecurityGroupId:\s*!Ref\s+AppSecurityGroup`, message: "The database allows 5432 only from the app group" },
      { notMatch: String.raw`FromPort:\s*(5432|8080)\s+ToPort:\s*\d+\s+CidrIp:\s*0\.0\.0\.0/0`, message: "The app and database ports are not open to the internet" },
    ], { level: "intermediate" }),

    yq("Gateway endpoint for S3", "Let the private subnets reach S3 without the NAT gateway by adding a gateway VPC endpoint to the private route table. (Assume Vpc and PrivateRouteTable exist.)", ["S3Endpoint: AWS::EC2::VPCEndpoint", "ServiceName: !Sub com.amazonaws.${AWS::Region}.s3", "VpcEndpointType: Gateway, VpcId !Ref Vpc", "RouteTableIds: a list containing !Ref PrivateRouteTable"], String.raw`AWSTemplateFormatVersion: "2010-09-09"
Resources:
  S3Endpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref Vpc
      ServiceName: !Sub com.amazonaws.${"$"}{AWS::Region}.s3
      VpcEndpointType: Gateway
      RouteTableIds:
        - !Ref PrivateRouteTable
`, [
      typeOf("AWS::EC2::VPCEndpoint", "VPC endpoint"),
      { match: String.raw`ServiceName:\s*!Sub\s+["']?com\.amazonaws\.\$\{AWS::Region\}\.s3`, message: "Builds the S3 service name with !Sub and AWS::Region" },
      { match: String.raw`VpcEndpointType:\s*Gateway`, message: "Is a gateway endpoint" },
      { match: String.raw`RouteTableIds:\s*(\n\s*-\s*!Ref\s+PrivateRouteTable|\[\s*!Ref\s+PrivateRouteTable)`, message: "Adds routes to the private route table" },
    ], { level: "advanced" }),

    shq("Build a VPC with the CLI", "Script a VPC with one public subnet using the AWS CLI, capturing each new ID in a variable.", ["VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)", "SUBNET_ID from create-subnet 10.0.1.0/24 in ap-south-1a; IGW_ID from create-internet-gateway; RT_ID from create-route-table", "attach-internet-gateway, create-route 0.0.0.0/0 to the gateway, associate-route-table", "modify-subnet-attribute --map-public-ip-on-launch", "Quote the variables: \"$VPC_ID\""], String.raw`#!/bin/bash
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)
SUBNET_ID=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.1.0/24 \
  --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --vpc-id "$VPC_ID" --internet-gateway-id "$IGW_ID"
RT_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id "$RT_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
aws ec2 associate-route-table --route-table-id "$RT_ID" --subnet-id "$SUBNET_ID"
aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_ID" --map-public-ip-on-launch
`, [
      { match: String.raw`VPC_ID=\$\(aws\s+ec2\s+create-vpc\s+--cidr-block\s+10\.0\.0\.0/16\s+--query\s+Vpc\.VpcId\s+--output\s+text\)`, message: "Creates the VPC and captures its ID" },
      { match: String.raw`create-subnet\s+--vpc-id\s+"\$VPC_ID"\s+--cidr-block\s+10\.0\.1\.0/24`, message: "Creates the subnet in the new VPC" },
      { match: String.raw`attach-internet-gateway\b`, message: "Attaches an internet gateway" },
      { match: String.raw`create-route\s+--route-table-id\s+"\$RT_ID"\s+--destination-cidr-block\s+0\.0\.0\.0/0\s+--gateway-id\s+"\$IGW_ID"`, message: "Adds the default route to the gateway" },
      { match: String.raw`associate-route-table\b`, message: "Associates the route table with the subnet" },
      { match: String.raw`modify-subnet-attribute\b.*--map-public-ip-on-launch`, message: "Turns on public IPs for the subnet" },
    ], { level: "intermediate" }),

    pyq("Usable IPs in a subnet", "AWS reserves 5 addresses in every subnet. Given a prefix length, print how many IPs you can use, or Invalid if AWS doesn't allow that size (subnets must be between /16 and /28).", ["Input: the prefix length, e.g. 24 (or /24)", "Output: the number of usable IPs, or Invalid"], String.raw`text = input().strip().lstrip("/")
prefix = int(text)
if 16 <= prefix <= 28:
    print(2 ** (32 - prefix) - 5)
else:
    print("Invalid")
`, [["24", "251"], ["/28", "11"]], [["16", "65531"], ["20", "4091"], ["30", "Invalid"], ["8", "Invalid"]]),

    pyq("Split a VPC into subnets", "Carve equal subnets out of a VPC range, in order.", ["Input: <vpc cidr> <new prefix> <count>, e.g. 10.0.0.0/16 24 3", "Output: the first <count> subnets, one per line (print only these lines)", "If the VPC can't hold that many, print Not enough space"], String.raw`import ipaddress
from itertools import islice

cidr, prefix, count = input().split()
net = ipaddress.ip_network(cidr)
prefix, count = int(prefix), int(count)
if 2 ** (prefix - net.prefixlen) < count:
    print("Not enough space")
else:
    for sub in islice(net.subnets(new_prefix=prefix), count):
        print(sub)
`, [["10.0.0.0/16 24 3", "10.0.0.0/24\n10.0.1.0/24\n10.0.2.0/24"], ["10.0.0.0/24 26 4", "10.0.0.0/26\n10.0.0.64/26\n10.0.0.128/26\n10.0.0.192/26"]], [["172.16.0.0/20 22 2", "172.16.0.0/22\n172.16.4.0/22"], ["192.168.0.0/24 26 5", "Not enough space"]], { level: "intermediate", match: "exact" }),

    pyq("Can the VPCs be peered", "VPC peering only works when the two CIDR ranges don't overlap. Print Overlap or No overlap.", ["Input line 1: the first CIDR", "Input line 2: the second CIDR", "Output: Overlap or No overlap"], String.raw`import ipaddress

a = ipaddress.ip_network(input().strip())
b = ipaddress.ip_network(input().strip())
print("Overlap" if a.overlaps(b) else "No overlap")
`, [["10.0.0.0/16\n10.1.0.0/16", "No overlap"], ["10.0.0.0/16\n10.0.128.0/20", "Overlap", ["no"]]], [["172.16.0.0/12\n172.31.0.0/16", "Overlap", ["no"]], ["192.168.0.0/24\n192.168.1.0/24", "No overlap"], ["10.0.0.0/8\n10.255.255.0/24", "Overlap", ["no"]]], { level: "intermediate" }),

    jsq("Route table lookup", "A route table sends each packet to the most specific matching route (the longest prefix). Given the routes and a destination IP, print the target.", ["Input line 1: JSON array of {\"Destination\": \"cidr\", \"Target\": \"...\"}", "Input line 2: the destination IPv4 address", "Output: the Target of the longest matching prefix, or no route", "Don't use a library: convert addresses to numbers yourself"], String.raw`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const routes = JSON.parse(lines[0]);
const toNumber = (ip) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
const ip = toNumber(lines[1].trim());
let best = null;
let bestLength = -1;
for (const r of routes) {
  const [base, lengthText] = r.Destination.split("/");
  const length = Number(lengthText);
  const size = 2 ** (32 - length);
  const start = Math.floor(toNumber(base) / size) * size;
  if (ip >= start && ip < start + size && length > bestLength) {
    best = r.Target;
    bestLength = length;
  }
}
console.log(best ?? "no route");
`, [[`[{"Destination":"10.0.0.0/16","Target":"local"},{"Destination":"0.0.0.0/0","Target":"igw-0abc"}]\n10.0.5.20`, "local"], [`[{"Destination":"10.0.0.0/16","Target":"local"},{"Destination":"0.0.0.0/0","Target":"igw-0abc"}]\n8.8.8.8`, "igw-0abc"]], [[`[{"Destination":"10.0.0.0/16","Target":"local"},{"Destination":"10.1.0.0/16","Target":"pcx-11"},{"Destination":"10.1.2.0/24","Target":"tgw-22"},{"Destination":"0.0.0.0/0","Target":"nat-33"}]\n10.1.2.9`, "tgw-22"], [`[{"Destination":"10.0.0.0/16","Target":"local"}]\n192.168.1.1`, "no route"], [`[{"Destination":"10.0.0.0/16","Target":"local"},{"Destination":"10.1.0.0/16","Target":"pcx-11"},{"Destination":"0.0.0.0/0","Target":"nat-33"}]\n10.1.200.1`, "pcx-11"]], { level: "advanced", match: "exact" }),
  ],
  quiz: [
    { q: "What makes a subnet public?", options: ["Its name contains public", "Its route table has a 0.0.0.0/0 route to an internet gateway", "It has a NAT gateway inside it", "It is in the first AZ"], answer: 1, why: "Public vs private is decided only by the route table (plus instances needing a public IP)." },
    { q: "How many usable IP addresses does a /24 subnet have in AWS?", options: ["256", "254", "251", "250"], answer: 2, why: "AWS reserves 5 addresses in every subnet: 256 - 5 = 251." },
    { q: "Where must a NAT gateway be placed?", options: ["In a private subnet", "In a public subnet", "Outside the VPC", "In every subnet"], answer: 1, why: "The NAT gateway needs internet access through the IGW, so it lives in a public subnet and private subnets route to it." },
    { q: "Which statement about network ACLs is true?", options: ["They are stateful", "They are stateless, so reply traffic must be allowed explicitly", "They attach to instances", "They only have allow rules"], answer: 1, why: "NACLs don't track connections, have allow and deny rules, and attach to subnets." },
    { q: "Which is the cheapest way for private instances to reach S3?", options: ["A NAT gateway", "A gateway VPC endpoint for S3", "A public IP on each instance", "A VPN"], answer: 1, why: "Gateway endpoints for S3 and DynamoDB are free and keep traffic inside AWS." },
    { q: "What does !GetAtt NatEip.AllocationId return in CloudFormation?", options: ["The EIP's logical name", "The AllocationId attribute of the NatEip resource", "The public IP as text", "The region"], answer: 1, why: "!GetAtt reads an attribute of a resource; !Ref usually returns its main ID." },
    { q: "A VPC is 10.0.0.0/16. Which subnet CIDR is invalid in it?", options: ["10.0.0.0/24", "10.0.255.0/24", "10.1.0.0/24", "10.0.128.0/20"], answer: 2, why: "10.1.0.0/24 is outside 10.0.0.0 - 10.0.255.255, so it can't be a subnet of that VPC." },
    { q: "Why add DependsOn: GatewayAttachment to a route that targets an internet gateway?", options: ["It makes the route faster", "A route to an IGW fails if the gateway is not attached to the VPC yet, and CloudFormation can't infer that order from !Ref", "It is required for every resource", "It deletes the gateway first"], answer: 1, why: "The route references the gateway, not the attachment, so the explicit DependsOn forces the right creation order." },
    { q: "Instances in a private subnet can't install packages although a NAT gateway exists. The private route table has only the local route. What is missing?", options: ["An internet gateway in the private subnet", "A 0.0.0.0/0 route in the private route table pointing to the NAT gateway", "A public IP on each instance", "A VPC endpoint for yum"], answer: 1, why: "Traffic only uses the NAT if the subnet's route table sends 0.0.0.0/0 to it." },
    { q: "A route table has 10.0.0.0/16 local, 10.0.8.0/22 to a peering connection and 0.0.0.0/0 to a NAT. Where does a packet to 10.0.9.4 go?", options: ["local", "The peering connection", "The NAT gateway", "It is dropped"], answer: 1, why: "10.0.9.4 matches all three routes; the longest prefix (/22, the peering route) wins." },
  ],
};
