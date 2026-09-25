import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { opportunities, opportunitySkills, skills, users } from "../shared/db/schema.js";
import { optionalAuth, requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { slugify } from "../shared/slugify.js";
import { resolveSkillIds } from "../shared/skills.js";
import { formatBusinessId } from "../shared/business-id.js";
import type { Env } from "../shared/env.js";

const PRIVILEGED_ROLES = ["hr", "admin", "super_admin"] as const;

const createOpportunitySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  eligibility: z
    .object({
      minCgpa: z.number().min(0).max(10).optional(),
      degrees: z.array(z.string()).optional(),
      maxGraduationYear: z.number().int().optional(),
    })
    .default({}),
  skillNames: z.array(z.string().min(1)).default([]),
  // Manager whose team is hiring — scopes that manager's pipeline access. null clears it.
  hiringManagerId: z.string().uuid().nullable().optional(),
});

async function assertHiringManager(db: Database, userId: string | null | undefined) {
  if (!userId) return;
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.role !== "manager") {
    throw new AppError("INVALID_HIRING_MANAGER", "hiringManagerId must be the id of a user with the manager role", 400);
  }
}

const updateOpportunitySchema = createOpportunitySchema.partial();

const listQuerySchema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  skill: z.string().optional(),
  search: z.string().optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});


export function opportunitiesRouter(db: Database, env: Env) {
  const router = Router();

  // --- Skills taxonomy (public read) ---
  router.get("/skills", async (_req, res) => {
    const all = await db.query.skills.findMany({ orderBy: (s, { asc }) => [asc(s.name)] });
    res.json({ skills: all });
  });

  // --- Browse (candidates see only published; privileged roles can filter by any status) ---
  router.get("/", optionalAuth(env), async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const isPrivileged = req.user && PRIVILEGED_ROLES.includes(req.user.role as (typeof PRIVILEGED_ROLES)[number]);

    const conditions = [];
    if (isPrivileged && query.status) {
      conditions.push(eq(opportunities.status, query.status));
    } else if (!isPrivileged) {
      conditions.push(eq(opportunities.status, "published"));
    }
    if (query.search) {
      conditions.push(sql`${opportunities.title} ILIKE ${"%" + query.search + "%"}`);
    }
    if (query.cursor) {
      conditions.push(sql`${opportunities.seqNumber} < ${query.cursor}`);
    }

    let skillFilterIds: string[] | null = null;
    if (query.skill) {
      const skillRow = await db.query.skills.findFirst({ where: eq(skills.slug, slugify(query.skill)) });
      skillFilterIds = skillRow ? [skillRow.id] : [];
    }

    let rows: Awaited<ReturnType<typeof db.query.opportunities.findMany>>;
    if (skillFilterIds !== null) {
      if (skillFilterIds.length === 0) {
        rows = [];
      } else {
        const matchingOppIds = await db
          .select({ opportunityId: opportunitySkills.opportunityId })
          .from(opportunitySkills)
          .where(inArray(opportunitySkills.skillId, skillFilterIds));
        const oppIds = matchingOppIds.map((r) => r.opportunityId);
        if (oppIds.length === 0) {
          rows = [];
        } else {
          rows = await db.query.opportunities.findMany({
            where: and(...conditions, inArray(opportunities.id, oppIds)),
            orderBy: desc(opportunities.seqNumber),
            limit: query.limit,
          });
        }
      }
    } else {
      rows = await db.query.opportunities.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: desc(opportunities.seqNumber),
        limit: query.limit,
      });
    }

    const nextCursor = rows.length === query.limit ? rows[rows.length - 1].seqNumber : null;
    res.json({ opportunities: rows, nextCursor });
  });

  router.get("/:id", optionalAuth(env), async (req, res) => {
    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, req.params.id) });
    if (!opportunity) throw new NotFoundError("Opportunity not found");

    const isPrivileged = req.user && PRIVILEGED_ROLES.includes(req.user.role as (typeof PRIVILEGED_ROLES)[number]);
    if (opportunity.status !== "published" && !isPrivileged) {
      throw new NotFoundError("Opportunity not found");
    }

    const skillLinks = await db
      .select({ skill: skills })
      .from(opportunitySkills)
      .innerJoin(skills, eq(opportunitySkills.skillId, skills.id))
      .where(eq(opportunitySkills.opportunityId, opportunity.id));

    res.json({ opportunity, skills: skillLinks.map((s) => s.skill) });
  });

  // --- Privileged: create/edit/publish/archive ---
  router.post("/", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = createOpportunitySchema.parse(req.body);
    await assertHiringManager(db, body.hiringManagerId);
    const skillIds = await resolveSkillIds(db, body.skillNames);

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(opportunities)
        .values({
          title: body.title,
          slug: slugify(body.title) + "-" + Math.random().toString(36).slice(2, 7),
          description: body.description,
          eligibility: body.eligibility,
          hiringManagerId: body.hiringManagerId ?? null,
          createdBy: req.user!.sub,
        })
        .returning();

      const businessId = formatBusinessId("OPP", created.seqNumber);
      const [updated] = await tx
        .update(opportunities)
        .set({ businessId })
        .where(eq(opportunities.id, created.id))
        .returning();

      if (skillIds.length > 0) {
        await tx.insert(opportunitySkills).values(skillIds.map((skillId) => ({ opportunityId: updated.id, skillId })));
      }
      return updated;
    });

    await writeAuditLog(db, {
      actorUserId: req.user!.sub,
      action: "opportunity.create",
      entityType: "opportunity",
      entityId: result.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ opportunity: result });
  });

  router.put("/:id", requireAuth(env), requireRole(...PRIVILEGED_ROLES), async (req, res) => {
    const body = updateOpportunitySchema.parse(req.body);
    await assertHiringManager(db, body.hiringManagerId);
    const existing = await db.query.opportunities.findFirst({ where: eq(opportunities.id, req.params.id) });
    if (!existing) throw new NotFoundError("Opportunity not found");
    if (existing.status === "archived") {
      throw new AppError("OPPORTUNITY_ARCHIVED", "Cannot edit an archived opportunity", 400);
    }

    const [updated] = await db
      .update(opportunities)
      .set({
        ...(body.title ? { title: body.title } : {}),
        ...(body.description ? { description: body.description } : {}),
        ...(body.eligibility ? { eligibility: body.eligibility } : {}),
        ...(body.hiringManagerId !== undefined ? { hiringManagerId: body.hiringManagerId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, req.params.id))
      .returning();

    if (body.skillNames) {
      const skillIds = await resolveSkillIds(db, body.skillNames);
      await db.delete(opportunitySkills).where(eq(opportunitySkills.opportunityId, req.params.id));
      if (skillIds.length > 0) {
        await db.insert(opportunitySkills).values(skillIds.map((skillId) => ({ opportunityId: req.params.id, skillId })));
      }
    }

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "opportunity.update", entityType: "opportunity", entityId: updated.id, ipAddress: req.ip });
    res.json({ opportunity: updated });
  });

  router.post("/:id/publish", requireAuth(env), requireRole("admin", "super_admin"), async (req, res) => {
    const existing = await db.query.opportunities.findFirst({ where: eq(opportunities.id, req.params.id) });
    if (!existing) throw new NotFoundError("Opportunity not found");
    if (existing.status !== "draft") {
      throw new AppError("INVALID_TRANSITION", `Cannot publish an opportunity in status "${existing.status}"`, 400);
    }

    const [updated] = await db
      .update(opportunities)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(opportunities.id, req.params.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "opportunity.publish", entityType: "opportunity", entityId: updated.id, ipAddress: req.ip });
    res.json({ opportunity: updated });
  });

  router.post("/:id/archive", requireAuth(env), requireRole("admin", "super_admin"), async (req, res) => {
    const existing = await db.query.opportunities.findFirst({ where: eq(opportunities.id, req.params.id) });
    if (!existing) throw new NotFoundError("Opportunity not found");
    if (existing.status === "archived") {
      throw new AppError("INVALID_TRANSITION", "Opportunity is already archived", 400);
    }

    const [updated] = await db
      .update(opportunities)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(opportunities.id, req.params.id))
      .returning();

    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "opportunity.archive", entityType: "opportunity", entityId: updated.id, ipAddress: req.ip });
    res.json({ opportunity: updated });
  });

  return router;
}
