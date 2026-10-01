import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { documentRequests } from "../shared/db/schema.js";

export const EDUCATION_LEVELS = ["10th", "12th", "diploma", "graduate", "postgraduate"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

const LEVEL_LABEL: Record<EducationLevel, string> = {
  "10th": "10th / SSC",
  "12th": "12th / Intermediate",
  diploma: "Diploma",
  graduate: "Graduation",
  postgraduate: "Post-graduation",
};

export type JoiningDocumentType = "aadhaar" | "pan" | "marksheet" | "passing_certificate" | "experience_certificate";

export interface RequiredDocument {
  documentType: JoiningDocumentType;
  documentName: string;
  note: string;
}

export interface EducationAnswers {
  educationStatus: "studying" | "completed";
  educationLevel: EducationLevel;
  experienceCompanies: string[];
}

/**
 * What the joining form asks for: Aadhaar and PAN from everyone; last
 * year's marksheet while still studying, the passing certificate once the
 * course is done; one experience certificate per previous company.
 */
export function requiredDocuments(a: EducationAnswers): RequiredDocument[] {
  const level = LEVEL_LABEL[a.educationLevel];
  const docs: RequiredDocument[] = [
    { documentType: "aadhaar", documentName: "Aadhaar card", note: "Front and back in one PDF, or a clear photo. You can mask the first 8 digits." },
    { documentType: "pan", documentName: "PAN card", note: "A clear photo or scan of your PAN card." },
    a.educationStatus === "studying"
      ? { documentType: "marksheet", documentName: `Last year's marksheet (${level})`, note: "The marksheet for the last year or semester you finished." }
      : { documentType: "passing_certificate", documentName: `Passing certificate (${level})`, note: "Your final passing certificate or degree certificate." },
  ];
  const seen = new Set<string>();
  for (const raw of a.experienceCompanies) {
    const company = raw.trim();
    if (!company || seen.has(company.toLowerCase())) continue;
    seen.add(company.toLowerCase());
    docs.push({ documentType: "experience_certificate", documentName: `Experience certificate: ${company}`, note: "The experience or relieving letter from this company." });
  }
  return docs;
}

/**
 * Brings the application's joining-form documents in line with the latest
 * answers. New ones are requested; ones no longer needed are dropped only
 * while nothing has been uploaded for them, so staff never lose a file.
 */
export async function syncJoiningDocuments(db: Database, applicationId: string, answers: EducationAnswers) {
  const wanted = requiredDocuments(answers);
  const key = (d: { documentType: string | null; documentName: string }) => `${d.documentType}|${d.documentName}`;
  const existing = await db.query.documentRequests.findMany({ where: and(eq(documentRequests.applicationId, applicationId), isNotNull(documentRequests.documentType)) });
  const have = new Set(existing.map(key));
  const want = new Set(wanted.map(key));

  const stale = existing.filter((d) => !want.has(key(d)) && d.status === "requested").map((d) => d.id);
  if (stale.length) await db.delete(documentRequests).where(inArray(documentRequests.id, stale));

  const added = wanted.filter((d) => !have.has(key(d)));
  // A millisecond apart, so they list in the order above (Aadhaar first).
  const now = Date.now();
  if (added.length) await db.insert(documentRequests).values(added.map((d, i) => ({ applicationId, ...d, createdAt: new Date(now + i), updatedAt: new Date(now + i) })));
  return { added: added.length, removed: stale.length };
}
