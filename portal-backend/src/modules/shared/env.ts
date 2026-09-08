import { z } from "zod";

/**
 * Fail fast on startup if required configuration is missing.
 * Nothing else in the app should read process.env directly —
 * everything goes through this validated, typed object.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORTAL_PORT: z.coerce.number().default(4000),
  // Intentionally optional at Phase 0 — no DB wiring yet.
  // Becomes required (z.string().min(1)) in Phase 1 when the DB module lands.
  PORTAL_DATABASE_URL: z.string().optional(),
  PORTAL_CORS_ORIGIN: z.string().default("http://localhost:5173"),
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
