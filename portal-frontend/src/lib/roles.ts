import type { UserRole } from "../context/AuthContext";

export function landingPathForRole(role: UserRole): string {
  if (role === "candidate") return "/candidate";
  if (role === "intern" || role === "employee") return "/employee";
  // manager, hr, admin, super_admin all land on the admin/staff console —
  // the console itself narrows what each role can see and do, same as
  // the backend's own role gating.
  return "/admin";
}
