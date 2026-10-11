import { EventEmitter } from "node:events";

/**
 * In-process event bus: wakes long-polling agents when a job is queued for
 * their server, and pushes job/step updates to SSE subscribers. Single
 * control-plane process for the MVP; a multi-instance setup would use
 * Postgres LISTEN/NOTIFY here instead.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export const serverJobsEvent = (serverId: string) => `server-jobs:${serverId}`;
export const jobEvent = (jobId: string) => `job:${jobId}`;

export type JobStreamEvent =
  | { type: "job"; job: Record<string, unknown> }
  | { type: "step"; step: Record<string, unknown> }
  | { type: "log"; stepId: string; chunk: string };
