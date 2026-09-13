import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";

const env = loadEnv();
const { db, pool } = createDb(env);

// Resolve relative to THIS file's own location, not process.cwd() — so it
// works correctly both in dev (running src/modules/shared/migrate.ts via
// tsx, migrations at ../../migrations = src/migrations) and in production
// (running the compiled dist/modules/shared/migrate.js via plain node,
// migrations at ../../migrations = dist/migrations, copied there by the
// build script — see package.json). A hardcoded "./src/migrations" path
// only ever worked in dev; production never has a src/ directory at all.
const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(currentDir, "..", "..", "migrations");

logger.info({ migrationsFolder }, "Running migrations...");
await migrate(db, { migrationsFolder });
logger.info("Migrations complete.");
await pool.end();
