import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link2, MapPin, Search, Video, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { ROLE_LABELS } from "../../lib/nav";
import { nextSlot, PROVIDER_META, toLocalInput, type Colleague, type Meeting, type Provider, type ProviderInfo } from "../../lib/calendar";
import { Avatar } from "../Avatar";

interface Props {
  existing: Meeting | null;
  day?: Date;
  people: Colleague[];
  providers: ProviderInfo[];
  onClose: () => void;
  onSaved: (meeting: Meeting) => void;
  /** Prefill a new meeting (e.g. a candidate's session from the applicants panel). */
  initialTitle?: string;
  initialInvited?: string[];
}

const DURATIONS = [15, 30, 45, 60, 90, 120];
const PROVIDER_ORDER: Provider[] = ["google_meet", "zoom", "manual", "none"];

/** Schedule a meeting or change one: time, people, and where to meet. */
export function EventDialog({ existing, day, people, providers, onClose, onSaved, initialTitle, initialInvited }: Props) {
  const { user, accessToken } = useAuth();
  const configured = useMemo(() => new Map(providers.map((p) => [p.name, p.configured])), [providers]);
  const defaultProvider: Provider = existing?.provider ?? (configured.get("google_meet") ? "google_meet" : configured.get("zoom") ? "zoom" : "manual");

  const initialStart = existing ? new Date(existing.startsAt) : nextSlot(day);
  const initialMinutes = existing ? Math.round((new Date(existing.endsAt).getTime() - new Date(existing.startsAt).getTime()) / 60000) : 30;
  const [form, setForm] = useState({
    title: existing?.title ?? initialTitle ?? "",
    start: toLocalInput(initialStart),
    minutes: initialMinutes,
    provider: defaultProvider,
    joinUrl: existing?.provider === "manual" ? existing.joinUrl ?? "" : "",
    location: existing?.location ?? "",
    description: existing?.description ?? "",
  });
  const [invited, setInvited] = useState<string[]>(existing ? existing.attendees.map((a) => a.id).filter((id) => id !== existing.organizer?.id) : initialInvited ?? []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return people.filter((p) => p.id !== user?.id && !invited.includes(p.id) && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))).slice(0, 6);
  }, [query, people, invited, user]);

  const durations = DURATIONS.includes(form.minutes) ? DURATIONS : [...DURATIONS, form.minutes].sort((a, b) => a - b);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const startsAt = new Date(form.start);
    const endsAt = new Date(startsAt.getTime() + form.minutes * 60000);
    const body = {
      title: form.title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      attendeeIds: invited,
      provider: form.provider,
      joinUrl: form.provider === "manual" ? form.joinUrl.trim() : null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };
    try {
      const res = existing
        ? await apiFetch<{ event: Meeting }>(`/api/v1/calendar/events/${existing.id}`, { method: "PUT", body, accessToken })
        : await apiFetch<{ event: Meeting }>("/api/v1/calendar/events", { method: "POST", body, accessToken });
      onSaved(res.event);
    } catch (err) {
      setError(err instanceof ApiError ? (err.code === "VALIDATION_ERROR" ? "Check the time and the meeting link." : err.message) : "Couldn't save the meeting.");
      setSaving(false);
    }
  }

  const add = (id: string) => {
    setInvited((ids) => [...ids, id]);
    setQuery("");
  };

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-dialog-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="event-dialog-title">{existing ? "Edit meeting" : "New meeting"}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label htmlFor="ev-title">Title</label>
          <input id="ev-title" autoFocus required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sprint planning" />
        </div>

        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="ev-start">Starts</label>
            <input id="ev-start" type="datetime-local" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ev-dur">Length</label>
            <select id="ev-dur" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}>
              {durations.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="ev-people">People</label>
          <div className="chip-input">
            <AnimatePresence initial={false}>
              {invited.map((id) => {
                const p = byId.get(id);
                return (
                  <motion.span key={id} className="chip" layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                    <Avatar email={p?.email ?? id} name={p?.name} size={20} />
                    {p?.name ?? "Someone"}
                    <button type="button" aria-label={`Remove ${p?.name ?? "person"}`} onClick={() => setInvited((ids) => ids.filter((x) => x !== id))}><X size={12} /></button>
                  </motion.span>
                );
              })}
            </AnimatePresence>
            <span className="chip-search">
              <Search size={15} />
              <input
                id="ev-people"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) {
                    e.preventDefault();
                    add(matches[0].id);
                  }
                }}
                placeholder={invited.length ? "Add more" : "Search by name or email"}
                autoComplete="off"
              />
            </span>
          </div>
          <AnimatePresence>
            {matches.length > 0 && (
              <motion.ul className="suggest" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => add(p.id)}>
                      <Avatar email={p.email} name={p.name} size={26} />
                      <span><strong>{p.name}</strong><span className="muted-small">{ROLE_LABELS[p.role]} · {p.email}</span></span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <div className="field">
          <label>Video call</label>
          <div className="provider-picker" role="radiogroup" aria-label="Video call">
            {PROVIDER_ORDER.map((name) => {
              const ready = name === "manual" || name === "none" || !!configured.get(name);
              const active = form.provider === name;
              return (
                <button
                  type="button"
                  key={name}
                  role="radio"
                  aria-checked={active}
                  disabled={!ready}
                  title={ready ? undefined : `${PROVIDER_META[name].label} isn't connected yet. An admin can set it up.`}
                  className={active ? "active" : ""}
                  onClick={() => setForm({ ...form, provider: name })}
                >
                  {active && <motion.span layoutId="provider-pick" className="provider-pick-bg" />}
                  <span>{name === "manual" ? <Link2 size={17} /> : name === "none" ? <MapPin size={17} /> : <Video size={17} />}</span>
                  <span>{PROVIDER_META[name].label}</span>
                  {!ready && <span className="provider-soon">Not set up</span>}
                </button>
              );
            })}
          </div>
          {(form.provider === "google_meet" || form.provider === "zoom") && !existing?.joinUrl && (
            <span className="muted-small">A {PROVIDER_META[form.provider].label} link is created when you save.</span>
          )}
        </div>

        {form.provider === "manual" && (
          <div className="field">
            <label htmlFor="ev-link">Meeting link</label>
            <input id="ev-link" type="url" required value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} placeholder="https://meet.google.com/… or https://zoom.us/j/…" />
          </div>
        )}
        {form.provider === "none" && (
          <div className="field">
            <label htmlFor="ev-loc">Where</label>
            <input id="ev-loc" maxLength={300} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Pune office, conference room 2" />
          </div>
        )}

        <div className="field">
          <label htmlFor="ev-desc">Agenda (optional)</label>
          <textarea id="ev-desc" rows={3} maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || form.title.trim().length < 2}>
            {saving ? "Saving…" : existing ? "Save and notify" : invited.length ? `Send ${invited.length} invite${invited.length > 1 ? "s" : ""}` : "Add to calendar"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
