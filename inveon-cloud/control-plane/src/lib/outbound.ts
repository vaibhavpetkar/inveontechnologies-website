import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { AppError } from "./errors.js";

/**
 * Outbound requests to user-supplied URLs (alert webhooks), guarded against
 * SSRF: https only, no credentials in the URL, and the host must resolve to
 * public addresses only. The check is repeated at connect time with the
 * resolved address pinned (a custom DNS lookup), so a name that later
 * resolves to 127.0.0.1 or 169.254.169.254 (DNS rebinding) is refused.
 * Redirects are never followed.
 *
 * INVEON_ALERT_PRIVATE_HOSTS lists hosts that may be private and plain http
 * (an internal endpoint on a trusted network; the tests use it for a local
 * receiver). Nothing else bypasses the check.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped / -compatible (::ffff:10.0.0.1): judge the embedded IPv4 address.
    const mapped = lower.match(/^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPublicAddress(mapped[1]);
    const hexMapped = lower.match(/^(?:0{0,4}:){0,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return !blocked.check(address, "ipv6");
  }
  return false;
}

let privateHosts = new Set<string>();

export function configureOutbound(list: string | undefined) {
  privateHosts = new Set(
    (list ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

const bareHost = (u: URL) => u.hostname.replace(/^\[|\]$/g, "").toLowerCase();

/** Checks a URL when it is saved. Throws a 400 explaining what is wrong. */
export function validateOutboundUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new AppError("INVALID_URL", "Enter a full URL starting with https://", 400);
  }
  const host = bareHost(u);
  const trusted = privateHosts.has(host);
  if (u.protocol !== "https:" && !(trusted && u.protocol === "http:")) throw new AppError("INVALID_URL", "Use an https:// URL", 400);
  if (u.username || u.password) throw new AppError("INVALID_URL", "The URL can't contain a user name or password", 400);
  if (raw.length > 2000) throw new AppError("INVALID_URL", "The URL is too long", 400);
  if (!trusted) {
    if (isIP(host) && !isPublicAddress(host)) throw new AppError("INVALID_URL", "The URL points at a private, loopback or link-local address", 400);
    if (!isIP(host) && (host === "localhost" || /\.(localhost|local|internal|localdomain|home\.arpa)$/.test(host) || !host.includes("."))) {
      throw new AppError("INVALID_URL", "The URL must use a public host name", 400);
    }
  }
  return u;
}

/** Only scheme and host are ever shown again: the path of a Slack URL is its secret. */
export function urlHint(u: URL) {
  return `${u.protocol}//${u.host}/…`;
}

/** DNS lookup that refuses non-public answers, used as the socket's lookup (pins the checked address). */
function guardedLookup(trusted: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = (addresses as unknown as { address: string; family: number }[]) ?? [];
      const bad = list.find((a) => !isPublicAddress(a.address));
      if (!list.length) return callback(new Error(`${hostname} did not resolve`), "", 0);
      if (bad && !trusted) return callback(new Error(`${hostname} resolves to a non-public address (${bad.address}); refusing to connect`), "", 0);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

export interface PostResult {
  status: number;
  body: string;
}

/** POST with a 10 s timeout, no redirects, and the SSRF checks above. Resolves for any HTTP status. */
export function postGuarded(raw: string, body: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<PostResult> {
  const u = validateOutboundUrl(raw);
  const trusted = privateHosts.has(bareHost(u));
  const host = bareHost(u);
  if (isIP(host) && !trusted && !isPublicAddress(host)) return Promise.reject(new Error("Refusing to connect to a non-public address"));
  const request = u.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      u,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "inveon-cloud-alerts", "Content-Length": String(Buffer.byteLength(body)), ...headers },
        lookup: guardedLookup(trusted),
        timeout: timeoutMs,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => {
          if (text.length < 2048) text += d;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text.slice(0, 2048) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`No response within ${Math.round(timeoutMs / 1000)} s`)));
    req.on("error", reject);
    req.end(body);
  });
}
