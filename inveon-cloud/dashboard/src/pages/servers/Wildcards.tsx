import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useOrgPath } from "../../context/AuthContext";
import type { DnsView, Server } from "../../lib/types";
import { dateTime } from "../../lib/format";
import { ErrorNote, Field, Loading, Modal, StatusBadge, useAction } from "../../components/ui";

const STATUS: Record<string, string> = { issuing: "running", active: "success", failed: "failure" };

/**
 * DNS connections and wildcard certificates (*.<base> and <base>, DNS-01).
 * certbot runs on the chosen server; the TXT records are published by the
 * control plane with these connections, so no DNS credentials go to servers.
 */
export function WildcardsModal({ open, onClose, servers }: { open: boolean; onClose: () => void; servers: Server[] }) {
  const orgPath = useOrgPath();
  const view = useApi<DnsView>(open ? orgPath("/dns") : null, open ? 5000 : undefined);
  const [token, setToken] = useState("");
  const [form, setForm] = useState({ baseDomain: "", dnsProvider: "cloudflare", serverId: "" });
  const action = useAction();
  useEffect(() => setToken(""), [open]);
  useEffect(() => {
    if (!form.serverId && servers[0]) setForm((f) => ({ ...f, serverId: servers[0].id }));
  }, [servers, form.serverId]);

  const run = (fn: () => Promise<unknown>) =>
    void action.run(async () => {
      await fn();
      await view.reload();
    });
  const saveToken = (e: FormEvent) => {
    e.preventDefault();
    run(async () => (await api(orgPath("/dns/cloudflare"), { method: "PUT", body: { token } }), setToken("")));
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => (await api(orgPath("/wildcards"), { method: "POST", body: form }), setForm((f) => ({ ...f, baseDomain: "" }))));
  };

  const v = view.data;
  return (
    <Modal open={open} title="DNS and wildcard certificates" onClose={onClose} wide>
      {!v ? (
        <Loading />
      ) : (
        <div className="stack">
          <form className="form card" onSubmit={saveToken}>
            <h3>Cloudflare</h3>
            <p className="muted small">
              {v.connections.cloudflare.connected
                ? `Connected with token ${v.connections.cloudflare.tokenHint}, checked ${dateTime(v.connections.cloudflare.verifiedAt)}. The token is encrypted and never shown again.`
                : "Not connected."}
            </p>
            <Field label={v.connections.cloudflare.connected ? "Replace the API token" : "API token"} hint="My Profile, API Tokens, Create Token: Zone, Zone, Read and Zone, DNS, Edit, for the zones you use.">
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            </Field>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={action.busy || !token.trim()}>
                Check and save
              </button>
              {v.connections.cloudflare.connected && (
                <button type="button" className="btn btn-ghost btn-danger" disabled={action.busy} onClick={() => confirm("Disconnect Cloudflare?") && run(() => api(orgPath("/dns/cloudflare"), { method: "DELETE" }))}>
                  Disconnect
                </button>
              )}
            </div>
            <p className="muted small">
              Route 53: {v.connections.route53.connected ? "uses the AWS account connected on this page" : "connect an AWS account first"} (it needs route53:ListHostedZonesByName,
              route53:ChangeResourceRecordSets and route53:GetChange).
            </p>
          </form>

          <div className="card">
            <h3>Wildcard certificates</h3>
            <p className="muted small">
              One certificate for <code>*.base</code> and <code>base</code> on a server. Domains one label under the base that the server serves (preview environments, for
              instance) use it instead of a certificate of their own. Point both A records at the server.
            </p>
            {v.wildcards.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {v.wildcards.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <code>*.{w.baseDomain}</code>
                          <div className="muted small">
                            on {w.serverName} via {w.dnsProvider === "cloudflare" ? "Cloudflare" : "Route 53"} ({w.zoneName})
                          </div>
                        </td>
                        <td className="small">
                          {w.dnsRecords.map((r) => (
                            <div key={r.name}>
                              {r.type} {r.name} → {r.value ?? "set the server's IP"}
                            </div>
                          ))}
                        </td>
                        <td>
                          <StatusBadge status={STATUS[w.status] ?? w.status} /> <span className="muted small">{w.certExpiresAt ? `expires ${dateTime(w.certExpiresAt)}` : w.status}</span>
                          {w.lastError && <div className="muted small">{w.lastError}</div>}
                        </td>
                        <td className="btn-row no-margin">
                          {w.status !== "issuing" && (
                            <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={() => run(() => api(orgPath(`/wildcards/${w.id}/issue`), { method: "POST" }))}>
                              {w.status === "failed" ? "Retry" : "Reissue"}
                            </button>
                          )}
                          <button
                            className="btn btn-small btn-ghost btn-danger"
                            aria-label={`Delete *.${w.baseDomain}`}
                            disabled={action.busy}
                            onClick={() => confirm(`Delete the certificate for *.${w.baseDomain}?`) && run(() => api(orgPath(`/wildcards/${w.id}`), { method: "DELETE" }))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form className="form" onSubmit={create}>
              <Field label="Base domain" hint="For example preview.example.com (covers pr-12.preview.example.com).">
                <input required value={form.baseDomain} onChange={(e) => setForm({ ...form, baseDomain: e.target.value })} placeholder="preview.example.com" />
              </Field>
              <Field label="DNS provider">
                <select value={form.dnsProvider} onChange={(e) => setForm({ ...form, dnsProvider: e.target.value })}>
                  <option value="cloudflare" disabled={!v.connections.cloudflare.connected}>
                    Cloudflare{v.connections.cloudflare.connected ? "" : " (not connected)"}
                  </option>
                  <option value="route53" disabled={!v.connections.route53.connected}>
                    Route 53{v.connections.route53.connected ? "" : " (connect AWS first)"}
                  </option>
                </select>
              </Field>
              <Field label="Server" hint="The server that serves these hostnames (an environment's proxy, or the preview server).">
                <select value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value })}>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn btn-primary" disabled={action.busy || !form.baseDomain.trim() || !form.serverId}>
                Issue certificate
              </button>
            </form>
          </div>
          <ErrorNote error={view.error ?? action.error} />
        </div>
      )}
    </Modal>
  );
}
