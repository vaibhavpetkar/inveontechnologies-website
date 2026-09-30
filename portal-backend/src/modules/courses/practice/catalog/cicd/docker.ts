import type { PracticeUnit } from "../../types.js";
import { WORKFLOW, checkout, has, lacks, t, yq } from "./shared.js";

const login = has(String.raw`uses:\s*docker/login-action@v\d+`, "Logs in with docker/login-action");
const buildPush = has(String.raw`uses:\s*docker/build-push-action@v\d+`, "Builds with docker/build-push-action");

export const docker: PracticeUnit = {
  key: "docker-ci",
  title: "Building and pushing Docker images in CI",
  summary: "docker build in a workflow, registry login, build-push-action, Buildx cache, image tags with metadata-action, multi-platform images and image scanning",
  reading: t`## Why build images in CI

When the pipeline builds the Docker image, every image comes from a known commit, with a clean machine and the same steps every time. "Works on my laptop" disappears, and the deploy step only has to pull an image by its tag.

The simplest version is plain docker commands in run steps (Docker is already installed on ubuntu-latest):

` + "```yaml" + t`
- uses: actions/checkout@v4
- run: docker build -t shop-api:\${{ github.sha }} .
` + "```" + t`

## Logging in to a registry

A registry stores images: Docker Hub, GitHub Container Registry (ghcr.io), Amazon ECR or Google Artifact Registry. docker/login-action logs in without printing the password:

` + "```yaml" + t`
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: \${{ github.actor }}
    password: \${{ secrets.GITHUB_TOKEN }}
` + "```" + t`

- For GHCR the job needs permissions: packages: write, and the built-in GITHUB_TOKEN is enough.
- For Docker Hub, create an access token (not your account password) and store it as a secret such as DOCKERHUB_TOKEN. Leave out registry, since Docker Hub is the default.
- For ECR, configure AWS credentials first (OIDC) and then use aws-actions/amazon-ecr-login.

## build-push-action and Buildx

docker/build-push-action builds with Buildx, the modern builder. Set it up with docker/setup-buildx-action, then:

` + "```yaml" + t`
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v6
  with:
    context: .
    push: true
    tags: ghcr.io/\${{ github.repository }}:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
` + "```" + t`

The gha cache stores image layers in the GitHub Actions cache, so unchanged layers (like npm ci when package.json didn't change) are reused on the next run. mode=max also caches the intermediate stages of multi-stage builds.

## Tagging images well

Tags decide what you can deploy and roll back to:

- latest alone is dangerous: you can't tell which code it contains and you can't roll back to "the previous latest".
- A commit SHA tag (sha-3f2a9c1) is unique and traceable to the exact code.
- Semantic version tags (1.4.2, 1.4, 1) come from Git tags like v1.4.2 and are what users and Helm charts refer to.
- Branch tags (main) are handy for staging.

docker/metadata-action generates these for you and also adds standard OCI labels (source repository, revision, created time):

` + "```yaml" + t`
- id: meta
  uses: docker/metadata-action@v5
  with:
    images: ghcr.io/\${{ github.repository }}
    tags: |
      type=sha
      type=ref,event=branch
      type=semver,pattern={{version}}
` + "```" + t`

Then pass tags: \${{ steps.meta.outputs.tags }} and labels: \${{ steps.meta.outputs.labels }} to build-push-action. Note that GHCR image names must be lower case; metadata-action lowercases the name for you.

## Build on pull requests, push only from main

Pull requests should prove the image builds, but should not publish it. Use push: \${{ github.event_name != 'pull_request' }}. Pull requests from forks have no registry credentials anyway.

## Multi-platform images

Laptops with Apple silicon and AWS Graviton servers are ARM machines. docker/setup-qemu-action plus platforms: linux/amd64,linux/arm64 builds one tag that works on both.

## Test and scan before you ship

- Build with load: true to put the image into the runner's local Docker, then docker run it to run tests or a smoke check.
- Scan for known vulnerabilities with Trivy (aquasecurity/trivy-action), failing the job on HIGH and CRITICAL findings.

## Common mistakes

- Pushing from pull requests, or forgetting packages: write for GHCR.
- Using your Docker Hub password instead of an access token.
- Only ever tagging latest.
- No layer cache, so every build reinstalls every dependency.
- Copying the whole repository before installing dependencies in the Dockerfile, which breaks layer caching.

## How your assignments are checked

Upload the workflow .yml file. The checker looks for the login, Buildx and build-push steps, the registry and tags, the cache settings and the push conditions each question asks for, and fails answers that put a password straight in the file.`,
  questions: [
    yq({
      title: "Build an image with docker build",
      brief: "On every push, check out the code and build the Dockerfile in the repository root with plain docker commands, tagging the image shop-api:<commit sha>. Then list the image.",
      steps: ["checkout", "run: docker build -t shop-api:\${{ github.sha }} .", "run: docker image ls shop-api"],
      starter: WORKFLOW,
      solution: t`name: Docker build

on: push

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: docker build -t shop-api:\${{ github.sha }} .
      - name: Show the image
        run: docker image ls shop-api
`,
      rules: [
        checkout,
        has(String.raw`docker build\s+(-t|--tag)\s+shop-api:\$\{\{\s*github\.sha\s*\}\}\s+\.`, "Builds shop-api tagged with github.sha"),
        has(String.raw`docker image ls shop-api|docker images shop-api`, "Lists the image"),
        has(String.raw`checkout@v\d+[\s\S]*docker build`, "Checks out before building"),
      ],
    }),
    yq({
      title: "Log in to Docker Hub",
      brief: "Log in to Docker Hub with the username in secrets.DOCKERHUB_USERNAME and an access token in secrets.DOCKERHUB_TOKEN, then build and push vaibhavdev/shop-api:latest with build-push-action.",
      steps: ["docker/login-action with username and password from secrets", "docker/build-push-action with push: true and tags vaibhavdev/shop-api:latest", "No password written in the file"],
      starter: WORKFLOW,
      solution: t`name: Publish

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKERHUB_USERNAME }}
          password: \${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: vaibhavdev/shop-api:latest
`,
      rules: [
        login,
        has(String.raw`username:\s*\$\{\{\s*secrets\.DOCKERHUB_USERNAME\s*\}\}`, "Username comes from a secret"),
        has(String.raw`password:\s*\$\{\{\s*secrets\.DOCKERHUB_TOKEN\s*\}\}`, "Password is the DOCKERHUB_TOKEN secret"),
        buildPush,
        has(String.raw`push:\s*true`, "push: true"),
        has(String.raw`tags:\s*vaibhavdev/shop-api:latest`, "Tags vaibhavdev/shop-api:latest"),
      ],
    }),
    yq({
      title: "Push to GitHub Container Registry",
      brief: "Publish the image to ghcr.io using only the built-in GITHUB_TOKEN. Tag it ghcr.io/<owner>/<repo>:<commit sha>.",
      steps: ["permissions: contents read, packages write", "login-action with registry ghcr.io, username \${{ github.actor }}, password \${{ secrets.GITHUB_TOKEN }}", "build-push-action with push true and tags ghcr.io/\${{ github.repository }}:\${{ github.sha }}"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Publish to GHCR

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
`,
      rules: [
        has(String.raw`packages:\s*write`, "Grants packages: write"),
        has(String.raw`registry:\s*ghcr\.io`, "Logs in to ghcr.io"),
        has(String.raw`password:\s*\$\{\{\s*(secrets\.GITHUB_TOKEN|github\.token)\s*\}\}`, "Uses GITHUB_TOKEN as the password"),
        buildPush,
        has(String.raw`tags:\s*ghcr\.io/\$\{\{\s*github\.repository\s*\}\}:\$\{\{\s*github\.sha\s*\}\}`, "Tags ghcr.io/<repo>:<sha>"),
      ],
    }),
    yq({
      title: "Buildx with a layer cache",
      brief: "Builds are slow because every run reinstalls dependencies. Set up Buildx and use the GitHub Actions cache for image layers, including intermediate stages. This job only builds (no push).",
      steps: ["docker/setup-buildx-action", "build-push-action with push: false", "cache-from: type=gha and cache-to: type=gha,mode=max"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Build image

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          tags: shop-api:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max
`,
      rules: [
        has(String.raw`uses:\s*docker/setup-buildx-action@v\d+`, "Sets up Buildx"),
        buildPush,
        has(String.raw`cache-from:\s*type=gha`, "cache-from: type=gha"),
        has(String.raw`cache-to:\s*type=gha,\s*mode=max`, "cache-to: type=gha,mode=max"),
        has(String.raw`push:\s*false`, "Does not push"),
      ],
    }),
    yq({
      title: "Tags from metadata-action",
      brief: "Generate tags and labels with docker/metadata-action for the image ghcr.io/<owner>/<repo>: a sha tag, a branch tag and a semantic version tag, and pass them to build-push-action.",
      steps: ["A step with id: meta using docker/metadata-action", "images: ghcr.io/\${{ github.repository }}", "tags: type=sha, type=ref,event=branch, type=semver,pattern={{version}}", "build-push-action uses steps.meta.outputs.tags and steps.meta.outputs.labels"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Publish

on:
  push:
    branches: [main]
    tags: ["v*.*.*"]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/\${{ github.repository }}
          tags: |
            type=sha
            type=ref,event=branch
            type=semver,pattern={{version}}
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
`,
      rules: [
        has(String.raw`id:\s*meta\s*\n\s+uses:\s*docker/metadata-action@v\d+|uses:\s*docker/metadata-action@v\d+[\s\S]*id:\s*meta`, "A step with id meta uses docker/metadata-action"),
        has(String.raw`type=sha`, "Adds a sha tag"),
        has(String.raw`type=ref,event=branch`, "Adds a branch tag"),
        has(String.raw`type=semver,pattern=\{\{version\}\}`, "Adds a semver tag"),
        has(String.raw`tags:\s*\$\{\{\s*steps\.meta\.outputs\.tags\s*\}\}`, "build-push-action uses the generated tags"),
        has(String.raw`labels:\s*\$\{\{\s*steps\.meta\.outputs\.labels\s*\}\}`, "build-push-action uses the generated labels"),
      ],
    }),
    yq({
      title: "Build on PRs, push only from main",
      brief: "Run the image build for pull requests and pushes to main, but only push the image to GHCR when the event is not a pull request. Skip the registry login on pull requests too.",
      steps: ["Triggers: push to main and pull_request", "Login step with if: github.event_name != 'pull_request'", "build-push-action with push: \${{ github.event_name != 'pull_request' }}"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Image

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  packages: write

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: \${{ github.event_name != 'pull_request' }}
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
`,
      rules: [
        has(String.raw`pull_request:`, "Runs on pull requests"),
        has(String.raw`if:\s*\$?\{?\{?\s*github\.event_name\s*!=\s*'pull_request'`, "Skips the login on pull requests"),
        has(String.raw`push:\s*\$\{\{\s*github\.event_name\s*!=\s*'pull_request'\s*\}\}`, "Pushes only when the event is not a pull request"),
        login,
        buildPush,
      ],
    }),
    yq({
      title: "Release images from version tags",
      brief: "When a Git tag like v2.3.1 is pushed, publish ghcr.io/<owner>/<repo> with the tags 2.3.1 and 2.3 using metadata-action. Don't run on branch pushes.",
      steps: ["on push tags: [\"v*.*.*\"] only", "metadata-action tags: type=semver,pattern={{version}} and type=semver,pattern={{major}}.{{minor}}", "Log in to ghcr.io and push with build-push-action"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Release image

on:
  push:
    tags: ["v*.*.*"]

permissions:
  contents: read
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/\${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
`,
      rules: [
        has(String.raw`tags:\s*\[\s*["']v\*\.\*\.\*["']\s*\]|tags:\s*\n\s+-\s*["']v\*\.\*\.\*["']`, "Triggers on v*.*.* tags"),
        lacks(String.raw`branches:`, "Does not run on branch pushes"),
        has(String.raw`type=semver,pattern=\{\{version\}\}`, "Tags the full version"),
        has(String.raw`type=semver,pattern=\{\{major\}\}\.\{\{minor\}\}`, "Tags major.minor"),
        buildPush,
      ],
    }),
    yq({
      title: "Multi-platform image",
      brief: "Publish one image tag that runs on both Intel/AMD servers and ARM servers such as AWS Graviton.",
      steps: ["docker/setup-qemu-action and docker/setup-buildx-action", "Log in to ghcr.io", "build-push-action with platforms: linux/amd64,linux/arm64 and push: true"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Multi-arch

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
`,
      rules: [
        has(String.raw`uses:\s*docker/setup-qemu-action@v\d+`, "Sets up QEMU"),
        has(String.raw`uses:\s*docker/setup-buildx-action@v\d+`, "Sets up Buildx"),
        has(String.raw`platforms:\s*linux/amd64,\s*linux/arm64|platforms:\s*linux/arm64,\s*linux/amd64`, "Builds linux/amd64 and linux/arm64"),
        has(String.raw`push:\s*true`, "Pushes the image"),
        login,
      ],
    }),
    yq({
      title: "Scan the image with Trivy",
      brief: "Build the image locally (without pushing), then scan it with Trivy and fail the job if any HIGH or CRITICAL vulnerability that has a fix is found.",
      steps: ["build-push-action with load: true and tags shop-api:scan", "aquasecurity/trivy-action with image-ref: shop-api:scan", "severity: CRITICAL,HIGH, exit-code: \"1\", ignore-unfixed: true"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Image scan

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          tags: shop-api:scan
      - uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: shop-api:scan
          severity: CRITICAL,HIGH
          exit-code: "1"
          ignore-unfixed: true
`,
      rules: [
        has(String.raw`load:\s*true`, "Loads the image into local Docker"),
        has(String.raw`uses:\s*aquasecurity/trivy-action@`, "Uses the Trivy action"),
        has(String.raw`image-ref:\s*["']?shop-api:scan`, "Scans shop-api:scan"),
        has(String.raw`severity:\s*["']?(CRITICAL,\s*HIGH|HIGH,\s*CRITICAL)`, "Fails on CRITICAL and HIGH"),
        has(String.raw`exit-code:\s*["']1["']`, "exit-code \"1\" makes findings fail the job"),
      ],
    }),
    yq({
      title: "Test inside the built image",
      brief: "Build the image, load it into the runner's Docker, start it, and check that GET /health on port 3000 answers before pushing. Push only after the check passes.",
      steps: ["build-push-action with load: true and tags shop-api:test", "docker run -d -p 3000:3000 --name api shop-api:test", "curl --fail --retry 5 --retry-connrefused http://localhost:3000/health", "Then log in to ghcr.io and push (a second build-push-action step reuses the cache)"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Test then push

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          tags: shop-api:test
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Smoke test
        run: |
          docker run -d -p 3000:3000 --name api shop-api:test
          curl --fail --retry 5 --retry-connrefused http://localhost:3000/health
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
          cache-from: type=gha
`,
      rules: [
        has(String.raw`load:\s*true`, "Loads the image locally"),
        has(String.raw`docker run -d\b.*-p\s*3000:3000.*shop-api:test`, "Starts the container on port 3000"),
        has(String.raw`curl\s+.*--fail.*localhost:3000/health`, "Checks /health with curl --fail"),
        has(String.raw`localhost:3000/health[\s\S]*push:\s*true`, "Pushes only after the check"),
        login,
      ],
    }),
  ],
  quiz: [
    { q: "Which permission must a job have to push to ghcr.io with GITHUB_TOKEN?", options: ["contents: write", "packages: write", "id-token: write", "actions: write"], answer: 1, why: "GitHub Packages (including GHCR) needs packages: write." },
    { q: "What should you store as the Docker Hub password secret?", options: ["Your account password", "A Docker Hub access token", "Your GitHub token", "Nothing, Docker Hub needs no login"], answer: 1, why: "Access tokens can be scoped and revoked without changing your account password." },
    { q: "What does cache-to: type=gha,mode=max do?", options: ["Pushes the image to GitHub", "Saves all build layers, including intermediate stages, to the GitHub Actions cache", "Deletes old caches", "Limits the cache size"], answer: 1, why: "mode=max exports layers of every stage, not just the final image, so multi-stage builds reuse more." },
    { q: "Why is tagging only :latest a problem?", options: ["It is slower", "You can't tell which commit it contains or roll back to a specific earlier build", "Registries reject it", "It breaks Buildx"], answer: 1, why: "Immutable tags such as a commit SHA or version make deploys traceable and rollbacks possible." },
    { q: "A Git tag v1.4.2 is pushed. Which tags does type=semver,pattern={{major}}.{{minor}} produce?", options: ["v1.4.2", "1.4", "1", "latest"], answer: 1, why: "The pattern keeps major and minor from the parsed version: 1.4." },
    { q: "What does load: true do in build-push-action?", options: ["Pushes to the registry", "Loads the built image into the runner's local Docker so later steps can docker run it", "Loads a cache", "Loads secrets"], answer: 1, why: "Without load (or push) a Buildx build stays in the builder cache only." },
    { q: "What does docker/setup-qemu-action add?", options: ["Faster builds", "CPU emulation so the runner can build images for other architectures like arm64", "A private registry", "Vulnerability scanning"], answer: 1, why: "QEMU lets an amd64 runner build and run arm64 layers." },
    { q: "Why use push: \${{ github.event_name != 'pull_request' }}?", options: ["To speed up builds", "Pull requests still prove the image builds, but only trusted pushes publish it", "It is required by GHCR", "To skip tests"], answer: 1, why: "Publishing untested or untrusted PR images to the registry is risky; PRs from forks also lack credentials." },
    { q: "A Trivy step has exit-code: \"0\" and finds a CRITICAL vulnerability. What happens?", options: ["The job fails", "The job passes; the finding is only reported", "The image is deleted", "Trivy fixes it"], answer: 1, why: "exit-code decides what Trivy returns when it finds issues; 0 never fails the job." },
    { q: "Your Dockerfile does COPY . . before RUN npm ci. With a layer cache, what happens when only a source file changes?", options: ["npm ci is reused from cache", "npm ci runs again, because the COPY layer changed and every later layer is rebuilt", "The build fails", "Only the final layer is rebuilt"], answer: 1, why: "A changed layer invalidates all layers after it; copy package*.json and run npm ci before copying the rest." },
  ],
};
