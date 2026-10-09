import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../shared/db/client.js";
import { portalSettings } from "../shared/db/schema.js";
import type { Env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { useMailSettings, type SmtpConfig } from "../shared/mailer.js";
import { decryptSecret, encryptSecret, vaultKey } from "../notes/crypto.js";

/**
 * SMTP settings saved from the portal. When `enabled`, they replace the
 * PORTAL_SMTP_* environment variables without a redeploy. The password is
 * stored encrypted (AES-256-GCM with the vault key) and never sent back to
 * the browser.
 */
const EMAIL_KEY = "email_settings";

export const emailSettingsInput = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(255),
  // Blank keeps the saved password; null clears it.
  password: z.string().max(500).nullable().optional(),
  fromName: z.string().trim().min(1).max(120),
  fromEmail: z.string().trim().email().max(255),
  replyTo: z.string().trim().max(255).refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid reply-to address"),
});
export type EmailSettingsInput = z.infer<typeof emailSettingsInput>;

interface StoredEmailSettings extends Omit<EmailSettingsInput, "password"> {
  passwordCiphertext: string | null;
}

/** "Inveon Portal <no-reply@x>" into its name and address. */
function splitFrom(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { fromName: m[1].trim() || "Inveon Portal", fromEmail: m[2].trim() } : { fromName: "Inveon Portal", fromEmail: from.trim() };
}

export function settingsFromEnv(env: Env): Omit<StoredEmailSettings, "passwordCiphertext"> {
  return {
    enabled: false,
    host: env.PORTAL_SMTP_HOST ?? "",
    port: env.PORTAL_SMTP_PORT,
    secure: env.PORTAL_SMTP_SECURE,
    user: env.PORTAL_SMTP_USER ?? "",
    ...splitFrom(env.PORTAL_MAIL_FROM),
    replyTo: env.PORTAL_MAIL_REPLY_TO ?? "",
  };
}

async function stored(db: Database): Promise<StoredEmailSettings | null> {
  const row = await db.query.portalSettings.findFirst({ where: eq(portalSettings.key, EMAIL_KEY) });
  return (row?.value as StoredEmailSettings | undefined) ?? null;
}

const fromHeader = (s: Pick<StoredEmailSettings, "fromName" | "fromEmail">) => `${s.fromName.replace(/["<>]/g, "")} <${s.fromEmail}>`;

function toConfig(env: Env, s: StoredEmailSettings): SmtpConfig {
  let password: string | undefined;
  if (s.passwordCiphertext) {
    try {
      password = decryptSecret(vaultKey(env), s.passwordCiphertext);
    } catch (err) {
      logger.error({ err }, "Could not decrypt the saved SMTP password; was PORTAL_VAULT_KEY changed?");
    }
  }
  return { host: s.host || undefined, port: s.port, secure: s.secure, user: s.user || undefined, password, from: fromHeader(s), replyTo: s.replyTo || undefined };
}

/** The form's view: saved values (or the environment's), with only whether a password is set. */
export async function getEmailSettings(db: Database, env: Env) {
  const s = await stored(db);
  if (!s) return { ...settingsFromEnv(env), hasPassword: !!env.PORTAL_SMTP_PASSWORD, saved: false };
  const { passwordCiphertext, ...rest } = s;
  return { ...rest, hasPassword: !!passwordCiphertext, saved: true };
}

export async function saveEmailSettings(db: Database, env: Env, input: EmailSettingsInput, actorUserId: string) {
  const previous = await stored(db);
  if (input.enabled && !input.host) throw new Error("HOST_REQUIRED");
  let passwordCiphertext = previous?.passwordCiphertext ?? null;
  if (input.password === null) passwordCiphertext = null;
  else if (input.password) passwordCiphertext = encryptSecret(vaultKey(env), input.password);
  const { password: _ignored, ...rest } = input;
  const value: StoredEmailSettings = { ...rest, passwordCiphertext };
  await db
    .insert(portalSettings)
    .values({ key: EMAIL_KEY, value, updatedBy: actorUserId })
    .onConflictDoUpdate({ target: portalSettings.key, set: { value, updatedBy: actorUserId, updatedAt: new Date() } });
  useMailSettings(value.enabled ? toConfig(env, value) : null);
  return value;
}

/** At startup: switch the mailer to the saved settings when they are turned on. */
export async function loadEmailSettings(db: Database, env: Env) {
  try {
    const s = await stored(db);
    if (s?.enabled) useMailSettings(toConfig(env, s));
  } catch (err) {
    logger.error({ err }, "Could not load the saved email settings; using the environment's");
  }
}
