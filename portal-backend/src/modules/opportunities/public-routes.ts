import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { assessments, courses, opportunities, opportunityCourses, opportunitySkills, skills } from "../shared/db/schema.js";
import type { Env } from "../shared/env.js";

/**
 * Read-only feed of published openings for the marketing site's careers
 * page, so both show the same list. No auth and no cookies: it's served
 * with "Access-Control-Allow-Origin: *" (see index.ts), and returns only
 * what the portal already shows to any signed-in candidate.
 */
export function publicOpeningsRouter(db: Database, env: Env) {
  const router = Router();

  router.get("/openings", async (_req, res) => {
    const rows = await db.query.opportunities.findMany({
      where: eq(opportunities.status, "published"),
      orderBy: desc(opportunities.seqNumber),
      limit: 100,
    });
    const ids = rows.map((r) => r.id);

    const skillRows = ids.length
      ? await db
          .select({ opportunityId: opportunitySkills.opportunityId, name: skills.name })
          .from(opportunitySkills)
          .innerJoin(skills, eq(opportunitySkills.skillId, skills.id))
          .where(inArray(opportunitySkills.opportunityId, ids))
      : [];
    const examRows = ids.length
      ? await db
          .select({ opportunityId: assessments.opportunityId, language: assessments.language })
          .from(assessments)
          .where(and(inArray(assessments.opportunityId, ids), eq(assessments.isActive, true)))
      : [];
    const courseRows = ids.length
      ? await db
          .select({ opportunityId: opportunityCourses.opportunityId, n: sql<number>`count(*)::int` })
          .from(opportunityCourses)
          .innerJoin(courses, eq(opportunityCourses.courseId, courses.id))
          .where(and(inArray(opportunityCourses.opportunityId, ids), eq(courses.status, "published")))
          .groupBy(opportunityCourses.opportunityId)
      : [];

    const group = <T extends { opportunityId: string }>(list: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of list) m.set(r.opportunityId, [...(m.get(r.opportunityId) ?? []), r]);
      return m;
    };
    const skillsBy = group(skillRows);
    const examsBy = group(examRows);
    const coursesBy = new Map(courseRows.map((c) => [c.opportunityId, c.n]));

    res.setHeader("Cache-Control", "public, max-age=120");
    res.json({
      openings: rows.map((o) => ({
        id: o.id,
        title: o.title,
        kind: o.kind,
        summary: o.description.length > 280 ? `${o.description.slice(0, 277).trimEnd()}…` : o.description,
        location: o.location,
        durationMonths: o.durationMonths,
        stipendAmount: o.stipendAmount !== null ? Number(o.stipendAmount) : null,
        startDate: o.startDate,
        skills: (skillsBy.get(o.id) ?? []).map((s) => s.name),
        examLanguages: [...new Set((examsBy.get(o.id) ?? []).map((e) => e.language).filter((l): l is string => !!l))],
        hasExam: (examsBy.get(o.id) ?? []).length > 0,
        courseCount: coursesBy.get(o.id) ?? 0,
        applyUrl: `${env.PORTAL_APP_URL}/opportunities/${o.id}`,
      })),
    });
  });

  return router;
}
