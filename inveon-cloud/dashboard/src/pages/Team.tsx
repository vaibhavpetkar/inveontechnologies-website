import { useState, type FormEvent } from "react";
import { MailPlus, Trash2, UserMinus, Users } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import { ROLE_RANK, type Invite, type Member, type Role } from "../lib/types";
import { dateTime } from "../lib/format";
import { CopyField, Empty, ErrorNote, Field, Loading, Modal, PageHeader, useAction } from "../components/ui";

const ROLES: { role: Role; text: string }[] = [
  { role: "owner", text: "Everything, including members, roles and the organization." },
  { role: "admin", text: "Servers, apps, environments, domains, backups, invites and the audit log." },
  { role: "developer", text: "Deploy, roll back, edit variables, read logs, take backups." },
  { role: "viewer", text: "Read-only. Secret values are never shown to anyone." },
];

export default function Team() {
  const orgPath = useOrgPath();
  const { user, org, can, reloadMe } = useAuth();
  const members = useApi<{ members: Member[] }>(orgPath("/members"));
  const invites = useApi<{ invites: Invite[] }>(can("admin") ? orgPath("/invites") : null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState<{ email: string; role: Role }>({ email: "", role: "developer" });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const action = useAction();

  const invite = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const r = await api<{ inviteUrl: string }>(orgPath("/invites"), { method: "POST", body: form });
      setInviting(false);
      setForm({ email: "", role: "developer" });
      setInviteUrl(r.inviteUrl);
      void invites.reload();
    });
  };

  const changeRole = (m: Member, role: Role) =>
    void action.run(async () => {
      await api(orgPath(`/members/${m.userId}`), { method: "PATCH", body: { role } });
      await members.reload();
      if (m.userId === user?.id) await reloadMe();
    });

  const remove = (m: Member) => {
    const self = m.userId === user?.id;
    if (!confirm(self ? `Leave ${org?.name}?` : `Remove ${m.email} from ${org?.name}?`)) return;
    void action.run(async () => {
      await api(orgPath(`/members/${m.userId}`), { method: "DELETE" });
      if (self) await reloadMe();
      else await members.reload();
    });
  };

  const revoke = (i: Invite) =>
    void action.run(async () => {
      await api(orgPath(`/invites/${i.id}`), { method: "DELETE" });
      await invites.reload();
    });

  const myRank = org ? ROLE_RANK[org.role] : 0;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={org?.name}
        actions={
          can("admin") && (
            <button className="btn btn-primary" onClick={() => setInviting(true)}>
              <MailPlus size={16} /> Invite
            </button>
          )
        }
      />
      <ErrorNote error={members.error ?? invites.error ?? action.error} />
      {members.loading && !members.data && <Loading />}
      {members.data && (
        <div className="card card-flush">
          <ul className="member-list">
            {members.data.members.map((m) => (
              <li key={m.userId}>
                <div className="member-who">
                  <strong>{m.name ?? m.email}</strong>
                  {m.userId === user?.id && <span className="muted small"> (you)</span>}
                  <div className="muted small truncate">{m.email}</div>
                </div>
                <div className="member-actions">
                  {can("owner") ? (
                    <select aria-label={`Role for ${m.email}`} value={m.role} disabled={action.busy} onChange={(e) => changeRole(m, e.target.value as Role)}>
                      {ROLES.map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="badge badge-muted">{m.role}</span>
                  )}
                  {(can("owner") || m.userId === user?.id) && (
                    <button className="icon-btn" title={m.userId === user?.id ? "Leave organization" : "Remove member"} aria-label={m.userId === user?.id ? "Leave organization" : `Remove ${m.email}`} disabled={action.busy} onClick={() => remove(m)}>
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {can("admin") && invites.data && (
        <div className="card">
          <h3 className="card-title">Pending invites</h3>
          {invites.data.invites.length === 0 ? (
            <p className="muted small">No pending invites.</p>
          ) : (
            <ul className="member-list">
              {invites.data.invites.map((i) => (
                <li key={i.id}>
                  <div className="member-who">
                    <strong className="truncate">{i.email}</strong>
                    <div className={`small ${i.expired ? "text-bad" : "muted"}`}>
                      {i.role} · {i.expired ? "expired" : `expires ${dateTime(i.expiresAt)}`}
                    </div>
                  </div>
                  <button className="icon-btn" aria-label={`Revoke invite for ${i.email}`} disabled={action.busy} onClick={() => revoke(i)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="card-title">
          <Users size={16} /> Roles
        </h3>
        <dl className="roles">
          {ROLES.map((r) => (
            <div key={r.role}>
              <dt>{r.role}</dt>
              <dd className="muted small">{r.text}</dd>
            </div>
          ))}
        </dl>
      </div>

      {members.data && members.data.members.length === 0 && <Empty title="No members" />}

      <Modal open={inviting} title="Invite a teammate" onClose={() => setInviting(false)}>
        <form className="form" onSubmit={invite}>
          <Field label="Email">
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role" hint="You can't invite someone above your own role.">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.filter((r) => ROLE_RANK[r.role] <= myRank).map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role}
                </option>
              ))}
            </select>
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-primary" disabled={action.busy}>
            Send invite
          </button>
        </form>
      </Modal>
      <Modal open={!!inviteUrl} title="Invite sent" onClose={() => setInviteUrl(null)} wide>
        {inviteUrl && (
          <div className="stack">
            <p>We emailed the link. You can also share it directly; it works once and expires in 7 days.</p>
            <CopyField value={inviteUrl} />
          </div>
        )}
      </Modal>
    </>
  );
}
