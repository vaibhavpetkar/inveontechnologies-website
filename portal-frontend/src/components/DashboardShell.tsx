import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  candidate: "Candidate",
  intern: "Intern",
  employee: "Employee",
  manager: "Manager",
  hr: "HR",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function DashboardShell({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  const { user, logout } = useAuth();

  // Clearing the user is enough: every page using this shell sits behind
  // ProtectedRoute, which redirects to /login once the user is gone.
  async function handleLogout() {
    await logout();
  }

  return (
    <div className="dash-shell">
      <header className="dash-topbar">
        <div className="dash-topbar-brand">Inveon Portal</div>
        <div className="dash-user">
          {user && <span className="dash-role-badge">{ROLE_LABELS[user.role] ?? user.role}</span>}
          <span>{user?.email}</span>
          <button className="logout-link" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      {nav}
      <main className="dash-body">{children}</main>
    </div>
  );
}
