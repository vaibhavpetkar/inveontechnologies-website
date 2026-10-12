import { useState, type FormEvent } from "react";
import { Globe, Lock, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { Domain, EnvironmentDetail, Job } from "../../lib/types";
import { dateTime, timeAgo } from "../../lib/format";
import { Empty, ErrorNote, Field, StatusBadge, useAction } from "../../components/ui";
import { JobView } from "../../components/JobView";

export function DomainsTab({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const [hostname, setHostname] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const action = useAction();
  const ip = detail.server.ipAddress;

  const add = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath(`/environments/${detail.environment.id}/domains`), { method: "POST", body: { hostname: hostname.trim().toLowerCase() } });
      setHostname("");
      reload();
    });
  };

  const verify = (d: Domain) =>
    void action.run(async () => {
      setMessage(null);
      const r = await api<{ verified: boolean; message?: string; job?: Job }>(orgPath(`/domains/${d.id}/verify`), { method: "POST" });
      if (r.job) setJobId(r.job.id);
      else setMessage(r.message ?? "DNS doesn't point here yet.");
      reload();
    });

  const issue = (d: Domain) =>
    void action.run(async () => {
      const r = await api<{ job: Job }>(orgPath(`/domains/${d.id}/issue`), { method: "POST" });
      setJobId(r.job.id);
      reload();
    });

  return (
    <div className="stack">
      {can("admin") && (
        <form className="card form" onSubmit={add}>
          <div className="btn-row align-end">
            <Field label="Add a domain">
              <input required value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="app.inveontechnologies.in" />
            </Field>
            <button className="btn btn-primary" disabled={action.busy}>
              Add
            </button>
          </div>
          {!detail.environment.activeSlot && <p className="muted small">Deploy the environment once before issuing certificates: nginx needs its upstream.</p>}
        </form>
      )}
      <ErrorNote error={action.error} />
      {message && <p className="note note-warn">{message}</p>}
      {detail.domains.length === 0 && <Empty icon={<Globe size={26} />} title="No domains" />}
      {detail.domains.map((d) => (
        <div className="card" key={d.id}>
          <div className="card-head">
            <h3>
              {d.status === "active" ? <Lock size={15} className="ic-ok" /> : <Globe size={15} />} {d.hostname}
            </h3>
            <StatusBadge status={d.status} />
          </div>
          {d.status !== "active" && (
            <div className="dns-box">
              <div className="muted small">Set this DNS record at your DNS provider:</div>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>A</td>
                    <td>
                      <code>{d.hostname}</code>
                    </td>
                    <td>{ip ? <code>{ip}</code> : <span className="text-bad">set the server's public IP first</span>}</td>
                  </tr>
                </tbody>
              </table>
              <p className="muted small">If the domain is behind Cloudflare, set the record to "DNS only" until the certificate is issued.</p>
            </div>
          )}
          <p className="muted small">
            {d.certExpiresAt ? `Certificate valid until ${dateTime(d.certExpiresAt)}. Renewal runs daily.` : d.dnsCheckedAt ? `DNS checked ${timeAgo(d.dnsCheckedAt)}.` : "DNS not checked yet."}
          </p>
          {d.lastError && d.status !== "active" && <ErrorNote error={d.lastError} />}
          {can("admin") && (
            <div className="card-actions">
              {d.status !== "active" && (
                <button className="btn btn-small btn-primary" disabled={action.busy} onClick={() => verify(d)}>
                  Verify DNS and issue certificate
                </button>
              )}
              {(d.status === "failed" || d.status === "active") && d.dnsCheckedAt && (
                <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={() => issue(d)}>
                  Re-issue
                </button>
              )}
              <button
                className="btn btn-small btn-ghost btn-danger"
                onClick={() => {
                  if (confirm(`Remove ${d.hostname}?`)) void action.run(async () => (await api(orgPath(`/domains/${d.id}`), { method: "DELETE" }), reload()));
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
      {jobId && (
        <div className="card">
          <h3 className="card-title">Certificate job</h3>
          <JobView key={jobId} jobId={jobId} onFinished={reload} />
        </div>
      )}
    </div>
  );
}
