/**
 * Dates in notifications and emails. The team and candidates are in India,
 * so times read in IST unless a specific timezone is known (an interview
 * stores the one it was scheduled in).
 */
export function formatWhen(date: Date, timeZone = "Asia/Kolkata"): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: zone });
  } catch {
    zone = "Asia/Kolkata";
  }
  const text = new Intl.DateTimeFormat("en-IN", { timeZone: zone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  const label = zone === "Asia/Kolkata" ? "IST" : zone;
  return `${text} ${label}`;
}
