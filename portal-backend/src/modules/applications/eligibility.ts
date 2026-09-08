export interface EligibilityCriteria {
  minCgpa?: number;
  degrees?: string[];
  maxGraduationYear?: number;
}

export interface CandidateEligibilityInput {
  cgpa: string | null; // numeric columns come back as strings from pg
  degree: string | null;
  graduationYear: number | null;
}

export interface EligibilityCheckResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Soft-check only (see schema.ts comment on opportunities.eligibility) —
 * callers decide whether to warn or hard-block. Missing candidate data is
 * treated as "can't determine", not as a failure, since we don't want to
 * block someone whose profile is merely incomplete on a field the
 * opportunity didn't strictly require them to fill in.
 */
export function checkEligibility(
  criteria: EligibilityCriteria,
  candidate: CandidateEligibilityInput,
): EligibilityCheckResult {
  const reasons: string[] = [];

  if (criteria.minCgpa !== undefined && candidate.cgpa !== null) {
    if (Number(candidate.cgpa) < criteria.minCgpa) {
      reasons.push(`CGPA ${candidate.cgpa} is below the minimum ${criteria.minCgpa}`);
    }
  }

  if (criteria.degrees?.length && candidate.degree) {
    if (!criteria.degrees.includes(candidate.degree)) {
      reasons.push(`Degree "${candidate.degree}" is not in the eligible list (${criteria.degrees.join(", ")})`);
    }
  }

  if (criteria.maxGraduationYear !== undefined && candidate.graduationYear !== null) {
    if (candidate.graduationYear > criteria.maxGraduationYear) {
      reasons.push(`Graduation year ${candidate.graduationYear} is after the cutoff ${criteria.maxGraduationYear}`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
}
