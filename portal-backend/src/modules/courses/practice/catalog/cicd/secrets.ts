import type { PracticeUnit } from "../../types.js";
import { WORKFLOW, has, lacks, t, yq } from "./shared.js";

export const secrets: PracticeUnit = {
  key: "secrets",
  title: "Variables, secrets and environments",
  summary: "env variables, secrets and configuration variables, GITHUB_TOKEN permissions, environments with approvals, job outputs, manual inputs, OIDC and reusable workflows",
  reading: t`## Environment variables

env can be set at three levels, and the closest one wins: the whole workflow, one job, or one step.

` + "```yaml" + t`
env:
  NODE_ENV: production

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      APP_NAME: shop
    steps:
      - run: echo "$APP_NAME in $NODE_ENV mode"
        env:
          LOG_LEVEL: debug
` + "```" + t`

Inside run you read them like any shell variable ($APP_NAME). In other keys (with, if) you use the env context: \${{ env.APP_NAME }}. GitHub also sets its own variables such as GITHUB_SHA, GITHUB_REF_NAME and GITHUB_REPOSITORY.

## Secrets and configuration variables

Never write a password, API key or token in a workflow file: the repository history keeps it forever. Store it in Settings > Secrets and variables > Actions, then read it with \${{ secrets.NAME }}. GitHub masks secret values in logs (they print as ***).

- Pass secrets to a step through env, not straight on the command line, so they don't end up in shell history or process lists.
- Secrets are not given to workflows triggered by pull requests from forks, so a stranger's PR can't steal them.
- Non-secret settings (an app name, a region, a URL) go in configuration variables and are read with \${{ vars.NAME }}.
- If a script creates a sensitive value at run time, hide it with echo "::add-mask::$VALUE".

## GITHUB_TOKEN and permissions

Every run gets an automatic GITHUB_TOKEN that expires when the job ends. Give it only what the job needs:

` + "```yaml" + t`
permissions:
  contents: read
  packages: write
` + "```" + t`

Once you list any permission, everything you didn't list becomes none. Least privilege limits the damage if a third-party action is ever compromised.

## Environments and approvals

An environment (Settings > Environments) such as staging or production can have required reviewers, a wait timer, branch restrictions and its own secrets. A job that says environment: production pauses until a reviewer approves, and only then can it read production's secrets.

` + "```yaml" + t`
deploy-production:
  needs: deploy-staging
  runs-on: ubuntu-latest
  environment:
    name: production
    url: https://shop.example.com
` + "```" + t`

## Passing values between steps and jobs

A step writes name=value lines to the file in $GITHUB_OUTPUT. Give the step an id and other steps read steps.<id>.outputs.<name>. To hand the value to another job, list it under the job's outputs and read it there with needs.<job>.outputs.<name>. The old ::set-output command is deprecated; always use $GITHUB_OUTPUT.

## Manual runs with inputs

workflow_dispatch can ask for inputs: a choice, a boolean or a string, read with \${{ inputs.name }}. This is handy for "deploy this version to this environment" buttons.

## Cloud access without long-lived keys (OIDC)

Instead of saving an AWS access key as a secret, let GitHub prove who it is with OpenID Connect. Grant permissions id-token: write, create an IAM role that trusts token.actions.githubusercontent.com for your repository, and use aws-actions/configure-aws-credentials with role-to-assume. The credentials last one hour and there is nothing to leak or rotate.

## Reusable workflows

A workflow with on: workflow_call can be called from other workflows like a function, with inputs and secrets. Write your deploy logic once and call it for staging and production. The caller uses uses: ./.github/workflows/deploy.yml at the job level, passes with: and secrets: (or secrets: inherit).

## Common mistakes

- Echoing a secret or writing it to a file that is uploaded as an artifact.
- Using secrets in if conditions (they are not available there); put a flag in env first.
- permissions: write-all "to make it work".
- Forgetting id-token: write, so OIDC fails with "Could not load credentials".

## How your assignments are checked

Upload the workflow .yml file. The checker looks for the keys each question asks for (env levels, secrets and vars expressions, permissions, environment names, outputs and inputs) and fails answers that hard-code a secret value.`,
  questions: [
    yq({
      title: "Environment variables at three levels",
      brief: "Set NODE_ENV=production for the whole workflow, APP_NAME=shop for the build job, and LOG_LEVEL=debug for one step that prints all three.",
      steps: ["Workflow-level env NODE_ENV: production", "Job-level env APP_NAME: shop", "Step-level env LOG_LEVEL: debug on the step that runs echo \"$APP_NAME $NODE_ENV $LOG_LEVEL\""],
      starter: WORKFLOW,
      solution: t`name: Env demo

on: push

env:
  NODE_ENV: production

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      APP_NAME: shop
    steps:
      - name: Print settings
        run: echo "$APP_NAME $NODE_ENV $LOG_LEVEL"
        env:
          LOG_LEVEL: debug
`,
      rules: [
        has(String.raw`^env:\s*\n\s{2}NODE_ENV:\s*production`, "Workflow-level NODE_ENV: production", "m"),
        has(String.raw`^\s{4}env:\s*\n\s{6}APP_NAME:\s*shop`, "Job-level APP_NAME: shop", "m"),
        has(String.raw`^\s{8}env:\s*\n\s{10}LOG_LEVEL:\s*debug`, "Step-level LOG_LEVEL: debug", "m"),
        has(String.raw`echo.*\$APP_NAME.*\$NODE_ENV.*\$LOG_LEVEL`, "Prints the three variables"),
      ],
    }),
    yq({
      title: "Use an API key secret",
      brief: "The integration tests need a payment gateway key. It is stored as the repository secret RAZORPAY_KEY. Pass it to the test step as the environment variable RAZORPAY_KEY without ever writing the key in the file.",
      steps: ["Step env RAZORPAY_KEY: \${{ secrets.RAZORPAY_KEY }}", "Run npm run test:integration", "Don't echo the secret"],
      starter: WORKFLOW,
      solution: t`name: Integration

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Integration tests
        run: npm run test:integration
        env:
          RAZORPAY_KEY: \${{ secrets.RAZORPAY_KEY }}
`,
      rules: [
        has(String.raw`RAZORPAY_KEY:\s*\$\{\{\s*secrets\.RAZORPAY_KEY\s*\}\}`, "Reads the key from secrets.RAZORPAY_KEY"),
        has(String.raw`npm run test:integration`, "Runs the integration tests"),
        lacks(String.raw`echo[^\n]*(RAZORPAY_KEY|secrets\.)`, "Never echoes the secret"),
        lacks(String.raw`rzp_(test|live)_\w+`, "No key is hard-coded"),
      ],
    }),
    yq({
      title: "Configuration variables",
      brief: "The app name and AWS region are not secret. They are stored as repository variables APP_NAME and AWS_REGION. Use them in a step that prints \"Deploying <app> to <region>\".",
      steps: ["Read \${{ vars.APP_NAME }} and \${{ vars.AWS_REGION }}", "Put them in step env and echo them", "Use vars, not secrets, for non-secret values"],
      starter: WORKFLOW,
      solution: t`name: Config

on: workflow_dispatch

jobs:
  show:
    runs-on: ubuntu-latest
    steps:
      - name: Show target
        run: echo "Deploying $APP_NAME to $AWS_REGION"
        env:
          APP_NAME: \${{ vars.APP_NAME }}
          AWS_REGION: \${{ vars.AWS_REGION }}
`,
      rules: [
        has(String.raw`\$\{\{\s*vars\.APP_NAME\s*\}\}`, "Reads vars.APP_NAME"),
        has(String.raw`\$\{\{\s*vars\.AWS_REGION\s*\}\}`, "Reads vars.AWS_REGION"),
        has(String.raw`echo\s+"Deploying`, "Prints Deploying ..."),
        lacks(String.raw`secrets\.(APP_NAME|AWS_REGION)`, "Uses vars, not secrets, for these values"),
      ],
    }),
    yq({
      title: "Least-privilege token",
      brief: "A workflow only reads the code and posts a comment on the pull request. Restrict GITHUB_TOKEN to exactly that: read contents and write pull-requests.",
      steps: ["Workflow-level permissions: contents: read, pull-requests: write", "Trigger: pull_request", "Use gh pr comment with GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: PR comment

on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Thank the author
        run: gh pr comment "$PR_NUMBER" --body "Thanks! CI is running."
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
`,
      rules: [
        has(String.raw`^permissions:\s*\n`, "Sets permissions at workflow level", "m"),
        has(String.raw`contents:\s*read`, "contents: read"),
        has(String.raw`pull-requests:\s*write`, "pull-requests: write"),
        lacks(String.raw`write-all`, "Does not use write-all"),
        has(String.raw`GH_TOKEN:\s*\$\{\{\s*(secrets\.GITHUB_TOKEN|github\.token)\s*\}\}`, "Passes GITHUB_TOKEN as GH_TOKEN"),
      ],
    }),
    yq({
      title: "Staging then production with approval",
      brief: "On push to main, deploy to staging automatically, then to production. The production job must use the production environment (which has required reviewers configured in Settings) and show the site URL https://shop.example.com.",
      steps: ["Job deploy-staging with environment: staging", "Job deploy-production with needs: deploy-staging", "environment: name production, url https://shop.example.com", "Each job runs ./deploy.sh with its environment name"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh staging

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://shop.example.com
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh production
`,
      rules: [
        has(String.raw`environment:\s*(staging|\n\s+name:\s*staging)`, "deploy-staging uses the staging environment"),
        has(String.raw`needs:\s*\[?\s*deploy-staging`, "Production waits for staging"),
        has(String.raw`environment:\s*\n\s+name:\s*production`, "deploy-production uses the production environment"),
        has(String.raw`url:\s*https://shop\.example\.com`, "Shows the production URL"),
        has(String.raw`deploy\.sh production`, "Runs the production deploy"),
      ],
    }),
    yq({
      title: "Job outputs",
      brief: "Job version computes a version string like 1.4.0-<short sha> and a later job release prints it. Use $GITHUB_OUTPUT and job outputs.",
      steps: ["In job version, a step with id: ver writes version=... to $GITHUB_OUTPUT", "Job-level outputs: version: \${{ steps.ver.outputs.version }}", "Job release needs version and echoes \${{ needs.version.outputs.version }}"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: Release

on: workflow_dispatch

jobs:
  version:
    runs-on: ubuntu-latest
    outputs:
      version: \${{ steps.ver.outputs.version }}
    steps:
      - id: ver
        run: echo "version=1.4.0-\${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

  release:
    needs: version
    runs-on: ubuntu-latest
    steps:
      - run: echo "Releasing \${{ needs.version.outputs.version }}"
`,
      rules: [
        has(String.raw`id:\s*ver\b`, "The step has id: ver"),
        has(String.raw`echo\s+"?version=.*>>\s*"?\$GITHUB_OUTPUT`, "Writes version=... to $GITHUB_OUTPUT"),
        has(String.raw`outputs:\s*\n\s+version:\s*\$\{\{\s*steps\.ver\.outputs\.version\s*\}\}`, "Exposes it as a job output"),
        has(String.raw`\$\{\{\s*needs\.version\.outputs\.version\s*\}\}`, "The release job reads needs.version.outputs.version"),
        lacks(String.raw`::set-output`, "Doesn't use the deprecated ::set-output"),
      ],
    }),
    yq({
      title: "Manual deploy with inputs",
      brief: "Add a manual Run button that asks which environment to deploy to (staging or production, default staging) and whether to run database migrations (a boolean, default false).",
      steps: ["workflow_dispatch with inputs environment (type: choice, options staging and production) and migrate (type: boolean)", "The job uses environment: \${{ inputs.environment }}", "A migrations step runs only if: inputs.migrate"],
      level: "intermediate",
      starter: WORKFLOW,
      solution: t`name: Manual deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: Where to deploy
        type: choice
        options:
          - staging
          - production
        default: staging
      migrate:
        description: Run database migrations
        type: boolean
        default: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: \${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v4
      - name: Migrate
        if: inputs.migrate
        run: npm run migrate
      - run: ./deploy.sh "\${{ inputs.environment }}"
`,
      rules: [
        has(String.raw`workflow_dispatch:\s*\n\s+inputs:`, "workflow_dispatch has inputs"),
        has(String.raw`type:\s*choice\s*\n\s+options:\s*\n\s+-\s*staging\s*\n\s+-\s*production`, "environment is a choice of staging and production"),
        has(String.raw`type:\s*boolean`, "migrate is a boolean"),
        has(String.raw`environment:\s*\$\{\{\s*inputs\.environment\s*\}\}`, "The job's environment comes from the input"),
        has(String.raw`if:\s*\$?\{?\{?\s*inputs\.migrate`, "Migrations run only when migrate is true"),
      ],
    }),
    yq({
      title: "AWS access with OIDC",
      brief: "Deploy to AWS without storing access keys. Let the job request an OIDC token and assume the IAM role whose ARN is in the repository variable AWS_ROLE_ARN, in the Mumbai region (ap-south-1). Then print the caller identity.",
      steps: ["permissions: id-token: write and contents: read", "aws-actions/configure-aws-credentials with role-to-assume: \${{ vars.AWS_ROLE_ARN }} and aws-region: ap-south-1", "run: aws sts get-caller-identity", "No aws-access-key-id or aws-secret-access-key"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: AWS deploy

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
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.AWS_ROLE_ARN }}
          aws-region: ap-south-1
      - run: aws sts get-caller-identity
`,
      rules: [
        has(String.raw`id-token:\s*write`, "Grants id-token: write"),
        has(String.raw`uses:\s*aws-actions/configure-aws-credentials@v\d+`, "Uses aws-actions/configure-aws-credentials"),
        has(String.raw`role-to-assume:\s*\$\{\{\s*vars\.AWS_ROLE_ARN\s*\}\}`, "Assumes the role from vars.AWS_ROLE_ARN"),
        has(String.raw`aws-region:\s*ap-south-1`, "Uses ap-south-1"),
        lacks(String.raw`aws-(access-key-id|secret-access-key)`, "Stores no long-lived access keys"),
      ],
    }),
    yq({
      title: "Reusable deploy workflow",
      brief: "Write .github/workflows/deploy.yml as a reusable workflow. It takes a required string input environment and a required secret DEPLOY_TOKEN, and its job runs in that environment.",
      steps: ["on: workflow_call with inputs.environment (type string, required true)", "secrets.DEPLOY_TOKEN (required true)", "The job uses environment: \${{ inputs.environment }} and passes the secret to ./deploy.sh through env"],
      level: "advanced",
      starter: `name: Deploy (reusable)

on:
  # make this workflow callable

jobs:
  # add the deploy job
`,
      solution: t`name: Deploy (reusable)

on:
  workflow_call:
    inputs:
      environment:
        type: string
        required: true
    secrets:
      DEPLOY_TOKEN:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: \${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh "\${{ inputs.environment }}"
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
`,
      rules: [
        has(String.raw`on:\s*\n\s+workflow_call:`, "Triggered by workflow_call"),
        has(String.raw`inputs:\s*\n\s+environment:\s*\n\s+type:\s*string\s*\n\s+required:\s*true`, "Takes a required string input environment"),
        has(String.raw`secrets:\s*\n\s+DEPLOY_TOKEN:\s*\n\s+required:\s*true`, "Takes a required secret DEPLOY_TOKEN"),
        has(String.raw`environment:\s*\$\{\{\s*inputs\.environment\s*\}\}`, "Runs in the given environment"),
        has(String.raw`DEPLOY_TOKEN:\s*\$\{\{\s*secrets\.DEPLOY_TOKEN\s*\}\}`, "Passes the secret through env"),
      ],
    }),
    yq({
      title: "Call a reusable workflow",
      brief: "From the main CI workflow, call ./.github/workflows/deploy.yml twice after the tests pass: once for staging, then for production. Pass all secrets through.",
      steps: ["A test job that runs npm test", "Job staging: needs test, uses ./.github/workflows/deploy.yml, with environment staging, secrets: inherit", "Job production: needs staging, same workflow with environment production"],
      level: "advanced",
      starter: WORKFLOW,
      solution: t`name: CI

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test

  staging:
    needs: test
    uses: ./.github/workflows/deploy.yml
    with:
      environment: staging
    secrets: inherit

  production:
    needs: staging
    uses: ./.github/workflows/deploy.yml
    with:
      environment: production
    secrets: inherit
`,
      rules: [
        has(String.raw`(uses:\s*\./\.github/workflows/deploy\.yml[\s\S]*){2}`, "Calls deploy.yml twice"),
        has(String.raw`with:\s*\n\s+environment:\s*staging`, "Passes environment staging"),
        has(String.raw`with:\s*\n\s+environment:\s*production`, "Passes environment production"),
        has(String.raw`secrets:\s*inherit`, "Passes secrets with secrets: inherit"),
        has(String.raw`needs:\s*\[?\s*staging`, "Production waits for staging"),
      ],
    }),
  ],
  quiz: [
    { q: "The same variable is set in workflow env, job env and step env. Which value does the step see?", options: ["The workflow value", "The job value", "The step value", "It is an error"], answer: 2, why: "The most specific level wins: step over job over workflow." },
    { q: "How are secret values shown if a step prints them?", options: ["In plain text", "Masked as ***", "Base64 encoded", "The step fails"], answer: 1, why: "GitHub masks registered secret values in logs, but you should still never print them." },
    { q: "Where should a non-secret setting like the AWS region be stored?", options: ["In a secret", "In a configuration variable, read with vars.NAME", "Hard-coded in every step", "In GITHUB_TOKEN"], answer: 1, why: "vars are visible, editable configuration; secrets are for sensitive values." },
    { q: "A workflow sets permissions: contents: read. What access does GITHUB_TOKEN now have to pull requests?", options: ["write", "read", "none", "admin"], answer: 2, why: "Once any permission is listed, every unlisted scope becomes none." },
    { q: "What happens when a job with environment: production (required reviewers configured) starts?", options: ["It runs immediately", "It waits until a listed reviewer approves, then gets the environment's secrets", "It fails", "It runs on a production server"], answer: 1, why: "Environment protection rules pause the job for approval before it can access environment secrets." },
    { q: "How does a step pass a value to later steps today?", options: ["echo \"::set-output name=x::1\"", "echo \"x=1\" >> \"$GITHUB_OUTPUT\"", "export x=1", "Writing to /tmp/x"], answer: 1, why: "$GITHUB_OUTPUT replaced the deprecated set-output command." },
    { q: "Why is OIDC safer than storing AWS access keys as secrets?", options: ["It is faster", "Credentials are short-lived and issued per run, so there is no long-lived key to leak or rotate", "It needs no IAM role", "It works without the internet"], answer: 1, why: "The job exchanges a signed GitHub token for temporary credentials of a role that trusts only your repository." },
    { q: "Why are secrets not passed to workflows run for pull requests from forks?", options: ["Forks are slower", "Anyone can open a PR from a fork, and its code could print or send the secrets", "Forks have no Actions", "GitHub charges extra"], answer: 1, why: "Untrusted code must not get your credentials." },
    { q: "An OIDC deploy fails with 'Could not load credentials from any providers'. What is the most likely cause?", options: ["The region is wrong", "permissions is missing id-token: write", "actions/checkout is missing", "The job has no name"], answer: 1, why: "Without id-token: write the job cannot request the OIDC token to exchange for AWS credentials." },
    { q: "A step has if: secrets.DEPLOY_KEY != ''. What is wrong?", options: ["Nothing", "The secrets context isn't available in if conditions; map it to an env variable first and test env", "Strings need double quotes", "if cannot compare strings"], answer: 1, why: "GitHub does not allow secrets directly in if; set env: HAS_KEY: \${{ secrets.DEPLOY_KEY != '' }} and check env.HAS_KEY." },
  ],
};
