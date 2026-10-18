import { z } from "zod";

/**
 * Weekly maintenance windows in the environment's time zone (an IANA name,
 * UTC by default): a weekday (0 = Sunday), a local start time and a length.
 * A window may run past midnight (Saturday 23:00 for 3 hours ends Sunday
 * 02:00). No windows means deploys can run at any time.
 *
 * Daylight saving time, worked out with Intl (no time zone database of our
 * own):
 * - the length is real elapsed time, so a 2-hour window that spans a clock
 *   change still lasts 2 hours;
 * - a start that doesn't exist on that day (the hour skipped in spring)
 *   moves forward by the size of the gap (02:30 becomes 03:30);
 * - a start that happens twice (the hour repeated in autumn) uses the first
 *   one.
 */
export interface MaintenanceWindow {
  day: number;
  start: string;
  durationMin: number;
}

export const windowSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour, in the environment's time zone)"),
  durationMin: z.number().int().min(15).max(24 * 60),
});
export const windowsSchema = z.array(windowSchema).max(14);

/** The canonical IANA name for a time zone, or null if Intl doesn't know it. */
export function canonicalTimeZone(name: string): string | null {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(name)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** An IANA time zone such as Europe/Berlin or Asia/Kolkata, stored in its canonical spelling. */
export const timeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .transform((v, ctx) => {
    const tz = canonicalTimeZone(v);
    if (!tz) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An IANA time zone like Europe/Berlin, America/New_York or UTC" });
      return z.NEVER;
    }
    return tz;
  });

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall clock in that zone at instant t. */
export function localParts(t: number, timeZone: string) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/** How far the zone's wall clock is ahead of UTC at instant t, in ms. */
function offsetAt(t: number, timeZone: string) {
  const p = localParts(t, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/**
 * The instant a local wall-clock time happens in that zone. Date.UTC
 * normalises out-of-range days, so `day` may run past the month.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The offsets just before and after the wall time cover both sides of a clock change.
  const before = offsetAt(wall - 86400_000, timeZone);
  const after = offsetAt(wall + 86400_000, timeZone);
  const candidates = [...new Set([before, after])].map((o) => wall - o).filter((t) => wall - offsetAt(t, timeZone) === t);
  // Repeated hour: the earlier instant. Skipped hour: no candidate matches,
  // so shift by the gap (the pre-change offset puts it after the change).
  if (candidates.length) return Math.min(...candidates);
  return wall - before;
}

const WEEK_DAYS = 7;

function occurrence(w: MaintenanceWindow, sunday: { year: number; month: number; day: number }, weekOffset: number, timeZone: string) {
  const [h, m] = w.start.split(":").map(Number);
  const start = zonedTimeToUtc(sunday.year, sunday.month, sunday.day + weekOffset * WEEK_DAYS + w.day, h, m, timeZone);
  return { start: new Date(start), end: new Date(start + w.durationMin * 60_000) };
}

export interface WindowState {
  /** False when the environment has no windows: deploys are never held. */
  restricted: boolean;
  open: boolean;
  /** The window open now, if any. */
  current: { start: Date; end: Date } | null;
  /** The next window to open (after now). */
  next: { start: Date; end: Date } | null;
}

export function windowState(windows: MaintenanceWindow[], now = new Date(), timeZone = "UTC"): WindowState {
  if (!windows.length) return { restricted: false, open: true, current: null, next: null };
  // The local Sunday of the week that contains `now`, in the environment's zone.
  const today = localParts(now.getTime(), timeZone);
  const sunday = { year: today.year, month: today.month, day: today.day - today.weekday };
  let current: WindowState["current"] = null;
  let next: WindowState["next"] = null;
  for (const w of windows) {
    for (const offset of [-1, 0, 1]) {
      const o = occurrence(w, sunday, offset, timeZone);
      if (o.start <= now && now < o.end && (!current || o.end > current.end)) current = o;
      if (o.start > now && (!next || o.start < next.start)) next = o;
    }
  }
  return { restricted: true, open: !!current, current, next };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Tue 02:00–04:00 Europe/Berlin", in the environment's zone. */
export function describeWindow(w: { start: Date; end: Date }, timeZone = "UTC") {
  const s = localParts(w.start.getTime(), timeZone);
  const e = localParts(w.end.getTime(), timeZone);
  return `${WEEKDAYS[s.weekday]} ${pad(s.hour)}:${pad(s.minute)}–${pad(e.hour)}:${pad(e.minute)} ${timeZone}`;
}
