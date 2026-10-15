/**
 * Browser side of passkeys: the control plane sends WebAuthn options with
 * base64url strings; navigator.credentials wants ArrayBuffers, and its
 * answer goes back as base64url again. Nothing here is secret: the private
 * key never leaves the authenticator.
 */

export const passkeysSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

const toBuffer = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const toB64url = (buf: ArrayBuffer | null) => {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

interface Descriptor {
  type: "public-key";
  id: string;
  transports?: string[];
}

export interface CreationOptionsJSON {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  attestation: AttestationConveyancePreference;
  authenticatorSelection: AuthenticatorSelectionCriteria;
  excludeCredentials: Descriptor[];
}

export interface RequestOptionsJSON {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: UserVerificationRequirement;
  allowCredentials: Descriptor[];
}

const descriptor = (d: Descriptor): PublicKeyCredentialDescriptor => ({ type: "public-key", id: toBuffer(d.id), transports: d.transports as AuthenticatorTransport[] | undefined });

/** A cancelled or timed-out prompt reads better than the browser's DOMException text. */
function explain(err: unknown): never {
  if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) throw new Error("The passkey prompt was cancelled or timed out.");
  if (err instanceof DOMException && err.name === "InvalidStateError") throw new Error("This authenticator already holds a passkey for your account.");
  throw err;
}

export async function createPasskey(o: CreationOptionsJSON) {
  const cred = (await navigator.credentials
    .create({
      publicKey: {
        challenge: toBuffer(o.challenge),
        rp: o.rp,
        user: { ...o.user, id: toBuffer(o.user.id) },
        pubKeyCredParams: o.pubKeyCredParams,
        timeout: o.timeout,
        attestation: o.attestation,
        authenticatorSelection: o.authenticatorSelection,
        excludeCredentials: o.excludeCredentials.map(descriptor),
      },
    })
    .catch(explain)) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was created.");
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId)!,
    type: "public-key" as const,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON)!,
      attestationObject: toB64url(r.attestationObject)!,
      transports: typeof r.getTransports === "function" ? r.getTransports() : undefined,
    },
  };
}

export async function getPasskey(o: RequestOptionsJSON) {
  const cred = (await navigator.credentials
    .get({
      publicKey: { challenge: toBuffer(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification, allowCredentials: o.allowCredentials.map(descriptor) },
    })
    .catch(explain)) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was chosen.");
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId)!,
    type: "public-key" as const,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON)!,
      authenticatorData: toB64url(r.authenticatorData)!,
      signature: toB64url(r.signature)!,
      userHandle: toB64url(r.userHandle),
    },
  };
}
