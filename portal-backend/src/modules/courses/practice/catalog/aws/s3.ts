import type { PracticeUnit } from "../../types.js";
import { POLICY_STARTER, has, jq, jsq, pyq, shq } from "./shared.js";

const version = has("Version", "2012-10-17", "Uses policy language version 2012-10-17");

export const s3: PracticeUnit = {
  key: "s3",
  title: "S3: object storage",
  summary: "buckets and objects, storage classes, bucket policies, Block Public Access, versioning, lifecycle rules, encryption, presigned URLs and static website hosting",
  reading: String.raw`## Buckets and objects

Amazon S3 stores files, called objects, in containers called buckets. An object is a key (its full name, like reports/2026/march.pdf), the data (up to 5 TB) and metadata. There are no real folders: the console shows the / in keys as folders. S3 is designed for 99.999999999% (eleven nines) durability by keeping copies across several AZs.

Bucket names are global across all AWS accounts, 3 to 63 characters of lowercase letters, digits, dots and hyphens, starting and ending with a letter or digit, never shaped like an IP address. A bucket lives in one region.

` + "```bash" + String.raw`
aws s3 mb s3://inveon-intern-files --region ap-south-1
aws s3 cp report.pdf s3://inveon-intern-files/reports/
aws s3 sync ./site s3://inveon-site --delete
aws s3 ls s3://inveon-intern-files --recursive
` + "```" + String.raw`

aws s3 is the easy high-level command set; aws s3api exposes every API call (put-bucket-policy, put-bucket-versioning ...).

## Storage classes

- S3 Standard: frequently used data.
- S3 Intelligent-Tiering: moves objects between tiers automatically when access patterns are unknown.
- S3 Standard-IA and One Zone-IA: cheaper storage for data read less than once a month, with a retrieval fee.
- S3 Glacier Instant Retrieval, Flexible Retrieval and Deep Archive: archives, from milliseconds to 12+ hours to get data back, at a fraction of the price.

## Security: private by default

New buckets block all public access and have ACLs disabled (Object Ownership: bucket owner enforced). Every object is encrypted at rest with SSE-S3 by default; you can choose SSE-KMS for key control and audit.

A bucket policy is a resource-based policy with a Principal:

` + "```json" + String.raw`
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyHttp",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::inveon-intern-files", "arn:aws:s3:::inveon-intern-files/*"],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
` + "```" + String.raw`

To share one file for a short time, don't make it public: create a presigned URL (aws s3 presign s3://bucket/key --expires-in 3600).

## Versioning and lifecycle rules

Versioning keeps every version of an object. A delete only adds a delete marker, so you can recover from mistakes and ransomware. Once enabled it can only be suspended, not turned off. Old versions cost money, so pair versioning with lifecycle rules.

Lifecycle rules move or delete objects by age:

` + "```json" + String.raw`
{
  "Rules": [{
    "ID": "logs-tiering",
    "Filter": { "Prefix": "logs/" },
    "Status": "Enabled",
    "Transitions": [
      { "Days": 30, "StorageClass": "STANDARD_IA" },
      { "Days": 90, "StorageClass": "GLACIER" }
    ],
    "Expiration": { "Days": 365 },
    "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
  }]
}
` + "```" + String.raw`

Standard-IA needs objects to be at least 30 days old, so a transition at day 10 is rejected.

## Static website hosting

S3 can serve a static site (HTML, CSS, JS, images):

- Upload the files, turn on website hosting with an index and error document (aws s3 website).
- For the plain S3 website endpoint you must allow public reads: relax Block Public Access for the bucket and add a policy allowing s3:GetObject to Principal "*" on bucket/*.
- The website endpoint is HTTP only. For production, keep the bucket private and put CloudFront in front with Origin Access Control (OAC), which gives HTTPS, a custom domain and caching.

## CORS

If JavaScript on https://app.inveon.in uploads to or reads from the bucket directly, the bucket needs a CORS configuration listing that origin and the methods.

## Common mistakes

- Resource arn:aws:s3:::bucket for object actions (it must be bucket/*).
- Making a whole bucket public to share one file.
- Forgetting that aws s3 sync without --delete leaves removed files online.
- Turning on versioning without a lifecycle rule and paying for years of old versions.

## How the assignments are checked

Policies and configurations are .json files checked for valid JSON and the right keys and values; CLI sheets are .sh files checked for the commands. The validators and cost calculators are Python and Node programs run against hidden inputs.`,
  questions: [
    jq("Public read policy for a website bucket", "Write the bucket policy that lets anyone read the objects of the website bucket inveon-site (and nothing else).", ["One statement with Sid PublicReadGetObject", "Effect Allow, Principal \"*\"", "Action s3:GetObject only", "Resource arn:aws:s3:::inveon-site/*"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::inveon-site/*"
    }
  ]
}
`, [
      version,
      has("Principal", String.raw`\*`, "Principal is everyone (\"*\")"),
      has("Action", "s3:GetObject", "Allows only s3:GetObject"),
      has("Resource", "arn:aws:s3:::inveon-site/\\*", "Applies to the objects inveon-site/*"),
      { notMatch: String.raw`"s3:\*"|"s3:Put|"s3:Delete`, message: "Doesn't allow writing or deleting" },
    ], { starter: POLICY_STARTER }),

    jq("Deny requests without HTTPS", "Write a bucket policy for inveon-intern-files that refuses any request not made over HTTPS.", ["Effect Deny, Principal \"*\", Action s3:*", "Resource: both the bucket ARN and bucket/*", "Condition Bool aws:SecureTransport false"], String.raw`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::inveon-intern-files",
        "arn:aws:s3:::inveon-intern-files/*"
      ],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
`, [
      version,
      has("Effect", "Deny", "Uses Deny"),
      has("Action", "s3:\\*", "Covers every S3 action"),
      { match: String.raw`"arn:aws:s3:::inveon-intern-files"\s*,\s*"arn:aws:s3:::inveon-intern-files/\*"|"arn:aws:s3:::inveon-intern-files/\*"\s*,\s*"arn:aws:s3:::inveon-intern-files"`, message: "Covers the bucket and its objects" },
      { match: String.raw`"Bool"\s*:\s*\{\s*"aws:SecureTransport"\s*:\s*"?false"?`, message: "Checks aws:SecureTransport is false" },
    ], { level: "intermediate", starter: POLICY_STARTER }),

    jq("Lifecycle rules for logs", "Write the lifecycle configuration (for put-bucket-lifecycle-configuration) that tiers the logs/ prefix down and deletes it after a year, and cleans up old versions.", ["One rule with ID logs-tiering, Filter Prefix logs/, Status Enabled", "Transitions: STANDARD_IA at 30 days, GLACIER at 90 days", "Expiration after 365 days", "NoncurrentVersionExpiration after 30 NoncurrentDays"], String.raw`{
  "Rules": [
    {
      "ID": "logs-tiering",
      "Filter": { "Prefix": "logs/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" }
      ],
      "Expiration": { "Days": 365 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
`, [
      { match: String.raw`"Filter"\s*:\s*\{\s*"Prefix"\s*:\s*"logs/"`, message: "Filters on the logs/ prefix" },
      has("Status", "Enabled", "The rule is enabled"),
      { match: String.raw`"Days"\s*:\s*30\s*,\s*"StorageClass"\s*:\s*"STANDARD_IA"|"StorageClass"\s*:\s*"STANDARD_IA"\s*,\s*"Days"\s*:\s*30\b`, message: "Moves to STANDARD_IA at 30 days" },
      { match: String.raw`"Days"\s*:\s*90\s*,\s*"StorageClass"\s*:\s*"GLACIER"|"StorageClass"\s*:\s*"GLACIER"\s*,\s*"Days"\s*:\s*90\b`, message: "Moves to GLACIER at 90 days" },
      { match: String.raw`"Expiration"\s*:\s*\{\s*"Days"\s*:\s*365\s*\}`, message: "Deletes after 365 days" },
      { match: String.raw`"NoncurrentVersionExpiration"\s*:\s*\{\s*"NoncurrentDays"\s*:\s*30\s*\}`, message: "Expires old versions after 30 days" },
    ], { level: "intermediate" }),

    jq("Website configuration", "Write the website configuration (for aws s3api put-bucket-website --website-configuration file://website.json) with an index page, an error page, and a redirect of the old blog/ prefix to news/.", ["IndexDocument Suffix index.html", "ErrorDocument Key error.html", "RoutingRules: Condition KeyPrefixEquals blog/ , Redirect ReplaceKeyPrefixWith news/"], String.raw`{
  "IndexDocument": { "Suffix": "index.html" },
  "ErrorDocument": { "Key": "error.html" },
  "RoutingRules": [
    {
      "Condition": { "KeyPrefixEquals": "blog/" },
      "Redirect": { "ReplaceKeyPrefixWith": "news/" }
    }
  ]
}
`, [
      { match: String.raw`"IndexDocument"\s*:\s*\{\s*"Suffix"\s*:\s*"index\.html"`, message: "Sets index.html as the index document" },
      { match: String.raw`"ErrorDocument"\s*:\s*\{\s*"Key"\s*:\s*"error\.html"`, message: "Sets error.html as the error document" },
      has("KeyPrefixEquals", "blog/", "Matches the blog/ prefix"),
      has("ReplaceKeyPrefixWith", "news/", "Redirects to news/"),
    ]),

    jq("CORS for a web app", "The front end at https://app.inveon.in uploads files straight to the bucket with presigned URLs. Write the CORS configuration (for put-bucket-cors).", ["CORSRules list with one rule", "AllowedOrigins: https://app.inveon.in only (not *)", "AllowedMethods: GET and PUT; AllowedHeaders: *", "ExposeHeaders: ETag; MaxAgeSeconds: 3000"], String.raw`{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.inveon.in"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
`, [
      { match: String.raw`"CORSRules"\s*:\s*\[`, message: "Has a CORSRules list" },
      { match: String.raw`"AllowedOrigins"\s*:\s*\[\s*"https://app\.inveon\.in"\s*\]`, message: "Allows only https://app.inveon.in" },
      { match: String.raw`"AllowedMethods"\s*:\s*\[[^\]]*"GET"[^\]]*\]`, message: "Allows GET" },
      { match: String.raw`"AllowedMethods"\s*:\s*\[[^\]]*"PUT"[^\]]*\]`, message: "Allows PUT" },
      { match: String.raw`"ExposeHeaders"\s*:\s*\[\s*"ETag"\s*\]`, message: "Exposes the ETag header" },
      { match: String.raw`"MaxAgeSeconds"\s*:\s*3000\b`, message: "Caches the preflight for 3000 seconds" },
    ], { level: "intermediate" }),

    shq("Private bucket with versioning", "Create a private, versioned bucket in Mumbai and upload a report into a reports/ prefix.", ["aws s3 mb s3://inveon-intern-files --region ap-south-1", "put-public-access-block with all four settings true", "put-bucket-versioning with Status=Enabled", "aws s3 cp report.pdf to the reports/ prefix, then list the bucket recursively"], String.raw`#!/bin/bash
BUCKET=inveon-intern-files
aws s3 mb "s3://$BUCKET" --region ap-south-1
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3 cp report.pdf "s3://$BUCKET/reports/"
aws s3 ls "s3://$BUCKET" --recursive
`, [
      { match: String.raw`aws\s+s3\s+mb\s+"?s3://(inveon-intern-files|\$\{?BUCKET\}?)"?\s+--region\s+ap-south-1`, message: "Creates the bucket in ap-south-1" },
      { match: String.raw`BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`, message: "Blocks all public access" },
      { match: String.raw`put-bucket-versioning\b.*Status=Enabled`, message: "Enables versioning" },
      { match: String.raw`aws\s+s3\s+cp\s+report\.pdf\s+"?s3://\S+/reports/`, message: "Uploads the report to reports/" },
      { match: String.raw`aws\s+s3\s+ls\b.*--recursive`, message: "Lists the bucket recursively" },
    ]),

    shq("Deploy a static website", "Publish the ./site folder as a public S3 website on the bucket inveon-site.", ["aws s3 sync ./site s3://inveon-site --delete", "aws s3 website with --index-document index.html and --error-document error.html", "put-public-access-block that keeps ACLs blocked but sets BlockPublicPolicy=false and RestrictPublicBuckets=false", "put-bucket-policy --policy file://policy.json"], String.raw`#!/bin/bash
aws s3 sync ./site s3://inveon-site --delete
aws s3 website s3://inveon-site --index-document index.html --error-document error.html
aws s3api put-public-access-block --bucket inveon-site \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket inveon-site --policy file://policy.json
`, [
      { match: String.raw`aws\s+s3\s+sync\s+\./site/?\s+s3://inveon-site/?\s+--delete`, message: "Syncs ./site with --delete" },
      { match: String.raw`aws\s+s3\s+website\s+s3://inveon-site/?\s+--index-document\s+index\.html\s+--error-document\s+error\.html`, message: "Turns on website hosting with index and error pages" },
      { match: String.raw`BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false`, message: "Allows a public policy but keeps ACLs blocked" },
      { match: String.raw`put-bucket-policy\s+--bucket\s+inveon-site\s+--policy\s+file://policy\.json`, message: "Applies the bucket policy" },
    ], { level: "intermediate" }),

    shq("Encrypt with KMS and share a link", "Make SSE-KMS the default encryption of inveon-intern-files, upload a contract, and share it for one hour without making anything public.", ["put-bucket-encryption with a JSON configuration using SSEAlgorithm aws:kms and BucketKeyEnabled true", "aws s3 cp contract.pdf to the bucket", "aws s3 presign the object with --expires-in 3600"], String.raw`#!/bin/bash
aws s3api put-bucket-encryption --bucket inveon-intern-files \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
aws s3 cp contract.pdf s3://inveon-intern-files/contracts/contract.pdf
aws s3 presign s3://inveon-intern-files/contracts/contract.pdf --expires-in 3600
`, [
      { match: String.raw`put-bucket-encryption\s+--bucket\s+inveon-intern-files`, message: "Sets the bucket's default encryption" },
      { match: String.raw`"SSEAlgorithm"\s*:\s*"aws:kms"`, message: "Uses SSE-KMS" },
      { match: String.raw`"BucketKeyEnabled"\s*:\s*true`, message: "Enables an S3 Bucket Key (fewer KMS calls)" },
      { match: String.raw`aws\s+s3\s+presign\s+s3://inveon-intern-files/\S+\s+--expires-in\s+3600`, message: "Creates a one-hour presigned URL" },
      { notMatch: String.raw`public-read|BlockPublicPolicy=false`, message: "Doesn't make anything public" },
    ], { level: "intermediate" }),

    pyq("Validate a bucket name", "Check whether a string is a valid general purpose S3 bucket name.", ["Rules: 3 to 63 characters; only lowercase letters, digits, dots and hyphens; starts and ends with a letter or digit; no two dots in a row; not an IP address like 192.168.5.4; must not start with xn-- or end with -s3alias", "Input: the name", "Output: Valid or Invalid"], String.raw`import re

name = input().strip()
valid = (
    3 <= len(name) <= 63
    and re.fullmatch(r"[a-z0-9][a-z0-9.-]*[a-z0-9]", name) is not None
    and ".." not in name
    and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", name) is None
    and not name.startswith("xn--")
    and not name.endswith("-s3alias")
)
print("Valid" if valid else "Invalid")
`, [["inveon-reports-2026", "Valid", ["invalid"]], ["Inveon_Reports", "Invalid"]], [["ab", "Invalid"], ["192.168.5.4", "Invalid"], ["my..bucket", "Invalid"], ["logs.inveon.in", "Valid", ["invalid"]], ["data-", "Invalid"], ["xn--bucket", "Invalid"]], { level: "intermediate" }),

    pyq("Monthly S3 storage bill", "Estimate a month's S3 storage bill from the GB stored in three classes, using these example prices per GB-month: Standard 0.025, Standard-IA 0.0138, Glacier Deep Archive 0.002. Print each part and the total.", ["Input: three numbers on one line: GB in Standard, GB in Standard-IA, GB in Deep Archive", "Output 4 lines with 2 decimals: Standard: x, Standard-IA: x, Deep Archive: x, Total: x"], String.raw`std, ia, deep = map(float, input().split())
costs = [("Standard", std * 0.025), ("Standard-IA", ia * 0.0138), ("Deep Archive", deep * 0.002)]
for label, cost in costs:
    print(f"{label}: {cost:.2f}")
print(f"Total: {sum(c for _, c in costs):.2f}")
`, [["100 0 0", "Standard: 2.50\nStandard-IA: 0.00\nDeep Archive: 0.00\nTotal: 2.50"], ["500 1000 10000", "Standard: 12.50\nStandard-IA: 13.80\nDeep Archive: 20.00\nTotal: 46.30"]], [["0 0 0", "0.00 0.00 0.00 0.00"], ["2048 512.5 100000", "51.20 7.07 200.00 258.27"]]),

    jsq("Which objects expire", "Simulate an expiration lifecycle rule: given the rule's prefix and days, and a list of objects with their age in days, print the keys that S3 would delete (age at least the days and key starting with the prefix), then the count.", ["Input line 1: <prefix> <days>, e.g. logs/ 365", "Input line 2: JSON array of {\"Key\", \"AgeDays\"}", "Output: each expiring key on its own line, in input order", "Last line: Expired: <count>"], String.raw`const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const [prefix, daysText] = lines[0].trim().split(/\s+/);
const days = Number(daysText);
const objects = JSON.parse(lines[1]);
const expired = objects.filter((o) => o.Key.startsWith(prefix) && o.AgeDays >= days);
for (const o of expired) console.log(o.Key);
console.log("Expired: " + expired.length);
`, [[`logs/ 365\n[{"Key":"logs/2024-01.gz","AgeDays":800},{"Key":"logs/2026-09.gz","AgeDays":20},{"Key":"reports/old.pdf","AgeDays":900}]`, "logs/2024-01.gz\nExpired: 1"]], [[`tmp/ 7\n[{"Key":"tmp/a","AgeDays":7},{"Key":"tmp/b","AgeDays":6},{"Key":"tmp/c/d","AgeDays":30}]`, "tmp/a\ntmp/c/d\nExpired: 2"], [`archive/ 30\n[{"Key":"logs/x","AgeDays":90}]`, "Expired: 0"]], { level: "intermediate", match: "exact" }),
  ],
  quiz: [
    { q: "What is an S3 object key?", options: ["The encryption key", "The full name of the object inside the bucket, like reports/2026/march.pdf", "The access key used to upload it", "The bucket's region"], answer: 1, why: "The key is the object's name; the / characters only look like folders." },
    { q: "Which storage class suits data you rarely read but must get back within milliseconds?", options: ["S3 Standard", "S3 Glacier Instant Retrieval", "S3 Glacier Deep Archive", "EBS gp3"], answer: 1, why: "Glacier Instant Retrieval is archive pricing with millisecond access; Deep Archive takes hours." },
    { q: "How are new S3 buckets configured by default?", options: ["Public read", "All public access blocked, ACLs disabled and SSE-S3 encryption on", "Versioning on and encryption off", "Website hosting on"], answer: 1, why: "Since 2023 buckets are private with Block Public Access on, ACLs disabled, and encryption at rest by default." },
    { q: "What does deleting an object in a versioned bucket do (without a version id)?", options: ["Deletes all versions", "Adds a delete marker; older versions remain and can be restored", "Fails with an error", "Moves the object to Glacier"], answer: 1, why: "The delete marker hides the object, but previous versions are still stored." },
    { q: "Best way to let a client download one private file for 1 hour?", options: ["Make the bucket public for an hour", "Email them your access keys", "Generate a presigned URL with an expiry of 3600 seconds", "Turn off encryption"], answer: 2, why: "A presigned URL grants temporary access to one object without changing the bucket's permissions." },
    { q: "Which ARN should a policy use for s3:GetObject on the bucket photos?", options: ["arn:aws:s3:::photos", "arn:aws:s3:::photos/*", "arn:aws:s3:ap-south-1::photos", "photos/*"], answer: 1, why: "Object actions apply to object ARNs, written bucket/*." },
    { q: "Your S3 website works on http:// but you need HTTPS and a custom domain. What is the recommended setup?", options: ["Enable HTTPS in the website settings", "Put CloudFront in front of a private bucket with Origin Access Control and an ACM certificate", "Use a bigger bucket", "Turn on versioning"], answer: 1, why: "The S3 website endpoint is HTTP only; CloudFront provides HTTPS, caching and a custom domain." },
    { q: "aws s3 sync ./site s3://bucket was run after you deleted old.html locally. Is old.html still online?", options: ["No, sync mirrors everything", "Yes, sync only uploads new and changed files unless you add --delete", "It is moved to Glacier", "Only if versioning is on"], answer: 1, why: "By default sync never deletes on the destination; --delete removes files missing from the source." },
    { q: "A lifecycle rule moves objects to STANDARD_IA after 10 days. What happens when you apply it?", options: ["It works", "It is rejected: transitions to Standard-IA need objects at least 30 days old", "Objects are deleted at day 10", "It only applies to new objects"], answer: 1, why: "S3 requires a minimum of 30 days in Standard before a transition to Standard-IA or One Zone-IA." },
    { q: "A bucket policy allows s3:GetObject to Principal \"*\", but visitors still get 403 Access Denied. What is the most likely cause?", options: ["The objects are too big", "Block Public Access (BlockPublicPolicy/RestrictPublicBuckets) is still on for the bucket or account", "The index document is missing", "The bucket is in the wrong region"], answer: 1, why: "Block Public Access overrides public policies; it must be relaxed at both the bucket and account level for a public website." },
  ],
};
