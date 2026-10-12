import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, useOrgPath } from "../context/AuthContext";
import type { AuditEntry } from "../lib/types";
import { dateTime, timeAgo } from "../lib/format";
import { Empty, ErrorNote, Loading, PageHeader, useAction } from "../components/ui";

const PAGE = 100;

function describe(e: AuditEntry) {
  const meta = Object.entries(e.metadata ?? {})
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
  return meta;
}

export default function Audit() {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState("");
  const action = useAction();

  const load = (before?: string) =>
    action.run(async () => {
      const r = await api<{ entries: AuditEntry[] }>(orgPath(`/audit?limit=${PAGE}${before ? `&before=${encodeURIComponent(before)}` : ""}`));
      setEntries((prev) => (before && prev ? [...prev, ...r.entries] : r.entries));
      setDone(r.entries.length < PAGE);
    });

  useEffect(() => {
    if (can("admin")) void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can("admin")) return <ErrorNote error="Only owners and admins can read the audit log." />;

  const q = filter.trim().toLowerCase();
  const shown = (entries ?? []).filter((e) => !q || e.action.includes(q) || (e.actorEmail ?? "").toLowerCase().includes(q) || e.entityType.includes(q));

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when. Agent actions are listed under their server." />
      <div className="toolbar">
        <input type="search" placeholder="Filter by action, person or type" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter" />
      </div>
      <ErrorNote error={action.error} />
      {!entries && action.busy && <Loading />}
      {entries && shown.length === 0 && <Empty icon={<History size={28} />} title="Nothing here yet" />}
      {shown.length > 0 && (
        <div className="card card-flush">
          <ul className="audit-list">
            {shown.map((e) => (
              <li key={e.id}>
                <div className="audit-main">
                  <code className="audit-action">{e.action}</code>
                  <span className="muted small">
                    {e.entityType}
                    {e.entityId && ` ${e.entityId.slice(0, 8)}`}
                  </span>
                </div>
                {describe(e) && <div className="small audit-meta">{describe(e)}</div>}
                <div className="muted small">
                  {e.actorEmail ?? (e.actorServerId ? `agent ${e.actorServerId.slice(0, 8)}` : "system")} · <span title={dateTime(e.createdAt)}>{timeAgo(e.createdAt)}</span>
                  {e.ipAddress && ` · ${e.ipAddress}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {entries && !done && (
        <div className="center">
          <button className="btn btn-ghost" disabled={action.busy} onClick={() => void load(entries[entries.length - 1]?.createdAt)}>
            Load older
          </button>
        </div>
      )}
    </>
  );
}
