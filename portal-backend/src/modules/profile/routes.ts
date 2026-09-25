import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { candidateProfiles, candidateSkills, skills } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { resolveSkillIds } from "../shared/skills.js";
import type { Env } from "../shared/env.js";

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().min(5).max(20).optional(),
  bio: z.string().max(2000).optional(),
  degree: z.string().max(100).optional(),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  cgpa: z.number().min(0).max(10).optional(),
  skillNames: z.array(z.string().min(1)).optional(),
});


export function profileRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/me", requireAuth(env), async (req, res) => {
    const profile = await db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.userId, req.user!.sub) });
    const skillLinks = await db
      .select({ skill: skills })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(eq(candidateSkills.userId, req.user!.sub));

    res.json({
      profile: profile ?? { userId: req.user!.sub, profileCompleted: false },
      skills: skillLinks.map((s) => s.skill),
    });
  });

  router.put("/me", requireAuth(env), async (req, res) => {
    const body = updateProfileSchema.parse(req.body);
    const existing = await db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.userId, req.user!.sub) });

    const merged = {
      fullName: body.fullName ?? existing?.fullName ?? null,
      phone: body.phone ?? existing?.phone ?? null,
      bio: body.bio ?? existing?.bio ?? null,
      degree: body.degree ?? existing?.degree ?? null,
      graduationYear: body.graduationYear ?? existing?.graduationYear ?? null,
      cgpa: body.cgpa !== undefined ? String(body.cgpa) : (existing?.cgpa ?? null),
    };
    // Minimum bar for "profile completed": name + phone. Richer eligibility
    // fields (degree/graduationYear/cgpa) are optional and only matter if
    // an opportunity's eligibility criteria references them.
    const profileCompleted = Boolean(merged.fullName && merged.phone);

    let profile;
    if (existing) {
      [profile] = await db
        .update(candidateProfiles)
        .set({ ...merged, profileCompleted, updatedAt: new Date() })
        .where(eq(candidateProfiles.userId, req.user!.sub))
        .returning();
    } else {
      [profile] = await db
        .insert(candidateProfiles)
        .values({ userId: req.user!.sub, ...merged, profileCompleted })
        .returning();
    }

    if (body.skillNames) {
      const skillIds = await resolveSkillIds(db, body.skillNames);
      await db.delete(candidateSkills).where(eq(candidateSkills.userId, req.user!.sub));
      if (skillIds.length > 0) {
        await db.insert(candidateSkills).values(skillIds.map((skillId) => ({ userId: req.user!.sub, skillId })));
      }
    }

    res.json({ profile });
  });

  return router;
}
