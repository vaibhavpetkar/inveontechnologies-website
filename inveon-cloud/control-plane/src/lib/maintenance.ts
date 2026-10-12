import { z } from "zod";

/**
 * Weekly maintenance windows, in UTC: a weekday (0 = Sunday), a start time
 * and a length. A window may run past midnight (Saturday 23:00 for 3 hours
 * ends Sunday 02:00). No windows means deploys can run at any time.
 */
export interface MaintenanceWindow {
  day: number;
  start: string;
  durationMin: number;
}

export const windowSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour, UTC)"),
  durationMin: z.number().int().min(15).max(24 * 60),
});
export const windowsSchema = z.array(windowSchema).max(14);

const WEEK_MS = 7 * 86400_000;

/** Start of the UTC week (Sunday 00:00) containing `d`. */
function weekStart(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay());
}

function occurrence(w: MaintenanceWindow, week: number) {
  const [h, m] = w.start.split(":").map(Number);
  const start = week + w.day * 86400_000 + (h * 60 + m) * 60_000;
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

export function windowState(windows: MaintenanceWindow[], now = new Date()): WindowState {
  if (!windows.length) return { restricted: false, open: true, current: null, next: null };
  const base = weekStart(now);
  let current: WindowState["current"] = null;
  let next: WindowState["next"] = null;
  for (const w of windows) {
    for (const offset of [-1, 0, 1]) {
      const o = occurrence(w, base + offset * WEEK_MS);
      if (o.start <= now && now < o.end && (!current || o.end > current.end)) current = o;
      if (o.start > now && (!next || o.start < next.start)) next = o;
    }
  }
  return { restricted: true, open: !!current, current, next };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const describeWindow = (w: { start: Date; end: Date }) =>
  `${DAYS[w.start.getUTCDay()]} ${w.start.toISOString().slice(11, 16)}–${w.end.toISOString().slice(11, 16)} UTC`;
