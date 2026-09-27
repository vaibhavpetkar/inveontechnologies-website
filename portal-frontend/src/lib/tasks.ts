import type { UserRole } from "../context/AuthContext";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "changes_requested" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  projectId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  estimateHours: string | null;
  actualHours: string;
  dueDate: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TaskEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  note: string | null;
  createdAt: string;
}

export const STATUS_META: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: "To do", tone: "slate" },
  in_progress: { label: "In progress", tone: "blue" },
  in_review: { label: "In review", tone: "violet" },
  changes_requested: { label: "Changes requested", tone: "amber" },
  done: { label: "Done", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const BOARD_COLUMNS: TaskStatus[] = ["todo", "in_progress", "in_review", "changes_requested", "done"];

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: string }> = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "blue" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};

// Mirrors portal-backend/src/modules/tasks/state-machine.ts. The server is
// the authority; this only decides which buttons and drop targets to offer.
const ASSIGNEE: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["in_review", "cancelled"],
  in_review: [],
  changes_requested: ["in_progress"],
  done: [],
  cancelled: [],
};

const REVIEWER: Record<TaskStatus, TaskStatus[]> = {
  todo: ["cancelled"],
  in_progress: ["cancelled"],
  in_review: ["done", "changes_requested"],
  changes_requested: ["cancelled"],
  done: [],
  cancelled: [],
};

const PRIVILEGED: UserRole[] = ["hr", "admin", "super_admin"];
export const CAN_ASSIGN_OTHERS: UserRole[] = ["manager", "hr", "admin", "super_admin"];

export function allowedMoves(task: Task, me: { id: string; role: UserRole }): TaskStatus[] {
  const moves = new Set<TaskStatus>();
  if (task.assigneeId === me.id) ASSIGNEE[task.status].forEach((s) => moves.add(s));
  // A project lead is also a reviewer server-side; a manager may be one, so
  // offer the moves and let the API decide.
  const maybeReviewer = PRIVILEGED.includes(me.role) || task.createdBy === me.id || (!!task.projectId && me.role === "manager");
  if (maybeReviewer) REVIEWER[task.status].forEach((s) => moves.add(s));
  return [...moves];
}

export const MOVE_LABELS: Record<TaskStatus, string> = {
  todo: "Move to do",
  in_progress: "Start work",
  in_review: "Submit for review",
  changes_requested: "Request changes",
  done: "Approve",
  cancelled: "Cancel task",
};

export function isOverdue(task: Task): boolean {
  return !!task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done" && task.status !== "cancelled";
}

export function formatDue(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
