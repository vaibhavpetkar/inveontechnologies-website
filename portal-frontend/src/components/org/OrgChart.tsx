import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Pencil, Search, UserRoundX } from "lucide-react";
import { useAuth, type UserRole } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { ROLE_LABELS } from "../../lib/nav";
import { Avatar } from "../Avatar";
import { Dialog } from "../settings/ui";
import { useToast } from "../Toast";
import "../../styles/org-chart.css";

export interface OrgPerson {
  userId: string;
  employeeId: string | null;
  businessId: string | null;
  name: string;
  email: string;
  role: UserRole;
  designation: string | null;
  department: string | null;
  managerId: string | null;
  status: string | null;
}

interface Node extends OrgPerson {
  reports: Node[];
  total: number; // everyone below, at any depth
}

/** Builds the reporting tree; people whose manager isn't on staff any more start their own branch. */
function buildTree(people: OrgPerson[]) {
  const byId = new Map<string, Node>(people.map((p) => [p.userId, { ...p, reports: [], total: 0 }]));
  const roots: Node[] = [];
  for (const node of byId.values()) {
    const boss = node.managerId ? byId.get(node.managerId) : undefined;
    if (boss && boss !== node) boss.reports.push(node);
    else roots.push(node);
  }
  const rank: Record<string, number> = { super_admin: 0, admin: 1, hr: 2, manager: 3, employee: 4, intern: 5 };
  const sort = (list: Node[]) => list.sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.name.localeCompare(b.name));
  const count = (n: Node, seen: Set<string>): number => {
    if (seen.has(n.userId)) return 0; // a bad loop in old data shouldn't hang the page
    seen.add(n.userId);
    sort(n.reports);
    n.total = n.reports.reduce((sum, r) => sum + 1 + count(r, seen), 0);
    return n.total;
  };
  const seen = new Set<string>();
  sort(roots).forEach((r) => count(r, seen));
  // People with a team come first; everyone else without a manager is listed after them.
  return { leaders: roots.filter((r) => r.reports.length > 0), unassigned: roots.filter((r) => r.reports.length === 0), byId };
}

const matches = (p: OrgPerson, q: string) => [p.name, p.email, p.designation, p.department, p.businessId].some((v) => v?.toLowerCase().includes(q));

/** Who reports to whom, as a tree. HR and admins can change anyone's manager. */
export function OrgChart() {
  const { accessToken } = useAuth();
  const [people, setPeople] = useState<OrgPerson[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<OrgPerson | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ people: OrgPerson[]; canEdit: boolean }>("/api/v1/employees/org-chart", { accessToken });
      setPeople(r.people);
      setCanEdit(r.canEdit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the team structure.");
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => (people ? buildTree(people) : null), [people]);
  const q = query.trim().toLowerCase();
  // While searching, keep a branch open if anyone in it matches.
  const visible = useMemo(() => {
    if (!tree || !q) return null;
    const keep = new Set<string>();
    const walk = (n: Node): boolean => {
      const below = n.reports.map(walk).some(Boolean);
      const hit = matches(n, q) || below;
      if (hit) keep.add(n.userId);
      return hit;
    };
    [...tree.leaders, ...tree.unassigned].forEach(walk);
    return keep;
  }, [tree, q]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!tree || !people) return <div className="org-skeleton">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}</div>;

  const managers = people.filter((p) => people.some((o) => o.managerId === p.userId)).length;
  const show = (n: Node) => !visible || visible.has(n.userId);

  return (
    <div className="org">
      <div className="org-toolbar">
        <div className="org-stats">
          <span><strong>{people.length}</strong> people</span>
          <span><strong>{managers}</strong> with a team</span>
          <span><strong>{tree.unassigned.length}</strong> without a manager</span>
        </div>
        <label className="org-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role or ID" aria-label="Search people" />
        </label>
      </div>

      {tree.leaders.filter(show).length > 0 && (
        <ul className="org-tree" role="tree" aria-label="Reporting structure">
          {tree.leaders.filter(show).map((n) => (
            <Branch key={n.userId} node={n} depth={0} show={show} forceOpen={!!visible} canEdit={canEdit} onEdit={setEditing} />
          ))}
        </ul>
      )}

      {tree.unassigned.filter(show).length > 0 && (
        <section className="org-unassigned">
          <h3><UserRoundX size={16} /> No manager set</h3>
          <p className="muted-small">{canEdit ? "Use the pencil to choose who each person reports to." : "HR hasn't set who these people report to yet."}</p>
          <ul className="org-tree" role="tree">
            {tree.unassigned.filter(show).map((n) => (
              <Branch key={n.userId} node={n} depth={0} show={show} forceOpen={!!visible} canEdit={canEdit} onEdit={setEditing} />
            ))}
          </ul>
        </section>
      )}

      {visible && visible.size === 0 && <p className="empty">Nobody matches "{query}".</p>}

      <AnimatePresence>
        {editing && (
          <ManagerDialog
            person={editing}
            people={people}
            byId={tree.byId}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Branch({ node, depth, show, forceOpen, canEdit, onEdit }: { node: Node; depth: number; show: (n: Node) => boolean; forceOpen: boolean; canEdit: boolean; onEdit: (p: OrgPerson) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const expanded = forceOpen || open;
  const reports = node.reports.filter(show);
  return (
    <li role="treeitem" aria-expanded={reports.length ? expanded : undefined} className="org-branch">
      <motion.div className={`org-node role-${node.role}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        {reports.length > 0 ? (
          <button className="org-toggle" aria-label={expanded ? `Hide ${node.name}'s team` : `Show ${node.name}'s team`} onClick={() => setOpen(!expanded)}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="org-toggle-gap" />
        )}
        <Avatar email={node.email} name={node.name} size={36} />
        <div className="org-who">
          <span className="org-name">{node.name}</span>
          <span className="org-meta">
            {node.designation ?? ROLE_LABELS[node.role]}
            {node.department && ` · ${node.department}`}
            {node.businessId && <span className="org-id"> · {node.businessId}</span>}
          </span>
        </div>
        <span className={`org-role role-${node.role}`}>{ROLE_LABELS[node.role]}</span>
        {node.total > 0 && <span className="org-count" title={`${node.reports.length} direct, ${node.total} in total`}>{node.reports.length} direct{node.total > node.reports.length ? ` · ${node.total} total` : ""}</span>}
        {canEdit && node.employeeId && (
          <button className="icon-button org-edit" aria-label={`Change who ${node.name} reports to`} title="Change manager" onClick={() => onEdit(node)}>
            <Pencil size={15} />
          </button>
        )}
      </motion.div>
      <AnimatePresence initial={false}>
        {expanded && reports.length > 0 && (
          <motion.ul role="group" className="org-children" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {reports.map((r) => (
              <Branch key={r.userId} node={r} depth={depth + 1} show={show} forceOpen={forceOpen} canEdit={canEdit} onEdit={onEdit} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function ManagerDialog({ person, people, byId, onClose, onSaved }: { person: OrgPerson; people: OrgPerson[]; byId: Map<string, Node>; onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [managerId, setManagerId] = useState(person.managerId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nobody can report to themselves or to someone in their own team.
  const below = useMemo(() => {
    const out = new Set<string>([person.userId]);
    const walk = (n: Node | undefined) => n?.reports.forEach((r) => {
      if (!out.has(r.userId)) {
        out.add(r.userId);
        walk(r);
      }
    });
    walk(byId.get(person.userId));
    return out;
  }, [byId, person.userId]);
  const options = people.filter((p) => !below.has(p.userId) && p.role !== "intern");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/employees/${person.employeeId}`, { method: "PUT", body: { managerId: managerId || null }, accessToken });
      const boss = people.find((p) => p.userId === managerId);
      toast(boss ? `${person.name} now reports to ${boss.name}` : `${person.name} has no manager now`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
      setSaving(false);
    }
  }

  return (
    <Dialog id="org-manager-title" title={`Who does ${person.name} report to?`} onClose={onClose} onSubmit={submit}>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="org-manager">Manager</label>
        <select id="org-manager" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">No manager</option>
          {options.map((p) => (
            <option key={p.userId} value={p.userId}>{p.name} · {p.designation ?? ROLE_LABELS[p.role]}</option>
          ))}
        </select>
        <p className="muted-small">Their manager reviews their documents and tasks. People in {person.name.split(" ")[0]}'s own team aren't listed.</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={saving || managerId === (person.managerId ?? "")}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Dialog>
  );
}
