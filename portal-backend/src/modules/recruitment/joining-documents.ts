import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
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
  let existing = await db.query.documentRequests.findMany({ where: and(eq(documentRequests.applicationId, applicationId), isNotNull(documentRequests.documentType)) });

  // HR may already have asked for the same document by hand (say "Aadhaar card" before the form was
  // filled in). Take that request over instead of asking the candidate for it twice; an automatic
  // request for it that nobody has uploaded to yet gives way.
  const manual = await db.query.documentRequests.findMany({ where: and(eq(documentRequests.applicationId, applicationId), isNull(documentRequests.documentType)) });
  let adopted = 0;
  for (const d of wanted) {
    const auto = existing.find((e) => key(e) === key(d));
    if (auto && auto.status !== "requested") continue;
    const match = manual.find((m) => sameDocument(m.documentName, d));
    if (!match) continue;
    manual.splice(manual.indexOf(match), 1);
    if (auto) await db.delete(documentRequests).where(eq(documentRequests.id, auto.id));
    const [row] = await db.update(documentRequests).set({ documentType: d.documentType, documentName: d.documentName, updatedAt: new Date() }).where(eq(documentRequests.id, match.id)).returning();
    existing = [...existing.filter((e) => e.id !== auto?.id), row];
    adopted++;
  }

  const have = new Set(existing.map(key));
  const want = new Set(wanted.map(key));

  const stale = existing.filter((d) => !want.has(key(d)) && d.status === "requested").map((d) => d.id);
  if (stale.length) await db.delete(documentRequests).where(inArray(documentRequests.id, stale));

  const added = wanted.filter((d) => !have.has(key(d)));
  // A millisecond apart, so they list in the order above (Aadhaar first).
  const now = Date.now();
  if (added.length) await db.insert(documentRequests).values(added.map((d, i) => ({ applicationId, ...d, createdAt: new Date(now + i), updatedAt: new Date(now + i) })));
  return { added: added.length, removed: stale.length, adopted };
}

const SAME_NAME: Partial<Record<JoiningDocumentType, RegExp>> = {
  aadhaar: /\baadh?aa?r\b/i,
  pan: /\bpan\b/i,
};

/** Whether a document HR named by hand is the one the joining form wants. */
function sameDocument(name: string, doc: RequiredDocument) {
  const pattern = SAME_NAME[doc.documentType];
  if (pattern) return pattern.test(name);
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(name) === norm(doc.documentName);
}
