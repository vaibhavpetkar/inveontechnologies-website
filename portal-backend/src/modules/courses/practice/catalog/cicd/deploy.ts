import type { PracticeUnit } from "../../types.js";
import { WORKFLOW, has, shQ, t, yq } from "./shared.js";

export const deploy: PracticeUnit = {
  key: "deploy",
  title: "Deploying: servers, cloud, rollbacks, blue-green and canary",
  summary: "SSH deploys, static sites on S3, Kubernetes and ECS deploys, smoke tests, rollbacks, version bumps, blue-green and canary releases",
  reading: t`## The last mile of the pipeline

Deploying means getting the tested artifact onto the machines that serve users. Whatever the target, a good deploy step is:

- Automated: no one copies files by hand at midnight.
- Repeatable: running it twice gives the same result (idempotent).
- Observable: it prints what it deployed and fails loudly.
- Reversible: you know how to go back before you go forward.

## Deploying to a server over SSH

For a single VM (EC2, a DigitalOcean droplet, a college lab server), the pipeline logs in with an SSH key stored as a secret and runs commands there. With Docker Compose on the server, a deploy is "pull the new image and restart":

` + "```yaml" + t`
- uses: appleboy/ssh-action@v1
  with:
    host: \${{ secrets.SSH_HOST }}
    username: deploy
    key: \${{ secrets.SSH_PRIVATE_KEY }}
    script: |
      cd /srv/shop
      docker compose pull
      docker compose up -d
` + "```" + t`

Use a dedicated deploy user with limited rights, never root, and a key made only for CI.

## Deploying to the cloud

- Static sites (React, Angular builds): aws s3 sync dist/ s3://bucket --delete, then a CloudFront invalidation so users get the new files.
- Containers on Kubernetes: kubectl set image to the new tag, then kubectl rollout status to wait until the new pods are ready. If it times out, the step fails.
- Containers on Amazon ECS: render the task definition with the new image, then deploy it with wait-for-service-stability: true.
- Platforms like Render, Railway, Vercel or AWS App Runner deploy from a hook or a CLI call.

Always authenticate with OIDC or a scoped token, and run production deploys in a protected environment.

## Smoke tests and rollbacks

A deploy isn't done until a quick check proves the app works: curl --fail --retry 5 https://staging.example.com/health. If the check fails, roll back:

- Kubernetes keeps the previous ReplicaSet: kubectl rollout undo deployment/shop-api.
- With immutable image tags, redeploying the previous tag is a rollback.
- Database migrations are the hard part: make them backward compatible (add columns first, remove old ones in a later release) so the old code still runs after a rollback.

## Versioning releases

Semantic versioning is MAJOR.MINOR.PATCH. Bump PATCH for bug fixes, MINOR for new backward-compatible features (and reset PATCH to 0), and MAJOR for breaking changes (reset MINOR and PATCH). Pipelines often compute the next version, tag the commit and name the image with it.

## Safer release strategies

- Rolling update (the Kubernetes default): replace pods a few at a time. Simple, but old and new versions serve traffic together for a while.
- Blue-green: run two identical environments. Blue serves users while you deploy to green; after green passes its checks, switch the load balancer to green. Rollback is switching back. It costs double the capacity during the release.
- Canary: send a small share of traffic (say 5%, then 25%, 50%, 100%) to the new version and compare its error rate and latency with the old version. Promote if it is as good, roll back if it is worse. Tools like Argo Rollouts and Flagger automate this.
- Feature flags: deploy code switched off and turn it on for some users, separating deploy from release.

## Picking the environment from the branch

A common convention: main deploys to production (with approval), develop and release/* branches deploy to staging, and feature branches get a temporary preview environment. A small script or if conditions make that decision.

## Common mistakes

- Deploying without waiting for the rollout, so a broken release is reported as green.
- No health check endpoint, so nothing can tell whether the app is really up.
- Mutable tags (latest) in production: you can't roll back to a known build.
- SSH keys with root access, or host keys not checked.

## How your assignments are checked

Workflow questions are checked by reading the .yml file for the actions, commands and conditions asked for. Script questions (version bumps, branch to environment, canary and blue-green decisions) are bash scripts: they read input with read and are run against test cases, and the output is compared exactly, so print only the answer.`,
  questions: [
    yq({
      title: "Deploy over SSH",
      brief: "After the image is published, deploy it to a VM that runs Docker Compose. Log in over SSH as the user deploy with the key in secrets.SSH_PRIVATE_KEY and the host in secrets.SSH_HOST, then pull and restart in /srv/shop.",
      steps: ["Trigger: push to main", "appleboy/ssh-action with host, username deploy and key from secrets", "script: cd /srv/shop, docker compose pull, docker compose up -d"],
      starter: WORKFLOW,
      solution: t`name: Deploy to VM

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: \${{ secrets.SSH_HOST }}
          username: deploy
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /srv/shop
            docker compose pull
            docker compose up -d
`,
      rules: [
        has(String.raw`uses:\s*appleboy/ssh-action@v\d+`, "Uses appleboy/ssh-action"),
        has(String.raw`host:\s*\$\{\{\s*secrets\.SSH_HOST\s*\}\}`, "Host comes from secrets.SSH_HOST"),
        has(String.raw`key:\s*\$\{\{\s*secrets\.SSH_PRIVATE_KEY\s*\}\}`, "Key comes from secrets.SSH_PRIVATE_KEY"),
        has(String.raw`username:\s*deploy\b`, "Logs in as deploy, not root"),
        has(String.raw`docker compose pull[\s\S]*docker compose up -d`, "Pulls and restarts with docker compose"),
      ],
    }),
    yq({
      title: "Deploy a static site to S3",
      brief: "Build a React app and publish dist/ to the S3 bucket shop-web-prod, removing files that no longer exist, then invalidate the CloudFront cache. AWS access uses OIDC with the role in vars.AWS_ROLE_ARN (region ap-south-1). The distribution id is in vars.CF_DISTRIBUTION_ID.",
      steps: ["permissions id-token: write, contents: read", "npm ci and npm run build", "aws s3 sync dist/ s3://shop-web-prod --delete", "aws cloudfront create-invalidation --distribution-id ... --paths \"/*\""],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Deploy site

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.AWS_ROLE_ARN }}
          aws-region: ap-south-1
      - run: aws s3 sync dist/ s3://shop-web-prod --delete
      - run: aws cloudfront create-invalidation --distribution-id "\${{ vars.CF_DISTRIBUTION_ID }}" --paths "/*"
`,
      rules: [
        has(String.raw`id-token:\s*write`, "Uses OIDC (id-token: write)"),
        has(String.raw`aws s3 sync\s+\.?/?dist/?\s+s3://shop-web-prod\b`, "Syncs dist/ to s3://shop-web-prod"),
        has(String.raw`aws s3 sync[^\n]*--delete`, "Deletes files that were removed"),
        has(String.raw`aws cloudfront create-invalidation\b[^\n]*--distribution-id`, "Invalidates the CloudFront distribution"),
        has(String.raw`--paths\s+["']/\*["']`, "Invalidates all paths"),
      ],
    }),
    yq({
      title: "Roll out to Kubernetes",
      brief: "Update the shop-api Deployment in the shop namespace to the image ghcr.io/inveon/shop-api:<commit sha> and wait up to 120 seconds for the rollout to finish. The kubeconfig is base64 encoded in secrets.KUBECONFIG_B64.",
      steps: ["Write the kubeconfig: echo \"$KUBECONFIG_B64\" | base64 -d > kubeconfig, with KUBECONFIG_B64 from secrets", "Set KUBECONFIG to that file for later steps", "kubectl set image deployment/shop-api shop-api=ghcr.io/inveon/shop-api:\${{ github.sha }} -n shop", "kubectl rollout status deployment/shop-api -n shop --timeout=120s"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Deploy to Kubernetes

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Write kubeconfig
        run: |
          echo "$KUBECONFIG_B64" | base64 -d > kubeconfig
          echo "KUBECONFIG=$PWD/kubeconfig" >> "$GITHUB_ENV"
        env:
          KUBECONFIG_B64: \${{ secrets.KUBECONFIG_B64 }}
      - name: Update the image
        run: kubectl set image deployment/shop-api shop-api=ghcr.io/inveon/shop-api:\${{ github.sha }} -n shop
      - name: Wait for the rollout
        run: kubectl rollout status deployment/shop-api -n shop --timeout=120s
`,
      rules: [
        has(String.raw`KUBECONFIG_B64:\s*\$\{\{\s*secrets\.KUBECONFIG_B64\s*\}\}`, "Reads the kubeconfig from a secret"),
        has(String.raw`base64 (-d|--decode)`, "Decodes the kubeconfig"),
        has(String.raw`kubectl set image deployment/shop-api shop-api=ghcr\.io/inveon/shop-api:\$\{\{\s*github\.sha\s*\}\}`, "Sets the new image tag"),
        has(String.raw`kubectl rollout status deployment/shop-api\b[^\n]*--timeout=120s`, "Waits for the rollout with a 120s timeout"),
        has(String.raw`-n shop|--namespace[ =]shop`, "Uses the shop namespace"),
      ],
    }),
    yq({
      title: "Automatic rollback",
      brief: "After updating the image, wait for the rollout and run a smoke test against https://shop.example.com/health. If either step fails, undo the rollout automatically.",
      steps: ["kubectl rollout status deployment/shop-api --timeout=120s", "Smoke test: curl --fail --retry 5 --retry-delay 5 https://shop.example.com/health", "A final step with if: failure() runs kubectl rollout undo deployment/shop-api"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Deploy with rollback

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Update the image
        run: kubectl set image deployment/shop-api shop-api=ghcr.io/inveon/shop-api:\${{ github.sha }}
      - name: Wait for the rollout
        run: kubectl rollout status deployment/shop-api --timeout=120s
      - name: Smoke test
        run: curl --fail --retry 5 --retry-delay 5 https://shop.example.com/health
      - name: Roll back
        if: failure()
        run: kubectl rollout undo deployment/shop-api
`,
      rules: [
        has(String.raw`kubectl rollout status deployment/shop-api`, "Waits for the rollout"),
        has(String.raw`curl\s+[^\n]*--fail[^\n]*https://shop\.example\.com/health`, "Smoke tests /health with curl --fail"),
        has(String.raw`--retry\s+\d+`, "Retries the smoke test"),
        has(String.raw`if:\s*\$?\{?\{?\s*failure\(\)\s*\}?\}?\s*\n\s+run:\s*kubectl rollout undo deployment/shop-api`, "Undoes the rollout if anything failed"),
      ],
    }),
    yq({
      title: "Deploy to Amazon ECS",
      brief: "Deploy a new image to the ECS service shop-api in the cluster shop-prod. Render task-definition.json with the new image for the container shop-api, then deploy it and wait until the service is stable.",
      steps: ["aws-actions/amazon-ecs-render-task-definition with id: render, task-definition, container-name and image", "aws-actions/amazon-ecs-deploy-task-definition with task-definition: \${{ steps.render.outputs.task-definition }}", "service: shop-api, cluster: shop-prod, wait-for-service-stability: true"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Deploy to ECS

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.AWS_ROLE_ARN }}
          aws-region: ap-south-1
      - id: render
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: shop-api
          image: \${{ vars.ECR_REPOSITORY }}:\${{ github.sha }}
      - uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: \${{ steps.render.outputs.task-definition }}
          service: shop-api
          cluster: shop-prod
          wait-for-service-stability: true
`,
      rules: [
        has(String.raw`uses:\s*aws-actions/amazon-ecs-render-task-definition@v\d+`, "Renders the task definition"),
        has(String.raw`container-name:\s*shop-api`, "Updates the shop-api container"),
        has(String.raw`task-definition:\s*\$\{\{\s*steps\.render\.outputs\.task-definition\s*\}\}`, "Deploys the rendered task definition"),
        has(String.raw`service:\s*shop-api[\s\S]*cluster:\s*shop-prod|cluster:\s*shop-prod[\s\S]*service:\s*shop-api`, "Targets service shop-api in cluster shop-prod"),
        has(String.raw`wait-for-service-stability:\s*true`, "Waits for the service to be stable"),
      ],
    }),
    yq({
      title: "Staging smoke test before production",
      brief: "Deploy to staging, smoke test it, and only then deploy to production. Production must wait for approval through the production environment.",
      steps: ["Job staging: environment staging, run ./deploy.sh staging, then curl --fail --retry 5 https://staging.shop.example.com/health", "Job production: needs staging, environment production, run ./deploy.sh production", "Both jobs check out the code"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Release

on:
  push:
    branches: [main]

jobs:
  staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh staging
      - name: Smoke test staging
        run: curl --fail --retry 5 --retry-delay 5 https://staging.shop.example.com/health

  production:
    needs: staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh production
`,
      rules: [
        has(String.raw`environment:\s*staging`, "The first job uses the staging environment"),
        has(String.raw`curl\s+[^\n]*--fail[^\n]*https://staging\.shop\.example\.com/health`, "Smoke tests staging"),
        has(String.raw`needs:\s*\[?\s*staging`, "Production needs staging"),
        has(String.raw`environment:\s*production`, "Production uses the protected environment"),
        has(String.raw`deploy\.sh staging[\s\S]*deploy\.sh production`, "Deploys staging, then production"),
      ],
    }),
    shQ({
      title: "Bump a semantic version",
      brief: "A release pipeline must compute the next version. Read a version (MAJOR.MINOR.PATCH, optionally starting with v) and the part to bump (major, minor or patch), and print the new version, keeping the v if there was one.",
      steps: ["Input: one line, the version and the part, e.g. 1.4.2 minor", "major: MAJOR+1, MINOR and PATCH become 0; minor: MINOR+1, PATCH becomes 0; patch: PATCH+1", "Output: only the new version, e.g. 1.5.0"],
      level: "intermediate",
      solution: t`#!/bin/bash
read -r version part
prefix=""
if [[ "$version" == v* ]]; then
  prefix="v"
  version="\${version#v}"
fi
IFS=. read -r major minor patch <<< "$version"
case "$part" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
esac
echo "$prefix$major.$minor.$patch"
`,
      examples: [["1.4.2 minor", "1.5.0"], ["2.9.9 patch", "2.9.10"]],
      hidden: [["v0.3.7 major", "v1.0.0"], ["1.0.0 patch", "1.0.1"], ["v4.12.3 minor", "v4.13.0"]],
    }),
    shQ({
      title: "Choose the environment from the branch",
      brief: "Read a branch name and print where the pipeline should deploy it: main goes to production; develop and any release/... branch go to staging; any feature/... branch gets preview; everything else prints none.",
      steps: ["Input: one line, the branch name", "Output: only production, staging, preview or none", "Use a case statement with patterns like release/*"],
      solution: t`#!/bin/bash
read -r branch
case "$branch" in
  main) echo "production" ;;
  develop | release/*) echo "staging" ;;
  feature/*) echo "preview" ;;
  *) echo "none" ;;
esac
`,
      examples: [["main", "production"], ["feature/login-page", "preview"]],
      hidden: [["release/2.4", "staging"], ["develop", "staging"], ["hotfix/payment", "none"], ["mainline", "none"]],
      rules: [{ match: String.raw`\bcase\b[\s\S]*\besac\b`, message: "Uses a case statement" }],
    }),
    shQ({
      title: "Canary promotion decision",
      brief: "A canary release sends a small part of the traffic to the new version. Read the canary's errors and requests and the baseline's errors and requests. If the canary has served fewer than 100 requests, print wait. Otherwise promote the canary if its error rate is at most the baseline's error rate plus 1 percentage point, else roll back.",
      steps: ["Input: one line with four whole numbers: canary_errors canary_requests baseline_errors baseline_requests", "Error rate = errors * 100 / requests (percent). Compare without losing decimals: multiply both sides instead of dividing", "Output: only wait, promote or rollback"],
      level: "advanced",
      solution: t`#!/bin/bash
read -r ce cr be br
if [ "$cr" -lt 100 ]; then
  echo "wait"
elif [ $((ce * 100 * br)) -le $((be * 100 * cr + cr * br)) ]; then
  echo "promote"
else
  echo "rollback"
fi
`,
      examples: [["2 1000 3 1000", "promote"], ["30 1000 5 1000", "rollback"], ["1 50 0 1000", "wait"]],
      hidden: [["15 1000 5 1000", "promote"], ["16 1000 5 1000", "rollback"], ["0 100 0 100", "promote"], ["9 400 20 2000", "rollback"]],
    }),
    shQ({
      title: "Blue-green switch",
      brief: "In a blue-green deploy, the new version goes to the idle colour. Read the colour that is live now and the health of the idle environment after the deploy. If the idle side is healthy, print which colour traffic switches to; otherwise keep the live colour.",
      steps: ["Input: one line: the live colour (blue or green) and the idle side's health (healthy or unhealthy)", "Output: switch traffic to <idle colour>, or keep <live colour> live", "Any colour other than blue or green prints unknown color"],
      level: "intermediate",
      solution: t`#!/bin/bash
read -r live health
if [ "$live" = "blue" ]; then
  idle="green"
elif [ "$live" = "green" ]; then
  idle="blue"
else
  echo "unknown color"
  exit 0
fi
if [ "$health" = "healthy" ]; then
  echo "switch traffic to $idle"
else
  echo "keep $live live"
fi
`,
      examples: [["blue healthy", "switch traffic to green"], ["green unhealthy", "keep green live"]],
      hidden: [["green healthy", "switch traffic to blue"], ["red healthy", "unknown color"], ["blue unhealthy", "keep blue live"]],
    }),
    shQ({
      title: "Pick the release to roll back to",
      brief: "Read the list of deployed release tags, oldest first. The last one is live and broken; print the release to roll back to (the one before it). If there is only one release, print none.",
      steps: ["Input: one line of release tags separated by spaces", "Read them into an array with read -ra", "Output: only the previous release, or none"],
      level: "intermediate",
      solution: t`#!/bin/bash
read -ra releases
count=\${#releases[@]}
if [ "$count" -lt 2 ]; then
  echo "none"
else
  echo "\${releases[count-2]}"
fi
`,
      examples: [["v1.0 v1.1 v1.2", "v1.1"], ["r-2025-06-01", "none"]],
      hidden: [["a b", "a"], ["v3 v4 v5 v6 v7", "v6"], ["sha-1a2b3c sha-4d5e6f", "sha-1a2b3c"]],
    }),
  ],
  quiz: [
    { q: "What does kubectl rollout status deployment/web --timeout=120s do in a pipeline?", options: ["Starts the rollout", "Waits until the new pods are ready and fails the step if that takes longer than 120 seconds", "Rolls back", "Prints the logs"], answer: 1, why: "Without waiting, a broken rollout would still be reported as a successful deploy." },
    { q: "Which command returns a Kubernetes Deployment to its previous version?", options: ["kubectl delete deployment web", "kubectl rollout undo deployment/web", "kubectl apply --previous", "kubectl rollback web"], answer: 1, why: "rollout undo switches back to the previous ReplicaSet revision." },
    { q: "Why is aws s3 sync dist/ s3://bucket --delete used for static sites?", options: ["It deletes the bucket", "It uploads changed files and removes files from the bucket that no longer exist locally", "It is faster than cp only because of --delete", "It invalidates CloudFront"], answer: 1, why: "--delete keeps the bucket an exact copy of the build output." },
    { q: "What is the main advantage of blue-green deployment?", options: ["It needs no extra servers", "Switching traffic back to the old environment is an instant rollback", "It tests only 5% of users", "It removes the need for tests"], answer: 1, why: "The old environment stays running untouched until you're confident in the new one." },
    { q: "In a canary release, what decides whether to promote?", options: ["The build time", "Comparing the canary's error rate and latency with the current version's", "The number of commits", "The size of the image"], answer: 1, why: "A canary is promoted only if it behaves at least as well as the baseline under real traffic." },
    { q: "Version 2.7.3 gets a new backward-compatible feature. What is the next version?", options: ["2.7.4", "2.8.0", "3.0.0", "2.8.3"], answer: 1, why: "A minor bump increments MINOR and resets PATCH to 0." },
    { q: "Why should database migrations be backward compatible in a continuously deployed app?", options: ["Databases require it", "So the previous version of the code still works after a rollback or while old and new pods run together", "To make migrations faster", "It isn't needed"], answer: 1, why: "During rolling updates and rollbacks, old code runs against the new schema." },
    { q: "What does curl --fail do in a smoke test?", options: ["Retries forever", "Makes curl exit with an error on HTTP 4xx/5xx responses, so the step fails", "Ignores SSL errors", "Prints only headers"], answer: 1, why: "Without --fail, curl exits 0 even when the server returns 500." },
    { q: "In bash, what does IFS=. read -r a b c <<< \"1.4.2\" put in b?", options: ["1.4.2", "4", ".4", "2"], answer: 1, why: "IFS=. splits the string on dots for that read only: a=1, b=4, c=2." },
    { q: "With a rolling update (the Kubernetes default), what is true during the rollout?", options: ["Only the new version serves traffic", "Old and new versions serve traffic at the same time for a while", "The app is down", "Traffic is split 50/50 by design"], answer: 1, why: "Pods are replaced gradually, so both versions must be able to run side by side." },
  ],
};
