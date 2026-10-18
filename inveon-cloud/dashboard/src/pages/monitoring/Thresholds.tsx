import { useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { MetricIncident, MetricKind, MetricRule, MetricRulesResponse } from "../../lib/types";
import { dateTime, timeAgo } from "../../lib/format";
import { Empty, ErrorNote, Field, Loading, useAction } from "../../components/ui";

export const METRIC_NAME: Record<MetricKind, string> = { cpu: "CPU", memory: "Memory", disk: "Disk", offline: "Offline" };

export function ruleText(r: Pick<MetricRule, "metric" | "thresholdPct" | "forMinutes" | "enabled">) {
  if (!r.enabled) return "off";
  const lasting = r.forMinutes > 0 ? ` for ${r.forMinutes} min` : "";
  if (r.metric === "offline") return `offline${r.forMinutes > 0 ? ` for ${r.forMinutes} min past the heartbeat timeout` : ""}`;
  return `above ${r.thresholdPct}%${lasting}`;
}

const valueText = (metric: MetricKind, v: number | null) => (v === null ? "—" : metric === "offline" ? `${v} min silent` : `${Math.round(v * 10) / 10}%`);

export function incidentText(i: MetricIncident) {
  return i.metric === "offline" ? `Offline${i.forMinutes ? ` for more than ${i.forMinutes} min` : ""}` : `${METRIC_NAME[i.metric]} above ${i.thresholdPct}%${i.forMinutes ? ` for ${i.forMinutes} min` : ""}`;
}

/** Open incidents first, then history. */
export function IncidentList({ incidents }: { incidents: MetricIncident[] }) {
  if (!incidents.length) return <Empty title="No incidents">Threshold alerts that fire for this server are listed here.</Empty>;
  return (
    <ul className="incident-list">
      {incidents.map((i) => (
        <li key={i.id} className={i.resolvedAt ? "" : "open"}>
          {i.resolvedAt ? <CheckCircle2 size={16} className="ic-ok" aria-label="resolved" /> : <AlertTriangle size={16} className="ic-bad" aria-label="open" />}
          <div>
            <strong>{incidentText(i)}</strong>
            <div className="muted small">
              Started {dateTime(i.startedAt)} at {valueText(i.metric, i.openValue)} · peak {valueText(i.metric, i.peakValue)}
              {i.resolvedAt ? ` · ${i.closedReason ? `closed (${i.closedReason})` : `cleared at ${valueText(i.metric, i.clearValue)}`} ${timeAgo(i.resolvedAt)}` : " · still open"}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RuleForm({ metric, rule, suggested, serverId, onDone }: { metric: MetricKind; rule: MetricRule | null; suggested: { thresholdPct: number | null; forMinutes: number }; serverId: string | null; onDone: () => void }) {
  const orgPath = useOrgPath();
  const action = useAction();
  const [form, setForm] = useState({ thresholdPct: rule?.thresholdPct ?? suggested.thresholdPct ?? 90, forMinutes: rule?.forMinutes ?? suggested.forMinutes, enabled: rule?.enabled ?? true });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath("/metric-alert-rules"), {
        method: "PUT",
        body: { serverId, metric, forMinutes: Number(form.forMinutes), enabled: form.enabled, thresholdPct: metric === "offline" ? null : Number(form.thresholdPct) },
      });
      onDone();
    });
  };
  return (
    <form className="rule-form" onSubmit={submit}>
      {metric !== "offline" && (
        <Field label="Above (%)">
          <input type="number" min={1} max={100} required value={form.thresholdPct} onChange={(e) => setForm({ ...form, thresholdPct: Number(e.target.value) })} />
        </Field>
      )}
      <Field label={metric === "offline" ? "Minutes past the heartbeat timeout" : "For (minutes)"}>
        <input type="number" min={0} max={120} required value={form.forMinutes} onChange={(e) => setForm({ ...form, forMinutes: Number(e.target.value) })} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> On
      </label>
      <button className="btn btn-small btn-primary" disabled={action.busy}>
        Save
      </button>
      <ErrorNote error={action.error} />
    </form>
  );
}

/**
 * Threshold rules. Without serverId: the organization's defaults. With it:
 * the effective rule per metric and a per-server override.
 */
export function ThresholdRules({ serverId }: { serverId?: string }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const data = useApi<MetricRulesResponse>(orgPath(`/metric-alert-rules${serverId ? `?serverId=${serverId}` : ""}`));
  const [editing, setEditing] = useState<MetricKind | null>(null);
  const action = useAction();
  if (data.error) return <ErrorNote error={data.error} />;
  if (!data.data) return <Loading />;
  const { rules, metrics } = data.data;
  const done = () => {
    setEditing(null);
    void data.reload();
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{serverId ? "Threshold rules for this server" : "Default threshold rules for every server"}</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">{serverId ? "Rule in effect" : "Alert when"}</th>
            {can("admin") && <th scope="col" className="right">Change</th>}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const orgRule = rules.find((r) => r.serverId === null && r.metric === m.id) ?? null;
            const override = serverId ? (rules.find((r) => r.serverId === serverId && r.metric === m.id) ?? null) : null;
            const own = serverId ? override : orgRule;
            const inEffect = override ?? orgRule;
            return (
              <tr key={m.id}>
                <td>
                  <strong>{m.label}</strong>
                </td>
                <td>
                  {editing === m.id ? (
                    <RuleForm metric={m.id} rule={inEffect} suggested={m.suggested} serverId={serverId ?? null} onDone={done} />
                  ) : (
                    <>
                      {inEffect ? ruleText(inEffect) : <span className="muted">no alert</span>}
                      {serverId && <div className="muted small">{override ? "set for this server" : orgRule ? "organization default" : ""}</div>}
                    </>
                  )}
                </td>
                {can("admin") && (
                  <td className="right nowrap">
                    {editing === m.id ? (
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    ) : (
                      <div className="btn-row no-margin" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(m.id)}>
                          {own ? "Edit" : serverId ? "Override" : "Set"}
                        </button>
                        {own && (
                          <button
                            type="button"
                            className="btn btn-small btn-ghost"
                            disabled={action.busy}
                            onClick={() => void action.run(async () => (await api(orgPath(`/metric-alert-rules/${own.id}`), { method: "DELETE" }), void data.reload()))}
                          >
                            {serverId ? "Use default" : "Remove"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ErrorNote error={action.error} />
    </div>
  );
}
