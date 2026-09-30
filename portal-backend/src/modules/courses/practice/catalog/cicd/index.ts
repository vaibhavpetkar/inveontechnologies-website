import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { build } from "./build.js";
import { docker } from "./docker.js";
import { deploy } from "./deploy.js";
import { secrets } from "./secrets.js";
import { gitlabJenkins } from "./gitlab-jenkins.js";

export const cicdCourse: PracticeCourse = {
  key: "cicd",
  title: "CI/CD Pipelines",
  category: "DevOps and cloud",
  tagline: "Build real CI/CD pipelines with GitHub Actions, GitLab CI and Jenkins: test on every push, build and push Docker images, and deploy safely with approvals and rollbacks.",
  docs: "https://docs.github.com/en/actions",
  editor: "yaml",
  units: [basics, build, docker, deploy, secrets, gitlabJenkins],
};
