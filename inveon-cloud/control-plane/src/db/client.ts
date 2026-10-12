import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as schema from "./schema.js";
import { logger } from "../lib/logger.js";

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createDb>["db"];

// Relative to this file: src/db -> src/migrations (dev), dist/db -> dist/migrations (built).
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Applies pending migrations. Safe to run on every start. */
export async function runMigrations(db: Database) {
  logger.info({ migrationsFolder }, "Running migrations");
  await migrate(db, { migrationsFolder });
}
