import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "../env.js";
import { logger } from "./logger.js";

let transporter: Transporter | null = null;
let from = "";

/** With INVEON_SMTP_HOST set, mail goes out over SMTP; otherwise it is logged. */
export function configureMailer(env: Env) {
  from = env.INVEON_MAIL_FROM;
  transporter = env.INVEON_SMTP_HOST
    ? nodemailer.createTransport({
        host: env.INVEON_SMTP_HOST,
        port: env.INVEON_SMTP_PORT,
        secure: env.INVEON_SMTP_SECURE,
        auth: env.INVEON_SMTP_USER ? { user: env.INVEON_SMTP_USER, pass: env.INVEON_SMTP_PASSWORD } : undefined,
      })
    : null;
}

export async function sendMail(to: string[], subject: string, text: string) {
  if (to.length === 0) return;
  if (!transporter) {
    logger.warn({ to, subject, text }, "Email not sent (SMTP not configured), logged instead");
    return;
  }
  try {
    await transporter.sendMail({ from, to, subject, text });
  } catch (err) {
    logger.error({ err, to, subject }, "Email failed");
  }
}
