import type { ExerciseSeed } from "../types.js";

export default [
  {
    title: "S3 bucket in Terraform",
    brief: "Write Terraform that configures the AWS provider for Mumbai and creates one S3 bucket with a Project tag.",
    steps: [
      "provider \"aws\" with region = \"ap-south-1\"",
      "A resource \"aws_s3_bucket\" with any name",
      "Set bucket to a valid bucket name (lowercase letters, numbers, dots and dashes, 3 to 63 characters)",
      "Add tags = { Project = \"portfolio\" }",
    ],
    level: "basic",
    editor: "hcl",
    starter: `provider "aws" {
  # Set the region here
}

# Add the S3 bucket resource here
`,
    solution: `provider "aws" {
  region = "ap-south-1"
}

resource "aws_s3_bucket" "site" {
  bucket = "my-portfolio-site-2026"

  tags = {
    Project = "portfolio"
  }
}
`,
    check: {
      rules: [
        { match: String.raw`provider\s+"aws"\s*\{[^}]*region\s*=\s*"ap-south-1"`, message: "The aws provider uses region ap-south-1" },
        { match: String.raw`resource\s+"aws_s3_bucket"\s+"\w+"\s*\{`, message: "An aws_s3_bucket resource" },
        { match: String.raw`\bbucket\s*=\s*"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"`, message: "bucket is set to a valid bucket name" },
        { match: String.raw`tags\s*=\s*\{[^}]*Project\s*=\s*"portfolio"`, message: "tags include Project = \"portfolio\"" },
      ],
    },
  },
  {
    title: "S3 with the AWS CLI",
    brief: "Write the AWS CLI commands to create a bucket, upload a file, list it and sync a folder.",
    steps: [
      "Make the bucket: aws s3 mb s3://my-reports-bucket-2026",
      "Upload report.pdf into the reports/ folder: aws s3 cp report.pdf s3://my-reports-bucket-2026/reports/",
      "List the reports/ folder with aws s3 ls",
      "Sync the local ./site folder to s3://my-reports-bucket-2026/site with aws s3 sync",
    ],
    level: "basic",
    editor: "shell",
    starter: `# 1. Create the bucket my-reports-bucket-2026

# 2. Upload report.pdf to reports/

# 3. List reports/

# 4. Sync ./site to site/
`,
    solution: `aws s3 mb s3://my-reports-bucket-2026 --region ap-south-1
aws s3 cp report.pdf s3://my-reports-bucket-2026/reports/
aws s3 ls s3://my-reports-bucket-2026/reports/
aws s3 sync ./site s3://my-reports-bucket-2026/site
`,
    check: {
      rules: [
        { match: String.raw`aws\s+s3\s+mb\s+s3://my-reports-bucket-2026/?(\s|$)`, message: "Creates the bucket with aws s3 mb" },
        { match: String.raw`aws\s+s3\s+cp\s+(\./)?report\.pdf\s+s3://my-reports-bucket-2026/reports/`, message: "Uploads report.pdf to reports/ with aws s3 cp" },
        { match: String.raw`aws\s+s3\s+ls\s+s3://my-reports-bucket-2026/reports/?`, message: "Lists reports/ with aws s3 ls" },
        { match: String.raw`aws\s+s3\s+sync\s+(\./)?site/?\s+s3://my-reports-bucket-2026/site/?`, message: "Syncs ./site with aws s3 sync" },
      ],
    },
  },
  {
    title: "Read-only S3 IAM policy",
    brief: "Write an IAM policy (JSON) that lets a user read objects from the company-reports bucket and list it, and nothing else.",
    steps: [
      "\"Version\": \"2012-10-17\" and one statement with \"Effect\": \"Allow\"",
      "Actions: \"s3:GetObject\" and \"s3:ListBucket\" only (no wildcards like s3:*)",
      "Resources: \"arn:aws:s3:::company-reports\" and \"arn:aws:s3:::company-reports/*\"",
    ],
    level: "basic",
    editor: "json",
    starter: `{
  "Version": "2012-10-17",
  "Statement": []
}
`,
    solution: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::company-reports",
        "arn:aws:s3:::company-reports/*"
      ]
    }
  ]
}
`,
    check: {
      rules: [
        { match: String.raw`"Version"\s*:\s*"2012-10-17"`, message: "\"Version\": \"2012-10-17\"" },
        { match: String.raw`"Effect"\s*:\s*"Allow"`, message: "A statement with \"Effect\": \"Allow\"" },
        { match: String.raw`"s3:GetObject"`, message: "Allows s3:GetObject" },
        { match: String.raw`"s3:ListBucket"`, message: "Allows s3:ListBucket" },
        { notMatch: String.raw`"(s3:)?\*"|"s3:(Put|Delete)`, message: "No wildcard, write or delete actions" },
        { match: String.raw`"arn:aws:s3:::company-reports"`, message: "The bucket ARN arn:aws:s3:::company-reports" },
        { match: String.raw`"arn:aws:s3:::company-reports/\*"`, message: "The objects ARN arn:aws:s3:::company-reports/*" },
      ],
    },
  },
  {
    title: "Kubernetes Deployment",
    brief: "Write a Kubernetes Deployment that runs 3 replicas of an nginx container labelled app: web.",
    steps: [
      "apiVersion: apps/v1, kind: Deployment, metadata name web",
      "spec.replicas: 3 and selector.matchLabels app: web",
      "The pod template has labels app: web",
      "One container using an nginx image with containerPort: 80",
    ],
    level: "basic",
    editor: "yaml",
    starter: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  # Add replicas, selector and the pod template here
`,
    solution: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
`,
    check: {
      rules: [
        { match: String.raw`apiVersion:\s*apps/v1`, message: "apiVersion: apps/v1" },
        { match: String.raw`kind:\s*Deployment`, message: "kind: Deployment" },
        { match: String.raw`replicas:\s*3\s*$`, flags: "m", message: "replicas: 3" },
        { match: String.raw`matchLabels:\s*\n\s+app:\s*["']?web["']?\s*$`, flags: "m", message: "selector.matchLabels has app: web" },
        { match: String.raw`template:[\s\S]*\blabels:\s*\n\s+app:\s*["']?web["']?\s*$`, flags: "m", message: "The pod template is labelled app: web" },
        { match: String.raw`containers:\s*\n\s*-[\s\S]*image:\s*["']?nginx`, message: "A container with an nginx image" },
        { match: String.raw`containerPort:\s*80\s*$`, flags: "m", message: "containerPort: 80" },
      ],
    },
  },
  {
    title: "Security group in Terraform",
    brief: "Write an aws_security_group that allows SSH only from your own IP, HTTP from anywhere, and all outbound traffic.",
    steps: [
      "resource \"aws_security_group\" \"web\" with a name",
      "An ingress block for port 22 (from_port and to_port 22, protocol \"tcp\") with cidr_blocks = [\"<your IP>/32\"], never 0.0.0.0/0",
      "An ingress block for port 80 with cidr_blocks = [\"0.0.0.0/0\"]",
      "An egress block with protocol = \"-1\" and cidr_blocks = [\"0.0.0.0/0\"]",
    ],
    level: "intermediate",
    editor: "hcl",
    starter: `resource "aws_security_group" "web" {
  name        = "web-sg"
  description = "Web server firewall"

  # Add the ingress and egress rules here
}
`,
    solution: `resource "aws_security_group" "web" {
  name        = "web-sg"
  description = "Web server firewall"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["203.0.113.10/32"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
`,
    check: {
      rules: [
        { match: String.raw`resource\s+"aws_security_group"\s+"web"\s*\{`, message: "An aws_security_group called web" },
        { match: String.raw`ingress\s*\{(?=[^}]*from_port\s*=\s*22\b)(?=[^}]*to_port\s*=\s*22\b)(?=[^}]*protocol\s*=\s*"tcp")(?=[^}]*cidr_blocks\s*=\s*\[\s*"\d{1,3}(\.\d{1,3}){3}/32"\s*\])[^}]*\}`, message: "SSH (port 22) is allowed from a single IP (/32)" },
        { notMatch: String.raw`ingress\s*\{(?=[^}]*from_port\s*=\s*22\b)(?=[^}]*0\.0\.0\.0/0)[^}]*\}`, message: "SSH is not open to 0.0.0.0/0" },
        { match: String.raw`ingress\s*\{(?=[^}]*from_port\s*=\s*80\b)(?=[^}]*to_port\s*=\s*80\b)(?=[^}]*cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0/0"\s*\])[^}]*\}`, message: "HTTP (port 80) is allowed from 0.0.0.0/0" },
        { match: String.raw`egress\s*\{(?=[^}]*protocol\s*=\s*"-1")(?=[^}]*cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0/0"\s*\])[^}]*\}`, message: "An egress block allowing all outbound traffic" },
      ],
    },
  },
  {
    title: "EC2 instance with variables",
    brief: "Write Terraform for an EC2 instance whose AMI and size come from variables, attached to the web security group, and output its public IP.",
    steps: [
      "variable \"instance_type\" with default = \"t2.micro\", and variable \"ami_id\"",
      "resource \"aws_instance\" \"app\" with ami = var.ami_id and instance_type = var.instance_type",
      "vpc_security_group_ids = [aws_security_group.web.id] and tags with Name = \"app-server\"",
      "output \"public_ip\" with value = aws_instance.app.public_ip",
    ],
    level: "intermediate",
    editor: "hcl",
    starter: `resource "aws_instance" "app" {
  ami           = "ami-0abcdef1234567890"
  instance_type = "t2.micro"
}
`,
    solution: `variable "instance_type" {
  type    = string
  default = "t2.micro"
}

variable "ami_id" {
  type = string
}

resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.web.id]

  tags = {
    Name = "app-server"
  }
}

output "public_ip" {
  value = aws_instance.app.public_ip
}
`,
    check: {
      rules: [
        { match: String.raw`variable\s+"instance_type"\s*\{[^}]*default\s*=\s*"t2\.micro"`, message: "variable instance_type defaults to t2.micro" },
        { match: String.raw`variable\s+"ami_id"\s*\{`, message: "A variable ami_id" },
        { match: String.raw`\bami\s*=\s*var\.ami_id\b`, message: "ami = var.ami_id" },
        { match: String.raw`\binstance_type\s*=\s*var\.instance_type\b`, message: "instance_type = var.instance_type" },
        { match: String.raw`vpc_security_group_ids\s*=\s*\[\s*aws_security_group\.web\.id\s*\]`, message: "Attached to aws_security_group.web.id" },
        { match: String.raw`tags\s*=\s*\{[^}]*Name\s*=\s*"app-server"`, message: "Tagged Name = \"app-server\"" },
        { match: String.raw`output\s+"public_ip"\s*\{[^}]*value\s*=\s*aws_instance\.app\.public_ip\b`, message: "output public_ip = aws_instance.app.public_ip" },
      ],
    },
  },
  {
    title: "Kubernetes Service",
    brief: "Write a Kubernetes Service that exposes the pods labelled app: web on port 80, forwarding to container port 8080, through a cloud load balancer.",
    steps: [
      "apiVersion: v1, kind: Service, metadata name web-service",
      "spec.type: LoadBalancer",
      "selector app: web",
      "ports: protocol TCP, port: 80, targetPort: 8080",
    ],
    level: "intermediate",
    editor: "yaml",
    starter: `apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  # Add the type, selector and ports here
`,
    solution: `apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
`,
    check: {
      rules: [
        { match: String.raw`^apiVersion:\s*v1\s*$`, flags: "m", message: "apiVersion: v1" },
        { match: String.raw`kind:\s*Service\s*$`, flags: "m", message: "kind: Service" },
        { match: String.raw`\btype:\s*LoadBalancer\b`, message: "type: LoadBalancer" },
        { match: String.raw`selector:\s*\n\s+app:\s*["']?web["']?\s*$`, flags: "m", message: "selector app: web" },
        { match: String.raw`\bport:\s*80\s*$`, flags: "m", message: "port: 80" },
        { match: String.raw`targetPort:\s*8080\s*$`, flags: "m", message: "targetPort: 8080" },
      ],
    },
  },
  {
    title: "Manage EC2 with the CLI",
    brief: "Write AWS CLI commands to launch one EC2 instance, list the running instances and stop an instance.",
    steps: [
      "aws ec2 run-instances with --image-id ami-..., --instance-type t2.micro, --key-name my-key, --security-group-ids sg-... and --count 1",
      "aws ec2 describe-instances with --filters \"Name=instance-state-name,Values=running\"",
      "aws ec2 stop-instances --instance-ids i-...",
    ],
    level: "intermediate",
    editor: "shell",
    starter: `# 1. Launch one t2.micro instance

# 2. List running instances

# 3. Stop an instance
`,
    solution: `aws ec2 run-instances \\
  --image-id ami-0abcdef1234567890 \\
  --instance-type t2.micro \\
  --key-name my-key \\
  --security-group-ids sg-0123456789abcdef0 \\
  --count 1

aws ec2 describe-instances --filters "Name=instance-state-name,Values=running"

aws ec2 stop-instances --instance-ids i-0123456789abcdef0
`,
    check: {
      rules: [
        { match: String.raw`aws\s+ec2\s+run-instances\b`, message: "Launches with aws ec2 run-instances" },
        { match: String.raw`--image-id[\s=]+ami-[0-9a-f]+`, message: "--image-id ami-..." },
        { match: String.raw`--instance-type[\s=]+t2\.micro\b`, message: "--instance-type t2.micro" },
        { match: String.raw`--key-name[\s=]+["']?my-key\b`, message: "--key-name my-key" },
        { match: String.raw`--security-group-ids[\s=]+sg-[0-9a-f]+`, message: "--security-group-ids sg-..." },
        { match: String.raw`--count[\s=]+1\b`, message: "--count 1" },
        { match: String.raw`aws\s+ec2\s+describe-instances\s+--filters[\s=]+["']?Name=instance-state-name,Values=running`, message: "Lists running instances with describe-instances --filters" },
        { match: String.raw`aws\s+ec2\s+stop-instances\s+--instance-ids[\s=]+i-[0-9a-f]+`, message: "Stops an instance with stop-instances --instance-ids" },
      ],
    },
  },
  {
    title: "HTTPS-only bucket policy",
    brief: "Write an S3 bucket policy (JSON) for company-reports that denies every request not sent over HTTPS.",
    steps: [
      "\"Version\": \"2012-10-17\" and a statement with \"Effect\": \"Deny\" and \"Principal\": \"*\"",
      "\"Action\": \"s3:*\"",
      "Resources: \"arn:aws:s3:::company-reports\" and \"arn:aws:s3:::company-reports/*\"",
      "\"Condition\": { \"Bool\": { \"aws:SecureTransport\": \"false\" } }",
    ],
    level: "advanced",
    editor: "json",
    starter: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::company-reports/*"
    }
  ]
}
`,
    solution: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::company-reports",
        "arn:aws:s3:::company-reports/*"
      ],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
`,
    check: {
      rules: [
        { match: String.raw`"Version"\s*:\s*"2012-10-17"`, message: "\"Version\": \"2012-10-17\"" },
        { match: String.raw`"Effect"\s*:\s*"Deny"`, message: "\"Effect\": \"Deny\"" },
        { match: String.raw`"Principal"\s*:\s*("\*"|\{\s*"AWS"\s*:\s*"\*"\s*\})`, message: "\"Principal\": \"*\"" },
        { match: String.raw`"Action"\s*:\s*("s3:\*"|\[\s*"s3:\*"\s*\])`, message: "\"Action\": \"s3:*\"" },
        { match: String.raw`"arn:aws:s3:::company-reports"`, message: "The bucket ARN" },
        { match: String.raw`"arn:aws:s3:::company-reports/\*"`, message: "The objects ARN" },
        { match: String.raw`"Condition"\s*:\s*\{\s*"Bool"\s*:\s*\{\s*"aws:SecureTransport"\s*:\s*"?false"?\s*\}`, message: "Condition Bool aws:SecureTransport is false" },
      ],
    },
  },
  {
    title: "Secure S3 bucket settings",
    brief: "Write Terraform for an S3 bucket with versioning, default encryption and all public access blocked.",
    steps: [
      "resource \"aws_s3_bucket\" \"data\", then aws_s3_bucket_versioning with bucket = aws_s3_bucket.data.id and status = \"Enabled\"",
      "aws_s3_bucket_server_side_encryption_configuration with sse_algorithm = \"AES256\" (or \"aws:kms\")",
      "aws_s3_bucket_public_access_block with block_public_acls, block_public_policy, ignore_public_acls and restrict_public_buckets all true",
    ],
    level: "advanced",
    editor: "hcl",
    starter: `resource "aws_s3_bucket" "data" {
  bucket = "company-data-archive-2026"
}

# Add versioning, encryption and a public access block here
`,
    solution: `resource "aws_s3_bucket" "data" {
  bucket = "company-data-archive-2026"
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
`,
    check: {
      rules: [
        { match: String.raw`resource\s+"aws_s3_bucket_versioning"\s+"\w+"\s*\{\s*bucket\s*=\s*aws_s3_bucket\.data\.(id|bucket)\b`, message: "aws_s3_bucket_versioning for aws_s3_bucket.data" },
        { match: String.raw`versioning_configuration\s*\{\s*status\s*=\s*"Enabled"`, message: "Versioning status is \"Enabled\"" },
        { match: String.raw`resource\s+"aws_s3_bucket_server_side_encryption_configuration"\s+"\w+"`, message: "A server-side encryption configuration" },
        { match: String.raw`sse_algorithm\s*=\s*"(AES256|aws:kms)"`, message: "sse_algorithm is AES256 or aws:kms" },
        { match: String.raw`resource\s+"aws_s3_bucket_public_access_block"\s+"\w+"\s*\{(?=[^}]*block_public_acls\s*=\s*true)(?=[^}]*block_public_policy\s*=\s*true)(?=[^}]*ignore_public_acls\s*=\s*true)(?=[^}]*restrict_public_buckets\s*=\s*true)`, message: "All four public access blocks are true" },
      ],
    },
  },
] satisfies ExerciseSeed[];
