export type ThreadKind = "channel" | "dm" | "group";

export interface ChatPerson {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface InboxThread {
  kind: ThreadKind;
  id: string;
  title: string | null;
  channelType: "public" | "announcement" | null;
  community: string | null;
  memberCount: number;
  members: ChatPerson[] | null;
  unread: number;
  mentions: number;
  last: { body: string; authorId: string; at: string } | null;
}

export interface ThreadInfo {
  kind: ThreadKind;
  id: string;
  title: string | null;
  channelType?: "public" | "announcement";
  members: (ChatPerson & { is_admin?: boolean; channel_role?: string })[];
  canPost: boolean;
  canManage: boolean;
  mutedUntil?: string | null;
}

export interface ChatMessage {
  id: string;
  seqNumber: number;
  channelId: string | null;
  conversationId: string | null;
  authorId: string;
  body: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface BrowseChannel {
  id: string;
  name: string;
  type: "public" | "announcement";
  community_id: string;
  community: string;
  member_count: number;
  joined: boolean;
}

/** The name shown for a thread: channel name, group title, or the other person in a DM. */
export function threadTitle(t: Pick<InboxThread, "kind" | "title" | "members">, meId: string | undefined) {
  if (t.kind === "channel") return `# ${t.title}`;
  if (t.kind === "group") return t.title ?? "Group";
  const other = t.members?.find((m) => m.id !== meId);
  return other?.name ?? "Direct message";
}

export function targetFor(kind: ThreadKind, id: string) {
  return kind === "channel" ? { channelId: id } : { conversationId: id };
}

/** "10:42", "Yesterday", "Mon", or "12 Sep" for the inbox. */
export function shortWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits a message into text and @mention pieces for the given people (longest names first). */
export function splitMentions(body: string, people: ChatPerson[]): { text: string; mention?: ChatPerson }[] {
  const named = people.filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
  if (named.length === 0 || !body.includes("@")) return [{ text: body }];
  const re = new RegExp(`@(${named.map((p) => escape(p.name)).join("|")})`, "g");
  const out: { text: string; mention?: ChatPerson }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ text: m[0], mention: named.find((p) => p.name === m[1]) });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}
