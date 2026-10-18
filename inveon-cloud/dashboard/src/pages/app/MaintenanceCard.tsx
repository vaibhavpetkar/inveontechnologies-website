import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail, MaintenanceState, MaintenanceWindow } from "../../lib/types";
import { shortSha, timeAgo } from "../../lib/format";
import { ErrorNote, useAction } from "../../components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LENGTHS = [30, 60, 120, 180, 240, 360, 480, 720];

function until(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} days`;
}

/** IANA zones the browser knows, with UTC first and the browser's own zone near the top. */
function zoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set(["UTC", local, current, ...zones])].filter(Boolean);
}

/** One line for the environment summary and the deploy warning. */
export function windowSummary(m: MaintenanceState) {
  if (!m.restricted) return null;
  if (m.open && m.current) return `Maintenance window open now (${m.currentLabel ?? ""})`;
  return m.next ? `Next maintenance window ${m.nextLabel} (${until(m.next.start)})` : null;
}

/**
 * Weekly windows, in the environment's time zone, when pushes may deploy. Outside them, a push waits
 * and deploys when the next window opens; manual deploys still go ahead.
 */
export function MaintenanceCard({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const env = detail.environment;
  const m = detail.maintenance;
  const [rows, setRows] = useState<MaintenanceWindow[]>(m.windows);
  const [timeZone, setTimeZone] = useState(m.timeZone);
  const action = useAction();
  useEffect(() => setRows(detail.maintenance.windows), [env.id, detail.maintenance.windows]);
  useEffect(() => setTimeZone(detail.maintenance.timeZone), [env.id, detail.maintenance.timeZone]);

  const set = (i: number, patch: Partial<MaintenanceWindow>) => setRows((r) => r.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath(`/environments/${env.id}`), { method: "PATCH", body: { maintenanceWindows: rows, maintenanceTimeZone: timeZone } });
      reload();
    });
  };
  const discard = () =>
    void action.run(async () => {
      await api(orgPath(`/environments/${env.id}/queued-deploy`), { method: "DELETE" });
      reload();
    });

  const summary = windowSummary(m);
  const dirty = JSON.stringify(rows) !== JSON.stringify(m.windows) || timeZone !== m.timeZone;

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <CalendarClock size={16} /> Maintenance windows
        </h3>
        {m.restricted ? <span className={`badge ${m.open ? "badge-ok" : "badge-muted"}`}>{m.open ? "open now" : "closed"}</span> : <span className="muted small">any time</span>}
      </div>
      <p className="muted small">
        {m.restricted
          ? `Pushes deploy only inside these windows (${m.timeZone}, daylight saving time included). A push outside them waits, and the newest one deploys when the next window opens. Manual deploys and rollbacks still run at any time.`
          : "Pushes deploy as soon as they arrive. Add a window to hold automatic deploys until a quiet time."}
      </p>
      {summary && <p className="note note-info">{summary}</p>}
      {m.queuedRelease && (
        <div className="note note-warn queued">
          <span>
            Waiting for the window: <code className="sha">{shortSha(m.queuedRelease.commitSha)}</code> {m.queuedRelease.commitMessage?.split("\n")[0]}
            {m.queuedAt && <span className="muted"> · pushed {timeAgo(m.queuedAt)}</span>}
          </span>
          {can("developer") && (
            <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={discard}>
              Discard
            </button>
          )}
        </div>
      )}
      {can("admin") ? (
        <form className="form" onSubmit={save}>
          <label>
            Time zone
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {zoneOptions(timeZone).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          {rows.map((w, i) => (
            <div key={i} className="window-row">
              <select aria-label="Day" value={w.day} onChange={(e) => set(i, { day: Number(e.target.value) })}>
                {DAYS.map((d, n) => (
                  <option key={d} value={n}>
                    {d}
                  </option>
                ))}
              </select>
              <input aria-label={`Start (${timeZone})`} type="time" required value={w.start} onChange={(e) => set(i, { start: e.target.value })} />
              <select aria-label="Length" value={w.durationMin} onChange={(e) => set(i, { durationMin: Number(e.target.value) })}>
                {[...new Set([...LENGTHS, w.durationMin])].sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>
                    {n < 60 ? `${n} min` : `${n / 60} h`}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label="Remove window" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <ErrorNote error={action.error} />
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" disabled={rows.length >= 14} onClick={() => setRows((r) => [...r, { day: 2, start: "02:00", durationMin: 120 }])}>
              <Plus size={16} /> Window
            </button>
            <button className="btn btn-primary" disabled={action.busy || !dirty}>
              Save
            </button>
          </div>
        </form>
      ) : (
        m.windows.length > 0 && (
          <ul className="muted small">
            {m.windows.map((w, i) => (
              <li key={i}>
                {DAYS[w.day]} {w.start} {m.timeZone} for {w.durationMin < 60 ? `${w.durationMin} min` : `${w.durationMin / 60} h`}
              </li>
            ))}
          </ul>
        )
      )}
      {!can("admin") && <ErrorNote error={action.error} />}
    </div>
  );
}
