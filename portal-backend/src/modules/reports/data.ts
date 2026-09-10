import { gte, lte, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "../shared/db/client.js";

export interface DateRange {
  from?: Date;
  to?: Date;
}

function dateRangeConditions(column: AnyPgColumn, range: DateRange): SQL[] {
  const conditions: SQL[] = [];
  if (range.from) conditions.push(gte(column, range.from));
  if (range.to) conditions.push(lte(column, range.to));
  return conditions;
}

export const REPORT_KEYS = ["candidates", "applications", "assessments", "employees", "tasks", "projects", "courses", "certificates", "audit-logs"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export async function getReportRows(db: Database, key: ReportKey, range: DateRange): Promise<Record<string, unknown>[]> {
  switch (key) {
    case "candidates": {
      const rows = await db.query.users.findMany({ where: (u, { and }) => and(...dateRangeConditions(u.createdAt, range)) });
      const profiles = await db.query.candidateProfiles.findMany();
      const byUser = new Map(profiles.map((p) => [p.userId, p]));
      return rows.map((u) => ({ id: u.id, email: u.email, role: u.role, profileCompleted: byUser.get(u.id)?.profileCompleted ?? false, createdAt: u.createdAt }));
    }
    case "applications": {
      const rows = await db.query.applications.findMany({ where: (a, { and }) => and(...dateRangeConditions(a.createdAt, range)) });
      const opps = await db.query.opportunities.findMany();
      const byOpp = new Map(opps.map((o) => [o.id, o.title]));
      return rows.map((a) => ({ id: a.id, businessId: a.businessId, opportunity: byOpp.get(a.opportunityId) ?? "", status: a.status, createdAt: a.createdAt }));
    }
    case "assessments": {
      const rows = await db.query.assessmentAttempts.findMany({ where: (a, { and }) => and(...dateRangeConditions(a.createdAt, range)) });
      return rows.map((a) => ({ id: a.id, status: a.status, scorePercent: a.scorePercent, passed: a.passed, createdAt: a.createdAt }));
    }
    case "employees": {
      const rows = await db.query.employees.findMany({ where: (e, { and }) => and(...dateRangeConditions(e.createdAt, range)) });
      const depts = await db.query.departments.findMany();
      const desigs = await db.query.designations.findMany();
      const deptById = new Map(depts.map((d) => [d.id, d.name]));
      const desigById = new Map(desigs.map((d) => [d.id, d.title]));
      return rows.map((e) => ({
        id: e.id,
        businessId: e.businessId,
        employeeType: e.employeeType,
        department: e.departmentId ? deptById.get(e.departmentId) : "",
        designation: e.designationId ? desigById.get(e.designationId) : "",
        status: e.status,
        joiningDate: e.joiningDate,
      }));
    }
    case "tasks": {
      const rows = await db.query.tasks.findMany({ where: (t, { and }) => and(...dateRangeConditions(t.createdAt, range)) });
      return rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, estimateHours: t.estimateHours, actualHours: t.actualHours, dueDate: t.dueDate, createdAt: t.createdAt }));
    }
    case "projects": {
      const rows = await db.query.projects.findMany({ where: (p, { and }) => and(...dateRangeConditions(p.createdAt, range)) });
      return rows.map((p) => ({ id: p.id, title: p.title, status: p.status, createdAt: p.createdAt }));
    }
    case "courses": {
      const rows = await db.query.courses.findMany();
      const enrollments = await db.query.courseEnrollments.findMany({ where: (e, { and }) => and(...dateRangeConditions(e.enrolledAt, range)) });
      return rows.map((c) => {
        const forCourse = enrollments.filter((e) => e.courseId === c.id);
        return { id: c.id, title: c.title, status: c.status, enrolledCount: forCourse.length, completedCount: forCourse.filter((e) => e.status === "completed").length };
      });
    }
    case "certificates": {
      const rows = await db.query.certificates.findMany({ where: (c, { and }) => and(...dateRangeConditions(c.issuedAt, range)) });
      const courseRows = await db.query.courses.findMany();
      const byCourse = new Map(courseRows.map((c) => [c.id, c.title]));
      return rows.map((c) => ({ id: c.id, businessId: c.businessId, course: byCourse.get(c.courseId) ?? "", status: c.status, issuedAt: c.issuedAt }));
    }
    case "audit-logs": {
      const rows = await db.query.auditLogs.findMany({ where: (l, { and }) => and(...dateRangeConditions(l.createdAt, range)), orderBy: (l, { desc }) => [desc(l.createdAt)], limit: 1000 });
      return rows.map((l) => ({ id: l.id, actorUserId: l.actorUserId, action: l.action, entityType: l.entityType, entityId: l.entityId, createdAt: l.createdAt }));
    }
  }
}
