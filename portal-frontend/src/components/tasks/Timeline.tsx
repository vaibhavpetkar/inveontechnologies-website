import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { IssueType, TaskStatus } from "../../lib/tasks";
import { IssueKey, IssueTypeIcon } from "./IssueBits";
import "../../styles/engineering.css";

interface Item {
  id: string;
  key: string | null;
  title: string;
  type: IssueType;
  status: TaskStatus;
  parentId: string | null;
  assignee: string | null;
  start: string | null;
  end: string | null;
  progressPercent: number;
}
interface Data {
  items: Item[];
  dependencies: { from: string; to: string }[];
  sprints: { id: string; name: string; startDate: string | null; endDate: string | null }[];
  versions: { id: string; name: string; releaseDate: string | null }[];
}

const ROW = 34;
const HEAD = 44;
const DAY = 86_400_000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * The project timeline: epics with their issues as bars from start to due
 * date, sprints as bands, releases as markers, and arrows for "blocks"
 * dependencies.
 */
export function Timeline({ projectId, onOpenTask, version = 0 }: { projectId: string; onOpenTask: (ref: string) => void; version?: number }) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"weeks" | "months">("weeks");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const chart = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<Data>(`/api/v1/projects/${projectId}/timeline`, { accessToken })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the timeline."));
  }, [projectId, accessToken, version]);

  // Epics first with their issues under them, then issues without an epic.
  const rows = useMemo(() => {
    if (!data) return [];
    const dated = (i: Item) => !!(i.start || i.end);
    const out: (Item & { depth: number })[] = [];
    const epics = data.items.filter((i) => i.type === "epic");
    for (const e of epics) {
      const kids = data.items.filter((i) => i.parentId === e.id && dated(i));
      if (!dated(e) && !kids.length) continue;
      out.push({ ...e, depth: 0 });
      if (!collapsed.has(e.id)) kids.forEach((k) => out.push({ ...k, depth: 1 }));
    }
    data.items.filter((i) => i.type !== "epic" && !i.parentId && dated(i)).forEach((i) => out.push({ ...i, depth: 0 }));
    return out;
  }, [data, collapsed]);

  const range = useMemo(() => {
    const times = rows.flatMap((r) => [r.start, r.end]).filter((d): d is string => !!d).map((d) => new Date(d).getTime());
    data?.sprints.forEach((s) => [s.startDate, s.endDate].forEach((d) => d && times.push(new Date(d).getTime())));
    times.push(Date.now());
    const from = startOfDay(Math.min(...times)) - 3 * DAY;
    const to = startOfDay(Math.max(...times)) + 10 * DAY;
    return { from, to, days: Math.round((to - from) / DAY) };
  }, [rows, data]);

  const dayW = zoom === "weeks" ? 26 : 8;
  const width = range.days * dayW;
  const x = (iso: string | number) => ((typeof iso === "number" ? iso : new Date(iso).getTime()) - range.from) / DAY * dayW;

  // Scroll so today is in view.
  useEffect(() => {
    if (chart.current) chart.current.scrollLeft = Math.max(0, x(Date.now()) - chart.current.clientWidth / 3);
  }, [range.from, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="skeleton" style={{ height: 300 }} />;
  const undated = data.items.filter((i) => !i.start && !i.end && i.type !== "epic").length;
  if (!rows.length) {
    return (
      <div className="empty-state">
        <CalendarRange size={28} />
        <h3>Nothing on the timeline yet</h3>
        <p>Give issues a start and due date, or plan them into a sprint with dates, and they show up here.</p>
      </div>
    );
  }

  const height = HEAD + rows.length * ROW;
  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  const bar = (r: Item) => {
    const s = r.start ? x(r.start) : x(r.end!) - dayW;
    const e = r.end ? x(startOfDay(new Date(r.end).getTime()) + DAY) : x(r.start!) + dayW;
    return { left: Math.min(s, e - 6), right: Math.max(e, s + 6) };
  };
  const days = Array.from({ length: range.days }, (_, i) => range.from + i * DAY);
  const months = days.filter((d, i) => i === 0 || new Date(d).getDate() === 1);

  return (
    <div className="timeline-wrap">
      <div className="timeline-toolbar">
        <span>{rows.length} item{rows.length === 1 ? "" : "s"} on the timeline{undated ? ` · ${undated} without dates` : ""}</span>
        <select aria-label="Zoom" value={zoom} onChange={(e) => setZoom(e.target.value as "weeks" | "months")} style={{ marginLeft: "auto" }}>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
        </select>
      </div>
      <div className="timeline-grid">
        <div className="timeline-names">
          <div className="tl-head" style={{ height: HEAD }} />
          {rows.map((r) => (
            <div
              key={r.id}
              className={`tl-row${r.depth ? " child" : ""}`}
              style={{ height: ROW }}
              role="button"
              tabIndex={0}
              onClick={() => onOpenTask(r.key ?? r.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpenTask(r.key ?? r.id)}
            >
              {r.type === "epic" && (
                <button
                  type="button"
                  className="icon-button"
                  style={{ width: 20, height: 20 }}
                  aria-label={collapsed.has(r.id) ? "Show issues" : "Hide issues"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    });
                  }}
                >
                  {collapsed.has(r.id) ? "▸" : "▾"}
                </button>
              )}
              <IssueTypeIcon type={r.type} size={15} />
              <IssueKey value={r.key} />
              <span className="title" title={r.title}>{r.title}</span>
            </div>
          ))}
        </div>
        <div className="timeline-chart" ref={chart}>
          <svg width={width} height={height} role="img" aria-label="Project timeline">
            <defs>
              <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#f97316" />
              </marker>
            </defs>
            {days.map((d, i) => {
              const wd = new Date(d).getDay();
              return wd === 0 || wd === 6 ? <rect key={d} x={i * dayW} y={HEAD} width={dayW} height={height - HEAD} className="tl-weekend" /> : null;
            })}
            {data.sprints.filter((s) => s.startDate && s.endDate).map((s) => (
              <g key={s.id}>
                <rect x={x(s.startDate!)} y={HEAD} width={Math.max(2, x(s.endDate!) - x(s.startDate!))} height={height - HEAD} className="tl-sprint" />
                <text x={x(s.startDate!) + 4} y={height - 6} className="tl-sprint-label">{s.name}</text>
              </g>
            ))}
            {months.map((m) => (
              <g key={m}>
                <line x1={x(m)} x2={x(m)} y1={0} y2={height} className="tl-grid-line" />
                <text x={x(m) + 4} y={16} className="tl-month">{new Date(m).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</text>
              </g>
            ))}
            {zoom === "weeks" && days.filter((d) => new Date(d).getDay() === 1).map((d) => (
              <text key={d} x={x(d) + 3} y={36} className="tl-day">{new Date(d).getDate()}</text>
            ))}
            <line x1={0} x2={width} y1={HEAD} y2={HEAD} className="tl-grid-line" />
            {rows.map((r, i) => {
              const { left, right } = bar(r);
              const y = HEAD + i * ROW + 8;
              const w = right - left;
              return (
                <g key={r.id} className={`tl-bar${r.type === "epic" ? " epic" : ""}${r.status === "done" ? " done" : ""}`} onClick={() => onOpenTask(r.key ?? r.id)}>
                  <title>{`${r.key ?? ""} ${r.title}${r.assignee ? ` · ${r.assignee}` : ""}${r.start ? ` · from ${new Date(r.start).toLocaleDateString()}` : ""}${r.end ? ` to ${new Date(r.end).toLocaleDateString()}` : ""}`}</title>
                  <rect className="track" x={left} y={y} width={w} height={ROW - 16} rx={5} />
                  <rect className="fill" x={left} y={y + ROW - 19} width={(w * r.progressPercent) / 100} height={3} rx={1.5} />
                  {w > 60 && <text x={left + 6} y={y + 12}>{r.assignee ?? ""}</text>}
                </g>
              );
            })}
            {data.dependencies.map((d) => {
              const a = rowIndex.get(d.from);
              const b = rowIndex.get(d.to);
              if (a === undefined || b === undefined) return null;
              const from = bar(rows[a]);
              const to = bar(rows[b]);
              const y1 = HEAD + a * ROW + ROW / 2;
              const y2 = HEAD + b * ROW + ROW / 2;
              const x1 = from.right;
              const x2 = to.left;
              const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 12));
              return <path key={`${d.from}-${d.to}`} className="tl-dep" d={`M${x1},${y1} H${mid} V${y2} H${x2 - 1}`} markerEnd="url(#tl-arrow)" />;
            })}
            {data.versions.filter((v) => v.releaseDate).map((v) => (
              <g key={v.id} className="tl-version">
                <line x1={x(v.releaseDate!)} x2={x(v.releaseDate!)} y1={HEAD} y2={height} />
                <text x={x(v.releaseDate!) + 3} y={HEAD + 12}>{v.name}</text>
              </g>
            ))}
            <line x1={x(Date.now())} x2={x(Date.now())} y1={0} y2={height} className="tl-today" />
          </svg>
        </div>
      </div>
      {undated > 0 && <div className="tl-undated">{undated} issue{undated === 1 ? " has" : "s have"} no dates yet. Set a start and due date in the issue to place {undated === 1 ? "it" : "them"} here.</div>}
    </div>
  );
}
