import { z } from "zod";

/**
 * Fail fast on startup if required configuration is missing.
 * Nothing else in the app should read process.env directly —
 * everything goes through this validated, typed object.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORTAL_PORT: z.coerce.number().default(4000),
  PORTAL_DATABASE_URL: z.string().min(1, "PORTAL_DATABASE_URL is required"),
  PORTAL_CORS_ORIGIN: z.string().default("http://localhost:5173"),
  PORTAL_JWT_SECRET: z.string().min(32, "PORTAL_JWT_SECRET must be at least 32 characters"),
  PORTAL_REFRESH_SECRET: z.string().min(32, "PORTAL_REFRESH_SECRET must be at least 32 characters"),
  PORTAL_ACCESS_TOKEN_TTL_MIN: z.coerce.number().default(15),
  PORTAL_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  // App base URL used to build the links in emails (verification, reset, invites).
  PORTAL_APP_URL: z.string().default("https://portal.inveontechnologies.in"),
  // Outbound email (verification, password reset, assessment invites,
  // certificates). When PORTAL_SMTP_HOST is unset, emails are only logged —
  // fine for development, but password reset can't work that way in production.
  PORTAL_SMTP_HOST: z.string().optional(),
  PORTAL_SMTP_PORT: z.coerce.number().default(587),
  // true = implicit TLS (usually port 465); false = STARTTLS (usually 587).
  PORTAL_SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  PORTAL_SMTP_USER: z.string().optional(),
  PORTAL_SMTP_PASSWORD: z.string().optional(),
  PORTAL_MAIL_FROM: z.string().default("Inveon Portal <no-reply@inveontechnologies.in>"),
  // Google Meet links for calendar events: an OAuth client plus the refresh
  // token of the account that owns the meetings. Leave unset to hide the
  // Google Meet option. See docs/calendar-integrations.md.
  PORTAL_GOOGLE_CLIENT_ID: z.string().optional(),
  PORTAL_GOOGLE_CLIENT_SECRET: z.string().optional(),
  PORTAL_GOOGLE_REFRESH_TOKEN: z.string().optional(),
  PORTAL_GOOGLE_CALENDAR_ID: z.string().default("primary"),
  // Zoom links: a Server-to-Server OAuth app. Leave unset to hide Zoom.
  PORTAL_ZOOM_ACCOUNT_ID: z.string().optional(),
  PORTAL_ZOOM_CLIENT_ID: z.string().optional(),
  PORTAL_ZOOM_CLIENT_SECRET: z.string().optional(),
  // The Zoom user that hosts the meetings ("me" = the app's owner).
  PORTAL_ZOOM_USER: z.string().default("me"),
  // Cashfree payments for program fees (same account as the Events site).
  // Leave the app id unset to hide "Pay now"; candidates can still start
  // the free trial and staff can mark a payment received by hand.
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  // Test-only override of the Cashfree API base URL.
  CASHFREE_API_BASE: z.string().optional(),
  // GitHub issues <-> tasks. A fine-grained token with Issues read/write on
  // the Inveon repos; leave unset to hide the GitHub buttons.
  GITHUB_TOKEN: z.string().optional(),
  // Secret set on the repo/org webhook (issues events) so closes sync back.
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  // Repo for issues from tasks that aren't in a project with its own repo, e.g. "inveon/internship-tasks".
  GITHUB_DEFAULT_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
  // Test-only override of the GitHub API base URL.
  GITHUB_API_BASE: z.string().optional(),
  // Require candidates to verify their email before applying. Off by
  // default so accounts created before email sending was configured aren't
  // locked out; switch on once SMTP is working.
  PORTAL_REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
