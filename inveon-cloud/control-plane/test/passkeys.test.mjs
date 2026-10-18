import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startServer } from "./helpers.mjs";
import { cbor, softAuthenticator } from "./soft-authenticator.mjs";
import { decodeCbor } from "../dist/lib/cbor.js";
import { relyingParty, verifyRegistration, verifyAssertion, coseToPublicKey } from "../dist/lib/webauthn.js";

const RP = { id: "cloud.test", origins: ["https://cloud.test"] };
const PASSWORD = "correct horse battery";

test("CBOR: decodes what WebAuthn needs and refuses malformed input", () => {
  const m = decodeCbor(cbor(new Map([[1, 2], [-1, 1], ["fmt", "none"], ["b", Buffer.from([1, 2])], ["l", [1, -300, 70000, true, null]]])));
  assert.equal(m.get(1), 2);
  assert.equal(m.get(-1), 1);
  assert.equal(m.get("fmt"), "none");
  assert.deepEqual(m.get("b"), Buffer.from([1, 2]));
  assert.deepEqual(m.get("l"), [1, -300, 70000, true, null]);
  for (const bad of [
    Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff]), // byte string longer than the input
    Buffer.from([0x9a, 0xff, 0xff, 0xff, 0xff]), // array count larger than the input
    Buffer.from([0x5f, 0x41, 0x00, 0xff]), // indefinite length
    Buffer.from([0xc1, 0x00]), // tag
    Buffer.from([0xa2, 0x01, 0x01, 0x01, 0x02]), // duplicate key
    Buffer.from([0x01, 0x02]), // trailing bytes
    Buffer.from([0xfb, 0, 0, 0, 0, 0, 0, 0, 0]), // float
    Buffer.alloc(40, 0x81), // nested too deep
  ]) {
    assert.throws(() => decodeCbor(bad), bad.toString("hex"));
  }
});

test("WebAuthn checks: ES256, EdDSA and RS256; none and packed self attestation; origin, rpId, type, presence and verification", () => {
  const options = (challenge = "Y2hhbGxlbmdlLWNoYWxsZW5nZS1jaGFsbGVuZ2UtMTI") => ({ challenge, rp: { id: "cloud.test" }, rpId: "cloud.test" });
  const reg = (a, cred, expected = {}) =>
    verifyRegistration(
      { credentialId: Buffer.from(cred.rawId, "base64url"), clientDataJSON: Buffer.from(cred.response.clientDataJSON, "base64url"), attestationObject: Buffer.from(cred.response.attestationObject, "base64url") },
      { challenge: options().challenge, rp: RP, requireUserVerification: true, ...expected },
    );
  for (const alg of ["ES256", "EdDSA", "RS256"]) {
    for (const fmt of ["none", "packed"]) {
      const a = softAuthenticator({ alg });
      const v = reg(a, a.create(options(), { fmt }));
      assert.equal(v.alg, { ES256: -7, EdDSA: -8, RS256: -257 }[alg]);
      assert.equal(v.fmt, fmt);
      assert.equal(v.aaguid, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
      // And an assertion verifies against the stored key, with the counter going up.
      const got = a.get(options());
      const r = verifyAssertion(
        { clientDataJSON: Buffer.from(got.response.clientDataJSON, "base64url"), authenticatorData: Buffer.from(got.response.authenticatorData, "base64url"), signature: Buffer.from(got.response.signature, "base64url") },
        { publicKey: v.publicKey, alg: v.alg, signCount: 0 },
        { challenge: options().challenge, rp: RP, requireUserVerification: true },
      );
      assert.equal(r.signCount, 1);
    }
  }
  const a = softAuthenticator();
  const refuse = (cred, re, expected) => assert.throws(() => reg(a, cred, expected), re);
  refuse(a.create(options("b3RoZXItY2hhbGxlbmdl")), /challenge/);
  refuse(a.create(options(), { rpIdOverride: "evil.test" }), /another site/);
  refuse(a.create(options(), { uv: false }), /verify the user/);
  refuse(a.create(options(), { up: false }), /presence/);
  refuse(a.create(options(), { clientExtra: { origin: "https://evil.test" } }), /Unexpected origin/);
  refuse(a.create(options(), { clientExtra: { type: "webauthn.get" } }), /webauthn.create/);
  refuse(a.create(options(), { clientExtra: { crossOrigin: true } }), /Cross-origin/);
  refuse(a.create(options(), { fmt: "none", attStmt: new Map([["x", 1]]) }), /empty statement/);
  refuse(a.create(options(), { fmt: "fido-u2f" }), /not supported/);
  refuse(a.create(options(), { fmt: "packed", selfAlgOverride: -257 }), /credential's algorithm/);
  refuse(a.create(options(), { fmt: "packed", attStmt: new Map([["alg", -7], ["sig", Buffer.alloc(70, 1)]]) }), /attestation signature/);
  // The id the browser reports must be the attested one.
  const cred = a.create(options());
  assert.throws(() => verifyRegistration({ credentialId: Buffer.alloc(32, 1), clientDataJSON: Buffer.from(cred.response.clientDataJSON, "base64url"), attestationObject: Buffer.from(cred.response.attestationObject, "base64url") }, { challenge: options().challenge, rp: RP, requireUserVerification: true }), /doesn't match/);
  // Unsupported keys.
  assert.throws(() => coseToPublicKey(new Map([[1, 2], [3, -35], [-1, 2]])), /Unsupported credential algorithm/);
  assert.throws(() => coseToPublicKey(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.alloc(32)], [-3, Buffer.alloc(32)]])), /invalid/);
  // rpId and origins from INVEON_PUBLIC_URL.
  assert.deepEqual(relyingParty("https://cloud.example.com", "http://dev.cloud.example.com:5174"), { id: "cloud.example.com", origins: ["https://cloud.example.com", "http://dev.cloud.example.com:5174"] });
  assert.throws(() => relyingParty("https://cloud.example.com", "https://evil.test"));
});

let api;
before(async () => {
  api = await startServer();
});
after(async () => api?.stop());

/** A real account (password set), the owner of its own organization, without two-factor. */
async function signup() {
  const email = `pk-${randomUUID()}@test.local`;
  const r = await api.call("POST", "/auth/signup", { body: { email, password: PASSWORD, name: "Passkey Person" } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { email, token: r.json.accessToken, userId: r.json.user.id, orgId: r.json.user.organizations[0].id };
}

async function addPasskey(u, auth, { name = "Laptop", fmt = "none" } = {}) {
  const opts = await api.call("POST", "/auth/passkeys/register/options", { token: u.token, body: { password: PASSWORD } });
  assert.equal(opts.status, 200, JSON.stringify(opts.json));
  const r = await api.call("POST", "/auth/passkeys/register", { token: u.token, body: { ceremonyId: opts.json.ceremonyId, name, credential: auth.create(opts.json.publicKey, { fmt }) } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.passkey;
}

async function passkeyLogin(auth, getOpts = {}, { challengeToken } = {}) {
  const opts = await api.call("POST", "/auth/passkeys/login/options", { body: challengeToken ? { challengeToken } : {} });
  assert.equal(opts.status, 200, JSON.stringify(opts.json));
  const credential = auth.get(opts.json.publicKey, getOpts);
  const res = await api.call("POST", "/auth/passkeys/login", { body: { ceremonyId: opts.json.ceremonyId, credential, ...(challengeToken ? { challengeToken } : {}) } });
  return { res, opts: opts.json, credential };
}

test("registering a passkey: the password again, options for the browser, single-use challenge, and it satisfies the owner requirement", async () => {
  const u = await signup();
  const gated = await api.call("GET", `/orgs/${u.orgId}/servers`, { token: u.token });
  assert.equal(gated.json.error.code, "TWO_FACTOR_REQUIRED");

  assert.equal((await api.call("POST", "/auth/passkeys/register/options", { token: u.token, body: {} })).status, 400);
  const wrong = await api.call("POST", "/auth/passkeys/register/options", { token: u.token, body: { password: "not it at all" } });
  assert.equal(wrong.status, 401);
  assert.equal((await api.call("POST", "/auth/passkeys/register/options", { body: { password: PASSWORD } })).status, 401);

  const opts = await api.call("POST", "/auth/passkeys/register/options", { token: u.token, body: { password: PASSWORD } });
  const pk = opts.json.publicKey;
  assert.equal(pk.rp.id, "cloud.test");
  assert.equal(pk.attestation, "none");
  assert.equal(pk.authenticatorSelection.userVerification, "required");
  assert.equal(pk.authenticatorSelection.residentKey, "required");
  assert.deepEqual(pk.pubKeyCredParams.map((p) => p.alg), [-8, -7, -257]);
  assert.equal(Buffer.from(pk.user.id, "base64url").toString("hex"), u.userId.replace(/-/g, ""));
  assert.equal(Buffer.from(pk.challenge, "base64url").length, 32);

  const auth = softAuthenticator();
  const bad = await api.call("POST", "/auth/passkeys/register", { token: u.token, body: { ceremonyId: opts.json.ceremonyId, credential: auth.create(pk, { rpIdOverride: "evil.test" }) } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error.message, /another site/);
  // That used the challenge up.
  const again = await api.call("POST", "/auth/passkeys/register", { token: u.token, body: { ceremonyId: opts.json.ceremonyId, credential: auth.create(pk) } });
  assert.equal(again.json.error.code, "PASSKEY_CHALLENGE_EXPIRED");

  const passkey = await addPasskey(u, auth);
  assert.equal(passkey.name, "Laptop");
  assert.equal(passkey.alg, -7);
  assert.deepEqual(passkey.transports, ["internal", "hybrid"]);
  assert.equal((await api.call("GET", `/orgs/${u.orgId}/servers`, { token: u.token })).status, 200, "a passkey satisfies the owner requirement");
  const me = await api.call("GET", "/auth/me", { token: u.token });
  assert.equal(me.json.user.twoFactor.passkeys, 1);
  assert.equal(me.json.user.twoFactor.satisfied, true);
  assert.equal(me.json.user.twoFactor.enabled, false);

  // The same credential twice is refused; the next one lists the first as excluded.
  const opts2 = await api.call("POST", "/auth/passkeys/register/options", { token: u.token, body: { password: PASSWORD } });
  assert.deepEqual(opts2.json.publicKey.excludeCredentials.map((c) => c.id), [auth.id]);
  const dup = await api.call("POST", "/auth/passkeys/register", { token: u.token, body: { ceremonyId: opts2.json.ceremonyId, credential: auth.create(opts2.json.publicKey) } });
  assert.equal(dup.status, 409);

  // Another user's ceremony can't be finished by this user.
  const other = await signup();
  const theirs = await api.call("POST", "/auth/passkeys/register/options", { token: other.token, body: { password: PASSWORD } });
  const stolen = await api.call("POST", "/auth/passkeys/register", { token: u.token, body: { ceremonyId: theirs.json.ceremonyId, credential: softAuthenticator().create(theirs.json.publicKey) } });
  assert.equal(stolen.json.error.code, "PASSKEY_CHALLENGE_EXPIRED");

  // Other algorithms and packed self attestation through the API too.
  await addPasskey(u, softAuthenticator({ alg: "EdDSA" }), { name: "Key", fmt: "packed" });
  await addPasskey(u, softAuthenticator({ alg: "RS256" }), { name: "Windows" });
  const list = await api.call("GET", "/auth/passkeys", { token: u.token });
  assert.deepEqual(list.json.passkeys.map((p) => p.name), ["Laptop", "Key", "Windows"]);
  assert.equal(list.json.passkeys[0].publicKey, undefined);
  const audit = await api.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.passkey_add'", [u.userId]);
  assert.equal(audit.rows[0].n, 3);
});

test("signing in with a passkey: no password, user verification required, replays and cloned counters refused", async () => {
  const u = await signup();
  const auth = softAuthenticator({ counter: 5 });
  await addPasskey(u, auth);

  const { res, opts } = await passkeyLogin(auth);
  assert.equal(opts.publicKey.userVerification, "required");
  assert.deepEqual(opts.publicKey.allowCredentials, []);
  assert.equal(opts.publicKey.rpId, "cloud.test");
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.ok(res.json.accessToken);
  assert.match(res.headers.get("set-cookie"), /inveon_refresh_token=/);
  assert.equal(res.json.user.id, u.userId);
  const session = res.json.accessToken;
  assert.equal((await api.call("GET", `/orgs/${u.orgId}/servers`, { token: session })).status, 200);
  const row = await api.pool.query("SELECT sign_count, last_used_at FROM user_passkeys WHERE user_id = $1", [u.userId]);
  assert.equal(Number(row.rows[0].sign_count), 6);
  assert.ok(row.rows[0].last_used_at);

  // Without user verification (no PIN or biometrics), a passkey alone isn't enough.
  assert.equal((await passkeyLogin(auth, { uv: false })).res.status, 401);
  // A bad signature, another origin, the wrong user handle, an unknown credential.
  assert.equal((await passkeyLogin(auth, { tamper: true })).res.status, 401);
  assert.equal((await passkeyLogin(auth, { clientExtra: { origin: "https://evil.test" } })).res.status, 401);
  assert.equal((await passkeyLogin(auth, { userHandle: Buffer.alloc(16, 1).toString("base64url") })).res.status, 401);
  const stranger = await passkeyLogin(softAuthenticator());
  assert.equal(stranger.res.json.error.code, "UNKNOWN_PASSKEY");

  // A replay: the challenge is gone.
  const ok = await passkeyLogin(auth);
  assert.equal(ok.res.status, 200);
  const replay = await api.call("POST", "/auth/passkeys/login", { body: { ceremonyId: ok.opts.ceremonyId, credential: ok.credential } });
  assert.equal(replay.json.error.code, "PASSKEY_CHALLENGE_EXPIRED");
  // A counter that doesn't go up (a cloned authenticator).
  auth.signCount = 3;
  const cloned = await passkeyLogin(auth);
  assert.equal(cloned.res.status, 401);
  assert.match(cloned.res.json.error.message, /cloned/);
  const flagged = await api.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.passkey_clone_suspected'", [u.userId]);
  assert.equal(flagged.rows[0].n, 1);
  auth.signCount = 100;
  // An expired challenge.
  const opts2 = await api.call("POST", "/auth/passkeys/login/options", { body: {} });
  await api.pool.query("UPDATE webauthn_challenges SET expires_at = now() - interval '1 second' WHERE id = $1", [opts2.json.ceremonyId]);
  const late = await api.call("POST", "/auth/passkeys/login", { body: { ceremonyId: opts2.json.ceremonyId, credential: auth.get(opts2.json.publicKey) } });
  assert.equal(late.json.error.code, "PASSKEY_CHALLENGE_EXPIRED");

  // Synced passkeys always report 0: fine.
  const synced = softAuthenticator({ step: 0 });
  await addPasskey(u, synced, { name: "Phone" });
  assert.equal((await passkeyLogin(synced)).res.status, 200);
  assert.equal((await passkeyLogin(synced)).res.status, 200);

  const logins = await api.pool.query("SELECT metadata FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.login'", [u.userId]);
  assert.ok(logins.rows.every((r) => r.metadata.method === "passkey"));
});

test("password plus passkey: the passkey is the second step, bound to that user; TOTP codes don't apply", async () => {
  const u = await signup();
  const auth = softAuthenticator();
  await addPasskey(u, auth);
  const login = await api.call("POST", "/auth/login", { body: { email: u.email, password: PASSWORD } });
  assert.equal(login.json.twoFactorRequired, true);
  assert.deepEqual(login.json.methods, ["passkey"]);
  assert.equal(login.json.accessToken, undefined);
  const challengeToken = login.json.challengeToken;

  assert.equal((await api.call("POST", "/auth/login/2fa", { body: { challengeToken, code: "123456" } })).json.error.code, "USE_PASSKEY");

  // Another account's passkey can't finish this sign-in.
  const other = await signup();
  const otherAuth = softAuthenticator();
  await addPasskey(other, otherAuth);
  const foreign = await passkeyLogin(otherAuth, {}, { challengeToken });
  assert.equal(foreign.res.json.error.code, "UNKNOWN_PASSKEY");
  // A user-bound ceremony needs its challenge token.
  const opts = await api.call("POST", "/auth/passkeys/login/options", { body: { challengeToken } });
  assert.deepEqual(opts.json.publicKey.allowCredentials.map((c) => c.id), [auth.id]);
  assert.equal(opts.json.publicKey.userVerification, "preferred");
  const noToken = await api.call("POST", "/auth/passkeys/login", { body: { ceremonyId: opts.json.ceremonyId, credential: auth.get(opts.json.publicKey) } });
  assert.equal(noToken.json.error.code, "INVALID_CHALLENGE");

  // After the password, presence is enough.
  const second = await passkeyLogin(auth, { uv: false }, { challengeToken });
  assert.equal(second.res.status, 200, JSON.stringify(second.res.json));
  const log = await api.pool.query("SELECT metadata FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.login' ORDER BY created_at DESC LIMIT 1", [u.userId]);
  assert.equal(log.rows[0].metadata.secondFactor, "passkey");
  // A forged challenge token gets nothing.
  assert.equal((await api.call("POST", "/auth/passkeys/login/options", { body: { challengeToken: "x".repeat(40) } })).status, 401);
});

test("renaming and removing passkeys; an owner's reset removes them", async () => {
  const u = await signup();
  const p = await addPasskey(u, softAuthenticator());
  const renamed = await api.call("PATCH", `/auth/passkeys/${p.id}`, { token: u.token, body: { name: "Work laptop" } });
  assert.equal(renamed.json.passkey.name, "Work laptop");
  const other = await signup();
  assert.equal((await api.call("PATCH", `/auth/passkeys/${p.id}`, { token: other.token, body: { name: "mine" } })).status, 404);
  assert.equal((await api.call("DELETE", `/auth/passkeys/${p.id}`, { token: other.token, body: { password: PASSWORD } })).status, 404);
  assert.equal((await api.call("DELETE", `/auth/passkeys/${p.id}`, { token: u.token, body: { password: "wrong password!" } })).status, 401);
  assert.equal((await api.call("DELETE", `/auth/passkeys/${p.id}`, { token: u.token, body: { password: PASSWORD } })).status, 200);
  assert.equal((await api.call("GET", `/orgs/${u.orgId}/servers`, { token: u.token })).json.error.code, "TWO_FACTOR_REQUIRED");

  // An owner resets a developer who lost the device holding their passkey.
  const dev = await signup();
  await addPasskey(dev, softAuthenticator());
  await api.pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'developer')", [u.orgId, dev.userId]);
  await api.pool.query("DELETE FROM memberships WHERE user_id = $1 AND org_id <> $2", [dev.userId, u.orgId]);
  await addPasskey(u, softAuthenticator());
  const members = await api.call("GET", `/orgs/${u.orgId}/members`, { token: u.token });
  assert.equal(members.json.members.find((m) => m.userId === dev.userId).twoFactorEnabled, true);
  const reset = await api.call("POST", `/orgs/${u.orgId}/members/${dev.userId}/2fa/reset`, { token: u.token });
  assert.equal(reset.status, 200, JSON.stringify(reset.json));
  const left = await api.pool.query("SELECT count(*)::int AS n FROM user_passkeys WHERE user_id = $1", [dev.userId]);
  assert.equal(left.rows[0].n, 0);
});
