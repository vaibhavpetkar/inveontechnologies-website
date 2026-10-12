import { z } from "zod";

/**
 * Validated configuration. Nothing else reads process.env directly.
 * Startup fails fast when a required value is missing.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  INVEON_PORT: z.coerce.number().default(4100),
  INVEON_DATABASE_URL: z.string().min(1, "INVEON_DATABASE_URL is required"),
  INVEON_JWT_SECRET: z.string().min(32, "INVEON_JWT_SECRET must be at least 32 characters"),
  INVEON_ACCESS_TOKEN_TTL_MIN: z.coerce.number().default(15),
  INVEON_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  // 32 random bytes, base64 (openssl rand -base64 32). Wraps every data key.
  // Kept only in the environment, never in the database.
  INVEON_MASTER_KEY: z.string().min(1, "INVEON_MASTER_KEY is required"),
  // Public HTTPS URL of this control plane: used in the install command,
  // webhook URLs and email links.
  INVEON_PUBLIC_URL: z.string().url().default("http://localhost:4100"),
  // Built dashboard to serve from the same origin (optional).
  INVEON_DASHBOARD_DIR: z.string().optional(),
  // Folder holding install.sh and inveon-agent.tar.gz (npm run bundle in agent/).
  // Defaults to ../agent next to this control plane.
  INVEON_AGENT_DIR: z.string().optional(),
  // "false" = only people with an invite can create an account.
  INVEON_OPEN_SIGNUP: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  // Attempts per 15 minutes per IP on login and sign-up.
  INVEON_AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  INVEON_AUTO_MIGRATE: z.enum(["true", "false"]).default("true"),
  INVEON_SCHEDULER: z.enum(["true", "false"]).default("true"),
  INVEON_SCHEDULER_TICK_SEC: z.coerce.number().int().min(1).default(30),
  // How long an agent claim request waits for a job before returning empty.
  INVEON_AGENT_POLL_TIMEOUT_MS: z.coerce.number().int().min(0).max(60000).default(25000),
  // A server with no heartbeat for this long is offline.
  INVEON_HEARTBEAT_TIMEOUT_SEC: z.coerce.number().int().min(10).default(90),
  // Running jobs older than this are marked failed.
  INVEON_JOB_TIMEOUT_MIN: z.coerce.number().int().min(1).default(60),
  // GitHub: token for private repos (contents read), and API base (tests).
  INVEON_GITHUB_TOKEN: z.string().optional(),
  INVEON_GITHUB_API_BASE: z.string().default("https://api.github.com"),
  // Let's Encrypt account email for certbot.
  INVEON_ACME_EMAIL: z.string().email().optional(),
  // Health alerts and invites. Without SMTP_HOST, email is only logged.
  INVEON_SMTP_HOST: z.string().optional(),
  INVEON_SMTP_PORT: z.coerce.number().default(587),
  INVEON_SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  INVEON_SMTP_USER: z.string().optional(),
  INVEON_SMTP_PASSWORD: z.string().optional(),
  INVEON_MAIL_FROM: z.string().default("Inveon Cloud <no-reply@inveontechnologies.in>"),
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
