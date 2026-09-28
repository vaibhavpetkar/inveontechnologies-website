export interface Column {
  key: string;
  label: string;
  /** "label" is a stored value like "in_review", shown as "In review". */
  type?: "text" | "label" | "number" | "money" | "date" | "datetime" | "boolean";
}

export interface ReportDef {
  title: string;
  description: string;
  /** Admin and super admin only (personal data, audit trail). Others are for HR too. */
  sensitive?: boolean;
  columns: Column[];
}

const t = (key: string, label: string, type: Column["type"] = "text"): Column => ({ key, label, type });

export const REPORTS = {
  candidates: {
    title: "Candidates",
    description: "Everyone who registered as a candidate, with how many times they applied.",
    columns: [t("name", "Name"), t("email", "Email"), t("phone", "Phone"), t("profileCompleted", "Profile complete", "boolean"), t("applications", "Applications", "number"), t("createdAt", "Registered", "datetime")],
  },
  applications: {
    title: "Applications",
    description: "Each application with the opening and where it stands.",
    columns: [t("businessId", "Application ID"), t("candidate", "Candidate"), t("email", "Email"), t("opening", "Opening"), t("kind", "Type", "label"), t("status", "Status", "label"), t("createdAt", "Applied", "datetime")],
  },
  assessments: {
    title: "Exam results",
    description: "Language exam attempts with scores.",
    columns: [t("candidate", "Candidate"), t("opening", "Opening"), t("exam", "Exam"), t("language", "Language"), t("status", "Status", "label"), t("scorePercent", "Score %", "number"), t("passed", "Passed", "boolean"), t("submittedAt", "Submitted", "datetime")],
  },
  employees: {
    title: "Employees",
    description: "Everyone on the team with their role, manager and joining date.",
    sensitive: true,
    columns: [t("businessId", "Employee ID"), t("name", "Name"), t("email", "Email"), t("employeeType", "Type", "label"), t("department", "Department"), t("designation", "Designation"), t("manager", "Manager"), t("status", "Status", "label"), t("joiningDate", "Joined", "date")],
  },
  attendance: {
    title: "Attendance summary",
    description: "Per person over the dates chosen (this month by default): days present, on leave or absent.",
    columns: [t("businessId", "Employee ID"), t("name", "Name"), t("workingDays", "Working days", "number"), t("present", "Present", "number"), t("halfDays", "Half days", "number"), t("absent", "Absent", "number"), t("leaveDays", "On leave", "number"), t("unrecorded", "No record", "number"), t("remoteDays", "Remote", "number")],
  },
  leave: {
    title: "Leave",
    description: "Leave requests starting in the dates chosen.",
    columns: [t("businessId", "Employee ID"), t("name", "Name"), t("leaveType", "Type", "label"), t("startDate", "From", "date"), t("endDate", "To", "date"), t("days", "Days", "number"), t("status", "Status", "label"), t("reason", "Reason"), t("decidedBy", "Decided by"), t("decidedAt", "Decided", "datetime")],
  },
  payroll: {
    title: "Payroll",
    description: "Payslips for the months in the dates chosen.",
    columns: [t("period", "Month"), t("businessId", "Employee ID"), t("name", "Name"), t("payableDays", "Paid days", "number"), t("lopDays", "LOP days", "number"), t("gross", "Gross", "money"), t("deductions", "Deductions", "money"), t("net", "Net", "money"), t("status", "Status", "label")],
  },
  tasks: {
    title: "Tasks",
    description: "Tasks with project, assignee, hours and due date.",
    columns: [t("title", "Task"), t("project", "Project"), t("assignee", "Assignee"), t("status", "Status", "label"), t("priority", "Priority", "label"), t("estimateHours", "Estimate (h)", "number"), t("actualHours", "Actual (h)", "number"), t("dueDate", "Due", "date"), t("createdAt", "Created", "datetime")],
  },
  projects: {
    title: "Projects",
    description: "Projects with owner and task progress.",
    columns: [t("title", "Project"), t("owner", "Owner"), t("status", "Status", "label"), t("tasks", "Tasks", "number"), t("done", "Done", "number"), t("createdAt", "Created", "datetime")],
  },
  courses: {
    title: "Courses",
    description: "Courses with enrollments and completions in the dates chosen.",
    columns: [t("title", "Course"), t("status", "Status", "label"), t("enrolledCount", "Enrolled", "number"), t("completedCount", "Completed", "number")],
  },
  certificates: {
    title: "Course certificates",
    description: "Certificates issued for completed courses.",
    columns: [t("businessId", "Certificate ID"), t("recipient", "Recipient"), t("course", "Course"), t("status", "Status", "label"), t("issuedAt", "Issued", "datetime")],
  },
  "audit-logs": {
    title: "Audit log",
    description: "Sensitive actions, newest first (last 1000).",
    sensitive: true,
    columns: [t("createdAt", "When", "datetime"), t("actor", "Who"), t("action", "Action"), t("entityType", "Record"), t("entityId", "Record ID")],
  },
} satisfies Record<string, ReportDef>;

export type ReportKey = keyof typeof REPORTS;
export const REPORT_KEYS = Object.keys(REPORTS) as [ReportKey, ...ReportKey[]];

const humanize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : v);

/** Stored values ("assessment_completed", "full_time") made readable for people. */
export function readable(key: ReportKey, rows: Record<string, unknown>[]) {
  const labels = (REPORTS[key].columns as Column[]).filter((c) => c.type === "label").map((c) => c.key);
  if (labels.length === 0) return rows;
  return rows.map((r) => {
    const out = { ...r };
    for (const k of labels) if (typeof out[k] === "string") out[k] = humanize(out[k] as string);
    return out;
  });
}
