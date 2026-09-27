import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Briefcase, CalendarDays, Clock, IndianRupee, MapPin, Plus, Search } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { durationLabel, KIND_META, OPPORTUNITY_ADMIN_ROLES, startLabel, stipendLabel, type Opportunity, type OpportunityKind } from "../lib/opportunities";

const TABS: { key: OpportunityKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "internship", label: "Internships" },
  { key: "program", label: "Programs" },
  { key: "job", label: "Jobs" },
];

export default function Opportunities() {
  const { user, accessToken } = useAuth();
  const isAdmin = !!user && OPPORTUNITY_ADMIN_ROLES.includes(user.role);
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<OpportunityKind | "all">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Debounced, and stale responses are dropped — otherwise a slow reply
    // for "rea" can land after the one for "react" and overwrite it.
    let stale = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (kind !== "all") params.set("kind", kind);
    params.set("limit", "50");
    const timer = setTimeout(() => {
      apiFetch<{ opportunities: Opportunity[] }>(`/api/v1/opportunities?${params}`, { accessToken })
        .then((r) => {
          if (stale) return;
          setItems(r.opportunities.filter((o) => o.status !== "archived"));
          setError(null);
        })
        .catch(() => {
          if (!stale) setError("Couldn't load opportunities right now.");
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [accessToken, search, kind]);

  return (
    <DashboardShell>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? "Openings" : "Opportunities"}</h1>
          <p>{isAdmin ? "Internships, programs and jobs. Link courses to give new joiners a training track." : "Internships, training programs and jobs open right now."}</p>
        </div>
        {isAdmin && (
          <Link href="/opportunities/new" className="btn"><Plus size={18} /> New opening</Link>
        )}
      </div>

      <div className="board-toolbar">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t.key} className={kind === t.key ? "active" : ""} onClick={() => setKind(t.key)}>
              {kind === t.key && <motion.span layoutId="opp-kind" className="segmented-pill" />}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input type="search" placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!error && items === null && <div className="opp-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div>}
      {items !== null && items.length === 0 && (
        <div className="empty-state">
          <Briefcase size={40} />
          <h3>Nothing open here right now</h3>
          <p>{kind === "all" ? "Check back soon." : `No ${KIND_META[kind].plural.toLowerCase()} are open at the moment.`}</p>
        </div>
      )}

      <div className="opp-grid">
        <AnimatePresence mode="popLayout">
          {items?.map((o, i) => {
            const meta = KIND_META[o.kind];
            const facts = [
              o.location && { icon: MapPin, text: o.location },
              durationLabel(o.durationMonths) && { icon: Clock, text: durationLabel(o.durationMonths)! },
              stipendLabel(o) && { icon: IndianRupee, text: stipendLabel(o)! },
              startLabel(o.startDate) && { icon: CalendarDays, text: startLabel(o.startDate)! },
            ].filter(Boolean) as { icon: typeof MapPin; text: string }[];
            return (
              <motion.div key={o.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04 } }} exit={{ opacity: 0, scale: 0.96 }}>
                <Link href={`/opportunities/${o.id}`} className={`opp-card kind-${o.kind}`}>
                  <div className="opp-card-top">
                    <span className={`pill pill-${meta.tone}`}>{meta.label}</span>
                    {isAdmin && o.status !== "published" && <span className="pill pill-slate">{o.status === "draft" ? "Draft" : o.status}</span>}
                  </div>
                  <h3>{o.title}</h3>
                  <p className="opp-card-desc">{o.description}</p>
                  {facts.length > 0 && (
                    <div className="opp-facts">
                      {facts.map((f) => <span key={f.text}><f.icon size={14} /> {f.text}</span>)}
                    </div>
                  )}
                  {!!o.courseCount && <div className="opp-courses"><BookOpen size={14} /> {o.courseCount} training course{o.courseCount > 1 ? "s" : ""} included</div>}
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </DashboardShell>
  );
}
