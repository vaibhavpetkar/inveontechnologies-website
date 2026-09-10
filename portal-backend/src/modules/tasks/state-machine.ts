export type TaskStatus = "todo" | "in_progress" | "in_review" | "changes_requested" | "done" | "cancelled";

// Assignee-driven: starting work, submitting for review, resuming after
// change requests, or cancelling their own not-yet-reviewed task.
const ASSIGNEE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["in_review", "cancelled"],
  in_review: [],
  changes_requested: ["in_progress"],
  done: [],
  cancelled: [],
};

// Reviewer-driven (project lead, task creator, or a privileged role):
// the actual review decision, plus an override cancel from anywhere active.
const REVIEWER_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["cancelled"],
  in_progress: ["cancelled"],
  in_review: ["done", "changes_requested"],
  changes_requested: ["cancelled"],
  done: [],
  cancelled: [],
};

export function isAssigneeTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return ASSIGNEE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isReviewerTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return REVIEWER_TRANSITIONS[from]?.includes(to) ?? false;
}
