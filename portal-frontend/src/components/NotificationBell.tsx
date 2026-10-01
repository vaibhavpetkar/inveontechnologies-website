import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Bell, BriefcaseBusiness, CalendarClock, CheckCheck, ClipboardCheck, GraduationCap, ListTodo, MessageSquare, type LucideIcon } from "lucide-react";
import { useNotifications, type PortalNotification } from "../context/NotificationsContext";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { timeAgo } from "../lib/tasks";
import { useToast } from "./Toast";

function iconFor(kind: string): LucideIcon {
  if (kind === "task.comment") return MessageSquare;
  if (kind.startsWith("task.due") || kind === "task.overdue") return CalendarClock;
  if (kind.startsWith("task.")) return ListTodo;
  if (kind.startsWith("interview.") || kind.startsWith("offer.") || kind.startsWith("application.")) return BriefcaseBusiness;
  if (kind.startsWith("assessment.")) return ClipboardCheck;
  if (kind.startsWith("certificate.") || kind.startsWith("course.")) return GraduationCap;
  return Bell;
}

/** Topbar bell: unread badge, live arrivals and the inbox dropdown. */
export function NotificationBell() {
  const { items, unreadCount, hasMore, arrivals, loadMore, markRead, markAllRead } = useNotifications();
  const { accessToken } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [emailOn, setEmailOn] = useState<boolean | null>(null);
  const [digestOn, setDigestOn] = useState<boolean | null>(null);
  const [, navigate] = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const bell = useAnimationControls();
  const seen = useRef(arrivals);

  // Wiggle and toast when something arrives while the page is open.
  useEffect(() => {
    if (arrivals === seen.current) return;
    seen.current = arrivals;
    bell.start({ rotate: [0, -18, 14, -10, 6, 0], transition: { duration: 0.6 } });
    const latest = items?.[0];
    if (latest && !open) toast(latest.title);
  }, [arrivals]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrapRef.current && !wrapRef.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || emailOn !== null || !accessToken) return;
    apiFetch<{ preferences: { emailEnabled: boolean; digestEnabled: boolean } }>("/api/v1/notification-preferences", { accessToken })
      .then((r) => {
        setEmailOn(r.preferences.emailEnabled);
        setDigestOn(r.preferences.digestEnabled);
      })
      .catch(() => {});
  }, [open, emailOn, accessToken]);

  async function toggleEmail() {
    const next = !emailOn;
    setEmailOn(next);
    try {
      await apiFetch("/api/v1/notification-preferences", { method: "PUT", body: { emailEnabled: next }, accessToken });
      toast(next ? "You'll get emails for important updates" : "Emails turned off");
    } catch {
      setEmailOn(!next);
      toast("Couldn't save that setting.", "error");
    }
  }

  async function toggleDigest() {
    const next = !digestOn;
    setDigestOn(next);
    try {
      await apiFetch("/api/v1/notification-preferences", { method: "PUT", body: { digestEnabled: next }, accessToken });
      toast(next ? "You'll get a summary of your day each morning" : "Morning summary turned off");
    } catch {
      setDigestOn(!next);
      toast("Couldn't save that setting.", "error");
    }
  }

  function openItem(n: PortalNotification) {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <motion.button
        className={`icon-button notif-button${open ? " active" : ""}`}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        animate={bell}
        whileTap={{ scale: 0.9 }}
      >
        <Bell size={19} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span key="badge" className="notif-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-panel"
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="notif-head">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <button className="link-button" onClick={markAllRead}>
                  <CheckCheck size={15} /> Mark all read
                </button>
              )}
            </div>

            <div className="notif-list">
              {!items && (
                <div className="skeleton-stack" style={{ padding: "0.8rem" }}>
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              )}
              {items && items.length === 0 && (
                <div className="notif-empty">
                  <Bell size={28} />
                  <p>You're all caught up.</p>
                </div>
              )}
              <AnimatePresence initial={false}>
                {items?.map((n) => {
                  const Icon = iconFor(n.kind);
                  return (
                    <motion.button
                      key={n.id}
                      layout
                      className={`notif-item${n.readAt ? "" : " unread"}`}
                      onClick={() => openItem(n)}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <span className="notif-icon">
                        <Icon size={16} />
                      </span>
                      <span className="notif-text">
                        <span className="notif-title">{n.title}</span>
                        {n.body && <span className="notif-body">{n.body}</span>}
                        <span className="notif-time">{timeAgo(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="notif-dot" aria-label="Unread" />}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
              {hasMore && (
                <button className="link-button notif-more" onClick={loadMore}>
                  Show older
                </button>
              )}
            </div>

            <div className="notif-foot">
              <label className="toggle">
                <input type="checkbox" checked={!!emailOn} disabled={emailOn === null} onChange={toggleEmail} /> Also email me important updates
              </label>
              <label className="toggle" title={emailOn ? undefined : "Turn on emails first"}>
                <input type="checkbox" checked={!!emailOn && !!digestOn} disabled={!emailOn || digestOn === null} onChange={toggleDigest} /> Morning summary of my day (8 AM)
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
