import { useState } from "react";
import { Crown, Network, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail, ReplicasView, Server } from "../../lib/types";
import { ErrorNote, Field, Loading, StatusBadge, useAction } from "../../components/ui";

const STATUS: Record<string, string> = { adding: "pending", active: "online", removing: "pending", failed: "failure" };

/**
 * The servers an environment runs on. With more than one, deploys roll out
 * one server at a time (primary first) and the proxy's nginx spreads
 * requests over every healthy server.
 */
export function ServersTab({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const env = detail.environment;
  const view = useApi<ReplicasView>(orgPath(`/environments/${env.id}/replicas`), 5000);
  const servers = useApi<{ servers: Server[] }>(can("admin") ? orgPath("/servers") : null);
  const [adding, setAdding] = useState("");
  const [proxy, setProxy] = useState("");
  const action = useAction();

  if (view.error) return <ErrorNote error={view.error} />;
  if (!view.data) return <Loading />;
  const v = view.data;
  const isPreview = env.previewPr !== null;
  const used = new Set(v.replicas.map((r) => r.serverId));
  const candidates = (servers.data?.servers ?? []).filter((s) => !used.has(s.id) && s.provisionState !== "terminated");
  const done = new Set(v.rollout?.done ?? []);
  const rolling = v.rollout && (v.rollout.status === "running" || v.rollout.status === "pending");

  const act = (fn: () => Promise<unknown>) =>
    void action.run(async () => {
      await fn();
      await view.reload();
      reload();
    });

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>
            <Network size={16} /> Servers
          </h3>
          <span className="muted small">{v.pooled ? `${v.replicas.filter((r) => r.status === "active").length} servers behind ${v.proxy?.name ?? "the proxy"}` : "one server"}</span>
        </div>
        <p className="muted small">
          Deploys go to each server in turn, primary first; a server's health check must pass before the next one is updated, and if one fails the servers already updated go
          back to the previous release. Release commands, backups and logs run on the primary.
        </p>
        {rolling && (
          <p className="note note-info small" role="status">
            Rolling out: {v.rollout!.done.length} of {v.rollout!.serverIds.length} servers updated.
          </p>
        )}
        {v.rollout?.status === "failure" && v.rollout.failedServerId && (
          <p className="note note-bad small">
            The last rollout failed on {v.replicas.find((r) => r.serverId === v.rollout!.failedServerId)?.serverName ?? "a server"}; the servers already updated were rolled back.
          </p>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Server</th>
                <th>Address the proxy uses</th>
                <th>Running</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {v.replicas.map((r) => (
                <tr key={r.serverId}>
                  <td>
                    {r.serverName} {r.primary && <span className="badge badge-info">primary</span>} {r.proxy && <span className="badge badge-muted">proxy</span>}
                  </td>
                  <td className="small"><code>{r.proxy ? "local" : (r.privateIpAddress ?? r.ipAddress ?? "no IP")}{v.pooled && r.listenPort ? `:${r.listenPort}` : ""}</code></td>
                  <td className="small">
                    {r.activeSlot ?? "not deployed"}
                    {rolling && v.rollout!.serverIds.includes(r.serverId) ? (done.has(r.serverId) ? " · updated" : " · waiting") : ""}
                  </td>
                  <td>
                    <StatusBadge status={STATUS[r.status] ?? r.status} /> {r.status !== "active" && <span className="muted small">{r.status}</span>}
                    {r.error && <div className="muted small">{r.error}</div>}
                  </td>
                  <td className="btn-row no-margin">
                    {can("admin") && !r.primary && r.status === "active" && (
                      <button
                        className="btn btn-small btn-ghost"
                        title="Run release commands, backups and logs here"
                        disabled={action.busy}
                        onClick={() => confirm(`Make ${r.serverName} the primary? Backups and release commands run there from now on.`) && act(() => api(orgPath(`/environments/${env.id}/replicas/${r.serverId}/primary`), { method: "POST" }))}
                      >
                        <Crown size={14} /> Make primary
                      </button>
                    )}
                    {can("admin") && !r.primary && !r.proxy && r.status !== "removing" && (
                      <button
                        className="btn btn-small btn-ghost btn-danger"
                        aria-label={`Remove ${r.serverName}`}
                        disabled={action.busy}
                        onClick={() => confirm(`Take ${r.serverName} out of the pool and stop the app there?`) && act(() => api(orgPath(`/environments/${env.id}/replicas/${r.serverId}`), { method: "DELETE" }))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.proxy?.dedicated && (
          <p className="muted small">
            Proxy: {v.proxy.name} ({v.proxy.ipAddress ?? "no IP"}), a dedicated server that serves the domains and forwards to the servers above.
          </p>
        )}
        {can("admin") && !isPreview && (
          <div className="btn-row">
            <Field label="Add a server" hint="The live release is deployed there first; it joins the pool once healthy. Set its private IP (Servers) if it shares a network with the proxy.">
              <select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose a server…</option>
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.privateIpAddress ? `(${s.privateIpAddress})` : s.ipAddress ? `(${s.ipAddress})` : "(no IP)"}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="btn btn-small"
              disabled={!adding || action.busy}
              onClick={() => act(async () => (await api(orgPath(`/environments/${env.id}/replicas`), { method: "POST", body: { serverId: adding } }), setAdding("")))}
            >
              <Plus size={14} /> Add
            </button>
            {v.pooled && (
              <button className="btn btn-small btn-ghost" disabled={action.busy} title="Write the listeners and the pool again" onClick={() => act(() => api(orgPath(`/environments/${env.id}/replicas/sync`), { method: "POST" }))}>
                Update proxy
              </button>
            )}
          </div>
        )}
        {can("admin") && !isPreview && (
          <div className="btn-row">
            <Field label="Proxy" hint={detail.domains.length ? "Remove the domains before moving them: their certificates live on the proxy." : "The server whose nginx serves the domains: one of the servers above, or a separate one."}>
              <select value={proxy || v.proxy?.id || ""} onChange={(e) => setProxy(e.target.value)} disabled={detail.domains.length > 0}>
                {(servers.data?.servers ?? [])
                  .filter((s) => s.provisionState !== "terminated")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {used.has(s.id) ? "" : " (dedicated)"}
                    </option>
                  ))}
              </select>
            </Field>
            <button
              className="btn btn-small"
              disabled={!proxy || proxy === v.proxy?.id || action.busy || detail.domains.length > 0}
              onClick={() => act(async () => (await api(orgPath(`/environments/${env.id}/proxy`), { method: "PUT", body: { serverId: proxy } }), setProxy("")))}
            >
              Set proxy
            </button>
          </div>
        )}
        {isPreview && <p className="muted small">Preview environments run on one server.</p>}
        <ErrorNote error={action.error} />
      </div>
    </div>
  );
}
