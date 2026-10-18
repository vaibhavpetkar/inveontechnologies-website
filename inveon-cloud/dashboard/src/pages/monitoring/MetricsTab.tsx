import { useApi } from "../../lib/useApi";
import { useOrgPath } from "../../context/AuthContext";
import type { ContainerSummary, MetricRange, Server, ServerMetrics } from "../../lib/types";
import { timeAgo } from "../../lib/format";
import { ErrorNote, Loading } from "../../components/ui";
import { LineChart, describeSeries, fmtBytes, fmtPct, fmtRate } from "../../components/Chart";

export const RANGES: { id: MetricRange; label: string }[] = [
  { id: "1h", label: "1 hour" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

export function RangePicker({ value, onChange }: { value: MetricRange; onChange: (r: MetricRange) => void }) {
  return (
    <div className="pills range-pills" role="radiogroup" aria-label="Time range">
      {RANGES.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={value === r.id} className={`pill ${value === r.id ? "active" : ""}`} onClick={() => onChange(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

const pctOf = (used: number | null, total: number | null) => (used === null || !total ? null : Math.min(100, (used / total) * 100));

export function ContainersTable({ containers, rangeLabel }: { containers: ContainerSummary[]; rangeLabel: string }) {
  if (!containers.length) return <p className="muted small">No running containers reported.</p>;
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <caption className="sr-only">Containers: current CPU and memory, with the average and peak over the last {rangeLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Container</th>
            <th scope="col" className="right">CPU now</th>
            <th scope="col" className="right hide-sm">CPU avg / peak</th>
            <th scope="col" className="right">Memory now</th>
            <th scope="col" className="right hide-sm">Memory peak</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => (
            <tr key={c.name}>
              <td>
                <div className="truncate">{c.name}</div>
                {c.project && (
                  <div className="muted small">
                    {c.project}
                    {c.service ? ` · ${c.service}` : ""}
                  </div>
                )}
              </td>
              <td className="right nowrap">{c.cpuPct === null ? "—" : fmtPct(c.cpuPct)}</td>
              <td className="right nowrap hide-sm">
                {c.cpuPctAvg === null ? "—" : fmtPct(c.cpuPctAvg)} / {c.cpuPctMax === null ? "—" : fmtPct(c.cpuPctMax)}
              </td>
              <td className="right nowrap">
                {c.memBytes === null ? "—" : fmtBytes(c.memBytes)}
                {c.memLimitBytes ? <span className="muted small"> of {fmtBytes(c.memLimitBytes)}</span> : null}
              </td>
              <td className="right nowrap hide-sm">{c.memBytesMax === null ? "—" : fmtBytes(c.memBytesMax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The server page's Metrics tab: CPU, memory, disk and network charts and the container table. */
export function MetricsTab({ server, range, onRange }: { server: Server; range: MetricRange; onRange: (r: MetricRange) => void }) {
  const orgPath = useOrgPath();
  const m = useApi<ServerMetrics>(orgPath(`/servers/${server.id}/metrics?range=${range}`), range === "1h" ? 30000 : 120000);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label;

  if (m.error) return <ErrorNote error={m.error} />;
  if (!m.data) return <Loading />;
  const d = m.data;
  const times = d.points.map((p) => new Date(p.t).getTime());
  const from = new Date(d.since).getTime();
  const to = new Date(d.until).getTime();
  const common = { times, from, to, stepSec: d.stepSec };
  const bucketed = d.stepSec > 30;

  const cpu = d.points.map((p) => p.cpuPct);
  const cpuPeak = d.points.map((p) => p.cpuPctMax);
  const memTotal = Math.max(0, ...d.points.map((p) => p.memTotalBytes ?? 0)) || undefined;
  const mem = d.points.map((p) => p.memUsedBytes);
  const memPeak = d.points.map((p) => p.memUsedBytesMax);
  const diskRoot = d.points.map((p) => pctOf(p.diskRootUsedBytes, p.diskRootTotalBytes));
  const diskDocker = d.points.map((p) => pctOf(p.diskDockerUsedBytes, p.diskDockerTotalBytes));
  const rx = d.points.map((p) => p.netRxBps);
  const tx = d.points.map((p) => p.netTxBps);
  const lastDisk = d.points[d.points.length - 1];

  return (
    <div className="stack">
      <div className="btn-row align-center no-margin">
        <RangePicker value={range} onChange={onRange} />
        <span className="muted small">{d.latestAt ? `Last sample ${timeAgo(d.latestAt)}` : "No recent samples: is the agent up to date and online?"}</span>
      </div>
      <div className="chart-grid-2">
        <LineChart
          {...common}
          title="CPU"
          yMax={100}
          format={fmtPct}
          series={bucketed ? [{ label: "Average", values: cpu, slot: 1 }, { label: "Peak", values: cpuPeak, slot: 2, dashed: true }] : [{ label: "CPU", values: cpu, slot: 1 }]}
          summary={`Over the last ${rangeLabel}, CPU ${describeSeries(cpu, times, fmtPct, bucketed ? cpuPeak : undefined)}.${server.cpuCount ? ` ${server.cpuCount} CPUs.` : ""}`}
        />
        <LineChart
          {...common}
          title="Memory"
          yMax={memTotal}
          format={fmtBytes}
          series={bucketed ? [{ label: "Average", values: mem, slot: 1 }, { label: "Peak", values: memPeak, slot: 2, dashed: true }] : [{ label: "Used", values: mem, slot: 1 }]}
          summary={`Memory used ${describeSeries(mem, times, fmtBytes, bucketed ? memPeak : undefined)}${memTotal ? ` of ${fmtBytes(memTotal)}` : ""}.`}
        />
        <LineChart
          {...common}
          title="Disk used"
          yMax={100}
          format={fmtPct}
          series={[
            { label: "/", values: diskRoot, slot: 1 },
            { label: "Docker data", values: diskDocker, slot: 2, dashed: true },
          ]}
          summary={`Root file system ${describeSeries(diskRoot, times, fmtPct)}${lastDisk?.diskRootTotalBytes ? ` (${fmtBytes(lastDisk.diskRootTotalBytes)})` : ""}. Docker's data root ${describeSeries(diskDocker, times, fmtPct)}.`}
        />
        <LineChart
          {...common}
          title="Network"
          format={fmtRate}
          series={[
            { label: "Received", values: rx, slot: 1 },
            { label: "Sent", values: tx, slot: 2, dashed: true },
          ]}
          summary={`Received ${describeSeries(rx, times, fmtRate)}. Sent ${describeSeries(tx, times, fmtRate)}.`}
        />
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Containers</h3>
          <span className="muted small">now, and over the last {rangeLabel}</span>
        </div>
        <ContainersTable containers={d.containers} rangeLabel={rangeLabel} />
      </div>
    </div>
  );
}
