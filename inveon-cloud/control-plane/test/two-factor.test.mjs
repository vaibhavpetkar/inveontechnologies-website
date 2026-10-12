import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import { startServer, JWT_SECRET } from "./helpers.mjs";
import { base32Decode, totp } from "../dist/lib/totp.js";

let api;
before(async () => (api = await startServer()));
after(async () => api?.stop());

const cookieOf = (res) => res.headers.get("set-cookie")?.split(";")[0];
const now = () => Math.floor(Date.now() / 1000);

async function signUp() {
  const email = `owner-${randomUUID()}@test.local`;
  const password = "correct horse battery";
  const res = await api.call("POST", "/auth/signup", { body: { email, password, name: "Owner", orgName: "2FA org" } });
  assert.equal(res.status, 201);
  return { email, password, token: res.json.accessToken, cookie: cookieOf(res), userId: res.json.user.id, orgId: res.json.user.organizations[0].id, me: res.json.user };
}

/** Enrols through the API; returns the secret and the recovery codes. */
async function enrol(token, cookie) {
  const setup = await api.call("POST", "/auth/2fa/setup", { token, cookie });
  assert.equal(setup.status, 200);
  const secret = base32Decode(setup.json.secret);
  const enable = await api.call("POST", "/auth/2fa/enable", { token, cookie, body: { code: totp(secret, now()) } });
  assert.equal(enable.status, 200, JSON.stringify(enable.json));
  return { secret, recoveryCodes: enable.json.recoveryCodes, setup: setup.json };
}

test("owners must enrol before anything else; enrolment gives a QR URI and ten recovery codes shown once", async () => {
  const o = await signUp();
  assert.deepEqual({ enabled: o.me.twoFactor.enabled, required: o.me.twoFactor.required }, { enabled: false, required: true });

  const blocked = await api.call("GET", `/orgs/${o.orgId}/servers`, { token: o.token });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, "TWO_FACTOR_REQUIRED");

  const setup = await api.call("POST", "/auth/2fa/setup", { token: o.token });
  assert.equal(setup.status, 200);
  assert.match(setup.json.secret, /^[A-Z2-7]{32}$/);
  const uri = new URL(setup.json.otpauthUri);
  assert.equal(uri.protocol, "otpauth:");
  assert.equal(uri.searchParams.get("secret"), setup.json.secret);
  assert.ok(decodeURIComponent(setup.json.otpauthUri).includes(o.email));

  // The secret is stored encrypted, pending until confirmed.
  const { rows: pending } = await api.pool.query("SELECT totp_pending_secret_enc, totp_secret_enc, totp_enabled_at FROM users WHERE id = $1", [o.userId]);
  assert.ok(pending[0].totp_pending_secret_enc.startsWith("v1."));
  assert.ok(!pending[0].totp_pending_secret_enc.includes(setup.json.secret));
  assert.equal(pending[0].totp_enabled_at, null);

  const secret = base32Decode(setup.json.secret);
  const wrongCode = String((Number(totp(secret, now())) + 1) % 1000000).padStart(6, "0");
  assert.equal((await api.call("POST", "/auth/2fa/enable", { token: o.token, body: { code: wrongCode } })).status, 400);
  const enable = await api.call("POST", "/auth/2fa/enable", { token: o.token, cookie: o.cookie, body: { code: totp(secret, now()) } });
  assert.equal(enable.status, 200);
  assert.equal(enable.json.recoveryCodes.length, 10);
  assert.equal(enable.json.twoFactor.recoveryCodesLeft, 10);

  const { rows: codes } = await api.pool.query("SELECT code_hash FROM user_recovery_codes WHERE user_id = $1", [o.userId]);
  assert.equal(codes.length, 10);
  for (const c of codes) assert.match(c.code_hash, /^[0-9a-f]{64}$/);
  const stored = codes.map((c) => c.code_hash).join(" ");
  for (const rc of enable.json.recoveryCodes) assert.ok(!stored.includes(rc.replace(/-/g, "")));

  // Enrolled: the organization opens up, and setup can't silently replace the device.
  assert.equal((await api.call("GET", `/orgs/${o.orgId}/servers`, { token: o.token })).status, 200);
  assert.equal((await api.call("POST", "/auth/2fa/setup", { token: o.token })).status, 409);
  // The session that enrolled survives; others are signed out.
  assert.equal((await api.call("POST", "/auth/refresh", { cookie: o.cookie })).status, 200);
});

test("sign-in becomes two steps; codes can't be replayed; recovery codes work once", async () => {
  const o = await signUp();
  const { secret, recoveryCodes } = await enrol(o.token, o.cookie);

  const step1 = await api.call("POST", "/auth/login", { body: { email: o.email, password: o.password } });
  assert.equal(step1.status, 200);
  assert.equal(step1.json.twoFactorRequired, true);
  assert.equal(step1.json.accessToken, undefined);
  assert.equal(step1.headers.get("set-cookie"), null);
  const challenge = step1.json.challengeToken;

  // The challenge is not an access token.
  assert.equal((await api.call("GET", "/auth/me", { token: challenge })).status, 401);
  // And an access token is not a challenge.
  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken: o.token, code: totp(secret, now() + 30) } })).status, 401);

  // The code used to enrol (same 30-second step) is refused: replay.
  const replay = await api.call("POST", "/auth/login/2fa", { body: { challengeToken: challenge, code: totp(secret, now()) } });
  assert.equal(replay.status, 401);
  assert.equal(replay.json.error.code, "INVALID_CODE");

  const next = totp(secret, now() + 30);
  const ok = await api.call("POST", "/auth/login/2fa", { body: { challengeToken: challenge, code: next } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.ok(ok.json.accessToken);
  assert.match(cookieOf(ok), /^inveon_refresh_token=/);
  assert.equal(ok.json.user.twoFactor.enabled, true);

  // The same code again, and an older step, are refused within their window.
  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken: challenge, code: next } })).status, 401);
  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken: challenge, code: totp(secret, now() - 30) } })).status, 401);

  // A recovery code works once (any case, dashes optional).
  const rc = recoveryCodes[3];
  const viaRecovery = await api.call("POST", "/auth/login/2fa", { body: { challengeToken: challenge, recoveryCode: rc.toUpperCase().replace(/-/g, "") } });
  assert.equal(viaRecovery.status, 200);
  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken: challenge, recoveryCode: rc } })).status, 401);
  const me = await api.call("GET", "/auth/2fa", { token: viaRecovery.json.accessToken });
  assert.equal(me.json.twoFactor.recoveryCodesLeft, 9);

  // Expired or forged challenges are refused.
  const key = createHmac("sha256", JWT_SECRET).update("inveon-2fa-challenge").digest();
  const expired = jwt.sign({ sub: o.userId, typ: "2fa", exp: now() - 10 }, key, { audience: "inveon-2fa-challenge" });
  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken: expired, recoveryCode: recoveryCodes[0] } })).json.error.code, "INVALID_CHALLENGE");
  const forged = jwt.sign({ sub: o.userId, typ: "2fa" }, JWT_SECRET, { audience: "inveon-2fa-challenge", expiresIn: 60 });
  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken: forged, recoveryCode: recoveryCodes[0] } })).status, 401);
  // ...and nothing was used up by them.
  assert.equal((await api.call("GET", "/auth/2fa", { token: viaRecovery.json.accessToken })).json.twoFactor.recoveryCodesLeft, 9);

  // Wrong codes count towards the account lockout (the refused replays above counted too).
  await api.pool.query("UPDATE users SET failed_login_attempts = 0 WHERE id = $1", [o.userId]);
  const step = await api.call("POST", "/auth/login", { body: { email: o.email, password: o.password } });
  for (let i = 0; i < 5; i++) {
    const r = await api.call("POST", "/auth/login/2fa", { body: { challengeToken: step.json.challengeToken, code: "000000" } });
    assert.equal(r.status, 401);
  }
  const locked = await api.call("POST", "/auth/login/2fa", { body: { challengeToken: step.json.challengeToken, code: totp(secret, now() + 30) } });
  assert.equal(locked.status, 423);
  const { rows } = await api.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.2fa_failed'", [o.userId]);
  assert.ok(rows[0].n >= 5);
});

test("turning two-factor off needs a current code or a recovery code; new recovery codes replace the old", async () => {
  const o = await signUp();
  const { secret, recoveryCodes } = await enrol(o.token, o.cookie);

  const regen = await api.call("POST", "/auth/2fa/recovery-codes", { token: o.token, body: { recoveryCode: recoveryCodes[0] } });
  assert.equal(regen.status, 200);
  assert.equal(regen.json.recoveryCodes.length, 10);
  // Old codes are gone.
  assert.equal((await api.call("POST", "/auth/2fa/disable", { token: o.token, body: { recoveryCode: recoveryCodes[1] } })).status, 400);
  assert.equal((await api.call("POST", "/auth/2fa/disable", { token: o.token, body: { code: "123456", recoveryCode: "abcd-efgh-jkmn" } })).status, 400);
  assert.equal((await api.call("POST", "/auth/2fa/disable", { token: o.token, body: {} })).status, 400);

  const off = await api.call("POST", "/auth/2fa/disable", { token: o.token, body: { code: totp(secret, now() + 30) } });
  assert.equal(off.status, 200);
  assert.equal(off.json.twoFactor.enabled, false);
  const { rows } = await api.pool.query("SELECT totp_secret_enc, (SELECT count(*)::int FROM user_recovery_codes WHERE user_id = $1) AS codes FROM users WHERE id = $1", [o.userId]);
  assert.equal(rows[0].totp_secret_enc, null);
  assert.equal(rows[0].codes, 0);

  // An owner without two-factor is blocked again; sign-in is one step again.
  assert.equal((await api.call("GET", `/orgs/${o.orgId}/apps`, { token: o.token })).json.error.code, "TWO_FACTOR_REQUIRED");
  const login = await api.call("POST", "/auth/login", { body: { email: o.email, password: o.password } });
  assert.ok(login.json.accessToken);
});

test("an organization can require two-factor for admins; developers are never blocked", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const admin = await member("admin");
  const developer = await member("developer");
  assert.equal((await api.call("GET", `/orgs/${orgId}/servers`, { token: admin.token })).status, 200);

  assert.equal((await api.call("PATCH", `/orgs/${orgId}`, { token: admin.token, body: { require2faForAdmins: true } })).status, 403);
  const set = await api.call("PATCH", `/orgs/${orgId}`, { token: owner.token, body: { require2faForAdmins: true } });
  assert.equal(set.status, 200);
  assert.equal(set.json.organization.require2faForAdmins, true);

  const blocked = await api.call("GET", `/orgs/${orgId}/servers`, { token: admin.token });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, "TWO_FACTOR_REQUIRED");
  assert.equal((await api.call("GET", "/auth/me", { token: admin.token })).json.user.twoFactor.required, true);
  assert.equal((await api.call("GET", `/orgs/${orgId}/servers`, { token: developer.token })).status, 200);
  assert.equal((await api.call("GET", "/auth/me", { token: developer.token })).json.user.twoFactor.required, false);

  await enrol(admin.token);
  assert.equal((await api.call("GET", `/orgs/${orgId}/servers`, { token: admin.token })).status, 200);
});

test("an owner can reset a member's two-factor (audit-logged); not across organizations they don't own", async () => {
  const { orgId, owner, member } = await api.createOrg();
  const dev = await member("developer");
  await enrol(dev.token);
  const members = await api.call("GET", `/orgs/${orgId}/members`, { token: owner.token });
  assert.equal(members.json.members.find((m) => m.userId === dev.id).twoFactorEnabled, true);

  const admin = await member("admin");
  assert.equal((await api.call("POST", `/orgs/${orgId}/members/${dev.id}/2fa/reset`, { token: admin.token })).status, 403);
  assert.equal((await api.call("POST", `/orgs/${orgId}/members/${owner.id}/2fa/reset`, { token: owner.token })).status, 400);

  // The same person in another organization this owner doesn't own: refused.
  const other = await api.createOrg();
  await api.pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'viewer')", [other.orgId, dev.id]);
  const refused = await api.call("POST", `/orgs/${orgId}/members/${dev.id}/2fa/reset`, { token: owner.token });
  assert.equal(refused.status, 403);
  await api.pool.query("DELETE FROM memberships WHERE org_id = $1 AND user_id = $2", [other.orgId, dev.id]);

  await api.pool.query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')", [dev.id, randomUUID()]);
  const reset = await api.call("POST", `/orgs/${orgId}/members/${dev.id}/2fa/reset`, { token: owner.token });
  assert.equal(reset.status, 200);
  const { rows } = await api.pool.query("SELECT totp_enabled_at, (SELECT count(*)::int FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL) AS live FROM users WHERE id = $1", [dev.id]);
  assert.equal(rows[0].totp_enabled_at, null);
  assert.equal(rows[0].live, 0);
  const log = await api.call("GET", `/orgs/${orgId}/audit`, { token: owner.token });
  const entry = log.json.entries.find((e) => e.action === "member.2fa_reset");
  assert.equal(entry.entityId, dev.id);
  assert.equal(entry.actorUserId, owner.id);
  assert.equal((await api.call("POST", `/orgs/${orgId}/members/${dev.id}/2fa/reset`, { token: owner.token })).status, 400);
});
