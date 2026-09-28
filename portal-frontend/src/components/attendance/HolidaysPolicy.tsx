import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../Toast";
import { dayLabel, LEAVE_LABELS, type Holiday, type LeavePolicy } from "../../lib/attendance";

const TYPES = [
  { key: "full_time", label: "Full time" },
  { key: "contract", label: "Contract" },
  { key: "intern", label: "Intern" },
] as const;
const PAID = ["casual", "sick", "earned"] as const;

/** Company holidays for the year, and (for HR) the paid leave each kind of employee gets. */
export function HolidaysPolicy({ canEdit }: { canEdit: boolean }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [list, setList] = useState<Holiday[] | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [policy, setPolicy] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [h, p] = await Promise.all([
      apiFetch<{ holidays: Holiday[] }>(`/api/v1/holidays?year=${year}`, { accessToken }),
      apiFetch<{ policies: LeavePolicy[] }>("/api/v1/leave/policies", { accessToken }),
    ]);
    setList(h.holidays);
    const map = Object.fromEntries(p.policies.map((x) => [`${x.employeeType}:${x.leaveType}`, String(Number(x.daysPerYear))]));
    setPolicy(map);
    setSaved(map);
  }, [year, accessToken]);
  useEffect(() => {
    load().catch(() => toast("Couldn't load holidays.", "error"));
  }, [load, toast]);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/v1/holidays", { method: "POST", body: { date, name: name.trim() }, accessToken });
      toast("Holiday added");
      setDate("");
      setName("");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add that holiday.", "error");
    }
  }

  async function remove(h: Holiday) {
    if (!window.confirm(`Remove ${h.name}?`)) return;
    await apiFetch(`/api/v1/holidays/${h.id}`, { method: "DELETE", accessToken }).catch(() => toast("Couldn't remove it.", "error"));
    load();
  }

  const changed = Object.keys(policy).filter((k) => policy[k] !== saved[k]);
  async function savePolicy() {
    try {
      await apiFetch("/api/v1/leave/policies", {
        method: "PUT",
        body: { policies: changed.map((k) => ({ employeeType: k.split(":")[0], leaveType: k.split(":")[1], daysPerYear: Number(policy[k] || 0) })) },
        accessToken,
      });
      toast("Leave allowance saved");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save.", "error");
    }
  }

  return (
    <div className="panel-grid att-settings">
      <section className="panel" aria-label="Holidays">
        <div className="panel-head">
          <h2>Holidays {year}</h2>
          <div className="seg-tabs">
            {[year - 1, year, year + 1].filter((y, i, a) => a.indexOf(y) === i).map((y) => (
              <button key={y} className={y === year ? "on" : ""} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
        </div>
        {!list ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : list.length === 0 ? (
          <p className="muted-small">No holidays added for {year}.</p>
        ) : (
          <ul className="holiday-list">
            {list.map((h) => (
              <li key={h.id}>
                <span className="holiday-date">{dayLabel(h.date)}</span>
                <span>{h.name}</span>
                {canEdit && <button className="icon-button" aria-label={`Remove ${h.name}`} onClick={() => remove(h)}><Trash2 size={15} /></button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form className="holiday-add" onSubmit={add}>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" />
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" aria-label="Holiday name" />
            <button className="btn btn-sm" disabled={!date || name.trim().length < 2}><Plus size={14} /> Add</button>
          </form>
        )}
      </section>

      <section className="panel" aria-label="Leave allowance">
        <div className="panel-head"><h2>Paid leave a year</h2></div>
        <div className="policy-grid" role="table">
          <span role="columnheader" />
          {PAID.map((t) => <span key={t} role="columnheader">{LEAVE_LABELS[t]}</span>)}
          {TYPES.map((et) => (
            <div key={et.key} role="row" className="policy-row">
              <span role="rowheader">{et.label}</span>
              {PAID.map((lt) => {
                const k = `${et.key}:${lt}`;
                return canEdit ? (
                  <input key={k} type="number" min={0} max={60} step={0.5} value={policy[k] ?? "0"} onChange={(e) => setPolicy((p) => ({ ...p, [k]: e.target.value }))} aria-label={`${LEAVE_LABELS[lt]} days for ${et.label}`} />
                ) : (
                  <span key={k} role="cell">{policy[k] ?? 0}</span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="muted-small">Counted per calendar year, with no carry forward. Unpaid leave has no limit and becomes loss of pay.</p>
        {canEdit && changed.length > 0 && <button className="btn btn-sm" onClick={savePolicy}>Save allowance</button>}
      </section>
    </div>
  );
}
