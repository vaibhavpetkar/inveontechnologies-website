import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, LogIn, LogOut, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { periodName, periodOf, shiftPeriod } from "../../lib/payroll";
import { clock, dayLabel, days, hoursBetween, LEAVE_LABELS, LEAVE_STATUS, leaveSpan, STATUS_LABELS, type LeaveBalance, type LeaveRequest, type MonthDay, type MyMonth } from "../../lib/attendance";
import { useToast } from "../Toast";
import { LeaveDialog } from "./LeaveDialog";

function dayTone(d: MonthDay, today: string) {
  if (d.leave?.status === "approved") return "leave";
  if (d.holiday) return "holiday";
  if (d.record) return d.record.status;
  if (d.weekend) return "weekend";
  if (d.leave?.status === "pending") return "pending";
  return d.date < today ? "missing" : "future";
}

function dayTitle(d: MonthDay) {
  if (d.leave) return `${LEAVE_LABELS[d.leave.type]} leave${d.leave.halfDay ? ", half day" : ""}${d.leave.status === "pending" ? " (waiting)" : ""}`;
  if (d.holiday) return d.holiday;
  if (d.record) return `${STATUS_LABELS[d.record.status]}${d.record.checkInAt ? ` · in ${clock(d.record.checkInAt)}` : ""}${d.record.checkOutAt ? `, out ${clock(d.record.checkOutAt)}` : ""}${d.record.note ? ` · ${d.record.note}` : ""}`;
  return d.weekend ? "Weekend" : "";
}

/** The person's own attendance: check in and out, the month at a glance, leave balances and requests. */
export function MyAttendance({ onNotEmployee }: { onNotEmployee: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(periodOf());
  const [data, setData] = useState<MyMonth | null>(null);
  const [leave, setLeave] = useState<{ balances: LeaveBalance[]; requests: LeaveRequest[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([
        apiFetch<MyMonth>(`/api/v1/attendance/me?month=${month}`, { accessToken }),
        apiFetch<{ balances: LeaveBalance[]; requests: LeaveRequest[] }>(`/api/v1/leave/me?year=${month.slice(0, 4)}`, { accessToken }),
      ]);
      setData(m);
      setLeave(l);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_AN_EMPLOYEE") onNotEmployee();
      else toast("Couldn't load your attendance.", "error");
    }
  }, [month, accessToken, onNotEmployee, toast]);
  useEffect(() => {
    load();
  }, [load]);

  // Keep the "hours today" counter moving.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  async function act(path: string, body: unknown, done: string) {
    setBusy(true);
    try {
      await apiFetch(path, { method: "POST", body, accessToken });
      toast(done);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function cancel(r: LeaveRequest) {
    if (!window.confirm(`Cancel your ${LEAVE_LABELS[r.leaveType].toLowerCase()} leave for ${leaveSpan(r)}?`)) return;
    act(`/api/v1/leave/${r.id}/cancel`, {}, "Leave cancelled");
  }

  if (!data || !leave) return <div className="skeleton" style={{ height: 260 }} />;
  const rec = data.todayRecord;
  const todayInfo = data.days.find((d) => d.date === data.today);
  const offToday = todayInfo?.holiday ?? (todayInfo?.leave?.status === "approved" ? `${LEAVE_LABELS[todayInfo.leave.type]} leave` : null);
  const leadBlanks = (new Date(`${data.days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7; // weeks start Monday

  return (
    <div className="att-layout">
      <section className="panel att-today" aria-label="Today">
        <div>
          <p className="muted-small">{dayLabel(data.today, { weekday: "long", day: "numeric", month: "long" })}</p>
          {rec?.checkInAt ? (
            <>
              <h2>{rec.checkOutAt ? "Done for today" : "You're checked in"}</h2>
              <p className="att-times">
                <Clock size={15} /> In {clock(rec.checkInAt)}{rec.checkOutAt ? `, out ${clock(rec.checkOutAt)}` : ""} · {hoursBetween(rec.checkInAt, rec.checkOutAt)}
                {rec.workMode && <span className="pill pill-slate">{rec.workMode === "remote" ? "Remote" : "Office"}</span>}
              </p>
            </>
          ) : rec ? (
            <h2>Marked {STATUS_LABELS[rec.status].toLowerCase()} by HR</h2>
          ) : (
            <h2>{offToday ? `Off today: ${offToday}` : "You haven't checked in yet"}</h2>
          )}
        </div>
        <div className="att-actions">
          {!rec && (
            <>
              <button className="btn" disabled={busy} onClick={() => act("/api/v1/attendance/check-in", { workMode: "office" }, "Checked in")}><LogIn size={16} /> Check in</button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => act("/api/v1/attendance/check-in", { workMode: "remote" }, "Checked in, working remotely")}>Remote</button>
            </>
          )}
          {rec?.checkInAt && !rec.checkOutAt && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => act("/api/v1/attendance/check-out", {}, "Checked out")}><LogOut size={16} /> Check out</button>
          )}
        </div>
      </section>

      <section className="att-balances" aria-label="Leave balance">
        {leave.balances.map((b) => (
          <div key={b.type} className="att-balance">
            <span className="muted-small">{LEAVE_LABELS[b.type]} leave</span>
            <strong>{b.remaining === null ? days(b.used) : b.remaining}</strong>
            <span className="muted-small">{b.remaining === null ? "taken this year" : `left of ${b.allowance}${b.pending ? ` · ${b.pending} waiting` : ""}`}</span>
          </div>
        ))}
        <button className="btn att-request" onClick={() => setAsking(true)}><Plus size={16} /> Request leave</button>
      </section>

      <section className="panel" aria-label="This month">
        <div className="panel-head">
          <h2>{periodName(month)}</h2>
          <div className="period-picker" role="group" aria-label="Month">
            <button className="icon-button" aria-label="Previous month" onClick={() => setMonth((p) => shiftPeriod(p, -1))}><ChevronLeft size={18} /></button>
            <button className="icon-button" aria-label="Next month" onClick={() => setMonth((p) => shiftPeriod(p, 1))}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="att-grid" role="grid" aria-label={`Attendance for ${periodName(month)}`}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="att-dow">{d}</span>)}
          {Array.from({ length: leadBlanks }, (_, i) => <span key={`b${i}`} />)}
          {data.days.map((d) => (
            <span key={d.date} role="gridcell" className={`att-day tone-${dayTone(d, data.today)}${d.date === data.today ? " today" : ""}`} title={dayTitle(d)} aria-label={`${dayLabel(d.date)}: ${dayTitle(d) || "No record"}`}>
              {Number(d.date.slice(8))}
            </span>
          ))}
        </div>
        <div className="att-legend">
          {[["present", "Present"], ["half_day", "Half day"], ["absent", "Absent"], ["leave", "On leave"], ["holiday", "Holiday"], ["missing", "No check-in"]].map(([k, l]) => (
            <span key={k}><i className={`tone-${k}`} /> {l}</span>
          ))}
        </div>
      </section>

      <section className="panel" aria-label="My leave">
        <div className="panel-head"><h2>My leave</h2></div>
        {leave.requests.length === 0 ? (
          <p className="muted-small">No leave this year.</p>
        ) : (
          <ul className="leave-list">
            <AnimatePresence initial={false}>
              {leave.requests.map((r) => (
                <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div>
                    <strong>{LEAVE_LABELS[r.leaveType]} · {leaveSpan(r)}</strong>
                    <span className="muted-small">{days(Number(r.days))} · {r.reason}</span>
                    {r.decisionNote && <span className="muted-small">“{r.decisionNote}”{r.decidedByName ? `, ${r.decidedByName}` : ""}</span>}
                  </div>
                  <span className={`pill pill-${LEAVE_STATUS[r.status].tone}`}>{LEAVE_STATUS[r.status].label}</span>
                  {(r.status === "pending" || (r.status === "approved" && r.startDate > data.today)) && (
                    <button className="link-button" disabled={busy} onClick={() => cancel(r)}>Cancel</button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <AnimatePresence>
        {asking && (
          <LeaveDialog
            balances={leave.balances}
            onClose={() => setAsking(false)}
            onSent={() => {
              setAsking(false);
              toast("Leave requested. You'll be told when it's decided.");
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
