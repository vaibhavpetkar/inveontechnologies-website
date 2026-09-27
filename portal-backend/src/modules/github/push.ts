import type { tasks } from "../shared/db/schema.js";
import type { Env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { commentOnIssue, githubConfig, setIssueState } from "./client.js";

type TaskRow = typeof tasks.$inferSelect;

/** Called after a task moves in the portal: finishing or cancelling it closes the linked issue. */
export async function pushTaskStatusToGithub(env: Env, task: TaskRow, to: TaskRow["status"]) {
  const config = githubConfig(env);
  if (!config || !task.githubRepo || !task.githubIssueNumber) return;
  try {
    if (to === "done" || to === "cancelled") {
      if (task.githubIssueState === "closed") return;
      await setIssueState(config, task.githubRepo, task.githubIssueNumber, "closed", to === "done" ? "completed" : "not_planned");
    } else if (to === "in_review") {
      await commentOnIssue(config, task.githubRepo, task.githubIssueNumber, `Submitted for review in the Inveon portal: ${env.PORTAL_APP_URL}/tasks/${task.id}`);
    }
  } catch (err) {
    logger.warn({ err, taskId: task.id }, "Couldn't update the linked GitHub issue");
  }
}
