import type { PracticeUnit } from "../../types.js";
import { jsq, pyq, shq } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "AWS basics: global infrastructure, accounts and the CLI",
  summary: "regions, availability zones and edge locations, the root user, the free plan and credits, ARNs and the AWS CLI with profiles",
  reading: String.raw`## What AWS is

Amazon Web Services (AWS) rents you computers, storage, databases and hundreds of other services over the internet. You pay for what you use, by the second, hour or gigabyte, and you can create or delete resources in minutes. Everything you can click in the AWS Management Console can also be done with the AWS CLI, the SDKs (boto3 for Python, the AWS SDK for JavaScript v3) or infrastructure-as-code tools like CloudFormation.

## Global infrastructure

- A region is a separate geographic area, such as ap-south-1 (Mumbai), ap-south-2 (Hyderabad) or us-east-1 (N. Virginia). Most resources live in one region, and data does not leave a region unless you copy it.
- An availability zone (AZ) is one or more data centres inside a region with separate power and networking. Names look like ap-south-1a. Spreading servers over at least two AZs is how you survive a data-centre failure.
- Edge locations (points of presence) are used by CloudFront (the CDN) and Route 53 (DNS) to serve users from nearby cities.
- Some services are global rather than regional: IAM, Route 53, CloudFront and Organizations.

Choose a region by: distance to your users (latency), data residency laws (Indian customer data often must stay in India), price (the same instance costs different amounts in different regions) and which services are available there.

## Accounts, the root user and the free plan

When you sign up you get an account with a 12-digit account ID and a root user (your email address). The root user can do everything, including closing the account, so:

- Turn on MFA for the root user on day one.
- Never create access keys for the root user.
- Create an IAM user or, better, use IAM Identity Center for daily work.
- Set a budget alert so a forgotten server does not surprise you.

Accounts created from 15 July 2025 start on the Free plan: up to 200 USD in credits usable for six months, plus always-free offers such as 1 million Lambda requests and 25 GB of DynamoDB storage each month. Older accounts had the 12-month free tier (750 hours a month of a t2.micro or t3.micro). Always check the billing console: free does not mean unlimited.

## ARNs

Every resource has an Amazon Resource Name:

` + "```text" + String.raw`
arn:partition:service:region:account-id:resource
arn:aws:s3:::inveon-reports                      (S3 is global: no region or account)
arn:aws:lambda:ap-south-1:123456789012:function:hello
` + "```" + String.raw`

You will write ARNs in IAM policies all the time, so learn to read them.

## The AWS CLI

Install AWS CLI version 2 and set it up once:

` + "```bash" + String.raw`
aws configure --profile intern          # asks for keys, region, output format
aws configure set region ap-south-1 --profile intern
aws sts get-caller-identity --profile intern
aws ec2 describe-regions --query "Regions[].RegionName" --output table
` + "```" + String.raw`

- Every command is aws <service> <action> --options.
- --region, --profile and --output (json, table, text, yaml) work on every command. AWS_PROFILE and AWS_REGION environment variables set them for the whole shell.
- --query uses JMESPath to pick fields out of the JSON response, for example "Reservations[].Instances[].InstanceId".
- aws sts get-caller-identity is the first command to run when something fails: it tells you which account and identity you are really using.

Common mistakes: committing access keys to GitHub (bots find them within minutes; use roles or aws configure, never hard-code), working in the wrong region and thinking your resources vanished, and forgetting that the console shows one region at a time.

## How the assignments are checked

This course is hands-on without needing a paid account. Command sheets are uploaded as .sh files and checked by reading them for the right commands and options (comments do not count). JSON and YAML files are parsed and checked for the right keys and values. Small calculations and parsers are written in Python or Node.js and really run against hidden test inputs, so read the input format carefully and print exactly what is asked.`,
  questions: [
    shq("Configure a named CLI profile", "Set up an AWS CLI profile called intern that works in the Mumbai region with JSON output, then check which identity it uses.", ["Use aws configure set (not the interactive prompt) for the region and output", "Region: ap-south-1, output: json, profile: intern", "Finish with the command that prints the account and user of the profile", "Never write an access key in the file"], String.raw`#!/bin/bash
aws configure set region ap-south-1 --profile intern
aws configure set output json --profile intern
aws sts get-caller-identity --profile intern
`, [
      { match: String.raw`aws\s+configure\s+set\s+region\s+ap-south-1\s+--profile\s+intern`, message: "Sets the region ap-south-1 on the intern profile" },
      { match: String.raw`aws\s+configure\s+set\s+output\s+json\s+--profile\s+intern`, message: "Sets JSON output on the intern profile" },
      { match: String.raw`aws\s+sts\s+get-caller-identity\b.*--profile\s+intern`, message: "Checks the identity with sts get-caller-identity" },
      { notMatch: String.raw`AKIA[0-9A-Z]{12,}`, message: "No access key is written in the file" },
    ]),

    shq("List regions and availability zones", "Write the commands that list the region names enabled for your account as a table, and the availability zone names of ap-south-1 as plain text.", ["Command 1: describe-regions, show only RegionName, output table", "Command 2: describe-availability-zones in ap-south-1, show only ZoneName, output text", "Use --query with JMESPath (quote the query)"], String.raw`#!/bin/bash
aws ec2 describe-regions --query "Regions[].RegionName" --output table
aws ec2 describe-availability-zones --region ap-south-1 --query "AvailabilityZones[].ZoneName" --output text
`, [
      { match: String.raw`aws\s+ec2\s+describe-regions\b`, message: "Lists the regions with ec2 describe-regions" },
      { match: String.raw`--query\s+["']Regions\[\]\.RegionName["']`, message: "Picks RegionName with --query" },
      { match: String.raw`describe-availability-zones\b[^\n]*--region\s+ap-south-1`, message: "Lists the AZs of ap-south-1" },
      { match: String.raw`AvailabilityZones\[\]\.ZoneName`, message: "Picks ZoneName from the AZ list" },
      { match: String.raw`--output\s+table[\s\S]*--output\s+text`, message: "Uses table output then text output" },
    ]),

    shq("Work with environment variables", "Instead of typing --profile and --region on every command, set them once for the shell session, list your S3 buckets and EC2 instances, then clear them.", ["Export AWS_PROFILE=intern and AWS_REGION=ap-south-1", "Run aws s3 ls and aws ec2 describe-instances --output table", "Unset both variables at the end"], String.raw`#!/bin/bash
export AWS_PROFILE=intern
export AWS_REGION=ap-south-1
aws s3 ls
aws ec2 describe-instances --output table
unset AWS_PROFILE AWS_REGION
`, [
      { match: String.raw`export\s+AWS_PROFILE=intern`, message: "Exports AWS_PROFILE" },
      { match: String.raw`export\s+AWS_REGION=ap-south-1`, message: "Exports AWS_REGION" },
      { match: String.raw`aws\s+s3\s+ls`, message: "Lists buckets with aws s3 ls" },
      { match: String.raw`aws\s+ec2\s+describe-instances\b.*--output\s+table`, message: "Describes instances as a table" },
      { match: String.raw`unset\s+.*AWS_PROFILE`, message: "Unsets the variables at the end" },
    ]),

    pyq("Split an availability zone name", "An availability zone name is the region name followed by one letter. Given an AZ name, print its region and its zone letter.", ["Input: one AZ name, e.g. ap-south-1a", "Output line 1: Region: <region>", "Output line 2: Zone: <letter>", "Print only these two lines (compared exactly)"], String.raw`az = input().strip()
print("Region:", az[:-1])
print("Zone:", az[-1])
`, [["ap-south-1a", "Region: ap-south-1\nZone: a"], ["us-east-1f", "Region: us-east-1\nZone: f"]], [["eu-central-2b", "Region: eu-central-2\nZone: b"], ["ap-southeast-5c", "Region: ap-southeast-5\nZone: c"]], { match: "exact" }),

    pyq("Pick the closest region", "You measured the latency from your users to a few regions. Print the region with the lowest latency (the first one if two are equal).", ["Input line 1: n, the number of regions", "Next n lines: <region> <latency in ms>", "Output: the region name"], String.raw`n = int(input())
best_name, best_ms = "", None
for _ in range(n):
    name, ms = input().split()
    ms = float(ms)
    if best_ms is None or ms < best_ms:
        best_name, best_ms = name, ms
print(best_name)
`, [["3\nus-east-1 210\nap-south-1 18\nap-southeast-1 62", "ap-south-1"], ["2\neu-west-1 120\nme-south-1 95", "me-south-1"]], [["1\nap-south-2 25", "ap-south-2"], ["3\nap-south-1 20\nap-south-2 20\nus-west-2 250", "ap-south-1"]], { level: "basic" }),

    pyq("Read an ARN", "Break an Amazon Resource Name into its parts. S3 ARNs have an empty region and account: print global and none for them.", ["Input: one ARN, e.g. arn:aws:lambda:ap-south-1:123456789012:function:hello", "Output 5 lines exactly: Partition: ..., Service: ..., Region: ..., Account: ..., Resource: ...", "Region is global when empty, account is none when empty", "The resource is everything after the fifth colon (it can contain colons)"], String.raw`arn = input().strip()
parts = arn.split(":", 5)
print("Partition:", parts[1])
print("Service:", parts[2])
print("Region:", parts[3] or "global")
print("Account:", parts[4] or "none")
print("Resource:", parts[5])
`, [["arn:aws:lambda:ap-south-1:123456789012:function:hello", "Partition: aws\nService: lambda\nRegion: ap-south-1\nAccount: 123456789012\nResource: function:hello"], ["arn:aws:s3:::inveon-reports", "Partition: aws\nService: s3\nRegion: global\nAccount: none\nResource: inveon-reports"]], [["arn:aws:iam::123456789012:role/app-role", "Partition: aws\nService: iam\nRegion: global\nAccount: 123456789012\nResource: role/app-role"], ["arn:aws-cn:dynamodb:cn-north-1:111122223333:table/Orders/stream/2024", "Partition: aws-cn\nService: dynamodb\nRegion: cn-north-1\nAccount: 111122223333\nResource: table/Orders/stream/2024"]], { level: "intermediate", match: "exact" }),

    jsq("Enabled regions from CLI output", "aws ec2 describe-regions --all-regions returns JSON with each region's OptInStatus. Print how many regions you can use (opt-in-not-required or opted-in) and their names in alphabetical order.", ["Input: the JSON printed by the CLI: {\"Regions\": [{\"RegionName\": \"...\", \"OptInStatus\": \"...\"}]}", "Output line 1: the count", "Output line 2: the usable names sorted, separated by spaces", "Skip regions whose status is not-opted-in"], String.raw`const input = require("fs").readFileSync(0, "utf8");
const data = JSON.parse(input);
const usable = data.Regions
  .filter((r) => r.OptInStatus !== "not-opted-in")
  .map((r) => r.RegionName)
  .sort();
console.log(usable.length);
console.log(usable.join(" "));
`, [[`{"Regions":[{"RegionName":"us-east-1","OptInStatus":"opt-in-not-required"},{"RegionName":"ap-south-2","OptInStatus":"not-opted-in"},{"RegionName":"ap-south-1","OptInStatus":"opt-in-not-required"}]}`, "2\nap-south-1 us-east-1"]], [[`{"Regions":[{"RegionName":"me-central-1","OptInStatus":"opted-in"},{"RegionName":"eu-west-1","OptInStatus":"opt-in-not-required"},{"RegionName":"af-south-1","OptInStatus":"not-opted-in"}]}`, "2\neu-west-1 me-central-1"], [`{"Regions":[{"RegionName":"ap-east-1","OptInStatus":"not-opted-in"}]}`, "0"]], { level: "intermediate", match: "exact" }),

    pyq("Will the credits last", "A new account on the Free plan gets credits that are valid for 182 days. Given the credits and your average spend per day, print how many full days they cover and whether they last the whole 182 days.", ["Input line 1: credits in USD (decimal)", "Input line 2: spend per day in USD (decimal, more than 0)", "Output line 1: Days covered: <whole days>", "Output line 2: Result: lasts, or Result: runs out"], String.raw`credits = float(input())
per_day = float(input())
days = int(credits // per_day)
print("Days covered:", days)
if days >= 182:
    print("Result: lasts")
else:
    print("Result: runs out")
`, [["200\n0.5", "Days covered: 400\nResult: lasts", ["runs", "out"]], ["200\n2.5", "Days covered: 80\nResult: runs out", ["lasts"]]], [["182\n1", "Days covered: 182\nResult: lasts", ["runs", "out"]], ["100\n0.56", "Days covered: 178\nResult: runs out", ["lasts"]]]),

    pyq("Cheaper region for a server", "The same instance type has a different hourly price in two regions. Print the cheaper region and how much you save per month by running one instance there for the given hours.", ["Input line 1: <region> <price per hour>", "Input line 2: <region> <price per hour>", "Input line 3: hours per month (730 for always on)", "Output line 1: the cheaper region (the first one if equal)", "Output line 2: the monthly saving with 2 decimals"], String.raw`r1, p1 = input().split()
r2, p2 = input().split()
hours = float(input())
p1, p2 = float(p1), float(p2)
cheaper = r1 if p1 <= p2 else r2
print("Cheaper:", cheaper)
print(f"Saving per month: {abs(p1 - p2) * hours:.2f}")
`, [["us-east-1 0.0416\nap-south-1 0.0448\n730", "us-east-1 2.34"], ["ap-south-1 0.096\neu-west-1 0.104\n730", "ap-south-1 5.84"]], [["ap-south-1 0.05\nap-south-2 0.05\n730", "ap-south-1 0.00"], ["eu-west-2 0.2\nus-west-2 0.17\n100", "us-west-2 3.00"]], { level: "intermediate" }),
  ],
  quiz: [
    { q: "What is an availability zone?", options: ["A country where AWS sells services", "One or more isolated data centres inside a region", "A CDN cache location", "A billing zone for taxes"], answer: 1, why: "A region is made of several AZs, each with its own power and networking, so a failure in one does not take down the others." },
    { q: "Which of these services is global rather than regional?", options: ["EC2", "RDS", "IAM", "EBS"], answer: 2, why: "IAM users, roles and policies apply to the whole account in every region." },
    { q: "What is the first thing you should do with a new account's root user?", options: ["Create access keys for it", "Turn on MFA and stop using it for daily work", "Delete it", "Share it with your team"], answer: 1, why: "The root user can do everything, so protect it with MFA and use IAM identities for daily work." },
    { q: "Which command tells you which account and identity the CLI is really using?", options: ["aws whoami", "aws iam get-user --me", "aws sts get-caller-identity", "aws configure list-accounts"], answer: 2, why: "sts get-caller-identity returns the account ID, user ID and ARN of the credentials in use." },
    { q: "What does --query \"Regions[].RegionName\" do?", options: ["Filters regions on the server", "Uses JMESPath to pick RegionName from every item in the Regions list", "Sorts the regions", "Asks AWS for only one region"], answer: 1, why: "--query is applied to the JSON response on your machine using JMESPath." },
    { q: "Why does arn:aws:s3:::my-bucket have empty region and account fields?", options: ["It is a mistake", "S3 bucket names are globally unique, so the ARN does not need them", "The bucket is public", "It belongs to the root user"], answer: 1, why: "Bucket names are unique across all AWS accounts, so the region and account parts are left empty." },
    { q: "Your EC2 instances seem to have disappeared from the console. What is the most likely reason?", options: ["AWS deleted them", "The console is showing a different region", "The free tier expired", "IAM hides them"], answer: 1, why: "The console shows one region at a time; switch to the region where you launched them." },
    { q: "You set AWS_REGION=ap-south-1 in the shell and run aws s3 ls --region us-east-1. Which region is used for the call?", options: ["ap-south-1, environment variables always win", "us-east-1, a command-line option overrides the environment variable", "Both, the CLI calls both regions", "Neither, it is an error"], answer: 1, why: "The CLI's precedence is: command-line options, then environment variables, then the config file." },
    { q: "A developer pushes code with an access key to a public GitHub repo and deletes the commit an hour later. What should they do?", options: ["Nothing, the commit is deleted", "Make the repo private", "Deactivate and delete the key in IAM immediately and check CloudTrail for misuse", "Change the IAM user's password"], answer: 2, why: "Leaked keys are scraped within minutes and stay in forks and caches; only revoking the key stops misuse." },
    { q: "An app for Indian bank customers must keep customer data in India and needs low latency in Mumbai, with a disaster-recovery copy also in India. Which design fits?", options: ["Primary in ap-south-1, DR copy in ap-south-2 (Hyderabad)", "Primary in us-east-1, DR in ap-south-1", "Everything in one AZ of ap-south-1", "Primary in ap-southeast-1 (Singapore)"], answer: 0, why: "Mumbai and Hyderabad are both Indian regions, so data residency and region-level disaster recovery are met." },
  ],
};
