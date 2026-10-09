import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Trophy } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { fmtDelta, fmtScore, monthName, type Growth, type GrowthPoint } from "../../lib/performance";
import { AnimatedNumber } from "../AnimatedNumber";
import "../../styles/performance.css";

/** Your score this month, where you rank, how it changed, and the last 6 months. */
export function MyGrowthWidget() {
  const { accessToken } = useAuth();
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Growth>("/api/v1/performance/growth/me?months=6", { accessToken })
      .then(setGrowth)
      .catch(() => setFailed(true));
  }, [accessToken]);

  if (failed) return null;

  const series = growth?.series ?? [];
  const now = series[series.length - 1];
  const before = series[series.length - 2];
  const delta = now && before ? now.score - before.score : 0;

  return (
    <motion.section className="panel growth-widget" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
      <div className="panel-head">
        <h2>My growth</h2>
        <Link href="/performance" className="link-arrow">
          Ranking <ArrowRight size={16} />
        </Link>
      </div>
      {!growth || !now ? (
        <div className="skeleton-stack">
          <div className="skeleton" style={{ height: 56 }} />
          <div className="skeleton" style={{ height: 90 }} />
        </div>
      ) : (
        <>
          <div className="growth-top">
            <div>
              <span className="growth-score"><AnimatedNumber value={Math.round(now.score)} /></span>
              <span className="stat-label">points in {monthName(now.month).split(" ")[0]}</span>
            </div>
            <div className="growth-rank">
              {now.rank ? (
                <>
                  <strong>#{now.rank}</strong>
                  <span className="stat-label">of {now.of}</span>
                </>
              ) : (
                <span className="stat-label">Not ranked yet</span>
              )}
            </div>
            <DeltaChip delta={delta} label="vs last month" />
          </div>
          {now.score === 0 && <p className="muted-small">Finish a task and get it approved to earn points this month.</p>}
          <GrowthBars series={series} />
          {growth.awards.length > 0 && (
            <div className="growth-awards">
              {growth.awards.slice(0, 3).map((a) => (
                <span key={a.month} className="award-chip">
                  <Trophy size={13} /> Employee of the Month · {a.monthLabel}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}

export function DeltaChip({ delta, label }: { delta: number; label?: string }) {
  const r = Math.round(delta * 10) / 10;
  const Icon = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus;
  const tone = r > 0 ? "up" : r < 0 ? "down" : "flat";
  return (
    <span className={`delta-chip ${tone}`} title={label ? `${fmtDelta(r)} points ${label}` : undefined}>
      <Icon size={14} aria-hidden="true" />
      <span>{fmtDelta(r)}</span>
      {label && <span className="sr-only"> points {label}</span>}
    </span>
  );
}

/** A small bar chart of monthly scores; the current month is highlighted. */
export function GrowthBars({ series }: { series: GrowthPoint[] }) {
  const reduce = useReducedMotion();
  const W = 300;
  const H = 110;
  const top = 18;
  const bottom = 20;
  const gap = 10;
  const bw = (W - gap * (series.length - 1)) / series.length;
  const max = Math.max(1, ...series.map((p) => p.score));
  const summary = series.map((p) => `${monthName(p.month)}: ${fmtScore(p.score)} points${p.rank ? `, rank ${p.rank} of ${p.of}` : ""}`).join("; ");

  return (
    <svg className="growth-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score by month. ${summary}`}>
      <line x1={0} x2={W} y1={H - bottom + 0.5} y2={H - bottom + 0.5} className="growth-axis" />
      {series.map((p, i) => {
        const h = Math.max(2, ((H - top - bottom) * p.score) / max);
        const x = i * (bw + gap);
        const last = i === series.length - 1;
        return (
          <g key={p.month}>
            <title>{`${monthName(p.month)}: ${fmtScore(p.score)} points${p.rank ? ` (#${p.rank} of ${p.of})` : ""}`}</title>
            <motion.rect
              x={x}
              width={bw}
              rx={4}
              className={last ? "growth-bar current" : "growth-bar"}
              initial={reduce ? false : { y: H - bottom, height: 0 }}
              animate={{ y: H - bottom - h, height: h }}
              transition={{ duration: 0.6, delay: 0.05 * i, ease: "easeOut" }}
            />
            {p.score > 0 && (
              <text x={x + bw / 2} y={H - bottom - h - 5} textAnchor="middle" className="growth-value">
                {Math.round(p.score)}
              </text>
            )}
            <text x={x + bw / 2} y={H - 5} textAnchor="middle" className={last ? "growth-label current" : "growth-label"}>
              {monthName(p.month, true)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
