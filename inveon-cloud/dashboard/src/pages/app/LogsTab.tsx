import { useState, type FormEvent } from "react";
import { ScrollText } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail, Job } from "../../lib/types";
import { ErrorNote, Field, useAction } from "../../components/ui";
import { JobView } from "../../components/JobView";
import { LiveLogs } from "./LiveLogs";

/** Container logs: the last lines (a short job), or a live stream (Follow). */
export function LogsTab({ detail }: { detail: EnvironmentDetail }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const [lines, setLines] = useState(200);
  const [service, setService] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const action = useAction();
  const deployed = !!detail.environment.activeSlot;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const r = await api<{ job: Job }>(orgPath(`/environments/${detail.environment.id}/logs`), {
        method: "POST",
        body: { lines: Number(lines), ...(service.trim() ? { service: service.trim() } : {}) },
      });
      setJobId(r.job.id);
    });
  };

  if (!can("developer")) return <p className="note note-info">Developers and above can read container logs.</p>;
  if (!deployed) return <p className="note note-info">Deploy this environment first; logs come from the live containers.</p>;

  return (
    <div className="stack">
      <LiveLogs detail={detail} />
      <div className="card">
        <h3 className="card-title">
          <ScrollText size={16} /> Last lines
        </h3>
        <form className="btn-row align-end" onSubmit={submit}>
          <Field label="Lines">
            <input type="number" min={1} max={5000} value={lines} onChange={(e) => setLines(Number(e.target.value))} />
          </Field>
          <Field label="Service (optional)">
            <input value={service} pattern="[A-Za-z0-9._-]{1,63}" placeholder="all services" onChange={(e) => setService(e.target.value)} />
          </Field>
          <button className="btn btn-primary" disabled={action.busy}>
            Fetch logs
          </button>
        </form>
        <p className="muted small">
          Reads the last lines from the <strong>{detail.environment.activeSlot}</strong> containers on {detail.server.name}. Values from secret variables can appear in logs if your app prints them.
        </p>
        <ErrorNote error={action.error} />
      </div>
      {jobId && (
        <div className="card">
          <JobView key={jobId} jobId={jobId} />
        </div>
      )}
    </div>
  );
}
