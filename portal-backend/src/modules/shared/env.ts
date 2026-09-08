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
  // App base URL used to build verification/reset links that are (Phase 1)
  // logged instead of emailed — see auth/email-stub.ts.
  PORTAL_APP_URL: z.string().default("https://portal.inveontechnologies.in"),
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
