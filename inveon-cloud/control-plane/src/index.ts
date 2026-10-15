import "dotenv/config";
import { loadEnv, masterKeyConfig } from "./env.js";
import { createDb, runMigrations } from "./db/client.js";
import { configureMasterKeys } from "./lib/crypto.js";
import { configureMailer } from "./lib/mailer.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler.js";
import { warnAboutMissingKeys } from "./modules/keys/service.js";

const env = loadEnv();
try {
  configureMasterKeys(masterKeyConfig(env));
} catch (err) {
  logger.fatal({ err }, "Invalid master key configuration (INVEON_MASTER_KEY, INVEON_MASTER_KEYS, INVEON_MASTER_KEY_CURRENT)");
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

await warnAboutMissingKeys(db).catch((err) => logger.error({ err }, "Could not check encrypted values against the master keys"));

const app = createApp(db, pool, env);
const server = app.listen(env.INVEON_PORT, () => {
  logger.info({ port: env.INVEON_PORT }, "inveon-cloud control plane listening");
  if (env.INVEON_SCHEDULER === "true") startScheduler(db, env);
});
// Agents long-poll for up to INVEON_AGENT_POLL_TIMEOUT_MS; keep sockets open longer than that.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
