import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { alertChannels, alertDeliveries } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { encryptValue, randomToken } from "../../lib/crypto.js";
import { audit } from "../../lib/audit.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { urlHint, validateOutboundUrl } from "../../lib/outbound.js";
import { ALERT_EVENTS, ALERT_EVENT_NAMES, DEFAULT_EVENTS, channelSecretAad, channelUrlAad, dashboardLink, sendNow, type AlertEvent } from "./service.js";

type Channel = typeof alertChannels.$inferSelect;

const MASK = "••••••••";

/** URLs and signing secrets are write-only: only the host is shown again. */
function publicChannel(c: Channel) {
  const { urlEnc, signingSecretEnc, ...rest } = c;
  return { ...rest, url: urlEnc ? c.urlHint : null, signingSecret: signingSecretEnc ? MASK : null };
}

const eventsSchema = z.array(z.enum(ALERT_EVENT_NAMES as [AlertEvent, ...AlertEvent[]])).max(ALERT_EVENT_NAMES.length).transform((e) => [...new Set(e)]);
const emailsSchema = z.array(z.string().trim().toLowerCase().email().max(254)).max(20);

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("slack"), name: z.string().trim().min(1).max(80), url: z.string().max(2000), events: eventsSchema.optional(), enabled: z.boolean().default(true) }),
  z.object({ type: z.literal("webhook"), name: z.string().trim().min(1).max(80), url: z.string().max(2000), events: eventsSchema.optional(), enabled: z.boolean().default(true) }),
  z.object({ type: z.literal("email"), name: z.string().trim().min(1).max(80), emails: emailsSchema.default([]), events: eventsSchema.optional(), enabled: z.boolean().default(true) }),
]);

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().max(2000).optional(),
  emails: emailsSchema.optional(),
  events: eventsSchema.optional(),
  enabled: z.boolean().optional(),
});

async function loadChannel(db: Database, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Channel not found");
  const c = await db.query.alertChannels.findFirst({ where: and(eq(alertChannels.id, id), eq(alertChannels.orgId, orgId)) });
  if (!c) throw new NotFoundError("Channel not found");
  return c;
}

const newSigningSecret = () => `whsec_${randomToken(32)}`;

export function alertsRouter(db: Database) {
  const router = Router({ mergeParams: true });
  // Alert settings hold where the organization's notices go: admins only.
  router.use("/alert-channels", requireRole("admin"));
  router.use("/alert-deliveries", requireRole("admin"));

  router.get("/alert-channels", async (req, res) => {
    const rows = await db.select().from(alertChannels).where(eq(alertChannels.orgId, req.member!.orgId)).orderBy(asc(alertChannels.createdAt));
    res.json({ channels: rows.map(publicChannel), events: Object.entries(ALERT_EVENTS).map(([id, label]) => ({ id, label, default: DEFAULT_EVENTS.includes(id as AlertEvent) })) });
  });

  router.post("/alert-channels", async (req, res) => {
    const body = createSchema.parse(req.body);
    const id = crypto.randomUUID();
    let urlEnc: string | null = null;
    let hint: string | null = null;
    let secret: string | null = null;
    if (body.type !== "email") {
      const u = validateOutboundUrl(body.url);
      urlEnc = encryptValue(u.toString(), channelUrlAad(id));
      hint = urlHint(u);
      if (body.type === "webhook") secret = newSigningSecret();
    }
    const [row] = await db
      .insert(alertChannels)
      .values({
        id,
        orgId: req.member!.orgId,
        name: body.name,
        type: body.type,
        urlEnc,
        urlHint: hint,
        signingSecretEnc: secret ? encryptValue(secret, channelSecretAad(id)) : null,
        emails: body.type === "email" ? body.emails : [],
        events: body.events ?? DEFAULT_EVENTS,
        enabled: body.enabled,
        createdBy: req.user!.sub,
      })
      .returning();
    await audit(db, req, "alert_channel.create", "alert_channel", row.id, { name: row.name, type: row.type, host: hint, events: row.events });
    // The signing secret is shown once, here and on rotation.
    res.status(201).json({ channel: publicChannel(row), ...(secret ? { signingSecret: secret } : {}) });
  });

  router.patch("/alert-channels/:id", async (req, res) => {
    const body = updateSchema.parse(req.body);
    const channel = await loadChannel(db, req.member!.orgId, req.params.id);
    const set: Partial<Channel> = { updatedAt: new Date() };
    if (body.name !== undefined) set.name = body.name;
    if (body.events !== undefined) set.events = body.events;
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.emails !== undefined) {
      if (channel.type !== "email") throw new AppError("NOT_EMAIL", "Only email channels have recipients", 400);
      set.emails = body.emails;
    }
    if (body.url !== undefined) {
      if (channel.type === "email") throw new AppError("NOT_A_URL_CHANNEL", "Email channels have no URL", 400);
      const u = validateOutboundUrl(body.url);
      set.urlEnc = encryptValue(u.toString(), channelUrlAad(channel.id));
      set.urlHint = urlHint(u);
    }
    const [row] = await db.update(alertChannels).set(set).where(eq(alertChannels.id, channel.id)).returning();
    await audit(db, req, "alert_channel.update", "alert_channel", channel.id, { name: body.name, events: body.events, enabled: body.enabled, urlChanged: body.url !== undefined, host: set.urlHint });
    res.json({ channel: publicChannel(row) });
  });

  router.post("/alert-channels/:id/signing-secret", async (req, res) => {
    const channel = await loadChannel(db, req.member!.orgId, req.params.id);
    if (channel.type !== "webhook") throw new AppError("NOT_A_WEBHOOK", "Only webhook channels are signed", 400);
    const secret = newSigningSecret();
    await db.update(alertChannels).set({ signingSecretEnc: encryptValue(secret, channelSecretAad(channel.id)), updatedAt: new Date() }).where(eq(alertChannels.id, channel.id));
    await audit(db, req, "alert_channel.rotate_secret", "alert_channel", channel.id);
    res.json({ signingSecret: secret });
  });

  router.delete("/alert-channels/:id", async (req, res) => {
    const channel = await loadChannel(db, req.member!.orgId, req.params.id);
    await db.delete(alertChannels).where(eq(alertChannels.id, channel.id));
    await audit(db, req, "alert_channel.delete", "alert_channel", channel.id, { name: channel.name, type: channel.type });
    res.json({ ok: true });
  });

  // Sends a test message right away (no retries) and returns how it went.
  router.post("/alert-channels/:id/test", async (req, res) => {
    const channel = await loadChannel(db, req.member!.orgId, req.params.id);
    if (!channel.enabled) throw new AppError("CHANNEL_DISABLED", "Turn the channel on first", 400);
    const [row] = await db
      .insert(alertDeliveries)
      .values({
        orgId: channel.orgId,
        channelId: channel.id,
        event: "test",
        maxAttempts: 1,
        // Leased so the background sender leaves it to this request.
        nextAttemptAt: new Date(Date.now() + 120_000),
        payload: { title: "Test alert", text: `This is a test from Inveon Cloud for the channel "${channel.name}". If you can read it, alerts reach you here.`, severity: "info", url: dashboardLink("/alerts"), details: {} },
      })
      .returning();
    const delivery = await sendNow(db, row.id);
    await audit(db, req, "alert_channel.test", "alert_channel", channel.id, { ok: delivery?.status === "success" });
    res.json({ delivery });
  });

  router.get("/alert-deliveries", async (req, res) => {
    const q = z.object({ channelId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    const where: SQL[] = [eq(alertDeliveries.orgId, req.member!.orgId)];
    if (q.channelId) where.push(eq(alertDeliveries.channelId, q.channelId));
    const rows = await db
      .select({ delivery: alertDeliveries, channelName: alertChannels.name, channelType: alertChannels.type })
      .from(alertDeliveries)
      .innerJoin(alertChannels, eq(alertChannels.id, alertDeliveries.channelId))
      .where(and(...where))
      .orderBy(desc(alertDeliveries.createdAt))
      .limit(q.limit);
    res.json({ deliveries: rows.map((r) => ({ ...r.delivery, channelName: r.channelName, channelType: r.channelType })) });
  });

  return router;
}
