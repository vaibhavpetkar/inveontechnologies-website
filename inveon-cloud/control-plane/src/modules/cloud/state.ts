import type { servers } from "../../db/schema.js";
import type { CloudState } from "./provider.js";

type Server = typeof servers.$inferSelect;
export type ProvisionState = NonNullable<Server["provisionState"]>;

/** States the scheduler keeps polling the provider for. */
export const CHANGING_STATES: ProvisionState[] = ["pending", "running", "stopping", "starting", "resizing", "terminating"];

const EC2_STATES: Record<string, CloudState> = {
  pending: "pending",
  running: "running",
  stopping: "stopping",
  stopped: "stopped",
  "shutting-down": "terminating",
  terminated: "terminated",
};
export const ec2State = (name: string): CloudState => EC2_STATES[name] ?? "unknown";

/**
 * What a server's provision state becomes when its provider reports `state`.
 * A transition we asked for (stopping, starting, resizing) holds until the
 * provider shows it happened, so a poll that still sees the old state
 * doesn't undo the request. null: no change.
 */
export function nextProvisionState(s: Pick<Server, "provisionState" | "registeredAt">, state: CloudState): ProvisionState | null {
  const cur = s.provisionState;
  if (cur === "terminated" || cur === "failed") return null;
  const online = s.registeredAt ? "agent_online" : "running";
  switch (state) {
    case "terminated":
      return "terminated";
    case "terminating":
      return "terminating";
    case "stopped":
      if (cur === "terminating" || cur === "starting" || cur === "resizing") return null;
      return "stopped";
    case "stopping":
      return cur === "terminating" ? null : "stopping";
    case "pending":
      // Booting: a launch stays pending, a start stays starting.
      return null;
    case "running":
      if (cur === "terminating" || cur === "stopping" || cur === "resizing") return null;
      if (cur === "agent_online") return null;
      return online;
    default:
      return null;
  }
}
