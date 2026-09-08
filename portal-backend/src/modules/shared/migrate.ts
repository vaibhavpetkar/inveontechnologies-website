import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";

const env = loadEnv();
const { db, pool } = createDb(env);

logger.info("Running migrations...");
await migrate(db, { migrationsFolder: "./src/migrations" });
logger.info("Migrations complete.");
await pool.end();
