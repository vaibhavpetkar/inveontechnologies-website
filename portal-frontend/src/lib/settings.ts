import type { UserRole } from "../context/AuthContext";

/** Who can open Settings (HR reads, admins edit; the API decides with canEdit). */
export const SETTINGS_ROLES: UserRole[] = ["hr", "admin", "super_admin"];

export type SettingsTab = "company" | "structure" | "fees" | "email" | "email-log" | "offers";

export const SETTINGS_TABS: { id: SettingsTab; path: string; label: string }[] = [
  { id: "company", path: "/settings", label: "Company details" },
  { id: "structure", path: "/settings/structure", label: "Team structure" },
  { id: "fees", path: "/settings/fees", label: "Internship fees" },
  { id: "email", path: "/settings/email", label: "Email" },
  { id: "email-log", path: "/settings/email-log", label: "Email log" },
  { id: "offers", path: "/settings/offers", label: "Internship offers" },
];

export function tabFromParam(param: string | undefined): SettingsTab {
  return SETTINGS_TABS.find((t) => t.id === param && t.id !== "company")?.id ?? "company";
}

// ---- Company details ----

export interface Signatory {
  name: string;
  title: string;
}

export interface CompanyProfile {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  signatories: Signatory[];
  projectManager: Signatory | null;
  logo: string | null;
  seal: string | null;
  watermark: boolean;
}

export interface BrandPreviews {
  logo: string | null;
  seal: string | null;
}

/** The API rejects images over ~1 MB once base64-encoded (1.4M chars). */
export const MAX_IMAGE_BYTES = 1_000_000;

/** Reads a PNG or JPEG the person picked as a data URL, or explains why it can't be used. */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg"].includes(file.type)) return reject(new Error("Use a PNG or JPEG image."));
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error(`That image is ${(file.size / 1_000_000).toFixed(1)} MB. Use one under 1 MB.`));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

// ---- Internship fees ----

export type WorkMode = "Remote" | "Office" | "Hybrid";
export const WORK_MODES: WorkMode[] = ["Remote", "Office", "Hybrid"];

export interface OfferTerms {
  studentFee: number;
  graduateFee: number;
  workMode: WorkMode;
  durationMonths: number;
}

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const money = (n: number) => rupees.format(n);

// ---- Email ----

export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  hasPassword: boolean;
  saved: boolean;
}

export interface MailStatus {
  source: "settings" | "environment";
  sending: boolean;
  host: string | null;
  port: number | null;
  from: string;
  replyTo: string | null;
  lastCheck: { ok: boolean; error: string | null; at: string } | null;
}

export interface MailCheck {
  ok: boolean;
  error?: string | null;
}

// ---- Email log ----

export type EmailStatus = "sent" | "failed" | "logged";

export interface EmailLogRow {
  id: string;
  toEmail: string;
  subject: string;
  kind: string;
  refId: string | null;
  status: EmailStatus;
  error: string | null;
  body: string | null;
  attachments: string[];
  triggeredBy: string | null;
  createdAt: string;
  canResend: boolean;
}

export const EMAIL_STATUS: Record<EmailStatus, { label: string; tone: string }> = {
  sent: { label: "Sent", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  logged: { label: "Not sent (no mail server)", tone: "slate" },
};

export const EMAIL_KINDS: Record<string, string> = {
  appointment_letter: "Appointment letter",
  internship_offer: "Internship offer",
  policies: "Company policies",
  notification: "Notification",
  digest: "Daily digest",
  calendar: "Calendar invite",
  auth: "Sign-in and password",
  welcome: "Welcome",
  test: "Test email",
  employee_of_month: "Employee of the month",
  assessment_invite: "Assessment invite",
  certificate: "Certificate",
  general: "General",
};

export const kindLabel = (kind: string) => EMAIL_KINDS[kind] ?? kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// ---- Send documents ----

export interface AvailableDocuments {
  person: { id: string; email: string; name: string };
  appointmentLetter: { id: string; referenceNo: string; version: number; emailedAt: string | null } | null;
  internshipOffer: { id: string; referenceNo: string; emailedAt: string | null } | null;
  policies: { slug: string; title: string; version: number }[];
}

// ---- Internship offers ----

export type PaymentStatus = "awaiting_choice" | "trial" | "trial_expired" | "paid" | "waived" | "cancelled";

export interface InternshipOffer {
  id: string;
  referenceNo: string;
  userId: string;
  name: string;
  email: string;
  track: { title: string; slug: string };
  examScore: number | string | null;
  fee: number;
  feeCategory: "student" | "graduate" | null;
  workMode: WorkMode;
  joiningDate: string | null;
  endDate: string | null;
  issuedAt: string;
  emailedAt: string | null;
  paymentStatus: PaymentStatus | null;
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  awaiting_choice: { label: "Not paid yet", tone: "amber" },
  trial: { label: "On free trial", tone: "blue" },
  trial_expired: { label: "Trial ended", tone: "rose" },
  paid: { label: "Paid", tone: "green" },
  waived: { label: "Fee waived", tone: "violet" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

/** Once the fee is paid, waived or cancelled, the API refuses to change it. */
export const isSettled = (status: PaymentStatus | null) => status === "paid" || status === "waived" || status === "cancelled";

/** "2026-01-05" as "5 Jan 2026", without the time-zone shift `new Date("2026-01-05")` causes. */
export function formatDay(day: string | null) {
  if (!day) return "Not set";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Adds whole months to a YYYY-MM-DD date. */
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "3 minutes ago", "yesterday", or a date for anything older than a week. */
export function relativeTime(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 2 * 86_400) return "yesterday";
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const fullTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
