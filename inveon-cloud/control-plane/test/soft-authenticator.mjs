// A software WebAuthn authenticator for the passkey tests: makes keys with
// node:crypto, and builds attestation objects, authenticator data and
// client data the way a browser and an authenticator would, so the control
// plane's checks run against real signatures. Includes a minimal CBOR
// encoder (definite lengths, integers, byte and text strings, arrays, maps).
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

export function cbor(v) {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") {
    const b = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  if (v === true) return Buffer.from([0xf5]);
  if (v === false) return Buffer.from([0xf4]);
  if (v === null) return Buffer.from([0xf6]);
  throw new Error(`cbor: unsupported ${typeof v}`);
}

const ALG = { ES256: -7, EdDSA: -8, RS256: -257 };

function keyPair(alg) {
  if (alg === "ES256") return generateKeyPairSync("ec", { namedCurve: "P-256" });
  if (alg === "EdDSA") return generateKeyPairSync("ed25519");
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function coseKey(alg, publicKey) {
  const jwk = publicKey.export({ format: "jwk" });
  const b = (s) => Buffer.from(s, "base64url");
  if (alg === "ES256") return new Map([[1, 2], [3, -7], [-1, 1], [-2, b(jwk.x)], [-3, b(jwk.y)]]);
  if (alg === "EdDSA") return new Map([[1, 1], [3, -8], [-1, 6], [-2, b(jwk.x)]]);
  return new Map([[1, 3], [3, -257], [-1, b(jwk.n)], [-2, b(jwk.e)]]);
}

function signWith(alg, privateKey, data) {
  if (alg === "EdDSA") return sign(null, data, privateKey);
  return sign("sha256", data, privateKey);
}

const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 };

/**
 * One authenticator holding one credential. `origin` and `rpId` are what
 * the "browser" reports; tests change them to forge bad responses.
 */
export function softAuthenticator({ alg = "ES256", rpId = "cloud.test", origin = "https://cloud.test", counter = 0, step = 1 } = {}) {
  const { publicKey, privateKey } = keyPair(alg);
  const credentialId = randomBytes(32);
  let signCount = counter;
  const rpIdHash = (id) => createHash("sha256").update(id).digest();
  const clientData = (type, challenge, extra = {}) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }));

  return {
    alg,
    credentialId,
    id: credentialId.toString("base64url"),
    get signCount() {
      return signCount;
    },
    set signCount(n) {
      signCount = n;
    },

    /** navigator.credentials.create() as JSON (base64url fields). */
    create(options, { fmt = "none", uv = true, up = true, rpIdOverride, clientExtra, attStmt, selfAlgOverride } = {}) {
      let flags = FLAGS.AT | FLAGS.BE;
      if (up) flags |= FLAGS.UP;
      if (uv) flags |= FLAGS.UV;
      const count = Buffer.alloc(4);
      count.writeUInt32BE(signCount);
      const idLen = Buffer.alloc(2);
      idLen.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([rpIdHash(rpIdOverride ?? options.rp.id), Buffer.from([flags]), count, Buffer.alloc(16, 0xaa), idLen, credentialId, cbor(coseKey(alg, publicKey))]);
      const clientDataJSON = clientData("webauthn.create", options.challenge, clientExtra);
      let statement = new Map();
      if (fmt === "packed") {
        const sig = signWith(alg, privateKey, Buffer.concat([authData, createHash("sha256").update(clientDataJSON).digest()]));
        statement = new Map([["alg", selfAlgOverride ?? ALG[alg]], ["sig", sig]]);
      }
      if (attStmt) statement = attStmt;
      const attestationObject = cbor(new Map([["fmt", fmt], ["attStmt", statement], ["authData", authData]]));
      return {
        id: this.id,
        rawId: this.id,
        type: "public-key",
        response: { clientDataJSON: clientDataJSON.toString("base64url"), attestationObject: attestationObject.toString("base64url"), transports: ["internal", "hybrid"] },
      };
    },

    /** navigator.credentials.get() as JSON. Each call bumps the counter by `step` (0 = synced passkey). */
    get(options, { uv = true, up = true, rpIdOverride, clientExtra, type = "webauthn.get", userHandle, tamper } = {}) {
      signCount += step;
      let flags = FLAGS.BE | FLAGS.BS;
      if (up) flags |= FLAGS.UP;
      if (uv) flags |= FLAGS.UV;
      const count = Buffer.alloc(4);
      count.writeUInt32BE(signCount);
      const authenticatorData = Buffer.concat([rpIdHash(rpIdOverride ?? options.rpId), Buffer.from([flags]), count]);
      const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge: options.challenge, origin, crossOrigin: false, ...clientExtra }));
      let signature = signWith(alg, privateKey, Buffer.concat([authenticatorData, createHash("sha256").update(clientDataJSON).digest()]));
      if (tamper) signature = Buffer.from(signature.map((b, i) => (i === 10 ? b ^ 1 : b)));
      return {
        id: this.id,
        rawId: this.id,
        type: "public-key",
        response: {
          clientDataJSON: clientDataJSON.toString("base64url"),
          authenticatorData: authenticatorData.toString("base64url"),
          signature: signature.toString("base64url"),
          userHandle: userHandle ?? null,
        },
      };
    },
  };
}
