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
    (OS, CPU, memory, disk, Docker version), and reports each step's
    output and result. It polls two lanes: the main lane runs one job at a
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
  - fails jobs that have been stuck for more than 60 minutes, and ends live
    log streams past their 10 minutes;
  - runs due health checks;
  - queues nightly backups when each environment's backup hour arrives;
  - deploys releases that were [waiting for a maintenance window](#maintenance-windows)
    once it opens;
  - retries [alert](#alerts) deliveries that are due.

  Once a day it queues certificate renewals, alerts about certificates that
  expire within 14 days, applies [backup retention](#backup-retention),
  [archives old releases](#release-archiving) and clears alert deliveries
  older than 30 days. Run only **one** control-plane instance.

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

Public repos are cloned anonymously. For private repos, generate a
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
the control plane, so clones don't use it. The agent also accepts a
short-lived token (kept out of argv), ready for a GitHub App integration.

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
running, that commit is skipped; the next push deploys again. Nothing is
posted back to GitHub: the GitHub integration only reads repository contents
and can't comment, so open the preview from the dashboard or the
`pr-<number>` URL.

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

### Upgrading servers for these features

Live logs, backup retention and release archiving need the new agent on
each server: copy the new bundle to `/opt/inveon-agent` and run
`systemctl restart inveon-agent` (or run the installer again with a new
install token). An older agent keeps working for everything else; a live
log stream to it fails after 30 seconds with a message, and prune and
archive jobs fail with "Action not allowed" until it is updated. Give the
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

### Control plane environment variables

| Variable | Default | Notes |
|---|---|---|
| `INVEON_DATABASE_URL` | required | Postgres URL. |
| `INVEON_JWT_SECRET` | required | At least 32 characters. Signs 15-minute access tokens. |
| `INVEON_MASTER_KEY` | required | 32 bytes, base64 or hex. Wraps every data key. Never stored in the database. |
| `INVEON_PUBLIC_URL` | `http://localhost:4100` | Used in install commands, webhook URLs and email links. |
| `INVEON_PORT` | `4100` | |
| `INVEON_OPEN_SIGNUP` | `true` | `false` means invite-only (after the first account). |
| `INVEON_DASHBOARD_DIR` | unset | Built dashboard to serve on the same origin (set in the Docker image). |
| `INVEON_AGENT_DIR` | `../agent` | Folder with `install.sh` and `inveon-agent.tar.gz`. |
| `INVEON_GITHUB_TOKEN` | unset | Needed for private repos. |
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
optional paths (`appsRoot`, `nginxConfDir`, `acmeWebroot`). To read its logs,
run `journalctl -u inveon-agent -f`.

## Security

- **Roles:**
  - **owner:** members, roles and the organization;
  - **admin:** servers, apps, environments, domains, backups and their
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
    refresh token revokes every session.
- **Secrets** use envelope encryption. Each value has its own random
  AES-256-GCM data key, and that key is wrapped with `INVEON_MASTER_KEY`.
  The ciphertext is bound to its environment and key, so copying it to
  another row fails to decrypt. Secrets are write-only in the API, and the
  dashboard shows them masked. They are decrypted only when a release is
  prepared for the owning server's agent, and they are written to that
  release's `0600` `.env`. Webhook secrets are encrypted the same way and
  shown once. Registry passwords and deploy keys are encrypted the same
  way, bound to their app, write-only, and decrypted only into the claiming
  agent's copy of a job; the stored job steps never hold them. To rotate the master key, re-wrap every data key (planned for
  phase 2). If the master key is lost, every secret has to be entered again.
- **Agents:**
  - the install token is single-use and expires after 15 minutes;
  - each server's agent token is random and stored hashed;
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
- **Live logs** are relayed, never stored, and stop when the viewer leaves.
  Image removal for archived releases never forces and only names images
  tagged with a full commit SHA.
- **Audit log:** sign-ups, org changes, members, invites, servers, apps,
  environments, variables (keys only, never values), deploys, rollbacks,
  domains, backups, restores, backup pruning, log requests and live log
  streams (with the service), job cancels, registry credentials and deploy
  keys (never their values), preview creation and teardown, alert channels
  (create, update, test, secret rotation, delete; never the URL or secret),
  release archiving, and deploys queued for, discarded from or started by a
  maintenance window. It records the actor, the IP and the time. Admins and owners can read it under Audit log.

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
- bootstrap tokens: single use and 15-minute expiry;
- agent authentication, and that one server can't claim, report on or finish
  another server's job;
- secret encryption round trip, masking and write-only reads;
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
  and manual deploys flagged but allowed.

The agent tests cover the allow-list, parameter checks, the argument lists
of every command (run through a fake runner), nginx rollback when `nginx -t`
fails, health retries, backups, the release command, the clone and build
(deploy key, token, symlinks, `HEAD` check), registry login and logout,
preview teardown, every unsafe-compose rule, the exact `logs -f`,
`aws s3 rm` and `docker image rm` argument lists with their parameter
checks, and cancelling a live log stream while it is quiet.

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

- Create EC2 servers from the dashboard (AWS SDK + cloud-init that runs the
  installer).
- Build on a separate build host (builds run on each environment's server
  today), and a GitHub App integration for short-lived clone tokens and
  preview links posted on pull requests.
- Rotate the master key, move it to AWS KMS, and use mTLS for agents.
- 2FA for owners. SSO later.
- Metrics (Prometheus + Grafana) and central logs (Loki).
- Maintenance windows in a chosen time zone (they are UTC today).
- Many servers behind one proxy, and wildcard certificates (DNS-01).
