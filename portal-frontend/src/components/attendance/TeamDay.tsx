import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { Avatar } from "../Avatar";
import { useToast } from "../Toast";
import { clock, dayLabel, hoursBetween, LEAVE_LABELS, STATUS_LABELS, todayIst, type AttendanceStatus, type TeamRow } from "../../lib/attendance";

const shiftDay = (d: string, by: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + by * 86_400_000).toISOString().slice(0, 10);

function state(r: TeamRow) {
  if (r.leaveStatus === "approved") return { key: "leave", label: `${LEAVE_LABELS[r.leaveType!]} leave${r.leaveHalfDay ? ", half day" : ""}` };
  if (r.status) return { key: r.status, label: STATUS_LABELS[r.status] };
  return { key: "missing", label: r.leaveStatus === "pending" ? "Not in (leave waiting)" : "Not in" };
}

/** One day for the team: who's in, who's on leave, who hasn't checked in. Staff can mark or correct a day. */
export function TeamDay() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(todayIst());
  const [data, setData] = useState<{ weekend: boolean; holiday: string | null; people: TeamRow[] } | null>(null);

  const load = useCallback(
    () => apiFetch<{ weekend: boolean; holiday: string | null; people: TeamRow[] }>(`/api/v1/attendance/team?date=${date}`, { accessToken }).then(setData).catch(() => toast("Couldn't load the team.", "error")),
    [date, accessToken, toast],
  );
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const counts = useMemo(() => {
    const list = data?.people ?? [];
    return {
      in: list.filter((p) => p.status === "present" || p.status === "half_day").length,
      leave: list.filter((p) => p.leaveStatus === "approved").length,
      missing: list.filter((p) => !p.status && p.leaveStatus !== "approved").length,
    };
  }, [data]);

  async function mark(r: TeamRow, status: AttendanceStatus | null) {
    const note = status === "absent" || status === "half_day" ? window.prompt(`Note for ${r.name}'s ${status === "absent" ? "absence" : "half day"} (optional)`) : undefined;
    if (note === null) return;
    try {
      await apiFetch(`/api/v1/attendance/${r.employeeId}/${date}`, { method: "PUT", body: { status, note: note || undefined }, accessToken });
      toast(status ? `Marked ${r.name.split(" ")[0]} ${STATUS_LABELS[status].toLowerCase()}` : "Mark cleared");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    }
  }

  const future = date > todayIst();
  return (
    <section aria-label="Team attendance">
      <div className="att-toolbar">
        <div className="period-picker" role="group" aria-label="Day">
          <button className="icon-button" aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))}><ChevronLeft size={18} /></button>
          <strong>{date === todayIst() ? "Today" : dayLabel(date)}</strong>
          <button className="icon-button" aria-label="Next day" onClick={() => setDate((d) => shiftDay(d, 1))}><ChevronRight size={18} /></button>
        </div>
        {data && (
          <p className="muted-small">
            {data.holiday ? `Holiday: ${data.holiday}. ` : data.weekend ? "Weekend. " : ""}
            {counts.in} in · {counts.leave} on leave · {counts.missing} not in
          </p>
        )}
      </div>
      {!data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : data.people.length === 0 ? (
        <p className="empty">Nobody on your team yet.</p>
      ) : (
        <div className="att-table" role="table" aria-label="Team attendance">
          <div className="att-row att-head" role="row">
            <span role="columnheader">Person</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Hours</span>
            <span role="columnheader">Mark</span>
          </div>
          {data.people.map((r) => {
            const s = state(r);
            return (
              <div key={r.employeeId} className="att-row" role="row">
                <span className="payroll-who" role="cell">
                  <Avatar email={r.email} name={r.name} size={32} />
                  <span>
                    <strong>{r.name}</strong>
                    <span className="muted-small">{r.businessId ?? r.email}</span>
                  </span>
                </span>
                <span role="cell" data-label="Status">
                  <span className={`att-state tone-${s.key}`}>{s.label}</span>
                  {r.workMode && <span className="muted-small"> · {r.workMode === "remote" ? "Remote" : "Office"}</span>}
                  {r.note && <span className="muted-small att-note">{r.note}</span>}
                </span>
                <span role="cell" data-label="Hours" className="muted-small">
                  {r.checkInAt ? `${clock(r.checkInAt)}${r.checkOutAt ? ` to ${clock(r.checkOutAt)}` : " to now"} · ${hoursBetween(r.checkInAt, r.checkOutAt)}` : "–"}
                </span>
                <span role="cell" data-label="Mark">
                  <select
                    className="att-mark"
                    aria-label={`Mark ${r.name}`}
                    disabled={future}
                    value={r.status ?? ""}
                    onChange={(e) => mark(r, (e.target.value || null) as AttendanceStatus | null)}
                  >
                    <option value="">{r.checkInAt ? "Checked in" : "No mark"}</option>
                    <option value="present">Present</option>
                    <option value="half_day">Half day</option>
                    <option value="absent">Absent</option>
                  </select>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted-small">Absent days and half days that no approved leave covers count as loss of pay when the month's payslip is drafted.</p>
    </section>
  );
}
