import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { ISSUE_TYPE_META, PRIORITY_META, STATUS_META, timeAgo, type IssueType, type TaskPriority, type TaskStatus } from "../../lib/tasks";
import { Dialog, Switch } from "../settings/ui";
import { useToast } from "../Toast";
import { IssueKey } from "./IssueBits";

type Trigger = "issue_created" | "status_changed" | "issue_assigned" | "comment_added" | "due_soon" | "sprint_started";
interface Conditions {
  types?: IssueType[];
  priorities?: TaskPriority[];
  labels?: string[];
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  unassigned?: boolean;
  withinHours?: number;
}
type Action =
  | { kind: "assign"; to: string }
  | { kind: "set_priority"; priority: TaskPriority }
  | { kind: "add_label"; label: string }
  | { kind: "add_watcher"; userId: string }
  | { kind: "notify"; to: string; message: string }
  | { kind: "comment"; body: string }
  | { kind: "move_to_sprint"; sprint: "active" };
interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
  runCount: number;
  lastRunAt: string | null;
}
interface Run {
  id: string;
  status: "success" | "failed" | "skipped";
  message: string | null;
  createdAt: string;
  issue: { key: string | null; title: string } | null;
}

const TRIGGERS: Record<Trigger, string> = {
  issue_created: "An issue is created",
  status_changed: "An issue changes status",
  issue_assigned: "An issue is assigned",
  comment_added: "Someone comments",
  due_soon: "An issue is nearly due",
  sprint_started: "A sprint starts (each open issue in it)",
};
const ACTIONS: Record<Action["kind"], string> = {
  assign: "Assign it",
  set_priority: "Set the priority",
  add_label: "Add a label",
  add_watcher: "Add a watcher",
  notify: "Send a notification",
  comment: "Add a comment",
  move_to_sprint: "Move it into the running sprint",
};
const blankAction = (kind: Action["kind"]): Action =>
  ({
    assign: { kind, to: "creator" },
    set_priority: { kind, priority: "high" },
    add_label: { kind, label: "" },
    add_watcher: { kind, userId: "" },
    notify: { kind, to: "assignee", message: "" },
    comment: { kind, body: "" },
    move_to_sprint: { kind, sprint: "active" },
  })[kind] as Action;

const TEMPLATES: { name: string; trigger: Trigger; conditions: Conditions; actions: Action[] }[] = [
  { name: "Urgent bugs go into the sprint", trigger: "issue_created", conditions: { types: ["bug"], priorities: ["urgent"] }, actions: [{ kind: "move_to_sprint", sprint: "active" }, { kind: "notify", to: "leads", message: "An urgent bug was reported." }] },
  { name: "Tell the assignee a day before it's due", trigger: "due_soon", conditions: { withinHours: 24 }, actions: [{ kind: "notify", to: "assignee", message: "This is due within a day." }] },
  { name: "New unassigned issues go to the reporter", trigger: "issue_created", conditions: { unassigned: true }, actions: [{ kind: "assign", to: "creator" }] },
  { name: "Leads hear when work is ready for review", trigger: "status_changed", conditions: { toStatus: "in_review" }, actions: [{ kind: "notify", to: "leads", message: "Ready for review." }] },
];

function describe(rule: Pick<Rule, "trigger" | "conditions" | "actions">, people: Map<string, string>) {
  const c = rule.conditions;
  const ifs = [
    c.types?.length ? `type is ${c.types.map((t) => ISSUE_TYPE_META[t].label.toLowerCase()).join(" or ")}` : "",
    c.priorities?.length ? `priority is ${c.priorities.join(" or ")}` : "",
    c.labels?.length ? `labelled ${c.labels.join(" or ")}` : "",
    c.fromStatus ? `moved from ${STATUS_META[c.fromStatus].label.toLowerCase()}` : "",
    c.toStatus ? `${rule.trigger === "status_changed" ? "moved to" : "status is"} ${STATUS_META[c.toStatus].label.toLowerCase()}` : "",
    c.unassigned === true ? "nobody is assigned" : c.unassigned === false ? "someone is assigned" : "",
    rule.trigger === "due_soon" ? `due within ${c.withinHours ?? 24} hours` : "",
  ].filter(Boolean);
  const who = (id: string) => people.get(id) ?? "someone";
  const thens = rule.actions.map((a) => {
    switch (a.kind) {
      case "assign": return a.to === "unassign" ? "unassign it" : a.to === "creator" ? "assign it to the reporter" : `assign it to ${who(a.to)}`;
      case "set_priority": return `set priority to ${a.priority}`;
      case "add_label": return `add label "${a.label}"`;
      case "add_watcher": return `add ${who(a.userId)} as a watcher`;
      case "notify": return `notify ${a.to === "assignee" ? "the assignee" : a.to === "creator" ? "the reporter" : a.to === "watchers" ? "watchers" : a.to === "leads" ? "the leads" : who(a.to)}`;
      case "comment": return "add a comment";
      case "move_to_sprint": return "move it into the running sprint";
    }
  });
  return { when: TRIGGERS[rule.trigger], ifs, thens };
}

/** The project's automation rules: when / if / then, with each rule's run log. */
export function AutomationRules({ projectId, people }: { projectId: string; people: { id: string; name: string }[] }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const names = new Map(people.map((p) => [p.id, p.name]));

  const load = useCallback(async () => {
    const r = await apiFetch<{ rules: Rule[]; canManage: boolean }>(`/api/v1/projects/${projectId}/automation`, { accessToken });
    setRules(r.rules);
    setCanManage(r.canManage);
  }, [projectId, accessToken]);
  useEffect(() => {
    load().catch(() => setRules([]));
  }, [load]);
  useEffect(() => {
    setRuns(null);
    if (open) apiFetch<{ runs: Run[] }>(`/api/v1/automation/${open}/runs`, { accessToken }).then((r) => setRuns(r.runs)).catch(() => setRuns([]));
  }, [open, accessToken]);

  async function toggle(rule: Rule, enabled: boolean) {
    try {
      await apiFetch(`/api/v1/automation/${rule.id}`, { method: "PUT", body: { enabled }, accessToken });
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change the rule.", "error");
    }
  }
  async function remove(rule: Rule) {
    if (!window.confirm(`Delete the rule "${rule.name}"? Its run log goes too.`)) return;
    await apiFetch(`/api/v1/automation/${rule.id}`, { method: "DELETE", accessToken });
    toast("Rule deleted");
    load();
  }

  return (
    <section className="report-card ps-automation">
      <header className="report-head">
        <h3><Zap size={17} /> Automation</h3>
        {canManage && <button className="btn btn-sm" onClick={() => setEditing({ trigger: "issue_created", conditions: {}, actions: [blankAction("assign")], enabled: true, name: "" })}><Plus size={14} /> New rule</button>}
      </header>
      <p className="muted-small">Rules do routine work for you: when something happens to an issue, and it matches, they act on it. Changes a rule makes never set off other rules.</p>
      {!rules && <div className="skeleton" style={{ height: 80 }} />}
      {rules && rules.length === 0 && (
        <div className="auto-templates">
          <p className="muted-small">No rules yet.{canManage ? " Start from one of these:" : ""}</p>
          {canManage && TEMPLATES.map((t) => (
            <button key={t.name} className="auto-template" onClick={() => setEditing({ ...t, enabled: true })}>
              <Zap size={14} /> {t.name}
            </button>
          ))}
        </div>
      )}
      <ul className="auto-list">
        {rules?.map((rule) => {
          const d = describe(rule, names);
          return (
            <li key={rule.id} className={`auto-rule${rule.enabled ? "" : " off"}`}>
              <div className="auto-rule-head">
                <button className="icon-button" aria-label={open === rule.id ? "Hide run log" : "Show run log"} onClick={() => setOpen(open === rule.id ? null : rule.id)}>
                  {open === rule.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <strong>{rule.name}</strong>
                <span className="muted-small">Ran {rule.runCount} time{rule.runCount === 1 ? "" : "s"}{rule.lastRunAt ? `, last ${timeAgo(rule.lastRunAt)}` : ""}</span>
                {canManage && (
                  <span className="auto-rule-tools">
                    <Switch id={`rule-${rule.id}`} checked={rule.enabled} onChange={(v) => toggle(rule, v)} label={<span className="sr-only">On</span>} />
                    <button className="icon-button" aria-label="Edit rule" onClick={() => setEditing(rule)}><Pencil size={15} /></button>
                    <button className="icon-button" aria-label="Delete rule" onClick={() => remove(rule)}><Trash2 size={15} /></button>
                  </span>
                )}
              </div>
              <div className="auto-flow">
                <span className="auto-step when">When</span> {d.when}
                {d.ifs.length > 0 && <><span className="auto-step if">If</span> {d.ifs.join(", ")}</>}
                <span className="auto-step then">Then</span> {d.thens.join(", ")}
              </div>
              <AnimatePresence>
                {open === rule.id && (
                  <motion.div className="auto-runs" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    {!runs && <div className="skeleton" style={{ height: 40 }} />}
                    {runs?.length === 0 && <p className="muted-small">It hasn't run yet.</p>}
                    {runs?.map((r) => (
                      <div key={r.id} className={`auto-run ${r.status}`}>
                        <span className="auto-run-status">{r.status === "success" ? "Ran" : r.status === "skipped" ? "Skipped" : "Failed"}</span>
                        {r.issue && <IssueKey value={r.issue.key} />}
                        <span className="auto-run-msg">{r.message}</span>
                        <span className="muted-small">{timeAgo(r.createdAt)}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {editing && <RuleDialog key="rule" projectId={projectId} rule={editing} people={people} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      </AnimatePresence>
    </section>
  );
}

function RuleDialog({ projectId, rule, people, onClose, onSaved }: { projectId: string; rule: Partial<Rule>; people: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(rule.name ?? "");
  const [trigger, setTrigger] = useState<Trigger>(rule.trigger ?? "issue_created");
  const [c, setC] = useState<Conditions>(rule.conditions ?? {});
  const [actions, setActions] = useState<Action[]>(rule.actions ?? [blankAction("assign")]);
  const [labelText, setLabelText] = useState((rule.conditions?.labels ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleIn = <T extends string>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  const setAction = (i: number, a: Action) => setActions(actions.map((x, j) => (j === i ? a : x)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const labels = labelText.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean);
    const conditions: Conditions = { ...c, labels: labels.length ? labels : undefined };
    for (const k of Object.keys(conditions) as (keyof Conditions)[]) {
      const v = conditions[k];
      if (v === undefined || (Array.isArray(v) && !v.length)) delete conditions[k];
    }
    if (trigger !== "due_soon") delete conditions.withinHours;
    if (trigger !== "status_changed") delete conditions.fromStatus;
    setBusy(true);
    try {
      const body = { name: name.trim() || "Untitled rule", trigger, conditions, actions, enabled: rule.enabled ?? true };
      if (rule.id) await apiFetch(`/api/v1/automation/${rule.id}`, { method: "PUT", body, accessToken });
      else await apiFetch(`/api/v1/projects/${projectId}/automation`, { method: "POST", body, accessToken });
      toast(rule.id ? "Rule saved" : "Rule created");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the rule.");
      setBusy(false);
    }
  }

  const personOptions = people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);

  return (
    <Dialog id="rule-title" title={rule.id ? "Edit rule" : "New automation rule"} onClose={onClose} onSubmit={submit} wide>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Triage new bugs" maxLength={120} autoFocus />
      </label>

      <div className="auto-section">
        <span className="auto-step when">When</span>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)} aria-label="When">
          {(Object.keys(TRIGGERS) as Trigger[]).map((t) => <option key={t} value={t}>{TRIGGERS[t]}</option>)}
        </select>
        {trigger === "due_soon" && (
          <label className="auto-inline">
            within <input type="number" min={1} max={336} value={c.withinHours ?? 24} onChange={(e) => setC({ ...c, withinHours: Number(e.target.value) || 24 })} /> hours
          </label>
        )}
      </div>

      <div className="auto-section">
        <span className="auto-step if">If</span>
        <span className="muted-small">Leave everything off to act on every issue.</span>
        <div className="auto-chips" role="group" aria-label="Issue types">
          {(Object.keys(ISSUE_TYPE_META) as IssueType[]).map((t) => (
            <button type="button" key={t} className={`phase-chip${c.types?.includes(t) ? " on" : ""}`} onClick={() => setC({ ...c, types: toggleIn(c.types, t) })}>{ISSUE_TYPE_META[t].label}</button>
          ))}
          <span className="auto-divider" />
          {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
            <button type="button" key={p} className={`phase-chip${c.priorities?.includes(p) ? " on" : ""}`} onClick={() => setC({ ...c, priorities: toggleIn(c.priorities, p) })}>{PRIORITY_META[p].label}</button>
          ))}
        </div>
        <div className="auto-row">
          {trigger === "status_changed" && (
            <select value={c.fromStatus ?? ""} onChange={(e) => setC({ ...c, fromStatus: (e.target.value || undefined) as TaskStatus | undefined })} aria-label="Moved from">
              <option value="">From any status</option>
              {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => <option key={s} value={s}>From {STATUS_META[s].label}</option>)}
            </select>
          )}
          <select value={c.toStatus ?? ""} onChange={(e) => setC({ ...c, toStatus: (e.target.value || undefined) as TaskStatus | undefined })} aria-label="Status">
            <option value="">{trigger === "status_changed" ? "To any status" : "Any status"}</option>
            {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => <option key={s} value={s}>{trigger === "status_changed" ? "To " : ""}{STATUS_META[s].label}</option>)}
          </select>
          <select value={c.unassigned === undefined ? "" : c.unassigned ? "yes" : "no"} onChange={(e) => setC({ ...c, unassigned: e.target.value === "" ? undefined : e.target.value === "yes" })} aria-label="Assignee">
            <option value="">Assigned or not</option>
            <option value="yes">Nobody assigned</option>
            <option value="no">Someone assigned</option>
          </select>
          <input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Labels, comma separated" aria-label="Labels" />
        </div>
      </div>

      <div className="auto-section">
        <span className="auto-step then">Then</span>
        {actions.map((a, i) => (
          <div key={i} className="auto-action">
            <select value={a.kind} onChange={(e) => setAction(i, blankAction(e.target.value as Action["kind"]))} aria-label="Action">
              {(Object.keys(ACTIONS) as Action["kind"][]).map((k) => <option key={k} value={k}>{ACTIONS[k]}</option>)}
            </select>
            {a.kind === "assign" && (
              <select value={a.to} onChange={(e) => setAction(i, { ...a, to: e.target.value })} aria-label="Assign to">
                <option value="creator">The reporter</option>
                <option value="unassign">Nobody (unassign)</option>
                {personOptions}
              </select>
            )}
            {a.kind === "set_priority" && (
              <select value={a.priority} onChange={(e) => setAction(i, { ...a, priority: e.target.value as TaskPriority })} aria-label="Priority">
                {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </select>
            )}
            {a.kind === "add_label" && <input value={a.label} required maxLength={30} placeholder="label" onChange={(e) => setAction(i, { ...a, label: e.target.value })} aria-label="Label" />}
            {a.kind === "add_watcher" && (
              <select value={a.userId} required onChange={(e) => setAction(i, { ...a, userId: e.target.value })} aria-label="Watcher">
                <option value="">Pick someone</option>
                {personOptions}
              </select>
            )}
            {a.kind === "notify" && (
              <>
                <select value={a.to} onChange={(e) => setAction(i, { ...a, to: e.target.value })} aria-label="Notify">
                  <option value="assignee">The assignee</option>
                  <option value="creator">The reporter</option>
                  <option value="watchers">Watchers</option>
                  <option value="leads">Owner and leads</option>
                  {personOptions}
                </select>
                <input value={a.message} required maxLength={500} placeholder="Message" onChange={(e) => setAction(i, { ...a, message: e.target.value })} aria-label="Message" style={{ flex: 1 }} />
              </>
            )}
            {a.kind === "comment" && <input value={a.body} required maxLength={2000} placeholder="Comment text" onChange={(e) => setAction(i, { ...a, body: e.target.value })} aria-label="Comment" style={{ flex: 1 }} />}
            {actions.length > 1 && <button type="button" className="icon-button" aria-label="Remove action" onClick={() => setActions(actions.filter((_, j) => j !== i))}><X size={15} /></button>}
          </div>
        ))}
        {actions.length < 10 && (
          <button type="button" className="link-button" onClick={() => setActions([...actions, blankAction("add_label")])}><Plus size={14} /> Add another action</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? "Saving…" : rule.id ? "Save rule" : "Create rule"}</button>
      </div>
    </Dialog>
  );
}
