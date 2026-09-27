import { Redirect, useLocation, useSearch } from "wouter";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const search = useSearch();

  if (loading) return <div className="page-loading">Loading…</div>;
  // Remember where they were going (e.g. an opening linked from the careers page).
  if (!user) return <Redirect to={`/login?next=${encodeURIComponent(location + (search ? `?${search}` : ""))}`} />;

  return <>{children}</>;
}
