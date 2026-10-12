import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, BarChart3 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { sprintDates, STATUS_META, type BacklogIssue, type Sprint, type SprintReport, type Velocity } from "../../lib/tasks";
import { IssueKey, IssueTypeIcon } from "./IssueBits";
import "../../styles/sprints.css";

/** Sprint reports for a project: burndown of a chosen sprint, and velocity across recent sprints. */
export function SprintReports({ projectId, onOpenTask, version = 0 }: { projectId: string; onOpenTask: (ref: string) => void; version?: number }) {
  const { accessToken } = useAuth();
  const [sprints, setSprints] = useState<Sprint[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [report, setReport] = useState<SprintReport | null>(null);
  const [velocity, setVelocity] = useState<Velocity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ sprints: Sprint[] }>(`/api/v1/projects/${projectId}/sprints`, { accessToken }),
      apiFetch<Velocity>(`/api/v1/projects/${projectId}/velocity`, { accessToken }),
    ])
      .then(([s, v]) => {
        const started = s.sprints.filter((x) => x.status !== "planned");
        setSprints(started);
        setVelocity(v);
        setPicked((p) => p || (started.find((x) => x.status === "active") ?? started[0])?.id || "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the reports."));
  }, [projectId, accessToken, version]);

  useEffect(() => {
    if (!picked) return setReport(null);
    apiFetch<SprintReport>(`/api/v1/sprints/${picked}/report`, { accessToken }).then(setReport).catch(() => setReport(null));
  }, [picked, accessToken, version]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!sprints || !velocity) return <div className="skeleton" style={{ height: 300 }} />;
  if (!sprints.length) {
    return (
      <div className="empty-state">
        <TrendingDown size={28} />
        <h3>No sprint has started yet</h3>
        <p>Plan a sprint on the Backlog tab and start it. Its burndown shows up here.</p>
      </div>
    );
  }

  return (
    <div className="sprint-reports">
      <section className="report-card">
        <header className="report-head">
          <h3><TrendingDown size={17} /> Burndown</h3>
          <select aria-label="Sprint" value={picked} onChange={(e) => setPicked(e.target.value)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.status === "active" ? " (active)" : ""}</option>
            ))}
          </select>
        </header>
        {report ? (
          <>
            <p className="muted-small">
              {sprintDates(report.sprint)} · {report.burndown.committed} points committed
              {report.sprint.goal ? ` · Goal: ${report.sprint.goal}` : ""}
            </p>
            <BurndownChart data={report.burndown} />
            <div className="chart-legend">
              <span><i style={{ background: "var(--primary)" }} /> Remaining points</span>
              <span><i style={{ background: "repeating-linear-gradient(90deg, #94a3b8 0 5px, transparent 5px 9px)" }} /> Guideline</span>
            </div>
            <div className="report-lists">
              <IssueGroup title="Done" issues={report.completed} onOpen={onOpenTask} />
              <IssueGroup title={report.sprint.status === "completed" ? "Carried over" : "Not done yet"} issues={report.notCompleted} onOpen={onOpenTask} />
              {report.addedAfterStart.length > 0 && <IssueGroup title="Added after the start" issues={report.addedAfterStart} onOpen={onOpenTask} />}
            </div>
          </>
        ) : (
          <div className="skeleton" style={{ height: 220 }} />
        )}
      </section>

      <section className="report-card">
        <header className="report-head">
          <h3><BarChart3 size={17} /> Velocity</h3>
          {velocity.sprints.length > 0 && <span className="muted-small">Average of the last 3: <strong>{velocity.average} points</strong></span>}
        </header>
        {velocity.sprints.length ? (
          <>
            <VelocityChart data={velocity} />
            <div className="chart-legend">
              <span><i style={{ background: "#cbd5e1", height: 10 }} /> Committed</span>
              <span><i style={{ background: "#16a34a", height: 10 }} /> Completed</span>
            </div>
          </>
        ) : <p className="muted-small">Velocity appears once the first sprint is completed.</p>}
      </section>
    </div>
  );
}

function IssueGroup({ title, issues, onOpen }: { title: string; issues: BacklogIssue[]; onOpen: (ref: string) => void }) {
  return (
    <div className="report-group">
      <h4>{title} <span className="column-count">{issues.length}</span></h4>
      {issues.length === 0 ? (
        <p className="muted-small">None.</p>
      ) : (
        <ul>
          {issues.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => onOpen(i.key ?? i.id)}>
                <IssueTypeIcon type={i.type} size={15} />
                <IssueKey value={i.key} />
                <span className="backlog-title">{i.title}</span>
                <span className={`pill pill-${STATUS_META[i.status].tone}`}>{STATUS_META[i.status].label}</span>
                <span className="points-badge">{i.storyPoints ?? "–"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const W = 640;
const H = 240;
const PAD = { l: 36, r: 12, t: 12, b: 28 };

export function BurndownChart({ data }: { data: SprintReport["burndown"] }) {
  const { days, committed, endsAt } = data;
  const geo = useMemo(() => {
    if (!days.length) return null;
    const t0 = new Date(days[0].at).getTime();
    const t1 = Math.max(endsAt ? new Date(endsAt).getTime() : 0, new Date(days[days.length - 1].at).getTime(), t0 + 86_400_000);
    const maxY = Math.max(1, committed, ...days.map((d) => d.remaining));
    const x = (iso: string) => PAD.l + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
    // A step line: remaining work changes when something closes, not gradually.
    let path = "";
    days.forEach((d, i) => {
      path += i === 0 ? `M${x(d.at)},${y(d.remaining)}` : `H${x(d.at)}V${y(d.remaining)}`;
    });
    const ticks = [0, Math.round(maxY / 2), maxY];
    const labels = days.filter((_, i) => i === 0 || i === days.length - 1 || (days.length > 8 ? i % Math.ceil(days.length / 6) === 0 : true));
    return { x, y, path, ticks, labels, t0, t1, end: endsAt ?? new Date(t1).toISOString() };
  }, [days, committed, endsAt]);
  if (!geo) return <p className="muted-small">Set the sprint's dates to see its burndown.</p>;
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Burndown: ${days[days.length - 1].remaining} of ${committed} points remaining`}>
      {geo.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} className="grid" />
          <text x={PAD.l - 6} y={geo.y(t) + 4} textAnchor="end" className="axis">{t}</text>
        </g>
      ))}
      {geo.labels.map((d) => (
        <text key={d.at} x={geo.x(d.at)} y={H - 8} textAnchor="middle" className="axis">{day(d.at)}</text>
      ))}
      <line x1={geo.x(days[0].at)} y1={geo.y(committed)} x2={geo.x(geo.end)} y2={geo.y(0)} className="ideal" />
      <motion.path d={geo.path} className="remaining" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
      {days.map((d) => (
        <circle key={d.at} cx={geo.x(d.at)} cy={geo.y(d.remaining)} r={3} className="dot">
          <title>{`${day(d.at)}: ${d.remaining} points, ${d.issues} issues left`}</title>
        </circle>
      ))}
    </svg>
  );
}

function VelocityChart({ data }: { data: Velocity }) {
  const max = Math.max(1, ...data.sprints.flatMap((s) => [s.committed, s.completed]));
  const slot = (W - PAD.l - PAD.r) / data.sprints.length;
  const bar = Math.min(26, slot / 3);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Velocity: average ${data.average} points per sprint`}>
      {[0, Math.round(max / 2), max].map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
        </g>
      ))}
      {data.sprints.map((s, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        return (
          <g key={s.id}>
            <motion.rect x={cx - bar - 2} width={bar} className="bar-committed" initial={{ y: y(0), height: 0 }} animate={{ y: y(s.committed), height: y(0) - y(s.committed) }} transition={{ duration: 0.5, delay: i * 0.05 }}>
              <title>{`${s.name}: ${s.committed} committed`}</title>
            </motion.rect>
            <motion.rect x={cx + 2} width={bar} className="bar-completed" initial={{ y: y(0), height: 0 }} animate={{ y: y(s.completed), height: y(0) - y(s.completed) }} transition={{ duration: 0.5, delay: i * 0.05 + 0.1 }}>
              <title>{`${s.name}: ${s.completed} completed`}</title>
            </motion.rect>
            <text x={cx} y={H - 8} textAnchor="middle" className="axis">{s.name.replace(/^.*?(Sprint \d+)$/, "$1")}</text>
          </g>
        );
      })}
    </svg>
  );
}
