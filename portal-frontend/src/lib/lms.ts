import { BookOpenText, ClipboardList, FileText, PlayCircle, type LucideIcon } from "lucide-react";

export type ContentType = "video" | "document" | "assignment" | "test";

export interface Course {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  category: string | null;
  priceAmount: string | null;
  certificateTemplateId: string | null;
  createdBy: string;
}

export interface CatalogCourse {
  id: string;
  title: string;
  description: string;
  status: Course["status"];
  category: string | null;
  priceAmount: string | null;
  hasCertificate: boolean;
  lessonCount: number;
  totalMinutes: number;
  learnerCount: number;
  enrollment: { status: "enrolled" | "completed" | "dropped"; done: number; total: number } | null;
}

export interface Module { id: string; courseId: string; title: string; orderIndex: number }

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  contentType: ContentType;
  contentUrl: string | null;
  contentText: string | null;
  required: boolean;
  orderIndex: number;
  durationMinutes: number | null;
  passingScorePercent: number;
  // Exams: a time limit makes the quiz resumable and auto-submitted.
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
}

export interface Enrollment { id: string; status: "enrolled" | "completed" | "dropped"; paymentStatus: string; paymentDueAt: string | null }
export interface Progress { lessonId: string; status: "not_started" | "in_progress" | "completed"; passed: boolean | null; bestScorePercent: number | null }

export interface QuizOption { id: string; text: string }
export interface QuizQuestion { id?: string; questionText: string; options: QuizOption[]; correctOptionId?: string; explanation?: string | null; points: number }

export const TYPE_META: Record<ContentType, { label: string; icon: LucideIcon }> = {
  video: { label: "Video", icon: PlayCircle },
  document: { label: "Reading", icon: BookOpenText },
  assignment: { label: "Assignment", icon: ClipboardList },
  test: { label: "Quiz", icon: FileText },
};

export function priceLabel(amount: string | null) {
  const n = amount ? Number(amount) : 0;
  return n > 0 ? `₹${n.toLocaleString("en-IN")}` : "Free";
}

export function minutesLabel(m: number) {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** Lessons in outline order: by module order, then lesson order. */
export function orderedLessons(modules: Module[], lessons: Lesson[]) {
  const moduleOrder = new Map([...modules].sort((a, b) => a.orderIndex - b.orderIndex).map((m, i) => [m.id, i]));
  return [...lessons].sort((a, b) => (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0) || a.orderIndex - b.orderIndex);
}

/**
 * Turns a pasted link into something embeddable: YouTube and Vimeo become
 * their player URLs, Google Drive files their preview, plain video files
 * play in a <video> tag. Anything else is shown as a link.
 */
export function embedFor(url: string | null): { kind: "iframe" | "video" | "link"; src: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
      if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
    }
    if (host === "youtu.be") return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?rel=0` };
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return { kind: "iframe", src: `https://player.vimeo.com/video${u.pathname}` };
    if (host === "drive.google.com" && u.pathname.includes("/file/d/")) return { kind: "iframe", src: url.replace(/\/(view|edit)(\?.*)?$/, "/preview") };
    if (host === "docs.google.com") return { kind: "iframe", src: url.replace(/\/(edit|view)(\?.*)?$/, "/preview") };
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: "video", src: url };
    if (/\.pdf$/i.test(u.pathname)) return { kind: "iframe", src: url };
    return { kind: "link", src: url };
  } catch {
    return null;
  }
}

/** A gentle, stable gradient per course for its card cover. */
export function coverFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 80% 60%), hsl(${(h + 40) % 360} 75% 45%))`;
}

export const AUTHOR_ROLES = ["hr", "admin", "super_admin"];
