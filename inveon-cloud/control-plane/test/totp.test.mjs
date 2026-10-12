import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, hotp, otpauthUri, totp, verifyTotp } from "../dist/lib/totp.js";

test("HOTP matches the RFC 4226 appendix D test values", () => {
  const secret = Buffer.from("12345678901234567890", "ascii");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  expected.forEach((code, counter) => assert.equal(hotp(secret, counter), code));
});

test("TOTP matches the RFC 6238 appendix B test vectors (SHA-1, SHA-256, SHA-512)", () => {
  const seeds = {
    sha1: Buffer.from("12345678901234567890", "ascii"),
    sha256: Buffer.from("12345678901234567890123456789012", "ascii"),
    sha512: Buffer.from("1234567890123456789012345678901234567890123456789012345678901234", "ascii"),
  };
  const vectors = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];
  for (const [time, s1, s256, s512] of vectors) {
    assert.equal(totp(seeds.sha1, time, { digits: 8, algorithm: "sha1" }), s1, `sha1 @${time}`);
    assert.equal(totp(seeds.sha256, time, { digits: 8, algorithm: "sha256" }), s256, `sha256 @${time}`);
    assert.equal(totp(seeds.sha512, time, { digits: 8, algorithm: "sha512" }), s512, `sha512 @${time}`);
  }
});

test("verifyTotp accepts one step of drift either way and returns the matched step", () => {
  const secret = Buffer.from("12345678901234567890", "ascii");
  const now = 1_700_000_000;
  const step = Math.floor(now / 30);
  assert.equal(verifyTotp(secret, totp(secret, now), now), step);
  assert.equal(verifyTotp(secret, totp(secret, now - 30), now), step - 1);
  assert.equal(verifyTotp(secret, totp(secret, now + 30), now), step + 1);
  assert.equal(verifyTotp(secret, totp(secret, now - 60), now), null);
  assert.equal(verifyTotp(secret, totp(secret, now + 60), now), null);
  assert.equal(verifyTotp(secret, "12345", now), null);
  assert.equal(verifyTotp(secret, "abcdef", now), null);
});

test("base32 round-trips (RFC 4648 vectors) and the otpauth URI carries the secret", () => {
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(base32Encode(Buffer.from("fooba")), "MZXW6YTB");
  assert.equal(base32Decode("MZXW6YTBOI").toString(), "foobar");
  const secret = Buffer.from("12345678901234567890", "ascii");
  assert.equal(base32Encode(secret), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  const uri = new URL(otpauthUri(secret, "asha@example.com"));
  assert.equal(uri.protocol, "otpauth:");
  assert.equal(uri.searchParams.get("secret"), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(uri.searchParams.get("issuer"), "Inveon Cloud");
  assert.match(decodeURIComponent(uri.href), /totp\/Inveon Cloud:asha@example\.com\?/);
});

test("recovery codes are ten distinct codes, hashed per user", () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  const h = hashRecoveryCode("user-a", codes[0]);
  assert.equal(h, hashRecoveryCode("user-a", codes[0].toUpperCase().replace(/-/g, " ")));
  assert.notEqual(h, hashRecoveryCode("user-b", codes[0]));
  assert.ok(!h.includes(codes[0].replace(/-/g, "")));
});
