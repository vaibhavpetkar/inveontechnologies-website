import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "../dist/env.js";

const required = { INVEON_DATABASE_URL: "postgres://x@y/z", INVEON_JWT_SECRET: "j".repeat(32) };

test("empty optional settings from Docker Compose count as unset", () => {
  const parsed = parseEnv({ ...required, INVEON_ACME_EMAIL: "", INVEON_SMTP_PORT: "", INVEON_PUBLIC_URL: "", INVEON_OPEN_SIGNUP: "" });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.INVEON_ACME_EMAIL, undefined);
  assert.equal(parsed.data.INVEON_SMTP_PORT, 587);
  assert.equal(parsed.data.INVEON_OPEN_SIGNUP, true);
});

test("an empty required setting still fails", () => {
  assert.equal(parseEnv({ ...required, INVEON_JWT_SECRET: "" }).success, false);
  assert.equal(parseEnv({ ...required, INVEON_ACME_EMAIL: "not-an-email" }).success, false);
});
