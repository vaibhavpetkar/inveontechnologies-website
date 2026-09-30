import type { PracticeUnit } from "../../types.js";
import { jsq, pyq, shq } from "./shared.js";

export const ec2: PracticeUnit = {
  key: "ec2",
  title: "EC2: virtual servers",
  summary: "instance types, AMIs, security groups, key pairs, user data, EBS, launching and managing instances with the AWS CLI and pricing options",
  reading: String.raw`## What EC2 gives you

Amazon EC2 (Elastic Compute Cloud) rents virtual machines called instances. You choose the operating system image, the size, the network and the disk, and you pay per second while the instance runs (the disk is billed even when it is stopped).

## Instance types

A type name like m7g.xlarge has four parts:

- Family: t (burstable, cheap for small or spiky loads), m (general purpose), c (compute optimised), r and x (memory optimised), g and p (GPUs), i (fast local storage).
- Generation: 7 is newer than 6, and newer is usually faster and cheaper.
- Attributes: g means an AWS Graviton (ARM) processor, a means AMD, i means Intel, n means extra networking, d means local NVMe disks.
- Size: nano, micro, small, medium, large, xlarge, 2xlarge ... each step roughly doubles CPU, memory and price.

Graviton types (t4g, m7g, c7g) cost about 20% less for the same work, but your software must run on ARM64.

## AMIs

An Amazon Machine Image is the template for the root disk: the OS plus anything pre-installed. Use the latest Amazon Linux 2023 or Ubuntu 24.04 image. Instead of copying an AMI ID (which differs per region), resolve the latest one through a public SSM parameter:

` + "```bash" + String.raw`
--image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64
` + "```" + String.raw`

You can create your own AMI from a configured instance (aws ec2 create-image) and launch copies of it.

## Security groups

A security group is a stateful firewall around an instance. You only write inbound (ingress) rules for what may come in; replies are allowed automatically. The default outbound rule allows everything.

- Allow 80 and 443 from 0.0.0.0/0 for a public website.
- Allow SSH (22) only from your own IP as a /32, never from 0.0.0.0/0. Better still, use Session Manager or EC2 Instance Connect and open no SSH port at all.
- A rule can name another security group as the source, for example "the database accepts 5432 only from the app-sg group".

## Key pairs and connecting

` + "```bash" + String.raw`
aws ec2 create-key-pair --key-name intern-key --key-type ed25519 \
  --query KeyMaterial --output text > intern-key.pem
chmod 400 intern-key.pem
ssh -i intern-key.pem ec2-user@13.233.10.20
` + "```" + String.raw`

AWS keeps only the public key; if you lose the .pem file you cannot download it again. ssh refuses a key file that others can read, hence chmod 400. The user is ec2-user on Amazon Linux and ubuntu on Ubuntu.

## User data

User data is a script that runs once as root on the first boot. It is the easiest way to install and start software:

` + "```bash" + String.raw`
#!/bin/bash
dnf install -y nginx
systemctl enable --now nginx
echo "<h1>Hello from $(hostname)</h1>" > /usr/share/nginx/html/index.html
` + "```" + String.raw`

It already runs as root, so sudo is not needed. Logs go to /var/log/cloud-init-output.log, the first place to look when a web server does not come up.

## Launching and managing from the CLI

` + "```bash" + String.raw`
aws ec2 run-instances --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.micro --key-name intern-key \
  --security-group-ids sg-0123456789abcdef0 --user-data file://userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-1}]'
aws ec2 describe-instances --filters "Name=instance-state-name,Values=running"
aws ec2 stop-instances --instance-ids i-0abc1234def567890
aws ec2 wait instance-stopped --instance-ids i-0abc1234def567890
` + "```" + String.raw`

Stop keeps the EBS disk (you pay for storage only); terminate deletes the instance and, by default, its root volume. The public IP changes after a stop and start; attach an Elastic IP if it must stay the same.

## Storage and pricing

EBS volumes are network disks (gp3 is the default general-purpose type) and snapshots back them up to S3. Pricing models: On-Demand (no commitment), Savings Plans and Reserved Instances (1 or 3 year commitment, up to about 70% cheaper), and Spot (spare capacity, up to 90% cheaper but AWS can reclaim it with a two-minute warning, so use it for batch jobs that can restart).

## How the assignments are checked

CLI sheets and user-data scripts are .sh files checked for the right commands, options and safe values (for example, SSH is not open to the world). Calculators and parsers are Python or Node programs run against hidden inputs.`,
  questions: [
    shq("Security group for a web server", "Create a security group web-sg in vpc-0a1b2c3d4e5f67890 for a public website, and allow SSH only from the office IP 203.0.113.10.", ["create-security-group with --group-name web-sg, a --description and the --vpc-id", "authorize-security-group-ingress for tcp 80 and 443 from 0.0.0.0/0", "authorize tcp 22 from 203.0.113.10/32 only", "Use the group id sg-0123456789abcdef0 in the ingress commands"], String.raw`#!/bin/bash
aws ec2 create-security-group --group-name web-sg \
  --description "Web server: HTTP, HTTPS and office SSH" \
  --vpc-id vpc-0a1b2c3d4e5f67890
aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 \
  --protocol tcp --port 22 --cidr 203.0.113.10/32
`, [
      { match: String.raw`create-security-group\s+--group-name\s+web-sg[\s\S]*?--description[\s\S]*?--vpc-id\s+vpc-0a1b2c3d4e5f67890`, message: "Creates web-sg with a description in the VPC" },
      { match: String.raw`--port\s+80\s+--cidr\s+0\.0\.0\.0/0`, message: "Opens port 80 to everyone" },
      { match: String.raw`--port\s+443\s+--cidr\s+0\.0\.0\.0/0`, message: "Opens port 443 to everyone" },
      { match: String.raw`--port\s+22\s+--cidr\s+203\.0\.113\.10/32`, message: "Allows SSH from the office IP only" },
      { notMatch: String.raw`--port\s+22\s+--cidr\s+0\.0\.0\.0/0`, message: "SSH is not open to the whole internet" },
    ]),

    shq("Create a key pair and connect", "Create an ED25519 key pair called intern-key, save the private key safely, and connect to an Amazon Linux instance at 13.233.10.20.", ["create-key-pair with --key-type ed25519, --query KeyMaterial and --output text, redirected to intern-key.pem", "chmod 400 the file", "ssh with -i as ec2-user"], String.raw`#!/bin/bash
aws ec2 create-key-pair --key-name intern-key --key-type ed25519 \
  --query KeyMaterial --output text > intern-key.pem
chmod 400 intern-key.pem
ssh -i intern-key.pem ec2-user@13.233.10.20
`, [
      { match: String.raw`create-key-pair\s+--key-name\s+intern-key`, message: "Creates the key pair intern-key" },
      { match: String.raw`--key-type\s+ed25519`, message: "Uses the ed25519 key type" },
      { match: String.raw`--query\s+["']?KeyMaterial["']?\s+--output\s+text\s*>\s*intern-key\.pem`, message: "Saves KeyMaterial as text to intern-key.pem" },
      { match: String.raw`chmod\s+(400|600)\s+intern-key\.pem`, message: "Makes the key readable only by you" },
      { match: String.raw`ssh\s+-i\s+intern-key\.pem\s+ec2-user@13\.233\.10\.20`, message: "Connects as ec2-user with the key" },
    ]),

    shq("User data for a web server", "Write the user-data script for an Amazon Linux 2023 instance that installs nginx, starts it now and on every boot, and replaces the home page with a heading that shows the host name.", ["Start with the #!/bin/bash shebang (user data needs it)", "Install nginx with dnf and -y", "Enable and start the service with systemctl", "Write <h1>...$(hostname)...</h1> to /usr/share/nginx/html/index.html", "No sudo: user data already runs as root"], String.raw`#!/bin/bash
dnf update -y
dnf install -y nginx
systemctl enable --now nginx
echo "<h1>Served by $(hostname)</h1>" > /usr/share/nginx/html/index.html
`, [
      { match: String.raw`^#!/bin/(ba)?sh`, message: "Starts with a shebang" },
      { match: String.raw`dnf\s+install\s+(-y\s+nginx|nginx\s+-y)`, message: "Installs nginx without prompting" },
      { match: String.raw`systemctl\s+enable\s+--now\s+nginx|systemctl\s+enable\s+nginx[\s\S]*systemctl\s+start\s+nginx`, message: "Enables and starts nginx" },
      { match: String.raw`\$\(hostname\)[\s\S]*>\s*/usr/share/nginx/html/index\.html`, message: "Writes a page with the host name to index.html" },
      { notMatch: String.raw`\bsudo\b`, message: "Doesn't use sudo (user data runs as root)" },
    ]),

    shq("Launch an instance with the CLI", "Launch one t3.micro web server from the latest Amazon Linux 2023 AMI with your key, security group, subnet, role and user data, tagged Name=web-1.", ["--image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64", "--instance-type t3.micro --count 1 --key-name intern-key", "--security-group-ids sg-0123456789abcdef0 --subnet-id subnet-0aa11bb22cc33dd44", "--iam-instance-profile Name=app-profile --user-data file://userdata.sh", "--tag-specifications for the instance with Name=web-1 (quote it)"], String.raw`#!/bin/bash
aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.micro --count 1 \
  --key-name intern-key \
  --security-group-ids sg-0123456789abcdef0 \
  --subnet-id subnet-0aa11bb22cc33dd44 \
  --iam-instance-profile Name=app-profile \
  --user-data file://userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-1}]'
`, [
      { match: String.raw`aws\s+ec2\s+run-instances\b`, message: "Uses ec2 run-instances" },
      { match: String.raw`--image-id\s+resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64`, message: "Resolves the latest AL2023 AMI from SSM" },
      { match: String.raw`--instance-type\s+t3\.micro`, message: "Uses t3.micro" },
      { match: String.raw`--security-group-ids\s+sg-0123456789abcdef0[\s\S]*--subnet-id\s+subnet-0aa11bb22cc33dd44|--subnet-id\s+subnet-0aa11bb22cc33dd44[\s\S]*--security-group-ids\s+sg-0123456789abcdef0`, message: "Sets the security group and subnet" },
      { match: String.raw`--iam-instance-profile\s+Name=app-profile`, message: "Attaches the instance profile" },
      { match: String.raw`--user-data\s+file://userdata\.sh`, message: "Passes the user-data file" },
      { match: String.raw`ResourceType=instance,Tags=\[\{Key=Name,Value=web-1\}\]`, message: "Tags the instance Name=web-1" },
    ], { level: "intermediate" }),

    shq("Find and stop dev instances", "List the running instances tagged Env=dev as a table of id, type and public IP, then stop two of them and wait until they have stopped.", ["describe-instances with two --filters: instance-state-name running and tag:Env dev", "--query \"Reservations[].Instances[].[InstanceId,InstanceType,PublicIpAddress]\" --output table", "stop-instances for i-0aaa1111bbbb2222c and i-0ddd3333eeee4444f", "aws ec2 wait instance-stopped for the same ids"], String.raw`#!/bin/bash
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" "Name=tag:Env,Values=dev" \
  --query "Reservations[].Instances[].[InstanceId,InstanceType,PublicIpAddress]" \
  --output table
aws ec2 stop-instances --instance-ids i-0aaa1111bbbb2222c i-0ddd3333eeee4444f
aws ec2 wait instance-stopped --instance-ids i-0aaa1111bbbb2222c i-0ddd3333eeee4444f
`, [
      { match: String.raw`Name=instance-state-name,Values=running`, message: "Filters on the running state" },
      { match: String.raw`Name=tag:Env,Values=dev`, message: "Filters on the tag Env=dev" },
      { match: String.raw`Reservations\[\]\.Instances\[\]\.\[InstanceId,InstanceType,PublicIpAddress\]`, message: "Picks id, type and public IP with --query" },
      { match: String.raw`stop-instances\s+--instance-ids\s+i-0aaa1111bbbb2222c\s+i-0ddd3333eeee4444f`, message: "Stops both instances" },
      { match: String.raw`aws\s+ec2\s+wait\s+instance-stopped\b`, message: "Waits until they have stopped" },
    ], { level: "intermediate" }),

    shq("Back up and resize an instance", "The instance i-0abc1234def567890 needs more memory. Take an AMI backup, stop it, change the type to t3.medium and start it again.", ["create-image with --name web-backup-v1 and --no-reboot", "stop-instances, then wait instance-stopped", "modify-instance-attribute with --instance-type t3.medium (it only works on a stopped instance)", "start-instances at the end"], String.raw`#!/bin/bash
ID=i-0abc1234def567890
aws ec2 create-image --instance-id "$ID" --name web-backup-v1 --no-reboot
aws ec2 stop-instances --instance-ids "$ID"
aws ec2 wait instance-stopped --instance-ids "$ID"
aws ec2 modify-instance-attribute --instance-id "$ID" --instance-type t3.medium
aws ec2 start-instances --instance-ids "$ID"
`, [
      { match: String.raw`create-image\b[\s\S]*?--name\s+web-backup-v1`, message: "Creates the AMI web-backup-v1" },
      { match: String.raw`stop-instances\b[\s\S]*wait\s+instance-stopped[\s\S]*modify-instance-attribute`, message: "Stops and waits before changing the type" },
      { match: String.raw`modify-instance-attribute\b.*--instance-type\s+("?\{?\s*\\?"?Value\\?"?\s*:\s*\\?"?)?t3\.medium`, message: "Changes the type to t3.medium" },
      { match: String.raw`modify-instance-attribute[\s\S]*start-instances`, message: "Starts the instance again at the end" },
    ], { level: "intermediate" }),

    pyq("Decode an instance type", "Split an EC2 instance type into family, generation, attributes and size.", ["Input: one type like m7g.xlarge, c7gn.2xlarge or t3.micro", "The family is the letters before the first digit, the generation is the digits, the attributes are any letters after them, and the size is after the dot", "Output 4 lines exactly: Family: x, Generation: n, Attributes: x (none when empty), Size: x"], String.raw`import re

itype = input().strip()
name, size = itype.split(".", 1)
m = re.fullmatch(r"([a-z]+)(\d+)([a-z-]*)", name)
family, generation, attributes = m.groups()
print("Family:", family)
print("Generation:", generation)
print("Attributes:", attributes or "none")
print("Size:", size)
`, [["m7g.xlarge", "Family: m\nGeneration: 7\nAttributes: g\nSize: xlarge"], ["t3.micro", "Family: t\nGeneration: 3\nAttributes: none\nSize: micro"]], [["c7gn.2xlarge", "Family: c\nGeneration: 7\nAttributes: gn\nSize: 2xlarge"], ["r6id.metal", "Family: r\nGeneration: 6\nAttributes: id\nSize: metal"], ["inf2.48xlarge", "Family: inf\nGeneration: 2\nAttributes: none\nSize: 48xlarge"]], { level: "intermediate", match: "exact" }),

    pyq("Does the security group allow it", "A security group has inbound rules of a port and a CIDR range. Decide whether a connection to a port from an IP address is allowed.", ["Input line 1: n, the number of rules", "Next n lines: <port> <cidr>, e.g. 22 203.0.113.0/24", "Last line: <port> <ip> of the connection", "Output: Allowed or Blocked"], String.raw`import ipaddress

n = int(input())
rules = []
for _ in range(n):
    port, cidr = input().split()
    rules.append((int(port), ipaddress.ip_network(cidr)))
port, ip = input().split()
port = int(port)
address = ipaddress.ip_address(ip)
allowed = any(p == port and address in net for p, net in rules)
print("Allowed" if allowed else "Blocked")
`, [["2\n80 0.0.0.0/0\n22 203.0.113.0/24\n22 203.0.113.77", "Allowed", ["blocked"]], ["2\n80 0.0.0.0/0\n22 203.0.113.0/24\n22 198.51.100.4", "Blocked", ["allowed"]]], [["1\n443 10.0.0.0/16\n443 10.0.255.255", "Allowed", ["blocked"]], ["1\n443 10.0.0.0/16\n80 10.0.1.5", "Blocked", ["allowed"]], ["0\n22 1.2.3.4", "Blocked", ["allowed"]]], { level: "intermediate" }),

    pyq("On-Demand or Savings Plan", "A Compute Savings Plan charges its hourly rate for all 730 hours of the month whether you use them or not. Given the On-Demand rate, the Savings Plan rate and the hours you really run the server, print the monthly cost of each and the cheaper choice.", ["Input line 1: On-Demand price per hour", "Input line 2: Savings Plan price per hour", "Input line 3: hours used in the month (0 to 730)", "Output line 1: On-Demand: <cost with 2 decimals>", "Output line 2: Savings Plan: <cost with 2 decimals>", "Output line 3: Choose: On-Demand or Choose: Savings Plan (On-Demand when equal)"], String.raw`on_demand = float(input())
plan = float(input())
hours = float(input())
od_cost = on_demand * hours
plan_cost = plan * 730
print(f"On-Demand: {od_cost:.2f}")
print(f"Savings Plan: {plan_cost:.2f}")
if plan_cost < od_cost:
    print("Choose: Savings Plan")
else:
    print("Choose: On-Demand")
`, [["0.0416\n0.026\n730", "On-Demand: 30.37\nSavings Plan: 18.98\nChoose: Savings Plan", ["demand"]], ["0.0416\n0.026\n300", "On-Demand: 12.48\nSavings Plan: 18.98\nChoose: On-Demand", ["savings", "plan"]]], [["0.1\n0.05\n365", "On-Demand: 36.50\nSavings Plan: 36.50\nChoose: On-Demand", ["savings", "plan"]], ["0.2\n0.12\n500", "On-Demand: 100.00\nSavings Plan: 87.60\nChoose: Savings Plan", ["demand"]]], { level: "intermediate" }),

    jsq("Cheapest instance that fits", "Given a list of instance types with their vCPUs, memory and hourly price, print the cheapest type that has at least the vCPUs and memory you need.", ["Input line 1: JSON array of {\"type\", \"vcpu\", \"memoryGiB\", \"price\"}", "Input line 2: needed vCPUs and memory in GiB, e.g. 2 8", "Output: the type name, or none when nothing fits", "If two fit at the same price, print the one listed first"], String.raw`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const types = JSON.parse(lines[0]);
const [cpu, mem] = lines[1].trim().split(/\s+/).map(Number);
let best = null;
for (const t of types) {
  if (t.vcpu >= cpu && t.memoryGiB >= mem && (best === null || t.price < best.price)) {
    best = t;
  }
}
console.log(best ? best.type : "none");
`, [[`[{"type":"t3.large","vcpu":2,"memoryGiB":8,"price":0.0896},{"type":"m7g.large","vcpu":2,"memoryGiB":8,"price":0.0816},{"type":"c7g.large","vcpu":2,"memoryGiB":4,"price":0.0725}]\n2 8`, "m7g.large", ["none"]]], [[`[{"type":"t3.micro","vcpu":2,"memoryGiB":1,"price":0.0104}]\n4 16`, "none"], [`[{"type":"r7g.large","vcpu":2,"memoryGiB":16,"price":0.1071},{"type":"m7g.xlarge","vcpu":4,"memoryGiB":16,"price":0.1632},{"type":"r6g.large","vcpu":2,"memoryGiB":16,"price":0.1071}]\n2 12`, "r7g.large", ["none"]]], { level: "advanced" }),
  ],
  quiz: [
    { q: "In m7g.xlarge, what does the g mean?", options: ["GPU", "AWS Graviton (ARM) processor", "General purpose", "Gigabit networking"], answer: 1, why: "The attribute letter g after the generation means a Graviton processor; the family letter m means general purpose." },
    { q: "Which pricing model suits a batch job that can be interrupted and restarted?", options: ["On-Demand", "Spot Instances", "Dedicated Hosts", "Reserved Instances"], answer: 1, why: "Spot uses spare capacity at a big discount but can be reclaimed with two minutes' notice." },
    { q: "Why do you run chmod 400 on the .pem file?", options: ["To make it executable", "ssh refuses private keys that other users can read", "AWS requires it to download the key", "It encrypts the file"], answer: 1, why: "OpenSSH rejects a private key with open permissions (\"UNPROTECTED PRIVATE KEY FILE\")." },
    { q: "Security groups are stateful. What does that mean?", options: ["They remember the instance's IP", "Replies to allowed inbound traffic are allowed out automatically", "They save their rules to S3", "They can only be changed when the instance is stopped"], answer: 1, why: "A stateful firewall tracks connections, so you don't write outbound rules for responses." },
    { q: "When does EC2 user data run by default?", options: ["Every time you SSH in", "Once, as root, on the first boot", "Every hour", "Only when you call run-command"], answer: 1, why: "cloud-init runs the user-data script once at first launch, as root." },
    { q: "What happens to the root EBS volume when you stop (not terminate) an instance?", options: ["It is deleted", "It is kept and you keep paying for its storage", "It is moved to S3 Glacier", "It becomes read-only"], answer: 1, why: "Stopping keeps the EBS volume; compute billing stops but storage billing continues." },
    { q: "Why use --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/... instead of an ami- ID?", options: ["It is cheaper", "AMI IDs differ per region and change with every update; the SSM parameter always gives the latest one for the region", "SSM images boot faster", "It skips the security group"], answer: 1, why: "The public parameter resolves to the current AMI ID in whichever region you launch." },
    { q: "Your website on EC2 has no response. The instance is running and nginx is active. What should you check first?", options: ["The AMI", "The security group's inbound rule for port 80 or 443", "The key pair", "The IAM password policy"], answer: 1, why: "If no inbound rule allows the port, the firewall drops the request before it reaches nginx." },
    { q: "A user-data script uses sudo dnf install nginx (without -y) and nginx is never installed. Why?", options: ["sudo is not allowed in user data", "dnf waits for a yes/no answer that nobody gives, so the install is aborted", "nginx is not in the Amazon Linux repositories", "User data only runs on Ubuntu"], answer: 1, why: "Without -y the package manager asks for confirmation; in a non-interactive script it gives up. (sudo is harmless but unnecessary.)" },
    { q: "A database instance's security group allows port 5432 with the source set to the security group app-sg. What does that allow?", options: ["Anyone on the internet", "Only instances that have app-sg attached, from any IP they get", "Only the database itself", "Only IPs in the same /32"], answer: 1, why: "Referencing a security group as the source allows traffic from any network interface that belongs to that group, even when IPs change." },
  ],
};
