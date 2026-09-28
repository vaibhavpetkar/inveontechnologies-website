import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { days, LEAVE_LABELS, todayIst, type LeaveBalance, type LeaveType } from "../../lib/attendance";

interface Props {
  balances: LeaveBalance[];
  onClose: () => void;
  onSent: () => void;
}

/** Ask for time off: type, dates (or a half day), reason. Shows the working days it will take. */
export function LeaveDialog({ balances, onClose, onSent }: Props) {
  const { accessToken } = useAuth();
  const [leaveType, setLeaveType] = useState<LeaveType>(balances.find((b) => b.type === "casual" && (b.remaining ?? 0) > 0) ? "casual" : "unpaid");
  const [startDate, setStart] = useState(todayIst());
  const [endDate, setEnd] = useState(todayIst());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const single = startDate === endDate;
  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setCount(null);
      return;
    }
    let live = true;
    apiFetch<{ days: number }>(`/api/v1/leave/days?start=${startDate}&end=${endDate}`, { accessToken })
      .then((r) => live && setCount(r.days))
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [startDate, endDate, accessToken]);

  const taking = count === null ? null : count === 0 ? 0 : halfDay && single ? 0.5 : count;
  const balance = balances.find((b) => b.type === leaveType);
  const short = balance?.remaining !== null && balance?.remaining !== undefined && taking !== null && taking > balance.remaining;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/leave", { method: "POST", body: { leaveType, startDate, endDate, halfDay: halfDay && single, reason: reason.trim() }, accessToken });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="leave-title">Request leave</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="leave-types" role="radiogroup" aria-label="Leave type">
          {balances.map((b) => (
            <button
              key={b.type}
              type="button"
              role="radio"
              aria-checked={leaveType === b.type}
              className={leaveType === b.type ? "on" : ""}
              onClick={() => setLeaveType(b.type)}
            >
              <strong>{LEAVE_LABELS[b.type]}</strong>
              <span>{b.remaining === null ? "No limit" : `${b.remaining} left`}</span>
            </button>
          ))}
        </div>
        <div className="leave-dates">
          <div className="field">
            <label htmlFor="leave-from">From</label>
            <input id="leave-from" type="date" required value={startDate} onChange={(e) => { setStart(e.target.value); if (e.target.value > endDate) setEnd(e.target.value); }} />
          </div>
          <div className="field">
            <label htmlFor="leave-to">To</label>
            <input id="leave-to" type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {single && (
          <label className="check-row">
            <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} /> Half day
          </label>
        )}
        <div className="field">
          <label htmlFor="leave-reason">Reason</label>
          <textarea id="leave-reason" rows={3} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Your manager sees this" />
        </div>
        <p className={`muted-small${short ? " leave-warn" : ""}`}>
          {taking === null
            ? " "
            : taking === 0
              ? "Those dates are weekends or holidays, so there's nothing to take off."
              : short
                ? `This takes ${days(taking)}, but you have ${days(balance!.remaining!)} of ${LEAVE_LABELS[leaveType].toLowerCase()} leave left. Choose unpaid for the rest.`
                : `This takes ${days(taking)} (weekends and holidays don't count).`}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !taking || short || reason.trim().length < 3}>{busy ? "Sending…" : "Send request"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
