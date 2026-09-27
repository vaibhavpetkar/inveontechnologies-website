import { BookOpen, Briefcase, ClipboardCheck, FileText, KanbanSquare, LayoutDashboard, UserRound, Users, type LucideIcon } from "lucide-react";
import type { UserRole } from "../context/AuthContext";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const STAFF_ROLES: UserRole[] = ["manager", "hr", "admin", "super_admin"];

/** Sidebar links per role. UX only — every route is still checked server-side. */
export function navForRole(role: UserRole): NavItem[] {
  if (role === "candidate") {
    return [
      { href: "/opportunities", label: "Opportunities", icon: Briefcase },
      { href: "/candidate", label: "My applications", icon: FileText },
      { href: "/assessments", label: "Assessments", icon: ClipboardCheck },
      { href: "/courses", label: "Courses", icon: BookOpen },
      { href: "/profile", label: "Profile", icon: UserRound },
    ];
  }
  if (STAFF_ROLES.includes(role)) {
    return [
      { href: "/admin", label: "Console", icon: LayoutDashboard },
      { href: "/people", label: role === "manager" ? "My team" : "People", icon: Users },
      { href: "/tasks", label: "Tasks", icon: KanbanSquare },
      ...(role === "manager" ? [] : [{ href: "/opportunities", label: "Openings", icon: Briefcase }]),
      { href: "/courses", label: "Courses", icon: BookOpen },
    ];
  }
  return [
    { href: "/employee", label: "Workspace", icon: LayoutDashboard },
    { href: "/tasks", label: "My tasks", icon: KanbanSquare },
    { href: "/courses", label: "Courses", icon: BookOpen },
  ];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  candidate: "Candidate",
  intern: "Intern",
  employee: "Employee",
  manager: "Manager",
  hr: "HR",
  admin: "Admin",
  super_admin: "Super Admin",
};

/** A readable name from an email address: "priya.sharma@x" -> "Priya Sharma". */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;
}

export function initials(email: string): string {
  const parts = displayName(email).split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const AVATAR_HUES = [217, 262, 160, 24, 330, 190, 45];

/** Stable per-person colour so the same assignee always looks the same. */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
}
