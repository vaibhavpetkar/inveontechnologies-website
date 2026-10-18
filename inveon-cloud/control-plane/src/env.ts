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
  // INVEON_MASTER_KEY is the original single key (key id "legacy").
  // INVEON_MASTER_KEYS adds more as "id:key,id:key", and
  // INVEON_MASTER_KEY_CURRENT picks the one new values use (default: the
  // last listed, else legacy). See "Rotating the master key" in the README.
  // An INVEON_MASTER_KEYS entry "id:kms:<base64 CiphertextBlob>" is a data
  // key encrypted by AWS KMS, decrypted once at start-up (npm run
  // keys:kms-generate makes one).
  INVEON_MASTER_KEY: z.string().optional(),
  INVEON_MASTER_KEYS: z.string().optional(),
  INVEON_MASTER_KEY_CURRENT: z.string().optional(),
  // Region of the KMS key behind KMS-backed master keys. Unset: the AWS SDK's
  // default (AWS_REGION, or the instance's region via the profile).
  INVEON_KMS_REGION: z.string().regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/, "An AWS region like ap-south-1").optional(),
  // Comma-separated emails of platform admins (encryption keys). Unset: the
  // first account created on this installation.
  INVEON_PLATFORM_ADMINS: z.string().optional(),
  // Public HTTPS URL of this control plane: used in the install command,
  // webhook URLs and email links.
  INVEON_PUBLIC_URL: z.string().url().default("http://localhost:4100"),
  // Passkeys: the rpId is INVEON_PUBLIC_URL's host and the browser origin
  // must be its origin. Extra origins on that host (comma-separated, e.g.
  // the Vite dev server http://localhost:5174) can be added here.
  INVEON_WEBAUTHN_ORIGINS: z.string().optional(),
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
  // "required": every agent must sign its requests (Ed25519, see
  // lib/agent-signature.ts), in every organization. "optional": agents
  // without a signing key still work unless their organization requires it.
  // An agent that has registered a key must always sign.
  INVEON_AGENT_SIGNATURES: z.enum(["optional", "required"]).default("optional"),
  // GitHub: token for private repos (contents read), and API base (tests).
  INVEON_GITHUB_TOKEN: z.string().optional(),
  INVEON_GITHUB_API_BASE: z.string().default("https://api.github.com"),
  // Optional GitHub App (see "GitHub App" in the README): its id, slug (the
  // name in github.com/apps/<slug>), private key (PEM, or base64 of the PEM),
  // OAuth client id and secret (to check who installed it), and the secret
  // of the app's own webhook. With it, installation tokens replace
  // INVEON_GITHUB_TOKEN for repos on linked installations.
  INVEON_GITHUB_APP_ID: z.string().regex(/^\d{1,12}$/, "The GitHub App's numeric id").optional(),
  INVEON_GITHUB_APP_SLUG: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/, "The app's slug from github.com/apps/<slug>").optional(),
  INVEON_GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  INVEON_GITHUB_APP_CLIENT_ID: z.string().max(100).optional(),
  INVEON_GITHUB_APP_CLIENT_SECRET: z.string().max(200).optional(),
  INVEON_GITHUB_APP_WEBHOOK_SECRET: z.string().min(16, "Use a long random webhook secret").optional(),
  // github.com itself (installation and OAuth pages); changed only in tests.
  INVEON_GITHUB_WEB_BASE: z.string().url().default("https://github.com"),
  // Provider REST APIs (DigitalOcean, Hetzner Cloud, Cloudflare); changed only in tests.
  INVEON_DIGITALOCEAN_API_BASE: z.string().url().optional(),
  INVEON_HETZNER_API_BASE: z.string().url().optional(),
  INVEON_CLOUDFLARE_API_BASE: z.string().url().optional(),
  // Wildcard certificates (DNS-01): seconds certbot waits after the TXT record is
  // published (Route 53 also waits for the change to be in sync first).
  INVEON_DNS_PROPAGATION_SEC: z.coerce.number().int().min(0).max(600).default(30),
  // Let's Encrypt account email for certbot.
  INVEON_ACME_EMAIL: z.string().email().optional(),
  // Health alerts and invites. Without SMTP_HOST, email is only logged.
  INVEON_SMTP_HOST: z.string().optional(),
  INVEON_SMTP_PORT: z.coerce.number().default(587),
  INVEON_SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  INVEON_SMTP_USER: z.string().optional(),
  INVEON_SMTP_PASSWORD: z.string().optional(),
  INVEON_MAIL_FROM: z.string().default("Inveon Cloud <no-reply@inveontechnologies.in>"),
  // Alert webhooks: comma-separated hosts that may be private addresses or
  // plain http (internal endpoints on a trusted network). Empty = none.
  INVEON_ALERT_PRIVATE_HOSTS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const masterKeyConfig = (env: Env) => ({ legacy: env.INVEON_MASTER_KEY, keys: env.INVEON_MASTER_KEYS, current: env.INVEON_MASTER_KEY_CURRENT });

/**
 * Docker Compose passes unset optional settings as empty strings
 * (`${INVEON_ACME_EMAIL:-}`), so an empty value counts as not set.
 */
export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")));
}

/** INVEON_KMS_REGION alone, for commands that don't need the rest (keys:kms-generate). */
export function parseKmsRegion(source: NodeJS.ProcessEnv): string | undefined {
  return envSchema.shape.INVEON_KMS_REGION.parse(source.INVEON_KMS_REGION || undefined);
}

export function loadEnv(): Env {
  const parsed = parseEnv(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
