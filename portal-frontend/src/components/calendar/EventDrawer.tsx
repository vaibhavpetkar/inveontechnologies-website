import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CalendarPlus, Clock, Download, MapPin, Pencil, Users, Video, X, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { API_BASE, apiFetch, ApiError } from "../../lib/api";
import { dayFmt, isLive, KIND_META, PROVIDER_META, RSVP_META, timeRange, type CalendarItem, type Meeting, isMarker, isMeeting, type Rsvp } from "../../lib/calendar";
import { useToast } from "../Toast";
import { Avatar } from "../Avatar";

interface Props {
  item: CalendarItem;
  onClose: () => void;
  onEdit: (meeting: Meeting) => void;
  onChanged: () => void;
}

const ANSWERS: Rsvp[] = ["accepted", "tentative", "declined"];

/** One calendar item: join, answer, add to your own calendar, or change it. */
export function EventDrawer({ item, onClose, onEdit, onChanged }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<Rsvp | null>(isMeeting(item) ? item.myResponse : null);
  const start = new Date(item.startsAt);
  const live = isLive(item);
  const ended = !isMarker(item) && new Date(item.endsAt) < new Date();
  // Show my own answer straight away in the people list too.
  const attendees = isMeeting(item) ? item.attendees.map((a) => (a.id === user?.id && response ? { ...a, response } : a)) : [];

  async function respond(r: Rsvp) {
    if (!isMeeting(item)) return;
    const previous = response;
    setResponse(r);
    try {
      await apiFetch(`/api/v1/calendar/events/${item.id}/respond`, { method: "POST", body: { response: r }, accessToken });
      onChanged();
    } catch (err) {
      setResponse(previous);
      toast(err instanceof ApiError ? err.message : "Couldn't save your answer.", "error");
    }
  }

  const noun = item.kind === "class" ? "class" : "meeting";

  async function cancelSeries() {
    if (!isMeeting(item) || !item.seriesId || !window.confirm("Cancel this and every later class in the series? Everyone is told by email.")) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ cancelled: number }>(`/api/v1/courses/classes/series/${item.seriesId}/cancel`, { method: "POST", accessToken });
      toast(`Cancelled ${r.cancelled} ${r.cancelled === 1 ? "class" : "classes"}`);
      onChanged();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel the classes.", "error");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!isMeeting(item) || !window.confirm(`Cancel this ${noun} for everyone? They'll be told by email.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/calendar/events/${item.id}/cancel`, { method: "POST", accessToken });
      toast(item.kind === "class" ? "Class cancelled" : "Meeting cancelled");
      onChanged();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel the meeting.", "error");
      setBusy(false);
    }
  }

  async function downloadIcs() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/calendar/events/${item.id}/ics`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.title.replace(/[^\w\- ]+/g, "").trim() || "meeting"}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Couldn't download the invite.", "error");
    }
  }

  const joinUrl = isMarker(item) || ended ? null : item.joinUrl;
  const linkUrl = isMarker(item) ? null : item.joinUrl;
  const meta = KIND_META[item.kind];

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="task-drawer event-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 360, damping: 38 }}
      >
        <div className="drawer-head">
          <span className={`pill pill-${meta.tone}`}>{meta.label}</span>
          {live && <span className="live-badge"><span />Now</span>}
          <button className="icon-button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}><X size={18} /></button>
        </div>
        <h2 className="drawer-title">{item.title}</h2>

        <ul className="event-facts">
          <li><Clock size={17} /><span><strong>{dayFmt.format(start)}</strong><span className="muted-small">{timeRange(item)}</span></span></li>
          {isMeeting(item) && item.provider !== "none" && linkUrl && (
            <li><Video size={17} /><span><strong>{item.provider === "manual" ? "Video call" : PROVIDER_META[item.provider].label}</strong><a className="muted-small event-link" href={linkUrl} target="_blank" rel="noreferrer">{linkUrl.replace(/^https?:\/\//, "")}</a></span></li>
          )}
          {isMeeting(item) && item.location && <li><MapPin size={17} /><span><strong>{item.location}</strong></span></li>}
          {isMeeting(item) && item.course && (
            <li><BookOpen size={17} /><span><Link href={`/courses/${item.course.id}`} className="event-course"><strong>{item.course.title}</strong></Link><span className="muted-small">Course</span></span></li>
          )}
          {isMeeting(item) && item.organizer && <li><CalendarPlus size={17} /><span><strong>{item.organizer.name}</strong><span className="muted-small">{item.kind === "class" ? "Teacher" : "Organiser"}</span></span></li>}
        </ul>

        {joinUrl && (
          <motion.a className={`btn join-btn${live ? " live" : ""}`} href={joinUrl} target="_blank" rel="noreferrer" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
            <Video size={18} /> {live ? "Join now" : item.kind === "class" ? "Join class" : "Join meeting"}
          </motion.a>
        )}

        {ended && <p className="muted-small">This {noun} has ended.</p>}

        {isMeeting(item) && response && !ended && item.organizer?.id !== user?.id && (
          <div className="rsvp">
            <span className="muted-small">Going?</span>
            <div className="segmented">
              {ANSWERS.map((r) => (
                <button key={r} type="button" className={response === r ? "active" : ""} onClick={() => respond(r)}>
                  {response === r && <motion.span layoutId="rsvp-pill" className="segmented-pill" />}
                  <span>{r === "accepted" ? "Yes" : r === "tentative" ? "Maybe" : "No"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isMeeting(item) && item.description && <p className="event-desc">{item.description}</p>}

        {isMeeting(item) && (
          <section className="event-people">
            <h3><Users size={16} /> {attendees.length} {attendees.length === 1 ? "person" : "people"}</h3>
            <ul>
              {attendees.map((a, i) => (
                <motion.li key={a.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                  <Avatar email={a.email} name={a.name} size={28} />
                  <span className="event-person">{a.name}{a.id === item.organizer?.id && <span className="muted-small"> · organiser</span>}</span>
                  <span className={`pill pill-${RSVP_META[a.response].tone}`}>{RSVP_META[a.response].label}</span>
                </motion.li>
              ))}
            </ul>
          </section>
        )}

        <div className="drawer-actions">
          {isMeeting(item) ? (
            <>
              <button className="btn btn-secondary" onClick={downloadIcs}><Download size={16} /> Add to my calendar</button>
              {item.canEdit && !ended && <button className="btn btn-secondary" onClick={() => onEdit(item)}><Pencil size={16} /> Edit</button>}
              {item.canEdit && !ended && <button className="btn btn-danger" disabled={busy} onClick={cancel}><XCircle size={16} /> Cancel {noun}</button>}
              {item.canEdit && !ended && item.seriesId && <button className="btn btn-secondary" disabled={busy} onClick={cancelSeries}>Cancel all upcoming</button>}
            </>
          ) : (
            <Link href={item.link} className="btn btn-secondary">{item.kind === "task_due" ? "Open task" : item.kind === "exam" ? (item.link.startsWith("/assessments") ? "Go to the exam" : "Open the opening") : "Open application"} <ArrowRight size={16} /></Link>
          )}
        </div>
      </motion.aside>
    </>
  );
}
