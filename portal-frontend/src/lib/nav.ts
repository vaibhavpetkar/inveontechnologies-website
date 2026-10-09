import { Award, Settings2, BarChart3, FolderKanban, FolderOpen, NotebookPen, UsersRound, BookOpen, CalendarCheck, CalendarDays, Briefcase, ClipboardCheck, FileCheck2, FileText, GraduationCap, IndianRupee, KanbanSquare, LayoutDashboard, MessagesSquare, ReceiptIndianRupee, ScrollText, UserRound, Users, type LucideIcon } from "lucide-react";
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
      { href: "/internships", label: "Internships", icon: GraduationCap },
      { href: "/opportunities", label: "Opportunities", icon: Briefcase },
      { href: "/candidate", label: "My applications", icon: FileText },
      { href: "/documents", label: "My documents", icon: FolderOpen },
      { href: "/assessments", label: "Exams", icon: ClipboardCheck },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/courses", label: "Courses", icon: BookOpen },
      { href: "/chat", label: "Community", icon: MessagesSquare },
      { href: "/profile", label: "Profile", icon: UserRound },
    ];
  }
  if (STAFF_ROLES.includes(role)) {
    return [
      { href: "/admin", label: "Console", icon: LayoutDashboard },
      { href: "/people", label: role === "manager" ? "My team" : "People", icon: Users },
      { href: "/tasks", label: "Tasks", icon: KanbanSquare },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/team", label: "Team board", icon: UsersRound },
      { href: "/performance", label: "Performance", icon: Award },
      { href: "/reviews", label: "Reviews", icon: FileCheck2 },
      { href: "/attendance", label: "Attendance", icon: CalendarCheck },
      ...(role === "manager" ? [] : [{ href: "/opportunities", label: "Openings", icon: Briefcase }]),
      { href: "/documents", label: "Documents", icon: FolderOpen },
      ...(role === "manager" ? [] : [{ href: "/payroll", label: "Payroll", icon: IndianRupee }]),
      ...(role === "manager" ? [] : [{ href: "/reports", label: "Reports", icon: BarChart3 }]),
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/courses", label: "Courses", icon: BookOpen },
      { href: "/internships", label: "Internships", icon: GraduationCap },
      { href: "/chat", label: "Chat", icon: MessagesSquare },
      { href: "/notes", label: "Notes", icon: NotebookPen },
      { href: "/policies", label: "Policies", icon: ScrollText },
      ...(role === "manager" ? [] : [{ href: "/settings", label: "Settings", icon: Settings2 }]),
    ];
  }
  return [
    { href: "/employee", label: "Workspace", icon: LayoutDashboard },
    { href: "/internships", label: "Internship", icon: GraduationCap },
    { href: "/tasks", label: "My tasks", icon: KanbanSquare },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/team", label: "Team board", icon: UsersRound },
    { href: "/performance", label: "Performance", icon: Award },
    { href: "/attendance", label: "Attendance", icon: CalendarCheck },
    { href: "/documents", label: "My documents", icon: FolderOpen },
    { href: "/payslips", label: "Pay", icon: ReceiptIndianRupee },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/courses", label: "Courses", icon: BookOpen },
    { href: "/chat", label: "Chat", icon: MessagesSquare },
    { href: "/notes", label: "Notes", icon: NotebookPen },
    { href: "/policies", label: "Policies", icon: ScrollText },
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
