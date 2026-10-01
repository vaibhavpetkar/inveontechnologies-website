import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, GraduationCap, Plus, Video } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { EventDialog } from "../components/calendar/EventDialog";
import { EventDrawer } from "../components/calendar/EventDrawer";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { apiFetch } from "../lib/api";
import {
  addDays,
  dayFmt,
  isLive,
  KIND_META,
  monthFmt,
  monthGrid,
  sameDay,
  shortDayFmt,
  startOfDay,
  startOfMonth,
  startOfWeek,
  timeFmt,
  timeRange,
  type CalendarItem,
  type Colleague,
  type Meeting,
  type ProviderInfo,
  isMarker,
  isMeeting,
} from "../lib/calendar";

type View = "month" | "week" | "agenda";
const VIEWS: { key: View; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "agenda", label: "Agenda" },
];
const HOUR_PX = 52;

function rangeFor(view: View, anchor: Date): [Date, Date] {
  if (view === "month") {
    const grid = monthGrid(anchor);
    return [grid[0], addDays(grid[41], 1)];
  }
  if (view === "week") {
    const s = startOfWeek(anchor);
    return [s, addDays(s, 7)];
  }
  const s = startOfDay(anchor);
  return [s, addDays(s, 30)];
}

function itemIcon(item: CalendarItem, size = 13) {
  if (item.kind === "task_due") return <ClipboardCheck size={size} />;
  if (item.kind === "exam") return <GraduationCap size={size} />;
  if (item.joinUrl) return <Video size={size} />;
  return <CalendarDays size={size} />;
}

function durationLabel(item: CalendarItem) {
  const m = Math.round((+new Date(item.endsAt) - +new Date(item.startsAt)) / 60000);
  return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/** Side-by-side lanes for overlapping timed items within one day. */
function layoutDay(items: CalendarItem[]) {
  const sorted = [...items].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const lanes: number[] = [];
  const placed = sorted.map((item) => {
    const s = +new Date(item.startsAt);
    let lane = lanes.findIndex((end) => end <= s);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = Math.max(+new Date(item.endsAt), s + 30 * 60000);
    return { item, lane };
  });
  return placed.map((p) => ({ ...p, lanes: lanes.length }));
}

export default function Calendar() {
  const { user, accessToken } = useAuth();
  const { arrivals } = useNotifications();
  const search = useSearch();
  const [, navigate] = useLocation();
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  const [view, setView] = useState<View>(narrow ? "agenda" : "week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [editing, setEditing] = useState<{ meeting: Meeting | null; day?: Date } | null>(null);
  const [people, setPeople] = useState<Colleague[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [direction, setDirection] = useState(0);
  const canSchedule = !!user && user.role !== "candidate";
  const [from, to] = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const r = await apiFetch<{ events: CalendarItem[] }>(`/api/v1/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { accessToken });
    setItems(r.events);
    return r.events;
  }, [accessToken, from, to]);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load, arrivals]);

  useEffect(() => {
    if (!accessToken || !canSchedule) return;
    apiFetch<{ people: Colleague[] }>("/api/v1/calendar/people", { accessToken }).then((r) => setPeople(r.people)).catch(() => undefined);
    apiFetch<{ providers: ProviderInfo[] }>("/api/v1/calendar/providers", { accessToken }).then((r) => setProviders(r.providers)).catch(() => undefined);
  }, [accessToken, canSchedule]);

  // Deep link from a notification: /calendar?event=<id>
  const eventParam = new URLSearchParams(search).get("event");
  useEffect(() => {
    if (!eventParam || !accessToken) return;
    apiFetch<{ event: Meeting }>(`/api/v1/calendar/events/${eventParam}`, { accessToken })
      .then((r) => {
        setAnchor(new Date(r.event.startsAt));
        setSelected(r.event);
      })
      .catch(() => undefined);
  }, [eventParam, accessToken]);

  const closeDrawer = () => {
    setSelected(null);
    if (eventParam) navigate("/calendar", { replace: true });
  };

  const step = (dir: number) => {
    setDirection(dir);
    setAnchor((a) => (view === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * (view === "week" ? 7 : 30))));
  };

  const title = view === "month" ? monthFmt.format(anchor) : view === "week" ? `${shortDayFmt.format(from)} – ${shortDayFmt.format(addDays(to, -1))} ${addDays(to, -1).getFullYear()}` : `From ${dayFmt.format(from)}`;
  const upcomingToday = (items ?? []).filter((i) => !isMarker(i) && sameDay(new Date(i.startsAt), new Date()) && new Date(i.endsAt) > new Date());

  const openNew = (day?: Date) => canSchedule && setEditing({ meeting: null, day });

  return (
    <DashboardShell>
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p>
            {upcomingToday.length
              ? `${upcomingToday.length} more ${upcomingToday.length === 1 ? "meeting" : "meetings"} today. Next: ${upcomingToday[0].title} at ${timeFmt.format(new Date(upcomingToday[0].startsAt))}.`
              : "Meetings, interviews and task deadlines in one place."}
          </p>
        </div>
        {canSchedule && (
          <motion.button className="btn" onClick={() => openNew()} whileTap={{ scale: 0.96 }}>
            <Plus size={18} /> New meeting
          </motion.button>
        )}
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="btn btn-secondary btn-sm" onClick={() => { setDirection(0); setAnchor(new Date()); }}>Today</button>
          <button className="icon-button" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <button className="icon-button" aria-label="Next" onClick={() => step(1)}><ChevronRight size={18} /></button>
          <h2 className="cal-title">{title}</h2>
        </div>
        <div className="segmented">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>
              {view === v.key && <motion.span layoutId="cal-view" className="segmented-pill" />}
              <span>{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cal-legend">
        {(Object.keys(KIND_META) as CalendarItem["kind"][]).map((k) => (
          <span key={k}><span className={`cal-swatch kind-${k}`} />{KIND_META[k].label}</span>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={`${view}-${from.toISOString()}`}
          custom={direction}
          initial={{ opacity: 0, x: direction * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -28 }}
          transition={{ duration: 0.2 }}
        >
          {items === null ? (
            <div className="skeleton" style={{ height: 420 }} />
          ) : view === "month" ? (
            <MonthView anchor={anchor} items={items} onPick={setSelected} onDay={(d) => { setAnchor(d); setView("week"); }} onNew={canSchedule ? openNew : undefined} />
          ) : view === "week" ? (
            <WeekView start={from} items={items} onPick={setSelected} onNew={canSchedule ? openNew : undefined} />
          ) : (
            <AgendaView items={items} onPick={setSelected} onNew={canSchedule ? () => openNew() : undefined} />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <EventDrawer
            key={selected.id}
            item={selected}
            onClose={closeDrawer}
            onEdit={(m) => { setSelected(null); setEditing({ meeting: m }); }}
            onChanged={() => load()}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editing && (
          <EventDialog
            existing={editing.meeting}
            day={editing.day}
            people={people}
            providers={providers}
            onClose={() => setEditing(null)}
            onSaved={async (m) => {
              setEditing(null);
              setAnchor(new Date(m.startsAt));
              await load();
              setSelected(m);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

function Chip({ item, onPick, compact }: { item: CalendarItem; onPick: (i: CalendarItem) => void; compact?: boolean }) {
  const declined = isMeeting(item) && item.myResponse === "declined";
  return (
    <motion.button
      layout
      className={`cal-chip kind-${item.kind}${declined ? " declined" : ""}${isLive(item) ? " live" : ""}`}
      onClick={(e) => { e.stopPropagation(); onPick(item); }}
      whileHover={{ y: -1 }}
      title={`${item.title} · ${timeRange(item)}`}
    >
      {itemIcon(item)}
      {!compact && item.kind !== "task_due" && <span className="cal-chip-time">{timeFmt.format(new Date(item.startsAt))}</span>}
      <span className="cal-chip-title">{item.title}</span>
    </motion.button>
  );
}

function MonthView({ anchor, items, onPick, onDay, onNew }: { anchor: Date; items: CalendarItem[]; onPick: (i: CalendarItem) => void; onDay: (d: Date) => void; onNew?: (d: Date) => void }) {
  const days = monthGrid(anchor);
  const month = startOfMonth(anchor).getMonth();
  const today = new Date();
  return (
    <div className="cal-month">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {days.map((d, i) => {
        const dayItems = items.filter((it) => sameDay(new Date(it.startsAt), d));
        return (
          <motion.div
            key={d.toISOString()}
            className={`cal-cell${d.getMonth() !== month ? " outside" : ""}${sameDay(d, today) ? " today" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.004 }}
            onDoubleClick={() => onNew?.(d)}
          >
            <button className="cal-daynum" onClick={() => onDay(d)} aria-label={dayFmt.format(d)}>{d.getDate()}</button>
            <div className="cal-cell-items">
              {dayItems.slice(0, 3).map((it) => <Chip key={it.id} item={it} onPick={onPick} />)}
              {dayItems.length > 3 && <button className="cal-more" onClick={() => onDay(d)}>+{dayItems.length - 3} more</button>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function WeekView({ start, items, onPick, onNew }: { start: Date; items: CalendarItem[]; onPick: (i: CalendarItem) => void; onNew?: (d: Date) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    scroller.current?.scrollTo({ top: HOUR_PX * 8 - 8 });
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const timed = items.filter((i) => !isMarker(i));
  const due = items.filter(isMarker);

  return (
    <div className="cal-week">
      <div className="cal-week-head">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className={`cal-week-day${sameDay(d, now) ? " today" : ""}`}>
            <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(d)}</span>
            <strong>{d.getDate()}</strong>
          </div>
        ))}
        {due.length > 0 && (
          <>
            <div className="cal-allday-label">Due</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="cal-allday">
                {due.filter((t) => sameDay(new Date(t.startsAt), d)).map((t) => <Chip key={t.id} item={t} onPick={onPick} compact />)}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="cal-week-body" ref={scroller}>
        <div className="cal-hours">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: HOUR_PX }}><span>{h === 0 ? "" : timeFmt.format(new Date(2000, 0, 1, h))}</span></div>
          ))}
        </div>
        {days.map((d) => {
          const placed = layoutDay(timed.filter((it) => sameDay(new Date(it.startsAt), d)));
          return (
            <div
              key={d.toISOString()}
              className="cal-day-col"
              style={{ height: HOUR_PX * 24 }}
              onClick={(e) => {
                if (!onNew) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
                onNew(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes));
              }}
            >
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-hour-line" style={{ top: h * HOUR_PX }} />)}
              {sameDay(d, now) && (
                <div className="cal-now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }}><span /></div>
              )}
              {placed.map(({ item, lane, lanes }) => {
                const s = new Date(item.startsAt);
                const e = new Date(item.endsAt);
                const top = ((s.getHours() * 60 + s.getMinutes()) / 60) * HOUR_PX;
                const height = Math.max(22, ((+e - +s) / 3_600_000) * HOUR_PX - 2);
                const declined = isMeeting(item) && item.myResponse === "declined";
                return (
                  <motion.button
                    key={item.id}
                    className={`cal-block kind-${item.kind}${declined ? " declined" : ""}${isLive(item, now) ? " live" : ""}`}
                    style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02, zIndex: 5 }}
                    onClick={(ev) => { ev.stopPropagation(); onPick(item); }}
                  >
                    <strong>{item.title}</strong>
                    {height > 34 && <span>{timeRange(item)}</span>}
                  </motion.button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ items, onPick, onNew }: { items: CalendarItem[]; onPick: (i: CalendarItem) => void; onNew?: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, { day: Date; items: CalendarItem[] }>();
    for (const it of items) {
      const d = startOfDay(new Date(it.startsAt));
      const key = d.toISOString();
      if (!map.has(key)) map.set(key, { day: d, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.values()];
  }, [items]);

  if (groups.length === 0) {
    return (
      <div className="empty-state cal-empty">
        <CalendarDays size={40} />
        <h3>Nothing scheduled</h3>
        <p>Meetings you're invited to, your interviews and your task deadlines will show up here.</p>
        {onNew && <button className="btn" onClick={onNew}><Plus size={16} /> Schedule a meeting</button>}
      </div>
    );
  }

  const today = new Date();
  return (
    <div className="cal-agenda">
      {groups.map((g, gi) => (
        <motion.section key={g.day.toISOString()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.04 }}>
          <h3 className={sameDay(g.day, today) ? "today" : ""}>{sameDay(g.day, today) ? "Today" : sameDay(g.day, addDays(today, 1)) ? "Tomorrow" : dayFmt.format(g.day)}</h3>
          <ul>
            {g.items.map((it) => (
              <li key={it.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`agenda-row kind-${it.kind}${isLive(it) ? " live" : ""}${!isMarker(it) && new Date(it.endsAt) < new Date() ? " past" : ""}`}
                  onClick={() => onPick(it)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPick(it);
                    }
                  }}
                >
                  <span className="agenda-time">{it.kind === "task_due" ? "Due" : timeFmt.format(new Date(it.startsAt))}</span>
                  <span className="agenda-bar" />
                  <span className="agenda-main">
                    <strong>{it.title}</strong>
                    <span className="muted-small">
                      {KIND_META[it.kind].label}
                      {isMeeting(it) && it.attendees.length > 1 ? ` · ${it.attendees.length} people` : ""}
                      {!isMarker(it) ? ` · ${durationLabel(it)}` : ""}
                    </span>
                  </span>
                  {!isMarker(it) && it.joinUrl && new Date(it.endsAt) > new Date() && (
                    <a className={`btn btn-sm${isLive(it) ? "" : " btn-secondary"}`} href={it.joinUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      <Video size={15} /> Join
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}
