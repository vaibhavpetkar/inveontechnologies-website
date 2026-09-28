import { API_BASE } from "./api";

export interface SalaryComponent {
  name: string;
  amount: number;
  kind: "earning" | "deduction";
}

export interface PayrollRow {
  id: string;
  /** Loss-of-pay days that month's unpaid leave and absences add up to. */
  leaveLopDays?: number;
  businessId: string | null;
  employeeType: "intern" | "full_time" | "contract";
  status: string;
  joiningDate: string;
  name: string;
  email: string;
  designation: string | null;
  slipId: string | null;
  slipStatus: "draft" | "published" | null;
  gross: string | null;
  totalDeductions: string | null;
  net: string | null;
  lopDays: string | null;
  payableDays: string | null;
  daysInMonth: number | null;
  salary: { effectiveFrom: string; components: SalaryComponent[]; gross: number; net: number } | null;
}

export interface Payslip {
  id: string;
  period: string;
  periodLabel: string;
  status: "draft" | "published";
  daysInMonth: number;
  payableDays: string;
  lopDays: string;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: string;
  totalDeductions: string;
  net: string;
  publishedAt: string | null;
  employee?: { name: string; businessId: string | null; designation: string | null; department: string | null; joiningDate: string };
}

export interface EmploymentCertificate {
  id: string;
  businessId: string | null;
  verificationCode: string;
  kind: "internship_completion" | "experience";
  roleTitle: string;
  fromDate: string;
  toDate: string;
  status: "issued" | "revoked";
  issuedAt: string;
  issuedBy: string | null;
}

export const CERT_LABELS: Record<EmploymentCertificate["kind"], string> = {
  internship_completion: "Internship completion certificate",
  experience: "Experience certificate",
};

export const inr = (n: number | string | null | undefined) =>
  n === null || n === undefined ? "–" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function periodOf(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftPeriod(period: string, by: number) {
  const [y, m] = period.split("-").map(Number);
  return periodOf(new Date(y, m - 1 + by, 1));
}

export function periodName(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export const STARTER_COMPONENTS: SalaryComponent[] = [
  { name: "Basic", amount: 0, kind: "earning" },
  { name: "HRA", amount: 0, kind: "earning" },
  { name: "Special allowance", amount: 0, kind: "earning" },
  { name: "Provident fund", amount: 0, kind: "deduction" },
  { name: "Professional tax", amount: 200, kind: "deduction" },
];

/** Downloads an authenticated file (the API needs the bearer token, so a plain link won't do). */
export async function downloadWithAuth(path: string, accessToken: string | null, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const certificatePdfUrl = (code: string) => `${API_BASE}/api/v1/certificates/verify/${code}/pdf`;
