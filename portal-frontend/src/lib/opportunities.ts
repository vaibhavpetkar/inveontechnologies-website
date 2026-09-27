export type OpportunityKind = "job" | "internship" | "program";

export interface Opportunity {
  id: string;
  businessId: string | null;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  kind: OpportunityKind;
  durationMonths: number | null;
  stipendAmount: string | null;
  startDate: string | null;
  location: string | null;
  eligibility: Record<string, unknown>;
  hiringManagerId: string | null;
  publishedAt: string | null;
  courseCount?: number;
}

export interface LinkedCourse {
  id: string;
  title: string;
  description: string;
  status: string;
}

export const KIND_META: Record<OpportunityKind, { label: string; plural: string; tone: string; apply: string; blurb: string }> = {
  internship: { label: "Internship", plural: "Internships", tone: "violet", apply: "Apply for this internship", blurb: "Paid, hands-on work with a mentor. Training starts when you accept the offer." },
  program: { label: "Program", plural: "Programs", tone: "green", apply: "Apply to join", blurb: "A structured training program. Courses unlock as soon as you're selected." },
  job: { label: "Job", plural: "Jobs", tone: "blue", apply: "Apply now", blurb: "A full-time or contract role." },
};

export const OPPORTUNITY_ADMIN_ROLES = ["hr", "admin", "super_admin"];
export const OPPORTUNITY_PUBLISH_ROLES = ["admin", "super_admin"];

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function stipendLabel(o: Pick<Opportunity, "stipendAmount" | "kind">) {
  if (o.stipendAmount === null || o.stipendAmount === undefined) return null;
  const n = Number(o.stipendAmount);
  if (n === 0) return o.kind === "program" ? "Free" : "Unpaid";
  return `${inr.format(n)}/month`;
}

export function durationLabel(months: number | null) {
  if (!months) return null;
  return months === 1 ? "1 month" : months % 12 === 0 ? `${months / 12} year${months > 12 ? "s" : ""}` : `${months} months`;
}

export function startLabel(date: string | null) {
  if (!date) return null;
  return `Starts ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date))}`;
}
