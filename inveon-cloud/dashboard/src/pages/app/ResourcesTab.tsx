import { useState } from "react";
import { Link } from "wouter";
import { useApi } from "../../lib/useApi";
import { useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail, EnvironmentResources, MetricRange } from "../../lib/types";
import { timeAgo } from "../../lib/format";
import { ErrorNote, Loading } from "../../components/ui";
import { LineChart, describeSeries, fmtBytes, fmtPct } from "../../components/Chart";
import { ContainersTable, RANGES, RangePicker } from "../monitoring/MetricsTab";

/** CPU and memory of this environment's containers (both colours) on its server. */
export function ResourcesTab({ detail }: { detail: EnvironmentDetail }) {
  const orgPath = useOrgPath();
  const [range, setRange] = useState<MetricRange>("24h");
  const r = useApi<EnvironmentResources>(orgPath(`/environments/${detail.environment.id}/resources?range=${range}`), range === "1h" ? 30000 : 120000);
  const rangeLabel = RANGES.find((x) => x.id === range)!.label;
  if (r.error) return <ErrorNote error={r.error} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  const times = d.points.map((p) => new Date(p.t).getTime());
  const common = { times, from: new Date(d.since).getTime(), to: new Date(d.until).getTime(), stepSec: d.stepSec, height: 140 };
  const cpu = d.points.map((p) => p.cpuPct);
  const mem = d.points.map((p) => p.memBytes);

  return (
    <div className="stack">
      <div className="btn-row align-center no-margin">
        <RangePicker value={range} onChange={setRange} />
        <span className="muted small">
          {d.latestAt ? `Last sample ${timeAgo(d.latestAt)}` : "No recent samples"} · <Link href={`/servers/${d.serverId}`}>server metrics</Link>
        </span>
      </div>
      <div className="chart-grid-2">
        <LineChart {...common} title="CPU (all containers)" format={fmtPct} series={[{ label: "CPU", values: cpu, slot: 1 }]} summary={`Percent of one CPU, summed over the containers: ${describeSeries(cpu, times, fmtPct)}.`} />
        <LineChart {...common} title="Memory (all containers)" format={fmtBytes} series={[{ label: "Memory", values: mem, slot: 1 }]} summary={`Memory of the containers together: ${describeSeries(mem, times, fmtBytes)}.`} />
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
