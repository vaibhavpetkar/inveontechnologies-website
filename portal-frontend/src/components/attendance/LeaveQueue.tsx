import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../Toast";
import { days, LEAVE_LABELS, LEAVE_STATUS, leaveSpan, type LeaveRequest, type LeaveStatus } from "../../lib/attendance";

const FILTERS: { key: LeaveStatus | "all"; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Declined" },
  { key: "all", label: "All" },
];

/** Leave requests from the people the caller looks after, to approve or decline. */
export function LeaveQueue({ isHr, onCount }: { isHr: boolean; onCount: (n: number) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<LeaveStatus | "all">("pending");
  const [rows, setRows] = useState<LeaveRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiFetch<{ requests: LeaveRequest[] }>(`/api/v1/leave/requests?status=${status}`, { accessToken })
        .then((r) => {
          setRows(r.requests);
          if (status === "pending") onCount(r.requests.length);
        })
        .catch(() => toast("Couldn't load leave requests.", "error")),
    [status, accessToken, toast, onCount],
  );
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function run(r: LeaveRequest, path: string, body: unknown, done: string) {
    setBusy(r.id);
    try {
      await apiFetch(path, { method: "POST", body, accessToken });
      toast(done);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work.", "error");
    } finally {
      setBusy(null);
    }
  }

  function decide(r: LeaveRequest, approve: boolean) {
    const note = approve ? "" : window.prompt(`Why is ${r.employee?.name ?? "this"}'s leave declined? They see this.`);
    if (note === null) return;
    run(r, `/api/v1/leave/${r.id}/decide`, { approve, note: note?.trim() || undefined }, approve ? "Leave approved" : "Leave declined");
  }

  return (
    <section aria-label="Leave requests">
      <div className="seg-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={status === f.key} className={status === f.key ? "on" : ""} onClick={() => setStatus(f.key)}>{f.label}</button>
        ))}
      </div>
      {!rows ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : rows.length === 0 ? (
        <p className="empty">{status === "pending" ? "No leave waiting for you." : "Nothing here."}</p>
      ) : (
        <ul className="leave-list staff">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div>
                  <strong>{r.employee?.name ?? "Someone"} · {LEAVE_LABELS[r.leaveType]} leave</strong>
                  <span>{leaveSpan(r)} · {days(Number(r.days))}</span>
                  <span className="muted-small">{r.reason}</span>
                  {r.decidedByName && <span className="muted-small">{LEAVE_STATUS[r.status].label} by {r.decidedByName}{r.decisionNote ? `: “${r.decisionNote}”` : ""}</span>}
                </div>
                {r.status === "pending" ? (
                  <span className="leave-decide">
                    <button className="btn btn-sm" disabled={busy === r.id} onClick={() => decide(r, true)}><Check size={14} /> Approve</button>
                    <button className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => decide(r, false)}><X size={14} /> Decline</button>
                  </span>
                ) : (
                  <span className="leave-decide">
                    <span className={`pill pill-${LEAVE_STATUS[r.status].tone}`}>{LEAVE_STATUS[r.status].label}</span>
                    {isHr && r.status === "approved" && (
                      <button className="link-button" disabled={busy === r.id} onClick={() => window.confirm("Cancel this approved leave? The person is told.") && run(r, `/api/v1/leave/${r.id}/cancel`, {}, "Leave cancelled")}>Cancel</button>
                    )}
                  </span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
