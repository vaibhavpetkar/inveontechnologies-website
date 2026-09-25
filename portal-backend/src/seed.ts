import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./modules/shared/db/client.js";
import { loadEnv } from "./modules/shared/env.js";
import { logger } from "./modules/shared/logger.js";
import { hashPassword } from "./modules/auth/password.js";
import { users } from "./modules/shared/db/schema.js";

const SEED_SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase(); // auth compares emails lowercased
const SEED_SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD;

async function main() {
  if (!SEED_SUPER_ADMIN_EMAIL || !SEED_SUPER_ADMIN_PASSWORD) {
    logger.error(
      "Set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD env vars before seeding (not committed anywhere — pass at seed time only).",
    );
    process.exit(1);
  }
  if (SEED_SUPER_ADMIN_PASSWORD.length < 10) {
    logger.error("SEED_SUPER_ADMIN_PASSWORD must be at least 10 characters.");
    process.exit(1);
  }

  const env = loadEnv();
  const { db, pool } = createDb(env);

  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${SEED_SUPER_ADMIN_EMAIL}` });
  if (existing) {
    logger.info({ email: SEED_SUPER_ADMIN_EMAIL }, "Super admin already exists, skipping.");
  } else {
    const passwordHash = await hashPassword(SEED_SUPER_ADMIN_PASSWORD);
    await db.insert(users).values({
      email: SEED_SUPER_ADMIN_EMAIL,
      passwordHash,
      role: "super_admin",
      emailVerified: true,
    });
    logger.info({ email: SEED_SUPER_ADMIN_EMAIL }, "Super admin created.");
  }

  await pool.end();
}

main();
