import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { refreshTokens, users } from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import type { Env } from "../shared/env.js";

const ROLES = ["candidate", "intern", "employee", "manager", "hr", "admin", "super_admin"] as const;
// Staff pick interviewers, hiring managers and project members from this list.
const DIRECTORY_ROLES = ["hr", "admin", "super_admin"] as const;

const listQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  search: z.string().trim().max(200).optional(),
});

const createUserSchema = z.object({
  email: z.string().trim().email().transform((e) => e.toLowerCase()),
  password: z.string().min(10, "Password must be at least 10 characters"),
  role: z.enum(ROLES),
});

const setRoleSchema = z.object({ role: z.enum(ROLES) });

const publicUser = (u: typeof users.$inferSelect) => ({ id: u.id, email: u.email, role: u.role, emailVerified: u.emailVerified, createdAt: u.createdAt });

/**
 * Account and role management — "Manage roles/permissions: Super Admin" in
 * docs/permissions.md. Before this existed the only way to get an HR, admin
 * or manager account was editing the database by hand.
 */
export function usersRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/", requireAuth(env), requireRole(...DIRECTORY_ROLES), async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const conditions: SQL[] = [];
    if (query.role) conditions.push(eq(users.role, query.role));
    if (query.search) conditions.push(sql`${users.email} ILIKE ${"%" + query.search.replace(/[\\%_]/g, "\\$&") + "%"}`);
    const rows = await db.query.users.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: desc(users.createdAt),
      limit: 200,
    });
    res.json({ users: rows.map(publicUser) });
  });

  // Create a staff (or any) account directly. The address is treated as
  // verified — a super admin is vouching for it.
  router.post("/", requireAuth(env), requireRole("super_admin"), async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${body.email}` });
    if (existing) throw new AppError("EMAIL_TAKEN", "An account with this email already exists — change its role instead", 409);

    const [user] = await db
      .insert(users)
      .values({ email: body.email, passwordHash: await hashPassword(body.password), role: body.role, emailVerified: true })
      .returning();
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "user.create", entityType: "user", entityId: user.id, metadata: { role: body.role }, ipAddress: req.ip });
    res.status(201).json({ user: publicUser(user) });
  });

  router.put("/:id/role", requireAuth(env), requireRole("super_admin"), async (req, res) => {
    const { role } = setRoleSchema.parse(req.body);
    // Also guarantees at least one super admin always remains.
    if (req.params.id === req.user!.sub) throw new AppError("CANNOT_CHANGE_OWN_ROLE", "You can't change your own role", 400);

    const target = await db.query.users.findFirst({ where: eq(users.id, req.params.id) });
    if (!target) throw new NotFoundError("User not found");

    const [updated] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, target.id)).returning();
    // Roles ride in access tokens; ending the user's sessions makes the new
    // role apply as soon as their current token expires, instead of whenever
    // their refresh token next rotates.
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, target.id), isNull(refreshTokens.revokedAt)));
    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "user.role_change",
      entityType: "user",
      entityId: target.id,
      metadata: { from: target.role, to: role },
      ipAddress: req.ip,
    });
    res.json({ user: publicUser(updated) });
  });

  return router;
}
