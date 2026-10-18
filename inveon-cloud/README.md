# Inveon Cloud

Push-to-deploy hosting for Docker Compose apps on our own servers. It works
like a small Frappe Cloud: you add a server with one command, connect a
GitHub repo, and every push deploys a new release next to the running one.
nginx switches over only after the new release passes its health check, and
you can roll back with one click.

```
inveon-cloud/
  control-plane/   API, Postgres schema, job queue, scheduler   (Node 20, Express, Drizzle)
  dashboard/       web app served by the control plane          (React 18, Vite, wouter)
  agent/           inveon-agent, runs on every server           (Node 20, no dependencies)
  Dockerfile, docker-compose.yml, .env.example
```

## How it works

- **Control plane.** It keeps one record per resource: organizations,
  members, servers, apps, environments, releases, deployments, domains,
  jobs and job steps, backups, health checks and the audit log. Every remote
  action is a **job** made of **steps**. Each step has a log, and the
  dashboard streams the log live over Server-Sent Events.
- **Agent.** A systemd service on each server.
  - It **connects out** to the control plane over HTTPS, so the server
    needs no open port apart from 80 and 443 for your sites. This also
    works behind NAT.
  - It long-polls for jobs, heartbeats every 30 seconds with host facts
    (OS, CPU, memory, disk, Docker version), samples [metrics](#monitoring)
    every 30 seconds, and reports each step's output and result. It polls two lanes: the main lane runs one job at a
    time (deploys, backups and the rest), and the stream lane runs up to 4
    [live log streams](#live-logs) next to them, so following logs never
    holds up a deploy.
  - It runs only a fixed list of actions with fixed argument lists:
    `image.build|remove`, `release.prepare|run`,
    `compose.validate|pull|up|down|ps|logs|logs_follow`, `health.check`,
    `nginx.write_upstream|write_site|remove_site|remove_upstream|reload`,
    `certbot.issue|renew|delete`, `backup.create|restore|delete` and
    `app.remove_folder`. The only programs it starts are `docker`, `nginx`,
    `systemctl`, `certbot`, `aws`, `tar` and `git`, always with an argv list.
    There is no shell access, every parameter is checked, and an unknown
    action fails the job before anything runs.
- **Scheduler.** It runs inside the control plane. Every 30 seconds it:
  - marks servers offline after 90 seconds without a heartbeat;
  - evaluates [threshold alerts](#threshold-alerts) on server metrics;
  - fails jobs that have been stuck for more than 60 minutes, and ends live
    log streams past their 10 minutes;
  - runs due health checks;
  - queues nightly backups when each environment's backup hour arrives;
  - deploys releases that were [waiting for a maintenance window](#maintenance-windows)
    once it opens;
  - retries [alert](#alerts) deliveries that are due.

  Once a day it queues certificate renewals, alerts about certificates that
  expire within 14 days, applies [backup retention](#backup-retention),
  [archives old releases](#release-archiving), clears alert deliveries
  older than 30 days, and rolls [metrics](#monitoring) older than 24 hours
  up into 5-minute buckets (kept 30 days). Run only **one** control-plane instance.

### Deploy flow

A deploy starts from a GitHub push (signed webhook), a pull request (for
[preview environments](#preview-environments)) or the Deploy button. It
creates a **release**, which is the commit plus the compose file read from
GitHub at that commit, and then a deploy job on the environment's server
(a push outside the environment's [maintenance windows](#maintenance-windows)
waits for the next one).
With the **blue/green** strategy the job runs these steps:

1. **Build image** (only for apps [built on the server](#building-on-the-server)).
2. **Prepare release:** writes `docker-compose.yml` and a `0600` `.env` for
   the new colour.
3. **Validate compose file:** `docker compose config --format json`, then the
   safety checks below. The control plane re-checks the resolved model the
   agent sends back.
4. **Pull images**, logged in with the app's registry credentials if it has
   any.
5. **Back up, then run the release command** (only if the environment has
   one; see [Release command](#release-command-migrations)).
6. **Start** the new colour (blue or green) on its own port.
7. **Health check** `http://127.0.0.1:<port><health path>` until it answers
   2xx or 3xx.
8. **Switch the nginx upstream** to the new port, and **reload nginx**. If
   `nginx -t` fails, the old file is restored.
9. **Stop the old colour.**

If any step fails, the live release stays as it was. A clean-up job stops
the failed colour (including anything the release command started) and, if
the upstream had already been switched, points it back. **Rollback** redeploys the previous release the same way. The
**recreate** strategy runs the same steps on a single project in place, so
there is a short restart. Use recreate when the compose file also runs the
database.

### Compose file rules

The agent rejects a compose file that has any of the following:

- `privileged: true`;
- host namespaces (`network_mode: host`, or `pid`, `ipc`, `uts` or
  `userns_mode` set to `host`);
- bind mounts outside the environment's folder, including symlinks that lead
  out of it;
- any mount of the Docker socket or containerd;
- devices, dangerous capabilities (`SYS_ADMIN`, `NET_ADMIN`, `ALL` and
  others) or unconfined seccomp/apparmor;
- ports published on anything other than `127.0.0.1`.

The same validator file is used by the agent and by the control plane, and a
test fails if the two copies drift apart.

Every release gets these values in its `.env`:

| Variable | Meaning |
|---|---|
| `INVEON_HTTP_PORT` | Port this colour must publish on `127.0.0.1`. nginx proxies to it. |
| `INVEON_DATA_DIR` | `/srv/inveon/apps/<env>/data`, the persistent folder shared by both colours. Bind mounts go here. |
| `INVEON_SLOT` | `blue`, `green` or `main`. |
| `INVEON_COMMIT_SHA`, `IMAGE_TAG` | The commit being deployed (use it as the image tag). |
| `IMAGE_REGISTRY` | The app's registry, if set. |
| `INVEON_IMAGE` | The image built on the server for this commit (only when the app is built on the server). |

Your environment variables and secrets are added to the same `.env`.

A minimal app:

```yaml
services:
  web:
    image: ghcr.io/inveon-technologies/website:${IMAGE_TAG}
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:${INVEON_HTTP_PORT}:80"
    volumes:
      - ${INVEON_DATA_DIR}/uploads:/app/uploads
```

Images are normally built by GitHub Actions in each app repo and pushed to
GHCR or ECR, tagged with the commit SHA. Repos without a CI image can be
[built on the server](#building-on-the-server) instead. `build:` sections in
the compose file are skipped by `pull` and are not supported. For a private
registry, give the app [registry credentials](#registry-credentials-and-deploy-keys)
(or run `docker login` once on the server as root).

### Release command (migrations)

Each environment can have a **release command**, for example
`npm run db:migrate` or `python manage.py migrate --noinput`, and the
compose service whose image runs it (Deploys tab, admins). On every deploy
and rollback, after the images are pulled and before anything is started or
switched:

1. If a release is live and backups are set up for the environment (a
   bucket, plus a database or folders), the job takes a **backup** of the
   live colour with the usual `backup.create` action. If the backup fails,
   the deploy stops.
2. The agent runs `docker compose run --rm -T <service> <command…>` in the
   new release's project, so the command sees the new image, the new
   `.env` and the compose network (dependencies such as the database are
   started if needed). It times out after 30 minutes.
3. If the command fails, the job stops there: nothing new is started, the
   live release keeps serving, and the deploy is marked failed with the
   error and the last 16 KB of the command's output. The dashboard shows
   both on the failed deploy, with a **Restore this backup** button for the
   backup taken in step 1 (a restore always backs up the current state
   first).

The command is never run through a shell. It is split on spaces into words,
and each word may only use letters, digits and `_ @ % + = : , . / -` (no
quotes, `$`, `;`, `|`, `&`, redirects or globs); the first word can't be an
option. The control plane checks this when you save it and the agent checks
it again before running it. Use a script in your image for anything more
complex. Migrations should be backwards compatible with the release that is
still serving, because with blue/green the old colour keeps running against
the migrated database until the switch.

### Building on the server

Turn on **Build on the server** in the app's settings for repos that have no
CI image, and set the Dockerfile path and build context (relative to the
repo). Each deploy then starts with an `image.build` step on the
environment's server:

- the agent creates an empty repo, fetches exactly the deploy's commit
  (`git fetch --depth 1 <url> <sha>`) and checks it out, with hooks off, no
  system or global git config and no prompts, and checks that `HEAD` is the
  commit;
- the URL is always `github.com/<owner>/<repo>`, built by the agent from the
  app's validated owner and name;
- a Dockerfile or context that is missing, or that resolves (through a
  symlink) outside the clone, fails the build;
- it runs `docker build --pull` and tags the image
  `inveon-build/<app>-<id>:<commit>`. The release's `.env` gets
  `INVEON_IMAGE` set to that tag, so the compose file uses
  `image: ${INVEON_IMAGE}`. The pull step then only pulls images that are
  missing (`--policy missing`, Docker Compose 2.22 or later).

Public repos are cloned anonymously. When the repo's owner has the
[GitHub App](#github-app) installed and linked, the clone uses a one-hour
installation token for that repo only (contents read), sent only in the
agent's copy of the job. Otherwise, for private repos, generate a
**deploy key** in the app's settings and add its public half in GitHub under
Settings, Deploy keys, with write access off. The clone uses it over SSH
with GitHub's published host keys pinned. Built images stay on the server
until their release is [archived](#release-archiving).

Servers installed before these features need `git` and `openssh-client`
(`apt-get install -y git openssh-client`), the new agent bundle in
`/opt/inveon-agent` and its updated systemd unit (which adds `/root/.docker`
to `ReadWritePaths` for `docker build`), then
`systemctl daemon-reload && systemctl restart inveon-agent`. Running the
installer again with a new install token does all of this.

### Registry credentials and deploy keys

- **Registry credentials** (app settings, admins): a registry host, user
  name and password or token, used for the pull step and for base images
  during a build. The password is envelope-encrypted like a secret variable,
  write-only, and shown masked. It is decrypted only into the agent's copy
  of the job when that server claims it, never into the stored job steps.
  The agent logs in with `docker login --password-stdin` into a throwaway
  `DOCKER_CONFIG` folder for that one step, then runs `docker logout` and
  deletes the folder, even if the step failed. Root's own `~/.docker` login
  is never touched. ECR passwords expire after 12 hours, so for ECR prefer
  the server's instance role with the ECR credential helper.
- **Deploy keys** are Ed25519 keys generated by the control plane. Only the
  public half is ever shown; the private half is encrypted and sent only to
  the server running a build, written to a `0600` file for the clone and
  deleted afterwards.

The control plane's own `INVEON_GITHUB_TOKEN` is long-lived and never leaves
the control plane, so clones don't use it. With the [GitHub App](#github-app),
clones use a short-lived installation token instead (kept out of argv by the
agent).

### Preview environments

Turn on **Preview environments** in the app's settings, choose the preview
server and a base domain (for example `preview.example.com`), and point a
wildcard DNS record `*.preview.example.com` at that server. Add the
**Pull requests** event to the repo's webhook. Then:

- **opened, reopened or synchronize:** the control plane creates (or
  reuses) the environment `pr-<number>` on the preview server, with the
  domain `pr-<number>.preview.example.com`, and deploys the pull request's
  head commit. A new preview copies the variables and the deploy settings
  (strategy, health path, release command) from the environment you chose
  in the settings, if any. Pick a staging environment, not production:
  preview code can read those values. After its first successful deploy the
  preview gets its own Let's Encrypt certificate (the HTTP site is written
  first, so it works over HTTP even if certbot fails);
- **closed** (merged or not): a teardown job stops both colours with
  `docker compose down --volumes`, removes the nginx site and upstream,
  deletes the certificate and the environment's folder, and then deletes
  the environment. If the teardown fails, the preview stays listed and an
  admin can retry it with **Tear down**.

Pull requests from forks are never deployed, since their code would run on
your server with the preview's variables. Pushes to the branch never deploy
previews. If a push lands while the preview's previous deploy is still
running, that commit is skipped; the next push deploys again.

With the [GitHub App](#github-app) linked for the repo's owner, each pull
request gets **one comment**, edited in place (a new one if somebody deleted
it): *Deploying `abc1234`…* when the deploy starts, *Live* with the preview
URL (`http://` until the certificate is issued, then `https://`) and a
dashboard link, *failed* with the error, and *Torn down* when the PR is
closed. The head commit also gets a commit status `inveon-cloud/preview`
(pending, success with the preview URL, or failure). Updates for one PR are
sent in order in the background, so GitHub being slow never holds up a
deploy. Without the app nothing is posted; open the preview from the
dashboard or the `pr-<number>` URL.

## Operations

### Live logs

App, Logs, **Live logs**: pick a compose service and how many recent lines
to start with, and press **Follow**. The agent runs
`docker compose logs -f --tail <N> <service>` against the live colour and
sends its output every second; the control plane relays it to the browser
over the job's Server-Sent Events stream and **stores none of it**.

- It stops when you press Stop or leave the tab: the control plane cancels
  the job about 3 seconds after its last viewer disconnects, and the agent
  stops `docker` as soon as its next check-in (every 5 seconds even when the
  service is quiet) is refused. It never runs longer than 10 minutes.
- Streams run on the agent's stream lane, at most 4 per server (a fifth gets
  `429`), next to deploys rather than after them.
- Developers and up only. Every follow is audit-logged (`logs.follow`, with
  the service). Container log jobs (the "last lines" fetch too) are readable
  by developers and up only, since apps can print anything.
- If no agent picks the stream up within 30 seconds (server offline, or an
  agent from before this feature), it fails with a message saying so.

### Alerts

**Alerts** (owners and admins) holds the organization's notification
channels. Each channel picks its events:

| Event | When |
|---|---|
| `deploy.failed` / `deploy.succeeded` | A deploy or rollback finished (succeeded is off by default). |
| `health.down` / `health.up` | A health check failed 3 times in a row / recovered. |
| `server.offline` / `server.online` | No heartbeat for 90 seconds / the agent checks in again. |
| `backup.failed` | A nightly, manual, pre-deploy or pre-restore backup failed. |
| `cert.expiring` | A certificate expires within 14 days (once per certificate and expiry date). |
| `server.threshold` / `server.threshold_cleared` | A [threshold rule](#threshold-alerts) (CPU, memory, disk, offline) was crossed / cleared. |

- **Slack:** an incoming-webhook URL. Messages are plain `text` with a link
  back to the dashboard, so Slack-compatible receivers work too.
- **Webhook:** any https endpoint. The body is JSON
  (`id, event, createdAt, organizationId, title, text, severity, url, details`)
  with these headers:

  ```
  X-Inveon-Event: deploy.failed
  X-Inveon-Delivery: <delivery id>
  X-Inveon-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
  ```

  The signing secret is generated when the channel is created and shown
  once (**New secret** rotates it). Verify with the raw body, compare in
  constant time and reject timestamps older than a few minutes.
- **Email:** through the control plane's SMTP settings, to the listed
  addresses or, if none, the organization's owners and admins.

Slack and webhook URLs are secrets (a Slack URL is its own credential):
they are envelope-encrypted like secret variables and never returned; the
dashboard shows only the scheme and host. **Send test** delivers a test
message right away and shows the result. Every alert is queued per channel
in Postgres and sent at once; a failure is retried after 1 minute, 5
minutes, 30 minutes and 2 hours (5 attempts), and the **delivery log** shows
each delivery's status, HTTP status or error and attempts for 30 days.

Webhook and Slack URLs must be `https://` on a public address. On save the
control plane refuses user names and passwords in the URL, `localhost`,
`.local`/`.internal` names, single-label hosts and IP addresses in private,
loopback, link-local (including `169.254.169.254`), CGNAT, multicast,
documentation and IPv6 unique-local ranges (and IPv4 addresses mapped into
IPv6). When sending, it resolves the name itself, refuses if any address is
non-public, and connects to the address it checked, so DNS rebinding can't
point it inward. Redirects are not followed. For an internal receiver on a
trusted network, list its host in `INVEON_ALERT_PRIVATE_HOSTS`.

Health checks still email owners and admins as before, unless a channel
subscribes to that health event: then the channel takes over.

### Backup retention

In the Backups tab, **Delete old backups** keeps the newest backup of each
of the last N days, plus the newest of each of the last N weeks (ISO
weeks, UTC; 0 for none). Backups younger than 24 hours and anything still
running are always kept; failed backups past that age are cleared.

Once a day (or with **Apply retention now**, admins) a prune job asks the
environment's server to delete the old archives with the allow-listed
`backup.delete` action: `aws s3 rm s3://<bucket>/<key>` per key, never
`--recursive`, and the agent checks that every key is a `.tar.gz` directly
inside that environment's own `<prefix>/<slug>/` folder. The records are
deleted only after the job succeeds; if any delete fails, all of them are
kept and retried the next day. The server's AWS role needs
`s3:DeleteObject` on the backup prefix. With bucket versioning on, a delete
leaves a delete marker; add a lifecycle rule that expires noncurrent
versions to actually free the space.

### Release archiving

Each environment keeps its last **10** deployed releases (Deploys,
Releases; at least 2). After every successful deploy, and in a daily
sweep, older releases are archived: a job runs the allow-listed
`image.remove` action, `docker image rm <image>` per image (never forced,
so Docker refuses an image a container still uses and the agent skips it),
and when it succeeds the releases are marked archived for that environment.

- The live and the previous release are never archived.
- Only images tagged with the release's own commit SHA are removed: images
  built on the server, and `image:` lines that resolve through
  `${IMAGE_TAG}` or `${INVEON_COMMIT_SHA}`. Shared images such as
  `postgres:16` are never touched, and neither is an image that another
  environment on the same server still keeps.
- **Roll back to this** (any kept release) and the Roll back button work as
  before; an archived release can't be rolled back to. Deploying its commit
  again works (the image is pulled or built afresh) and un-archives it.

### Maintenance windows

Deploys, Maintenance windows: add weekly windows (UTC weekday, start time
and length; a window can run past midnight). With at least one window:

- a push that arrives outside every window doesn't deploy. Its release is
  queued on the environment, a newer push replaces it, and the scheduler
  deploys it when the next window opens (within 30 seconds). The
  environment shows **Waiting for the window** with the commit, and
  developers can discard it;
- manual deploys and rollbacks still run at any time; the dashboard warns
  first, and the API returns `outsideMaintenanceWindow: true`;
- the environment bar shows the next window, or that one is open now.

Preview environments have no windows.

### Monitoring

Inveon Cloud keeps its own metrics instead of running Prometheus, Grafana
and Loki next to it.

- **Sampling.** Every 30 seconds the agent reads CPU (from `/proc/stat`),
  the load average, memory used (total minus available, from
  `/proc/meminfo`), disk used and size for `/` and for Docker's data root
  (`statfs`; the path comes from `docker info --format {{.DockerRootDir}}`,
  checked hourly), network bytes per second over the physical interfaces
  (`/proc/net/dev`, without loopback, Docker bridges and veth pairs), and
  per-container CPU and memory from `docker stats --no-stream --format json`
  with the compose project and service from `docker ps --format json`. All
  three are fixed argument lists; nothing goes through a shell.
- **Sending.** Samples are buffered (up to an hour) and sent in batches of
  up to 20 to `POST /api/v1/agent/metrics` once the heartbeat says the
  control plane accepts them. The control plane takes at most 120 samples
  and 100 containers per sample, validates every field, refuses unknown
  ones, and always stores them for the server the agent token belongs to.
  Samples more than an hour old or 5 minutes in the future are skipped, and
  a re-sent sample is ignored.
- **Storage.** Raw samples (`server_metrics`) are kept 24 hours. The daily
  run folds older ones into 5-minute rollups (`server_metric_rollups`:
  averages plus the CPU and memory peak, per container too), kept 30 days.
- **Charts.** A server's page has a **Metrics** tab (1 hour, 24 hours, 7
  days, 30 days) with CPU, memory, disk and network charts and a table of
  its containers (now, plus the average and peak over the range). An app's
  **Resources** tab shows its environment's containers (both colours) on
  their server. Each chart has a text summary and a data table.

#### Threshold alerts

**Alerts, Server thresholds** (admins) sets the organization's default
rules; a server's **Thresholds** tab overrides one for that server (or
turns it off there):

| Rule | Fires when |
|---|---|
| CPU | every sample of the last N minutes is above X % (0 minutes: the latest sample). |
| Memory | the same, on memory used. |
| Disk | the same, on the fuller of `/` and Docker's data root. |
| Offline | no heartbeat for the heartbeat timeout plus N minutes. |

Every scheduler tick evaluates the rules in effect. Crossing one opens an
**incident** and sends one `server.threshold` alert through the
organization's [alert channels](#alerts); when the latest sample is back at
or below the threshold (or the agent checks in again), the incident is
resolved and one `server.threshold_cleared` alert is sent. At most one
incident per server and metric is open at a time (a unique index), so a
condition that lasts sends nothing more. Samples older than 3 minutes
change nothing (the offline rule covers that). Removing or turning off a
rule closes its incident without an alert. Open incidents show on the
server's page and as a badge on the server list; resolved ones are kept 90
days.

#### Prometheus export

`GET /metrics` returns the latest values of an organization's servers in
the Prometheus text format: `inveon_server_up`, `inveon_server_info`,
`inveon_server_cpu_percent`, `inveon_server_load1|5|15`,
`inveon_server_memory_used_bytes` and `_total_bytes`,
`inveon_server_disk_used_bytes` and `_total_bytes` (`mount="/"` or
`"docker"`), `inveon_server_network_receive|transmit_bytes_per_second`,
`inveon_container_cpu_percent`, `inveon_container_memory_bytes` and
`_limit_bytes`, and `inveon_server_alert_open` per open incident. It needs a
**scrape token** (Alerts, Prometheus scrape tokens; admins): `ics_…`, shown
once, stored as a SHA-256 hash, revocable, and scoped to one
organization. It can only read. To point Prometheus (and Grafana) at it:

```yaml
- job_name: inveon-cloud
  scheme: https
  metrics_path: /metrics
  authorization: { type: Bearer, credentials: <scrape token> }
  static_configs: [{ targets: ["cloud.inveontechnologies.in"] }]
```

Failed attempts count towards `INVEON_AUTH_RATE_LIMIT` per IP; successful
scrapes don't.

### Upgrading servers for these features

Live logs, backup retention, release archiving, metrics and request signing need the new
agent on each server: copy the new bundle to `/opt/inveon-agent` and run
`systemctl restart inveon-agent` (or run the installer again with a new
install token). An older agent keeps working for everything else; a live
log stream to it fails after 30 seconds with a message, and prune and
archive jobs fail with "Action not allowed" until it is updated. An older
agent sends no metrics: its charts stay empty and only the offline rule
works for it. Request signing also needs the new agent: once restarted it
enrols its key on its own and the server shows **Signed requests**; turn on
**Refuse unsigned agent requests** only when no server is listed as
unsigned. Give the
server's AWS role `s3:DeleteObject` on its backup prefix before turning on
retention.

## Running it

### Local development

```bash
service postgresql start
createdb -U portal -h localhost inveon_cloud          # password: portal

cd control-plane && npm install
cat > .env <<EOF
INVEON_DATABASE_URL=postgres://portal:portal@localhost:5432/inveon_cloud
INVEON_JWT_SECRET=$(openssl rand -hex 32)
INVEON_MASTER_KEY=$(openssl rand -base64 32)
INVEON_PUBLIC_URL=http://localhost:4100
EOF
npm run dev                                           # API on :4100, runs migrations

cd ../dashboard && npm install && npm run dev         # http://localhost:5174 (proxies /api)
cd ../agent && npm install && npm run bundle          # builds inveon-agent.tar.gz for install.sh
```

To try an agent locally, create a server in the dashboard, take the token
from the end of the install command, and run:

```bash
node agent/dist/index.js register --url http://localhost:4100 --token <token> --config /tmp/agent.json
node agent/dist/index.js run --config /tmp/agent.json
```

### Production (one EC2 instance or VPS)

```bash
cp .env.example .env      # fill in every secret; keep a copy of INVEON_MASTER_KEY elsewhere
docker compose up -d --build
```

The container serves the API, the dashboard, `/install.sh` and the agent
bundle on `127.0.0.1:4100`. Put HTTPS in front of it at `INVEON_PUBLIC_URL`
(for example `cloud.inveontechnologies.in`), using nginx with Let's Encrypt
or an ALB. Agents refuse plain `http` to anything except localhost. On a
fresh install, sign-up is closed (`INVEON_OPEN_SIGNUP=false`) **except for
the very first account**. That account owns the first organization, and
everyone else joins by invite.

Then:

1. **Add a server.** Go to Servers, then Add server, and run the one-line
   command as root on the host (Ubuntu or Debian):
   `curl -fsSL https://cloud…/install.sh | sudo bash -s -- <token>`. The
   token works **once** and expires after **15 minutes**. It is stored only
   as a SHA-256 hash. The script installs Docker, nginx, certbot, git, the AWS
   CLI and Node 20, registers the server, and starts `inveon-agent`. The
   per-server agent token it receives is also stored hashed.
   Or [create the server on AWS](#creating-servers-on-aws) from the
   dashboard, which runs the same command for you on first boot.
2. **Add an app.** Give the GitHub repo URL, branch and compose path. Copy
   the webhook URL and secret (shown once) into the repo under Settings,
   Webhooks, with content type `application/json` and the **Pushes** event
   (add **Pull requests** for preview environments). For private repos, set
   `INVEON_GITHUB_TOKEN`, a fine-grained token with read access to contents.
   In the app's **Settings** you can turn on building on the server, add
   registry credentials, generate a deploy key and set up previews.
3. **Create an environment** (for example `production`) on a server, choose
   the strategy and health path, and add variables. Mark secrets as
   *secret*: they are write-only and are never shown again. Set a release
   command in the Deploys tab if the app has migrations.
4. **Deploy.** Push to the branch, or press Deploy.
5. **Domains.** Add the hostname, then create the DNS A record the
   dashboard shows (it points at the server's public IP). Press Verify DNS,
   then Issue certificate. That job writes the nginx site, runs certbot with
   the webroot method, and switches the site to HTTPS. Renewals are queued
   daily.
6. **Health.** Set the URL and interval. After 3 failures in a row, owners
   and admins get an email that the app is down, and another when it
   recovers. Without `INVEON_SMTP_HOST`, emails are only logged. Add
   [alert channels](#alerts) for Slack, webhooks or other recipients.
7. **Backups.** Set the database service, name and user, any data folders,
   the S3 bucket, prefix and region, and the hour (UTC). Backups run nightly,
   and you can also take one manually. A restore always takes a fresh
   backup first, in the same job. Set [retention](#backup-retention) to
   delete old backups.

### Creating servers on AWS

Servers, **AWS account** (admins) connects one AWS account per
organization:

- **Role (recommended).** The dashboard shows an **external id** generated
  for the organization (`inveon-…`, never chosen by hand). Create an IAM role
  in your account whose trust policy lets the control plane's own role
  assume it with that external id, attach the permissions below, and paste
  the role's ARN. The control plane calls `sts:AssumeRole` with its own
  credentials (its EC2 instance role, or the default AWS credential chain)
  for 15 minutes at a time. No AWS keys are stored.
- **Access key.** An IAM user's long-term key (`AKIA…`). The secret is
  envelope-encrypted like a secret variable, write-only, and included in
  [master key rotation](#rotating-the-master-key).

Either way, **Check and save** calls `sts:GetCallerIdentity` and only saves
a connection that works; the account id is shown. Trust policy for the
organization's role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<control plane account>:role/<control plane's role>" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "<external id from the dashboard>" } }
  }]
}
```

Permissions for that role (or the IAM user):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Describe", "Effect": "Allow", "Resource": "*",
      "Action": ["ec2:DescribeInstances", "ec2:DescribeSecurityGroups", "ec2:DescribeKeyPairs",
                 "ec2:DescribeVpcs", "ec2:DescribeSubnets"] },
    { "Sid": "Launch", "Effect": "Allow", "Resource": "*",
      "Action": ["ec2:RunInstances", "ec2:CreateSecurityGroup"] },
    { "Sid": "TagOnCreate", "Effect": "Allow", "Resource": "*", "Action": "ec2:CreateTags",
      "Condition": { "StringEquals": { "ec2:CreateAction": ["RunInstances", "CreateSecurityGroup"] } } },
    { "Sid": "OnlyInveonResources", "Effect": "Allow", "Resource": "*",
      "Action": ["ec2:TerminateInstances", "ec2:AuthorizeSecurityGroupIngress", "ec2:DeleteSecurityGroup"],
      "Condition": { "StringEquals": { "aws:ResourceTag/inveon:managed-by": "inveon-cloud" } } },
    { "Sid": "UbuntuAmi", "Effect": "Allow", "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:*::parameter/aws/service/canonical/*" },
    { "Sid": "InstanceProfileOptional", "Effect": "Allow", "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<account>:role/inveon-*",
      "Condition": { "StringEquals": { "iam:PassedToService": "ec2.amazonaws.com" } } }
  ]
}
```

The control plane's own role needs `sts:AssumeRole` on the organizations'
role ARNs. Drop the last statement if you don't attach instance profiles.

**Create on AWS** then asks for:

| Field | Rules |
|---|---|
| Name | 1 to 80 characters. |
| Region | One of 16 commercial regions (`ap-south-1`, `eu-west-1`, `us-east-1`, …). |
| Instance type | `t3.small`, `t3.medium`, `t3.large`, `t3.xlarge`, `m6i.large`, `m6i.xlarge`, or Arm `t4g.small`, `t4g.medium`, `t4g.large`, `m7g.large`. |
| Disk | 20 to 1000 GB, gp3, encrypted, deleted with the instance. |
| Security group | An existing one (`sg-…`, picked from the region's list), or a new one that opens 80 and 443 to everyone and, optionally, 22 to one IPv4 network between `/16` and `/32` (no SSH by default: the agent needs no inbound port). |
| Key pair | Optional, from the region's list. |
| Subnet, instance profile | Optional. Without a subnet, the region's default VPC. An instance profile lets the server write backups to S3. |

Anything else in the request is refused. The control plane looks up the
current Ubuntu 24.04 LTS image from Canonical's public SSM parameter
(`/aws/service/canonical/ubuntu/server/24.04/stable/current/<amd64|arm64>/hvm/ebs-gp3/ami-id`),
issues a fresh single-use install token (valid for 60 minutes, since boot
and install take a few), and calls `RunInstances` with IMDSv2 required (hop
limit 1, so containers can't reach the instance's credentials), tags
`inveon:server-id`, `inveon:org-id` and `inveon:managed-by=inveon-cloud`,
and cloud-init user data that runs only:

```bash
curl -fsSL --retry 10 --retry-delay 6 --retry-all-errors '<INVEON_PUBLIC_URL>/install.sh' | bash -s -- '<token>'
```

The token can be read from the instance's metadata, but it is used up when
the agent registers. If the launch fails, a security group made for it is
deleted and no server is left behind; the error from AWS is shown.

Servers shows the state: **pending** (launched), **running** (the instance
is up; the public IP is filled in), **agent online** (the agent
registered), then **terminating** and **terminated**. The scheduler checks
EC2 every 30 seconds while a server is changing; **Refresh** checks now.
Installation logs are in `/var/log/cloud-init-output.log` on the instance.

**Terminate** asks you to type the server's name. It's refused while the
server has environments, and only for the instance whose
`inveon:server-id` tag matches. The agent's token stops working at once.
When EC2 reports the instance terminated, a security group created for it
is deleted, and the server can be removed from the list (it can't be
removed while its instance may still run). Launches, terminations and
connection changes are audit-logged (never the secret key).

### GitHub App

Optional. Without it, the control plane reads repos with
`INVEON_GITHUB_TOKEN` (or anonymously), builds clone with deploy keys, and
each repo needs its own webhook. With it:

- **Reads** (commit lookups and the compose file) and **clones** use
  installation tokens: minted from an RS256 app JWT (signed with node:crypto,
  9 minutes), always narrowed to the one repository and the permission
  needed (`contents: read` for reads and clones, `pull_requests` and
  `statuses: write` for previews), valid an hour and cached until 5 minutes
  before they expire. `INVEON_GITHUB_TOKEN` stays the fallback for repos whose
  owner has no linked installation, or while an installation is suspended.
- **Previews** get their [pull request comment and commit status](#preview-environments).
- **The app's webhook** (`/api/v1/webhooks/github-app`, signed with
  `INVEON_GITHUB_APP_WEBHOOK_SECRET`) delivers pushes and pull requests of
  every installed repo to the apps of the linked organization with that
  repo, so per-repo webhooks aren't needed (remove them to avoid double
  deliveries; a duplicate deploy is refused anyway). Uninstalling the app
  unlinks it; suspending it stops its use until it is unsuspended.

To set it up, create a GitHub App (your organization's Settings, Developer
settings, GitHub Apps):

1. **Permissions:** Contents read-only, Metadata read-only, Pull requests
   read and write, Commit statuses read and write. **Events:** Push, Pull
   request.
2. **Webhook URL** `https://<control plane>/api/v1/webhooks/github-app` with a
   long random secret. **Setup URL**
   `https://<control plane>/api/v1/github/setup`, with **Request user
   authorization (OAuth) during installation** ticked.
3. Generate a private key and set `INVEON_GITHUB_APP_ID`,
   `INVEON_GITHUB_APP_SLUG`, `INVEON_GITHUB_APP_PRIVATE_KEY` (the PEM, or
   `base64 -w0` of it), `INVEON_GITHUB_APP_CLIENT_ID`,
   `INVEON_GITHUB_APP_CLIENT_SECRET` and `INVEON_GITHUB_APP_WEBHOOK_SECRET`,
   then restart.
4. In the dashboard, Apps, **Install the GitHub App** (admins). GitHub sends
   you back with the installation id and an OAuth code. The control plane
   links the installation only if the signed state (organization and admin,
   1 hour) checks out, you are still an admin there, and the GitHub user
   who just authorized can see that installation (`GET /user/installations`),
   so nobody can link another account's installation by guessing its id.
   An installation belongs to one organization. Linking and unlinking are
   audit-logged.

### Control plane environment variables

| Variable | Default | Notes |
|---|---|---|
| `INVEON_DATABASE_URL` | required | Postgres URL. |
| `INVEON_JWT_SECRET` | required | At least 32 characters. Signs 15-minute access tokens. |
| `INVEON_MASTER_KEY` | required (or `INVEON_MASTER_KEYS`) | 32 bytes, base64 or hex. Wraps every data key. Never stored in the database. |
| `INVEON_MASTER_KEYS`, `INVEON_MASTER_KEY_CURRENT` | unset | More master keys and the current one; see [Rotating the master key](#rotating-the-master-key). |
| `INVEON_PLATFORM_ADMINS` | first account | Comma-separated emails allowed to see key status and start a rotation. |
| `INVEON_PUBLIC_URL` | `http://localhost:4100` | Used in install commands, webhook URLs and email links. |
| `INVEON_PORT` | `4100` | |
| `INVEON_OPEN_SIGNUP` | `true` | `false` means invite-only (after the first account). |
| `INVEON_DASHBOARD_DIR` | unset | Built dashboard to serve on the same origin (set in the Docker image). |
| `INVEON_AGENT_DIR` | `../agent` | Folder with `install.sh` and `inveon-agent.tar.gz`. |
| `INVEON_GITHUB_TOKEN` | unset | Private repos without the GitHub App (and the fallback with it). |
| `INVEON_GITHUB_APP_ID`, `_SLUG`, `_PRIVATE_KEY`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_WEBHOOK_SECRET` | unset | The optional [GitHub App](#github-app). The private key is the PEM or base64 of it. |
| `INVEON_KMS_REGION` | AWS SDK default | Region of the KMS key behind [KMS-backed master keys](#kms-backed-master-keys). |
| `INVEON_AGENT_SIGNATURES` | `optional` | `required` refuses unsigned agent requests in every organization; see [signed agent requests](#signed-agent-requests). |
| `INVEON_WEBAUTHN_ORIGINS` | unset | Extra browser origins for [passkeys](#passkeys) on the same host (for example the Vite dev server). |
| `INVEON_ACME_EMAIL` | unset | Let's Encrypt account email. |
| `INVEON_SMTP_HOST`, `_PORT`, `_SECURE`, `_USER`, `_PASSWORD`, `INVEON_MAIL_FROM` | unset | Invites, health emails and email alert channels. |
| `INVEON_ALERT_PRIVATE_HOSTS` | unset | Comma-separated hosts that alert webhooks may reach on a private address or over plain http. Only for trusted internal endpoints. |
| `INVEON_ACCESS_TOKEN_TTL_MIN` / `INVEON_REFRESH_TOKEN_TTL_DAYS` | `15` / `30` | |
| `INVEON_AUTH_RATE_LIMIT` | `20` | Login, sign-up and agent registration attempts per 15 minutes per IP. |
| `INVEON_HEARTBEAT_TIMEOUT_SEC` | `90` | |
| `INVEON_JOB_TIMEOUT_MIN` | `60` | |
| `INVEON_AGENT_POLL_TIMEOUT_MS` | `25000` | Long-poll wait for agents. |
| `INVEON_SCHEDULER`, `INVEON_SCHEDULER_TICK_SEC` | `true`, `30` | |
| `INVEON_AUTO_MIGRATE` | `true` | Applies migrations on start. |
| `INVEON_LOG_LEVEL` | `info` in production | |

The agent's configuration is in `/etc/inveon-agent/config.json` (mode
`0600`). It holds the control-plane URL, server ID and agent token, plus
optional paths (its request-signing key is `agent-key.pem` next to it, also
`0600`): `appsRoot`, `nginxConfDir`, `acmeWebroot`. To read its logs,
run `journalctl -u inveon-agent -f`.

## Security

- **Roles:**
  - **owner:** members, roles, the organization and its two-factor
    requirement, and resetting a member's two-factor;
  - **admin:** servers (including the AWS account and EC2 launches and
    terminations), apps, environments, domains, backups and their
    retention, release archiving, maintenance windows, alert channels,
    invites and the audit log;
  - **developer:** deploy, roll back, edit variables, read and follow
    container logs, take backups;
  - **viewer:** read-only.

  Nobody can invite above their own role. An organization always keeps at
  least one owner. A non-member gets `404` for another organization's
  resources.
- **Sessions:**
  - passwords are hashed with argon2id;
  - access tokens live in memory;
  - the refresh token is a rotating `httpOnly` cookie, and reusing an old
    refresh token revokes every session;
  - [two-factor authentication](#two-factor-authentication) (TOTP or a
    [passkey](#passkeys)) is required for owners (and, per organization,
    for admins).
- **Secrets** use envelope encryption. Each value has its own random
  AES-256-GCM data key, and that key is wrapped with `INVEON_MASTER_KEY`.
  The ciphertext is bound to its environment and key, so copying it to
  another row fails to decrypt. Secrets are write-only in the API, and the
  dashboard shows them masked. They are decrypted only when a release is
  prepared for the owning server's agent, and they are written to that
  release's `0600` `.env`. Webhook secrets are encrypted the same way and
  shown once. Registry passwords and deploy keys are encrypted the same
  way, bound to their app, write-only, and decrypted only into the claiming
  agent's copy of a job; the stored job steps never hold them. Master keys
  can be [rotated](#rotating-the-master-key). If every copy of a master key
  is lost, the secrets wrapped with it have to be entered again.
- **Agents:**
  - the install token is single-use and expires after 15 minutes;
  - each server's agent token is random and stored hashed;
  - every request is also [signed](#signed-agent-requests) with the
    server's own Ed25519 key, so a leaked token alone is not enough;
  - an agent can only claim, report on and finish **its own server's** jobs;
  - the control plane re-checks results instead of trusting them: a job
    reported as successful while it still has unfinished steps is marked
    failed;
  - there is no debug mode that skips authentication;
  - the systemd unit uses `ProtectSystem`, `NoNewPrivileges` and a short
    list of `ReadWritePaths`.
- **Webhooks:** checked with `X-Hub-Signature-256` (HMAC-SHA256 over the raw
  body, constant-time comparison). Unsigned or mis-signed requests are
  refused. Pull requests whose head is in another repository (forks) never
  get a preview.
- **Release commands and builds** stay inside the allow-list: the release
  command is a validated argv run with `docker compose run` in the app's own
  image, and a build clones only `github.com/<owner>/<repo>` at a full commit
  SHA and builds with `docker build`. Note that a Dockerfile runs as root
  inside the build container, as it would in CI.
- **Backups:** the agent uploads with `aws s3 cp --sse AES256` using the
  server's own credentials. Use an EC2 instance role limited to the backup
  prefix (`s3:PutObject` and `s3:GetObject`, plus `s3:DeleteObject` if you
  use retention), and turn on bucket versioning. No AWS keys are stored in
  Inveon Cloud. Retention deletes only exact archive keys inside the
  environment's own folder, checked again by the agent.
- **Alerts:** Slack and webhook URLs and webhook signing secrets are
  envelope-encrypted and write-only. Outbound requests are https-only to
  public addresses, checked on save and again at connect time with the
  resolved address pinned, and never follow redirects (SSRF). Webhook
  bodies are signed with HMAC-SHA256 over the timestamp and body.
- **AWS:** prefer a role assumed with a per-organization external id over
  stored keys; a stored secret key is encrypted and write-only. Launch
  inputs are checked against allow-lists, user data only carries the
  installer URL and a single-use token, instances require IMDSv2, and
  terminate checks the instance's tag first.
- **Metrics:** an agent can only write samples for its own server, every
  field is validated and batches are capped. The `/metrics` export is
  read-only and needs a per-organization scrape token, stored hashed and
  revocable; dashboard sessions and agent tokens don't work there.
- **Live logs** are relayed, never stored, and stop when the viewer leaves.
  Image removal for archived releases never forces and only names images
  tagged with a full commit SHA.
- **Audit log:** sign-ups, org changes, members, invites, two-factor resets, servers, apps,
  environments, variables (keys only, never values), deploys, rollbacks,
  domains, backups, restores, backup pruning, log requests and live log
  streams (with the service), job cancels, registry credentials and deploy
  keys (never their values), preview creation and teardown, alert channels
  (create, update, test, secret rotation, delete; never the URL or secret),
  passkeys added, removed, failed and suspected clones, agent signing keys
  enrolled and rotated, GitHub App installations linked, unlinked,
  suspended and uninstalled,
  master key rotations started from the dashboard, AWS connections, EC2
  launches and terminations, threshold rules, threshold incidents opening and
  resolving, scrape tokens (created and revoked; never the token),
  release archiving, and deploys queued for, discarded from or started by a
  maintenance window. It records the actor, the IP and the time. Admins and owners can read it under Audit log.

### Two-factor authentication

Every user can turn on two-factor (TOTP, RFC 6238: SHA-1, 6 digits, 30
seconds) under **Account**. Owners must: until they do, every request in
their organizations answers `403 TWO_FACTOR_REQUIRED` and the dashboard
shows only the set-up screen. An owner can tick **Require two-factor for
admins too** on the Team page to extend this to admins.

- **Set up:** the control plane makes a 160-bit secret, keeps it encrypted
  and *pending*, and returns an `otpauth://` URI. The dashboard draws the QR
  code in the browser (`qrcode-generator`) and also shows the key for typing
  in. A code from the app confirms it; only then is two-factor on. Sessions
  opened before that (with only a password) are signed out.
- **Recovery codes:** ten one-time codes (`xxxx-xxxx-xxxx`) are shown once,
  with copy and download. Only salted SHA-256 hashes are stored. **New
  recovery codes** (needs a code) replaces all of them.
- **Sign-in** becomes two steps. A correct password returns no session, only
  a 5-minute challenge token signed with a key derived from
  `INVEON_JWT_SECRET` (it can't be used as an access token). The session is
  issued by `POST /auth/login/2fa` with the challenge and a code or a
  recovery code. Codes from one step either side are accepted for clock
  drift, but each 30-second step works only once per user (a code, or an
  older one, can't be replayed). Wrong codes are rate-limited per IP and
  count towards the same 5-attempt, 15-minute account lock as passwords.
- **Turning it off** needs a current code or a recovery code, and signs out
  other sessions. An owner (who still needs it) is then sent straight back
  to set-up.
- **Lost phone and codes:** an owner can **Reset 2FA** for a member on the
  Team page. It turns two-factor off for that person and signs them out
  everywhere. It's refused if the person also belongs to an organization
  where the resetting owner isn't an owner, and for yourself. It's
  audit-logged (`member.2fa_reset`); enabling, disabling, new recovery codes
  and failed codes are logged on the user.

### Passkeys

**Account, Passkeys:** add a passkey (Touch ID, Windows Hello, a phone or a
security key) after entering your password again, since a passkey can sign
in on its own; rename or remove it (password again). The login page has
**Sign in with a passkey**, and after a password a passkey works as the
second step instead of a code.

- **Server-side checks** (`lib/webauthn.ts`, node:crypto only, with a small
  CBOR decoder): the challenge (32 random bytes, stored server-side for 5
  minutes, deleted when used), `type`, the origin (`INVEON_PUBLIC_URL`'s
  origin), no cross-origin, the rpId hash (`INVEON_PUBLIC_URL`'s host), user
  presence, and user verification (PIN or biometrics) when the passkey is
  the only factor. Keys: ES256, EdDSA (Ed25519) and RS256 (2048 bits or
  more). Attestation is requested as `none`; `none` and `packed` (self
  attestation, or a signature by the x5c leaf, whose chain isn't checked)
  are accepted, anything else is refused.
- **Sign counter:** must go up whenever it isn't 0. A counter that stays or
  goes back is refused and logged as a possible cloned authenticator.
  Synced passkeys, which always report 0, work.
- **Two-factor:** a passkey sign-in with user verification is two factors
  in one, so having a passkey satisfies the owner (and admin) requirement.
  Once you have one, a password alone no longer signs in. Failed passkey
  sign-ins count towards the same lockout as passwords. An owner's
  **Reset 2FA** removes the member's passkeys too.
- Only the public key (SPKI) and the counter are stored; the user handle
  is the account's id, never the email.

### Rotating the master key

Every encrypted value records which master key wrapped its data key:
`v1.…` is the original format and means the key in `INVEON_MASTER_KEY`
(key id `legacy`); `v2.<key id>.…` names any other key, and the id is also
authenticated with the value. Encrypted values: variables, app webhook
secrets, registry passwords, deploy keys, alert channel URLs and signing
secrets, two-factor secrets and AWS secret keys.

| Variable | Meaning |
|---|---|
| `INVEON_MASTER_KEY` | The original single key, id `legacy`. Optional once nothing uses it. |
| `INVEON_MASTER_KEYS` | More keys: `id:key,id:key` (ids are letters, digits, `-`, `_`; keys are 32 bytes, base64 or hex). |
| `INVEON_MASTER_KEY_CURRENT` | The id new values are encrypted with. Default: the last key in `INVEON_MASTER_KEYS`, else `legacy`. |
| `INVEON_PLATFORM_ADMINS` | Emails that may see key status and start a rotation in the dashboard. Default: the first account on this installation. They need two-factor on. |

To rotate:

1. Generate a key (`openssl rand -base64 32`) and store a copy outside the
   server. Add it next to the old one and make it current, for example
   `INVEON_MASTER_KEYS=2026-10:<new key>` (with `INVEON_MASTER_KEY` still
   set), and restart. New values now use `2026-10`; old ones still decrypt.
2. Re-wrap the old values: **Encryption keys**, **Re-wrap onto the current
   key** (platform admins), or `npm run keys:rotate` in `control-plane/`
   (`docker compose exec control-plane node dist/keys.js rotate` in the
   container). It works through each encrypted column in batches
   (`--batch 200`), re-wrapping only each value's data key with the current
   master key (the value's own ciphertext is untouched, and is checked
   before anything is written). A row is updated only if it still holds the
   ciphertext that was read, so it is safe while the control plane runs.
   It's idempotent and resumable: values already on the current key are
   never touched, so a run that stops (or `--max N`) continues next time.
   A value whose key isn't configured is reported and skipped.
3. Check **Encryption keys** (or `npm run keys:status`): it shows how many
   values each key id wraps, per column. When the old key shows **unused,
   safe to remove** (0 values), remove it from the environment and restart.
   Start-up logs an error if any stored value needs a key that isn't
   configured.

To go back, make the old id current again and re-wrap. Keys stay in the
environment only.

#### KMS-backed master keys

A keyring entry can be a data key encrypted by AWS KMS instead of the key
itself: `INVEON_MASTER_KEYS=<id>:kms:<base64 CiphertextBlob>`. The control
plane (and `keys.js`) asks KMS to decrypt it **once at start-up**, bound to
the encryption context `inveon:purpose=master-key`, and then uses it like
any other key, so the environment and its backups only hold a ciphertext
that is useless without `kms:Decrypt` on the control plane's role. If KMS
refuses, the control plane doesn't start.

```bash
# needs kms:GenerateDataKey on the key; prints only the encrypted copy
npm run keys:kms-generate -- arn:aws:kms:ap-south-1:<account>:key/<key id> --id kms-2026-10
# -> INVEON_MASTER_KEYS=kms-2026-10:kms:AQIDAHh…
```

Add that entry to `INVEON_MASTER_KEYS` (comma-separated with the others; it
becomes current as the last one listed), restart, and run the usual
`keys:rotate`. The command accepts a key id, ARN or `alias/<name>`; the
region comes from the ARN, else `INVEON_KMS_REGION`, else the AWS SDK's
default. Keep a second key (or the KMS key itself) recoverable: losing access
to the KMS key loses the values wrapped with it. The dashboard's
**Encryption keys** page marks KMS-backed ids.

### Signed agent requests

Every agent request carries, next to the bearer token:

```
X-Inveon-Timestamp: <unix seconds>
X-Inveon-Nonce: <16 random bytes, base64url>
X-Inveon-Signature: base64(Ed25519 over "inveon-agent-v1\n<METHOD>\n<path and query>\n<timestamp>\n<nonce>\n<hex SHA-256 of the body>")
```

The agent makes its key (`agent-key.pem`, `0600`, next to its config) when
it registers and sends the public half with the install token; an agent
upgraded from before signing makes one on its next start and enrols it
(`POST /api/v1/agent/signing-key`, accepted on the bearer token only while
the server has no key; replacing a key needs a request signed with the
current one; running the installer again replaces it). The control plane
refuses a missing or invalid signature, a timestamp more than 5 minutes off
(keep the servers' clocks in sync) and a nonce it has already seen (kept in
`agent_request_nonces` until it expires). A server with a key must always
sign. Servers without one keep working, and **Servers** shows which still
send unsigned requests, until an owner ticks **Refuse unsigned agent
requests** (or `INVEON_AGENT_SIGNATURES=required` turns it on everywhere).

**Why not mTLS:** the control plane sits behind a shared nginx that also
serves browser sites. Client certificates would have to be requested on
that shared TLS endpoint (browsers then prompt for, or fail on,
certificates), and TLS ends at nginx, so the control plane would only see a
header nginx forwards. Signing at the application layer works through any
proxy, binds each request's method, path and body to the server's key, and
stops replays, which mTLS alone doesn't.

## Tests

```bash
service postgresql start
PGPASSWORD=portal createdb -U portal -h localhost inveon_cloud_test   # disposable
cd control-plane && TEST_DATABASE_URL=postgres://portal:portal@localhost:5432/inveon_cloud_test npm test
cd ../agent && npm test
cd ../dashboard && npx tsc --noEmit && npx vite build
```

The control-plane tests boot the built server against a real Postgres, with
a fake GitHub API, and act as the agent. They cover:

- auth and roles, invites, and closed sign-up;
- two-factor: the RFC 4226 and RFC 6238 test vectors, enrolment and the
  owner requirement (and admins when the organization asks), the two-step
  sign-in, refusing a replayed code, single-use recovery codes, expired and
  forged challenges, the lockout, turning it off, and an owner's reset;
- passkeys: the CBOR decoder, ES256, EdDSA and RS256 with `none` and
  `packed` attestation, every client-data and authenticator-data check,
  registration (password again, single-use and user-bound challenges,
  duplicates), passwordless sign-in with user verification, replays,
  expired challenges, a cloned counter, synced passkeys, the passkey as the
  second step, the owner requirement, removal and an owner's reset, all
  with a software authenticator built from generated keys;
- signed agent requests: the shared fixed vector, refusing unsigned, old,
  replayed, re-pathed and re-bodied requests, the per-organization and
  global switch, enrolling a key on upgrade and rotating it;
- the GitHub App: the app JWT, the setup state, linking (OAuth user must see
  the installation, one organization per installation), scoped and cached
  installation tokens for reads and clones with the fallback, the single
  PR comment through deploy, failure, redeploy, deletion and teardown,
  commit statuses, and the app webhook (pushes, PRs, suspend, uninstall);
- bootstrap tokens: single use and 15-minute expiry;
- agent authentication, and that one server can't claim, report on or finish
  another server's job;
- secret encryption round trip, masking and write-only reads;
- KMS-backed master keys (against a fake KMS in `test/fake-aws.mjs`):
  `keys:kms-generate`, decrypting once at start-up, rotating onto and off a
  KMS key with `keys:rotate`, and a bad blob stopping start-up;
- master key rotation: old `v1` values still decrypt next to a new key, the
  key id is authenticated, every `*_enc` column in the schema is covered, a
  partial run resumes, a second run changes nothing, values decrypt with
  the old key removed, a value under a missing key is reported, and
  rotating back;
- webhook signatures;
- blue/green step order, rollback targets and failed-deploy clean-up;
- release commands: validation, the backup first, keeping the old release
  live when the command fails, and offering the backup for restore;
- building on the server, registry credentials and deploy keys (write-only,
  and only in the agent's copy of the job);
- preview environments: creation, copied variables, forks ignored, pushes
  not deploying previews, teardown and retry;
- compose validation, including the control plane's re-check;
- health state changes and alerts, domains and certbot, backups and
  restores, log jobs, and the SSE stream;
- live logs: roles, the stream lane, output relayed but not stored, the
  per-server limit, and stopping when the last viewer leaves;
- alerts: URL checks against private and metadata addresses, write-only
  URLs and secrets, the HMAC signature, per-channel events, retries and
  the delivery log, email channels, and every event source (deploys,
  health, servers, backups, certificates);
- backup retention: the keep rule, only the environment's own keys sent
  for deletion, records removed after success and kept after a failure;
- release archiving: which images are removed (never shared ones or ones
  another environment keeps), never the live or previous release, refusing
  rollbacks to archived releases, and un-archiving on redeploy;
- maintenance windows: the window maths (past midnight and across the
  week), queuing and replacing pushes, deploying when the window opens,
  and manual deploys flagged but allowed;
- monitoring: metric batches only for the agent's own server (unknown
  fields refused), the batch, value and container caps, skipped old and
  duplicate samples, charts and an environment's containers, the rollup
  (averages, peaks, containers, raw kept 24 hours, rollups 30 days) and
  the 7- and 30-day series across both, threshold rules (the window,
  overrides, disk and offline) with one alert when an incident opens and
  one when it clears, and the scrape token and Prometheus text format.

The EC2 tests run the control plane with a fake AWS (`test/fake-aws.mjs`,
preloaded with `node --import`) and never call AWS. They cover the
connection (external id, verifying before saving, the secret encrypted and
never returned), every input check, the AMI lookup per architecture, the
security group rules, the user data and its single-use one-hour token,
pending to running to agent online, a failed launch cleaning up, and
terminate (typed confirmation, environments, the tag check, the agent cut
off, the group deleted afterwards).

The agent tests cover the allow-list, parameter checks, the argument lists
of every command (run through a fake runner), nginx rollback when `nginx -t`
fails, health retries, backups, the release command, the clone and build
(deploy key, token, symlinks, `HEAD` check), registry login and logout,
preview teardown, every unsafe-compose rule, the exact `logs -f`,
`aws s3 rm` and `docker image rm` argument lists with their parameter
checks, cancelling a live log stream while it is quiet, request signing
(the fixed vector, the `0600` key, enrolment and its retry), and metrics: the
`/proc` parsers (CPU, memory, network), `docker stats` and `docker ps`
parsing, the exact docker argument lists, and the send buffer (batches,
retries, refused batches dropped, size cap).

## Moving the portal, the website and the CRM onto Inveon Cloud

Today a single EC2 host runs this repo's `docker-compose.yml`. It has:

- the `web` nginx container on 80/443, with certbot;
- the portal (frontend, backend and Postgres);
- Events.

The CRM runs as its own stack on the shared `crm_crm_network`. Nothing
auto-deploys the portal. The steps below give each app push-to-deploy and
rollback.

1. **Build images in CI.** In each repo, add a GitHub Actions workflow that
   builds every service and pushes it to GHCR as
   `ghcr.io/inveon-technologies/<name>:${{ github.sha }}`. Events already
   publishes images this way. Then replace `build:` in each compose file with
   `image: …:${IMAGE_TAG}`.
2. **Give each app its own compose file** in its repo (for example
   `deploy/inveon-cloud.yml`, set as the app's compose path), with one entry
   point published on `127.0.0.1:${INVEON_HTTP_PORT}`. Host nginx on the
   server now owns 80/443 and TLS, so remove the `web` and `certbot`
   containers and any `ports: 80/443`.
   - **Website:** a single nginx image serving the static build. Use
     **blue/green**, health path `/`.
   - **Portal:** `portal-frontend` (its nginx proxies `/api` to the backend),
     `portal-backend` and `portal-postgres` in one file. Keep the uploads
     folder and the database under `${INVEON_DATA_DIR}` (for example
     `${INVEON_DATA_DIR}/uploads:/app/uploads` and
     `${INVEON_DATA_DIR}/postgres:/var/lib/postgresql/data`). Because the
     database is in the file, use **recreate**. Move the values from
     `portal-backend/.env` into the environment's variables, with
     `PORTAL_DATABASE_URL` and the JWT and SMTP passwords as secrets. Set up
     backups with `postgres`, service `portal-postgres`, database `portal`,
     user `portal`, and folder `uploads`.
   - **CRM:** the same pattern as the portal (recreate, database and Redis
     in the file, data under `${INVEON_DATA_DIR}`). The shared
     `crm_crm_network` is no longer needed, because each app is reached
     through host nginx on its own port.
3. **New server.** Start a fresh EC2 instance (Ubuntu 24.04) with an
   instance role that can write to the backup bucket, open 80/443, and run
   the install command. Leave the old host running.
4. **Move data.** Copy the data onto the new server, so the first deploy
   starts with it:
   - on the old host, run `pg_dump` and copy the uploads volume;
   - put the uploads under `/srv/inveon/apps/<env>/data/` on the new
     server;
   - restore the dump after the first deploy (`docker compose exec`, or
     upload it to S3 and use Restore).
5. **Domains.** In each environment, add the hostnames
   (`inveontechnologies.in`, `www.`, `portal.`, `crm.`, `events.`). Point the
   DNS A records at the new server one app at a time, then press Verify DNS
   and Issue certificate. Copy any custom nginx rules from
   `nginx/inveontechnologies.in.conf`, such as security headers and
   redirects, into the app's own entry-point container.
6. **Turn on health checks** for each public URL and nightly backups for the
   portal and CRM. Add the GitHub webhooks.
7. **Retire the old host** once traffic and backups have looked healthy for
   a few days.

## Phase 2

- Other clouds (DigitalOcean, Hetzner) behind the same provider interface as
  EC2, and resizing or stopping instances from the dashboard.
- Build on a separate build host (builds run on each environment's server
  today).
- SSO.
- Central log search across servers (live logs and the last lines are
  per environment today), and metric history beyond 30 days.
- Maintenance windows in a chosen time zone (they are UTC today).
- Many servers behind one proxy, and wildcard certificates (DNS-01).
