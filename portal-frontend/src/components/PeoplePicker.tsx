import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Search, X } from "lucide-react";
import type { Colleague } from "../lib/calendar";
import { ROLE_LABELS } from "../lib/nav";
import { Avatar } from "./Avatar";

export interface Picked {
  id: string;
  canEdit?: boolean;
}

interface Props {
  id: string;
  people: Colleague[];
  value: Picked[];
  onChange: (next: Picked[]) => void;
  exclude?: string[];
  placeholder?: string;
  /** Show a "can edit" toggle on each chip (sharing notes). */
  editToggle?: boolean;
}

/** Search-and-add chips for choosing colleagues. */
export function PeoplePicker({ id, people, value, onChange, exclude = [], placeholder = "Search by name or email", editToggle = false }: Props) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const chosen = new Set(value.map((v) => v.id));
  const q = query.trim().toLowerCase();
  const matches = q
    ? people.filter((p) => !chosen.has(p.id) && !exclude.includes(p.id) && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))).slice(0, 6)
    : [];

  const add = (personId: string) => {
    onChange([...value, { id: personId, canEdit: false }]);
    setQuery("");
  };

  return (
    <div className="people-picker">
      <div className="chip-input">
        <AnimatePresence initial={false}>
          {value.map((v) => {
            const p = byId.get(v.id);
            return (
              <motion.span key={v.id} className={`chip${v.canEdit ? " chip-edit" : ""}`} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                <Avatar email={p?.email ?? v.id} name={p?.name} size={20} />
                {p?.name ?? "Someone"}
                {editToggle && (
                  <button
                    type="button"
                    className={`chip-toggle${v.canEdit ? " on" : ""}`}
                    aria-pressed={!!v.canEdit}
                    title={v.canEdit ? "Can edit (click for read only)" : "Read only (click to let them edit)"}
                    onClick={() => onChange(value.map((x) => (x.id === v.id ? { ...x, canEdit: !x.canEdit } : x)))}
                  >
                    <Pencil size={11} />
                  </button>
                )}
                <button type="button" aria-label={`Remove ${p?.name ?? "person"}`} onClick={() => onChange(value.filter((x) => x.id !== v.id))}><X size={12} /></button>
              </motion.span>
            );
          })}
        </AnimatePresence>
        <span className="chip-search">
          <Search size={15} />
          <input
            id={id}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                add(matches[0].id);
              }
            }}
            placeholder={value.length ? "Add more" : placeholder}
            autoComplete="off"
          />
        </span>
      </div>
      <AnimatePresence>
        {matches.length > 0 && (
          <motion.ul className="suggest" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p.id)}>
                  <Avatar email={p.email} name={p.name} size={26} />
                  <span><strong>{p.name}</strong><span className="muted-small">{ROLE_LABELS[p.role] ?? p.role} · {p.email}</span></span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
