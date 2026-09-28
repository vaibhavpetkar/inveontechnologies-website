import type { UserRole } from "../context/AuthContext";

export type Provider = "none" | "manual" | "google_meet" | "zoom";
export type Rsvp = "needs_action" | "accepted" | "declined" | "tentative";

export interface Attendee {
  id: string;
  name: string;
  email: string;
  response: Rsvp;
}

export interface Meeting {
  id: string;
  /** A "class" is a live class for a course; otherwise it behaves like any meeting. */
  kind: "meeting" | "class";
  course?: { id: string; title: string } | null;
  seriesId?: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  provider: Provider;
  joinUrl: string | null;
  cancelled: boolean;
  organizer: { id: string; name: string } | null;
  attendees: Attendee[];
  myResponse: Rsvp | null;
  canEdit: boolean;
}

export interface Interview {
  id: string;
  kind: "interview";
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  joinUrl: string | null;
  link: string;
}

export interface TaskDue {
  id: string;
  kind: "task_due";
  title: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  link: string;
}

export type CalendarItem = Meeting | Interview | TaskDue;

/** Meetings and live classes: things with attendees, answers and an organiser. */
export const isMeeting = (item: CalendarItem): item is Meeting => item.kind === "meeting" || item.kind === "class";

export interface ProviderInfo {
  name: Provider;
  label: string;
  configured: boolean;
}

export interface Colleague {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const KIND_META: Record<CalendarItem["kind"], { label: string; tone: string }> = {
  meeting: { label: "Meeting", tone: "blue" },
  class: { label: "Live class", tone: "green" },
  interview: { label: "Interview", tone: "violet" },
  task_due: { label: "Task due", tone: "amber" },
};

export const PROVIDER_META: Record<Provider, { label: string; short: string }> = {
  none: { label: "No video call", short: "In person" },
  manual: { label: "Paste a link", short: "Link" },
  google_meet: { label: "Google Meet", short: "Meet" },
  zoom: { label: "Zoom", short: "Zoom" },
};

export const RSVP_META: Record<Rsvp, { label: string; tone: string }> = {
  needs_action: { label: "Not answered", tone: "slate" },
  accepted: { label: "Going", tone: "green" },
  tentative: { label: "Maybe", tone: "amber" },
  declined: { label: "Not going", tone: "red" },
};

// --- Dates. Weeks start on Monday, times show in the viewer's timezone. ---

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Six weeks of days covering the month, Monday first. */
export function monthGrid(month: Date) {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
export const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" });
export const shortDayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric" });
export const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

export function timeRange(item: CalendarItem) {
  const s = new Date(item.startsAt);
  if (item.kind === "task_due") return `Due ${timeFmt.format(s)}`;
  return `${timeFmt.format(s)} – ${timeFmt.format(new Date(item.endsAt))}`;
}

/** yyyy-mm-ddThh:mm in local time, for <input type="datetime-local">. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Next half hour from now, for a new meeting's default start. */
export function nextSlot(day?: Date) {
  const now = new Date();
  const base = day && !sameDay(day, now) ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0) : now;
  if (base === now) {
    base.setSeconds(0, 0);
    base.setMinutes(base.getMinutes() < 30 ? 30 : 60);
  }
  return base;
}

export function isLive(item: CalendarItem, now = new Date()) {
  return item.kind !== "task_due" && new Date(item.startsAt).getTime() - 10 * 60_000 <= now.getTime() && new Date(item.endsAt) > now;
}
