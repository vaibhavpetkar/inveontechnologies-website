import { useEffect, useMemo, useState } from "react";
import { useAuth, type UserRole } from "../context/AuthContext";
import { apiFetch } from "./api";

export interface DirectoryUser {
  id: string;
  email: string;
  role: UserRole;
}

const DIRECTORY_ROLES: UserRole[] = ["manager", "hr", "admin", "super_admin"];

/**
 * Staff accounts, for picking assignees and showing names. Only staff can
 * read the directory; everyone else gets an empty list and sees "You" /
 * "Someone" instead of other people's names.
 */
export function useDirectory() {
  const { user, accessToken } = useAuth();
  const [people, setPeople] = useState<DirectoryUser[]>([]);
  const canRead = !!user && DIRECTORY_ROLES.includes(user.role);

  useEffect(() => {
    if (!accessToken || !canRead) return;
    apiFetch<{ users: DirectoryUser[] }>("/api/v1/users", { accessToken })
      .then((r) => setPeople(r.users.filter((u) => u.role !== "candidate")))
      .catch(() => setPeople([]));
  }, [accessToken, canRead]);

  const byId = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]));
    if (user) map.set(user.id, { id: user.id, email: user.email, role: user.role });
    return map;
  }, [people, user]);

  return { people, byId };
}
