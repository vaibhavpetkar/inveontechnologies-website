import type { ReactNode } from "react";
import { useLocation } from "wouter";
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

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
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
      <main className="dash-body">{children}</main>
    </div>
  );
}
