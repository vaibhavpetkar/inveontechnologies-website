import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useAuth, type UserRole } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { ROLE_LABELS } from "../../lib/nav";
import { useColleagues } from "../../lib/workspace";
import { Avatar } from "../Avatar";

export interface FoundPerson {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
}

/**
 * Picks one person: staff by name (the colleague list) and anyone, candidates
 * included, by email (the account directory searches addresses).
 */
export function PersonSearch({ id, value, onChange }: { id: string; value: FoundPerson | null; onChange: (p: FoundPerson | null) => void }) {
  const { accessToken } = useAuth();
  const { people: colleagues } = useColleagues();
  const [query, setQuery] = useState("");
  const [byEmail, setByEmail] = useState<FoundPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (q.length < 2) {
      setByEmail([]);
      return;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch<{ users: FoundPerson[] }>(`/api/v1/users?search=${encodeURIComponent(q)}`, { accessToken })
        .then((r) => live && setByEmail(r.users))
        .catch(() => live && setByEmail([]))
        .finally(() => live && setSearching(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, accessToken]);

  const matches = useMemo(() => {
    if (!q) return [];
    const names = new Map(colleagues.map((c) => [c.id, c.name]));
    const out = new Map<string, FoundPerson>();
    for (const c of colleagues) if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) out.set(c.id, c);
    for (const u of byEmail) if (!out.has(u.id)) out.set(u.id, { ...u, name: names.get(u.id) });
    return [...out.values()].slice(0, 8);
  }, [q, colleagues, byEmail]);

  if (value) {
    return (
      <div className="st-picked">
        <Avatar email={value.email} name={value.name} size={30} />
        <span className="st-picked-text">
          <strong>{value.name ?? value.email}</strong>
          <span className="muted-small">{ROLE_LABELS[value.role] ?? value.role} · {value.email}</span>
        </span>
        <button type="button" className="icon-button" aria-label="Pick someone else" onClick={() => onChange(null)}><X size={16} /></button>
      </div>
    );
  }

  return (
    <div className="people-picker">
      <div className="chip-input">
        <span className="chip-search">
          <Search size={15} />
          <input
            id={id}
            value={query}
            autoComplete="off"
            placeholder="Search by name or email"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                onChange(matches[0]);
              }
            }}
          />
        </span>
      </div>
      <AnimatePresence>
        {q && (matches.length > 0 || !searching) && (
          <motion.ul className="suggest" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onChange(p)}>
                  <Avatar email={p.email} name={p.name} size={26} />
                  <span><strong>{p.name ?? p.email}</strong><span className="muted-small">{ROLE_LABELS[p.role] ?? p.role} · {p.email}</span></span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="st-suggest-empty muted-small">{q.length < 2 ? "Keep typing…" : "Nobody found. Candidates can be found by their email address."}</li>}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
