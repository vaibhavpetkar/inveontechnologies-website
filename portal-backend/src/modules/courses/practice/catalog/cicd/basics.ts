import type { PracticeUnit } from "../../types.js";
import { WORKFLOW, checkout, has, lacks, t, ubuntu, yq } from "./shared.js";

export const basics: PracticeUnit = {
  key: "basics",
  title: "CI/CD basics and your first GitHub Actions workflow",
  summary: "what CI and CD mean, pipeline stages, and GitHub Actions workflows with triggers, jobs, steps, runners and actions",
  reading: t`## What CI and CD mean

Continuous Integration (CI) means every developer merges small changes into the main branch often, and every push is automatically built and tested. If a test fails, the team knows within minutes which change broke it, instead of discovering it a week later.

Continuous Delivery (CD) goes one step further: every change that passes CI is packaged and ready to release, and releasing is one button press. Continuous Deployment removes the button: every green change goes to production automatically. Many Indian product companies run continuous delivery to staging and use a manual approval for production.

A pipeline is the list of stages a change passes through:

- Source: a push or a pull request starts the pipeline.
- Build: install dependencies and compile or bundle the code.
- Test: unit tests, linting, then integration tests.
- Package: produce an artifact (a zip, a Docker image, a jar).
- Deploy: ship the artifact to staging, then production.
- Verify: smoke tests and monitoring confirm the release is healthy.

The golden rule: build once, deploy the same artifact everywhere. Never rebuild for production.

## GitHub Actions in one picture

A workflow is a YAML file in .github/workflows/ in your repository. It has triggers (on), and one or more jobs. Each job runs on a fresh virtual machine called a runner and has a list of steps. A step either runs shell commands (run) or uses a ready-made action (uses).

` + "```yaml" + t`
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
` + "```" + t`

- on lists the events: push, pull_request, schedule (cron), workflow_dispatch (a manual Run button) and many more.
- runs-on picks the runner: ubuntu-latest, windows-latest or macos-latest, or a self-hosted machine.
- actions/checkout clones your repository into the runner. Without it the runner is an empty machine and npm ci fails with "no package.json".
- actions/setup-node, setup-python and setup-java install a language version. with passes inputs to an action.
- Pin actions to a major version like @v4 (or a full commit SHA for maximum safety), never to a moving branch.

## Jobs and steps

Jobs run in parallel by default, each on its own runner, so they share nothing. Use needs to order them: a deploy job with needs: test waits for test and is skipped if test fails. Steps inside a job run one after another on the same machine and share files.

Useful job and step keys:

- name: a readable label shown in the Actions tab.
- if: a condition, such as if: github.ref == 'refs/heads/main' or if: failure().
- timeout-minutes: stops a stuck job (the default is 360 minutes, which burns your free minutes).
- working-directory (or defaults.run.working-directory) for projects in a sub-folder.
- concurrency: a group name so a new push cancels the older run of the same branch.

## Expressions and contexts

Anything inside \${{ }} is an expression. Contexts give you data: github.sha (the commit), github.ref_name (the branch), github.event_name, matrix, secrets, vars, env and needs. Example: run: echo "Building \${{ github.sha }}".

## Common mistakes

- Putting the file anywhere except .github/workflows/ (the file name can be anything ending in .yml).
- Tabs or wrong indentation. YAML uses spaces, two per level, and a space after every colon.
- Forgetting actions/checkout.
- Using npm install instead of npm ci in CI: npm ci installs exactly what package-lock.json says and fails if it is out of date.
- Writing on: push without a branch filter on a busy repository, so every feature branch runs expensive deploy jobs.

## How your assignments are checked

Upload the workflow file (.yml). The reviewer checks the YAML line by line (tabs, a missing space after a colon, odd indentation) and then checks the keys each question asks for, such as the trigger, the runner, the actions used and the commands run. Comments are ignored, so the answer must be real YAML, not a comment.`,
  questions: [
    yq({
      title: "First workflow on push",
      brief: "Write a workflow named CI that runs whenever code is pushed to the main branch. It has one job called build that runs on the latest Ubuntu runner, checks out the code and prints the commit SHA.",
      steps: ["name: CI at the top", "Trigger: push to the main branch only", "One job called build on ubuntu-latest", "Steps: actions/checkout, then a run step that echoes \${{ github.sha }}"],
      starter: WORKFLOW,
      solution: t`name: CI

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Show the commit
        run: echo "Building commit \${{ github.sha }}"
`,
      rules: [
        has(String.raw`^name:\s*CI\s*$`, "The workflow is named CI", "m"),
        has(String.raw`on:\s*\n\s+push:\s*\n\s+branches:\s*\[?\s*-?\s*["']?main`, "Runs on push to main"),
        has(String.raw`^\s{2}build:\s*$`, "Has a job called build", "m"),
        ubuntu,
        checkout,
        has(String.raw`run:.*\$\{\{\s*github\.sha\s*\}\}`, "Prints github.sha in a run step"),
      ],
    }),
    yq({
      title: "Push and pull request triggers",
      brief: "Run the tests for every push to main and for every pull request that targets main. The job is called test and runs npm ci and npm test after checking out the code.",
      steps: ["Triggers: push (branch main) and pull_request (branch main)", "Job test on ubuntu-latest", "Steps: checkout, npm ci, npm test"],
      starter: WORKFLOW,
      solution: t`name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`^\s+push:`, "Has a push trigger", "m"),
        has(String.raw`^\s+pull_request:\s*\n\s+branches:\s*\[?\s*-?\s*["']?main`, "pull_request is limited to main", "m"),
        checkout,
        has(String.raw`run:\s*npm ci\b`, "Installs with npm ci"),
        has(String.raw`run:\s*npm (run )?test\b`, "Runs npm test"),
      ],
    }),
    yq({
      title: "Node.js build job",
      brief: "Build a Node.js project in CI. Install Node.js 22 with actions/setup-node, install dependencies, run the build and then the tests.",
      steps: ["Trigger on push and pull_request", "Use actions/setup-node with node-version 22", "Run npm ci, npm run build and npm test as separate steps"],
      starter: WORKFLOW,
      solution: t`name: Node CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Test
        run: npm test
`,
      rules: [
        checkout,
        has(String.raw`uses:\s*actions/setup-node@v\d+`, "Uses actions/setup-node"),
        has(String.raw`node-version:\s*["']?22`, "Sets node-version to 22"),
        has(String.raw`run:\s*npm ci\b`, "Installs with npm ci"),
        has(String.raw`run:\s*npm run build\b`, "Runs npm run build"),
        has(String.raw`npm ci[\s\S]*npm run build[\s\S]*npm (run )?test`, "Install, build and test run in that order"),
      ],
    }),
    yq({
      title: "Python test job",
      brief: "Run a Python project's tests with pytest on Python 3.12.",
      steps: ["Trigger on push", "Use actions/setup-python with python-version \"3.12\" (quote it, or YAML reads 3.10 as 3.1)", "Install with pip install -r requirements.txt, then run pytest"],
      starter: WORKFLOW,
      solution: t`name: Python tests

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python -m pip install --upgrade pip
      - run: pip install -r requirements.txt
      - run: pytest
`,
      rules: [
        checkout,
        has(String.raw`uses:\s*actions/setup-python@v\d+`, "Uses actions/setup-python"),
        has(String.raw`python-version:\s*["']3\.12["']`, "python-version is the quoted string \"3.12\""),
        has(String.raw`pip install -r requirements\.txt`, "Installs requirements.txt"),
        has(String.raw`run:\s*(python -m )?pytest\b`, "Runs pytest"),
      ],
    }),
    yq({
      title: "Two jobs with needs",
      brief: "Split the pipeline into a lint job and a test job. The test job must only start after lint has passed.",
      steps: ["Job lint: checkout, npm ci, npm run lint", "Job test: needs lint; checkout, npm ci, npm test", "Remember each job runs on a fresh runner, so both need checkout"],
      starter: WORKFLOW,
      solution: t`name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`^\s{2}lint:\s*$`, "Has a lint job", "m"),
        has(String.raw`^\s{2}test:\s*$`, "Has a test job", "m"),
        has(String.raw`needs:\s*\[?\s*lint\b`, "test needs lint"),
        has(String.raw`actions/checkout@v\d+[\s\S]*actions/checkout@v\d+`, "Both jobs check out the code"),
        has(String.raw`npm run lint`, "Runs npm run lint"),
      ],
    }),
    yq({
      title: "Nightly scheduled workflow",
      brief: "Run a full test suite every night at 02:30 UTC (8:00 AM IST), and also allow it to be started by hand from the Actions tab.",
      steps: ["Use schedule with a cron expression for 02:30 UTC every day", "Add workflow_dispatch for the manual Run button", "Job: checkout, npm ci, npm run test:full"],
      starter: WORKFLOW,
      solution: t`name: Nightly

on:
  schedule:
    - cron: "30 2 * * *"
  workflow_dispatch:

jobs:
  full-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:full
`,
      rules: [
        has(String.raw`schedule:\s*\n\s+-\s*cron:`, "Has a schedule trigger with a cron entry"),
        has(String.raw`cron:\s*["']30 2 \* \* \*["']`, "The cron is \"30 2 * * *\" (quoted)"),
        has(String.raw`^\s+workflow_dispatch:`, "Can be started by hand with workflow_dispatch", "m"),
        has(String.raw`npm run test:full`, "Runs the full test suite"),
      ],
    }),
    yq({
      title: "Run only when code changes",
      brief: "The repository has a docs/ folder that changes often. Run the CI workflow on push to main only when files under src/ or package.json or package-lock.json change.",
      steps: ["push to main with a paths filter", "paths: src/**, package.json, package-lock.json", "Job: checkout, npm ci, npm test"],
      starter: WORKFLOW,
      solution: t`name: CI

on:
  push:
    branches: [main]
    paths:
      - "src/**"
      - "package.json"
      - "package-lock.json"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`paths:\s*\n`, "Uses a paths filter"),
        has(String.raw`-\s*["']?src/\*\*["']?`, "Includes src/**"),
        has(String.raw`-\s*["']?package\.json["']?`, "Includes package.json"),
        has(String.raw`-\s*["']?package-lock\.json["']?`, "Includes package-lock.json"),
        checkout,
      ],
    }),
    yq({
      title: "Project in a sub-folder",
      brief: "The React app lives in the frontend/ folder of the repository. Make every run step of the job work inside frontend/ without writing cd in each step, and give every step a name.",
      steps: ["Set defaults.run.working-directory to frontend on the job", "Named steps: Check out, Set up Node, Install, Build", "Node.js 22 with actions/setup-node"],
      starter: WORKFLOW,
      solution: t`name: Frontend

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - name: Check out
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
`,
      rules: [
        has(String.raw`defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*["']?\.?/?frontend`, "defaults.run.working-directory is frontend"),
        has(String.raw`name:\s*Check out`, "Has a step named Check out"),
        has(String.raw`name:\s*Install\s*\n\s+run:\s*npm ci`, "The Install step runs npm ci"),
        has(String.raw`name:\s*Build\s*\n\s+run:\s*npm run build`, "The Build step runs npm run build"),
        lacks(String.raw`\bcd\s+frontend`, "Does not use cd frontend"),
      ],
    }),
    yq({
      title: "Timeouts and cancelling old runs",
      brief: "Developers push several times in a row, and old runs waste minutes. Make a new run of the same branch cancel the one still in progress, and stop the test job if it runs longer than 15 minutes.",
      steps: ["concurrency at the workflow level: group built from github.workflow and github.ref", "cancel-in-progress: true", "timeout-minutes: 15 on the test job"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: CI

on: [push, pull_request]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
`,
      rules: [
        has(String.raw`^concurrency:`, "Has a workflow-level concurrency block", "m"),
        has(String.raw`group:.*github\.ref`, "The group includes github.ref"),
        has(String.raw`cancel-in-progress:\s*true`, "cancel-in-progress is true"),
        has(String.raw`timeout-minutes:\s*15\b`, "The job has timeout-minutes: 15"),
      ],
    }),
    yq({
      title: "Conditional steps",
      brief: "In one job: run the tests; if any earlier step failed, print a message pointing to the logs; and only on pushes to main (not pull requests), print \"Ready to deploy\".",
      steps: ["A step with if: failure() that echoes a message", "A step with an if that checks github.event_name == 'push' and github.ref == 'refs/heads/main'", "Use single quotes for strings inside expressions"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - name: Explain the failure
        if: failure()
        run: echo "Tests failed. Open the Test step above to see which test broke."
      - name: Main branch only
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: echo "Ready to deploy"
`,
      rules: [
        has(String.raw`if:\s*\$?\{?\{?\s*failure\(\)`, "A step runs if: failure()"),
        has(String.raw`if:.*github\.event_name\s*==\s*'push'`, "Checks github.event_name == 'push'"),
        has(String.raw`if:.*github\.ref\s*==\s*'refs/heads/main'`, "Checks github.ref == 'refs/heads/main'"),
        has(String.raw`echo\s+["']?Ready to deploy`, "Prints Ready to deploy"),
      ],
    }),
  ],
  quiz: [
    { q: "Where must a GitHub Actions workflow file be stored?", options: [".github/actions/", ".github/workflows/", "the repository root", ".ci/"], answer: 1, why: "GitHub only reads workflow files from .github/workflows/ (any name ending in .yml or .yaml)." },
    { q: "What is the difference between continuous delivery and continuous deployment?", options: ["They are the same", "Delivery keeps every change releasable with a manual release step; deployment releases every green change automatically", "Delivery is for mobile apps, deployment for web apps", "Deployment skips the tests"], answer: 1, why: "Continuous deployment removes the human approval that continuous delivery keeps before production." },
    { q: "Which key chooses the machine a job runs on?", options: ["image", "runs-on", "machine", "agent"], answer: 1, why: "runs-on picks the runner, e.g. ubuntu-latest or a self-hosted label." },
    { q: "Why does a job usually start with actions/checkout?", options: ["It installs Git", "The runner starts empty; checkout clones the repository into it", "It logs in to GitHub", "It caches dependencies"], answer: 1, why: "Every job runs on a fresh runner, so the code must be checked out before it can be built." },
    { q: "Two jobs build and test have no needs key. How do they run?", options: ["build, then test", "In parallel on separate runners", "In alphabetical order", "Only the first one runs"], answer: 1, why: "Jobs run in parallel unless needs creates a dependency." },
    { q: "Which trigger adds a manual Run workflow button?", options: ["manual", "workflow_run", "workflow_dispatch", "repository_dispatch"], answer: 2, why: "workflow_dispatch lets you start the workflow by hand from the Actions tab (with optional inputs)." },
    { q: "Why prefer npm ci over npm install in a pipeline?", options: ["It is the only command that runs tests", "It installs exactly the versions in package-lock.json and fails if the lock file is out of sync", "It skips devDependencies", "It updates packages to the latest version"], answer: 1, why: "Reproducible installs are the point of CI; npm ci never silently changes the lock file." },
    { q: "A workflow has python-version: 3.10 without quotes. Which Python does setup-python install?", options: ["3.10", "3.1, because YAML reads 3.10 as the number 3.1", "The latest Python", "It fails to parse"], answer: 1, why: "Unquoted 3.10 is a float, which becomes 3.1. Always quote versions: \"3.10\"." },
    { q: "Job deploy has needs: test and test fails. What happens to deploy?", options: ["It runs anyway", "It is skipped", "It waits forever", "It runs with the previous commit"], answer: 1, why: "A job whose needs failed is skipped unless its if uses always() or failure()." },
    { q: "A step has if: failure(). When does it run?", options: ["Always", "Only when an earlier step in the job has failed", "Only when the workflow was cancelled", "Never, failure() is not a function"], answer: 1, why: "failure() is true when a previous step failed; steps normally stop running after a failure unless their if says otherwise." },
  ],
};
