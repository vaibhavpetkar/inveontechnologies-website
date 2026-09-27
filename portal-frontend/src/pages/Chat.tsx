import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, Lock, Megaphone, MessageSquarePlus, Search, Users } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { shortWhen, threadTitle, type ChatPerson, type InboxThread, type ThreadKind } from "../lib/chat";
import { Avatar } from "../components/Avatar";
import { ThreadView } from "../components/chat/ThreadView";
import { NewChatDialog } from "../components/chat/NewChatDialog";

type Filter = "all" | "unread" | "groups" | "channels";

/** WhatsApp-style chat: an inbox of channels, groups and DMs on the left, the open chat on the right. */
export default function Chat() {
  const params = useParams<{ kind?: string; id?: string }>();
  const [, navigate] = useLocation();
  const { user, accessToken } = useAuth();
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [composing, setComposing] = useState(false);

  const openKind = (["channel", "dm", "group"] as ThreadKind[]).includes(params.kind as ThreadKind) ? (params.kind as ThreadKind) : null;
  const openId = openKind ? params.id ?? null : null;

  const loadInbox = useCallback(async () => {
    try {
      const r = await apiFetch<{ threads: InboxThread[] }>("/api/v1/chat/inbox", { accessToken });
      setThreads(r.threads);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setLocked(true);
      else setError("Couldn't load your chats.");
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    loadInbox();
    apiFetch<{ people: ChatPerson[] }>("/api/v1/chat/people", { accessToken }).then((r) => setPeople(r.people)).catch(() => undefined);
    const t = setInterval(loadInbox, 8000);
    return () => clearInterval(t);
  }, [accessToken, loadInbox]);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (threads ?? []).filter((t) => {
      if (filter === "unread" && t.unread === 0) return false;
      if (filter === "groups" && t.kind !== "group") return false;
      if (filter === "channels" && t.kind !== "channel") return false;
      return !q || threadTitle(t, user?.id).toLowerCase().includes(q);
    });
  }, [threads, query, filter, user]);
  const unreadTotal = threads?.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0) ?? 0;

  const open = (kind: ThreadKind, id: string) => navigate(`/chat/${kind}/${id}`);
  const current = threads?.find((t) => t.id === openId);

  if (locked) {
    return (
      <DashboardShell>
        <div className="chat-locked">
          <span className="chat-locked-icon"><Lock size={26} /></span>
          <h1>Community chat</h1>
          <p>Chat with the team, your mentors and other interns once you join a program. Finish your HR round and start your trial or pay the program fee to unlock it.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell wide>
      <div className={`chat-shell${openId ? " has-open" : ""}`}>
        <aside className="chat-list">
          <div className="chat-list-head">
            <h1>Chats</h1>
            <button className="icon-button chat-new" aria-label="New chat" title="New chat" onClick={() => setComposing(true)}><MessageSquarePlus size={20} /></button>
          </div>
          <label className="chat-search">
            <Search size={16} />
            <input placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search chats" />
          </label>
          <div className="chat-filters" role="tablist">
            {(["all", "unread", "groups", "channels"] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "unread" ? `Unread${unreadTotal ? ` ${unreadTotal}` : ""}` : f === "groups" ? "Groups" : "Channels"}
              </button>
            ))}
          </div>
          {error && <div className="error-banner">{error}</div>}
          {threads === null ? (
            <div className="skeleton-stack">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 58 }} />)}</div>
          ) : shown.length === 0 ? (
            <p className="empty">{query ? "No chats match." : filter === "unread" ? "You're all caught up." : "No chats yet."}</p>
          ) : (
            <ul className="chat-threads">
              <AnimatePresence initial={false}>
                {shown.map((t) => {
                  const title = threadTitle(t, user?.id);
                  const other = t.kind === "dm" ? t.members?.find((m) => m.id !== user?.id) : null;
                  const lastAuthor = t.last ? (t.last.authorId === user?.id ? "You" : peopleById.get(t.last.authorId)?.name.split(" ")[0]) : null;
                  return (
                    <motion.li key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <button className={`chat-thread${t.id === openId ? " active" : ""}${t.unread ? " unread" : ""}`} onClick={() => open(t.kind, t.id)}>
                        {other ? (
                          <Avatar email={other.email} name={other.name} size={44} />
                        ) : (
                          <span className={`chat-thread-icon ${t.kind}`}>
                            {t.kind === "group" ? <Users size={20} /> : t.channelType === "announcement" ? <Megaphone size={20} /> : <Hash size={20} />}
                          </span>
                        )}
                        <span className="chat-thread-main">
                          <span className="chat-thread-top">
                            <strong>{title}</strong>
                            {t.last && <time>{shortWhen(t.last.at)}</time>}
                          </span>
                          <span className="chat-thread-bottom">
                            <span className="chat-thread-last">
                              {t.last ? <>{t.kind !== "dm" && lastAuthor ? `${lastAuthor}: ` : t.kind === "dm" && lastAuthor === "You" ? "You: " : ""}{t.last.body}</> : <em>{t.kind === "channel" ? `${t.memberCount} ${t.memberCount === 1 ? "member" : "members"}` : "Say hello"}</em>}
                            </span>
                            {t.mentions > 0 && <span className="chat-at" title="You were mentioned">@</span>}
                            {t.unread > 0 && <span className="chat-unread">{t.unread > 99 ? "99+" : t.unread}</span>}
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </aside>

        <section className="chat-main">
          {openKind && openId ? (
            <ThreadView
              key={openId}
              kind={openKind}
              id={openId}
              people={people}
              inboxTitle={current ? threadTitle(current, user?.id) : null}
              onBack={() => navigate("/chat")}
              onChanged={loadInbox}
              onLeft={() => {
                navigate("/chat");
                loadInbox();
              }}
            />
          ) : (
            <div className="chat-empty">
              <motion.div className="chat-empty-art" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <MessageSquarePlus size={34} />
              </motion.div>
              <h2>Pick a chat</h2>
              <p>Message a teammate, start a group for your project, or say hello in #general. Type @ to mention someone.</p>
              <button className="btn" onClick={() => setComposing(true)}>Start a chat</button>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {composing && (
          <NewChatDialog
            people={people}
            onClose={() => setComposing(false)}
            onOpen={(kind, id) => {
              setComposing(false);
              loadInbox();
              open(kind, id);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
