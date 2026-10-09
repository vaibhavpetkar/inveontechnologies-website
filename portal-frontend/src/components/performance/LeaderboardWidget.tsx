import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { fmtScore, type Leaderboard } from "../../lib/performance";
import { Avatar } from "../Avatar";
import { DeltaChip } from "./MyGrowthWidget";
import "../../styles/performance.css";

/** The top 5 this month. */
export function LeaderboardWidget() {
  const { user, accessToken } = useAuth();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Leaderboard>("/api/v1/performance/leaderboard", { accessToken })
      .then(setBoard)
      .catch(() => setFailed(true));
  }, [accessToken]);

  if (failed) return null;

  const top = (board?.rows ?? []).filter((r) => r.score > 0).slice(0, 5);
  const me = board?.rows.find((r) => r.userId === user?.id);
  const meOutside = me && me.score > 0 && !top.some((r) => r.userId === me.userId);

  return (
    <motion.section className="panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
      <div className="panel-head">
        <h2>Top performers{board ? <span className="panel-sub"> · {board.monthLabel.split(" ")[0]}</span> : null}</h2>
        <Link href="/performance" className="link-arrow">
          Full ranking <ArrowRight size={16} />
        </Link>
      </div>
      {!board ? (
        <div className="skeleton-stack">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : top.length === 0 ? (
        <p className="muted-small">No approved work yet this month. The first approved task puts someone on the board.</p>
      ) : (
        <ol className="mini-board">
          {top.map((r, i) => (
            <motion.li key={r.userId} className={r.userId === user?.id ? "is-me" : ""} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              <span className={`rank-badge rank-${r.rank}`}>{r.rank}</span>
              <Avatar email={r.email} name={r.name} size={28} />
              <span className="mini-board-name">
                {r.name}
                {r.userId === user?.id && <span className="you-tag">You</span>}
              </span>
              <DeltaChip delta={r.score - r.previousScore} label="vs last month" />
              <strong className="mini-board-score">{fmtScore(r.score)}</strong>
            </motion.li>
          ))}
          {meOutside && me && (
            <li className="is-me mini-board-me">
              <span className="rank-badge">{me.rank}</span>
              <Avatar email={me.email} name={me.name} size={28} />
              <span className="mini-board-name">
                {me.name}
                <span className="you-tag">You</span>
              </span>
              <DeltaChip delta={me.score - me.previousScore} label="vs last month" />
              <strong className="mini-board-score">{fmtScore(me.score)}</strong>
            </li>
          )}
        </ol>
      )}
    </motion.section>
  );
}
