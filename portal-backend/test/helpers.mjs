// Shared harness for the API tests: boots the compiled server (dist/) on a
// free port against TEST_DATABASE_URL, runs migrations first, and gives
// tests helpers to create users and call the API.
//
//   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/portal_test npm test
//
// The database must exist and should be disposable — tests insert rows.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import argon2 from "argon2";

export const JWT_SECRET = "test-jwt-secret-".padEnd(48, "x");
const REFRESH_SECRET = "test-refresh-secret-".padEnd(48, "y");
const DATABASE_URL = process.env.TEST_DATABASE_URL;

function freePort() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer(extraEnv = {}) {
  if (!DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to run the API tests");
  const env = {
    ...process.env,
    NODE_ENV: "development",
    PORTAL_DATABASE_URL: DATABASE_URL,
    PORTAL_JWT_SECRET: JWT_SECRET,
    PORTAL_REFRESH_SECRET: REFRESH_SECRET,
    PORTAL_CORS_ORIGIN: "http://localhost:5173",
    ...extraEnv,
  };
  delete env.PORTAL_SMTP_HOST;
  execFileSync(process.execPath, ["dist/modules/shared/migrate.js"], { env, stdio: "ignore" });

  const port = await freePort();
  const child = spawn(process.execPath, ["dist/index.js"], { env: { ...env, PORTAL_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));

  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/health/live`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  async function call(method, path, { token, body, cookie } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }

  /** Inserts a user directly and returns { id, email, token } — no rate-limited login needed. */
  async function createUser(role = "candidate", { email, password, emailVerified = true, profile = role === "candidate" } = {}) {
    email ??= `${role}-${randomUUID()}@test.local`;
    const passwordHash = password ? await argon2.hash(password, { type: argon2.argon2id }) : "not-a-real-hash";
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, $3, $4) RETURNING id",
      [email, passwordHash, role, emailVerified],
    );
    const id = rows[0].id;
    if (profile) {
      await pool.query("INSERT INTO candidate_profiles (user_id, full_name, phone, profile_completed) VALUES ($1, $2, $3, true)", [id, `Test ${role}`, "9000000000"]);
    }
    return { id, email, role, token: jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: "15m" }) };
  }

  async function stop() {
    child.kill();
    await pool.end();
  }

  return { base, call, createUser, pool, stop, logs: () => logs };
}

/** Common fixture: a published opportunity (optionally with a hiring manager) and an application to it. */
export async function createOpportunityWithApplication(api, { hr, admin, hiringManagerId, candidate } = {}) {
  const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Role ${randomUUID().slice(0, 8)}`, description: "Test opening description", hiringManagerId } })).json.opportunity;
  await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
  candidate ??= await api.createUser("candidate");
  const application = (await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} })).json.application;
  return { opp, candidate, application };
}
