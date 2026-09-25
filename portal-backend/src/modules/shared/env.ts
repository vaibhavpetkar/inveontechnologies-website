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
