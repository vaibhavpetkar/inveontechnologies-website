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
    logger.warn("PORTAL_SMTP_HOST is not set — emails will be logged, not sent");
    return;
  }
  transporter = nodemailer.createTransport({
    host: env.PORTAL_SMTP_HOST,
    port: env.PORTAL_SMTP_PORT,
    secure: env.PORTAL_SMTP_SECURE,
    auth: env.PORTAL_SMTP_USER ? { user: env.PORTAL_SMTP_USER, pass: env.PORTAL_SMTP_PASSWORD } : undefined,
  });
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
