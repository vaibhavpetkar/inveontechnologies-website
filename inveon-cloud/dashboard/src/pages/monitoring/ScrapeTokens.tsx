import { useState, type FormEvent } from "react";
import { KeyRound, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useOrgPath } from "../../context/AuthContext";
import type { ScrapeToken } from "../../lib/types";
import { dateTime, timeAgo } from "../../lib/format";
import { CopyField, ErrorNote, Field, Modal, useAction } from "../../components/ui";

/** Prometheus scrape tokens (admins): create, shown once, revoke. */
export function ScrapeTokens() {
  const orgPath = useOrgPath();
  const list = useApi<{ tokens: ScrapeToken[] }>(orgPath("/scrape-tokens"));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("grafana");
  const [secret, setSecret] = useState<string | null>(null);
  const action = useAction();
  const endpoint = `${window.location.origin}/metrics`;

  const create = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const r = await api<{ secret: string }>(orgPath("/scrape-tokens"), { method: "POST", body: { name } });
      setAdding(false);
      setSecret(r.secret);
      void list.reload();
    });
  };
  const revoke = (t: ScrapeToken) => {
    if (!confirm(`Revoke "${t.name}"? Anything scraping with it stops at once.`)) return;
    void action.run(async () => (await api(orgPath(`/scrape-tokens/${t.id}`), { method: "DELETE" }), void list.reload()));
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <KeyRound size={16} /> Prometheus scrape tokens
        </h3>
        <button className="btn btn-small btn-primary" onClick={() => setAdding(true)}>
          <Plus size={14} /> Token
        </button>
      </div>
      <p className="muted small">
        <code>GET {endpoint}</code> with <code>Authorization: Bearer &lt;token&gt;</code> returns the latest values of this organization's servers in the Prometheus text format, for
        Prometheus or Grafana. Read-only; tokens are stored hashed.
      </p>
      <ErrorNote error={list.error ?? action.error} />
      {list.data && list.data.tokens.length > 0 && (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Token</th>
                <th scope="col" className="hide-sm">Last used</th>
                <th scope="col" className="right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.tokens.map((t) => (
                <tr key={t.id} className={t.revokedAt ? "row-archived" : ""}>
                  <td>{t.name}</td>
                  <td>
                    <code>{t.tokenPrefix}…</code>
                  </td>
                  <td className="muted small hide-sm" title={dateTime(t.lastUsedAt)}>
                    {t.revokedAt ? `revoked ${timeAgo(t.revokedAt)}` : timeAgo(t.lastUsedAt)}
                  </td>
                  <td className="right">
                    {!t.revokedAt && (
                      <button className="btn btn-small btn-danger" disabled={action.busy} onClick={() => revoke(t)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={adding} title="New scrape token" onClose={() => setAdding(false)}>
        <form className="form" onSubmit={create}>
          <Field label="Name" hint="Where it is used, for example grafana-cloud.">
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-primary" disabled={action.busy}>
            Create token
          </button>
        </form>
      </Modal>
      <Modal open={!!secret} title="Scrape token" onClose={() => setSecret(null)} wide>
        {secret && (
          <div className="stack">
            <p>Copy it now; it won't be shown again. A Prometheus scrape job:</p>
            <pre className="log">{`- job_name: inveon-cloud
  scheme: ${window.location.protocol.replace(":", "")}
  metrics_path: /metrics
  authorization:
    type: Bearer
    credentials: <token>
  static_configs:
    - targets: ["${window.location.host}"]`}</pre>
            <CopyField label="Token" value={secret} />
          </div>
        )}
      </Modal>
    </div>
  );
}
