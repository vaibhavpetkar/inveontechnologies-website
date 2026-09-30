export interface RoadmapPhase {
  month: number;
  title: string;
  skills: string[];
  labels: string[];
}

export interface TrackState {
  course: { enrollmentId: string; status: string; done: number; total: number } | null;
  exam: { attempts: number; attemptsLeft: number | null; best: number | null; passed: boolean; passPercent: number | null } | null;
  offer: { id: string; referenceNo: string; examScore: number; fee: number; issuedAt: string } | null;
  enrollment: { id: string; status: string; paidAt: string | null; applicationId: string } | null;
  unlocked: boolean;
}

export interface TrackSummary {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  fee: number;
  durationMonths: number;
  courseId: string | null;
  opportunityId: string | null;
  roadmap: RoadmapPhase[];
  assignmentCount?: number;
  interns?: number;
  me: TrackState;
}

export type SubmissionStatus = "submitted" | "changes_requested" | "approved";

export interface CheckItem {
  kind: "test" | "rule";
  label: string;
  passed: boolean;
  hidden?: boolean;
  stdin?: string;
  expected?: string;
  actual?: string;
  error?: string;
}

export interface CheckReport {
  passed: boolean;
  runnerUnavailable?: boolean;
  items: CheckItem[];
  summary: string;
  checkedAt: string;
}

export interface ExerciseInfo {
  editor: string;
  starter?: string;
  runs?: boolean;
  autoChecked?: boolean;
  examples?: { stdin: string; expected: string }[];
  hiddenTests?: number;
  requirements?: string[];
  setup?: string;
}

export interface Assignment {
  id: string;
  title: string;
  brief: string;
  steps: string[];
  level: "basic" | "intermediate" | "advanced";
  deliverable: "repo" | "link" | "text";
  maxMarks: number;
  kind: "project" | "exercise";
  exercise: ExerciseInfo | null;
  submission: {
    id: string;
    status: SubmissionStatus;
    repoUrl: string | null;
    linkUrl: string | null;
    notes: string | null;
    attempt: number;
    marks: number | null;
    feedback: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    code: string | null;
    checkReport: CheckReport | null;
    autoChecked: boolean;
  } | null;
}

export interface TrackDetail {
  track: Omit<TrackSummary, "me" | "assignmentCount" | "interns">;
  me: TrackState;
  phases: { month: number; title: string; skills: { key: string; label: string; assignments: Assignment[] }[] }[];
  progress: { total: number; approved: number; waiting: number; changes: number; marks: number; maxMarks: number };
  payments: { enabled: boolean; mode: "sandbox" | "production" | null };
}

export const SUBMISSION_META: Record<SubmissionStatus, { label: string; tone: string }> = {
  submitted: { label: "In review", tone: "blue" },
  changes_requested: { label: "Changes requested", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
};

export const LEVEL_LABEL = { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced" } as const;

/** Where the person is in the track, as the one next step to show. */
export function stageOf(me: TrackState): { step: 1 | 2 | 3 | 4 | 5; label: string } {
  if (me.unlocked) return { step: 5, label: "On the roadmap" };
  if (me.offer) return { step: 4, label: "Offer ready" };
  if (me.exam?.passed) return { step: 3, label: "Exam passed" };
  if (me.course && me.course.total > 0 && me.course.done >= me.course.total - 1) return { step: 2, label: "Ready for the exam" };
  if (me.course) return { step: 2, label: `Course ${Math.round((me.course.done / Math.max(1, me.course.total)) * 100)}% done` };
  return { step: 1, label: "Not started" };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Editor language names as students know them. */
export const EDITOR_LABEL: Record<string, string> = {
  javascript: "JavaScript",
  python: "Python",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  java: "Java",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  jsx: "React (JSX)",
  yaml: "YAML",
  dockerfile: "Dockerfile",
  shell: "Shell",
  hcl: "Terraform",
  json: "JSON",
  text: "Text",
};
