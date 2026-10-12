import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ListChecks } from "lucide-react";
import { useApi } from "../lib/useApi";
import { useOrgPath } from "../context/AuthContext";
import type { Job, JobStatus } from "../lib/types";
import { dateTime, duration, timeAgo } from "../lib/format";
import { Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { JobView } from "../components/JobView";

const FILTERS: (JobStatus | "all")[] = ["all", "running", "pending", "failure", "success", "cancelled"];

function JobDetail({ id }: { id: string }) {
  const orgPath = useOrgPath();
  const job = useApi<{ job: Job }>(orgPath(`/jobs/${id}`));
  return (
    <>
      <Link href="/jobs" className="back">
        <ArrowLeft size={16} /> Jobs
      </Link>
      <PageHeader title={job.data?.job.title ?? "Job"} subtitle={job.data ? `${job.data.job.type} · ${dateTime(job.data.job.createdAt)}` : undefined} />
      <ErrorNote error={job.error} />
      <div className="card">
        <JobView jobId={id} />
      </div>
    </>
  );
}

export default function Jobs() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const orgPath = useOrgPath();
  const [status, setStatus] = useState<JobStatus | "all">("all");
  const list = useApi<{ jobs: Job[] }>(params.id ? null : orgPath(`/jobs?limit=100${status === "all" ? "" : `&status=${status}`}`), 5000);

  if (params.id) return <JobDetail id={params.id} />;

  return (
    <>
      <PageHeader title="Jobs" subtitle="Every action the agents run: deploys, rollbacks, certificates, logs, backups and restores." />
      <div className="pills" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={status === f} className={`pill ${status === f ? "active" : ""}`} onClick={() => setStatus(f)}>
            {f}
          </button>
        ))}
      </div>
      <ErrorNote error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && list.data.jobs.length === 0 && (
        <Empty icon={<ListChecks size={28} />} title="No jobs">
          Jobs appear here when you deploy, add a domain, request logs or take a backup.
        </Empty>
      )}
      {list.data && list.data.jobs.length > 0 && (
        <div className="card card-flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Job</th>
                  <th className="hide-sm">Server</th>
                  <th className="hide-sm">Took</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {list.data.jobs.map((j) => (
                  <tr key={j.id} className="clickable" onClick={() => navigate(`/jobs/${j.id}`)}>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                    <td>
                      <Link href={`/jobs/${j.id}`} onClick={(e) => e.stopPropagation()}>
                        {j.title}
                      </Link>
                      <div className="muted small">{j.type}</div>
                    </td>
                    <td className="hide-sm">{j.serverName}</td>
                    <td className="hide-sm muted small nowrap">{j.claimedAt ? duration(j.claimedAt, j.finishedAt) : "—"}</td>
                    <td className="muted small nowrap" title={dateTime(j.createdAt)}>
                      {timeAgo(j.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
