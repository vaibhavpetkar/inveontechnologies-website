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
  under_review: ["shortlisted", "rejected"],
  assessment_invited: [], // Phase 3
  assessment_completed: [], // Phase 3
  shortlisted: ["selected", "rejected"],
  selected: [],
  rejected: [],
  withdrawn: [],
};

const CANDIDATE_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["withdrawn"],
  under_review: ["withdrawn"],
  assessment_invited: [],
  assessment_completed: [],
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
