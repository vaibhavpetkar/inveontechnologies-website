import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onSessionChange, refreshSession, setAccessToken } from "../lib/api";
import { ROLE_RANK, type OrgSummary, type Role, type User } from "../lib/types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  org: OrgSummary | null;
  setOrgId: (id: string) => void;
  can: (min: Role) => boolean;
  /** Resolves to a challenge token when the account has two-factor on. */
  login: (email: string, password: string) => Promise<{ challengeToken: string } | null>;
  completeLogin: (challengeToken: string, factor: { code?: string; recoveryCode?: string }) => Promise<void>;
  signup: (body: { email: string; password: string; name: string; orgName?: string; inviteToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<User | null>;
}

const AuthContext = createContext<AuthValue | null>(null);
const ORG_KEY = "inveon-cloud-org";

function readOrgId() {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgIdState] = useState<string | null>(readOrgId());

  useEffect(() => {
    onSessionChange((token) => {
      if (!token) setUser(null);
    });
    return () => onSessionChange(null);
  }, []);

  const reloadMe = useCallback(async () => {
    try {
      const { user: me } = await api<{ user: User }>("/auth/me");
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await refreshSession();
      if (token) await reloadMe();
      setLoading(false);
    })();
  }, [reloadMe]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      // private mode: the choice just isn't remembered
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ accessToken: string; user: User } | { twoFactorRequired: true; challengeToken: string }>("/auth/login", { method: "POST", body: { email, password } });
    if ("challengeToken" in r) return { challengeToken: r.challengeToken };
    setAccessToken(r.accessToken);
    setUser(r.user);
    return null;
  }, []);

  const completeLogin = useCallback(async (challengeToken: string, factor: { code?: string; recoveryCode?: string }) => {
    const r = await api<{ accessToken: string; user: User }>("/auth/login/2fa", { method: "POST", body: { challengeToken, ...factor } });
    setAccessToken(r.accessToken);
    setUser(r.user);
  }, []);

  const signup = useCallback(async (body: { email: string; password: string; name: string; orgName?: string; inviteToken?: string }) => {
    const r = await api<{ accessToken: string; user: User }>("/auth/signup", { method: "POST", body });
    setAccessToken(r.accessToken);
    setUser(r.user);
    if (r.user.organizations[0]) setOrgId(r.user.organizations[0].id);
  }, [setOrgId]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const org = useMemo(() => {
    if (!user || user.organizations.length === 0) return null;
    return user.organizations.find((o) => o.id === orgId) ?? user.organizations[0];
  }, [user, orgId]);

  const can = useCallback((min: Role) => !!org && ROLE_RANK[org.role] >= ROLE_RANK[min], [org]);

  return <AuthContext.Provider value={{ user, loading, org, setOrgId, can, login, completeLogin, signup, logout, reloadMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Org-scoped API path, e.g. orgPath(org, "/servers"). */
export function useOrgPath() {
  const { org } = useAuth();
  return useCallback((p: string) => (org ? `/orgs/${org.id}${p}` : ""), [org]);
}
