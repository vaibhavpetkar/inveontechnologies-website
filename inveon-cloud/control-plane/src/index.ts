import "dotenv/config";
import { loadEnv } from "./env.js";
import { createDb, runMigrations } from "./db/client.js";
import { configureMasterKey } from "./lib/crypto.js";
import { configureMailer } from "./lib/mailer.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler.js";

const env = loadEnv();
try {
  configureMasterKey(env.INVEON_MASTER_KEY);
} catch (err) {
  logger.fatal({ err }, "Invalid INVEON_MASTER_KEY");
  process.exit(1);
}
configureMailer(env);
const { db, pool } = createDb(env.INVEON_DATABASE_URL);

if (env.INVEON_AUTO_MIGRATE === "true") {
  try {
    await runMigrations(db);
  } catch (err) {
    logger.fatal({ err }, "Migrations failed; not starting");
    process.exit(1);
  }
}

const app = createApp(db, pool, env);
const server = app.listen(env.INVEON_PORT, () => {
  logger.info({ port: env.INVEON_PORT }, "inveon-cloud control plane listening");
  if (env.INVEON_SCHEDULER === "true") startScheduler(db, env);
});
// Agents long-poll for up to INVEON_AGENT_POLL_TIMEOUT_MS; keep sockets open longer than that.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
