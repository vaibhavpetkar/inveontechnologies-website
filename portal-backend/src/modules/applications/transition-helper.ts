import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, applicationEvents } from "../shared/db/schema.js";
import type { ApplicationStatus } from "./state-machine.js";

/**
 * Shared by the admin /transition endpoint, the invite-assessment endpoint,
 * and the assessment attempt submit/expiry path — one place that updates
 * applications.status and writes the corresponding application_events row,
 * so every caller produces a consistent timeline entry.
 */
export async function applyApplicationTransition(
  db: Database,
  params: {
    applicationId: string;
    from: ApplicationStatus;
    to: ApplicationStatus;
    actorUserId: string | null;
    note?: string;
  },
) {
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ status: params.to, updatedAt: new Date() })
      .where(eq(applications.id, params.applicationId));
    await tx.insert(applicationEvents).values({
      applicationId: params.applicationId,
      fromStatus: params.from,
      toStatus: params.to,
      actorUserId: params.actorUserId,
      note: params.note,
    });
  });
}
