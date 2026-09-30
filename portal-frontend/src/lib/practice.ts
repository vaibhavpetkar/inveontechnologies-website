import type { CheckReport, ExerciseInfo } from "./internships";

export type UploadStatus = "passed" | "failed" | "pending";

export interface SheetQuestion extends ExerciseInfo {
  id: string;
  key: string;
  title: string;
  brief: string;
  steps: string[];
  level: "basic" | "intermediate" | "advanced";
  fileTypes: string[];
  lenient?: boolean;
  submission: { id: string; status: UploadStatus; fileName: string | null; code: string; report: CheckReport; submittedAt: string; attempts: number } | null;
}

export interface AssignmentSheet {
  lesson: { id: string; title: string };
  course: { id: string; title: string };
  codeRunner: string | null;
  preview: boolean;
  questions: SheetQuestion[];
}

export interface SubmitResult {
  submission: { id: string; status: UploadStatus; fileName: string | null; submittedAt: string; attempts: number };
  report: CheckReport;
  emailed: boolean;
  assignment: { done: number; total: number; completed: boolean };
  courseCompleted: boolean;
}

export interface HistoryEntry { id: string; status: UploadStatus; fileName: string | null; code: string; summary: string; submittedAt: string }

export interface PracticeCatalogCourse { key: string; title: string; category: string; tagline: string; units: number; questions: number; quizQuestions: number; courseId: string | null }

export interface AssignmentResults {
  questions: { id: string; title: string }[];
  learners: { userId: string; name: string; email: string; results: Record<string, { status: UploadStatus; attempts: number; submittedAt: string }> }[];
}

export const UPLOAD_META: Record<UploadStatus, { label: string; tone: string }> = {
  passed: { label: "Passed", tone: "green" },
  failed: { label: "Needs fixing", tone: "red" },
  pending: { label: "Reviewed, waiting to run", tone: "amber" },
};

/** Reads an uploaded file as text, refusing binaries and huge files. */
export async function readCodeFile(file: File): Promise<string> {
  if (file.size > 20_000 * 4) throw new Error("That file is too big for one answer");
  const text = await file.text();
  if (/\u0000/.test(text)) throw new Error("That looks like a binary file. Upload the source code file instead.");
  return text;
}
