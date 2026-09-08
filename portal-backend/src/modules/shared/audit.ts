import type { Database } from "./db/client.js";
import { auditLogs } from "./db/schema.js";

export async function writeAuditLog(
  db: Database,
  entry: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
) {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress ?? null,
  });
}
