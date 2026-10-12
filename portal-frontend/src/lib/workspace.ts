import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "./api";
import type { Colleague } from "./calendar";
import type { Task } from "./tasks";

/** Every staff account with a name, for pickers anyone on staff can use (not candidates). */
export function useColleagues() {
  const { user, accessToken } = useAuth();
  const [people, setPeople] = useState<Colleague[]>([]);
  const allowed = !!user && user.role !== "candidate";
  useEffect(() => {
    if (!accessToken || !allowed) return;
    apiFetch<{ people: Colleague[] }>("/api/v1/calendar/people", { accessToken })
      .then((r) => setPeople(r.people))
      .catch(() => setPeople([]));
  }, [accessToken, allowed]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  return { people, byId };
}

// ---- Projects ----

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export interface Progress {
  total: number;
  done: number;
  percent: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  ownerId: string;
  githubRepo: string | null;
  updatedAt: string;
  owner: { id: string; name: string } | null;
  members: { id: string; name: string }[];
  progress: Progress;
  milestones: { total: number; done: number };
  nextMilestone: { id: string; title: string; dueDate: string | null } | null;
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  status: "pending" | "completed";
  completedAt: string | null;
  orderIndex: number;
  progress: Progress;
}

export interface ProjectMember {
  id: string;
  userId: string;
  roleOnProject: "lead" | "member";
  name: string;
  email: string;
  role: string;
}

export interface ProjectOverview {
  project: ProjectSummary;
  canManage: boolean;
  members: ProjectMember[];
  milestones: Milestone[];
  tasks: Task[];
  progress: Progress;
}

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  planning: { label: "Planning", tone: "violet" },
  active: { label: "Active", tone: "blue" },
  on_hold: { label: "On hold", tone: "amber" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// ---- Task updates ----

export interface TaskUpdate {
  id: string;
  taskId: string;
  userId: string;
  kind: "start" | "progress" | "blocker";
  body: string;
  progressPercent: number | null;
  branchOrLink: string | null;
  createdAt: string;
}

// ---- Team board ----

export interface BoardPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  online: boolean;
  lastSeenAt: string | null;
  status: "free" | "in_meeting" | "on_leave";
  leave: { type: string; halfDay: boolean; until: string } | null;
  currentMeeting: { title: string; endsAt: string } | null;
  nextMeeting: { title: string; startsAt: string; endsAt: string } | null;
  freeToday: { start: string; end: string }[];
  meetingsToday: number;
  working: { id: string; title: string; project: { id: string; title: string } | null; progress: number; startedAt: string | null; expectedFinishAt: string | null; dueDate: string | null }[];
  waiting: { id: string; title: string; status: string }[];
}

export interface BoardMeeting {
  id: string;
  kind: "meeting" | "class" | "interview";
  title: string;
  startsAt: string;
  endsAt: string;
  organizer: { id: string; name: string };
  participants: { id: string; name: string; response: string }[];
  joinUrl: string | null;
  mine: boolean;
}

export interface TeamBoard {
  now: string;
  dayStart: string;
  people: BoardPerson[];
  meetings: BoardMeeting[];
}

// ---- Notes ----

export type NoteKind = "note" | "plan" | "bookmark" | "secret";

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  body: string | null;
  url: string | null;
  username: string | null;
  hasSecret: boolean;
  important: boolean;
  tags: string[];
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string };
  access: "owner" | "edit" | "view";
  sharedWith: { id: string; name: string; canEdit: boolean }[];
  sharedCount: number;
}

export const NOTE_KINDS: Record<NoteKind, { label: string; plural: string; tone: string }> = {
  note: { label: "Note", plural: "Notes", tone: "blue" },
  plan: { label: "Plan", plural: "Plans", tone: "violet" },
  bookmark: { label: "Bookmark", plural: "Bookmarks", tone: "green" },
  secret: { label: "Password", plural: "Passwords", tone: "amber" },
};

// ---- Documents ----

export interface CandidateDocument {
  id: string;
  applicationId: string | null;
  documentName: string;
  documentType: string | null;
  status: "requested" | "uploaded" | "verified" | "rejected";
  fileUrl: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  opportunity: { id: string; title: string } | null; // null: sent for the candidate's profile, not one opening
  applicationStatus: string | null;
  candidate: { id: string; name: string; email: string };
}

export const DOC_STATUS: Record<CandidateDocument["status"], { label: string; tone: string }> = {
  requested: { label: "Waiting for upload", tone: "slate" },
  uploaded: { label: "To check", tone: "amber" },
  verified: { label: "Accepted", tone: "green" },
  rejected: { label: "Sent back", tone: "red" },
};

// ---- Formatting ----

const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (iso: string | Date) => time.format(new Date(iso));
export const fmtDay = (iso: string | Date) => day.format(new Date(iso));
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** "in 25 min", "2 h ago" */
export function relative(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const mins = Math.round(Math.abs(diff) / 60000);
  const text = mins < 60 ? `${mins} min` : mins < 60 * 24 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
