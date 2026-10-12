import { useState, type FormEvent } from "react";
import { Cloud } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { ErrorNote, Field, useAction } from "../components/ui";

/** Shown to a signed-in user who belongs to no organization (left or removed). */
export default function NoOrganization() {
  const { user, reloadMe, setOrgId, logout } = useAuth();
  const [name, setName] = useState("");
  const { busy, error, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ organization: { id: string } }>("/orgs", { method: "POST", body: { name } });
      setOrgId(r.organization.id);
      await reloadMe();
    });
  };
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand auth-brand">
          <Cloud size={24} /> Inveon Cloud
        </div>
        <h1>No organization</h1>
        <p className="muted">{user?.email} isn't a member of any organization. Open an invite link from a teammate, or create a new organization.</p>
        <form className="form" onSubmit={submit}>
          <Field label="Organization name">
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>
            Create organization
          </button>
        </form>
        <p className="center">
          <button className="btn btn-ghost btn-small" onClick={() => void logout()}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
