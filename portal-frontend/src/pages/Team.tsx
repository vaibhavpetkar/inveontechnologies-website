import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CheckCircle2, Clock, Coffee, Hourglass, Plane, RefreshCw, Search, Users, Video } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { ROLE_LABELS } from "../lib/nav";
import { fmtDay, fmtTime, relative, type BoardMeeting, type BoardPerson, type TeamBoard } from "../lib/workspace";
import type { UserRole } from "../context/AuthContext";

const STATUS: Record<BoardPerson["status"], { label: string; tone: string; icon: typeof Coffee }> = {
  free: { label: "Free", tone: "green", icon: Coffee },
  in_meeting: { label: "In a meeting", tone: "violet", icon: Video },
  on_leave: { label: "On leave", tone: "slate", icon: Plane },
};

type Filter = "all" | BoardPerson["status"];

/** Who is free, who is in a meeting, what everyone is working on, and every meeting coming up. */
export default function Team() {
  const { accessToken } = useAuth();
  const [board, setBoard] = useState<TeamBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setBoard(await apiFetch<TeamBoard>("/api/v1/team/board?days=7", { accessToken }));
      setError(null);
    } catch {
      setError("Couldn't load the team board.");
    } finally {
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (board?.people ?? []).filter(
      (p) => (filter === "all" || p.status === filter) && (!q || [p.name, p.email, p.designation ?? "", ...p.working.map((w) => w.title)].some((v) => v.toLowerCase().includes(q))),
    );
  }, [board, filter, query]);

  const counts = useMemo(() => {
    const list = board?.people ?? [];
    return { all: list.length, free: list.filter((p) => p.status === "free").length, in_meeting: list.filter((p) => p.status === "in_meeting").length, on_leave: list.filter((p) => p.status === "on_leave").length };
  }, [board]);

  const working = (board?.people ?? []).reduce((n, p) => n + p.working.length, 0);

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p>Who's free, who's in a meeting, and what everyone is working on right now.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" onClick={load} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="stat-grid">
        {[
          { label: "Free now", value: counts.free, tone: "green", icon: Coffee },
          { label: "In meetings", value: counts.in_meeting, tone: "violet", icon: Video },
          { label: "On leave", value: counts.on_leave, tone: "slate", icon: Plane },
          { label: "Tasks in progress", value: working, tone: "blue", icon: Hourglass },
        ].map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <s.icon size={20} className="stat-icon" />
            <div className="stat-value"><AnimatedNumber value={s.value} /></div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="team-layout">
        <section aria-labelledby="team-people">
          <div className="board-toolbar">
            <h2 id="team-people" className="section-title"><Users size={18} /> People</h2>
            <div className="note-filters" role="tablist">
              {(["all", "free", "in_meeting", "on_leave"] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} className={`phase-chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
                  {f === "all" ? "Everyone" : STATUS[f].label} <span className="tab-count">{counts[f]}</span>
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or tasks" aria-label="Search people or tasks" />
            </label>
          </div>

          {!board && !error && <div className="person-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</div>}
          {board && people.length === 0 && (
            <div className="empty-state">
              <Users size={34} />
              <h3>Nobody matches</h3>
              <p>Try another filter.</p>
            </div>
          )}
          <div className="person-grid">
            <AnimatePresence>
              {people.map((p, i) => <PersonCard key={p.id} person={p} index={i} />)}
            </AnimatePresence>
          </div>
        </section>

        <aside className="meeting-rail" aria-labelledby="team-meetings">
          <h2 id="team-meetings" className="section-title"><CalendarClock size={18} /> Meetings this week</h2>
          {board && <MeetingList meetings={board.meetings} />}
          {!board && !error && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 90, marginBottom: 10 }} />)}
        </aside>
      </div>
    </DashboardShell>
  );
}

function PersonCard({ person: p, index }: { person: BoardPerson; index: number }) {
  const s = STATUS[p.status];
  return (
    <motion.article
      layout
      className={`person-card status-${p.status}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(index, 12) * 0.03, type: "spring", stiffness: 320, damping: 30 }}
    >
      <header className="person-head">
        <span className="person-avatar">
          <Avatar email={p.email} name={p.name} size={42} />
          <span className={`presence${p.online ? " on" : ""}`} title={p.online ? "Online now" : p.lastSeenAt ? `Last seen ${relative(p.lastSeenAt)}` : "Offline"} />
        </span>
        <div className="person-id">
          <strong>{p.name}</strong>
          <span className="muted-small">{p.designation ?? ROLE_LABELS[p.role as UserRole] ?? p.role}</span>
        </div>
        <span className={`pill pill-${s.tone} person-status`}>
          {p.status === "in_meeting" ? <span className="pulse-dot" /> : <s.icon size={13} />} {s.label}
        </span>
      </header>

      <div className="person-now">
        {p.status === "in_meeting" && p.currentMeeting && (
          <p><Video size={14} /> {p.currentMeeting.title} <span className="muted-small">until {fmtTime(p.currentMeeting.endsAt)}</span></p>
        )}
        {p.status === "on_leave" && p.leave && (
          <p><Plane size={14} /> {p.leave.halfDay ? "Half day" : "Away"} <span className="muted-small">until {fmtDay(p.leave.until)}</span></p>
        )}
        {p.nextMeeting && (
          <p><CalendarClock size={14} /> Next: {p.nextMeeting.title} <span className="muted-small">{relative(p.nextMeeting.startsAt)} · {fmtTime(p.nextMeeting.startsAt)}</span></p>
        )}
      </div>

      {p.status !== "on_leave" && (
        <div className="free-slots" aria-label="Free today">
          <span className="muted-small"><Clock size={12} /> Free today</span>
          {p.freeToday.length ? (
            <div className="slot-row">
              {p.freeToday.slice(0, 4).map((f) => <span key={f.start} className="slot">{fmtTime(f.start)}–{fmtTime(f.end)}</span>)}
              {p.freeToday.length > 4 && <span className="slot more">+{p.freeToday.length - 4}</span>}
            </div>
          ) : (
            <span className="muted-small"> · fully booked</span>
          )}
        </div>
      )}

      <div className="person-work">
        <span className="muted-small">Working on</span>
        {p.working.length === 0 ? (
          <p className="muted-small">Nothing in progress{p.waiting.length ? ` · ${p.waiting.length} waiting` : ""}</p>
        ) : (
          <ul>
            {p.working.slice(0, 3).map((w) => (
              <li key={w.id}>
                <Link href={w.project ? `/projects/${w.project.id}?task=${w.id}` : `/tasks/${w.id}`} className="work-item">
                  <span className="work-title">{w.title}</span>
                  {w.project && <span className="muted-small">{w.project.title}</span>}
                  <span className="work-bar" aria-label={`${w.progress}% done`}>
                    <motion.span initial={{ width: 0 }} animate={{ width: `${w.progress}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
                  </span>
                  <span className="muted-small">
                    {w.progress}%{w.expectedFinishAt ? ` · aims to finish ${fmtDay(w.expectedFinishAt)}` : w.dueDate ? ` · due ${fmtDay(w.dueDate)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
            {p.working.length > 3 && <li className="muted-small">+{p.working.length - 3} more</li>}
          </ul>
        )}
      </div>
    </motion.article>
  );
}

function MeetingList({ meetings }: { meetings: BoardMeeting[] }) {
  const now = Date.now();
  const groups = useMemo(() => {
    const map = new Map<string, BoardMeeting[]>();
    for (const m of meetings) {
      const key = fmtDay(m.startsAt);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [meetings]);

  if (meetings.length === 0) {
    return (
      <div className="empty-state small">
        <CheckCircle2 size={28} />
        <p>No meetings this week.</p>
      </div>
    );
  }

  return (
    <div className="meeting-days">
      {groups.map(([day, list]) => (
        <div key={day} className="meeting-day">
          <h3>{day}</h3>
          {list.map((m, i) => {
            const live = new Date(m.startsAt).getTime() <= now && new Date(m.endsAt).getTime() > now;
            const accepted = m.participants.filter((x) => x.response === "accepted").length;
            return (
              <motion.div key={m.id} className={`meeting-item${live ? " live" : ""}${m.mine ? " mine" : ""}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="meeting-time">
                  <strong>{fmtTime(m.startsAt)}</strong>
                  <span className="muted-small">{fmtTime(m.endsAt)}</span>
                </div>
                <div className="meeting-body">
                  <strong>{m.title}</strong>
                  <span className="muted-small">
                    {m.kind === "class" ? "Live class" : m.kind === "interview" ? "Hiring" : "Meeting"} · {m.kind === "interview" ? "with" : "by"} {m.organizer.name}
                    {live ? " · happening now" : ""}
                  </span>
                  <div className="meeting-people" title={m.participants.map((x) => `${x.name} (${x.response})`).join(", ")}>
                    <div className="avatar-stack small">
                      {m.participants.slice(0, 5).map((x) => <Avatar key={x.id} email={x.id} name={x.name} size={22} />)}
                      {m.participants.length > 5 && <span className="avatar more">+{m.participants.length - 5}</span>}
                    </div>
                    <span className="muted-small">{m.participants.length} invited{accepted ? ` · ${accepted} going` : ""}</span>
                  </div>
                </div>
                {m.joinUrl && (
                  <a className={`btn btn-sm ${live ? "" : "btn-secondary"}`} href={m.joinUrl} target="_blank" rel="noreferrer">
                    <Video size={14} /> Join
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
