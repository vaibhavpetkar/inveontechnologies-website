export type EmployeeType = "intern" | "full_time" | "contract";
export type EmployeeStatus = "preboarding" | "active" | "on_leave" | "offboarded";

export interface Person {
  id: string;
  userId: string;
  businessId: string | null;
  email: string;
  name: string;
  role: string;
  employeeType: EmployeeType;
  status: EmployeeStatus;
  portalAccessActive: boolean;
  joiningDate: string;
  department: string | null;
  designation: string | null;
  managerId: string | null;
  managerName: string | null;
  tasksTotal: number;
  tasksDone: number;
  requiredOpen: number;
}

export interface ChecklistItem {
  id: string;
  taskType: "policy_consent" | "access_activation" | "document" | "custom";
  title: string;
  description: string | null;
  required: boolean;
  status: "pending" | "completed";
  completedAt: string | null;
}

export const TYPE_LABELS: Record<EmployeeType, string> = { intern: "Intern", full_time: "Full-time", contract: "Contract" };

export const STATUS_META: Record<EmployeeStatus, { label: string; tone: string }> = {
  preboarding: { label: "Onboarding", tone: "amber" },
  active: { label: "Active", tone: "green" },
  on_leave: { label: "On leave", tone: "violet" },
  offboarded: { label: "Left", tone: "slate" },
};

export function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Where someone is in onboarding, in words. */
export function onboardingStage(p: Person): { label: string; tone: string } {
  if (p.portalAccessActive) return { label: "Access active", tone: "green" };
  if (p.requiredOpen === 0) return { label: "Ready to activate", tone: "blue" };
  return { label: `${p.requiredOpen} step${p.requiredOpen === 1 ? "" : "s"} left`, tone: "amber" };
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ---- Spreadsheet import ----

/** Minimal CSV parser: commas, quoted fields with "" escapes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

// Spreadsheet headers people actually write, mapped to invite fields.
const HEADER_ALIASES: Record<string, string> = {
  email: "email", "email address": "email", "e-mail": "email",
  name: "fullName", "full name": "fullName", fullname: "fullName",
  type: "employeeType", "employee type": "employeeType", "employment type": "employeeType",
  role: "role", "portal role": "role",
  department: "departmentName", dept: "departmentName",
  designation: "designationTitle", title: "designationTitle", "job title": "designationTitle", position: "designationTitle",
  manager: "managerEmail", "manager email": "managerEmail", "reports to": "managerEmail",
  "joining date": "joiningDate", "start date": "joiningDate", joining: "joiningDate", "date of joining": "joiningDate", doj: "joiningDate",
  duration: "durationMonths", "duration months": "durationMonths", "duration (months)": "durationMonths", months: "durationMonths",
};

const TYPE_ALIASES: Record<string, EmployeeType> = { intern: "intern", internship: "intern", "full time": "full_time", "full-time": "full_time", full_time: "full_time", fulltime: "full_time", permanent: "full_time", employee: "full_time", contract: "contract", contractor: "contract", consultant: "contract" };

/** Turns parsed CSV into invite rows; unknown columns are ignored. */
export function rowsToInvites(table: string[][]): { rows: Record<string, string>[]; unknownHeaders: string[] } {
  const [header, ...body] = table;
  if (!header) return { rows: [], unknownHeaders: [] };
  const keys = header.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  const unknownHeaders = header.filter((_, i) => !keys[i]).map((h) => h.trim()).filter(Boolean);
  const rows = body.map((cells) => {
    const r: Record<string, string> = {};
    keys.forEach((k, i) => {
      const v = (cells[i] ?? "").trim();
      if (!k || !v) return;
      r[k] = k === "employeeType" ? TYPE_ALIASES[v.toLowerCase()] ?? v : k === "role" ? v.toLowerCase() : v;
    });
    return r;
  });
  return { rows, unknownHeaders };
}

export const CSV_TEMPLATE = "email,name,type,department,designation,manager email,joining date,duration months\nasha.rao@example.com,Asha Rao,intern,Engineering,Frontend Intern,priya.sharma@inveon.test,2026-10-05,6\n";
