import type { PracticeUnit } from "../../types.js";
import { POLICY_STARTER, has, jq, jsq, pyq, shq } from "./shared.js";

const version = has("Version", "2012-10-17", "Uses policy language version 2012-10-17");
const noStarAction = { notMatch: String.raw`"Action"\s*:\s*"\*"`, message: "Doesn't allow every action (\"Action\": \"*\")" };

export const iam: PracticeUnit = {
  key: "iam",
  title: "IAM: users, groups, roles and policies",
  summary: "users, groups and roles, JSON policies (Effect, Action, Resource, Condition), trust policies, least privilege, MFA and how AWS evaluates a request",
  reading: String.raw`## Who can do what

IAM (Identity and Access Management) answers one question for every API call: is this principal allowed to do this action on this resource right now? IAM is global and free.

- A user is a person or an app with long-term credentials (a password for the console, access keys for the CLI). Prefer IAM Identity Center for people, and roles for apps.
- A group is a set of users. Attach policies to groups (developers, testers), not to single users.
- A role has no password or keys. Someone or something assumes it and gets temporary credentials from STS. EC2 instances, Lambda functions and users from another account use roles.
- A policy is a JSON document that grants or denies permissions.

## Policy structure

` + "```json" + String.raw`
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadReports",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::inveon-reports/*",
      "Condition": { "Bool": { "aws:SecureTransport": "true" } }
    }
  ]
}
` + "```" + String.raw`

- Version is always "2012-10-17" (it is the policy language version, not a date you change).
- Effect is Allow or Deny. Action is service:Operation and may use wildcards like s3:Get*. Resource is one or more ARNs.
- Condition adds checks such as the source IP, the region (aws:RequestedRegion), tags (aws:ResourceTag/Team) or whether MFA was used (aws:MultiFactorAuthPresent).
- Note that s3:ListBucket applies to the bucket ARN (arn:aws:s3:::name) while s3:GetObject applies to objects (arn:aws:s3:::name/*). Mixing these up is the most common S3 policy bug.

## Kinds of policies

- Identity-based policies attach to users, groups or roles. AWS managed ones (ReadOnlyAccess, AmazonS3ReadOnlyAccess) are a quick start; customer managed ones are yours and reusable.
- Resource-based policies attach to a resource, such as an S3 bucket policy or a Lambda permission, and name a Principal.
- A trust policy is the resource policy of a role: it says who may assume it.

` + "```json" + String.raw`
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
` + "```" + String.raw`

- Service control policies (SCPs) in AWS Organizations and permission boundaries set the maximum a principal can ever get, even if a policy allows more.

## How a request is evaluated

1. Everything starts as denied (implicit deny).
2. If any applicable policy has an explicit Deny that matches, the answer is Deny. Nothing can override it.
3. Otherwise, if some policy Allows it (and no SCP or boundary blocks it), the answer is Allow.
4. Otherwise it stays implicitly denied.

So a Deny with a condition is a powerful guard rail: "deny everything outside ap-south-1" or "deny everything unless MFA was used".

## Least privilege and good habits

- Grant only the actions and resources a job needs; start small and add. IAM Access Analyzer can generate a policy from the actions really used.
- Never use "Action": "*" with "Resource": "*" except for real administrators.
- Turn on MFA for every human, and rotate or remove unused access keys (the credential report shows them).
- Give apps roles, never access keys in code. On EC2 the role is attached through an instance profile; the SDK finds the credentials automatically.

## CLI commands you will use

` + "```bash" + String.raw`
aws iam create-group --group-name developers
aws iam attach-group-policy --group-name developers --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam create-role --role-name app-role --assume-role-policy-document file://trust.json
aws iam put-role-policy --role-name app-role --policy-name s3-read --policy-document file://policy.json
` + "```" + String.raw`

## How the assignments are checked

Policies are uploaded as .json files. The file must be valid JSON (a missing comma or a trailing comma fails), and the checker looks for the right Effect, Action, Resource, Principal and Condition values, and for the dangerous things that must not be there. The evaluation questions are Python or Node programs run against hidden test inputs.`,
  questions: [
    jq("Read-only access to one bucket", "Write an identity policy that lets an intern list the bucket inveon-reports and download its objects, and nothing else.", ["Statement 1: Allow s3:ListBucket on arn:aws:s3:::inveon-reports", "Statement 2: Allow s3:GetObject on arn:aws:s3:::inveon-reports/*", "No wildcards like s3:* or *"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListReports",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::inveon-reports"
    },
    {
      "Sid": "ReadReports",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::inveon-reports/*"
    }
  ]
}
`, [
      version,
      { match: String.raw`"s3:ListBucket"[\s\S]*?"arn:aws:s3:::inveon-reports"|"arn:aws:s3:::inveon-reports"[\s\S]*?"s3:ListBucket"`, message: "Allows s3:ListBucket on the bucket ARN" },
      { match: String.raw`"s3:GetObject"`, message: "Allows s3:GetObject" },
      { match: String.raw`"arn:aws:s3:::inveon-reports/\*"`, message: "Uses the object ARN inveon-reports/* for objects" },
      { notMatch: String.raw`"s3:\*"|"\*"`, message: "Uses no wildcard action or resource" },
    ], { starter: POLICY_STARTER }),

    jq("Trust policy for an EC2 role", "Write the trust policy for a role that EC2 instances will use, so an app on the instance gets temporary credentials instead of access keys.", ["One statement: Allow", "Principal: the service ec2.amazonaws.com", "Action: sts:AssumeRole"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
`, [
      version,
      has("Effect", "Allow", "Allows the action"),
      { match: String.raw`"Principal"\s*:\s*\{\s*"Service"\s*:\s*"ec2\.amazonaws\.com"`, message: "Trusts the EC2 service principal" },
      has("Action", "sts:AssumeRole", "Allows sts:AssumeRole"),
      { notMatch: String.raw`"Resource"`, message: "A trust policy has no Resource (the role itself is the resource)" },
    ], { starter: POLICY_STARTER }),

    jq("Lambda execution trust policy", "A Lambda function needs a role. Write the trust policy that lets the Lambda service assume it, and only when the call comes from your account 123456789012.", ["Principal: the service lambda.amazonaws.com", "Action: sts:AssumeRole", "Condition StringEquals aws:SourceAccount 123456789012 (protects against the confused deputy problem)"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "123456789012" }
      }
    }
  ]
}
`, [
      version,
      { match: String.raw`"Service"\s*:\s*"lambda\.amazonaws\.com"`, message: "Trusts lambda.amazonaws.com" },
      has("Action", "sts:AssumeRole", "Allows sts:AssumeRole"),
      { match: String.raw`"StringEquals"\s*:\s*\{\s*"aws:SourceAccount"\s*:\s*"123456789012"`, message: "Limits it to aws:SourceAccount 123456789012" },
    ], { level: "intermediate", starter: POLICY_STARTER }),

    jq("Deny everything without MFA", "Write a guard-rail policy for the developers group: deny every action when the user signed in without MFA, except the IAM actions needed to set up their own MFA device and see their user.", ["Effect Deny with NotAction listing iam:CreateVirtualMFADevice, iam:EnableMFADevice, iam:ListMFADevices, iam:GetUser and sts:GetSessionToken", "Resource: *", "Condition BoolIfExists aws:MultiFactorAuthPresent false"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyWithoutMFA",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ListMFADevices",
        "iam:GetUser",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" }
      }
    }
  ]
}
`, [
      version,
      has("Effect", "Deny", "Uses an explicit Deny"),
      { match: String.raw`"NotAction"\s*:\s*\[[^\]]*"iam:EnableMFADevice"[^\]]*\]`, message: "Excludes the MFA set-up actions with NotAction" },
      { match: String.raw`"BoolIfExists"\s*:\s*\{\s*"aws:MultiFactorAuthPresent"\s*:\s*"?false"?`, message: "Checks aws:MultiFactorAuthPresent is false with BoolIfExists" },
      has("Resource", String.raw`\*`, "Applies to every resource"),
    ], { level: "advanced", starter: POLICY_STARTER }),

    jq("Start and stop only your team's instances", "Interns may see all EC2 instances but start and stop only the ones tagged Team=interns.", ["Statement 1: Allow ec2:DescribeInstances on *", "Statement 2: Allow ec2:StartInstances and ec2:StopInstances on arn:aws:ec2:*:*:instance/*", "Statement 2 condition: StringEquals aws:ResourceTag/Team interns"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SeeInstances",
      "Effect": "Allow",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    },
    {
      "Sid": "StartStopTeamInstances",
      "Effect": "Allow",
      "Action": ["ec2:StartInstances", "ec2:StopInstances"],
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": { "aws:ResourceTag/Team": "interns" }
      }
    }
  ]
}
`, [
      version,
      has("Action", "ec2:DescribeInstances", "Allows ec2:DescribeInstances"),
      { match: String.raw`"ec2:StartInstances"[\s\S]*"ec2:StopInstances"|"ec2:StopInstances"[\s\S]*"ec2:StartInstances"`, message: "Allows starting and stopping" },
      { match: String.raw`"arn:aws:ec2:\*:\*:instance/\*"`, message: "Limits start/stop to instance ARNs" },
      { match: String.raw`"StringEquals"\s*:\s*\{\s*"(aws|ec2):ResourceTag/Team"\s*:\s*"interns"`, message: "Requires the tag Team=interns" },
      noStarAction,
    ], { level: "intermediate", starter: POLICY_STARTER }),

    jq("Keep work in Indian regions", "Write a policy that denies any action outside Mumbai (ap-south-1) and Hyderabad (ap-south-2). Global services like IAM, CloudFront and Route 53 must still work.", ["Effect Deny with NotAction for iam:*, cloudfront:*, route53:* and support:*", "Resource: *", "Condition StringNotEquals aws:RequestedRegion with both regions in a list"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideIndia",
      "Effect": "Deny",
      "NotAction": ["iam:*", "cloudfront:*", "route53:*", "support:*"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-south-1", "ap-south-2"]
        }
      }
    }
  ]
}
`, [
      version,
      has("Effect", "Deny", "Uses an explicit Deny"),
      { match: String.raw`"NotAction"\s*:\s*\[[^\]]*"iam:\*"`, message: "Keeps global services working with NotAction" },
      { match: String.raw`"StringNotEquals"\s*:\s*\{\s*"aws:RequestedRegion"`, message: "Uses StringNotEquals on aws:RequestedRegion" },
      { match: String.raw`\[\s*"ap-south-[12]"\s*,\s*"ap-south-[12]"\s*\]`, message: "Lists ap-south-1 and ap-south-2" },
    ], { level: "advanced", starter: POLICY_STARTER }),

    jq("Strong password policy", "Write the input for aws iam update-account-password-policy --cli-input-json file://password.json that makes console passwords strong.", ["MinimumPasswordLength at least 14", "RequireSymbols, RequireNumbers, RequireUppercaseCharacters and RequireLowercaseCharacters true", "PasswordReusePrevention 5 or more", "Use JSON numbers and booleans, not strings"], String.raw`{
  "MinimumPasswordLength": 14,
  "RequireSymbols": true,
  "RequireNumbers": true,
  "RequireUppercaseCharacters": true,
  "RequireLowercaseCharacters": true,
  "AllowUsersToChangePassword": true,
  "MaxPasswordAge": 90,
  "PasswordReusePrevention": 5
}
`, [
      { match: String.raw`"MinimumPasswordLength"\s*:\s*(1[4-9]|[2-9]\d|1[0-2]\d)\b`, message: "Minimum length is 14 or more (a number)" },
      { match: String.raw`"RequireSymbols"\s*:\s*true`, message: "Requires symbols" },
      { match: String.raw`"RequireNumbers"\s*:\s*true`, message: "Requires numbers" },
      { match: String.raw`"RequireUppercaseCharacters"\s*:\s*true[\s\S]*"RequireLowercaseCharacters"\s*:\s*true|"RequireLowercaseCharacters"\s*:\s*true[\s\S]*"RequireUppercaseCharacters"\s*:\s*true`, message: "Requires upper and lower case letters" },
      { match: String.raw`"PasswordReusePrevention"\s*:\s*([5-9]|1\d|2[0-4])\b`, message: "Prevents reusing the last 5 or more passwords" },
    ]),

    shq("Create a group and add a user", "Set up a developers group with read-only access and add a new user asha to it.", ["Create the group developers", "Attach the AWS managed policy arn:aws:iam::aws:policy/ReadOnlyAccess to the group", "Create the user asha and add her to the group", "Attach the policy to the group, not to the user"], String.raw`#!/bin/bash
aws iam create-group --group-name developers
aws iam attach-group-policy --group-name developers \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam create-user --user-name asha
aws iam add-user-to-group --group-name developers --user-name asha
`, [
      { match: String.raw`aws\s+iam\s+create-group\s+--group-name\s+developers`, message: "Creates the developers group" },
      { match: String.raw`aws\s+iam\s+attach-group-policy\b[\s\S]*arn:aws:iam::aws:policy/ReadOnlyAccess`, message: "Attaches ReadOnlyAccess to the group" },
      { match: String.raw`aws\s+iam\s+create-user\s+--user-name\s+asha`, message: "Creates the user asha" },
      { match: String.raw`aws\s+iam\s+add-user-to-group\b.*(--user-name\s+asha|--group-name\s+developers).*(--user-name\s+asha|--group-name\s+developers)`, message: "Adds asha to developers" },
      { notMatch: String.raw`attach-user-policy`, message: "Doesn't attach policies directly to the user" },
    ]),

    shq("Give an EC2 instance a role", "Create a role app-role that EC2 can assume, give it read-only S3 access, and wrap it in an instance profile that an instance can use.", ["create-role with --assume-role-policy-document file://trust.json", "attach-role-policy with arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess", "create-instance-profile app-profile and add-role-to-instance-profile", "Finally associate it with instance i-0abc1234def567890 (ec2 associate-iam-instance-profile)"], String.raw`#!/bin/bash
aws iam create-role --role-name app-role \
  --assume-role-policy-document file://trust.json
aws iam attach-role-policy --role-name app-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
aws iam create-instance-profile --instance-profile-name app-profile
aws iam add-role-to-instance-profile --instance-profile-name app-profile --role-name app-role
aws ec2 associate-iam-instance-profile --instance-id i-0abc1234def567890 \
  --iam-instance-profile Name=app-profile
`, [
      { match: String.raw`create-role\s+--role-name\s+app-role\s*\\?\s*--assume-role-policy-document\s+file://\S+\.json`, message: "Creates app-role with a trust policy file" },
      { match: String.raw`attach-role-policy\b[\s\S]*AmazonS3ReadOnlyAccess`, message: "Attaches AmazonS3ReadOnlyAccess" },
      { match: String.raw`create-instance-profile\s+--instance-profile-name\s+app-profile`, message: "Creates the instance profile" },
      { match: String.raw`add-role-to-instance-profile\b`, message: "Adds the role to the instance profile" },
      { match: String.raw`associate-iam-instance-profile\b[\s\S]*Name=app-profile`, message: "Associates the profile with the instance" },
    ], { level: "intermediate" }),

    pyq("Evaluate a policy decision", "Simulate how IAM decides a request. Statements are given as an effect and an action pattern (a * matches any characters, and matching ignores case). An explicit Deny always wins, then an Allow, otherwise the request is implicitly denied.", ["Input line 1: n, the number of statements", "Next n lines: Allow <pattern> or Deny <pattern>, e.g. Allow s3:Get*", "Last line: the requested action, e.g. s3:GetObject", "Output exactly one of: Allow, ExplicitDeny, ImplicitDeny"], String.raw`from fnmatch import fnmatchcase

n = int(input())
statements = [input().split() for _ in range(n)]
action = input().strip().lower()
allowed = False
denied = False
for effect, pattern in statements:
    if fnmatchcase(action, pattern.lower()):
        if effect == "Deny":
            denied = True
        else:
            allowed = True
if denied:
    print("ExplicitDeny")
elif allowed:
    print("Allow")
else:
    print("ImplicitDeny")
`, [["2\nAllow s3:*\nDeny s3:DeleteObject\ns3:GetObject", "Allow"], ["2\nAllow s3:*\nDeny s3:DeleteObject\ns3:DeleteObject", "ExplicitDeny"]], [["1\nAllow ec2:Describe*\nec2:StartInstances", "ImplicitDeny"], ["3\nAllow *\nDeny iam:*\nAllow iam:GetUser\niam:getuser", "ExplicitDeny"], ["0\ns3:ListBucket", "ImplicitDeny"]], { level: "advanced", match: "exact" }),

    jsq("Find over-broad statements", "Review a policy document: list the Sid of every Allow statement whose Action is \"*\" or a whole service like \"s3:*\" (Action can be a string or a list), then the count.", ["Input: one policy JSON document", "Output: each matching Sid on its own line, in order", "Last line: Broad statements: <count>", "Deny statements never count"], String.raw`const input = require("fs").readFileSync(0, "utf8");
const policy = JSON.parse(input);
const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
let count = 0;
for (const s of statements) {
  const actions = Array.isArray(s.Action) ? s.Action : [s.Action ?? ""];
  const broad = actions.some((a) => a === "*" || a.endsWith(":*"));
  if (s.Effect === "Allow" && broad) {
    console.log(s.Sid);
    count++;
  }
}
console.log("Broad statements: " + count);
`, [[`{"Version":"2012-10-17","Statement":[{"Sid":"Admin","Effect":"Allow","Action":"*","Resource":"*"},{"Sid":"Read","Effect":"Allow","Action":["s3:GetObject"],"Resource":"*"}]}`, "Admin\nBroad statements: 1"]], [[`{"Version":"2012-10-17","Statement":[{"Sid":"S3All","Effect":"Allow","Action":["s3:GetObject","s3:*"],"Resource":"*"},{"Sid":"NoIam","Effect":"Deny","Action":"iam:*","Resource":"*"},{"Sid":"Ec2All","Effect":"Allow","Action":"ec2:*","Resource":"*"}]}`, "S3All\nEc2All\nBroad statements: 2"], [`{"Version":"2012-10-17","Statement":{"Sid":"One","Effect":"Allow","Action":"s3:Get*","Resource":"*"}}`, "Broad statements: 0"]], { level: "advanced", match: "exact" }),
  ],
  quiz: [
    { q: "What should an application running on EC2 use to call S3?", options: ["The root user's access keys", "An IAM user's access keys saved in the code", "An IAM role attached through an instance profile", "A public bucket"], answer: 2, why: "A role gives the instance temporary credentials that rotate automatically; no keys live in the code." },
    { q: "What does \"Version\": \"2012-10-17\" in a policy mean?", options: ["The date the policy was written", "The current version of the IAM policy language", "The policy expires on that date", "The API version of S3"], answer: 1, why: "It is the policy language version and should always be 2012-10-17." },
    { q: "Where should you attach a policy that every developer needs?", options: ["To each user separately", "To a developers group", "To the root user", "To an S3 bucket"], answer: 1, why: "Groups make permissions easy to manage: add or remove a user from the group." },
    { q: "Which element of a role says who may assume it?", options: ["The permissions policy", "The trust policy", "The permission boundary", "The instance profile"], answer: 1, why: "The trust policy names the principals (services, accounts, users) allowed to call sts:AssumeRole." },
    { q: "A policy allows s3:ListBucket on arn:aws:s3:::reports/* . Why does aws s3 ls s3://reports still fail?", options: ["ListBucket needs the bucket ARN arn:aws:s3:::reports, not the object ARN", "The bucket must be public", "ListBucket is not a real action", "The CLI caches old permissions"], answer: 0, why: "ListBucket acts on the bucket itself; /* matches objects only." },
    { q: "Which tool finds users with old, unused access keys across the account?", options: ["The IAM credential report", "CloudFront", "The S3 inventory", "EC2 Instance Connect"], answer: 0, why: "The credential report lists every user with password and access key age and last-used dates." },
    { q: "What does least privilege mean?", options: ["Give everyone read-only access", "Grant only the permissions needed for the task, and nothing more", "Use as few IAM users as possible", "Only the root user can grant access"], answer: 1, why: "Least privilege limits the damage from mistakes and stolen credentials." },
    { q: "A user has AdministratorAccess from one group and a policy from another group that denies s3:DeleteBucket. Can they delete a bucket?", options: ["Yes, AdministratorAccess wins", "No, an explicit deny always overrides any allow", "Only with MFA", "It depends on which group was added first"], answer: 1, why: "In IAM evaluation an explicit Deny cannot be overridden by any Allow." },
    { q: "An SCP on the account allows only s3:* and ec2:*. A user's identity policy allows dynamodb:*. What happens when the user calls DynamoDB?", options: ["Allowed, because the identity policy allows it", "Denied, because the SCP sets the maximum permissions and does not include DynamoDB", "Allowed only in us-east-1", "Denied only for the root user"], answer: 1, why: "SCPs don't grant anything; they limit what identity policies can grant, so DynamoDB is outside the allowed maximum." },
    { q: "Why does the MFA guard-rail policy use BoolIfExists instead of Bool for aws:MultiFactorAuthPresent?", options: ["Bool is not supported by IAM", "With long-term access keys the key is missing, and BoolIfExists treats a missing key as a match, so those calls are denied too", "BoolIfExists is faster", "It allows requests without MFA"], answer: 1, why: "Requests signed with long-term access keys don't include the key at all; BoolIfExists makes the Deny apply when the key is absent." },
  ],
};
