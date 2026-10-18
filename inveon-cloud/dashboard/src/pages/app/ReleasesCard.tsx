import { useEffect, useState, type FormEvent } from "react";
import { Archive, History, RotateCcw } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { DeployedRelease, EnvironmentDetail, Job } from "../../lib/types";
import { dateTime, shortSha, timeAgo } from "../../lib/format";
import { Empty, ErrorNote, Field, useAction } from "../../components/ui";

/**
 * Releases that went live here. The newest N keep their images on the server
 * and can be rolled back to; older ones are archived (images removed).
 */
export function ReleasesCard({ detail, reload, onJob, refreshKey }: { detail: EnvironmentDetail; reload: () => void; onJob: (jobId: string) => void; refreshKey: number }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const env = detail.environment;
  const list = useApi<{ keepReleases: number; releases: DeployedRelease[] }>(orgPath(`/environments/${env.id}/releases`));
  const [keep, setKeep] = useState(env.keepReleases);
  const action = useAction();
  useEffect(() => setKeep(env.keepReleases), [env.id, env.keepReleases]);
  useEffect(() => {
    if (refreshKey) void list.reload();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rollbackTo = (r: DeployedRelease) => {
    if (!confirm(`Roll back to ${shortSha(r.commitSha)}? It is deployed like any release: started next to the live one and switched when healthy.`)) return;
    void action.run(async () => {
      const res = await api<{ job: Job }>(orgPath(`/environments/${env.id}/rollback`), { method: "POST", body: { releaseId: r.releaseId } });
      onJob(res.job.id);
    });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath(`/environments/${env.id}`), { method: "PATCH", body: { keepReleases: Number(keep) } });
      const res = await api<{ job: Job | null; archived: number }>(orgPath(`/environments/${env.id}/releases/archive`), { method: "POST" });
      if (res.job) onJob(res.job.id);
      reload();
      void list.reload();
    });
  };

  const rows = list.data?.releases ?? [];
  const archived = rows.filter((r) => r.archivedAt).length;

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <History size={16} /> Releases
        </h3>
        <span className="muted small">
          keeps the last {env.keepReleases}
          {archived > 0 && ` · ${archived} archived`}
        </span>
      </div>
      <p className="muted small">
        Older releases are archived: their images are removed from {detail.server.name} and they can't be rolled back to. The live and previous releases are always kept, and images
        another environment on the server still uses are left alone. Deploying an archived commit again works (it is pulled or built afresh).
      </p>
      <ErrorNote error={list.error ?? action.error} />
      {list.data && rows.length === 0 && <Empty title="Nothing deployed here yet" />}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.releaseId} className={r.archivedAt ? "row-archived" : ""}>
                  <td>
                    <code className="sha">{shortSha(r.commitSha)}</code> <span className="truncate">{r.commitMessage?.split("\n")[0]}</span>
                  </td>
                  <td className="nowrap">
                    {r.current && <span className="badge badge-ok">live</span>}
                    {r.previous && <span className="badge badge-info">previous</span>}
                    {r.archivedAt && (
                      <span className="badge badge-muted" title={`Archived ${dateTime(r.archivedAt)}`}>
                        <Archive size={12} /> archived
                      </span>
                    )}
                  </td>
                  <td className="muted small nowrap hide-sm" title={dateTime(r.lastDeployedAt)}>
                    live {timeAgo(r.lastDeployedAt)}
                  </td>
                  <td className="right nowrap">
                    {can("developer") && !r.current && !r.archivedAt && (
                      <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={() => rollbackTo(r)}>
                        <RotateCcw size={14} /> Roll back to this
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {can("admin") && (
        <form className="btn-row align-end" onSubmit={save}>
          <Field label="Releases to keep" hint="At least 2 (the live and previous ones).">
            <input type="number" min={2} max={100} value={keep} onChange={(e) => setKeep(Number(e.target.value))} />
          </Field>
          <button className="btn btn-ghost" disabled={action.busy}>
            Save and archive older
          </button>
        </form>
      )}
    </div>
  );
}
