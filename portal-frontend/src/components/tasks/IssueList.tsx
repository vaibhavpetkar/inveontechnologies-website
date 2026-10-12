import { ArrowDown, ArrowUp, CalendarClock, ListTree } from "lucide-react";
import { formatDue, isOverdue, PRIORITY_META, STATUS_META, timeAgo, type IssueFilters, type SearchTask } from "../../lib/tasks";
import { IssueKey, IssueTypeIcon, LabelChips } from "./IssueBits";

interface Props {
  tasks: SearchTask[];
  total: number;
  page: number;
  pageSize: number;
  sort: IssueFilters["sort"];
  order: IssueFilters["order"];
  onSort: (sort: IssueFilters["sort"]) => void;
  onPage: (page: number) => void;
  onOpen: (task: SearchTask) => void;
  onLabel: (label: string) => void;
  /** Bulk edit: which rows are ticked. Left out, the list has no checkboxes. */
  selected?: Set<string>;
  onSelect?: (ids: string[], on: boolean) => void;
}

/** The Jira-style issue list: one row per issue, sortable columns, paged on the server. */
export function IssueList({ tasks, total, page, pageSize, sort, order, onSort, onPage, onOpen, onLabel, selected, onSelect }: Props) {
  const allOn = !!selected && tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const head = (key: IssueFilters["sort"], label: string, className?: string) => (
    <th className={className} aria-sort={sort === key ? (order === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => onSort(key)}>
        {label} {sort === key && (order === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="issue-table-wrap">
      <table className="issue-table">
        <thead>
          <tr>
            {onSelect && (
              <th className="check-cell">
                <input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={(e) => onSelect(tasks.map((t) => t.id), e.target.checked)} />
              </th>
            )}
            {head("key", "Key")}
            {head("title", "Issue")}
            {head("status", "Status")}
            {head("priority", "Priority")}
            <th>Assignee</th>
            {head("due", "Due")}
            {head("updated", "Updated")}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = isOverdue(t);
            return (
              <tr
                key={t.id}
                data-issue-row
                tabIndex={0}
                onClick={() => onOpen(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(t);
                }}
              >
                {onSelect && (
                  <td className="check-cell inline-sm" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${t.key ?? t.title}`} checked={!!selected?.has(t.id)} onChange={(e) => onSelect([t.id], e.target.checked)} />
                  </td>
                )}
                <td className="inline-sm">
                  <span className="issue-title-cell">
                    <IssueTypeIcon type={t.type} />
                    <IssueKey value={t.key ?? "Personal"} />
                  </span>
                </td>
                <td>
                  <div className="issue-title-cell">
                    <span className="title">{t.title}</span>
                    {t.subtaskCount > 0 && (
                      <span className="muted-small" title={`${t.subtaskCount} subtasks`}>
                        <ListTree size={13} /> {t.subtaskCount}
                      </span>
                    )}
                    <LabelChips labels={t.labels} onPick={onLabel} />
                  </div>
                </td>
                <td className="inline-sm">
                  <span className={`pill pill-${STATUS_META[t.status].tone}`}>{STATUS_META[t.status].label}</span>
                </td>
                <td className="inline-sm">
                  <span className={`pill pill-${PRIORITY_META[t.priority].tone}`}>{PRIORITY_META[t.priority].label}</span>
                </td>
                <td className="inline-sm">
                  <span className="issue-who">{t.assignee ? t.assignee.name : <span className="muted-cell">Unassigned</span>}</span>
                </td>
                <td className={`inline-sm ${overdue ? "meta-overdue" : "muted-cell"}`}>
                  {t.dueDate ? (
                    <>
                      <CalendarClock size={13} /> {formatDue(t.dueDate)}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="muted-cell hide-sm">{timeAgo(t.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="issue-pager">
        <span>
          {from}–{to} of {total}
        </span>
        <div>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </button>
          <button className="btn btn-secondary btn-sm" disabled={to >= total} onClick={() => onPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
