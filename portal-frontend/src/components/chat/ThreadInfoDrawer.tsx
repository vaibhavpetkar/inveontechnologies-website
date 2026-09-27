import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { LogOut, Pencil, Shield, UserMinus, UserPlus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { ChatPerson, ThreadInfo } from "../../lib/chat";
import { useToast } from "../Toast";
import { Avatar } from "../Avatar";

interface Props {
  info: ThreadInfo;
  people: ChatPerson[];
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}

/** Members and settings for the open chat: rename, add or remove people, make admins, leave. */
export function ThreadInfoDrawer({ info, people, onClose, onChanged, onLeft }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(info.title ?? "");
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const isGroup = info.kind === "group";
  const memberIds = useMemo(() => new Set(info.members.map((m) => m.id)), [info.members]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => !memberIds.has(p.id) && (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  }, [people, memberIds, query]);
  const heading = info.kind === "channel" ? `# ${info.title}` : isGroup ? info.title ?? "Group" : "Chat info";

  async function run(path: string, method: string, body: unknown, done: string) {
    setBusy(true);
    try {
      await apiFetch(path, { method, body, accessToken });
      toast(done);
      onChanged();
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (await run(`/api/v1/chat/groups/${info.id}`, "PATCH", { title: title.trim() }, "Group renamed")) setRenaming(false);
  }

  async function addPeople() {
    if (picked.length === 0) return;
    if (await run(`/api/v1/chat/groups/${info.id}/members`, "POST", { userIds: picked }, `Added ${picked.length} ${picked.length === 1 ? "person" : "people"}`)) {
      setPicked([]);
      setAdding(false);
    }
  }

  async function leave() {
    if (!window.confirm(isGroup ? "Leave this group?" : `Leave #${info.title}?`)) return;
    const path = isGroup ? `/api/v1/chat/groups/${info.id}/members/${user?.id}` : `/api/v1/communities/channels/${info.id}/leave`;
    if (await run(path, isGroup ? "DELETE" : "POST", undefined, isGroup ? "You left the group" : "You left the channel")) onLeft();
  }

  const canLeave = isGroup || (info.kind === "channel" && info.channelType !== "announcement");

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="task-drawer chat-info" role="dialog" aria-modal="true" aria-label={heading} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}>
        <div className="drawer-head">
          {renaming ? (
            <form className="inline-form chat-rename" onSubmit={rename}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={80} autoFocus aria-label="Group name" />
              <button className="btn btn-small" disabled={busy || title.trim().length < 2}>Save</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setRenaming(false)}>Cancel</button>
            </form>
          ) : (
            <h2 className="drawer-title">{heading}</h2>
          )}
          {isGroup && info.canManage && !renaming && (
            <button className="icon-button" aria-label="Rename group" title="Rename" onClick={() => setRenaming(true)}><Pencil size={16} /></button>
          )}
          <button className="icon-button" style={{ marginLeft: "auto" }} aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="drawer-section">
          <div className="chat-info-sub">
            <h3>{info.members.length} {info.members.length === 1 ? "member" : "members"}</h3>
            {isGroup && info.canManage && !adding && (
              <button className="btn btn-secondary btn-small" onClick={() => setAdding(true)}><UserPlus size={15} /> Add people</button>
            )}
          </div>

          {adding && (
            <div className="chat-add">
              <input placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" autoFocus />
              <ul className="chat-pick-list">
                {candidates.slice(0, 30).map((p) => (
                  <li key={p.id}>
                    <label className="chat-pick">
                      <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                      <Avatar email={p.email} name={p.name} size={30} />
                      <span><strong>{p.name}</strong><span className="muted-small">{p.email}</span></span>
                    </label>
                  </li>
                ))}
                {candidates.length === 0 && <li className="muted-small">Everyone is already here.</li>}
              </ul>
              <div className="modal-actions">
                <button className="btn btn-secondary btn-small" onClick={() => { setAdding(false); setPicked([]); }}>Cancel</button>
                <button className="btn btn-small" disabled={busy || picked.length === 0} onClick={addPeople}>Add {picked.length || ""}</button>
              </div>
            </div>
          )}

          <ul className="chat-members">
            {info.members.map((m) => {
              const admin = m.is_admin || m.channel_role === "admin" || m.channel_role === "owner";
              const me = m.id === user?.id;
              return (
                <li key={m.id}>
                  <Avatar email={m.email} name={m.name} size={36} />
                  <span className="chat-member-who">
                    <strong>{m.name}{me && " (you)"}</strong>
                    <span className="muted-small">{m.email}</span>
                  </span>
                  {admin && <span className="chat-admin-tag"><Shield size={12} /> Admin</span>}
                  {isGroup && info.canManage && !me && (
                    <span className="chat-member-actions">
                      {!m.is_admin && (
                        <button className="icon-button" title="Make admin" aria-label={`Make ${m.name} an admin`} disabled={busy} onClick={() => run(`/api/v1/chat/groups/${info.id}/admins/${m.id}`, "POST", undefined, `${m.name} is now an admin`)}>
                          <Shield size={15} />
                        </button>
                      )}
                      <button className="icon-button" title="Remove" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => run(`/api/v1/chat/groups/${info.id}/members/${m.id}`, "DELETE", undefined, `Removed ${m.name}`)}>
                        <UserMinus size={15} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {canLeave && (
          <button className="btn btn-danger chat-leave" disabled={busy} onClick={leave}>
            <LogOut size={16} /> {isGroup ? "Leave group" : "Leave channel"}
          </button>
        )}
      </motion.aside>
    </>
  );
}
