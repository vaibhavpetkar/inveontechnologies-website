import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Download } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { API_BASE, apiFetch, ApiError } from "../../lib/api";
import "../../styles/engineering.css";

interface Person {
  userId: string;
  name: string;
  total: number;
  days: Record<string, number>;
}

const DAY = 86_400_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** Hours logged per person per day for a week, with a CSV download. */
export function Timesheet({ projectId }: { projectId?: string }) {
  const { accessToken } = useAuth();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY)), [weekStart]);
  const from = weekStart.toISOString();
  const to = new Date(weekStart.getTime() + 7 * DAY).toISOString();
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${projectId ? `&projectId=${projectId}` : ""}`;

  useEffect(() => {
    setPeople(null);
    apiFetch<{ people: Person[] }>(`/api/v1/tasks/timesheet?${query}`, { accessToken })
      .then((r) => {
        setPeople(r.people);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the timesheet."));
  }, [query, accessToken]);

  async function download() {
    const res = await fetch(`${API_BASE}/api/v1/tasks/timesheet?${query}&format=csv`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet-${ymd(weekStart)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totals = days.map((d) => (people ?? []).reduce((n, p) => n + (p.days[ymd(d)] ?? 0), 0));
  const label = `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  return (
    <section className="report-card">
      <header className="report-head">
        <h3><Clock size={17} /> Timesheet</h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <button className="icon-button" aria-label="Previous week" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))}><ChevronLeft size={16} /></button>
          <span className="muted-small" style={{ minWidth: 120, textAlign: "center" }}>{label}</span>
          <button className="icon-button" aria-label="Next week" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))}><ChevronRight size={16} /></button>
          <button className="btn btn-secondary btn-sm" onClick={download} disabled={!people?.length}><Download size={14} /> CSV</button>
        </span>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {!people && !error && <div className="skeleton" style={{ height: 100 }} />}
      {people && people.length === 0 && <p className="muted-small">No time logged this week{projectId ? " on this project" : ""}.</p>}
      {people && people.length > 0 && (
        <div className="timesheet-scroll">
          <table className="timesheet-table">
            <thead>
              <tr>
                <th>Person</th>
                {days.map((d) => <th key={d.getTime()}>{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.userId}>
                  <td>{p.name}</td>
                  {days.map((d) => {
                    const h = p.days[ymd(d)] ?? 0;
                    return <td key={d.getTime()} className={h ? undefined : "zero"}>{h ? `${h}h` : "·"}</td>;
                  })}
                  <td><strong>{p.total}h</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {totals.map((t, i) => <td key={i}>{t ? `${Math.round(t * 100) / 100}h` : "·"}</td>)}
                <td>{Math.round(totals.reduce((a, b) => a + b, 0) * 100) / 100}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
