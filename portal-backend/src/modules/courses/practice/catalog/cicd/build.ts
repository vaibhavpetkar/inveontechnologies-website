import type { PracticeUnit } from "../../types.js";
import { WORKFLOW, checkout, has, t, yq } from "./shared.js";

export const build: PracticeUnit = {
  key: "build-test",
  title: "Building and testing: matrices, caching and artifacts",
  summary: "matrix builds, dependency caching, artifacts between jobs, service containers and a lint-test-build pipeline",
  reading: t`## Test on many versions with a matrix

Your library may need to work on Node 20 and 22, or on Linux and Windows. Instead of copying the job, give it a strategy.matrix. GitHub creates one job per combination and fills in the matrix context.

` + "```yaml" + t`
jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
` + "```" + t`

That is 2 x 2 = 4 jobs. fail-fast is true by default, which cancels the other matrix jobs as soon as one fails; set it to false when you want the full picture. exclude removes combinations you don't support, include adds extra ones (or extra keys to existing ones), and max-parallel limits how many run at once.

## Caching dependencies

Downloading every package on every run is slow. Caching saves a folder at the end of a job and restores it at the start of the next one, keyed by a hash of the lock file:

` + "```yaml" + t`
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: \${{ runner.os }}-pip-\${{ hashFiles('**/requirements.txt') }}
    restore-keys: |
      \${{ runner.os }}-pip-
` + "```" + t`

- When requirements.txt changes, the hash changes, so the key misses and a fresh cache is saved.
- restore-keys is a fallback: an older cache with the same prefix is restored, so only the new packages download.
- The setup actions have caching built in: actions/setup-node with cache: npm, setup-python with cache: pip, setup-java with cache: maven. Prefer these when they fit.
- Cache the package manager's download folder (~/.npm), not node_modules, because npm ci deletes node_modules anyway.

## Artifacts: files that outlive a job

Jobs don't share a disk. To hand the build output to a later job, or to let a person download a test report, upload it as an artifact:

` + "```yaml" + t`
- uses: actions/upload-artifact@v4
  with:
    name: dist
    path: dist/
    retention-days: 7
` + "```" + t`

A later job (with needs: build) uses actions/download-artifact@v4 with the same name. Caches are for speed and may disappear; artifacts are for results you need. Use if: always() on the upload step of a test report, so the report is saved even when tests fail, which is exactly when you need it.

## Service containers

Integration tests often need a real database. services starts Docker containers next to the job:

` + "```yaml" + t`
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: postgres
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-retries 5
` + "```" + t`

The health options make the job wait until the database accepts connections. Your tests then connect to localhost:5432.

## Shaping a good pipeline

- Fast checks first: lint and unit tests fail in seconds; run slow end-to-end tests only after they pass.
- Use needs to build a graph: build needs both lint and test, written needs: [lint, test].
- Keep jobs independent enough to run in parallel; that is where CI speed comes from.
- Fail the build on real problems only. A flaky test that sometimes fails teaches people to ignore red builds.

## Common mistakes

- A cache key without hashFiles, so the cache never updates.
- Uploading node_modules as an artifact (huge and slow).
- Forgetting needs, so the deploy job starts before the build job has uploaded the artifact.
- Using matrix values without the matrix. prefix, e.g. \${{ node-version }}.

## How your assignments are checked

Upload the workflow .yml file. The reviewer checks the YAML formatting line by line, then looks for the pieces each question asks for: the matrix and its values, the cache key and path, the artifact name and path, needs between jobs and the service container settings.`,
  questions: [
    yq({
      title: "Node version matrix",
      brief: "Test a Node.js library on Node 20 and Node 22 using a matrix instead of two copied jobs.",
      steps: ["strategy.matrix.node-version: [20, 22]", "setup-node uses \${{ matrix.node-version }}", "Steps: checkout, setup-node, npm ci, npm test"],
      starter: WORKFLOW,
      solution: t`name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`strategy:\s*\n\s+(fail-fast:.*\n\s+)?matrix:`, "Uses strategy.matrix"),
        has(String.raw`node-version:\s*\[\s*20\s*,\s*22\s*\]`, "The matrix lists 20 and 22"),
        has(String.raw`node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}`, "setup-node reads matrix.node-version"),
        checkout,
        has(String.raw`run:\s*npm (run )?test`, "Runs the tests"),
      ],
    }),
    yq({
      title: "Operating system matrix",
      brief: "Run a Python package's tests on Ubuntu and Windows with Python 3.11, 3.12 and 3.13, and don't cancel the other jobs when one fails.",
      steps: ["matrix os: [ubuntu-latest, windows-latest] and python-version: [\"3.11\", \"3.12\", \"3.13\"] (quoted)", "runs-on: \${{ matrix.os }}", "fail-fast: false", "Install requirements and run pytest"],
      starter: WORKFLOW,
      solution: t`name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        python-version: ["3.11", "3.12", "3.13"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
      - run: pip install -r requirements.txt
      - run: pytest
`,
      rules: [
        has(String.raw`runs-on:\s*\$\{\{\s*matrix\.os\s*\}\}`, "runs-on uses matrix.os"),
        has(String.raw`os:\s*\[\s*ubuntu-latest\s*,\s*windows-latest\s*\]`, "Matrix os lists ubuntu-latest and windows-latest"),
        has(String.raw`python-version:\s*\[\s*"3\.11"\s*,\s*"3\.12"\s*,\s*"3\.13"\s*\]`, "Matrix python-version lists the three quoted versions"),
        has(String.raw`fail-fast:\s*false`, "fail-fast is false"),
        has(String.raw`python-version:\s*\$\{\{\s*matrix\.python-version\s*\}\}`, "setup-python reads matrix.python-version"),
      ],
    }),
    yq({
      title: "Matrix exclude and include",
      brief: "Your matrix is os [ubuntu-latest, windows-latest, macos-latest] x node [20, 22]. Windows with Node 20 is not supported, so remove that combination. Also add one extra job: ubuntu-latest with Node 24 marked experimental: true, and let experimental jobs fail without failing the workflow.",
      steps: ["exclude the os windows-latest + node 20 combination", "include os ubuntu-latest, node 24, experimental true", "continue-on-error: \${{ matrix.experimental == true }} on the job"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: \${{ matrix.os }}
    continue-on-error: \${{ matrix.experimental == true }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [20, 22]
        exclude:
          - os: windows-latest
            node: 20
        include:
          - os: ubuntu-latest
            node: 24
            experimental: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`exclude:\s*\n\s+-\s*os:\s*windows-latest\s*\n\s+node:\s*20\b`, "Excludes windows-latest with node 20"),
        has(String.raw`include:\s*\n\s+-\s*os:\s*ubuntu-latest\s*\n\s+node:\s*24\b`, "Includes ubuntu-latest with node 24"),
        has(String.raw`experimental:\s*true`, "Marks the extra job experimental"),
        has(String.raw`continue-on-error:\s*\$\{\{\s*matrix\.experimental`, "continue-on-error reads matrix.experimental"),
        has(String.raw`node-version:\s*\$\{\{\s*matrix\.node\s*\}\}`, "setup-node uses matrix.node"),
      ],
    }),
    yq({
      title: "Built-in npm cache",
      brief: "Speed up a Node.js job with the cache that actions/setup-node provides, so ~/.npm is restored from the previous run.",
      steps: ["actions/setup-node with node-version 22 and cache: npm", "Then npm ci and npm test", "Don't cache node_modules"],
      starter: WORKFLOW,
      solution: t`name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`uses:\s*actions/setup-node@v\d+\s*\n\s+with:`, "setup-node has a with block"),
        has(String.raw`cache:\s*["']?npm["']?`, "cache: npm"),
        has(String.raw`run:\s*npm ci`, "Installs with npm ci"),
        { notMatch: String.raw`path:\s*\S*node_modules`, message: "Does not cache node_modules" },
      ],
    }),
    yq({
      title: "Cache pip with actions/cache",
      brief: "Cache pip downloads with actions/cache. The cache must refresh whenever requirements.txt changes and fall back to the most recent older cache otherwise.",
      steps: ["path: ~/.cache/pip", "key: \${{ runner.os }}-pip-\${{ hashFiles('**/requirements.txt') }}", "restore-keys with the prefix \${{ runner.os }}-pip-", "Then pip install -r requirements.txt and pytest"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Tests

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: \${{ runner.os }}-pip-\${{ hashFiles('**/requirements.txt') }}
          restore-keys: |
            \${{ runner.os }}-pip-
      - run: pip install -r requirements.txt
      - run: pytest
`,
      rules: [
        has(String.raw`uses:\s*actions/cache@v\d+`, "Uses actions/cache"),
        has(String.raw`path:\s*~/\.cache/pip`, "Caches ~/.cache/pip"),
        has(String.raw`key:.*hashFiles\(\s*'\*\*/requirements\.txt'\s*\)`, "The key hashes requirements.txt"),
        has(String.raw`restore-keys:\s*\|?\s*\n\s+\$\{\{\s*runner\.os\s*\}\}-pip-`, "restore-keys has the runner.os-pip- prefix"),
        has(String.raw`actions/cache@v\d+[\s\S]*pip install -r requirements\.txt`, "The cache is restored before pip install"),
      ],
    }),
    yq({
      title: "Upload the build output",
      brief: "After building a React app with npm run build, upload the dist/ folder as an artifact named web-dist that is kept for 7 days.",
      steps: ["checkout, setup-node 22, npm ci, npm run build", "actions/upload-artifact with name web-dist and path dist/", "retention-days: 7"],
      starter: WORKFLOW,
      solution: t`name: Build

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: dist/
          retention-days: 7
`,
      rules: [
        has(String.raw`uses:\s*actions/upload-artifact@v\d+`, "Uses actions/upload-artifact"),
        has(String.raw`name:\s*["']?web-dist`, "The artifact is named web-dist"),
        has(String.raw`path:\s*["']?\.?/?dist/?`, "Uploads dist/"),
        has(String.raw`retention-days:\s*7\b`, "Keeps it for 7 days"),
        has(String.raw`npm run build[\s\S]*upload-artifact`, "Uploads after the build"),
      ],
    }),
    yq({
      title: "Pass files between jobs",
      brief: "A build job creates dist/ and a deploy job must use exactly those files. Upload them as an artifact named dist in build, then download them in deploy.",
      steps: ["Job build: npm ci, npm run build, upload-artifact name dist, path dist/", "Job deploy: needs build, download-artifact name dist, path dist/", "In deploy, list the files with ls -R dist"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Build and deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - run: ls -R dist
`,
      rules: [
        has(String.raw`uses:\s*actions/upload-artifact@v\d+\s*\n\s+with:\s*\n\s+name:\s*dist\b`, "build uploads an artifact named dist"),
        has(String.raw`uses:\s*actions/download-artifact@v\d+\s*\n\s+with:\s*\n\s+name:\s*dist\b`, "deploy downloads the artifact named dist"),
        has(String.raw`needs:\s*\[?\s*build\b`, "deploy needs build"),
        has(String.raw`ls -R dist`, "Lists the downloaded files"),
      ],
    }),
    yq({
      title: "PostgreSQL service for integration tests",
      brief: "Integration tests need PostgreSQL 16. Start it as a service container, wait until it is healthy, and pass the connection string to the test step.",
      steps: ["services.postgres with image postgres:16", "env POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB (use app / app / app_test)", "ports 5432:5432 and health options with pg_isready", "Test step env DATABASE_URL: postgresql://app:app@localhost:5432/app_test"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Integration tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app
          POSTGRES_DB: app_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://app:app@localhost:5432/app_test
`,
      rules: [
        has(String.raw`services:\s*\n\s+postgres:\s*\n\s+image:\s*postgres:16`, "Starts a postgres:16 service"),
        has(String.raw`POSTGRES_PASSWORD:\s*\S+`, "Sets POSTGRES_PASSWORD"),
        has(String.raw`-\s*["']?5432:5432`, "Maps port 5432"),
        has(String.raw`--health-cmd\s+["']?pg_isready`, "Waits for the database with a pg_isready health check"),
        has(String.raw`DATABASE_URL:\s*["']?postgres(ql)?://app:app@localhost:5432/app_test`, "Passes DATABASE_URL to the tests"),
      ],
    }),
    yq({
      title: "Always keep the test report",
      brief: "Run the tests with coverage, and upload the coverage/ folder as an artifact named coverage-report even when the tests fail.",
      steps: ["run: npm test -- --coverage", "Upload step with if: always()", "Artifact name coverage-report, path coverage/"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test -- --coverage
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
`,
      rules: [
        has(String.raw`npm (run )?test -- --coverage`, "Runs the tests with coverage"),
        has(String.raw`if:\s*\$?\{?\{?\s*always\(\)`, "The upload step has if: always()"),
        has(String.raw`name:\s*coverage-report`, "The artifact is named coverage-report"),
        has(String.raw`path:\s*["']?coverage/?`, "Uploads coverage/"),
      ],
    }),
    yq({
      title: "Lint, test and build pipeline",
      brief: "Write a three-job pipeline: lint and test run in parallel, and build runs only when both have passed. Every job uses Node 22 with the npm cache.",
      steps: ["Jobs lint (npm run lint), test (npm test) and build (npm run build)", "build has needs: [lint, test]", "Each job: checkout, setup-node 22 with cache npm, npm ci"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Pipeline

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
`,
      rules: [
        has(String.raw`needs:\s*\[\s*(lint\s*,\s*test|test\s*,\s*lint)\s*\]`, "build needs both lint and test"),
        has(String.raw`^\s{2}lint:\s*$[\s\S]*^\s{2}test:\s*$[\s\S]*^\s{2}build:\s*$`, "Has lint, test and build jobs", "m"),
        has(String.raw`(cache:\s*["']?npm[\s\S]*){3}`, "All three jobs use the npm cache"),
        has(String.raw`npm run lint[\s\S]*npm (run )?test[\s\S]*npm run build`, "Runs lint, test and build"),
      ],
    }),
  ],
  quiz: [
    { q: "A matrix has os: [ubuntu-latest, windows-latest] and node: [18, 20, 22]. How many jobs run?", options: ["2", "3", "5", "6"], answer: 3, why: "A matrix runs every combination: 2 x 3 = 6 jobs." },
    { q: "What does fail-fast: true (the default) do?", options: ["Stops the workflow at the first failing step", "Cancels the remaining matrix jobs as soon as one matrix job fails", "Retries failed jobs", "Skips slow tests"], answer: 1, why: "fail-fast cancels in-progress and queued matrix jobs when any one of them fails." },
    { q: "Why include hashFiles('**/package-lock.json') in a cache key?", options: ["To encrypt the cache", "So the key changes whenever dependencies change and a fresh cache is saved", "To make the cache public", "It is required syntax"], answer: 1, why: "A cache is saved per key; a new lock file gives a new key and a fresh cache." },
    { q: "What is restore-keys for in actions/cache?", options: ["It deletes old caches", "A fallback prefix: when the exact key misses, the newest cache with that prefix is restored", "It sets the cache password", "It lists files to exclude"], answer: 1, why: "Partial matches let the job start from a slightly older cache and only download what changed." },
    { q: "What is the main difference between a cache and an artifact?", options: ["There is none", "Caches speed up later runs and may be evicted; artifacts are outputs you keep and can download or pass to later jobs", "Artifacts are faster", "Caches can only hold Docker images"], answer: 1, why: "Use a cache for dependencies and an artifact for build output and reports." },
    { q: "Job deploy downloads an artifact uploaded by job build, but sometimes fails with 'artifact not found'. What is most likely missing?", options: ["retention-days", "needs: build on the deploy job", "a cache key", "permissions: write-all"], answer: 1, why: "Without needs both jobs start together, so deploy may run before build has uploaded anything." },
    { q: "Why add --health-cmd pg_isready to a postgres service?", options: ["It creates the database", "The job waits until PostgreSQL accepts connections before running the steps", "It exposes the port", "It makes the service faster"], answer: 1, why: "Without a health check the tests may start while the database is still booting." },
    { q: "In a matrix job, how do you read the node value inside a step?", options: ["\${{ node }}", "\${{ env.node }}", "\${{ matrix.node }}", "$node"], answer: 2, why: "Matrix values live in the matrix context." },
    { q: "A report upload step has no if condition and the test step before it fails. What happens?", options: ["The report is uploaded", "The upload step is skipped, so the report is lost exactly when you need it", "The workflow retries the tests", "The upload runs twice"], answer: 1, why: "Steps after a failure are skipped by default; add if: always() (or failure()) to keep reports." },
    { q: "include adds a key experimental: true to an existing matrix combination and the job has continue-on-error: \${{ matrix.experimental == true }}. That combination fails. What is the workflow result?", options: ["Failed", "Successful, because that job is allowed to fail", "Cancelled", "It depends on fail-fast only"], answer: 1, why: "continue-on-error at job level lets that job fail without failing the workflow run." },
  ],
};
