import { Bookmark, Bug, CheckSquare, Zap } from "lucide-react";
import { ISSUE_TYPE_META, type IssueType } from "../../lib/tasks";

const ICONS = { epic: Zap, story: Bookmark, task: CheckSquare, bug: Bug } as const;

/** The small coloured square Jira-style lists use to show an issue's type. */
export function IssueTypeIcon({ type = "task", size = 18 }: { type?: IssueType; size?: number }) {
  const Icon = ICONS[type];
  const meta = ISSUE_TYPE_META[type];
  return (
    <span className={`issue-type tone-${meta.tone}`} style={{ width: size, height: size }} title={meta.label} aria-label={meta.label} role="img">
      <Icon size={Math.round(size * 0.66)} strokeWidth={2.4} />
    </span>
  );
}

export function IssueKey({ value }: { value?: string | null }) {
  if (!value) return null;
  return <span className="issue-key">{value}</span>;
}

export function LabelChips({ labels, max = 3, onPick }: { labels?: string[]; max?: number; onPick?: (label: string) => void }) {
  if (!labels?.length) return null;
  const shown = labels.slice(0, max);
  return (
    <span className="label-chips">
      {shown.map((l) =>
        onPick ? (
          <button type="button" key={l} className="label-chip" onClick={(e) => { e.stopPropagation(); onPick(l); }} title={`Show issues labelled ${l}`}>{l}</button>
        ) : (
          <span key={l} className="label-chip">{l}</span>
        ),
      )}
      {labels.length > max && <span className="label-chip more">+{labels.length - max}</span>}
    </span>
  );
}
