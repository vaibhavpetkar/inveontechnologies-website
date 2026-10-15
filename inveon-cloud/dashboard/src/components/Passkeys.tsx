import { useEffect, useState, type FormEvent } from "react";
import { Fingerprint, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { createPasskey, passkeysSupported, type CreationOptionsJSON } from "../lib/webauthn";
import { timeAgo } from "../lib/format";
import type { Passkey } from "../lib/types";
import { ErrorNote, Field, Loading, Modal, useAction } from "./ui";

/** Adding a passkey: the password again, then the browser's passkey prompt. */
export function AddPasskeyForm({ onAdded, submitLabel = "Add passkey" }: { onAdded: () => void | Promise<void>; submitLabel?: string }) {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const action = useAction();
  if (!passkeysSupported()) return <p className="muted small">This browser doesn't support passkeys.</p>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const opts = await api<{ ceremonyId: string; publicKey: CreationOptionsJSON }>("/auth/passkeys/register/options", { method: "POST", body: { password } });
      const credential = await createPasskey(opts.publicKey);
      await api("/auth/passkeys/register", { method: "POST", body: { ceremonyId: opts.ceremonyId, name: name.trim() || undefined, credential } });
      setPassword("");
      setName("");
      await onAdded();
    });
  };
  return (
    <form className="form" onSubmit={submit}>
      <Field label="Name" hint="So you can tell your passkeys apart, for example MacBook or YubiKey.">
        <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Passkey" />
      </Field>
      <Field label="Your password" hint="Asked again because a passkey can sign in on its own.">
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorNote error={action.error} />
      <button className="btn btn-primary" disabled={action.busy}>
        <Fingerprint size={16} /> {action.busy ? "Waiting for your passkey…" : submitLabel}
      </button>
    </form>
  );
}

/** Account page card: the user's passkeys. */
export function PasskeysCard() {
  const { reloadMe } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const [password, setPassword] = useState("");
  const load = useAction();
  const action = useAction();

  const refresh = async () => setPasskeys((await api<{ passkeys: Passkey[] }>("/auth/passkeys")).passkeys);
  useEffect(() => {
    void load.run(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rename = (p: Passkey) => {
    const name = prompt("Name for this passkey", p.name)?.trim();
    if (!name || name === p.name) return;
    void action.run(async () => {
      await api(`/auth/passkeys/${p.id}`, { method: "PATCH", body: { name } });
      await refresh();
    });
  };

  return (
    <div className="card">
      <h3 className="card-title">
        <Fingerprint size={16} /> Passkeys
      </h3>
      <p className="muted small">
        Sign in with your device's screen lock or a security key instead of a password and code. A passkey counts as two-factor authentication.
      </p>
      <ErrorNote error={load.error ?? action.error} />
      {!passkeys && !load.error && <Loading />}
      {passkeys && passkeys.length > 0 && (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Added</th>
                <th>Last used</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {passkeys.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name} {p.backedUp && <span className="badge badge-info" title="Synced to your other devices by your password manager or platform">synced</span>}
                  </td>
                  <td>{timeAgo(p.createdAt)}</td>
                  <td>{p.lastUsedAt ? timeAgo(p.lastUsedAt) : "never"}</td>
                  <td className="row-actions">
                    <button className="btn btn-small btn-ghost" onClick={() => rename(p)} aria-label={`Rename ${p.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-small btn-ghost btn-danger" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {passkeys && passkeys.length === 0 && !adding && <p className="muted">No passkeys yet.</p>}
      {adding ? (
        <>
          <AddPasskeyForm
            onAdded={async () => {
              setAdding(false);
              await refresh();
              await reloadMe();
            }}
          />
          <button className="btn btn-ghost btn-small" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </>
      ) : (
        passkeysSupported() && (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add a passkey
          </button>
        )
      )}

      <Modal open={!!removing} title={`Remove ${removing?.name ?? ""}`} onClose={() => setRemoving(null)}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api(`/auth/passkeys/${removing!.id}`, { method: "DELETE", body: { password } });
              setRemoving(null);
              setPassword("");
              await refresh();
              await reloadMe();
            });
          }}
        >
          <p>The passkey stops working here. Delete it from the device or password manager too.</p>
          <Field label="Your password">
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-danger" disabled={action.busy}>
            Remove passkey
          </button>
        </form>
      </Modal>
    </div>
  );
}
