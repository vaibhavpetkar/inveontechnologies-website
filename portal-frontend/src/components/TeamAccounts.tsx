import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth, type UserRole } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

interface Account { id: string; email: string; role: UserRole; emailVerified: boolean; createdAt: string }

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "candidate", label: "Candidate" },
  { value: "intern", label: "Intern" },
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

/** Super-admin only: create staff accounts and change roles (docs/permissions.md "Manage roles"). */
export function TeamAccounts() {
  const { user, accessToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<"staff" | "all">("staff");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", role: "hr" as UserRole });
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ users: Account[] }>("/api/v1/users", { accessToken })
      .then((r) => setAccounts(r.users))
      .catch(() => setError("Couldn't load accounts."));
  }, [accessToken]);

  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  async function changeRole(account: Account, role: UserRole) {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/users/${account.id}/role`, { method: "PUT", body: { role }, accessToken });
      setNotice(`${account.email} is now ${ROLE_OPTIONS.find((r) => r.value === role)?.label}. It takes effect within 15 minutes (they'll be asked to sign in again).`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change that role.");
    }
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreating(true);
    try {
      await apiFetch("/api/v1/users", { method: "POST", body: form, accessToken });
      setNotice(`Account created for ${form.email}. Share the temporary password with them securely and ask them to change it via "Forgot your password?".`);
      setForm({ email: "", password: "", role: form.role });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the account.");
    } finally {
      setCreating(false);
    }
  }

  const visible = (accounts ?? []).filter((a) => filter === "all" || a.role !== "candidate");

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.15rem" }}>Team accounts</h2>
      <p className="card-meta">Create HR, manager and admin accounts, and change anyone's role.</p>

      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}
      {notice && <div className="notice notice-info">{notice}</div>}

      <form className="inline-form" onSubmit={createAccount}>
        <div className="field">
          <label htmlFor="new-email">Email</label>
          <input id="new-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="new-password">Temporary password</label>
          <input id="new-password" type="text" required minLength={10} autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="field" style={{ flex: "0 1 160px" }}>
          <label htmlFor="new-role">Role</label>
          <select id="new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button className="btn" type="submit" disabled={creating}>{creating ? "Creating…" : "Create account"}</button>
      </form>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <button className={filter === "staff" ? "btn" : "btn btn-secondary"} onClick={() => setFilter("staff")}>Staff</button>
        <button className={filter === "all" ? "btn" : "btn btn-secondary"} onClick={() => setFilter("all")}>Everyone</button>
      </div>

      {accounts === null && !error && <p className="empty">Loading…</p>}
      {accounts !== null && (
        <table className="data-table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Created</th></tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id}>
                <td style={{ wordBreak: "break-all" }}>{a.email}</td>
                <td>
                  <select
                    aria-label={`Role for ${a.email}`}
                    value={a.role}
                    disabled={a.id === user?.id}
                    title={a.id === user?.id ? "You can't change your own role" : undefined}
                    onChange={(e) => changeRole(a, e.target.value as UserRole)}
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td>{new Date(a.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
