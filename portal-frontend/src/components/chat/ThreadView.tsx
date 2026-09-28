import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Hash, Info, Megaphone, Paperclip, SendHorizontal, Trash2, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { dayLabel, splitMentions, targetFor, type ChatMessage, type ChatPerson, type ThreadInfo, type ThreadKind } from "../../lib/chat";
import { Avatar } from "../Avatar";
import { ThreadInfoDrawer } from "./ThreadInfoDrawer";
import { ChatAttachments } from "./ChatAttachments";
import { UploadButton } from "../files/UploadButton";
import { FileChip } from "../files/FileChip";
import type { StoredFile } from "../../lib/files";

interface Props {
  kind: ThreadKind;
  id: string;
  people: ChatPerson[];
  inboxTitle: string | null;
  onBack: () => void;
  onChanged: () => void;
  onLeft: () => void;
}

const PAGE = 50;
const GROUP_GAP_MS = 5 * 60 * 1000;

export function ThreadView({ kind, id, people, inboxTitle, onBack, onChanged, onLeft }: Props) {
  const { user, accessToken } = useAuth();
  const [info, setInfo] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<StoredFile[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentioned = useRef(new Map<string, ChatPerson>());
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const lastRead = useRef(0);
  const target = useMemo(() => targetFor(kind, id), [kind, id]);
  const qs = kind === "channel" ? `channelId=${id}` : `conversationId=${id}`;

  const loadInfo = useCallback(() => apiFetch<ThreadInfo>(`/api/v1/chat/threads/${kind}/${id}`, { accessToken }).then(setInfo), [kind, id, accessToken]);

  const markRead = useCallback(
    (seq: number) => {
      if (seq <= lastRead.current) return;
      lastRead.current = seq;
      apiFetch("/api/v1/messages/read-state", { method: "POST", body: { ...target, lastReadSeq: seq }, accessToken }).then(onChanged).catch(() => undefined);
    },
    [target, accessToken, onChanged],
  );

  useEffect(() => {
    loadInfo().catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't open this chat."));
    apiFetch<{ messages: ChatMessage[] }>(`/api/v1/messages?${qs}&limit=${PAGE}`, { accessToken })
      .then((r) => {
        setMessages(r.messages);
        setHasOlder(r.messages.length === PAGE);
        if (r.messages.length) markRead(r.messages[r.messages.length - 1].seqNumber);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load messages."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  // Poll for new messages while the chat is open.
  useEffect(() => {
    if (messages === null) return;
    const t = setInterval(async () => {
      const after = messages.length ? messages[messages.length - 1].seqNumber : 0;
      try {
        const r = await apiFetch<{ messages: ChatMessage[] }>(`/api/v1/messages?${qs}&afterSeq=${after}&limit=100`, { accessToken });
        if (r.messages.length) {
          setMessages((m) => mergeMessages(m ?? [], r.messages));
          if (document.visibilityState === "visible") markRead(r.messages[r.messages.length - 1].seqNumber);
        }
      } catch {
        // Next tick will try again.
      }
    }, 3000);
    return () => clearInterval(t);
  }, [messages, qs, accessToken, markRead]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    if (!messages?.length) return;
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    const r = await apiFetch<{ messages: ChatMessage[] }>(`/api/v1/messages?${qs}&beforeSeq=${messages[0].seqNumber}&limit=${PAGE}`, { accessToken });
    stickToBottom.current = false;
    setMessages((m) => mergeMessages(r.messages, m ?? []));
    setHasOlder(r.messages.length === PAGE);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  const members = info?.members ?? [];
  const peopleById = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]));
    for (const m of members) if (!map.has(m.id)) map.set(m.id, m);
    return map;
  }, [people, members]);
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.id !== user?.id && (m.name.toLowerCase().includes(q) || m.email.toLowerCase().startsWith(q))).slice(0, 6);
  }, [mentionQuery, members, user]);

  function onType(value: string) {
    setText(value);
    const caret = input.current?.selectionStart ?? value.length;
    const m = /(?:^|\s)@([\w.'-]*(?: [\w.'-]*)?)$/.exec(value.slice(0, caret));
    setMentionQuery(m && m[1].length <= 30 ? m[1] : null);
    setMentionIndex(0);
    autosize();
  }

  function pickMention(p: ChatPerson) {
    const el = input.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.'-]*(?: [\w.'-]*)?)$/, `@${p.name} `);
    const next = before + text.slice(caret);
    mentioned.current.set(p.id, p);
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  function autosize() {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function send() {
    const body = text.trim();
    if ((!body && pending.length === 0) || sending) return;
    setSending(true);
    setError(null);
    const mentionedUserIds = [...mentioned.current.values()].filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
    try {
      const r = await apiFetch<{ message: ChatMessage }>("/api/v1/messages", { method: "POST", body: { ...target, body, mentionedUserIds, fileUrls: pending.map((f) => f.url) }, accessToken });
      stickToBottom.current = true;
      setMessages((m) => mergeMessages(m ?? [], [r.message]));
      markRead(r.message.seqNumber);
      setText("");
      setPending([]);
      mentioned.current.clear();
      requestAnimationFrame(autosize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Message not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function remove(m: ChatMessage) {
    try {
      await apiFetch(`/api/v1/messages/${m.id}`, { method: "DELETE", accessToken });
      setMessages((all) => all?.map((x) => (x.id === m.id ? { ...x, deletedAt: new Date().toISOString(), body: "[message deleted]" } : x)) ?? null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that message.");
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(suggestions[mentionIndex]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  const other = kind === "dm" ? members.find((m) => m.id !== user?.id) : null;
  const title = kind === "channel" ? info?.title ?? "" : kind === "group" ? info?.title ?? "Group" : other?.name ?? inboxTitle ?? "Direct message";
  const subtitle = kind === "dm" ? other?.email : `${members.length} ${members.length === 1 ? "member" : "members"}${kind === "channel" && info?.channelType === "announcement" ? " · announcements" : ""}`;
  const showNames = kind !== "dm";

  return (
    <div className="chat-thread-view">
      <header className="chat-head">
        <button className="icon-button chat-back" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={20} /></button>
        {other ? (
          <Avatar email={other.email} name={other.name} size={38} />
        ) : (
          <span className={`chat-thread-icon ${kind}`}>{kind === "group" ? <Users size={18} /> : info?.channelType === "announcement" ? <Megaphone size={18} /> : <Hash size={18} />}</span>
        )}
        <button className="chat-head-title" onClick={() => setShowInfo(true)}>
          <strong>{title}</strong>
          <span className="muted-small">{subtitle}</span>
        </button>
        <button className="icon-button" aria-label="Chat info" onClick={() => setShowInfo(true)}><Info size={19} /></button>
      </header>

      <div className="chat-scroll" ref={scroller} onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}>
        {hasOlder && <button className="chat-older" onClick={loadOlder}>Load earlier messages</button>}
        {messages === null ? (
          <div className="chat-loading"><div className="skeleton" style={{ height: 40, width: "55%" }} /><div className="skeleton" style={{ height: 40, width: "40%", marginLeft: "auto" }} /></div>
        ) : messages.length === 0 ? (
          <div className="chat-first">
            <p>{kind === "dm" ? `This is the start of your chat with ${title}.` : kind === "group" ? `You're in ${title}. Say hi to the group!` : `Welcome to #${title}.`}</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const grouped = !!prev && !newDay && prev.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_GAP_MS;
            const mine = m.authorId === user?.id;
            const author = peopleById.get(m.authorId);
            const deleted = !!m.deletedAt;
            const mentionsMe = !mine && !deleted && !!user && splitMentions(m.body, [...peopleById.values()]).some((p) => p.mention?.id === user.id);
            return (
              <Fragment key={m.id}>
                {newDay && <div className="chat-day"><span>{dayLabel(m.createdAt)}</span></div>}
                <motion.div className={`chat-msg${mine ? " mine" : ""}${grouped ? " grouped" : ""}${mentionsMe ? " mentions-me" : ""}`} initial={i >= messages.length - 3 ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}>
                  {!mine && showNames && (grouped ? <span className="chat-avatar-space" /> : <Avatar email={author?.email ?? m.authorId} name={author?.name} size={30} />)}
                  <div className={`chat-bubble${deleted ? " deleted" : ""}`}>
                    {!mine && showNames && !grouped && <span className="chat-author">{author?.name ?? "Someone"}</span>}
                    {!deleted && m.attachments && m.attachments.length > 0 && <ChatAttachments items={m.attachments} />}
                    {(deleted || m.body) && (
                      <span className="chat-text">
                        {deleted ? "This message was deleted" : splitMentions(m.body, [...peopleById.values()]).map((p, j) => (p.mention ? <span key={j} className={`chat-mention${p.mention.id === user?.id ? " me" : ""}`}>{p.text}</span> : <Fragment key={j}>{p.text}</Fragment>))}
                      </span>
                    )}
                    <span className="chat-meta">
                      {m.editedAt && !deleted && "edited · "}
                      {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  {mine && !deleted && <button className="chat-msg-action" aria-label="Delete message" title="Delete" onClick={() => remove(m)}><Trash2 size={14} /></button>}
                </motion.div>
              </Fragment>
            );
          })
        )}
      </div>

      {error && <div className="error-banner chat-error">{error}</div>}

      <div className="chat-compose">
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.ul className="mention-pop" role="listbox" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              {suggestions.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === mentionIndex}>
                  <button type="button" className={i === mentionIndex ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}>
                    <Avatar email={p.email} name={p.name} size={24} /> <strong>{p.name}</strong> <span className="muted-small">{p.email}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        {info && !info.canPost ? (
          <p className="chat-readonly"><Megaphone size={15} /> Only admins can post in #{info.title}.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="chat-pending">
                {pending.map((f) => (
                  <FileChip key={f.id} file={f} onRemove={() => setPending((list) => list.filter((x) => x.id !== f.id))} removeLabel="Don't send" />
                ))}
              </div>
            )}
            <UploadButton
              purpose="chat_attachment"
              className="chat-attach"
              label=""
              title="Attach a file"
              icon={<Paperclip size={19} />}
              disabled={pending.length >= 5}
              onUploaded={(f) => {
                setPending((list) => [...list, f]);
                input.current?.focus();
              }}
            />
            <textarea
              ref={input}
              rows={1}
              value={text}
              placeholder={kind === "dm" ? "Message" : "Message · type @ to mention"}
              aria-label="Message"
              onChange={(e) => onType(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={10000}
            />
            <motion.button className="chat-send" aria-label="Send" onClick={send} disabled={(!text.trim() && pending.length === 0) || sending} whileTap={{ scale: 0.9 }}>
              <SendHorizontal size={19} />
            </motion.button>
          </>
        )}
      </div>

      <AnimatePresence>
        {showInfo && info && (
          <ThreadInfoDrawer
            info={info}
            people={people}
            onClose={() => setShowInfo(false)}
            onChanged={() => {
              loadInfo();
              onChanged();
            }}
            onLeft={onLeft}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function mergeMessages(a: ChatMessage[], b: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.seqNumber - y.seqNumber);
}
