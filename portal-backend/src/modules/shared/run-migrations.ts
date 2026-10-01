import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Database } from "./db/client.js";
import { logger } from "./logger.js";

// Resolve relative to THIS file's own location, not process.cwd() — so it
// works correctly both in dev (src/modules/shared via tsx, migrations at
// ../../migrations = src/migrations) and in production (the compiled
// dist/modules/shared via plain node, migrations at dist/migrations, copied
// there by the build script — see package.json).
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

/** Applies any migrations the database doesn't have yet. Safe to run on every start. */
export async function runMigrations(db: Database) {
  logger.info({ migrationsFolder }, "Running migrations...");
  await migrate(db, { migrationsFolder });
  logger.info("Migrations complete.");
}
