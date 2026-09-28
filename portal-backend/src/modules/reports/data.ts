import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { todayIst, workingDays } from "../attendance/service.js";
import type { ReportKey } from "./columns.js";

export { REPORT_KEYS, type ReportKey } from "./columns.js";

export interface DateRange {
  from?: Date;
  to?: Date;
}

const nameOf = (u: string, cp: string) => sql.raw(`coalesce(${u}.full_name, ${cp}.full_name, initcap(replace(split_part(${u}.email, '@', 1), '.', ' ')))`);

function within(column: string, range: DateRange): SQL {
  const parts: SQL[] = [sql`true`];
  if (range.from) parts.push(sql`${sql.raw(column)} >= ${range.from}`);
  if (range.to) parts.push(sql`${sql.raw(column)} <= ${range.to}`);
  return sql.join(parts, sql` AND `);
}

const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

async function rows(db: Database, query: SQL) {
  return (await db.execute<Record<string, unknown>>(query)).rows;
}

export async function getReportRows(db: Database, key: ReportKey, range: DateRange): Promise<Record<string, unknown>[]> {
  switch (key) {
    case "candidates":
      // Candidates only: this report is visible to HR, and must not list staff accounts.
      return rows(db, sql`
        SELECT u.id, u.role, ${nameOf("u", "cp")} AS name, u.email, cp.phone, coalesce(cp.profile_completed, false) AS "profileCompleted",
               (SELECT count(*)::int FROM applications a WHERE a.user_id = u.id) AS applications, u.created_at AS "createdAt"
        FROM users u LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE u.role = 'candidate' AND ${within("u.created_at", range)}
        ORDER BY u.created_at DESC`);
    case "applications":
      return rows(db, sql`
        SELECT a.id, a.business_id AS "businessId", ${nameOf("u", "cp")} AS candidate, u.email, o.title AS opening, o.kind, a.status, a.created_at AS "createdAt"
        FROM applications a JOIN users u ON u.id = a.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id JOIN opportunities o ON o.id = a.opportunity_id
        WHERE ${within("a.created_at", range)}
        ORDER BY a.created_at DESC`);
    case "assessments":
      return rows(db, sql`
        SELECT t.id, ${nameOf("u", "cp")} AS candidate, o.title AS opening, s.title AS exam, s.language, t.status, t.score_percent AS "scorePercent", t.passed, t.submitted_at AS "submittedAt", t.created_at AS "createdAt"
        FROM assessment_attempts t JOIN assessments s ON s.id = t.assessment_id JOIN applications a ON a.id = t.application_id
        JOIN users u ON u.id = a.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id JOIN opportunities o ON o.id = a.opportunity_id
        WHERE ${within("t.created_at", range)}
        ORDER BY t.created_at DESC`);
    case "employees":
      return rows(db, sql`
        SELECT e.id, e.business_id AS "businessId", ${nameOf("u", "cp")} AS name, u.email, e.employee_type AS "employeeType", d.name AS department, g.title AS designation,
               ${nameOf("mu", "mcp")} AS manager, e.status, e.joining_date AS "joiningDate"
        FROM employees e JOIN users u ON u.id = e.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id
        LEFT JOIN users mu ON mu.id = e.manager_id LEFT JOIN candidate_profiles mcp ON mcp.user_id = mu.id
        WHERE ${within("e.created_at", range)}
        ORDER BY e.seq_number`);
    case "attendance": {
      const today = todayIst();
      const from = range.from ? istDate(range.from) : `${today.slice(0, 8)}01`;
      let to = range.to ? istDate(range.to) : today;
      if (to < from) to = from;
      const days = await workingDays(db, from, to);
      const staff = await rows(db, sql`
        SELECT e.id, e.business_id AS "businessId", ${nameOf("u", "cp")} AS name, to_char(e.joining_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS joined
        FROM employees e JOIN users u ON u.id = e.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE e.status <> 'offboarded' ORDER BY name`);
      const marks = await rows(db, sql`SELECT employee_id AS "employeeId", date::text AS date, status, work_mode AS "workMode" FROM attendance_records WHERE date BETWEEN ${from} AND ${to}`);
      const leave = await rows(db, sql`SELECT employee_id AS "employeeId", start_date::text AS s, end_date::text AS e, half_day AS half FROM leave_requests WHERE status = 'approved' AND start_date <= ${to} AND end_date >= ${from}`);
      return staff.map((p) => {
        const mine = days.filter((d) => d >= String(p.joined));
        const recs = new Map(marks.filter((m) => m.employeeId === p.id).map((m) => [m.date as string, m]));
        const myLeave = leave.filter((l) => l.employeeId === p.id);
        let present = 0, halfDays = 0, absent = 0, leaveDays = 0, unrecorded = 0, remoteDays = 0;
        for (const d of mine) {
          const l = myLeave.find((x) => String(x.s) <= d && String(x.e) >= d);
          const r = recs.get(d);
          if (r?.workMode === "remote") remoteDays++;
          if (l) {
            leaveDays += l.half ? 0.5 : 1;
            if (l.half && r) present += 0.5;
          } else if (!r) unrecorded++;
          else if (r.status === "present") present++;
          else if (r.status === "half_day") halfDays++;
          else absent++;
        }
        return { id: p.id, businessId: p.businessId, name: p.name, from, to, workingDays: mine.length, present, halfDays, absent, leaveDays, unrecorded, remoteDays };
      });
    }
    case "leave":
      return rows(db, sql`
        SELECT l.id, e.business_id AS "businessId", ${nameOf("u", "cp")} AS name, l.leave_type AS "leaveType", l.start_date::text AS "startDate", l.end_date::text AS "endDate",
               l.days::float AS days, l.status, l.reason, ${nameOf("du", "dcp")} AS "decidedBy", l.decided_at AS "decidedAt"
        FROM leave_requests l JOIN employees e ON e.id = l.employee_id JOIN users u ON u.id = e.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        LEFT JOIN users du ON du.id = l.decided_by LEFT JOIN candidate_profiles dcp ON dcp.user_id = du.id
        WHERE ${range.from ? sql`l.end_date >= ${istDate(range.from)}` : sql`true`} AND ${range.to ? sql`l.start_date <= ${istDate(range.to)}` : sql`true`}
        ORDER BY l.start_date DESC`);
    case "payroll":
      return rows(db, sql`
        SELECT p.id, p.period, e.business_id AS "businessId", ${nameOf("u", "cp")} AS name, p.payable_days::float AS "payableDays", p.lop_days::float AS "lopDays",
               p.gross::float AS gross, p.total_deductions::float AS deductions, p.net::float AS net, p.status
        FROM payslips p JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE ${range.from ? sql`p.period >= ${istDate(range.from).slice(0, 7)}` : sql`true`} AND ${range.to ? sql`p.period <= ${istDate(range.to).slice(0, 7)}` : sql`true`}
        ORDER BY p.period DESC, name`);
    case "tasks":
      return rows(db, sql`
        SELECT t.id, t.title, pr.title AS project, ${nameOf("u", "cp")} AS assignee, t.status, t.priority, t.estimate_hours AS "estimateHours", t.actual_hours AS "actualHours",
               t.due_date AS "dueDate", t.created_at AS "createdAt"
        FROM tasks t LEFT JOIN projects pr ON pr.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE ${within("t.created_at", range)}
        ORDER BY t.created_at DESC`);
    case "projects":
      return rows(db, sql`
        SELECT p.id, p.title, ${nameOf("u", "cp")} AS owner, p.status,
               (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS tasks,
               (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done, p.created_at AS "createdAt"
        FROM projects p LEFT JOIN users u ON u.id = p.owner_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE ${within("p.created_at", range)}
        ORDER BY p.created_at DESC`);
    case "courses":
      return rows(db, sql`
        SELECT c.id, c.title, c.status,
               count(ce.id)::int AS "enrolledCount", count(ce.id) FILTER (WHERE ce.status = 'completed')::int AS "completedCount"
        FROM courses c LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ${within("ce.enrolled_at", range)}
        GROUP BY c.id ORDER BY c.title`);
    case "certificates":
      return rows(db, sql`
        SELECT c.id, c.business_id AS "businessId", ${nameOf("u", "cp")} AS recipient, co.title AS course, c.status, c.issued_at AS "issuedAt"
        FROM certificates c JOIN users u ON u.id = c.user_id LEFT JOIN candidate_profiles cp ON cp.user_id = u.id LEFT JOIN courses co ON co.id = c.course_id
        WHERE ${within("c.issued_at", range)}
        ORDER BY c.issued_at DESC`);
    case "audit-logs":
      return rows(db, sql`
        SELECT l.id, l.created_at AS "createdAt", coalesce(u.email, 'System') AS actor, l.action, l.entity_type AS "entityType", l.entity_id AS "entityId"
        FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
        WHERE ${within("l.created_at", range)}
        ORDER BY l.created_at DESC LIMIT 1000`);
  }
}
