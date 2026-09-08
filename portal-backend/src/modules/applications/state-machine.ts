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
 * The single system-triggered transition: an assessment attempt resolving
 * (candidate submits, or lazy expiry finalizes it) moves the application
 * from assessment_invited to assessment_completed automatically. Not an
 * admin action and not a candidate action — kept as its own explicit
 * function rather than folded into either table above so it's obvious at
 * the call site (assessments/attempt-routes.ts) that this is a distinct
 * kind of transition, not a privilege check that was forgotten.
 */
export function isSystemTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return from === "assessment_invited" && to === "assessment_completed";
}
