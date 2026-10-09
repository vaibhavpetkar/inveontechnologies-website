import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Award, CalendarCheck, ChevronLeft, ChevronRight, Clock, Crown, Info, ListChecks, Star, Trash2, Trophy, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { Avatar } from "../components/Avatar";
import { useToast } from "../components/Toast";
import { DeltaChip } from "../components/performance/MyGrowthWidget";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { ROLE_LABELS } from "../lib/nav";
import { currentMonth, fmtScore, monthName, shiftMonth, type EmployeeOfMonth, type EomHistory, type Leaderboard, type RankRow } from "../lib/performance";
import type { UserRole } from "../context/AuthContext";
import "../styles/performance.css";

const roleLabel = (role: string) => ROLE_LABELS[role as UserRole] ?? role;

/** The monthly ranking, the Employee of the Month, and how scores are worked out. */
export default function Performance() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<EmployeeOfMonth[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadBoard = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setBoard(await apiFetch<Leaderboard>(`/api/v1/performance/leaderboard?month=${month}`, { accessToken }));
    } catch (err) {
      setBoard(null);
      setError(err instanceof ApiError && err.status === 403 ? "The ranking is for staff accounts." : "Couldn't load the ranking right now.");
    }
  }, [accessToken, month]);

  const loadHistory = useCallback(() => {
    if (!accessToken) return;
    apiFetch<EomHistory>("/api/v1/performance/employee-of-month", { accessToken })
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, [accessToken]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
  useEffect(loadHistory, [loadHistory]);

  const shown = board?.month === month ? board : null;
  const rows = shown?.rows ?? [];
  const me = rows.find((r) => r.userId === user?.id);
  const isCurrent = month === thisMonth;
  const eom = shown?.employeeOfMonth ?? null;

  async function removePick() {
    if (!eom || !window.confirm(`Remove ${eom.name} as Employee of the Month for ${eom.monthLabel}? People who were already told won't be notified again.`)) return;
    setRemoving(true);
    try {
      await apiFetch(`/api/v1/performance/employee-of-month/${eom.month}`, { method: "DELETE", accessToken });
      toast("Pick removed");
      loadBoard();
      loadHistory();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove the pick.", "error");
    }
    setRemoving(false);
  }

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Performance</h1>
          <p>How everyone is doing this month, based on approved work and reviewer ratings.</p>
        </div>
        <div className="page-head-actions perf-head-actions">
          <div className="month-nav" role="group" aria-label="Choose month">
            <button type="button" className="icon-button" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeft size={18} />
            </button>
            <span className="month-nav-label" aria-live="polite">{monthName(month)}</span>
            <button type="button" className="icon-button" aria-label="Next month" disabled={isCurrent} onClick={() => setMonth((m) => (m < thisMonth ? shiftMonth(m, 1) : m))}>
              <ChevronRight size={18} />
            </button>
          </div>
          {shown?.canPick && (
            <button type="button" className="btn" disabled={!rows.length} onClick={() => setPicking(true)}>
              <Crown size={16} /> {eom ? "Change Employee of the Month" : "Name Employee of the Month"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="perf-layout">
        <div className="perf-main">
          {!shown && !error ? (
            <div className="skeleton" style={{ height: 150, borderRadius: 18 }} />
          ) : eom ? (
            <EomHero eom={eom} isMe={eom.userId === user?.id} canRemove={!!shown?.canPick} removing={removing} onRemove={removePick} />
          ) : shown ? (
            <div className="eom-empty">
              <Trophy size={22} />
              <div>
                <strong>No Employee of the Month for {monthName(month)} yet</strong>
                <span className="muted-small">
                  {isCurrent
                    ? "It's picked in the first week of next month from this ranking, unless HR names someone sooner."
                    : shown.canPick
                      ? "You can name someone from the ranking below."
                      : "Nobody was named for this month."}
                </span>
              </div>
            </div>
          ) : null}

          {me && shown && (
            <div className="stat-grid perf-me-stats">
              <div className="stat-card tone-blue">
                <span className="stat-label">Your rank</span>
                <span className="stat-value">{me.score > 0 ? `#${me.rank}` : "–"}</span>
                <span className="stat-label">{me.score > 0 ? `of ${rows.length}` : "Not ranked yet"}</span>
              </div>
              <div className="stat-card tone-violet">
                <span className="stat-label">Your score</span>
                <span className="stat-value">{fmtScore(me.score)}</span>
                <DeltaChip delta={me.score - me.previousScore} label="vs last month" />
              </div>
              <div className="stat-card tone-green">
                <span className="stat-label">Tasks approved</span>
                <span className="stat-value">{me.tasksDone}</span>
                <span className="stat-label">{me.hours}h of work</span>
              </div>
              <div className="stat-card tone-amber">
                <span className="stat-label">Average stars</span>
                <span className="stat-value">{me.avgRating ?? "–"}</span>
                <span className="stat-label">{me.onTimePercent !== null ? `${me.onTimePercent}% on time` : "No due dates yet"}</span>
              </div>
            </div>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>Ranking · {monthName(month)}</h2>
              {shown && <span className="muted-small">{rows.length} {rows.length === 1 ? "person" : "people"}</span>}
            </div>
            {!shown ? (
              !error && (
                <div className="skeleton-stack">
                  <div className="skeleton" style={{ height: 44 }} />
                  <div className="skeleton" style={{ height: 44 }} />
                  <div className="skeleton" style={{ height: 44 }} />
                </div>
              )
            ) : rows.length === 0 ? (
              <div className="empty-state small">
                <ListChecks size={28} />
                <h3>Nobody to rank yet</h3>
                <p>Approved tasks show up here.</p>
              </div>
            ) : (
              <RankingList rows={rows} meId={user?.id} winnerId={eom?.userId} />
            )}
          </section>
        </div>

        <aside className="perf-side">
          <section className="panel">
            <div className="panel-head">
              <h2><Info size={17} className="inline-icon" /> How scores work</h2>
            </div>
            <ul className="how-list">
              <li>
                <ListChecks size={18} />
                <span>You earn points when a reviewer <strong>approves</strong> one of your tasks. Tasks count in the month they're approved.</span>
              </li>
              <li>
                <Clock size={18} />
                <span><strong>Points = hours × stars × 2.</strong> Hours are the time logged on the task (or its estimate). Longer tasks count for more.</span>
              </li>
              <li>
                <Star size={18} />
                <span>Reviewers give 1 to 5 stars when they approve. Work approved without stars counts as 3.</span>
              </li>
              <li>
                <CalendarCheck size={18} />
                <span>Finished by the due date: <strong>+10%</strong>. Late: <strong>−15%</strong>. Asking for more time early keeps you on time.</span>
              </li>
              <li>
                <Award size={18} />
                <span>The top scorer becomes <strong>Employee of the Month</strong> in the first week of the next month (HR can also name someone). Everyone is told, and the winner gets a congratulation email.</span>
              </li>
            </ul>
            <p className="muted-small how-example">Example: a 5-hour task rated 4 stars and finished on time earns 5 × 4 × 2 × 1.1 = 44 points.</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2><Trophy size={17} className="inline-icon" /> Past winners</h2>
            </div>
            {!history ? (
              <div className="skeleton-stack">
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            ) : history.length === 0 ? (
              <p className="muted-small">No Employee of the Month yet. The first one is named after this month's ranking.</p>
            ) : (
              <ul className="winners-list">
                {history.map((w) => (
                  <li key={w.id} className={w.userId === user?.id ? "is-me" : ""}>
                    <button type="button" className="winner-btn" onClick={() => setMonth(w.month)} aria-label={`${w.monthLabel}: ${w.name}. Show that month`}>
                      <Avatar email={w.email} name={w.name} size={32} />
                      <span className="winner-main">
                        <strong>{w.name}{w.userId === user?.id && <span className="you-tag">You</span>}</strong>
                        <span className="muted-small">{w.monthLabel} · {fmtScore(w.score)} points</span>
                      </span>
                      <Trophy size={16} className="winner-trophy" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {picking && shown && (
          <PickDialog
            board={shown}
            onCancel={() => setPicking(false)}
            onDone={(picked) => {
              setPicking(false);
              toast(`${picked.name} is Employee of the Month for ${picked.monthLabel}. Everyone has been told.`);
              loadBoard();
              loadHistory();
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

function EomHero({ eom, isMe, canRemove, removing, onRemove }: { eom: EmployeeOfMonth; isMe: boolean; canRemove: boolean; removing: boolean; onRemove: () => void }) {
  return (
    <motion.section className={`eom-hero${isMe ? " is-me" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} key={eom.id}>
      <div className="eom-sparks" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} style={{ left: `${8 + i * 12}%`, animationDelay: `${(i % 4) * 0.8}s` }} />
        ))}
      </div>
      <div className="eom-hero-avatar">
        <Avatar email={eom.email} name={eom.name} size={72} />
        <span className="eom-hero-crown" aria-hidden="true"><Crown size={20} /></span>
      </div>
      <div className="eom-hero-body">
        <span className="eom-kicker">Employee of the Month · {eom.monthLabel}</span>
        <h2>{isMe ? `That's you, ${eom.name.split(" ")[0]}! Congratulations.` : eom.name}</h2>
        <div className="eom-hero-stats">
          <span><strong>{fmtScore(eom.score)}</strong> points</span>
          <span><strong>{eom.stats.tasksDone}</strong> task{eom.stats.tasksDone === 1 ? "" : "s"}</span>
          <span><strong>{eom.stats.hours}</strong> hours</span>
          {eom.stats.avgRating !== null && <span><strong>{eom.stats.avgRating}★</strong> average</span>}
          {eom.stats.onTimePercent !== null && <span><strong>{eom.stats.onTimePercent}%</strong> on time</span>}
        </div>
        {eom.note && <p className="eom-hero-note">“{eom.note}”</p>}
        <span className="eom-hero-meta">{eom.chosenBy ? "Named by HR" : "Top of the ranking"}</span>
      </div>
      {canRemove && (
        <button type="button" className="icon-button eom-hero-remove" aria-label="Remove this pick" title="Remove this pick" disabled={removing} onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      )}
    </motion.section>
  );
}

function RankingList({ rows, meId, winnerId }: { rows: RankRow[]; meId?: string; winnerId?: string }) {
  return (
    <div className="rank-table" role="table" aria-label="Ranking">
      <div className="rank-row rank-header" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Person</span>
        <span role="columnheader" className="num">Score</span>
        <span role="columnheader" className="num">Change</span>
        <span role="columnheader" className="num">Tasks</span>
        <span role="columnheader" className="num">Hours</span>
        <span role="columnheader" className="num">Stars</span>
        <span role="columnheader" className="num">On time</span>
      </div>
      {rows.map((r, i) => {
        const isMe = r.userId === meId;
        const moved = r.previousRank && r.score > 0 ? r.previousRank - r.rank : 0;
        return (
          <motion.div
            key={r.userId}
            role="row"
            className={`rank-row${isMe ? " is-me" : ""}${r.score === 0 ? " zero" : ""}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.03 }}
            aria-current={isMe ? "true" : undefined}
          >
            <span role="cell" className="rank-cell">
              <span className={`rank-badge rank-${r.score > 0 ? r.rank : 0}`}>{r.score > 0 ? r.rank : "–"}</span>
            </span>
            <span role="cell" className="person-cell">
              <Avatar email={r.email} name={r.name} size={34} />
              <span className="person-text">
                <strong>
                  {r.name}
                  {isMe && <span className="you-tag">You</span>}
                  {r.userId === winnerId && <Trophy size={14} className="winner-trophy" aria-label="Employee of the Month" />}
                </strong>
                <span className="muted-small">{r.designation ?? roleLabel(r.role)}</span>
              </span>
            </span>
            <span role="cell" className="num score-cell">
              <strong>{fmtScore(r.score)}</strong>
              <span className="cell-label"> points</span>
            </span>
            <span role="cell" className="num change-cell">
              <DeltaChip delta={r.score - r.previousScore} label="vs last month" />
              {moved !== 0 && <span className="muted-small rank-moved">{moved > 0 ? `up ${moved}` : `down ${-moved}`}</span>}
            </span>
            <span className="stats-group">
            <span role="cell" className="num stat-cell"><span className="cell-label">Tasks </span>{r.tasksDone}</span>
            <span role="cell" className="num stat-cell"><span className="cell-label">Hours </span>{r.hours}</span>
            <span role="cell" className="num stat-cell"><span className="cell-label">Stars </span>{r.avgRating !== null ? `${r.avgRating}★` : "–"}</span>
            <span role="cell" className="num stat-cell"><span className="cell-label">On time </span>{r.onTimePercent !== null ? `${r.onTimePercent}%` : "–"}</span>
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function PickDialog({ board, onCancel, onDone }: { board: Leaderboard; onCancel: () => void; onDone: (eom: EmployeeOfMonth) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const candidates = useMemo(() => board.rows.slice(0, 25), [board.rows]);
  const [userId, setUserId] = useState(board.employeeOfMonth?.userId ?? candidates[0]?.userId ?? "");
  const [note, setNote] = useState(board.employeeOfMonth?.note ?? "");
  const [busy, setBusy] = useState(false);
  const chosen = board.rows.find((r) => r.userId === userId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ employeeOfMonth: EmployeeOfMonth }>("/api/v1/performance/employee-of-month", {
        method: "POST",
        body: { month: board.month, userId, note: note.trim() || undefined },
        accessToken,
      });
      onDone(r.employeeOfMonth);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the pick.", "error");
      setBusy(false);
    }
  }

  return createPortal(
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onCancel}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pick-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="pick-title" className="modal-title-icon"><Crown size={20} /> Employee of the Month</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}><X size={18} /></button>
        </div>
        <p className="muted-small">For {board.monthLabel}. The top scorer is picked to start with.</p>
        {board.employeeOfMonth && <p className="pick-replace">This replaces the current pick, {board.employeeOfMonth.name}.</p>}

        <fieldset className="pick-list">
          <legend className="field-label">Who?</legend>
          {candidates.map((r) => (
            <label key={r.userId} className={`pick-option${userId === r.userId ? " selected" : ""}`}>
              <input type="radio" name="eom-person" value={r.userId} checked={userId === r.userId} onChange={() => setUserId(r.userId)} />
              <span className={`rank-badge rank-${r.score > 0 ? r.rank : 0}`}>{r.score > 0 ? r.rank : "–"}</span>
              <Avatar email={r.email} name={r.name} size={28} />
              <span className="pick-name">
                <strong>{r.name}</strong>
                <span className="muted-small">{r.tasksDone} tasks · {r.avgRating !== null ? `${r.avgRating}★` : "no stars"}</span>
              </span>
              <strong className="pick-score">{fmtScore(r.score)}</strong>
            </label>
          ))}
        </fieldset>

        <div className="field">
          <label htmlFor="eom-note">A note for everyone (optional)</label>
          <textarea id="eom-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What made their month stand out?" />
        </div>

        <p className="pick-notice">
          <Info size={15} /> Everyone on the team gets a notification, and {chosen ? chosen.name.split(" ")[0] : "the winner"} gets a congratulation email.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn" disabled={busy || !userId}>
            <Crown size={16} /> Announce
          </button>
        </div>
      </motion.form>
    </motion.div>,
    document.body,
  );
}
