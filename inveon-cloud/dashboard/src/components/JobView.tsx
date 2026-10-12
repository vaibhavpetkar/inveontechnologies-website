import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Server as ServerIcon } from "lucide-react";
import { api, stream } from "../lib/api";
import { useAuth, useOrgPath } from "../context/AuthContext";
import type { Job, JobStep } from "../lib/types";
import { dateTime, duration } from "../lib/format";
import { ErrorNote, Loading, StatusBadge, StepIcon, useAction } from "./ui";

const TERMINAL = ["success", "failure", "cancelled"];

/** A job with its steps and live logs (SSE while it runs). */
export function JobView({ jobId, onFinished }: { jobId: string; onFinished?: (job: Job) => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const cancel = useAction();
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    let stop = () => {};
    const refetch = () =>
      api<{ job: Job; steps: JobStep[] }>(orgPath(`/jobs/${jobId}`))
        .then((r) => {
          setJob(r.job);
          setSteps(r.steps);
        })
        .catch((e) => setError(e.message));
    stop = stream(orgPath(`/jobs/${jobId}/stream`), {
      onEvent(event, data) {
        const d = data as { job?: Job; steps?: JobStep[]; step?: JobStep; stepId?: string; chunk?: string };
        if (event === "snapshot" && d.job && d.steps) {
          setJob(d.job);
          setSteps(d.steps);
        } else if (event === "step" && d.step) {
          const s = d.step;
          setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, ...s, log: p.log } : p)));
          if (TERMINAL.includes(s.status)) void refetch();
        } else if (event === "log" && d.stepId && d.chunk) {
          setSteps((prev) => prev.map((p) => (p.id === d.stepId ? { ...p, log: (p.log ?? "") + d.chunk } : p)));
        } else if (event === "job" && d.job) {
          setJob((j) => ({ ...(j ?? ({} as Job)), ...d.job! }));
          if (TERMINAL.includes(d.job.status)) void refetch().then(() => finishedRef.current?.(d.job!));
        }
      },
    });
    return () => stop();
  }, [jobId, orgPath]);

  if (error) return <ErrorNote error={error} />;
  if (!job) return <Loading />;

  const isOpen = (s: JobStep) => open[s.id] ?? (s.status === "running" || s.status === "failure" || (job.type === "logs" && s.status === "success"));

  return (
    <div className="job-view">
      <div className="job-meta">
        <StatusBadge status={job.status} />
        <span className="muted">
          <ServerIcon size={14} /> {job.serverName ?? "server"} · created {dateTime(job.createdAt)}
          {job.claimedAt && ` · ${duration(job.claimedAt, job.finishedAt)}`}
        </span>
        {!TERMINAL.includes(job.status) && can("developer") && (
          <button className="btn btn-small btn-ghost" disabled={cancel.busy} onClick={() => cancel.run(() => api(orgPath(`/jobs/${job.id}/cancel`), { method: "POST" }))}>
            Cancel
          </button>
        )}
      </div>
      {job.status === "pending" && <p className="note note-info">Waiting for the server's agent to pick this up. If it stays here, check that the server is online.</p>}
      <ErrorNote error={job.error && job.status !== "success" ? job.error : null} />
      <ErrorNote error={cancel.error} />
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.id} className={`step step-${s.status}`}>
            <button className="step-head" onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen(s) }))} aria-expanded={isOpen(s)}>
              <StepIcon status={s.status} />
              <span className="step-name">{s.name}</span>
              <span className="step-time muted">{s.startedAt ? duration(s.startedAt, s.finishedAt) : ""}</span>
              {isOpen(s) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {isOpen(s) && <pre className="log">{s.log || (s.status === "pending" ? "Not started." : "No output.")}</pre>}
          </li>
        ))}
      </ol>
    </div>
  );
}
