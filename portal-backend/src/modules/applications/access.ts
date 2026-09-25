import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, interviewRounds, opportunities } from "../shared/db/schema.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";

/** HR/Admin/Super Admin see the whole recruitment pipeline. */
export const RECRUITMENT_ADMIN_ROLES = ["hr", "admin", "super_admin"] as const;
/** Roles that may reach staff pipeline endpoints at all (managers are then scoped per application). */
export const PIPELINE_ROLES = ["manager", ...RECRUITMENT_ADMIN_ROLES] as const;

export function isRecruitmentAdmin(role: string): boolean {
  return (RECRUITMENT_ADMIN_ROLES as readonly string[]).includes(role);
}

type Application = typeof applications.$inferSelect;

/**
 * docs/permissions.md: managers see and move candidates for their OWN team
 * only. A manager's team is expressed per opportunity (hiringManagerId);
 * a manager also sees an application they've been assigned to interview.
 *
 * - "view": hiring manager or assigned interviewer.
 * - "manage" (move stages, invite, request documents, schedule...): hiring manager only.
 */
export async function canStaffAccessApplication(
  db: Database,
  user: { sub: string; role: string },
  application: Application,
  mode: "view" | "manage",
): Promise<boolean> {
  if (isRecruitmentAdmin(user.role)) return true;
  if (user.role !== "manager") return false;

  const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId) });
  if (opportunity?.hiringManagerId === user.sub) return true;
  if (mode === "manage") return false;

  const interview = await db.query.interviewRounds.findFirst({
    where: and(eq(interviewRounds.applicationId, application.id), eq(interviewRounds.interviewerId, user.sub)),
  });
  return !!interview;
}

/** Owner (the candidate) or staff allowed to view this application. */
export async function canViewApplication(db: Database, req: Request, application: Application): Promise<boolean> {
  if (application.userId === req.user!.sub) return true;
  return canStaffAccessApplication(db, req.user!, application, "view");
}

export async function getApplicationOr404(db: Database, applicationId: string): Promise<Application> {
  const application = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!application) throw new NotFoundError("Application not found");
  return application;
}

/** Throws 403 unless the caller may manage (not just view) this application as staff. */
export async function assertCanManageApplication(db: Database, req: Request, application: Application): Promise<void> {
  if (!(await canStaffAccessApplication(db, req.user!, application, "manage"))) {
    throw new ForbiddenError("You can only manage applications for opportunities where you are the hiring manager");
  }
}
