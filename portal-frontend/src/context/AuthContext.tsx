import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiError, getSessionGeneration, onSessionChange, refreshSession, startNewSession } from "../lib/api";

export type UserRole = "candidate" | "intern" | "employee" | "manager" | "hr" | "admin" | "super_admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The access token is deliberately kept in memory only — never
// localStorage/sessionStorage. A page refresh loses it, which is why we
// silently call /auth/refresh on mount: the httpOnly refresh cookie (set
// by the backend, invisible to JS) restores the session without ever
// putting a long-lived token somewhere an XSS payload could read it.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep React state in step with silent refreshes done by apiFetch. A
  // failed refresh (null) means the session is gone — sign out locally so
  // ProtectedRoute sends the person back to the login page.
  useEffect(() => {
    onSessionChange((token) => {
      setAccessToken(token);
      if (!token) setUser(null);
    });
    return () => onSessionChange(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // refreshSession() de-duplicates concurrent calls, so StrictMode's
        // double-invoked effect doesn't fire two racing refreshes.
        const generation = getSessionGeneration();
        const token = await refreshSession();
        if (!token) return;
        const me = await apiFetch<AuthUser>("/api/v1/auth/me", { accessToken: token });
        // Ignore if the person signed in/out while this was in flight.
        if (generation === getSessionGeneration()) setUser(me);
      } catch {
        // No valid session — that's fine, the person just sees the login page.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<{ accessToken: string; user: AuthUser }>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
    startNewSession();
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Even if the network call fails, clear local state so the UI
      // reflects "logged out" immediately.
    }
    startNewSession();
    setAccessToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, accessToken, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
