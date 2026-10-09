import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import type { Colleague } from "../../lib/calendar";

// Shared across components so the drawer, dialogs and widgets read the list once.
let cache: { token: string; promise: Promise<Colleague[]> } | null = null;

/**
 * Everyone on staff with their real names (any staff member can read this,
 * unlike the user directory, which is managers and up only).
 */
export function useColleagues() {
  const { user, accessToken } = useAuth();
  const [people, setPeople] = useState<Colleague[]>([]);

  useEffect(() => {
    if (!accessToken || !user || user.role === "candidate") return;
    if (!cache || cache.token !== accessToken) {
      const promise = apiFetch<{ people: Colleague[] }>("/api/v1/calendar/people", { accessToken }).then((r) => r.people);
      cache = { token: accessToken, promise };
      promise.catch(() => {
        if (cache?.promise === promise) cache = null;
      });
    }
    let live = true;
    cache.promise.then((p) => live && setPeople(p)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [accessToken, user]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  return { people, byId };
}
