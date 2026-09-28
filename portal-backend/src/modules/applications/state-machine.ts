/**
 * Enforces docs/state-machines.md "Application" diagram. Only the
 * non-assessment path is wired in Phase 2 — assessment_invited /
 * assessment_completed are reserved enum values (see schema.ts) but have
 * no transitions into or out of them until Phase 3.
 */
export type ApplicationStatus =
  | "submitted"
  | "under_review"
  | "assessment_invited"
  | "assessment_completed"
  | "shortlisted"
  | "selected"
  | "rejected"
  | "withdrawn";

const ADMIN_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["under_review", "rejected"],
  // assessment_invited is reached via the dedicated invite-assessment
  // endpoint (applications/assessment-routes.ts), not this generic table,
  // because it has side effects (creating the attempt) beyond a status
  // change. Listed here too so isAdminTransitionAllowed can validate it
  // from that endpoint using the same single source of truth.
  under_review: ["assessment_invited", "shortlisted", "rejected"],
  // assessment_invited -> assessment_completed is SYSTEM-triggered (by the
  // candidate submitting or an attempt expiring), never by an admin
  // calling /transition — see assessments/attempt-routes.ts. Admins can
  // still reject an invited candidate directly (e.g. suspected cheating,
  // no-show) without waiting for the attempt to resolve.
  assessment_invited: ["rejected"],
  assessment_completed: ["shortlisted", "rejected"],
  shortlisted: ["selected", "rejected"],
  selected: [],
  rejected: [],
  withdrawn: [],
};

const CANDIDATE_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["withdrawn"],
  under_review: ["withdrawn"],
  assessment_invited: ["withdrawn"],
  assessment_completed: ["withdrawn"],
  shortlisted: ["withdrawn"],
  selected: [],
  rejected: [],
  withdrawn: [],
};

export function isAdminTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ADMIN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isCandidateTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return CANDIDATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * System-triggered transitions — never an admin or candidate action:
 * - submitted -> assessment_invited: the candidate applied to an opening
 *   that has an exam, so they're sent straight to it.
 * - assessment_invited -> assessment_completed: the candidate passed, or
 *   has no attempts left on any exam (see assessments/attempt-routes.ts).
 */
export function isSystemTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return (
    (from === "submitted" && to === "assessment_invited") ||
    (from === "assessment_invited" && to === "assessment_completed") ||
    // Passing the HR round (interview feedback "pass") shortlists the candidate.
    ((from === "under_review" || from === "assessment_completed") && to === "shortlisted")
  );
}
