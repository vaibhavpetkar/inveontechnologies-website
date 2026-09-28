import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Hash, Megaphone, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { BrowseChannel, ChatPerson, ThreadKind } from "../../lib/chat";
import { Avatar } from "../Avatar";

type Tab = "dm" | "group" | "channels";

interface Props {
  people: ChatPerson[];
  onClose: () => void;
  onOpen: (kind: ThreadKind, id: string) => void;
}

/** Start a direct message, create a group, or browse and join channels. */
export function NewChatDialog({ people, onClose, onOpen }: Props) {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<Tab>("dm");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [channels, setChannels] = useState<BrowseChannel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "channels" || channels) return;
    apiFetch<{ channels: BrowseChannel[] }>("/api/v1/chat/channels", { accessToken })
      .then((r) => setChannels(r.channels))
      .catch(() => setChannels([]));
  }, [tab, channels, accessToken]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [people, query]);

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const message = (userId: string) =>
    act(async () => {
      const r = await apiFetch<{ conversation: { id: string } }>("/api/v1/chat/dm", { method: "POST", body: { userId }, accessToken });
      onOpen("dm", r.conversation.id);
    });

  const createGroup = () =>
    act(async () => {
      const r = await apiFetch<{ group: { id: string } }>("/api/v1/chat/groups", { method: "POST", body: { title: title.trim(), memberIds: picked }, accessToken });
      onOpen("group", r.group.id);
    });

  const openChannel = (c: BrowseChannel) =>
    act(async () => {
      if (!c.joined) await apiFetch(`/api/v1/communities/channels/${c.id}/join`, { method: "POST", accessToken });
      onOpen("channel", c.id);
    });

  const personList = (onPick: (p: ChatPerson) => void, multi: boolean) => (
    <ul className="chat-pick-list">
      {matches.slice(0, 40).map((p) => (
        <li key={p.id}>
          {multi ? (
            <label className="chat-pick">
              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => onPick(p)} />
              <Avatar email={p.email} name={p.name} size={32} />
              <span><strong>{p.name}</strong><span className="muted-small">{p.email}</span></span>
            </label>
          ) : (
            <button className="chat-pick" disabled={busy} onClick={() => onPick(p)}>
              <Avatar email={p.email} name={p.name} size={32} />
              <span><strong>{p.name}</strong><span className="muted-small">{p.email}</span></span>
              <span className="chat-pick-role">{p.role}</span>
            </button>
          )}
        </li>
      ))}
      {matches.length === 0 && <li className="muted-small">No one matches.</li>}
    </ul>
  );

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className="modal chat-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="new-chat-title">New chat</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="seg-tabs" role="tablist">
          {([["dm", "Message"], ["group", "New group"], ["channels", "Channels"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setError(null); }}>{label}</button>
          ))}
        </div>
        {error && <div className="error-banner">{error}</div>}

        {tab !== "channels" && (
          <input className="chat-dialog-search" placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" autoFocus />
        )}

        {tab === "dm" && personList((p) => message(p.id), false)}

        {tab === "group" && (
          <>
            <div className="field">
              <label htmlFor="group-name">Group name</label>
              <input id="group-name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Portal sprint team" maxLength={80} />
            </div>
            {personList((p) => setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id])), true)}
            <div className="modal-actions">
              <span className="muted-small" style={{ marginRight: "auto" }}>{picked.length} selected</span>
              <button className="btn" disabled={busy || title.trim().length < 2 || picked.length === 0} onClick={createGroup}>Create group</button>
            </div>
          </>
        )}

        {tab === "channels" && (
          channels === null ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : channels.length === 0 ? (
            <p className="empty">No channels yet.</p>
          ) : (
            <ul className="chat-pick-list">
              {channels.map((c) => (
                <li key={c.id}>
                  <button className="chat-pick" disabled={busy} onClick={() => openChannel(c)}>
                    <span className="chat-thread-icon channel">{c.type === "announcement" ? <Megaphone size={16} /> : <Hash size={16} />}</span>
                    <span><strong>{c.name}</strong><span className="muted-small">{c.community} · {c.member_count} {c.member_count === 1 ? "member" : "members"}</span></span>
                    <span className="chat-pick-role">{c.joined ? "Open" : "Join"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </motion.div>
    </motion.div>
  );
}
