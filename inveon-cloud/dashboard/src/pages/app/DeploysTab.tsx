import { useState } from "react";
import { Rocket, RotateCcw } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { Deployment, EnvironmentDetail, Job } from "../../lib/types";
import { dateTime, shortSha, timeAgo } from "../../lib/format";
import { Empty, ErrorNote, Field, StatusBadge, useAction } from "../../components/ui";
import { JobView } from "../../components/JobView";

export function DeploysTab({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const env = detail.environment;
  const list = useApi<{ deployments: Deployment[] }>(orgPath(`/environments/${env.id}/deployments`), 8000);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sha, setSha] = useState("");
  const action = useAction();

  const deploy = (kind: "deploy" | "rollback") =>
    void action.run(async () => {
      const r = await api<{ job: Job }>(orgPath(`/environments/${env.id}/${kind}`), { method: "POST", body: kind === "deploy" && sha ? { commitSha: sha.trim() } : {} });
      setJobId(r.job.id);
      setSha("");
      void list.reload();
    });

  const shown = jobId ?? list.data?.deployments[0]?.jobId ?? null;

  return (
    <div className="stack">
      <div className="card">
        <div className="release-row">
          <div>
            <div className="muted small">Live release</div>
            {detail.currentRelease ? (
              <>
                <code className="sha">{shortSha(detail.currentRelease.commitSha)}</code> {detail.currentRelease.commitMessage?.split("\n")[0]}
              </>
            ) : (
              <span className="muted">Not deployed yet</span>
            )}
          </div>
          <div>
            <div className="muted small">Previous release</div>
            {detail.previousRelease ? (
              <>
                <code className="sha">{shortSha(detail.previousRelease.commitSha)}</code> {detail.previousRelease.commitMessage?.split("\n")[0]}
              </>
            ) : (
              <span className="muted">None</span>
            )}
          </div>
        </div>
        {can("developer") && (
          <div className="deploy-actions">
            <Field label="Commit SHA (optional)" hint={`Leave empty to deploy the head of ${detail.app.branch}.`}>
              <input value={sha} onChange={(e) => setSha(e.target.value)} placeholder="40-character SHA" pattern="[0-9a-f]{40}" />
            </Field>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={action.busy} onClick={() => deploy("deploy")}>
                <Rocket size={16} /> Deploy
              </button>
              <button
                className="btn btn-ghost"
                disabled={action.busy || !detail.previousRelease}
                title={detail.previousRelease ? `Roll back to ${shortSha(detail.previousRelease.commitSha)}` : "No previous release"}
                onClick={() => {
                  if (confirm(`Roll back to ${shortSha(detail.previousRelease!.commitSha)}?`)) deploy("rollback");
                }}
              >
                <RotateCcw size={16} /> Roll back
              </button>
            </div>
          </div>
        )}
        <ErrorNote error={action.error} />
      </div>

      {shown && (
        <div className="card">
          <h3 className="card-title">{jobId ? "Deploy log" : "Latest deploy"}</h3>
          <JobView
            key={shown}
            jobId={shown}
            onFinished={() => {
              reload();
              void list.reload();
            }}
          />
        </div>
      )}

      <div className="card">
        <h3 className="card-title">History</h3>
        <ErrorNote error={list.error} />
        {list.data && list.data.deployments.length === 0 && <Empty title="No deploys yet">Push to {detail.app.branch} or press Deploy.</Empty>}
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {list.data?.deployments.map((d) => (
                <tr key={d.id} className={`clickable ${shown === d.jobId ? "selected" : ""}`} onClick={() => setJobId(d.jobId)}>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    <code className="sha">{shortSha(d.commitSha)}</code> <span className="truncate">{d.commitMessage?.split("\n")[0]}</span>
                  </td>
                  <td className="muted small nowrap">
                    {d.kind === "rollback" ? "rollback" : "deploy"} · {d.slot}
                  </td>
                  <td className="muted small nowrap" title={dateTime(d.createdAt)}>
                    {timeAgo(d.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
