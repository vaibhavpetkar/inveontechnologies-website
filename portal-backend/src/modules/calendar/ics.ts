/**
 * Minimal iCalendar (RFC 5545) writer for meeting invites. Emailed as a
 * METHOD:REQUEST attachment, an event lands in Gmail, Outlook and Apple
 * Calendar without any integration; METHOD:CANCEL removes it again.
 */
export interface IcsEvent {
  uid: string;
  sequence: number;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  startsAt: Date;
  endsAt: Date;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[];
  cancelled?: boolean;
}

function stamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets are folded with CRLF + space.
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(ev: IcsEvent, now = new Date()): string {
  const description = [ev.description, ev.url ? `Join: ${ev.url}` : null].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Inveon Technologies//Portal//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${ev.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `SEQUENCE:${ev.sequence}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(ev.startsAt)}`,
    `DTEND:${stamp(ev.endsAt)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    ev.location || ev.url ? `LOCATION:${escapeText(ev.location || ev.url!)}` : null,
    ev.url ? `URL:${ev.url}` : null,
    `ORGANIZER;CN=${escapeText(ev.organizer.name)}:mailto:${ev.organizer.email}`,
    ...ev.attendees.map((a) => `ATTENDEE;CN=${escapeText(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${ev.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return lines.map(fold).join("\r\n") + "\r\n";
}
