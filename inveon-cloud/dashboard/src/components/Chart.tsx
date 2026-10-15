import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

/**
 * Small time-series line chart in inline SVG (no chart library). Colours
 * come from the --series-* tokens, which have light and dark steps; text
 * uses the text tokens, never the series colour. Each chart has a visible
 * title and text summary, an aria description, a crosshair that follows the
 * mouse or the arrow keys, and a data table behind a disclosure.
 */

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  /** Categorical slot: 1 (blue) or 2 (orange). Fixed per meaning, never by rank. */
  slot: 1 | 2;
  dashed?: boolean;
}

interface Props {
  title: string;
  /** Sample times (ms), one per value. */
  times: number[];
  series: ChartSeries[];
  /** Time domain shown (ms). */
  from: number;
  to: number;
  /** Expected spacing of points (s); wider gaps break the line. */
  stepSec: number;
  format: (v: number) => string;
  /** Fixed top of the y axis (100 for percent, total memory); otherwise from the data. */
  yMax?: number;
  summary: string;
  height?: number;
}

const PAD = { top: 10, right: 12, bottom: 24, left: 56 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

const timeLabel = (ms: number, spanMs: number) =>
  new Date(ms).toLocaleString(undefined, spanMs > 2 * 86400_000 ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" });
const fullTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function LineChart({ title, times, series, from, to, stepSec, format, yMax, summary, height = 170 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(240, Math.floor(entries[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dataMax = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const top = yMax && yMax > 0 ? yMax : niceMax(dataMax * 1.1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const span = Math.max(1, to - from);
  const x = (t: number) => PAD.left + ((t - from) / span) * plotW;
  const y = (v: number) => PAD.top + plotH - (Math.min(v, top) / top) * plotH;

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = "";
        let prevT: number | null = null;
        s.values.forEach((v, i) => {
          if (v === null) {
            prevT = null;
            return;
          }
          const t = times[i];
          const gap = prevT !== null && t - prevT > stepSec * 2500;
          d += `${prevT === null || gap ? "M" : "L"}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
          prevT = t;
        });
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, times, width, top, from, to, stepSec],
  );

  const ticksY = [0, top / 2, top];
  const ticksX = [from, from + span / 2, to];

  const nearest = (clientX: number, rect: DOMRect) => {
    if (!times.length) return null;
    const t = from + ((clientX - rect.left - PAD.left) / plotW) * span;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i;
    return best;
  };
  const onMove = (e: MouseEvent<SVGSVGElement>) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!times.length) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setHover((h) => Math.max(0, Math.min(times.length - 1, (h ?? times.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Escape") setHover(null);
  };

  const hx = hover !== null ? x(times[hover]) : null;

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title" id={`${id}-t`}>
          {title}
        </span>
        <span className="chart-summary" id={`${id}-d`}>
          {summary}
        </span>
      </figcaption>
      {series.length > 1 && (
        <ul className="chart-legend" aria-hidden="true">
          {series.map((s) => (
            <li key={s.label}>
              <span className={`chart-swatch slot-${s.slot} ${s.dashed ? "dashed" : ""}`} /> {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="chart-plot" ref={wrap}>
        {times.length === 0 ? (
          <p className="chart-empty">No data for this period.</p>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            tabIndex={0}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {ticksY.map((v, i) => (
              <g key={`y${i}`}>
                <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
                <text className="chart-axis" x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end">
                  {format(v)}
                </text>
              </g>
            ))}
            {ticksX.map((t, i) => (
              <text key={`x${i}`} className="chart-axis" x={x(t)} y={height - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>
                {timeLabel(t, span)}
              </text>
            ))}
            {paths.map((d, i) => (
              <path key={series[i].label} d={d} className={`chart-line slot-${series[i].slot} ${series[i].dashed ? "dashed" : ""}`} />
            ))}
            {hx !== null && hover !== null && (
              <g aria-hidden="true">
                <line className="chart-crosshair" x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + plotH} />
                {series.map((s) => (s.values[hover] !== null ? <circle key={s.label} className={`chart-dot slot-${s.slot}`} cx={hx} cy={y(s.values[hover]!)} r={4} /> : null))}
              </g>
            )}
          </svg>
        )}
        {hover !== null && hx !== null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(hx, 90), width - 90) }} role="status">
            <strong>{fullTime(times[hover])}</strong>
            {series.map((s) => (
              <span key={s.label}>
                <span className={`chart-swatch slot-${s.slot} ${s.dashed ? "dashed" : ""}`} /> {s.label}: {s.values[hover] === null ? "no data" : format(s.values[hover]!)}
              </span>
            ))}
          </div>
        )}
      </div>
      {times.length > 0 && (
        <details className="chart-table">
          <summary>Data table</summary>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  {series.map((s) => (
                    <th key={s.label} scope="col">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t, i) => (
                  <tr key={t}>
                    <td className="nowrap">{fullTime(t)}</td>
                    {series.map((s) => (
                      <td key={s.label}>{s.values[i] === null ? "—" : format(s.values[i]!)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------- summaries and formats

export const fmtPct = (v: number) => `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)}%`;

export function fmtBytes(v: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export const fmtRate = (v: number) => `${fmtBytes(v)}/s`;

/** "averaged 23%, peaked at 81% at 14:05; now 30%" for a series, or "no data". */
export function describeSeries(values: (number | null)[], times: number[], format: (v: number) => string, peaks?: (number | null)[]) {
  const known = values.map((v, i) => ({ v, t: times[i] })).filter((p): p is { v: number; t: number } => p.v !== null);
  if (!known.length) return "no data";
  const avg = known.reduce((s, p) => s + p.v, 0) / known.length;
  const peakSource = (peaks ?? values).map((v, i) => ({ v, t: times[i] })).filter((p): p is { v: number; t: number } => p.v !== null);
  const peak = peakSource.reduce((a, b) => (b.v > a.v ? b : a));
  return `averaged ${format(avg)}, peaked at ${format(peak.v)} (${fullTime(peak.t)}), latest ${format(known[known.length - 1].v)}`;
}
