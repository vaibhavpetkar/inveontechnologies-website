import { useEffect, useState, type FormEvent } from "react";
import { Activity } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail } from "../../lib/types";
import { timeAgo } from "../../lib/format";
import { ErrorNote, Field, StatusBadge, useAction } from "../../components/ui";

export function HealthTab({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const hc = detail.healthCheck;
  const suggested = detail.domains.find((d) => d.status === "active");
  const [form, setForm] = useState({ url: hc?.url ?? (suggested ? `https://${suggested.hostname}${detail.environment.healthPath}` : ""), intervalSec: hc?.intervalSec ?? 60, enabled: hc?.enabled ?? true });
  const action = useAction();
  useEffect(() => {
    if (hc) setForm({ url: hc.url, intervalSec: hc.intervalSec, enabled: hc.enabled });
  }, [hc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = orgPath(`/environments/${detail.environment.id}/health`);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(base, { method: "PUT", body: { ...form, intervalSec: Number(form.intervalSec) } });
      reload();
    });
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>
            <Activity size={16} /> Uptime check
          </h3>
          {hc ? <StatusBadge status={hc.status} /> : <span className="muted small">not configured</span>}
        </div>
        {hc && (
          <p className="muted small">
            Last checked {timeAgo(hc.lastCheckedAt)}
            {hc.lastStatusCode !== null && ` · HTTP ${hc.lastStatusCode}`}
            {hc.consecutiveFailures > 0 && ` · ${hc.consecutiveFailures} failure${hc.consecutiveFailures > 1 ? "s" : ""} in a row`}
            {hc.lastError && ` · ${hc.lastError}`}
          </p>
        )}
        <p className="muted small">The control panel requests the URL on the interval. After 3 failures in a row it marks the app down and emails owners and admins; it emails again when it recovers.</p>
        {can("admin") && (
          <form className="form" onSubmit={save}>
            <Field label="URL">
              <input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://app.example.com/healthz" />
            </Field>
            <div className="btn-row align-end">
              <Field label="Every (seconds)">
                <input type="number" min={30} max={3600} value={form.intervalSec} onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })} />
              </Field>
              <label className="check">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled
              </label>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={action.busy}>
                Save
              </button>
              {hc && can("developer") && (
                <button type="button" className="btn btn-ghost" disabled={action.busy} onClick={() => void action.run(async () => (await api(`${base}/run`, { method: "POST" }), reload()))}>
                  Check now
                </button>
              )}
            </div>
          </form>
        )}
        <ErrorNote error={action.error} />
      </div>
    </div>
  );
}
