import { useState } from "react";
import { Link, useParams } from "wouter";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useApi } from "../lib/useApi";
import { useOrgPath } from "../context/AuthContext";
import type { MetricIncident, MetricRange, Server } from "../lib/types";
import { bytes, timeAgo } from "../lib/format";
import { ErrorNote, Loading, PageHeader, StatusBadge } from "../components/ui";
import { MetricsTab } from "./monitoring/MetricsTab";
import { IncidentList, ThresholdRules, incidentText } from "./monitoring/Thresholds";

const TABS = ["Metrics", "Incidents", "Thresholds"] as const;
type Tab = (typeof TABS)[number];

/** One server: its metrics, threshold incidents and per-server threshold overrides. */
export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const orgPath = useOrgPath();
  const server = useApi<{ server: Server }>(orgPath(`/servers/${id}`), 30000);
  const incidents = useApi<{ incidents: MetricIncident[] }>(orgPath(`/servers/${id}/incidents?limit=100`), 30000);
  const [tab, setTab] = useState<Tab>("Metrics");
  const [range, setRange] = useState<MetricRange>("1h");

  if (server.error) return <ErrorNote error={server.error} />;
  if (!server.data) return <Loading />;
  const s = server.data.server;
  const open = incidents.data?.incidents.filter((i) => !i.resolvedAt) ?? [];

  return (
    <>
      <Link href="/servers" className="back">
        <ArrowLeft size={16} /> Servers
      </Link>
      <PageHeader
        title={
          <>
            {s.name} <StatusBadge status={s.status} />
          </>
        }
        subtitle={
          <>
            {s.hostname ?? "—"} · {s.ipAddress ?? "no public IP"} · {s.os ?? "unknown OS"} · {s.cpuCount ?? "?"} CPU · {bytes(s.memoryBytes)} RAM · seen {timeAgo(s.lastSeenAt)}
          </>
        }
      />
      {open.length > 0 && (
        <div className="note note-bad" role="alert">
          <AlertTriangle size={16} />
          <span>
            <strong>
              {open.length} open incident{open.length > 1 ? "s" : ""}:
            </strong>{" "}
            {open.map((i) => `${incidentText(i)} since ${timeAgo(i.startedAt)}`).join("; ")}
          </span>
        </div>
      )}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
            {t === "Incidents" && open.length > 0 ? ` (${open.length})` : ""}
          </button>
        ))}
      </div>
      <div className="tab-panel">
        {tab === "Metrics" && <MetricsTab server={s} range={range} onRange={setRange} />}
        {tab === "Incidents" && (incidents.error ? <ErrorNote error={incidents.error} /> : incidents.data ? <IncidentList incidents={incidents.data.incidents} /> : <Loading />)}
        {tab === "Thresholds" && (
          <div className="card">
            <p className="muted small">
              Rules set here override the organization's defaults (Alerts) for this server. Alerts go to channels subscribed to <em>Server threshold</em> events: one when a threshold is
              crossed and one when it clears.
            </p>
            <ThresholdRules serverId={s.id} />
          </div>
        )}
      </div>
    </>
  );
}
