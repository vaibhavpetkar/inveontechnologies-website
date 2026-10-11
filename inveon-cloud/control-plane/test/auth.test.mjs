import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startServer } from "./helpers.mjs";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const cookieOf = (res) => res.headers.get("set-cookie")?.split(";")[0];

test("sign up creates a user, an organization they own and a session", async () => {
  const email = `Owner-${randomUUID()}@Test.Local`;
  const res = await api.call("POST", "/auth/signup", { body: { email, password: "correct horse battery", name: "Asha", orgName: "Inveon" } });
  assert.equal(res.status, 201);
  assert.ok(res.json.accessToken);
  assert.equal(res.json.user.email, email.toLowerCase());
  assert.equal(res.json.user.organizations.length, 1);
  assert.equal(res.json.user.organizations[0].role, "owner");
  const cookie = cookieOf(res);
  assert.match(cookie, /^inveon_refresh_token=/);
  assert.match(res.headers.get("set-cookie"), /HttpOnly/i);

  // Stored as argon2id, never plaintext.
  const { rows } = await api.pool.query("SELECT password_hash FROM users WHERE email = $1", [email.toLowerCase()]);
  assert.match(rows[0].password_hash, /^\$argon2id\$/);

  const dup = await api.call("POST", "/auth/signup", { body: { email, password: "another password 1", name: "B" } });
  assert.equal(dup.status, 409);

  const bad = await api.call("POST", "/auth/login", { body: { email, password: "wrong password" } });
  assert.equal(bad.status, 401);
  const good = await api.call("POST", "/auth/login", { body: { email, password: "correct horse battery" } });
  assert.equal(good.status, 200);

  // Refresh rotates; the old cookie is then dead and its reuse revokes everything.
  const refreshed = await api.call("POST", "/auth/refresh", { cookie: cookieOf(good) });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.json.accessToken);
  const reuse = await api.call("POST", "/auth/refresh", { cookie: cookieOf(good) });
  assert.equal(reuse.status, 401);
  const afterReuse = await api.call("POST", "/auth/refresh", { cookie: cookieOf(refreshed) });
  assert.equal(afterReuse.status, 401);

  const me = await api.call("GET", "/auth/me", { token: refreshed.json.accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.organizations[0].name, "Inveon");
  assert.equal((await api.call("GET", "/auth/me")).status, 401);
});

test("roles: viewer reads, developer deploys, admin manages servers, owner manages members", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const viewer = await member("viewer");
  const developer = await member("developer");
  const admin = await member("admin");

  assert.equal((await api.call("GET", `/orgs/${orgId}/servers`, { token: viewer.token })).status, 200);
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers`, { token: viewer.token, body: { name: "x" } })).status, 403);
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers`, { token: developer.token, body: { name: "x" } })).status, 403);
  assert.equal((await api.call("POST", `/orgs/${orgId}/servers`, { token: admin.token, body: { name: "x" } })).status, 201);

  // Admins can't change roles; owners can. The last owner can't be demoted.
  assert.equal((await api.call("PATCH", `/orgs/${orgId}/members/${viewer.id}`, { token: admin.token, body: { role: "developer" } })).status, 403);
  assert.equal((await api.call("PATCH", `/orgs/${orgId}/members/${viewer.id}`, { token: owner.token, body: { role: "developer" } })).status, 200);
  const demote = await api.call("PATCH", `/orgs/${orgId}/members/${owner.id}`, { token: owner.token, body: { role: "admin" } });
  assert.equal(demote.status, 400);
  assert.equal(demote.json.error.code, "LAST_OWNER");

  // Audit log: admins and owners only.
  assert.equal((await api.call("GET", `/orgs/${orgId}/audit`, { token: developer.token })).status, 403);
  const log = await api.call("GET", `/orgs/${orgId}/audit`, { token: admin.token });
  assert.equal(log.status, 200);
  const actions = log.json.entries.map((e) => e.action);
  assert.ok(actions.includes("server.create"));
  assert.ok(actions.includes("member.role_change"));
});

test("non-members get 404 for another organization", async () => {
  const a = await api.createOrg();
  const b = await api.createOrg();
  const res = await api.call("GET", `/orgs/${a.orgId}/servers`, { token: b.owner.token });
  assert.equal(res.status, 404);
});

test("invites: single use, role ceiling, sign-up with invite joins the org", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const admin = await member("admin");

  const tooHigh = await api.call("POST", `/orgs/${orgId}/invites`, { token: admin.token, body: { email: "boss@test.local", role: "owner" } });
  assert.equal(tooHigh.status, 403);

  const email = `dev-${randomUUID()}@test.local`;
  const inv = await api.call("POST", `/orgs/${orgId}/invites`, { token: admin.token, body: { email, role: "developer" } });
  assert.equal(inv.status, 201);
  const token = inv.json.inviteUrl.split("/invite/")[1];
  assert.ok(token);

  const preview = await api.call("GET", `/auth/invites/${token}`);
  assert.equal(preview.json.invite.role, "developer");

  const signup = await api.call("POST", "/auth/signup", { body: { email, password: "long enough pass", name: "Dev", inviteToken: token } });
  assert.equal(signup.status, 201);
  assert.deepEqual(signup.json.user.organizations.map((o) => [o.id, o.role]), [[orgId, "developer"]]);

  // Used once already.
  const other = await api.createUser();
  const again = await api.call("POST", "/auth/invites/accept", { token: other.token, body: { token } });
  assert.equal(again.status, 400);

  const members = await api.call("GET", `/orgs/${orgId}/members`, { token: owner.token });
  assert.ok(members.json.members.some((m) => m.email === email && m.role === "developer"));
});
