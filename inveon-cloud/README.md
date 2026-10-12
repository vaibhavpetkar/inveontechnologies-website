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
    output and result.
  - It runs only a fixed list of actions with fixed argument lists:
    `release.prepare`, `compose.validate|pull|up|down|ps|logs`,
    `health.check`, `nginx.write_upstream|write_site|reload`,
    `certbot.issue|renew` and `backup.create|restore`. There is no shell
    access, every parameter is checked, and an unknown action fails the job
    before anything runs.
- **Scheduler.** It runs inside the control plane. Every 30 seconds it:
  - marks servers offline after 90 seconds without a heartbeat;
  - fails jobs that have been stuck for more than 60 minutes;
  - runs due health checks;
  - queues nightly backups when each environment's backup hour arrives.

  Once a day it queues certificate renewals. Run only **one** control-plane
  instance.

### Deploy flow

A deploy starts from a GitHub push (signed webhook) or from the Deploy
button. It creates a **release**, which is the commit plus the compose file
read from GitHub at that commit, and then a deploy job on the environment's
server. With the **blue/green** strategy the job runs these steps:

1. **Prepare release:** writes `docker-compose.yml` and a `0600` `.env` for
   the new colour.
2. **Validate compose file:** `docker compose config --format json`, then the
   safety checks below. The control plane re-checks the resolved model the
   agent sends back.
3. **Pull images.**
4. **Start** the new colour (blue or green) on its own port.
5. **Health check** `http://127.0.0.1:<port><health path>` until it answers
   2xx or 3xx.
6. **Switch the nginx upstream** to the new port, and **reload nginx**. If
   `nginx -t` fails, the old file is restored.
7. **Stop the old colour.**

If any step fails, the live release stays as it was. A clean-up job stops
the failed colour and, if the upstream had already been switched, points it
back. **Rollback** redeploys the previous release the same way. The
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

Images are built by GitHub Actions in each app repo and pushed to GHCR or
ECR, tagged with the commit SHA. The MVP does not build images on the
server, so `build:` sections are skipped by `pull` and are not supported. For
a private registry, run `docker login ghcr.io` once on the server as root.

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
   as a SHA-256 hash. The script installs Docker, nginx, certbot, the AWS
   CLI and Node 20, registers the server, and starts `inveon-agent`. The
   per-server agent token it receives is also stored hashed.
2. **Add an app.** Give the GitHub repo URL, branch and compose path. Copy
   the webhook URL and secret (shown once) into the repo under Settings,
   Webhooks, with content type `application/json` and only the push event.
   For private repos, set `INVEON_GITHUB_TOKEN`, a fine-grained token with
   read access to contents.
3. **Create an environment** (for example `production`) on a server, choose
   the strategy and health path, and add variables. Mark secrets as
   *secret*: they are write-only and are never shown again.
4. **Deploy.** Push to the branch, or press Deploy.
5. **Domains.** Add the hostname, then create the DNS A record the
   dashboard shows (it points at the server's public IP). Press Verify DNS,
   then Issue certificate. That job writes the nginx site, runs certbot with
   the webroot method, and switches the site to HTTPS. Renewals are queued
   daily.
6. **Health.** Set the URL and interval. After 3 failures in a row, owners
   and admins get an email that the app is down, and another when it
   recovers. Without `INVEON_SMTP_HOST`, alerts are only logged.
7. **Backups.** Set the database service, name and user, any data folders,
   the S3 bucket, prefix and region, and the hour (UTC). Backups run nightly,
   and you can also take one manually. A restore always takes a fresh
   backup first, in the same job.

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
| `INVEON_SMTP_HOST`, `_PORT`, `_SECURE`, `_USER`, `_PASSWORD`, `INVEON_MAIL_FROM` | unset | Invites and health alerts. |
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
  - **admin:** servers, apps, environments, domains, backups, invites and
    the audit log;
  - **developer:** deploy, roll back, edit variables, read logs, take
    backups;
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
  shown once. To rotate the master key, re-wrap every data key (planned for
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
  refused.
- **Backups:** the agent uploads with `aws s3 cp --sse AES256` using the
  server's own credentials. Use an EC2 instance role with a write-only policy
  on the backup prefix, and turn on bucket versioning. No AWS keys are stored
  in Inveon Cloud.
- **Audit log:** sign-ups, org changes, members, invites, servers, apps,
  environments, variables (keys only, never values), deploys, rollbacks,
  domains, backups, restores, log requests and job cancels. It records the
  actor, the IP and the time. Admins and owners can read it under Audit log.

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
- compose validation, including the control plane's re-check;
- health state changes and alerts, domains and certbot, backups and
  restores, log jobs, and the SSE stream.

The agent tests cover the allow-list, parameter checks, the argument lists
of every command (run through a fake runner), nginx rollback when `nginx -t`
fails, health retries, backups and every unsafe-compose rule.

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
- Build on the server or on a build host as a fallback when a repo has no CI
  image, and keep registry credentials per app.
- Preview environments per pull request.
- Run migrations as a deploy step (backup first, then migrate) and roll back
  automatically if a migration fails.
- Rotate the master key, move it to AWS KMS, and use mTLS for agents.
- 2FA for owners. SSO later.
- Metrics (Prometheus + Grafana), central logs (Loki), live `logs -f`
  streaming, and Slack or webhook alerts.
- Maintenance windows, archiving old releases, and backup retention rules.
- Many servers behind one proxy, and wildcard certificates (DNS-01).
