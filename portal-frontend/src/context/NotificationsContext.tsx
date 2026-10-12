import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { API_BASE, apiFetch, refreshSession } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface PortalNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsValue {
  items: PortalNotification[] | null;
  unreadCount: number;
  hasMore: boolean;
  /** Bumped each time a notification arrives live, for the bell's wiggle. */
  arrivals: number;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

interface ListResponse {
  notifications: PortalNotification[];
  unreadCount: number;
  nextBefore: string | null;
}

/**
 * Loads the inbox and keeps a live connection to
 * /api/v1/notifications/stream (server-sent events). fetch() is used rather
 * than EventSource so the access token travels in the Authorization header,
 * not the URL. The stream reconnects with backoff, refreshing the token
 * first when the server says it expired.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<PortalNotification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [arrivals, setArrivals] = useState(0);
  // Bumped when a hidden tab comes back, to catch up on what it missed.
  const [resync, setResync] = useState(0);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !tokenRef.current) {
      setItems(null);
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    apiFetch<ListResponse>("/api/v1/notifications?limit=20", { accessToken: tokenRef.current })
      .then((r) => {
        if (cancelled) return;
        setItems(r.notifications);
        setUnreadCount(r.unreadCount);
        setNextBefore(r.nextBefore);
      })
      .catch(() => !cancelled && setItems((list) => list ?? []));
    return () => {
      cancelled = true;
    };
  }, [userId, resync]);

  useEffect(() => {
    if (!userId) return;
    // Only visible tabs keep a stream open. Browsers allow about six open
    // connections per site over HTTP/1.1; one long-lived stream per tab used
    // up that budget with a few tabs open, and every other request then
    // waited forever (pages stuck loading, buttons doing nothing).
    let controller = new AbortController();
    let retryMs = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (document.hidden) return;
      const signal = controller.signal;
      let token = tokenRef.current;
      if (!token) return;
      try {
        let res = await fetch(`${API_BASE}/api/v1/notifications/stream`, { headers: { Authorization: `Bearer ${token}` }, credentials: "include", signal });
        if (res.status === 401) {
          token = await refreshSession();
          if (!token || signal.aborted) return;
          res = await fetch(`${API_BASE}/api/v1/notifications/stream`, { headers: { Authorization: `Bearer ${token}` }, credentials: "include", signal });
        }
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        retryMs = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split;
          while ((split = buffer.indexOf("\n\n")) >= 0) {
            handleEvent(buffer.slice(0, split));
            buffer = buffer.slice(split + 2);
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      if (signal.aborted) return;
      timer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };

    const handleEvent = (raw: string) => {
      let event = "message";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) return;
      const payload = JSON.parse(data);
      if (event === "ready") setUnreadCount(payload.unreadCount);
      if (event === "notification") {
        const n = payload as PortalNotification;
        setItems((list) => (list?.some((x) => x.id === n.id) ? list : [n, ...(list ?? [])]));
        setUnreadCount((c) => c + 1);
        setArrivals((a) => a + 1);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        // A short grace period, so switching tabs back and forth doesn't reconnect each time.
        hiddenTimer ??= setTimeout(() => {
          hiddenTimer = null;
          controller.abort();
          if (timer) clearTimeout(timer);
          timer = null;
        }, 15_000);
        return;
      }
      if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
      if (controller.signal.aborted) {
        controller = new AbortController();
        retryMs = 1000;
        connect();
        setResync((n) => n + 1);
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.abort();
      if (timer) clearTimeout(timer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!nextBefore) return;
    const r = await apiFetch<ListResponse>(`/api/v1/notifications?limit=20&before=${encodeURIComponent(nextBefore)}`, { accessToken: tokenRef.current });
    setItems((list) => [...(list ?? []), ...r.notifications.filter((n) => !list?.some((x) => x.id === n.id))]);
    setNextBefore(r.nextBefore);
  }, [nextBefore]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list?.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)) ?? list);
    const r = await apiFetch<{ unreadCount: number }>(`/api/v1/notifications/${id}/read`, { method: "POST", accessToken: tokenRef.current }).catch(() => null);
    if (r) setUnreadCount(r.unreadCount);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((list) => list?.map((n) => (n.readAt ? n : { ...n, readAt: now })) ?? list);
    setUnreadCount(0);
    await apiFetch("/api/v1/notifications/read-all", { method: "POST", accessToken: tokenRef.current }).catch(() => null);
  }, []);

  const value = useMemo(
    () => ({ items, unreadCount, hasMore: !!nextBefore, arrivals, loadMore, markRead, markAllRead }),
    [items, unreadCount, nextBefore, arrivals, loadMore, markRead, markAllRead],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
