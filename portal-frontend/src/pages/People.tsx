import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Hourglass, Search, UserPlus, Users } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Avatar } from "../components/Avatar";
import { InviteDialog } from "../components/people/InviteDialog";
import { PersonDrawer } from "../components/people/PersonDrawer";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { apiFetch } from "../lib/api";
import { formatDate, onboardingStage, STATUS_META, TYPE_LABELS, type Person } from "../lib/people";

type Filter = "all" | "onboarding" | "ready" | "active";

export default function People() {
  const { user, accessToken } = useAuth();
  const { arrivals } = useNotifications();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/people/:id");
  const openId = params?.id ?? null;
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);

  const isManager = user?.role === "manager";
  const canManage = !!user && ["hr", "admin", "super_admin"].includes(user.role);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setPeople((await apiFetch<{ people: Person[] }>("/api/v1/people", { accessToken })).people);
      setError(null);
    } catch {
      setError("Couldn't load people right now.");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load, arrivals]);

  const stats = useMemo(() => {
    const list = people ?? [];
    return {
      total: list.filter((p) => p.status !== "offboarded").length,
      onboarding: list.filter((p) => !p.portalAccessActive && p.requiredOpen > 0).length,
      ready: list.filter((p) => !p.portalAccessActive && p.requiredOpen === 0).length,
      active: list.filter((p) => p.portalAccessActive).length,
    };
  }, [people]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (people ?? []).filter((p) => {
      if (filter === "onboarding" && (p.portalAccessActive || p.requiredOpen === 0)) return false;
      if (filter === "ready" && (p.portalAccessActive || p.requiredOpen > 0)) return false;
      if (filter === "active" && !p.portalAccessActive) return false;
      if (!q) return true;
      return [p.name, p.email, p.department, p.designation, p.businessId].some((v) => v?.toLowerCase().includes(q));
    });
  }, [people, filter, search]);

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>{isManager ? "My team" : "People"}</h1>
          <p>{isManager ? "The people who report to you and where they are in onboarding." : "Everyone on the team, their onboarding, and who they report to."}</p>
        </div>
        {canManage && (
          <motion.button className="btn" onClick={() => setInviting(true)} whileTap={{ scale: 0.96 }}>
            <UserPlus size={18} /> Invite people
          </motion.button>
        )}
      </div>

      <div className="stat-grid">
        {[
          { label: "On the team", value: stats.total, icon: Users, tone: "blue" },
          { label: "Onboarding", value: stats.onboarding, icon: Hourglass, tone: "amber" },
          { label: "Ready to activate", value: stats.ready, icon: CheckCircle2, tone: "violet" },
          { label: "Access active", value: stats.active, icon: CheckCircle2, tone: "green" },
        ].map((s, i) => (
          <motion.div key={s.label} className={`stat-card tone-${s.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
            <span className="stat-icon">
              <s.icon size={18} />
            </span>
            <span className="stat-value">
              <AnimatedNumber value={s.value} />
            </span>
            <span className="stat-label">{s.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="board-toolbar">
        <div className="segmented" role="tablist" aria-label="Filter people">
          {(
            [
              ["all", "Everyone"],
              ["onboarding", "Onboarding"],
              ["ready", "Ready"],
              ["active", "Active"],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {filter === value && <motion.span layoutId="people-pill" className="segmented-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input placeholder="Search name, email, department" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!people && !error && (
        <div className="people-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72 }} />
          ))}
        </div>
      )}

      {people && people.length === 0 && (
        <motion.div className="empty-state" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <Users size={36} />
          <h3>{isManager ? "No one reports to you yet" : "No employees yet"}</h3>
          <p>{isManager ? "When HR sets you as someone's manager, they show up here." : "Invite your first people, or they'll appear here when a candidate accepts an offer."}</p>
          {canManage && (
            <button className="btn" onClick={() => setInviting(true)}>
              <UserPlus size={18} /> Invite people
            </button>
          )}
        </motion.div>
      )}

      {people && people.length > 0 && (
        <div className="people-list" role="list">
          <AnimatePresence initial={false}>
            {visible.map((p, i) => {
              const stage = onboardingStage(p);
              const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
              return (
                <motion.button
                  key={p.id}
                  role="listitem"
                  layout
                  className="person-row"
                  onClick={() => navigate(`/people/${p.id}`)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03 } }}
                  exit={{ opacity: 0 }}
                  whileHover={{ y: -2 }}
                >
                  <Avatar email={p.email} name={p.name} size={40} />
                  <span className="person-main">
                    <span className="person-name">{p.name}</span>
                    <span className="person-sub">{[p.designation, p.department].filter(Boolean).join(" · ") || p.email}</span>
                  </span>
                  <span className="person-meta hide-sm">
                    <span className="pill pill-slate">{TYPE_LABELS[p.employeeType]}</span>
                    <span className="muted-small">Joins {formatDate(p.joiningDate)}</span>
                  </span>
                  <span className="person-meta hide-sm">
                    <span className="muted-small">Reports to</span>
                    <span>{p.managerName ?? "No manager"}</span>
                  </span>
                  <span className="person-progress">
                    <span className="person-progress-top">
                      <span className={`pill pill-${stage.tone}`}>{stage.label}</span>
                      <span className="muted-small">{pct}%</span>
                    </span>
                    <span className="progress-bar">
                      <motion.span className="progress-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
                    </span>
                  </span>
                  <span className={`pill pill-${STATUS_META[p.status].tone} hide-sm`}>{STATUS_META[p.status].label}</span>
                </motion.button>
              );
            })}
          </AnimatePresence>
          {visible.length === 0 && <p className="muted-small">No one matches that filter.</p>}
        </div>
      )}

      <AnimatePresence>
        {openId && <PersonDrawer key={openId} personId={openId} canManage={canManage} onClose={() => navigate("/people")} onChanged={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {inviting && (
          <InviteDialog
            onClose={() => setInviting(false)}
            onInvited={() => {
              load();
            }}
          />
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
