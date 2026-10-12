import { useState, type FormEvent } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { EnvVar } from "../../lib/types";
import { timeAgo } from "../../lib/format";
import { Empty, ErrorNote, Field, Loading, useAction } from "../../components/ui";

export function VariablesTab({ environmentId }: { environmentId: string }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const base = orgPath(`/environments/${environmentId}/vars`);
  const { data, error, loading, reload } = useApi<{ vars: EnvVar[] }>(base);
  const [form, setForm] = useState({ key: "", value: "", isSecret: false });
  const action = useAction();

  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(`${base}/${encodeURIComponent(form.key.trim())}`, { method: "PUT", body: { value: form.value, isSecret: form.isSecret } });
      setForm({ key: "", value: "", isSecret: false });
      void reload();
    });
  };

  return (
    <div className="stack">
      <p className="muted small">
        Written to <code>.env</code> next to the compose file on each deploy (use <code>env_file: .env</code> in your services). Values are encrypted at rest. Secrets are write-only: nobody
        can read them back here. Changes apply on the next deploy.
      </p>
      {can("developer") && (
        <form className="card form" onSubmit={save}>
          <div className="row">
            <Field label="Key">
              <input required pattern="[A-Za-z_][A-Za-z0-9_]*" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="DATABASE_URL" />
            </Field>
            <Field label="Value">
              <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} type={form.isSecret ? "password" : "text"} autoComplete="off" />
            </Field>
          </div>
          <div className="btn-row">
            <label className="check">
              <input type="checkbox" checked={form.isSecret} onChange={(e) => setForm({ ...form, isSecret: e.target.checked })} /> Secret (write-only)
            </label>
            <button className="btn btn-primary" disabled={action.busy}>
              Save variable
            </button>
          </div>
          <ErrorNote error={action.error} />
        </form>
      )}
      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && data.vars.length === 0 && <Empty title="No variables yet" />}
      {data && data.vars.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th className="nowrap">Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.vars.map((v) => (
                <tr key={v.key}>
                  <td>
                    <code>{v.key}</code>
                  </td>
                  <td className="value-cell">
                    {v.isSecret ? (
                      <span className="muted">
                        <Lock size={13} /> {v.masked}
                      </span>
                    ) : (
                      <code className="truncate">{v.value}</code>
                    )}
                  </td>
                  <td className="muted small nowrap">{timeAgo(v.updatedAt)}</td>
                  <td className="nowrap right">
                    {can("developer") && (
                      <>
                        <button className="icon-btn" aria-label={`Edit ${v.key}`} onClick={() => setForm({ key: v.key, value: v.isSecret ? "" : (v.value ?? ""), isSecret: v.isSecret })}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`Delete ${v.key}`}
                          onClick={() => {
                            if (confirm(`Delete ${v.key}?`)) void action.run(async () => (await api(`${base}/${encodeURIComponent(v.key)}`, { method: "DELETE" }), reload()));
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
