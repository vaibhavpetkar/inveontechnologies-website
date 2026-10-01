import { authedFetch } from "./files";
import { ApiError } from "./api";
import type { EmployeeType } from "./people";

export interface AppointmentDetails {
  name: string;
  email: string;
  employeeId: string;
  employeeType: EmployeeType;
  designation: string;
  department: string;
  joiningDate: string;
  endDate: string | null;
  durationMonths: number | null;
  reportingTo: string | null;
  workLocation: string;
  workHours: string;
  monthlyPay: number | null;
  probationMonths: number | null;
  noticeDays: number;
  additionalTerms: string | null;
}

export interface AppointmentLetter {
  id: string;
  version: number;
  referenceNo: string;
  details: AppointmentDetails;
  policies: { id: string; slug: string; title: string; version: number }[];
  signatoryName: string;
  signatoryTitle: string;
  issuedBy: string | null;
  generatedAt: string;
  emailedTo: string | null;
  emailedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
}

export interface Policy {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  version: number;
  active: boolean;
  updatedAt: string;
}

export const ISSUER_ROLES = ["admin", "super_admin"];

/**
 * Opens a PDF the API serves (it needs the bearer token, so a plain link
 * won't do). The tab opens before the fetch so popup blockers allow it.
 */
export async function openPdf(path: string, accessToken: string | null) {
  const tab = window.open("", "_blank");
  try {
    const res = await authedFetch(path, accessToken);
    if (!res.ok) throw new ApiError(res.status === 403 ? "FORBIDDEN" : "NOT_FOUND", res.status === 403 ? "You can't open this document." : "That document isn't available.", res.status);
    const href = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = href;
    else window.location.href = href;
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Splits the plain policy format into headings, paragraphs and bullet lists for display. */
export function policySections(body: string): ({ kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] })[] {
  const out: ({ kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] })[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) out.push({ kind: "p", text: para.join(" ") });
      if (list.length) out.push({ kind: "ul", items: list });
      para = [];
      list = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        out.push({ kind: "h", text: line.slice(3) });
      } else if (/^[-*] /.test(line)) {
        if (para.length) {
          out.push({ kind: "p", text: para.join(" ") });
          para = [];
        }
        list.push(line.slice(2));
      } else {
        if (list.length) {
          out.push({ kind: "ul", items: list });
          list = [];
        }
        para.push(line);
      }
    }
    flush();
  }
  return out;
}
