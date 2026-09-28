import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, courseEnrollments, courses, opportunities, opportunityCourses } from "../shared/db/schema.js";
import { logger } from "../shared/logger.js";
import { notify } from "../notifications/service.js";
import { ensureProgressRows } from "./routes.js";
import { joinUpcomingClasses } from "./classes.js";

/**
 * Enrolls a new intern or program participant in the courses linked to
 * their opportunity. Programs start at selection (there's no offer to
 * accept); internships and jobs start when the offer is accepted. The
 * organisation covers these courses, so no payment is due. Safe to call
 * twice: existing enrollments are left alone. Never throws.
 */
export async function enrollInOpportunityCourses(db: Database, applicationId: string, trigger: "selected" | "offer_accepted") {
  try {
    const application = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
    if (!application) return [];
    const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId) });
    if (!opportunity) return [];
    if (trigger === "selected" && opportunity.kind !== "program") return [];

    const links = await db.select().from(opportunityCourses).where(eq(opportunityCourses.opportunityId, opportunity.id)).orderBy(asc(opportunityCourses.orderIndex));
    if (links.length === 0) return [];
    const published = await db.query.courses.findMany({ where: and(inArray(courses.id, links.map((l) => l.courseId)), eq(courses.status, "published")) });

    const enrolled: string[] = [];
    for (const course of published) {
      const [row] = await db.insert(courseEnrollments).values({ courseId: course.id, userId: application.userId, paymentStatus: "not_required" }).onConflictDoNothing().returning();
      if (!row) continue;
      await ensureProgressRows(db, row.id, course.id);
      await joinUpcomingClasses(db, course.id, application.userId);
      enrolled.push(course.title);
    }
    if (enrolled.length) {
      await notify(db, {
        userIds: [application.userId],
        kind: "course.enrolled",
        title: enrolled.length === 1 ? `You're enrolled in ${enrolled[0]}` : `You're enrolled in ${enrolled.length} courses`,
        body: `As part of ${opportunity.title}: ${enrolled.join(", ")}. Start whenever you're ready.`,
        link: "/courses",
        email: true,
      });
    }
    return enrolled;
  } catch (err) {
    logger.error({ err, applicationId }, "Could not enroll in opportunity courses");
    return [];
  }
}
