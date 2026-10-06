import type { StoredFile } from "./files";
export type EnrollmentStatus = "awaiting_choice" | "trial" | "trial_expired" | "paid" | "waived" | "cancelled";

export interface JoiningDetails {
  fullName: string;
  phone: string;
  dateOfBirth?: string | null;
  address: string;
  city: string;
  college?: string | null;
  degree?: string | null;
  graduationYear?: number | null;
  educationStatus?: EducationStatus;
  educationLevel?: EducationLevel;
  experienceCompanies?: string[];
  githubUsername?: string | null;
  linkedinUrl?: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  preferredStartDate: string;
  hoursPerWeek: number;
  preferredSlots: SlotKey[];
  notes?: string | null;
}

export type EducationStatus = "studying" | "completed";
export type EducationLevel = "10th" | "12th" | "diploma" | "graduate" | "postgraduate";
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  "10th": "10th / SSC",
  "12th": "12th / Intermediate",
  diploma: "Diploma",
  graduate: "Graduation",
  postgraduate: "Post-graduation",
};

/** The documents the joining form will ask for. Mirrors the server's joining-documents.ts. */
export function documentsFor(d: Pick<JoiningDetails, "educationStatus" | "educationLevel" | "experienceCompanies">): string[] {
  const docs = ["Aadhaar card", "PAN card"];
  if (d.educationStatus && d.educationLevel) {
    const level = EDUCATION_LEVEL_LABELS[d.educationLevel];
    docs.push(d.educationStatus === "studying" ? `Last year's marksheet (${level})` : `Passing certificate (${level})`);
  }
  const seen = new Set<string>();
  for (const raw of d.experienceCompanies ?? []) {
    const c = raw.trim();
    if (c.length < 2 || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    docs.push(`Experience certificate: ${c}`);
  }
  return docs;
}

export type SlotKey = "weekday_morning" | "weekday_afternoon" | "weekday_evening" | "weekend";
export const SLOT_LABELS: Record<SlotKey, string> = {
  weekday_morning: "Weekday mornings",
  weekday_afternoon: "Weekday afternoons",
  weekday_evening: "Weekday evenings",
  weekend: "Weekends",
};

export interface Enrollment {
  id: string;
  applicationId: string;
  userId: string;
  opportunityId: string;
  status: EnrollmentStatus;
  amount: string;
  trialHours: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  paidAt: string | null;
  paymentNote: string | null;
  joiningDetails: JoiningDetails | null;
  joiningSubmittedAt: string | null;
}

export interface InterviewRound {
  id: string;
  roundNumber: number;
  interviewerId: string;
  scheduledAt: string;
  timezone: string;
  meetingUrl: string | null;
  subject?: string | null;
  kind?: "interview" | "exam" | "hr";
  durationMinutes?: number;
  meetingProvider?: "manual" | "google_meet" | "zoom";
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  decision?: "pass" | "fail" | "hold" | null;
  feedback?: string | null;
}

export interface Session {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  joinUrl: string | null;
  location: string | null;
}

export interface DocumentRequest {
  id: string;
  documentName: string;
  /** Set when the joining form asked for it; null when staff asked by hand. */
  documentType: "aadhaar" | "pan" | "marksheet" | "passing_certificate" | "experience_certificate" | null;
  status: "requested" | "uploaded" | "verified" | "rejected";
  fileUrl: string | null;
  file: StoredFile | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Journey {
  candidate: { email: string; fullName: string | null; phone: string | null; resume: StoredFile | null } | null;
  documents: DocumentRequest[];
  application: { id: string; status: string; businessId: string | null; createdAt: string; userId: string };
  opportunity: { id: string; title: string; kind: string; programFee: number | null; trialHours: number } | null;
  exam: { id: string; status: string; scorePercent: number | null; passed: boolean | null; submittedAt: string | null; language: string | null; title: string }[];
  interviews: InterviewRound[];
  enrollment: Enrollment | null;
  payments: { enabled: boolean; mode: "sandbox" | "production" | null; orders: { id: string; orderId: string; amount: string; status: string; createdAt: string }[] };
  sessions: Session[];
  employee?: { id: string; businessId: string | null; employeeType: string; joiningDate: string; durationMonths: number | null; status: string } | null;
}

export const ENROLLMENT_LABELS: Record<EnrollmentStatus, string> = {
  awaiting_choice: "Payment due",
  trial: "On free trial",
  trial_expired: "Trial ended",
  paid: "Paid",
  waived: "No fee",
  cancelled: "Cancelled",
};

export const rupees = (n: number | string) => `₹${Number(n).toLocaleString("en-IN")}`;

export function timeLeft(until: string, now = Date.now()) {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

/** Loads Cashfree's checkout script once and opens the hosted checkout for a payment session. */
declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => { checkout: (opts: { paymentSessionId: string; redirectTarget?: "_self" | "_blank" | "_modal" }) => Promise<unknown> };
  }
}
let loader: Promise<void> | null = null;
function loadCashfree() {
  if (window.Cashfree) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error("Couldn't load the payment page. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export async function openCashfreeCheckout(paymentSessionId: string, mode: "sandbox" | "production") {
  await loadCashfree();
  if (!window.Cashfree) throw new Error("Couldn't load the payment page.");
  await window.Cashfree({ mode }).checkout({ paymentSessionId, redirectTarget: "_self" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
