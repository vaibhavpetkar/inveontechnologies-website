import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, MapPin, Radio, Video, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { dayFmt, isLive, nextSlot, PROVIDER_META, timeRange, toLocalInput, type Meeting, type Provider, type ProviderInfo } from "../../lib/calendar";
import { useToast } from "../Toast";

const DURATIONS = [30, 45, 60, 90, 120, 180];
const REPEATS = [
  { weeks: 1, label: "Just once" },
  { weeks: 4, label: "Weekly, 4 weeks" },
  { weeks: 8, label: "Weekly, 8 weeks" },
  { weeks: 12, label: "Weekly, 12 weeks" },
];
const PROVIDER_ORDER: Provider[] = ["google_meet", "zoom", "manual", "none"];

function ScheduleDialog({ courseId, courseTitle, onClose, onSaved }: { courseId: string; courseTitle: string; onClose: () => void; onSaved: (n: number, invited: number) => void }) {
  const { accessToken } = useAuth();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() => toLocalInput(nextSlot()));
  const [minutes, setMinutes] = useState(60);
  const [weeks, setWeeks] = useState(1);
  const [provider, setProvider] = useState<Provider>("manual");
  const [joinUrl, setJoinUrl] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ providers: ProviderInfo[] }>("/api/v1/calendar/providers", { accessToken })
      .then((r) => {
        setProviders(r.providers);
        const ready = r.providers.find((p) => (p.name === "google_meet" || p.name === "zoom") && p.configured);
        if (ready) setProvider(ready.name);
      })
      .catch(() => undefined);
  }, [accessToken]);
  const configured = useMemo(() => new Map(providers.map((p) => [p.name, p.configured])), [providers]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const startsAt = new Date(start);
    try {
      const r = await apiFetch<{ classes: Meeting[]; invited: number }>(`/api/v1/courses/${courseId}/classes`, {
        method: "POST",
        body: {
          title: title.trim() || undefined,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
          provider,
          joinUrl: provider === "manual" ? joinUrl.trim() : null,
          location: location.trim() || null,
          weeks,
        },
        accessToken,
      });
      onSaved(r.classes.length, r.invited);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't schedule the class.");
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-title"
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="class-title">Schedule a live class</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="class-name">Title</label>
          <input id="class-name" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={`${courseTitle}: live class`} />
        </div>
        <div className="class-when">
          <div className="field">
            <label htmlFor="class-start">Starts</label>
            <input id="class-start" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="class-length">Length</label>
            <select id="class-length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {DURATIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60} min` : ""}`}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="class-repeat">Repeat</label>
            <select id="class-repeat" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {REPEATS.map((r) => <option key={r.weeks} value={r.weeks}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Where</label>
          <div className="class-where" role="radiogroup">
            {PROVIDER_ORDER.filter((p) => p === "manual" || p === "none" || configured.get(p)).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={provider === p} className={provider === p ? "on" : ""} onClick={() => setProvider(p)}>
                {p === "none" ? <MapPin size={15} /> : <Video size={15} />} {PROVIDER_META[p].label}
              </button>
            ))}
          </div>
        </div>
        {provider === "manual" && (
          <div className="field">
            <label htmlFor="class-link">Class link</label>
            <input id="class-link" type="url" required value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} placeholder="https://meet.google.com/…" />
          </div>
        )}
        {provider === "none" && (
          <div className="field">
            <label htmlFor="class-place">Place</label>
            <input id="class-place" value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Pune office, room 2" />
          </div>
        )}
        <p className="muted-small">Everyone learning this course gets an invite, and people who enroll later are added to the classes still to come.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? "Scheduling…" : weeks > 1 ? `Schedule ${weeks} classes` : "Schedule class"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

/** A course's live classes: the next few, with a join button, and scheduling for staff. */
export function LiveClasses({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ classes: Meeting[]; canSchedule: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(
    () => apiFetch<{ classes: Meeting[]; canSchedule: boolean }>(`/api/v1/courses/${courseId}/classes`, { accessToken }).then(setData).catch(() => setData({ classes: [], canSchedule: false })),
    [courseId, accessToken],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!data || (!data.canSchedule && data.classes.length === 0)) return null;
  const upcoming = data.classes.filter((c) => new Date(c.endsAt) > new Date());

  return (
    <div className="panel live-classes">
      <h3><Radio size={17} /> Live classes</h3>
      {upcoming.length === 0 ? (
        <p className="muted-small">No classes scheduled yet.</p>
      ) : (
        <ul>
          {upcoming.slice(0, 5).map((c) => {
            const live = isLive(c);
            return (
              <li key={c.id}>
                <Link href={`/calendar?event=${c.id}`} className="live-class-when">
                  <strong>{dayFmt.format(new Date(c.startsAt))}</strong>
                  <span className="muted-small">{timeRange(c)}{c.location ? ` · ${c.location}` : ""}</span>
                </Link>
                {c.joinUrl && (
                  <a className={`btn btn-sm${live ? "" : " btn-secondary"}`} href={c.joinUrl} target="_blank" rel="noreferrer">
                    <Video size={14} /> {live ? "Join now" : "Join"}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {upcoming.length > 5 && <Link href="/calendar" className="link-button">{upcoming.length - 5} more on your calendar</Link>}
      {data.canSchedule && (
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}><CalendarPlus size={15} /> Schedule a class</button>
      )}
      <AnimatePresence>
        {open && (
          <ScheduleDialog
            courseId={courseId}
            courseTitle={courseTitle}
            onClose={() => setOpen(false)}
            onSaved={(n, invited) => {
              setOpen(false);
              toast(`${n === 1 ? "Class" : `${n} classes`} scheduled. ${invited} ${invited === 1 ? "learner" : "learners"} invited.`);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
