import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Circle, PartyPopper, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDate, type ChecklistItem, type EmployeeType } from "../../lib/people";
import { useToast } from "../Toast";

export interface MyEmployee {
  id: string;
  businessId: string;
  employeeType: EmployeeType;
  status: string;
  portalAccessActive: boolean;
  joiningDate: string;
}

/** The joiner's own checklist with a progress ring; ticks items off in place. */
export function OnboardingCard({ employee, onChanged }: { employee: MyEmployee; onChanged: () => void }) {
  const { accessToken } = useAuth();
  const { arrivals } = useNotifications();
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch<{ tasks: ChecklistItem[] }>(`/api/v1/employees/${employee.id}/onboarding-tasks`, { accessToken });
    setItems([...r.tasks].sort((a, b) => Number(a.taskType === "access_activation") - Number(b.taskType === "access_activation")));
  }, [employee.id, accessToken]);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load, arrivals]);

  async function complete(item: ChecklistItem) {
    setBusyId(item.id);
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, status: "completed" } : i)) ?? list);
    try {
      await apiFetch(`/api/v1/employees/onboarding-tasks/${item.id}/complete`, { method: "POST", accessToken });
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
      await load();
    }
    setBusyId(null);
  }

  if (!items) return <div className="panel"><div className="skeleton" style={{ height: 120 }} /></div>;

  const total = items.length;
  const done = items.filter((i) => i.status === "completed").length;
  const requiredOpen = items.filter((i) => i.required && i.status !== "completed").length;
  const pct = total ? done / total : 0;
  const r = 34;
  const circ = 2 * Math.PI * r;

  return (
    <motion.section className="panel onboarding-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="onboarding-top">
        <svg width="84" height="84" viewBox="0 0 84 84" className="ring" aria-label={`${done} of ${total} done`}>
          <circle cx="42" cy="42" r={r} className="ring-track" />
          <motion.circle cx="42" cy="42" r={r} className="ring-fill" strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - pct) }} transition={{ duration: 0.9, ease: "easeOut" }} />
          <text x="42" y="47" textAnchor="middle" className="ring-text">{Math.round(pct * 100)}%</text>
        </svg>
        <div>
          <h2>{employee.portalAccessActive ? "You're all set" : "Your onboarding"}</h2>
          <p className="muted-small">
            {employee.portalAccessActive
              ? "Onboarding is complete and your access is active."
              : requiredOpen > 0
                ? `${requiredOpen} required step${requiredOpen === 1 ? "" : "s"} left before ${formatDate(employee.joiningDate)}.`
                : "All done on your side. HR will activate your access next."}
          </p>
        </div>
        {employee.portalAccessActive ? <PartyPopper className="onboarding-badge" size={26} /> : requiredOpen === 0 ? <ShieldCheck className="onboarding-badge" size={26} /> : null}
      </div>
      <ul className="checklist">
        <AnimatePresence initial={false}>
          {items.map((item, i) => {
            const mine = item.taskType !== "access_activation";
            const isDone = item.status === "completed";
            return (
              <motion.li key={item.id} layout className={isDone ? "done" : ""} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.04 } }}>
                <motion.button
                  className="check-toggle"
                  aria-label={isDone ? `${item.title}: done` : `Mark "${item.title}" done`}
                  disabled={isDone || !mine || busyId === item.id}
                  onClick={() => complete(item)}
                  whileTap={{ scale: 0.85 }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isDone ? (
                      <motion.span key="d" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}><Check size={14} /></motion.span>
                    ) : (
                      <motion.span key="o" initial={{ scale: 0.6 }} animate={{ scale: 1 }}><Circle size={14} /></motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
                <span className="check-text">
                  <span>{item.title}{!item.required && <span className="muted-small"> (optional)</span>}</span>
                  {item.description && <span className="muted-small">{item.description}</span>}
                  {!mine && !isDone && <span className="muted-small">HR does this once your steps are done.</span>}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}
