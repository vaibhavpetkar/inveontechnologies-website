import "dotenv/config";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { runMigrations } from "./run-migrations.js";

const env = loadEnv();
const { db, pool } = createDb(env);
await runMigrations(db);
await pool.end();
