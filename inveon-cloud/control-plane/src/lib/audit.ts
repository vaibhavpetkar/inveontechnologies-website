import type { Request } from "express";
import type { Database } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

export interface AuditEntry {
  orgId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  actorServerId?: string | null;
  ipAddress?: string | null;
}

/** Every mutating action goes through here. Never put secret values in metadata. */
export async function writeAudit(db: Database, entry: AuditEntry) {
  await db.insert(auditLogs).values({
    orgId: entry.orgId,
    actorUserId: entry.actorUserId ?? null,
    actorServerId: entry.actorServerId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress ?? null,
  });
}

/** Shorthand for a signed-in user's action inside an org route. */
export function audit(db: Database, req: Request, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  return writeAudit(db, {
    orgId: req.member?.orgId ?? null,
    actorUserId: req.user?.sub ?? null,
    action,
    entityType,
    entityId,
    metadata,
    ipAddress: req.ip ?? null,
  });
}
