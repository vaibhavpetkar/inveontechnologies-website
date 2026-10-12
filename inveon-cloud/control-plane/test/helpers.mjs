// Test harness: boots the compiled control plane (dist/) on a free port
// against TEST_DATABASE_URL (migrations first), with a fake GitHub API, and
// gives tests helpers to create users, orgs and registered servers.
//
//   TEST_DATABASE_URL=postgres://portal:portal@localhost:5432/inveon_cloud_test npm test
//
// The database must exist and be disposable: tests insert rows.
import { spawn, execFileSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";

export const JWT_SECRET = "test-jwt-secret-".padEnd(48, "x");
export const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const DATABASE_URL = process.env.TEST_DATABASE_URL;

function freePort() {
  return new Promise((resolve) => {
    const srv = createNetServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export const sha = () => randomBytes(20).toString("hex");

/** Minimal GitHub API: commit lookup and raw file contents per (repo, sha). */
async function startFakeGithub() {
  const heads = new Map(); // "owner/repo@branch" -> { sha, message }
  const files = new Map(); // "owner/repo@sha:path" -> text
  const defaultCompose = "services:\n  web:\n    image: nginx:alpine\n    ports:\n      - \"127.0.0.1:${INVEON_HTTP_PORT}:80\"\n";
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/commits\/(.+)$/);
    if (m) {
      const head = heads.get(`${m[1]}/${m[2]}@${decodeURIComponent(m[3])}`);
      if (!head) return res.writeHead(404).end("{}");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ sha: head.sha, commit: { message: head.message } }));
    }
    m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
    if (m) {
      const key = `${m[1]}/${m[2]}@${url.searchParams.get("ref")}:${decodeURIComponent(m[3])}`;
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(files.get(key) ?? defaultCompose);
    }
    res.writeHead(404).end("{}");
  });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  return {
    url: `http://127.0.0.1:${port}`,
    setHead: (owner, repo, branch, commitSha, message = "commit") => heads.set(`${owner}/${repo}@${branch}`, { sha: commitSha, message }),
    setFile: (owner, repo, commitSha, path, text) => files.set(`${owner}/${repo}@${commitSha}:${path}`, text),
    close: () => new Promise((r) => server.close(r)),
  };
}

export async function startServer(extraEnv = {}) {
  if (!DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to run the API tests");
  const github = await startFakeGithub();
  const env = {
    ...process.env,
    NODE_ENV: "development",
    INVEON_LOG_LEVEL: "warn",
    INVEON_DATABASE_URL: DATABASE_URL,
    INVEON_JWT_SECRET: JWT_SECRET,
    INVEON_MASTER_KEY: MASTER_KEY,
    INVEON_PUBLIC_URL: "https://cloud.test",
    INVEON_SCHEDULER: "false",
    INVEON_AGENT_POLL_TIMEOUT_MS: "300",
    INVEON_AUTH_RATE_LIMIT: "1000",
    INVEON_GITHUB_API_BASE: github.url,
    INVEON_AUTO_MIGRATE: "false",
    ...extraEnv,
  };
  delete env.INVEON_SMTP_HOST;
  execFileSync(process.execPath, ["dist/migrate.js"], { env, stdio: "inherit" });

  const port = await freePort();
  const child = spawn(process.execPath, ["dist/index.js"], { env: { ...env, INVEON_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));

  const origin = `http://127.0.0.1:${port}`;
  const base = `${origin}/api/v1`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/health/live`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  async function call(method, path, { token, body, cookie, headers = {}, raw } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(raw === undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }

  const tokenFor = (userId) => jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "15m" });

  /** A user directly in the DB (no rate-limited sign-up), optionally a member of orgId. */
  async function createUser({ orgId, role, email } = {}) {
    email ??= `user-${randomUUID()}@test.local`;
    const { rows } = await pool.query("INSERT INTO users (email, name, password_hash) VALUES ($1, 'Test', 'x') RETURNING id", [email]);
    const id = rows[0].id;
    if (orgId) await pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)", [orgId, id, role]);
    return { id, email, token: tokenFor(id) };
  }

  /** A fresh organization with an owner. */
  async function createOrg() {
    const { rows } = await pool.query("INSERT INTO organizations (name, slug) VALUES ('Test org', $1) RETURNING id", [`org-${randomUUID()}`]);
    const orgId = rows[0].id;
    const owner = await createUser({ orgId, role: "owner" });
    return { orgId, owner, member: (role) => createUser({ orgId, role }) };
  }

  /** Adds a server through the API and registers an agent with the install token. */
  async function registerServer(orgId, owner, facts = { hostname: "host-1", os: "Ubuntu 24.04", cpuCount: 2 }) {
    const created = await call("POST", `/orgs/${orgId}/servers`, { token: owner.token, body: { name: `srv-${randomUUID().slice(0, 6)}` } });
    if (created.status !== 201) throw new Error(`server create failed: ${JSON.stringify(created.json)}`);
    const bootstrap = created.json.installCommand.split(" ").pop();
    const reg = await call("POST", "/agent/register", { body: { token: bootstrap, facts } });
    if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg.json)}`);
    return { server: created.json.server, serverId: reg.json.serverId, agentToken: reg.json.agentToken, bootstrap };
  }

  /** App + environment on a registered server. */
  async function createAppWithEnvironment(orgId, owner, { serverId, strategy = "blue_green", owner_ = "inveon", repo } = {}) {
    repo ??= `repo-${randomUUID().slice(0, 8)}`;
    github.setHead(owner_, repo, "main", sha(), "Initial commit");
    const app = await call("POST", `/orgs/${orgId}/apps`, { token: owner.token, body: { name: `App ${repo}`, repoUrl: `https://github.com/${owner_}/${repo}`, branch: "main" } });
    if (app.status !== 201) throw new Error(`app create failed: ${JSON.stringify(app.json)}`);
    const environment = await call("POST", `/orgs/${orgId}/apps/${app.json.app.id}/environments`, { token: owner.token, body: { name: "production", serverId, strategy } });
    if (environment.status !== 201) throw new Error(`env create failed: ${JSON.stringify(environment.json)}`);
    return { app: app.json.app, webhookSecret: app.json.webhookSecret, environment: environment.json.environment, repoOwner: owner_, repo };
  }

  /**
   * Plays the agent: claims a job and reports every step with the given
   * outcome. `failAt` fails the first step with that action (after the
   * earlier ones succeed); `logs` appends extra output per action.
   */
  async function runClaimedJob(agentToken, { fail = false, failAt = null, results = {}, logs = {} } = {}) {
    const claim = await call("POST", "/agent/jobs/claim", { token: agentToken });
    if (claim.status !== 200) return null;
    const job = claim.json.job;
    let failed = false;
    for (const step of job.steps) {
      const failing = fail || step.action === failAt;
      await call("POST", `/agent/jobs/${job.id}/steps/${step.id}`, { token: agentToken, body: { status: "running", append: `running ${step.action}\n${logs[step.action] ?? ""}` } });
      const result = results[step.action]?.(step) ?? (step.action === "compose.validate" ? { appRoot: `/srv/inveon/apps/${step.params.slug}`, model: { services: { web: { image: "nginx" } } } } : undefined);
      const r = await call("POST", `/agent/jobs/${job.id}/steps/${step.id}`, { token: agentToken, body: { status: failing ? "failure" : "success", result } });
      if (r.status !== 200) throw new Error(`step report failed: ${JSON.stringify(r.json)}`);
      if (failing) {
        failed = true;
        break;
      }
    }
    const error = failed ? `${job.steps.find((s) => fail || s.action === failAt)?.name}: failed` : undefined;
    const fin = await call("POST", `/agent/jobs/${job.id}/finish`, { token: agentToken, body: { status: failed ? "failure" : "success", error } });
    return { job, finish: fin.json };
  }

  async function stop() {
    child.kill();
    await pool.end();
    await github.close();
  }

  return { origin, base, call, createUser, createOrg, registerServer, createAppWithEnvironment, runClaimedJob, tokenFor, github, pool, stop, logs: () => logs };
}
