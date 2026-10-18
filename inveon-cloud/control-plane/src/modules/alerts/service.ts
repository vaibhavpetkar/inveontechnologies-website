import { createHmac } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { alertChannels, alertDeliveries, memberships, users } from "../../db/schema.js";
import { decryptValue } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { sendMailOrThrow } from "../../lib/mailer.js";
import { postGuarded } from "../../lib/outbound.js";

/**
 * Alerts: an event (a deploy failed, a server went offline…) becomes one
 * delivery per channel of the organization that subscribed to it. Deliveries
 * are a small queue in Postgres: sent right away, retried with backoff by the
 * scheduler, and kept as the delivery log.
 */
export const ALERT_EVENTS = {
  "deploy.failed": "Deploy failed",
  "deploy.succeeded": "Deploy succeeded",
  "health.down": "Health check down",
  "health.up": "Health check recovered",
  "server.offline": "Server offline",
  "server.online": "Server back online",
  "backup.failed": "Backup failed",
  "cert.expiring": "Certificate expires within 14 days",
  "server.threshold": "Server threshold crossed (CPU, memory, disk, offline)",
  "server.threshold_cleared": "Server threshold cleared",
} as const;
export type AlertEvent = keyof typeof ALERT_EVENTS;
export const ALERT_EVENT_NAMES = Object.keys(ALERT_EVENTS) as AlertEvent[];
/** What a new channel gets unless chosen otherwise: everything but successful deploys. */
export const DEFAULT_EVENTS: AlertEvent[] = ALERT_EVENT_NAMES.filter((e) => e !== "deploy.succeeded");

/** Wait before attempt 2, 3, 4 and 5. */
export const RETRY_BACKOFF_SEC = [60, 5 * 60, 30 * 60, 2 * 3600];
export const MAX_ATTEMPTS = RETRY_BACKOFF_SEC.length + 1;
/** A claimed delivery that never finished (a crash mid-send) is retried after this. */
const LEASE_SEC = 120;

export interface AlertPayload {
  title: string;
  text: string;
  severity: "info" | "warning" | "critical";
  /** Dashboard link. */
  url?: string | null;
  details?: Record<string, string | number | null>;
}

type Channel = typeof alertChannels.$inferSelect;
type Delivery = typeof alertDeliveries.$inferSelect;

export const channelUrlAad = (id: string) => `alert-channel-url:${id}`;
export const channelSecretAad = (id: string) => `alert-channel-secret:${id}`;

let publicUrl = "http://localhost:4100";
export function configureAlerts(url: string) {
  publicUrl = url.replace(/\/$/, "");
}
/** Absolute dashboard link for alerts. */
export const dashboardLink = (path: string) => `${publicUrl}${path}`;

// ---------------------------------------------------------------- queueing

/**
 * Queues the event for every enabled channel of the org that wants it, and
 * starts sending. Never throws: an alert must not break what raised it.
 */
export async function emitAlert(db: Database, orgId: string, event: AlertEvent, payload: AlertPayload) {
  try {
    const channels = await db
      .select({ id: alertChannels.id })
      .from(alertChannels)
      .where(and(eq(alertChannels.orgId, orgId), eq(alertChannels.enabled, true), sql`${alertChannels.events} @> ${JSON.stringify([event])}::jsonb`));
    if (!channels.length) return 0;
    await db.insert(alertDeliveries).values(channels.map((c) => ({ orgId, channelId: c.id, event, payload: payload as unknown as Record<string, unknown>, maxAttempts: MAX_ATTEMPTS })));
    kickDeliveries(db);
    return channels.length;
  } catch (err) {
    logger.error({ err, orgId, event }, "Could not queue alert");
    return 0;
  }
}

/** Whether any enabled channel of the org takes this event (health emails defer to channels). */
export async function hasChannelFor(db: Database, orgId: string, event: AlertEvent) {
  const row = await db.query.alertChannels.findFirst({
    where: and(eq(alertChannels.orgId, orgId), eq(alertChannels.enabled, true), sql`${alertChannels.events} @> ${JSON.stringify([event])}::jsonb`),
    columns: { id: true },
  });
  return !!row;
}

let sending = false;
let again = false;

/** Sends what is due in the background; overlapping calls fold into one run. */
export function kickDeliveries(db: Database) {
  if (sending) {
    again = true;
    return;
  }
  sending = true;
  void (async () => {
    try {
      do {
        again = false;
        await processDueDeliveries(db);
      } while (again);
    } catch (err) {
      logger.error({ err }, "Alert delivery run failed");
    } finally {
      sending = false;
    }
  })();
}

/** Claims due deliveries (skip-locked, with a lease) and sends each once. */
export async function processDueDeliveries(db: Database, limit = 20) {
  let total = 0;
  for (;;) {
    const result = await db.execute(sql`
      UPDATE alert_deliveries SET attempts = attempts + 1, next_attempt_at = now() + make_interval(secs => ${LEASE_SEC})
      WHERE id IN (
        SELECT id FROM alert_deliveries WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING id`);
    const ids = (result.rows as { id: string }[]).map((r) => r.id);
    if (!ids.length) return total;
    for (const id of ids) await attemptDelivery(db, id);
    total += ids.length;
    if (ids.length < limit) return total;
  }
}

/** Claims one delivery now (the "Send test" button) and sends it. */
export async function sendNow(db: Database, deliveryId: string) {
  await db.update(alertDeliveries).set({ attempts: sql`${alertDeliveries.attempts} + 1`, nextAttemptAt: new Date(Date.now() + LEASE_SEC * 1000) }).where(eq(alertDeliveries.id, deliveryId));
  await attemptDelivery(db, deliveryId);
  return db.query.alertDeliveries.findFirst({ where: eq(alertDeliveries.id, deliveryId) });
}

async function attemptDelivery(db: Database, id: string) {
  const delivery = await db.query.alertDeliveries.findFirst({ where: eq(alertDeliveries.id, id) });
  if (!delivery || delivery.status !== "pending") return;
  const channel = await db.query.alertChannels.findFirst({ where: eq(alertChannels.id, delivery.channelId) });
  if (!channel || !channel.enabled) {
    await db.update(alertDeliveries).set({ status: "failure", lastError: "The channel was turned off", nextAttemptAt: new Date() }).where(eq(alertDeliveries.id, id));
    return;
  }
  try {
    const outcome = await deliver(db, channel, delivery);
    await db
      .update(alertDeliveries)
      .set({ status: "success", responseStatus: outcome.status ?? null, detail: outcome.detail ?? null, lastError: null, deliveredAt: new Date() })
      .where(eq(alertDeliveries.id, id));
  } catch (err) {
    const e = err as Error & { status?: number };
    const message = (e.message || String(err)).slice(0, 500);
    const done = delivery.attempts >= delivery.maxAttempts;
    const wait = RETRY_BACKOFF_SEC[Math.min(delivery.attempts - 1, RETRY_BACKOFF_SEC.length - 1)] ?? 60;
    await db
      .update(alertDeliveries)
      .set({ status: done ? "failure" : "pending", responseStatus: e.status ?? null, lastError: message, nextAttemptAt: done ? new Date() : new Date(Date.now() + wait * 1000) })
      .where(eq(alertDeliveries.id, id));
    logger.warn({ deliveryId: id, channelId: channel.id, attempt: delivery.attempts, error: message }, done ? "Alert delivery failed for good" : "Alert delivery failed; will retry");
  }
}

// ---------------------------------------------------------------- sending

class DeliveryError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const payloadOf = (d: Delivery) => d.payload as unknown as AlertPayload;

async function deliver(db: Database, channel: Channel, delivery: Delivery): Promise<{ status?: number; detail?: string }> {
  const p = payloadOf(delivery);
  if (channel.type === "email") {
    const to = channel.emails.length ? channel.emails : await ownersAndAdmins(db, channel.orgId);
    const sent = await sendMailOrThrow(to, `[Inveon Cloud] ${p.title}`, emailText(p));
    return { detail: sent ? `Sent to ${to.length} recipient${to.length === 1 ? "" : "s"}` : "SMTP is not configured: logged instead of sent" };
  }
  if (!channel.urlEnc) throw new DeliveryError("The channel has no URL");
  const url = decryptValue(channel.urlEnc, channelUrlAad(channel.id));
  let body: string;
  const headers: Record<string, string> = {};
  if (channel.type === "slack") {
    body = JSON.stringify(slackBody(p));
  } else {
    body = JSON.stringify({ id: delivery.id, event: delivery.event, createdAt: delivery.createdAt.toISOString(), organizationId: delivery.orgId, ...p });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = channel.signingSecretEnc ? decryptValue(channel.signingSecretEnc, channelSecretAad(channel.id)) : "";
    headers["X-Inveon-Event"] = delivery.event;
    headers["X-Inveon-Delivery"] = delivery.id;
    headers["X-Inveon-Signature"] = signWebhook(secret, timestamp, body);
  }
  let res;
  try {
    res = await postGuarded(url, body, headers);
  } catch (err) {
    throw new DeliveryError((err as Error).message);
  }
  if (res.status < 200 || res.status >= 300) throw new DeliveryError(`HTTP ${res.status}${res.body ? `: ${res.body.slice(0, 200)}` : ""}`, res.status);
  return { status: res.status };
}

/**
 * `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. Receivers
 * recompute it with the channel's signing secret, compare in constant time,
 * and reject old timestamps (replays).
 */
export function signWebhook(secret: string, timestamp: number, body: string) {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function slackBody(p: AlertPayload) {
  const icon = p.severity === "critical" ? ":red_circle:" : p.severity === "warning" ? ":large_yellow_circle:" : ":large_green_circle:";
  const lines = [`${icon} *${slackEscape(p.title)}*`, slackEscape(p.text)];
  const details = Object.entries(p.details ?? {}).filter(([, v]) => v !== null && v !== "");
  if (details.length) lines.push(details.map(([k, v]) => `*${slackEscape(k)}:* ${slackEscape(String(v))}`).join("  ·  "));
  if (p.url) lines.push(`<${p.url}|Open in Inveon Cloud>`);
  return { text: lines.join("\n") };
}

function emailText(p: AlertPayload) {
  const details = Object.entries(p.details ?? {})
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return [p.text, details.length ? `\n${details.join("\n")}` : "", p.url ? `\n${p.url}` : ""].join("\n").trim() + "\n";
}

async function ownersAndAdmins(db: Database, orgId: string) {
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "admin"])));
  return rows.map((r) => r.email);
}

/** Daily: the delivery log keeps 30 days. */
export async function pruneDeliveries(db: Database, now = new Date()) {
  const gone = await db
    .delete(alertDeliveries)
    .where(and(lt(alertDeliveries.createdAt, new Date(now.getTime() - 30 * 86400_000)), inArray(alertDeliveries.status, ["success", "failure"])))
    .returning({ id: alertDeliveries.id });
  return gone.length;
}
