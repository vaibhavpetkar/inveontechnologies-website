import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, PartyPopper, Trophy } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { currentMonth, shiftMonth, type EomHistory } from "../../lib/performance";
import { Avatar } from "../Avatar";
import "../../styles/performance.css";

const SPARKS = Array.from({ length: 10 }, (_, i) => i);

/** Celebrates the latest Employee of the Month (this month's or last month's pick only). */
export function EmployeeOfMonthBanner() {
  const { user, accessToken } = useAuth();
  const reduce = useReducedMotion();
  const [data, setData] = useState<EomHistory | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<EomHistory>("/api/v1/performance/employee-of-month", { accessToken })
      .then(setData)
      .catch(() => setData(null));
  }, [accessToken]);

  const eom = data?.latest;
  const now = currentMonth();
  if (!eom || (eom.month !== now && eom.month !== shiftMonth(now, -1))) return null;

  const isMe = eom.userId === user?.id;
  const first = eom.name.split(" ")[0];

  return (
    <motion.section
      className={`eom-banner${isMe ? " is-me" : ""}`}
      aria-label="Employee of the Month"
      initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    >
      <div className="eom-sparks" aria-hidden="true">
        {SPARKS.map((i) => (
          <span key={i} style={{ left: `${6 + i * 9.5}%`, animationDelay: `${(i % 5) * 0.7}s` }} />
        ))}
      </div>
      <motion.div className="eom-trophy" aria-hidden="true" animate={reduce ? undefined : { rotate: [0, -8, 8, -4, 0] }} transition={{ duration: 1.4, delay: 0.4, repeat: Infinity, repeatDelay: 6 }}>
        <Trophy size={28} />
      </motion.div>
      <Avatar email={eom.email} name={eom.name} size={46} />
      <div className="eom-text">
        <span className="eom-kicker">Employee of the Month · {eom.monthLabel}</span>
        {isMe ? (
          <strong>
            That's you, {first}! <PartyPopper size={18} className="eom-party" aria-hidden="true" /> Congratulations, and thank you.
          </strong>
        ) : (
          <strong>Congratulations to {eom.name}!</strong>
        )}
        <span className="eom-stats">
          {eom.stats.tasksDone} task{eom.stats.tasksDone === 1 ? "" : "s"} approved · {eom.stats.hours}h of work
          {eom.stats.avgRating ? ` · ${eom.stats.avgRating}★ average` : ""}
          {eom.stats.onTimePercent !== null ? ` · ${eom.stats.onTimePercent}% on time` : ""}
        </span>
        {eom.note && <span className="eom-note">“{eom.note}”</span>}
      </div>
      <Link href="/performance" className="eom-link">
        See the ranking <ArrowRight size={15} />
      </Link>
    </motion.section>
  );
}
