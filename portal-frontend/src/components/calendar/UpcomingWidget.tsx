import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Video } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { apiFetch } from "../../lib/api";
import { addDays, isLive, sameDay, shortDayFmt, timeFmt, type CalendarItem } from "../../lib/calendar";

/** The next few meetings and interviews, with a Join button when it's time. */
export function UpcomingWidget() {
  const { accessToken } = useAuth();
  const { arrivals } = useNotifications();
  const [items, setItems] = useState<CalendarItem[] | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const from = new Date(Date.now() - 60 * 60_000);
    const to = addDays(new Date(), 7);
    apiFetch<{ events: CalendarItem[] }>(`/api/v1/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { accessToken })
      .then((r) => setItems(r.events.filter((e) => e.kind !== "task_due" && new Date(e.endsAt) > new Date() && !(e.kind === "meeting" && e.myResponse === "declined")).slice(0, 4)))
      .catch(() => setItems([]));
  }, [accessToken, arrivals]);

  const today = new Date();
  return (
    <motion.section className="panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
      <div className="panel-head">
        <h2>Coming up</h2>
        <Link href="/calendar" className="link-arrow">Calendar <ArrowRight size={16} /></Link>
      </div>
      {items === null ? (
        <div className="skeleton" style={{ height: 96 }} />
      ) : items.length === 0 ? (
        <p className="muted-small">No meetings in the next 7 days.</p>
      ) : (
        <ul className="upcoming-list">
          {items.map((it, i) => {
            const s = new Date(it.startsAt);
            const live = isLive(it);
            return (
              <motion.li key={it.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className={live ? "live" : ""}>
                <span className={`upcoming-date kind-${it.kind}`}>
                  <strong>{sameDay(s, today) ? "Today" : shortDayFmt.format(s)}</strong>
                  <span>{timeFmt.format(s)}</span>
                </span>
                <Link href={it.kind === "meeting" ? `/calendar?event=${it.id}` : "/calendar"} className="upcoming-title">{it.title}</Link>
                {it.kind !== "task_due" && it.joinUrl && (
                  <a className={`btn btn-sm${live ? "" : " btn-secondary"}`} href={it.joinUrl} target="_blank" rel="noreferrer"><Video size={14} /> Join</a>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
