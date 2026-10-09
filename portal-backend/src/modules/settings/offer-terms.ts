import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../shared/db/client.js";
import { candidateProfiles, portalSettings } from "../shared/db/schema.js";

/**
 * What every internship offer letter starts from: the fee for a currently
 * pursuing student and for a graduate, the usual work mode and length.
 * Admins edit these in Settings; each offer keeps the values it was issued
 * with, and staff can change one offer before it is paid.
 */
const OFFER_TERMS_KEY = "internship_offer_terms";

export const offerTermsSchema = z.object({
  studentFee: z.number().min(0).max(1_000_000),
  graduateFee: z.number().min(0).max(1_000_000),
  workMode: z.enum(["Remote", "Office", "Hybrid"]),
  durationMonths: z.number().int().min(1).max(24),
});
export type OfferTerms = z.infer<typeof offerTermsSchema>;

export const DEFAULT_OFFER_TERMS: OfferTerms = { studentFee: 3000, graduateFee: 5000, workMode: "Remote", durationMonths: 6 };

export async function getOfferTerms(db: Database): Promise<OfferTerms> {
  const row = await db.query.portalSettings.findFirst({ where: eq(portalSettings.key, OFFER_TERMS_KEY) });
  const parsed = offerTermsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_OFFER_TERMS;
}

export async function saveOfferTerms(db: Database, terms: OfferTerms, actorUserId: string) {
  await db
    .insert(portalSettings)
    .values({ key: OFFER_TERMS_KEY, value: terms, updatedBy: actorUserId })
    .onConflictDoUpdate({ target: portalSettings.key, set: { value: terms, updatedBy: actorUserId, updatedAt: new Date() } });
  return terms;
}

/**
 * A candidate whose graduation year is this year or later is still studying.
 * With no year on their profile they get the student fee; staff can switch
 * the offer to the graduate fee before it is paid.
 */
export async function feeCategoryFor(db: Database, userId: string, now = new Date()): Promise<"student" | "graduate"> {
  const profile = await db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.userId, userId), columns: { graduationYear: true } });
  if (!profile?.graduationYear) return "student";
  return profile.graduationYear >= now.getUTCFullYear() ? "student" : "graduate";
}

export const feeFor = (terms: OfferTerms, category: "student" | "graduate") => (category === "student" ? terms.studentFee : terms.graduateFee);
