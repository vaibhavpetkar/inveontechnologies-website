import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb } from "./modules/shared/db/client.js";
import { loadEnv } from "./modules/shared/env.js";
import { logger } from "./modules/shared/logger.js";
import { hashPassword } from "./modules/auth/password.js";
import { refreshTokens, users } from "./modules/shared/db/schema.js";
import { writeAuditLog } from "./modules/shared/audit.js";

/**
 * Break-glass recovery for when someone (typically the super admin) can't
 * sign in and email isn't working: sets a new password, clears the failed
 * login counter and lockout, and signs out every existing session — the
 * same effect as the emailed reset link. Run inside the backend container:
 *
 *   docker compose exec -e SEED_SUPER_ADMIN_EMAIL=... -e SEED_SUPER_ADMIN_PASSWORD=... \
 *     portal-backend npm run admin:reset-password
 */
const EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase(); // auth compares emails lowercased
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD;

async function main() {
  if (!EMAIL || !PASSWORD) {
    logger.error("Set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD (the account and its new password).");
    process.exit(1);
  }
  if (PASSWORD.length < 10) {
    logger.error("SEED_SUPER_ADMIN_PASSWORD must be at least 10 characters.");
    process.exit(1);
  }

  const env = loadEnv();
  const { db, pool } = createDb(env);

  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${EMAIL}` });
  if (!user) {
    logger.error({ email: EMAIL }, "No account with that email. Use `npm run db:seed` to create the super admin.");
    await pool.end();
    process.exit(1);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(PASSWORD), failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
  await writeAuditLog(db, { actorUserId: user.id, action: "user.password_reset_cli", entityType: "user", entityId: user.id });
  logger.info({ email: EMAIL, role: user.role }, "Password reset and lockout cleared. Sign in with the new password.");

  await pool.end();
}

main();
