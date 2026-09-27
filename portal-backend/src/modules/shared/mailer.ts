import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "./env.js";
import { logger } from "./logger.js";

let transporter: Transporter | null = null;
let fromAddress = "";

/**
 * Called once at startup. With PORTAL_SMTP_HOST set, mail goes out over SMTP
 * (e.g. the Mailcow server at mail.inveontechnologies.in); without it, each
 * email is logged instead — handy in development, where the links in the
 * log can be opened directly.
 */
export function configureMailer(env: Env) {
  fromAddress = env.PORTAL_MAIL_FROM;
  if (!env.PORTAL_SMTP_HOST) {
    // In production this means password reset and verification silently
    // don't work, so make it stand out in `docker compose logs`.
    const log = env.NODE_ENV === "production" ? logger.error.bind(logger) : logger.warn.bind(logger);
    log("PORTAL_SMTP_HOST is not set — emails will be logged, not sent. See portal-backend/.env.example.");
    return;
  }
  transporter = nodemailer.createTransport({
    host: env.PORTAL_SMTP_HOST,
    port: env.PORTAL_SMTP_PORT,
    secure: env.PORTAL_SMTP_SECURE,
    auth: env.PORTAL_SMTP_USER ? { user: env.PORTAL_SMTP_USER, pass: env.PORTAL_SMTP_PASSWORD } : undefined,
  });
  // Check the connection and login once at startup, so a wrong host, port
  // or password shows up right away instead of on the first reset request.
  // Doesn't block startup: the server still runs if the mail server is down.
  const target = { host: env.PORTAL_SMTP_HOST, port: env.PORTAL_SMTP_PORT, secure: env.PORTAL_SMTP_SECURE };
  transporter
    .verify()
    .then(() => logger.info(target, "SMTP connection verified — emails will be sent"))
    .catch((err: unknown) => logger.error({ err, ...target }, "SMTP connection check failed — emails will not arrive until this is fixed"));
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Fire-and-forget: callers don't wait on SMTP. That keeps request latency
 * independent of the mail server and — for forgot-password — keeps response
 * timing from revealing whether an account exists. Failures are logged.
 */
export function sendEmail(email: OutgoingEmail): void {
  if (!transporter) {
    logger.info({ toEmail: email.to, subject: email.subject, text: email.text }, "[EMAIL NOT SENT — SMTP not configured]");
    return;
  }
  transporter
    .sendMail({ from: fromAddress, to: email.to, subject: email.subject, text: email.text })
    .then(() => logger.info({ toEmail: email.to, subject: email.subject }, "Email sent"))
    .catch((err: unknown) => logger.error({ err, toEmail: email.to, subject: email.subject }, "Email sending failed"));
}

/**
 * Awaitable send for the job queue: resolves once the mail server accepts
 * the message and throws otherwise, so the job is retried. Without SMTP
 * configured the email is logged and counts as delivered.
 */
export async function deliverEmail(email: OutgoingEmail): Promise<void> {
  if (!transporter) {
    logger.info({ toEmail: email.to, subject: email.subject, text: email.text }, "[EMAIL NOT SENT — SMTP not configured]");
    return;
  }
  await transporter.sendMail({ from: fromAddress, to: email.to, subject: email.subject, text: email.text });
  logger.info({ toEmail: email.to, subject: email.subject }, "Email sent");
}
