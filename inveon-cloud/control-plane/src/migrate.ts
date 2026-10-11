import "dotenv/config";
import { createDb, runMigrations } from "./db/client.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const { db, pool } = createDb(env.INVEON_DATABASE_URL);
await runMigrations(db);
await pool.end();
