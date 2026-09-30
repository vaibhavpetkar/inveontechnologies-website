import type { PracticeUnit } from "../../types.js";
import { has, lacks, t, txtQ, yq } from "./shared.js";

const GITLAB = `# .gitlab-ci.yml
stages:
  # list the stages here

# add the jobs here
`;

const JENKINS = `pipeline {
    // choose an agent and add the stages
}
`;

export const gitlabJenkins: PracticeUnit = {
  key: "gitlab-jenkins",
  title: "GitLab CI and Jenkins pipelines",
  summary: "GitLab CI stages, jobs, images, cache, artifacts, rules, services and Docker builds, and declarative Jenkinsfiles with agents, credentials, post actions, approvals and parallel stages",
  reading: t`## Same ideas, different tools

GitHub Actions is not the only CI system you will meet at work. Many Indian service companies and banks run GitLab (often self-hosted) or Jenkins. The ideas are the same: a trigger, stages, jobs, commands, artifacts, secrets and approvals. Only the file format changes.

## GitLab CI: .gitlab-ci.yml

The pipeline lives in .gitlab-ci.yml at the root of the repository. You list the stages in order, and each job says which stage it belongs to. Jobs in the same stage run in parallel; the next stage starts when the previous one succeeds.

` + "```yaml" + t`
stages:
  - build
  - test
  - deploy

default:
  image: node:22-alpine

build-job:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

test-job:
  stage: test
  script:
    - npm ci
    - npm test
` + "```" + t`

- image picks the Docker image the job runs in (GitLab runners usually use the Docker executor).
- script is the list of shell commands; before_script and after_script run around it.
- artifacts pass files to later stages and let you download them; expire_in cleans them up.
- cache speeds up installs; key: files: [package-lock.json] makes a new cache when the lock file changes.
- needs lets a job start as soon as the jobs it needs finish, instead of waiting for the whole previous stage (a DAG).
- rules decide when a job runs, using predefined variables: rules: - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH. when: manual adds a play button (an approval).
- environment: name: production records deployments so you can see and roll back what is live.
- services start helper containers such as postgres:16 or docker:dind (for building images).
- Secrets go in Settings > CI/CD > Variables (masked and protected), and are read as $NAME. GitLab also provides $CI_REGISTRY, $CI_REGISTRY_IMAGE, $CI_REGISTRY_USER, $CI_REGISTRY_PASSWORD, $CI_COMMIT_SHORT_SHA and many more.

## Jenkins: the declarative Jenkinsfile

Jenkins is a self-hosted automation server with thousands of plugins. A Jenkinsfile in the repository describes the pipeline in a Groovy-based syntax:

` + "```groovy" + t`
pipeline {
    agent { docker { image 'node:22-alpine' } }
    options { timeout(time: 15, unit: 'MINUTES') }
    environment {
        CI = 'true'
    }
    stages {
        stage('Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
    }
    post {
        always { junit 'reports/**/*.xml' }
        failure { echo 'Build failed' }
    }
}
` + "```" + t`

- pipeline is the outer block; agent says where it runs (any, a label, or a Docker image).
- stages contains stage blocks, each with steps like sh (run a shell command), echo, archiveArtifacts and junit.
- environment sets variables. credentials('id') reads a secret stored in Jenkins; for a username and password it also creates NAME_USR and NAME_PSW.
- when { branch 'main' } runs a stage only on main; input { message 'Deploy?' } pauses for a person to approve.
- parallel runs stages at the same time, for example unit and integration tests.
- post runs after the stages: always, success, failure, and more.
- triggers { cron('H 2 * * *') } schedules builds; H spreads jobs so they don't all start at the same minute.

Groovy strings in single quotes are passed to the shell as they are, so sh 'echo $TOKEN' lets the shell read the secret. Double quotes make Groovy interpolate the value into the command first, which can leak secrets into logs; prefer single quotes for secrets.

## Common mistakes

- GitLab: a job with a stage name not listed in stages, or forgetting artifacts so the deploy stage has no dist/ folder.
- GitLab: using the deprecated only/except instead of rules (they can't be mixed in one job).
- Jenkins: steps outside a steps block, or a missing closing brace.
- Jenkins: printing credentials with echo, or building shell commands with double-quoted Groovy strings.

## How your assignments are checked

GitLab answers are .gitlab-ci.yml files: the reviewer checks the YAML formatting and then the stages, jobs, scripts, rules, cache and artifacts asked for. Jenkins answers are uploaded as a plain text Jenkinsfile and checked for the declarative blocks (pipeline, agent, stages, stage, steps, post, when, parallel) and commands the question asks for.`,
  questions: [
    yq({
      title: "GitLab stages and jobs",
      brief: "Write a .gitlab-ci.yml with three stages (build, test, deploy) and one job per stage. All jobs use the node:22-alpine image. build runs npm ci and npm run build, test runs npm ci and npm test, deploy runs ./deploy.sh.",
      steps: ["stages: build, test, deploy in that order", "default: image: node:22-alpine", "Jobs build-job, test-job and deploy-job, each with stage and script"],
      starter: GITLAB,
      solution: t`stages:
  - build
  - test
  - deploy

default:
  image: node:22-alpine

build-job:
  stage: build
  script:
    - npm ci
    - npm run build

test-job:
  stage: test
  script:
    - npm ci
    - npm test

deploy-job:
  stage: deploy
  script:
    - ./deploy.sh
`,
      rules: [
        has(String.raw`^stages:\s*\n\s+-\s*build\s*\n\s+-\s*test\s*\n\s+-\s*deploy`, "Stages build, test, deploy in order", "m"),
        has(String.raw`image:\s*node:22-alpine`, "Uses node:22-alpine"),
        has(String.raw`stage:\s*build[\s\S]*script:\s*\n\s+-\s*npm ci\s*\n\s+-\s*npm run build`, "The build job runs npm ci and npm run build"),
        has(String.raw`stage:\s*test[\s\S]*npm test`, "The test job runs npm test"),
        has(String.raw`stage:\s*deploy\s*\n\s+script:\s*\n\s+-\s*\./deploy\.sh`, "The deploy job runs ./deploy.sh"),
      ],
    }),
    yq({
      title: "GitLab cache for npm",
      brief: "Speed up a GitLab test job by caching npm's download folder inside the project. The cache must change whenever package-lock.json changes.",
      steps: ["cache: key: files: [package-lock.json]", "cache paths: .npm/", "script: npm ci --cache .npm --prefer-offline, then npm test"],
      level: "intermediate",
      starter: GITLAB,
      solution: t`stages:
  - test

test:
  stage: test
  image: node:22-alpine
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
  script:
    - npm ci --cache .npm --prefer-offline
    - npm test
`,
      rules: [
        has(String.raw`cache:\s*\n\s+key:\s*\n\s+files:\s*\n\s+-\s*package-lock\.json`, "The cache key is built from package-lock.json"),
        has(String.raw`paths:\s*\n\s+-\s*\.npm/?`, "Caches .npm/"),
        has(String.raw`npm ci --cache \.npm`, "npm ci uses the .npm cache folder"),
        has(String.raw`-\s*npm test`, "Runs npm test"),
      ],
    }),
    yq({
      title: "GitLab artifacts and needs",
      brief: "The build job produces dist/, which must be kept for one week and used by the e2e job. e2e should start as soon as build finishes, without waiting for other jobs in the build stage.",
      steps: ["build job: artifacts paths dist/ and expire_in: 1 week", "e2e job in stage test with needs: [build]", "e2e runs npx serve -s dist -l 4173 & and then npm run test:e2e"],
      level: "intermediate",
      starter: GITLAB,
      solution: t`stages:
  - build
  - test

default:
  image: node:22

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

e2e:
  stage: test
  needs: [build]
  script:
    - npm ci
    - npx serve -s dist -l 4173 &
    - npm run test:e2e
`,
      rules: [
        has(String.raw`artifacts:\s*\n\s+paths:\s*\n\s+-\s*dist/?`, "build keeps dist/ as an artifact"),
        has(String.raw`expire_in:\s*["']?1 week`, "Artifacts expire after 1 week"),
        has(String.raw`needs:\s*(\[\s*["']?build["']?\s*\]|\n\s+-\s*["']?build)`, "e2e needs build"),
        has(String.raw`npm run test:e2e`, "Runs the end-to-end tests"),
      ],
    }),
    yq({
      title: "GitLab manual production deploy",
      brief: "Add a deploy-production job that appears only on the default branch, must be started by hand (a manual play button), and records the deployment in the production environment with the URL https://shop.example.com.",
      steps: ["stage: deploy", "rules: - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH with when: manual", "environment: name production, url https://shop.example.com", "script: ./deploy.sh production", "Use rules, not only/except"],
      level: "intermediate",
      starter: GITLAB,
      solution: t`stages:
  - deploy

deploy-production:
  stage: deploy
  image: alpine:3.20
  script:
    - ./deploy.sh production
  environment:
    name: production
    url: https://shop.example.com
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
`,
      rules: [
        has(String.raw`rules:\s*\n\s+-\s*if:\s*['"]?\$CI_COMMIT_BRANCH\s*==\s*\$CI_DEFAULT_BRANCH`, "Runs only on the default branch"),
        has(String.raw`when:\s*manual`, "Is started by hand"),
        has(String.raw`environment:\s*\n\s+name:\s*production`, "Uses the production environment"),
        has(String.raw`url:\s*https://shop\.example\.com`, "Records the URL"),
        lacks(String.raw`^\s*(only|except):`, "Uses rules instead of only/except", "m"),
      ],
    }),
    yq({
      title: "GitLab PostgreSQL service",
      brief: "Run integration tests in GitLab against a PostgreSQL 16 service container. Set the database name, user and password with variables and pass DATABASE_URL to the tests (the service is reachable at the host name postgres).",
      steps: ["services: - postgres:16", "variables POSTGRES_DB: shop_test, POSTGRES_USER: runner, POSTGRES_PASSWORD: runner", "DATABASE_URL: postgresql://runner:runner@postgres:5432/shop_test", "script: npm ci, npm run test:integration"],
      level: "intermediate",
      starter: GITLAB,
      solution: t`stages:
  - test

integration:
  stage: test
  image: node:22
  services:
    - postgres:16
  variables:
    POSTGRES_DB: shop_test
    POSTGRES_USER: runner
    POSTGRES_PASSWORD: runner
    DATABASE_URL: postgresql://runner:runner@postgres:5432/shop_test
  script:
    - npm ci
    - npm run test:integration
`,
      rules: [
        has(String.raw`services:\s*\n\s+-\s*(name:\s*)?postgres:16`, "Starts a postgres:16 service"),
        has(String.raw`variables:\s*\n(\s+\w+:.*\n)*\s+POSTGRES_DB:\s*shop_test`, "Sets POSTGRES_DB in variables"),
        has(String.raw`POSTGRES_PASSWORD:\s*\S+`, "Sets POSTGRES_PASSWORD"),
        has(String.raw`DATABASE_URL:\s*["']?postgres(ql)?://runner:runner@postgres:5432/shop_test`, "Connects to the host postgres"),
        has(String.raw`npm run test:integration`, "Runs the integration tests"),
      ],
    }),
    yq({
      title: "GitLab Docker build and push",
      brief: "Build the project's Docker image in GitLab CI with Docker-in-Docker and push it to the GitLab Container Registry, tagged with the short commit SHA.",
      steps: ["image: docker:27 and services: docker:27-dind", "Log in with echo \"$CI_REGISTRY_PASSWORD\" | docker login -u \"$CI_REGISTRY_USER\" --password-stdin \"$CI_REGISTRY\"", "docker build and docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA", "Run only on the default branch with rules"],
      level: "advanced",
      starter: GITLAB,
      solution: t`stages:
  - package

docker-image:
  stage: package
  image: docker:27
  services:
    - docker:27-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
`,
      rules: [
        has(String.raw`services:\s*\n\s+-\s*docker:[\w.-]*dind`, "Uses the docker:dind service"),
        has(String.raw`docker login\b[^\n]*--password-stdin`, "Logs in with --password-stdin"),
        has(String.raw`docker build\b[^\n]*\$CI_REGISTRY_IMAGE:\$CI_COMMIT_SHORT_SHA`, "Builds with the short SHA tag"),
        has(String.raw`docker push\b[^\n]*\$CI_REGISTRY_IMAGE:\$CI_COMMIT_SHORT_SHA`, "Pushes the image"),
        lacks(String.raw`docker login\b[^\n]*\s-p\s`, "Doesn't pass the password with -p"),
      ],
    }),
    txtQ({
      title: "Declarative Jenkinsfile",
      brief: "Write a declarative Jenkinsfile that runs in the node:22-alpine Docker image and has three stages: Install (npm ci), Test (npm test) and Build (npm run build).",
      steps: ["pipeline { agent { docker { image 'node:22-alpine' } } ... }", "stages with stage('Install'), stage('Test'), stage('Build')", "Each stage has a steps block with sh"],
      starter: JENKINS,
      solution: t`pipeline {
    agent {
        docker { image 'node:22-alpine' }
    }
    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }
}
`,
      rules: [
        has(String.raw`^\s*pipeline\s*\{`, "Starts with a pipeline block", "m"),
        has(String.raw`agent\s*\{\s*docker\s*\{\s*image\s+['"]node:22-alpine['"]`, "Runs in the node:22-alpine image"),
        has(String.raw`stage\(\s*['"]Install['"]\s*\)[\s\S]*stage\(\s*['"]Test['"]\s*\)[\s\S]*stage\(\s*['"]Build['"]\s*\)`, "Has Install, Test and Build stages in order"),
        has(String.raw`steps\s*\{\s*sh\s+['"]npm ci['"]`, "Install runs sh 'npm ci'"),
        has(String.raw`sh\s+['"]npm run build['"]`, "Build runs npm run build"),
      ],
    }),
    txtQ({
      title: "Jenkins credentials and environment",
      brief: "Push a Docker image from Jenkins. The Docker Hub username and password are stored in Jenkins as the credential dockerhub-creds. Set IMAGE to vaibhavdev/shop-api in environment, load the credential with credentials(), and log in without the password appearing in the command.",
      steps: ["environment { IMAGE = 'vaibhavdev/shop-api'; DOCKERHUB = credentials('dockerhub-creds') }", "credentials() also creates DOCKERHUB_USR and DOCKERHUB_PSW", "sh with single quotes: echo \"$DOCKERHUB_PSW\" | docker login -u \"$DOCKERHUB_USR\" --password-stdin", "Build and push $IMAGE:$BUILD_NUMBER"],
      level: "intermediate",
      starter: JENKINS,
      solution: t`pipeline {
    agent any
    environment {
        IMAGE = 'vaibhavdev/shop-api'
        DOCKERHUB = credentials('dockerhub-creds')
    }
    stages {
        stage('Push image') {
            steps {
                sh 'echo "$DOCKERHUB_PSW" | docker login -u "$DOCKERHUB_USR" --password-stdin'
                sh 'docker build -t "$IMAGE:$BUILD_NUMBER" .'
                sh 'docker push "$IMAGE:$BUILD_NUMBER"'
            }
        }
    }
}
`,
      rules: [
        has(String.raw`environment\s*\{[\s\S]*IMAGE\s*=\s*['"]vaibhavdev/shop-api['"]`, "Sets IMAGE in environment"),
        has(String.raw`DOCKERHUB\s*=\s*credentials\(\s*['"]dockerhub-creds['"]\s*\)`, "Loads dockerhub-creds with credentials()"),
        has(String.raw`sh\s+'[^'\n]*\$DOCKERHUB_PSW[^'\n]*--password-stdin`, "Logs in with --password-stdin in a single-quoted sh"),
        has(String.raw`docker push\s+"?\$IMAGE:\$BUILD_NUMBER`, "Pushes $IMAGE:$BUILD_NUMBER"),
        lacks(String.raw`echo\s+["']?\$\{?DOCKERHUB_PSW\}?["']?\s*$`, "Doesn't print the password", "m"),
      ],
    }),
    txtQ({
      title: "Jenkins post actions",
      brief: "After the stages run, always publish the JUnit test reports from reports/*.xml, archive dist/** only when the build succeeds, and print \"Build failed\" when it fails.",
      steps: ["A post block after stages", "always { junit 'reports/*.xml' }", "success { archiveArtifacts artifacts: 'dist/**', fingerprint: true }", "failure { echo 'Build failed' }"],
      level: "intermediate",
      starter: JENKINS,
      solution: t`pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
                sh 'npm run build'
            }
        }
    }
    post {
        always {
            junit 'reports/*.xml'
        }
        success {
            archiveArtifacts artifacts: 'dist/**', fingerprint: true
        }
        failure {
            echo 'Build failed'
        }
    }
}
`,
      rules: [
        has(String.raw`post\s*\{`, "Has a post block"),
        has(String.raw`always\s*\{\s*junit\s+['"]reports/\*\.xml['"]`, "Always publishes JUnit reports"),
        has(String.raw`success\s*\{\s*archiveArtifacts\s+(artifacts:\s*)?['"]dist/\*\*['"]`, "Archives dist/** on success"),
        has(String.raw`failure\s*\{\s*echo\s+['"]Build failed['"]`, "Prints Build failed on failure"),
      ],
    }),
    txtQ({
      title: "Jenkins approval for production",
      brief: "Add a Deploy stage that runs only on the main branch and waits for a person to approve with the message \"Deploy to production?\" before running ./deploy.sh production. Stop the whole pipeline if it runs longer than 30 minutes.",
      steps: ["options { timeout(time: 30, unit: 'MINUTES') }", "stage('Deploy') with when { branch 'main' }", "input { message 'Deploy to production?' }", "steps { sh './deploy.sh production' }"],
      level: "advanced",
      starter: JENKINS,
      solution: t`pipeline {
    agent any
    options {
        timeout(time: 30, unit: 'MINUTES')
    }
    stages {
        stage('Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
            }
        }
        stage('Deploy') {
            when {
                branch 'main'
            }
            input {
                message 'Deploy to production?'
                ok 'Deploy'
            }
            steps {
                sh './deploy.sh production'
            }
        }
    }
}
`,
      rules: [
        has(String.raw`timeout\(\s*time:\s*30\s*,\s*unit:\s*['"]MINUTES['"]\s*\)`, "Times out after 30 minutes"),
        has(String.raw`stage\(\s*['"]Deploy['"]\s*\)\s*\{\s*when\s*\{\s*branch\s+['"]main['"]`, "Deploy runs only on main"),
        has(String.raw`input\s*\{\s*message\s+['"]Deploy to production\?['"]`, "Waits for approval with the given message"),
        has(String.raw`sh\s+['"]\./deploy\.sh production['"]`, "Runs ./deploy.sh production"),
      ],
    }),
    txtQ({
      title: "Jenkins parallel tests",
      brief: "Run unit tests and integration tests at the same time in a Tests stage, then build. Also schedule a nightly build at about 2 AM with a cron trigger that spreads load with H.",
      steps: ["triggers { cron('H 2 * * *') }", "stage('Tests') { parallel { stage('Unit') {...} stage('Integration') {...} } }", "Unit runs npm run test:unit, Integration runs npm run test:integration", "A Build stage after Tests"],
      level: "advanced",
      starter: JENKINS,
      solution: t`pipeline {
    agent any
    triggers {
        cron('H 2 * * *')
    }
    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }
        stage('Tests') {
            parallel {
                stage('Unit') {
                    steps {
                        sh 'npm run test:unit'
                    }
                }
                stage('Integration') {
                    steps {
                        sh 'npm run test:integration'
                    }
                }
            }
        }
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }
}
`,
      rules: [
        has(String.raw`triggers\s*\{\s*cron\(\s*['"]H 2 \* \* \*['"]\s*\)`, "Schedules a nightly build with cron('H 2 * * *')"),
        has(String.raw`stage\(\s*['"]Tests['"]\s*\)\s*\{\s*parallel\s*\{`, "The Tests stage runs in parallel"),
        has(String.raw`stage\(\s*['"]Unit['"]\s*\)[\s\S]*npm run test:unit`, "A Unit stage runs the unit tests"),
        has(String.raw`stage\(\s*['"]Integration['"]\s*\)[\s\S]*npm run test:integration`, "An Integration stage runs the integration tests"),
        has(String.raw`parallel[\s\S]*stage\(\s*['"]Build['"]\s*\)`, "Build comes after the tests"),
      ],
    }),
  ],
  quiz: [
    { q: "In GitLab CI, how do jobs in the same stage run?", options: ["One after another in file order", "In parallel", "Only the first one runs", "Alphabetically"], answer: 1, why: "Jobs of one stage run in parallel; the next stage starts when they all succeed." },
    { q: "What does needs: [build] do on a GitLab job?", options: ["Copies the build job", "Lets the job start as soon as build finishes, without waiting for the rest of the previous stage, and downloads build's artifacts", "Runs build again", "Makes the job manual"], answer: 1, why: "needs turns the stage sequence into a DAG for faster pipelines." },
    { q: "Which GitLab keyword gives a job a play button that someone must press?", options: ["manual: true", "when: manual", "approve: true", "input: true"], answer: 1, why: "when: manual (usually inside rules) makes the job wait for a person to start it." },
    { q: "Which predefined GitLab variable holds the path of the project's container registry image?", options: ["$CI_REGISTRY_IMAGE", "$CI_IMAGE", "$DOCKER_IMAGE", "$CI_PROJECT_IMAGE"], answer: 0, why: "$CI_REGISTRY_IMAGE is registry/group/project, ready to add a tag." },
    { q: "In a declarative Jenkinsfile, where must sh commands go?", options: ["Directly in stages", "Inside a steps block of a stage (or in post conditions)", "In the agent block", "Anywhere"], answer: 1, why: "Declarative syntax requires commands inside steps { } (post conditions also accept steps directly)." },
    { q: "environment { CREDS = credentials('dockerhub-creds') } for a username/password credential creates which extra variables?", options: ["CREDS_USER and CREDS_PASS", "CREDS_USR and CREDS_PSW", "USERNAME and PASSWORD", "None"], answer: 1, why: "Jenkins sets CREDS to user:password and also CREDS_USR and CREDS_PSW." },
    { q: "Which post condition runs whether the build passed or failed?", options: ["success", "failure", "always", "changed"], answer: 2, why: "always runs after every build, which is what you want for test reports." },
    { q: "Why prefer sh 'docker login -u $USER --password-stdin' (single quotes) over double quotes in a Jenkinsfile when secrets are involved?", options: ["Single quotes are faster", "With single quotes the shell reads the variable at run time; double quotes make Groovy paste the secret into the command string first, which can leak it", "Double quotes are a syntax error", "There is no difference"], answer: 1, why: "Jenkins warns about Groovy string interpolation of secrets for this reason." },
    { q: "What does H mean in a Jenkins cron trigger like cron('H 2 * * *')?", options: ["Hourly", "A hash-based minute chosen per job, so not every job starts at 2:00 exactly", "Holiday", "Half past"], answer: 1, why: "H spreads scheduled jobs across the hour to avoid load spikes." },
    { q: "A GitLab job has both only: [main] and rules:. What happens?", options: ["rules wins", "only wins", "The pipeline configuration is invalid, because only/except can't be used with rules in the same job", "Both are combined with AND"], answer: 2, why: "GitLab rejects jobs that mix rules with only/except." },
  ],
};
