import { forwardRef } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Clock, Github, MessageSquare } from "lucide-react";
import { formatDue, isOverdue, PRIORITY_META, type Task } from "../../lib/tasks";
import type { DirectoryUser } from "../../lib/useDirectory";
import { Avatar } from "../Avatar";

interface Props {
  task: Task;
  assignee?: DirectoryUser;
  draggable: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

// forwardRef: AnimatePresence's popLayout mode measures each card through a ref.
export const TaskCard = forwardRef<HTMLDivElement, Props>(function TaskCard({ task, assignee, draggable, onOpen, onDragStart, onDragEnd }, ref) {
  const overdue = isOverdue(task);
  const priority = PRIORITY_META[task.priority];

  return (
    <motion.div
      ref={ref}
      layout
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      whileHover={{ y: -2 }}
    >
      {/* Native drag and drop lives on a plain div: framer's own drag props
          would fight the HTML5 drag events used to drop onto columns. */}
      <div
        className={`task-card${overdue ? " overdue" : ""}`}
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", task.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <div className="task-card-top">
          <span className={`pill pill-${priority.tone}`}>{priority.label}</span>
          {assignee ? <Avatar email={assignee.email} size={24} /> : task.assigneeId ? null : <span className="task-unassigned">Unassigned</span>}
        </div>
        <div className="task-card-title">{task.title}</div>
        <div className="task-card-meta">
          {task.dueDate && (
            <span className={overdue ? "meta-overdue" : ""}>
              <CalendarClock size={14} /> {overdue ? "Overdue · " : ""}
              {formatDue(task.dueDate)}
            </span>
          )}
          {Number(task.actualHours) > 0 && (
            <span>
              <Clock size={14} /> {Number(task.actualHours)}h{task.estimateHours ? ` / ${Number(task.estimateHours)}h` : ""}
            </span>
          )}
          {task.githubIssueNumber && (
            <span className={`gh-chip ${task.githubIssueState ?? "open"}`} title={`GitHub issue ${task.githubRepo}#${task.githubIssueNumber}`}>
              <Github size={13} /> #{task.githubIssueNumber}
            </span>
          )}
          {task.description && (
            <span title="Has details">
              <MessageSquare size={14} />
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
});
