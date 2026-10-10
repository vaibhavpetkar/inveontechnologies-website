import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "./env.js";
import type { Database } from "./db/client.js";
import { emailLog } from "./db/schema.js";
import { logger } from "./logger.js";
import { renderEmailHtml } from "./email-html.js";

/** Where mail goes: an SMTP server and the From/Reply-To it sends as. */
export interface SmtpConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  replyTo?: string;
}

export type MailSource = "settings" | "environment";

let transporter: Transporter | null = null;
let fromAddress = "";
let replyTo: string | undefined;
let appUrl = "";
let envConfig: SmtpConfig | null = null;
let source: MailSource = "environment";
let active: SmtpConfig | null = null;
let lastCheck: { ok: boolean; error: string | null; at: Date } | null = null;
let logDb: Database | null = null;
// Kinds of automatic email an admin turned off in Settings (see settings/email.ts).
let pausedKinds = new Set<string>();

export function usePausedKinds(kinds: string[]) {
  pausedKinds = new Set(kinds);
}

/** The domain of the From address, e.g. inveontechnologies.in. */
function fromDomain(from: string) {
  return from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
}

/**
 * Everything every message carries: the From and Reply-To, and an HTML twin
 * of the text. Text-only mail with bare links is a common spam signal.
 */
function envelope(email: OutgoingEmail) {
  return {
    from: fromAddress,
    replyTo,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: renderEmailHtml({ subject: email.subject, text: email.text, appUrl, canReply: !!replyTo }),
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 1000);

function apply(config: SmtpConfig, from: MailSource) {
  source = from;
  active = config;
  fromAddress = config.from;
  replyTo = config.replyTo || undefined;
  transporter?.close();
  transporter = null;
  lastCheck = null;
  if (!config.host) return;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Greet the mail server as our own domain, not the container's random
    // hostname: a HELO that doesn't match the sender counts against us.
    name: fromDomain(config.from),
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
}

/**
 * Called once at startup. With PORTAL_SMTP_HOST set, mail goes out over SMTP
 * (e.g. the Mailcow server at mail.inveontechnologies.in); without it, each
 * email is logged instead — handy in development, where the links in the
 * log can be opened directly. Settings saved in the portal (see
 * settings/email.ts) replace these once loaded.
 */
export function configureMailer(env: Env) {
  appUrl = env.PORTAL_APP_URL.replace(/\/$/, "");
  envConfig = {
    host: env.PORTAL_SMTP_HOST,
    port: env.PORTAL_SMTP_PORT,
    secure: env.PORTAL_SMTP_SECURE,
    user: env.PORTAL_SMTP_USER,
    password: env.PORTAL_SMTP_PASSWORD,
    from: env.PORTAL_MAIL_FROM,
    replyTo: env.PORTAL_MAIL_REPLY_TO || undefined,
  };
  apply(envConfig, "environment");
  if (!env.PORTAL_SMTP_HOST) {
    // In production this means password reset and verification silently
    // don't work, so make it stand out in `docker compose logs`.
    const log = env.NODE_ENV === "production" ? logger.error.bind(logger) : logger.warn.bind(logger);
    log("PORTAL_SMTP_HOST is not set — emails will be logged, not sent, until SMTP is set up in Settings or the environment.");
    return;
  }
  // Check the connection and login once at startup, so a wrong host, port
  // or password shows up right away. Doesn't block startup.
  void verifyMailer();
}

/** Switches to the SMTP settings saved in the portal, or back to the environment's with null. */
export function useMailSettings(config: SmtpConfig | null) {
  if (config) apply(config, "settings");
  else if (envConfig) apply(envConfig, "environment");
}

/** Records every send in email_log once the database is known. */
export function attachEmailLog(db: Database) {
  logDb = db;
}

/** Logs in to the mail server without sending anything. */
export async function verifyMailer(): Promise<{ ok: boolean; error: string | null }> {
  if (!transporter) {
    lastCheck = { ok: false, error: "No SMTP server is set, so emails are only written to the server log.", at: new Date() };
    return lastCheck;
  }
  const target = { host: active?.host, port: active?.port, secure: active?.secure, source };
  try {
    await transporter.verify();
    lastCheck = { ok: true, error: null, at: new Date() };
    logger.info(target, "SMTP connection verified — emails will be sent");
  } catch (err) {
    lastCheck = { ok: false, error: errorText(err), at: new Date() };
    logger.error({ err, ...target }, "SMTP connection check failed — emails will not arrive until this is fixed");
  }
  return lastCheck;
}

export function mailerStatus() {
  return {
    source,
    sending: !!transporter,
    host: active?.host ?? null,
    port: active?.port ?? null,
    from: fromAddress,
    replyTo: replyTo ?? null,
    lastCheck,
  };
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  // A calendar invite (RFC 5545 text). Sent as a text/calendar part so mail
  // apps show it as an invitation with Yes/No/Maybe buttons.
  icalEvent?: { method: "REQUEST" | "CANCEL"; content: string };
  // Files sent with the email, e.g. a letter and the policies it refers to.
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  // For the email log: what this is ("appointment_letter", "internship_offer",
  // "notification", ...) and the record it is about, so it can be resent.
  kind?: string;
  refId?: string;
  triggeredBy?: string;
  // Sign-in links and reset tokens: logged without their text, never resent.
  sensitive?: boolean;
}

async function record(email: OutgoingEmail, status: "sent" | "failed" | "logged", error?: string) {
  if (!logDb) return;
  try {
    await logDb.insert(emailLog).values({
      toEmail: email.to,
      subject: email.subject.slice(0, 500),
      kind: email.kind ?? "general",
      refId: email.refId ?? null,
      status,
      error: error ?? null,
      body: email.sensitive ? null : email.text.slice(0, 20_000),
      attachments: email.attachments?.map((a) => a.filename) ?? [],
      triggeredBy: email.triggeredBy ?? null,
    });
  } catch (err) {
    logger.warn({ err }, "Could not write the email log");
  }
}

/**
 * Fire-and-forget: callers don't wait on SMTP. That keeps request latency
 * independent of the mail server and — for forgot-password — keeps response
 * timing from revealing whether an account exists. Failures are logged.
 */
export function sendEmail(email: OutgoingEmail): void {
  deliverEmail(email).catch(() => undefined); // already logged and recorded
}

/**
 * Awaitable send for the job queue: resolves once the mail server accepts
 * the message and throws otherwise, so the job is retried. Without SMTP
 * configured the email is logged and counts as delivered.
 */
export async function deliverEmail(email: OutgoingEmail): Promise<void> {
  if (email.kind && pausedKinds.has(email.kind)) {
    logger.info({ toEmail: email.to, subject: email.subject, kind: email.kind }, "[EMAIL NOT SENT — turned off in Settings]");
    await record(email, "logged", "Not sent: this kind of email is turned off in Settings → Email");
    return;
  }
  if (!transporter) {
    logger.info(
      { toEmail: email.to, subject: email.subject, text: email.sensitive ? "[hidden]" : email.text, attachments: email.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`) },
      "[EMAIL NOT SENT — SMTP not configured]",
    );
    if (email.sensitive) logger.info({ toEmail: email.to, text: email.text }, "[EMAIL NOT SENT — sign-in link for development]");
    await record(email, "logged");
    return;
  }
  try {
    await transporter.sendMail({
      ...envelope(email),
      icalEvent: email.icalEvent ? { method: email.icalEvent.method, filename: "invite.ics", content: email.icalEvent.content } : undefined,
      attachments: email.attachments,
    });
  } catch (err) {
    logger.error({ err, toEmail: email.to, subject: email.subject }, "Email sending failed");
    await record(email, "failed", errorText(err));
    throw err;
  }
  logger.info({ toEmail: email.to, subject: email.subject, attachments: email.attachments?.map((a) => a.filename) }, "Email sent");
  await record(email, "sent");
}
