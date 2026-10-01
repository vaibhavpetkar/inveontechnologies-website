import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { iam } from "./iam.js";
import { ec2 } from "./ec2.js";
import { s3 } from "./s3.js";
import { vpc } from "./vpc.js";

export const awsCourse: PracticeCourse = {
  key: "aws",
  title: "AWS Cloud",
  category: "DevOps and cloud",
  tagline: "Build on AWS from the CLI and IAM policies to EC2, S3, VPC networking, databases, Lambda, CloudWatch and CloudFormation, with every assignment checked automatically.",
  docs: "https://docs.aws.amazon.com/",
  editor: "json",
  units: [basics, iam, ec2, s3, vpc],
};
